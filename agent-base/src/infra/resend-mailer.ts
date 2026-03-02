import type { AgentDeps } from "../agents/deps.js";

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: string; // base64
  }>;
};

export function createResendMailer(deps: AgentDeps) {
  const apiKey = process.env["RESEND_API_KEY"];
  const fromEmail = process.env["AGENCY_EMAIL"] ?? "noreply@dbai.agency";

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required.");
  }

  return {
    async send(payload: EmailPayload): Promise<void> {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: payload.to,
          subject: payload.subject,
          html: payload.html,
          attachments: payload.attachments,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Resend failed (${response.status}): ${err}`);
      }

      deps.log.info(`[Resend] Email sent to ${payload.to}: ${payload.subject}`);
    },
  };
}
