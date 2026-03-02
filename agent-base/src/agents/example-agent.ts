/**
 * ExampleAgent — reference implementation of a concrete agent.
 *
 * Shows how to:
 *  - Extend BaseAgent
 *  - Override executeModel with a real provider call
 *  - Accept and use injected dependencies
 *  - Define and validate tool schemas
 *
 * Replace the model stub below with your actual provider client (Anthropic, OpenAI, etc.)
 */

import type { AgentSession, SessionId } from "./types.js";
import type { AgentDeps } from "./deps.js";
import type { ModelOutput } from "./agent.js";
import { BaseAgent } from "./agent.js";
import { createDefaultDeps } from "./deps.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("example-agent");

/** Configuration specific to this agent — extends base config */
type ExampleAgentConfig = {
  id: string;
  name?: string;
  /** Model identifier — e.g., "claude-sonnet-4-6" */
  model: string;
  /** System prompt for this agent */
  systemPrompt?: string;
  maxPromptBytes?: number;
};

export class ExampleAgent extends BaseAgent {
  private readonly model: string;
  private readonly systemPrompt: string;

  constructor(config: ExampleAgentConfig, deps: AgentDeps = createDefaultDeps()) {
    super(
      {
        id:   config.id,
        name: config.name,
        model: config.model,
        maxPromptBytes: config.maxPromptBytes,
        // Define tools following STANDARD: top-level object, no anyOf/allOf.
        tools: [
          {
            name:        "read_file",
            description: "Read the contents of a file at the given path.",
            inputSchema: {
              type:       "object",
              properties: {
                path: {
                  type:        "string",
                  description: "Absolute or relative path to the file.",
                },
              },
              required: ["path"],
            },
          },
          {
            name:        "search_documents",
            description: "Search documents by keyword query.",
            inputSchema: {
              type:       "object",
              properties: {
                query: {
                  type:        "string",
                  description: "Search query string.",
                },
                limit: {
                  type:        "integer",
                  description: "Maximum number of results to return.",
                },
              },
              required: ["query"],
            },
          },
        ],
      },
      deps,
    );

    this.model        = config.model;
    this.systemPrompt = config.systemPrompt ?? "You are a helpful assistant.";
  }

  /**
   * Override executeModel to call your actual model provider.
   * This stub simulates a response for wiring verification.
   */
  protected override async executeModel(
    sessionId: SessionId,
    input: string,
    session: AgentSession,
  ): Promise<ModelOutput> {
    log.debug("Calling model", {
      sessionId,
      model:        this.model,
      messageCount: session.messages.length,
    });

    // ── Replace below with your actual API call ────────────────────────────
    //
    // Example (Anthropic SDK):
    //
    //   const response = await this.anthropicClient.messages.create({
    //     model:      this.model,
    //     max_tokens: 4096,
    //     system:     this.systemPrompt,
    //     messages:   session.messages.map((m) => ({
    //       role:    m.role === "user" ? "user" : "assistant",
    //       content: m.content,
    //     })),
    //     tools: this.config.tools?.map(toAnthropicTool),
    //   });
    //
    //   return {
    //     text:       extractText(response),
    //     stopReason: mapStopReason(response.stop_reason),
    //     toolCalls:  extractToolCalls(response),
    //   };
    //
    // ── End replace ────────────────────────────────────────────────────────

    // Stub response for scaffolding verification.
    return {
      text:       `[${this.model}] Received: "${input}" (${session.messages.length} messages in session)`,
      stopReason: "end_turn",
    };
  }
}

/**
 * Factory function — preferred instantiation pattern.
 *
 * @example
 * const agent = createExampleAgent({
 *   id:    "my-agent",
 *   model: "claude-sonnet-4-6",
 *   systemPrompt: "You are a code review assistant.",
 * });
 */
export function createExampleAgent(
  config: ExampleAgentConfig,
  deps?: AgentDeps,
): ExampleAgent {
  return new ExampleAgent(config, deps);
}
