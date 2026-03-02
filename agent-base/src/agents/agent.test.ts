/**
 * Tests for src/agents/agent.ts
 *
 * STANDARD: Per-instance stubs via DI — never patch prototypes.
 * Each test creates its own deps object, overriding only what it needs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { BaseAgent, newSessionId } from "./agent.js";
import type { AgentDeps } from "./deps.js";
import { createMemorySessionStore } from "./session-store.js";
import { createRateLimiter } from "../infra/rate-limit.js";
import { createLogger } from "../infra/logger.js";

/** Builds a test-safe deps object. Override individual fields per test. */
function makeTestDeps(overrides: Partial<AgentDeps> = {}): AgentDeps {
  return {
    log:                  createLogger("test"),
    sessionStore:         createMemorySessionStore(),
    sessionRateLimiter:   createRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
    approveToolCall:      vi.fn(async () => true),
    now:                  () => 1_700_000_000_000,
    ...overrides,
  };
}

describe("BaseAgent", () => {
  let deps: AgentDeps;

  beforeEach(() => {
    deps = makeTestDeps();
  });

  it("creates a session on first prompt", async () => {
    const agent  = new BaseAgent({ id: "test-agent" }, deps);
    const sessId = newSessionId();

    await agent.prompt(sessId, "Hello");

    const session = await deps.sessionStore.get(sessId);
    expect(session).not.toBeNull();
    expect(session?.agentId).toBe("test-agent");
  });

  it("appends user and assistant messages to the session", async () => {
    const agent  = new BaseAgent({ id: "test-agent" }, deps);
    const sessId = newSessionId();

    await agent.prompt(sessId, "Hello");

    const session = await deps.sessionStore.get(sessId);
    expect(session?.messages).toHaveLength(2);
    expect(session?.messages[0]?.role).toBe("user");
    expect(session?.messages[1]?.role).toBe("assistant");
  });

  it("rejects prompts that exceed the byte limit", async () => {
    const agent  = new BaseAgent({ id: "test-agent", maxPromptBytes: 10 }, deps);
    const sessId = newSessionId();

    await expect(agent.prompt(sessId, "This is definitely longer than 10 bytes")).rejects.toThrow(
      /exceeds maximum/,
    );
  });

  it("enforces session rate limiting", async () => {
    const tightDeps = makeTestDeps({
      sessionRateLimiter: createRateLimiter({ maxRequests: 1, windowMs: 60_000 }),
    });
    const agent = new BaseAgent({ id: "rate-test-agent" }, tightDeps);

    // First call succeeds.
    await agent.prompt(newSessionId(), "First");

    // Second call should hit the rate limit.
    await expect(agent.prompt(newSessionId(), "Second")).rejects.toThrow(/rate limit/i);
  });

  it("lists sessions for the agent", async () => {
    const agent = new BaseAgent({ id: "list-agent" }, deps);

    await agent.prompt(newSessionId(), "Message A");
    await agent.prompt(newSessionId(), "Message B");

    const sessions = await agent.listSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions.every((s) => s.agentId === "list-agent")).toBe(true);
  });

  it("returns null for an unknown session", async () => {
    const agent  = new BaseAgent({ id: "test-agent" }, deps);
    const result = await agent.getSession("does-not-exist");
    expect(result).toBeNull();
  });

  it("uses injected now() for timestamps", async () => {
    const fixedTime = 1_234_567_890_000;
    const timedDeps = makeTestDeps({ now: () => fixedTime });
    const agent     = new BaseAgent({ id: "timed-agent" }, timedDeps);
    const sessId    = newSessionId();

    await agent.prompt(sessId, "Test");

    const session = await timedDeps.sessionStore.get(sessId);
    expect(session?.createdAt).toBe(fixedTime);
    expect(session?.messages[0]?.timestamp).toBe(fixedTime);
  });
});
