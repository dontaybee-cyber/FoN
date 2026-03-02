import type { AgentDeps } from "./deps.js";
import type { HuggingFaceLead } from "../infra/huggingface-store.js";
import type { ModelInvoker } from "../infra/model-adapter.js";

export type QualificationResult = {
  lead: HuggingFaceLead;
  score: number; // 0-100
  shouldContact: boolean;
  reasoning: string;
  suggestedApproach: string;
};

export function createQualificationAgent(
  modelInvoker: ModelInvoker,
  deps: AgentDeps,
) {
  return {
    async qualifyLead(lead: HuggingFaceLead): Promise<QualificationResult> {
      const prompt = `You are a sales qualification expert for DBAI Agency.
We sell an AI Readiness Audit Suite for $47 that includes a full assessment, 90-day roadmap, and AI implementation recommendations.

Analyze this lead and decide if we should reach out:

Company URL: ${lead.URL}
Pain Points: ${lead.Pain_Point_Summary}
Social Presence: Facebook=${lead.Facebook}, LinkedIn=${lead.LinkedIn}, Instagram=${lead.Instagram}

Respond ONLY with a JSON object:
{
  "score": <0-100>,
  "shouldContact": <true|false>,
  "reasoning": "<one sentence>",
  "suggestedApproach": "<personalized opening line for outreach email>"
}`;

      try {
        const output = await modelInvoker({
          sessionId: `qualify-${lead.URL}`,
          input: prompt,
          session: {
            id: `qualify-${lead.URL}`,
            agentId: "qualification-agent",
            status: "idle" as const,
            messages: [{ role: "user" as const, content: prompt, timestamp: deps.now() }],
            createdAt: deps.now(),
            updatedAt: deps.now(),
          },
          systemPrompt: "You are a B2B sales qualification expert. Respond only in valid JSON.",
          model: "gemini-1.5-flash",
          tools: [],
        });

        const parsed = JSON.parse(output.text ?? "{}") as {
          score: number;
          shouldContact: boolean;
          reasoning: string;
          suggestedApproach: string;
        };

        return {
          lead,
          score: parsed.score ?? 0,
          shouldContact: parsed.shouldContact ?? false,
          reasoning: parsed.reasoning ?? "No reasoning provided",
          suggestedApproach: parsed.suggestedApproach ?? "",
        };
      } catch {
        deps.log.warn(`[QualificationAgent] Failed to qualify ${lead.URL}`);
        return {
          lead,
          score: 0,
          shouldContact: false,
          reasoning: "Qualification failed",
          suggestedApproach: "",
        };
      }
    },
  };
}
