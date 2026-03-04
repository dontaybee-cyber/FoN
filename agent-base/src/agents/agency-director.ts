import { BaseAgent, type ModelOutput, newSessionId } from "./agent.js";
import { theme } from "../terminal/theme.js";
import type { ModelInvoker } from "../infra/model-adapter.js";
import type { AgentConfig, AgentSession, SessionId, AgentDeps } from "./types.js";
import { createDefaultDeps } from "./deps.js";
import { createHuggingFaceStore, type HuggingFaceLead } from "../infra/huggingface-store.js";
import { createQualificationAgent } from "./qualification-agent.js";
import { createSalesAgent } from "./sales-agent.js";

// Define the interface here if it's missing from types.ts
export interface AgencyDecision {
  sessionId: string;
  shouldFollowUp: boolean;
  reason: string;
}

export type { AgencyDecision as AgencyDecisionType };
export const adminTools: Array<{
  name: string;
  description: string;
  tsgate: "manual" | "auto";
}> = [
  {
    name: "notify_owner",
    description: "Sends an urgent notification to the human owner when a qualified job is detected.",
    tsgate: "manual",
  },
];

export interface AgencyDirectorConfig extends AgentConfig {
  leadInactivityMs?: number;
  modelInvoker?: ModelInvoker;
}

export class AgencyDirector extends BaseAgent {
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly leadInactivityMs: number;
  private readonly modelInvoker?: ModelInvoker;
  private readonly lastFallbackAt = new Map<string, number>();
  private readonly contactedThisSession = new Set<string>();

  constructor(config: AgencyDirectorConfig, deps: AgentDeps = createDefaultDeps()) {
    // Ensure id is passed correctly to super
    super({
      ...config,
      name: config.name ?? "Agency Director",
      model: config.model ?? "gemini-1.5-flash"
    }, deps);

    this.leadInactivityMs = config.leadInactivityMs ?? 60000;
    this.modelInvoker = config.modelInvoker;
  }

  public startHeartbeat(): void {
    if (this.heartbeatInterval) return;
    
    this.heartbeatInterval = setInterval(() => {
      this.checkAgencyHealth().catch(err => 
        this.deps.log.error("Health check failed", err)
      );
    }, 30000);
  }

  public stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  public async handleManualCommand(cmd: string): Promise<string> {
    const trimmed = cmd.trim();
    if (!trimmed) {
      const message = "Manual command was empty.";
      this.deps.log.warn(`[AgencyDirector] ${message}`);
      return message;
    }

    this.deps.log.info(`[AgencyDirector] Manual command received: ${trimmed}`);

    if (trimmed.toLowerCase() === "health") {
      const result = await this.checkAgencyHealth();
      const summary = `Health check complete. Decisions: ${result.decisions.length}`;
      this.deps.log.info(`[AgencyDirector] ${summary}`);
      return summary;
    }

    try {
      const sessionId = `manual-${newSessionId()}`;
      const result = await this.prompt(sessionId, trimmed);
      this.deps.log.info("[AgencyDirector] Manual command complete.");
      return result.output;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      this.deps.log.error(`[AgencyDirector] Manual command failed: ${message}`);
      return "Manual command failed. Check server logs.";
    }
  }

  public async checkAgencyHealth(): Promise<{ decisions: AgencyDecision[] }> {
    this.deps.log.info(theme.accent("Checking agency vitals..."));

    if (!this.modelInvoker) {
      this.deps.log.warn("[AgencyDirector] No modelInvoker - skipping health check");
      return { decisions: [] };
    }

    if (!process.env["HUGGINGFACE_TOKEN"]) {
      this.deps.log.warn("[AgencyDirector] HUGGINGFACE_TOKEN missing - using session health fallback");
      return this.checkSessionHealthFallback();
    }

    const hfStore = createHuggingFaceStore(this.deps);
    const qualificationAgent = createQualificationAgent(this.modelInvoker, this.deps);
    const salesAgent = createSalesAgent(this.modelInvoker, this.deps);

    let newLeads: HuggingFaceLead[];
    try {
      newLeads = await hfStore.getNewLeads();
    } catch (err) {
      this.deps.log.error("[AgencyDirector] Failed to fetch leads from HuggingFace", err);
      return { decisions: [] };
    }

    if (newLeads.length === 0) {
      this.deps.log.info(theme.accent("No new leads to process."));
      return { decisions: [] };
    }

    this.deps.log.info(theme.accent(`Processing ${newLeads.length} new leads...`));

    const decisions: AgencyDecision[] = [];

    for (const lead of newLeads) {
      try {
        const result = await qualificationAgent.qualifyLead(lead);

        if (!result.shouldContact) {
          this.deps.log.info(
            `[AgencyDirector] Skipping ${lead.URL} (score: ${result.score}) - ${result.reasoning}`
          );
          continue;
        }

        this.deps.log.info(
          theme.success(`[AgencyDirector] Pursuing ${lead.URL} (score: ${result.score})`)
        );

        if (this.contactedThisSession.has(lead.Email ?? lead.URL)) {
          this.deps.log.info(
            `[AgencyDirector] Already contacted ${lead.URL} this session — skipping`
          );
          continue;
        }

        await salesAgent.initiateOutreach(result);
        this.contactedThisSession.add(lead.Email ?? lead.URL);
        await hfStore.updateLeadStatus(lead.Email, "contacted");

        decisions.push({
          sessionId: lead.Email,
          shouldFollowUp: true,
          reason: result.reasoning,
        });

      } catch (err) {
        if (err instanceof Error && err.message === "TRANSIENT_API_FAILURE") {
          this.deps.log.warn("[AgencyDirector] Transient API failure - skipping cycle");
          break;
        }
        this.deps.log.error(`[AgencyDirector] Error processing lead ${lead.URL}`, err);
      }
    }

    this.deps.log.info(
      theme.success(`[AgencyDirector] Cycle complete. ${decisions.length} leads contacted.`)
    );

    return { decisions };
  }

  private async checkSessionHealthFallback(): Promise<{ decisions: AgencyDecision[] }> {
    const allSessions = await this.deps.sessionStore.listAll();
    const now = Math.max(this.deps.now(), Date.now());
    const idleLeads = allSessions.filter(
      (s) =>
        s.status === "idle" &&
        now - s.updatedAt >= this.leadInactivityMs
    );

    if (idleLeads.length === 0) {
      return { decisions: [] };
    }

    const leadSummary = idleLeads.map((s) => ({
      sessionId: s.id,
      agentId: s.agentId,
      updatedAt: s.updatedAt,
    }));

    const prompt = `You are the Agency Director. Review these idle leads and decide which need follow-up.
Respond with a JSON array of decisions. Each decision must have:
- sessionId: string
- shouldFollowUp: boolean
- reason: string

Leads: ${JSON.stringify(leadSummary)}`;

    if (!this.modelInvoker) {
      return { decisions: [] };
    }

    const fakeSession = {
      id: "health-check",
      agentId: this.config.name ?? "agency-director",
      status: "idle" as const,
      messages: [{ role: "user" as const, content: prompt, timestamp: now }],
      createdAt: now,
      updatedAt: now,
    };

    try {
      const output = await this.modelInvoker({
        sessionId: "health-check",
        input: prompt,
        session: fakeSession,
        systemPrompt: this.config.systemPrompt ?? "",
        model: this.config.model ?? "gemini-1.5-flash",
        tools: [],
      });

      const rawText = output.text ?? "";

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        console.warn(
          "[WARN] AgencyDirector received invalid decision array from model -- session cycle skipped",
          { rawOutput: rawText.slice(0, 200) }
        );
        const cooldownMs = 15 * 60 * 1000;
        const decisions = idleLeads.map((s) => {
          const last = this.lastFallbackAt.get(s.id) ?? 0;
          const shouldFollowUp = now - last > cooldownMs;
          if (shouldFollowUp) {
            this.lastFallbackAt.set(s.id, now);
          }
          return {
            sessionId: s.id,
            shouldFollowUp,
            reason: shouldFollowUp ? "fallback" : "cooldown",
          };
        });
        if (decisions.every((d) => !d.shouldFollowUp)) {
          this.deps.log.warn("[SKIP] Fallback already fired this cycle.");
        }
        return { decisions };
      }

      if (!isValidDecisionArray(parsed)) {
        console.warn(
          "[WARN] AgencyDirector received invalid decision array from model -- session cycle skipped",
          { rawOutput: rawText.slice(0, 200) }
        );
        const cooldownMs = 15 * 60 * 1000;
        const decisions = idleLeads.map((s) => {
          const last = this.lastFallbackAt.get(s.id) ?? 0;
          const shouldFollowUp = now - last > cooldownMs;
          if (shouldFollowUp) {
            this.lastFallbackAt.set(s.id, now);
          }
          return {
            sessionId: s.id,
            shouldFollowUp,
            reason: shouldFollowUp ? "fallback" : "cooldown",
          };
        });
        if (decisions.every((d) => !d.shouldFollowUp)) {
          this.deps.log.warn("[SKIP] Fallback already fired this cycle.");
        }
        return { decisions };
      }

      return { decisions: parsed };
    } catch (err) {
      if (err instanceof Error && err.message === "TRANSIENT_API_FAILURE") {
        console.warn("[WARN] Transient API failure on health check -- skipping cycle");
        return { decisions: [] };
      }

      const cooldownMs = 15 * 60 * 1000;
      return {
        decisions: idleLeads.map((s) => {
          const last = this.lastFallbackAt.get(s.id) ?? 0;
          const shouldFollowUp = now - last > cooldownMs;
          if (shouldFollowUp) {
            this.lastFallbackAt.set(s.id, now);
          }
          return {
            sessionId: s.id,
            shouldFollowUp,
            reason: shouldFollowUp ? "fallback" : "cooldown",
          };
        }),
      };
    }
  }

  public async notifyOwnerOfJob(data: any): Promise<void> {
    this.deps.log.info(theme.success(`Notification: ${JSON.stringify(data)}`), { URGENT: true });
  }

  protected override async executeModel(
    _sessionId: SessionId,
    _input: string,
    _session: AgentSession,
  ): Promise<ModelOutput> {
    return {
      text: "Analysis complete.", // Must be 'text', not 'output'
      stopReason: "end_turn",
    };
  }
}

export function createAgencyDirector(config: AgencyDirectorConfig, deps?: AgentDeps) {
  return new AgencyDirector(config, deps);
}

function isValidDecisionArray(data: unknown): data is AgencyDecision[] {
  return (
    Array.isArray(data) &&
    data.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>)["sessionId"] === "string" &&
        typeof (item as Record<string, unknown>)["shouldFollowUp"] === "boolean"
    )
  );
}


