/**
 * Dependency injection via createDefaultDeps.
 *
 * STANDARD: All agent feature modules accept a `deps` parameter.
 * Production code calls createDefaultDeps() with no arguments.
 * Tests override only the deps they need — no prototype patching.
 *
 * Pattern:
 *   export function createMyFeature(deps: MyFeatureDeps = createDefaultDeps()) { ... }
 *
 * Test:
 *   const feature = createMyFeature({ log: vi.fn(), store: fakeStore });
 */

import type { Logger } from "../infra/logger.js";
import type { RateLimiter } from "../infra/rate-limit.js";
import type { SessionStore } from "./session-store.js";
import { createLogger } from "../infra/logger.js";
import { createRateLimiter } from "../infra/rate-limit.js";
import { createMemorySessionStore } from "./session-store.js";
import { createFileSessionStore } from "./file-session-store.js";

/** Rate limit defaults for session creation (burst protection) */
const SESSION_RATE_LIMIT_MAX  = 120;
const SESSION_RATE_LIMIT_WINDOW_MS = 10_000;

/** Default max prompt size: 2MB — prevents DoS via memory exhaustion (CWE-400) */
export const DEFAULT_MAX_PROMPT_BYTES = 2 * 1024 * 1024;

/**
 * Shared dependencies consumed by agent feature modules.
 * Extend this type as your agent grows — keep it as the single injectable surface.
 */
export type AgentDeps = {
  log: Logger;
  sessionStore: SessionStore;
  sessionRateLimiter: RateLimiter;
  /** Approve or reject a tool call. Return true to allow. */
  approveToolCall: (toolName: string, input: unknown) => Promise<boolean>;
  /** Current time in milliseconds (injectable for deterministic tests) */
  now: () => number;
};

/**
 * Creates the default production dependencies.
 * Override individual fields in tests — never patch prototypes.
 *
 * @example
 * // Production
 * const agent = createAgent("my-agent", createDefaultDeps());
 *
 * // Test
 * const agent = createAgent("my-agent", {
 *   ...createDefaultDeps(),
 *   approveToolCall: async () => true,
 *   now: () => 1_700_000_000_000,
 * });
 */
export function createDefaultDeps(): AgentDeps {
  return {
    log: createLogger("agent"),
    sessionStore: createMemorySessionStore(),
    sessionRateLimiter: createRateLimiter({
      maxRequests: SESSION_RATE_LIMIT_MAX,
      windowMs:    SESSION_RATE_LIMIT_WINDOW_MS,
    }),
    approveToolCall: async (toolName, _input) => {
      // Default: auto-approve reads and searches; block everything else.
      const { resolvePermissionLevel } = await import("../security/permissions.js");
      return resolvePermissionLevel(toolName) === "auto-approve";
    },
    now: () => Date.now(),
  };
}

/**
 * Creates production dependencies with persistent storage.
 * Session storage is backed by the file system.
 */
export function createProductionDeps(): AgentDeps {
  const persistencePath = process.env["SESSION_STORAGE_PATH"] ?? "./.agency_vault";
  return {
    ...createDefaultDeps(),
    sessionStore: createFileSessionStore(persistencePath),
  };
}