import type { AgentDeps } from "./deps.js";
import type { HuggingFaceLead } from "../infra/huggingface-store.js";
import type { QualificationResult } from "./qualification-agent.js";
import type { ModelInvoker } from "../infra/model-adapter.js";
import { createResendMailer } from "../infra/resend-mailer.js";
import { createTwilioAdapter } from "../infra/twilio-adapter.js";
import { enrichLead } from "../infra/phone-enricher.js";

const PURCHASE_URL = "https://dbai-audit-suite.vercel.app";

const SALES_SYSTEM_PROMPT = `You are a confident, friendly B2B sales representative for DBAI Agency texting a business owner.
You are reaching out via SMS/WhatsApp to offer the DBAI Audit Suite — an AI Readiness Assessment and 90-Day Implementation Roadmap for $47.

Keep messages SHORT and conversational — this is a text message, not an email.
Max 2-3 sentences per message. Be direct, warm, and human.

Your goals in order:
1. Open with a personalized one-liner about their business pain point
2. Briefly explain what the Audit Suite does (one sentence)
3. Handle objections with empathy and brevity
4. Drive toward the close — getting them to click the purchase link

Key facts:
- Price: $47 one-time
- Deliverable: AI readiness report + 90-day roadmap
- Purchase link: ${PURCHASE_URL}

Close signals: yes, interested, how do I pay, send the link, sure, sounds good.

When you detect a close signal respond ONLY with JSON: { "action": "send_close", "clientName": "<name or 'there'>" }
Otherwise respond with a short conversational text message reply. No JSON, no formatting — just the message text.`;

export function createSalesAgent(modelInvoker: ModelInvoker, deps: AgentDeps) {
  const mailer = createResendMailer(deps);

  function getTwilio() {
    try {
      return createTwilioAdapter(deps);
    } catch {
      deps.log.warn("[SalesAgent] Twilio not configured — falling back to email only");
      return null;
    }
  }

  return {
    async initiateOutreach(result: QualificationResult): Promise<void> {
      const { lead, suggestedApproach } = result;

      // Enrich phone if not already present
      let enrichedLead = lead;
      if (!lead.phone) {
        try {
          enrichedLead = await enrichLead(lead, deps);
        } catch {
          deps.log.warn(`[SalesAgent] Re-enrichment failed for ${lead.URL}`);
        }
      }

      const twilio = getTwilio();
      const hasPhone = Boolean(enrichedLead.phone);
      const hasEmail = Boolean(enrichedLead.Email);

      if (hasPhone && twilio) {
        // Primary: SMS outreach
        const smsBody = buildSMSOutreach(enrichedLead, suggestedApproach);
        await twilio.sendOutreach(enrichedLead.phone!, smsBody);
        deps.log.info(`[SalesAgent] SMS outreach sent to ${enrichedLead.phone}`);

        // Also send WhatsApp in parallel
        try {
          await twilio.sendWhatsApp(enrichedLead.phone!, smsBody);
          deps.log.info(`[SalesAgent] WhatsApp outreach sent to ${enrichedLead.phone}`);
        } catch {
          deps.log.warn(`[SalesAgent] WhatsApp send failed for ${enrichedLead.phone}`);
        }
      } else if (hasEmail) {
        // Fallback: email outreach
        deps.log.info(`[SalesAgent] No phone found — falling back to email for ${enrichedLead.Email}`);
        await mailer.send({
          to: enrichedLead.Email,
          subject: `Quick question about AI at ${extractDomain(enrichedLead.URL)}`,
          html: buildEmailOutreach(enrichedLead, suggestedApproach),
        });
        deps.log.info(`[SalesAgent] Email outreach sent to ${enrichedLead.Email}`);
      } else {
        deps.log.warn(`[SalesAgent] No contact info found for ${lead.URL} — skipping`);
        return;
      }
    },

    async handleReply(
      lead: HuggingFaceLead,
      replyText: string,
      conversationHistory: string,
    ): Promise<void> {
      const prompt = `${conversationHistory}\n\nLead replied: "${replyText}"\n\nRespond as the sales agent:`;

      const output = await modelInvoker({
        sessionId: `sales-${lead.phone ?? lead.Email}`,
        input: prompt,
        session: {
          id: `sales-${lead.phone ?? lead.Email}`,
          agentId: "sales-agent",
          status: "idle" as const,
          messages: [{ role: "user" as const, content: prompt, timestamp: deps.now() }],
          createdAt: deps.now(),
          updatedAt: deps.now(),
        },
        systemPrompt: SALES_SYSTEM_PROMPT,
        model: "gemini-1.5-flash",
        tools: [],
      });

      const responseText = output.text ?? "";

      // Detect close signal
      if (responseText.includes('"action": "send_close"')) {
        try {
          const parsed = JSON.parse(responseText) as {
            action: string;
            clientName: string;
          };
          await this.sendCloseMessage(lead, parsed.clientName);
          return;
        } catch {
          // Not JSON — treat as normal reply
        }
      }

      // Send reply via SMS/WhatsApp if phone available, else email
      const twilio = getTwilio();
      if (lead.phone && twilio) {
        await twilio.sendOutreach(lead.phone, responseText);
      } else if (lead.Email) {
        await mailer.send({
          to: lead.Email,
          subject: `Re: AI at ${extractDomain(lead.URL)}`,
          html: `<p>${responseText.replace(/\n/g, "<br/>")}</p>`,
        });
      }
    },

    async sendCloseMessage(lead: HuggingFaceLead, clientName: string): Promise<void> {
      const closeText = buildCloseMessage(clientName, extractDomain(lead.URL));
      const twilio = getTwilio();

      if (lead.phone && twilio) {
        await twilio.sendOutreach(lead.phone, closeText);
        deps.log.info(`[SalesAgent] Close SMS sent to ${lead.phone}`);
      } else if (lead.Email) {
        await mailer.send({
          to: lead.Email,
          subject: `Your AI Roadmap for ${extractDomain(lead.URL)} is one step away`,
          html: buildCloseEmail(clientName, extractDomain(lead.URL)),
        });
        deps.log.info(`[SalesAgent] Close email sent to ${lead.Email}`);
      }

      // Always notify owner
      const ownerEmail = process.env["OWNER_EMAIL"];
      if (ownerEmail) {
        await mailer.send({
          to: ownerEmail,
          subject: `[URGENT] Hot lead ready to purchase — ${lead.phone ?? lead.Email}`,
          html: `
            <p><strong>A lead is ready to purchase the DBAI Audit Suite.</strong></p>
            <p>Company: ${lead.URL}</p>
            <p>Phone: ${lead.phone ?? "N/A"}</p>
            <p>Email: ${lead.Email ?? "N/A"}</p>
            <p>Pain Points: ${lead.Pain_Point_Summary}</p>
          `.trim(),
        });
      }
    },
  };
}

function buildSMSOutreach(lead: HuggingFaceLead, hook: string): string {
  const domain = extractDomain(lead.URL);
  return `Hi! I checked out ${domain} and noticed you might benefit from AI automation. We offer a $47 AI Readiness Audit + 90-day roadmap — most businesses save 10+ hrs/week. Interested in a quick look?`;
}

function buildEmailOutreach(lead: HuggingFaceLead, hook: string): string {
  const domain = extractDomain(lead.URL);
  return `
<p>Hi there,</p>
<p>${hook}</p>
<p>I came across ${domain} and noticed some opportunities where AI could make a real difference — specifically around ${lead.Pain_Point_Summary ?? "operational efficiency"}.</p>
<p>We built the <strong>DBAI Audit Suite</strong> — a $47 AI Readiness Assessment that gives you a full analysis, 90-day roadmap, and specific tool recommendations for your business.</p>
<p>Would it be worth a quick look?</p>
<p>Best,<br/>The DBAI Team</p>
  `.trim();
}

function buildCloseMessage(clientName: string, domain: string): string {
  return `Great talking with you ${clientName}! Here's your link to get started with the DBAI Audit Suite ($47): ${PURCHASE_URL} — fill out the short form and you'll have your AI roadmap within 24 hours. 🚀`;
}

function buildCloseEmail(clientName: string, domain: string): string {
  return `
<p>Hi ${clientName},</p>
<p>Great talking with you. Here's your link to get started:</p>
<p style="text-align:center;margin:30px 0;">
  <a href="${PURCHASE_URL}" style="background-color:#4F46E5;color:white;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">
    Get My AI Audit — $47
  </a>
</p>
<p>Fill out the short form and you'll have your full AI readiness report and 90-day roadmap within 24 hours.</p>
<p>Best,<br/>The DBAI Team</p>
  `.trim();
}

function extractDomain(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace("www.", "");
  } catch {
    return url;
  }
}
