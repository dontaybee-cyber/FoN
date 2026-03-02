
/**
 * agent-base — public API surface
 *
 * Import from here in consuming projects.
 * Do not import from internal module paths (they may change).
 */

// Terminal
export { PALETTE, type PaletteKey }             from "./terminal/palette.js";
export { theme }                                 from "./terminal/theme.js";
export { renderTable, type TableRow, type TableOptions } from "./terminal/table.js";

// CLI
export { createSpinner, withSpinner, type Spinner } from "./cli/progress.js";

// Infra
export { createLogger, type Logger, type LogLevel }  from "./infra/logger.js";
export { createRateLimiter, type RateLimiter, type RateLimiterOptions } from "./infra/rate-limit.js";
export { formatDuration, formatAge, formatTimestamp, formatElapsed } from "./infra/format-time.js";
export { createModelInvoker } from "./infra/model-adapter.js";

// Security
export {
  classifyToolKind,
  resolvePermissionLevel,
  canAutoApprove,
  isAlwaysDangerous,
  ALWAYS_DANGEROUS_TOOLS,
  type ToolKind,
  type PermissionLevel,
} from "./security/permissions.js";

// Agents — types
export type {
  AgentId,
  SessionId,
  SessionStatus,
  SessionMessage,
  AgentSession,
  PromptResult,
  ToolCallRecord,
  ToolDefinition,
  AgentConfig,
  IAgent,
} from "./agents/types.js";

// Agents — session store
export { createMemorySessionStore, type SessionStore } from "./agents/session-store.js";
export { createFileSessionStore } from "./agents/file-session-store.js";

// Agents — dependency injection
export {
  createDefaultDeps,
  createProductionDeps,
  DEFAULT_MAX_PROMPT_BYTES,
  type AgentDeps,
} from "./agents/deps.js";

// Agents — base class and factory
export { BaseAgent, createAgent, newSessionId, type ModelOutput } from "./agents/agent.js";

// Agents — example (reference implementation)
export { ExampleAgent, createExampleAgent } from "./agents/example-agent.js";

// Agents — agency director
export { AgencyDirector, createAgencyDirector } from "./agents/agency-director.js";
export type { AgencyDecision } from "./agents/agency-director.js";
