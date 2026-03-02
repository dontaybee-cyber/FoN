/**
 * BaseAgent — the canonical starting point for all agent implementations.
 *
 * Extend this class to add your own tool execution, model invocation, and routing.
 * All infrastructure concerns (rate limiting, session storage, logging,
 * permission gating) are handled here so subclasses stay focused on behavior.
 *
 * STANDARD: Use composition and explicit inheritance (A extends B extends C).
 * Never share behavior via prototype mutation.
 *
 * @example
 * export class MyAgent extends BaseAgent {
 *   protected async executeModel(sessionId: string, input: string): Promise<ModelOutput> {
 *     // Call your model provider here.
 *   }
 * }
 */

import { randomUUID } from "node:crypto";
import type { IAgent, AgentConfig, AgentSession, PromptResult, SessionId, ToolCallRecord } from "./types.js";
import type { AgentDeps } from "./deps.js";
import { createDefaultDeps, DEFAULT_MAX_PROMPT_BYTES } from "./deps.js";
import { isAlwaysDangerous, resolvePermissionLevel } from "../security/permissions.js";

/** Output shape from the model layer — implement this in your model adapter */
export type ModelOutput = {
  text: string;
  stopReason: PromptResult["stopReason"];
  toolCalls?: Array<{ toolName: string; input: unknown }>;
};

export class BaseAgent implements IAgent {
  readonly agentId: string;

  protected readonly config: AgentConfig;
  protected readonly deps:   AgentDeps;
  protected readonly maxPromptBytes: number;

  constructor(config: AgentConfig, deps: AgentDeps = createDefaultDeps()) {
    this.agentId       = config.id;
    this.config        = config;
    this.deps          = deps;
    this.maxPromptBytes = config.maxPromptBytes ?? DEFAULT_MAX_PROMPT_BYTES;
  }

  // ── Public API (IAgent) ─────────────────────────────────────────────────────

  async prompt(sessionId: SessionId, input: string): Promise<PromptResult> {
    const { log, sessionStore, sessionRateLimiter, now } = this.deps;

    // Guard: input size limit prevents DoS via memory exhaustion (CWE-400).
    const byteLen = Buffer.byteLength(input, "utf8");
    if (byteLen > this.maxPromptBytes) {
      throw new Error(
        `Prompt exceeds maximum allowed size of ${this.maxPromptBytes} bytes (got ${byteLen}).`
      );
    }

    // Guard: session creation rate limit.
    if (!sessionRateLimiter.consume()) {
      const resetIn = sessionRateLimiter.resetIn();
      throw new Error(`Session rate limit exceeded. Try again in ${Math.ceil(resetIn / 1000)}s.`);
    }

    // Load or initialize session.
    let session = await sessionStore.get(sessionId);
    if (!session) {
      session = this.initSession(sessionId);
      log.info("Session created", { sessionId, agentId: this.agentId });
    }

    // Append user message.
    session.messages.push({ role: "user", content: input, timestamp: now() });
    session.status = "running";
    await sessionStore.set(session);

    log.debug("Invoking model", { sessionId, inputLength: input.length });

    // Delegate to subclass model invocation.
    const modelOutput = await this.executeModel(sessionId, input, session);

    // Process tool calls with permission gating.
    const toolCallRecords: ToolCallRecord[] = [];
    for (const call of modelOutput.toolCalls ?? []) {
      const approved = await this.gateToolCall(call.toolName, call.input);
      toolCallRecords.push({
        toolName:  call.toolName,
        input:     call.input,
        approved,
        timestamp: now(),
      });
      if (!approved) {
        log.warn("Tool call rejected by permission gate", { toolName: call.toolName });
      }
    }

    // Append assistant message.
    session.messages.push({
      role:      "assistant",
      content:   modelOutput.text,
      timestamp: now(),
    });
    session.status    = "idle";
    session.updatedAt = now();
    await sessionStore.set(session);

    return {
      sessionId,
      output:    modelOutput.text,
      stopReason: modelOutput.stopReason,
      toolCalls: toolCallRecords.length > 0 ? toolCallRecords : undefined,
    };
  }

  async listSessions(): Promise<AgentSession[]> {
    return this.deps.sessionStore.listByAgent(this.agentId);
  }

  async getSession(sessionId: SessionId): Promise<AgentSession | null> {
    return this.deps.sessionStore.get(sessionId);
  }

  // ── Protected extension points ──────────────────────────────────────────────

  /**
   * Invoke the underlying model. Override in subclasses.
   * Receives the full session for context-window construction.
   */
  protected async executeModel(
    _sessionId: SessionId,
    _input: string,
    _session: AgentSession,
  ): Promise<ModelOutput> {
    // Default stub — replace in your concrete agent class.
    return {
      text:       "[BaseAgent] No model connected. Override executeModel() in your subclass.",
      stopReason: "end_turn",
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private initSession(sessionId: SessionId): AgentSession {
    const ts = this.deps.now();
    return {
      id:        sessionId,
      agentId:   this.agentId,
      status:    "idle",
      messages:  [],
      createdAt: ts,
      updatedAt: ts,
    };
  }

  private async gateToolCall(toolName: string, input: unknown): Promise<boolean> {
    // Unconditionally dangerous tools are always blocked.
    if (isAlwaysDangerous(toolName)) return false;

    // Conservative heuristic: auto-approve reads/searches, escalate everything else.
    if (resolvePermissionLevel(toolName) === "auto-approve") return true;

    // Delegate to the injected approval function (e.g., prompt the user).
    return this.deps.approveToolCall(toolName, input);
  }
}

/** Convenience factory — matches the createDefaultDeps pattern */
export function createAgent(
  config: AgentConfig,
  deps?: AgentDeps,
): BaseAgent {
  return new BaseAgent(config, deps);
}

/** Generate a new session ID */
export function newSessionId(): string {
  return randomUUID();
}
