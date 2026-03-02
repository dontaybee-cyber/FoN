import type { Logger } from "../infra/logger.js";
import type { RateLimiter } from "../infra/rate-limit.js";
import type { SessionStore } from "./session-store.js"

/** Unique identifier for an agent instance */
export type AgentId = string;
/** Unique identifier for a conversation session */
export type SessionId = string;
export type SessionStatus = "idle" | "running" | "waiting-approval" | "error" | "complete";

export type SessionMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  toolName?: string;
};

export type AgentSession = {
  id: SessionId;
  agentId: AgentId;
  status: SessionStatus;
  messages: SessionMessage[];
  createdAt: number;
  updatedAt: number;
};

export type PromptResult = {
  sessionId: SessionId;
  output: string;
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | "error";
  toolCalls?: ToolCallRecord[];
};

export type ToolCallRecord = {
  toolName: string;
  input: unknown;
  output?: unknown;
  approved: boolean;
  timestamp: number;
};

export type ToolDefinition = {
  name: string;
  description: string;
  tsgate?: "manual" | "auto";
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type AgentConfig = {
  id: AgentId;
  name?: string;
  model?: string;
  workspaceDir?: string;
  tools?: ToolDefinition[];
  maxPromptBytes?: number;
  systemPrompt?: string;
};

/** Shared dependencies consumed by agent feature modules. */
export type AgentDeps = {
  log: Logger;
  sessionStore: SessionStore;
  sessionRateLimiter: RateLimiter;
  approveToolCall: (toolName: string, input: unknown) => Promise<boolean>;
  now: () => number;
};

/** Specific to Agency Director health checks */
export interface AgencyDecision {
  sessionId: string;
  shouldFollowUp: boolean;
  reason: string;
}

export interface IAgent {
  readonly agentId: AgentId;
  prompt(sessionId: SessionId, input: string): Promise<PromptResult>;
  listSessions(): Promise<AgentSession[]>;
  getSession(sessionId: SessionId): Promise<AgentSession | null>;
}