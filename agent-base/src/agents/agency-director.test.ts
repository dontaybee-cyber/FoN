/**
 * Tests for src/agents/agency-director.ts
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { AgencyDirector, adminTools } from "./agency-director.js";
import type { AgencyDirectorConfig } from "./agency-director.js";
import type { AgentDeps } from "./deps.js";
import type { AgentSession } from "./types.js";
import { createMemorySessionStore } from "./session-store.js";
import { createRateLimiter } from "../infra/rate-limit.js";

type TestLogger = AgentDeps["log"];

function createTestLogger(): TestLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeSession(agentId: string, sessionId: string, updatedAt: number): AgentSession {
  return {
    id: sessionId,
    agentId,
    status: "idle",
    messages: [
      {
        role: "user",
        content: "Interested in a growth audit.",
        timestamp: updatedAt - 1000,
      },
    ],
    createdAt: updatedAt - 5000,
    updatedAt,
  };
}

function makeDeps(now: () => number, log?: TestLogger): AgentDeps {
  return {
    log: log ?? createTestLogger(),
    sessionStore: createMemorySessionStore(),
    sessionRateLimiter: createRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
    approveToolCall: vi.fn(async () => true),
    now,
  };
}

async function seedSession(deps: AgentDeps, session: AgentSession): Promise<void> {
  await deps.sessionStore.set(session);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AgencyDirector", () => {
  it("checkAgencyHealth skips fallback follow-up within 15 minutes after invalid JSON", async () => {
    let now = Date.now();
    const log = createTestLogger();
    const deps = makeDeps(() => now, log);
    const session = makeSession("agency", "lead-1", now - 60_000);
    await seedSession(deps, session);

    const agent = new AgencyDirector(
      {
        id: "agency",
        model: "test-model",
        leadInactivityMs: 0,
        modelInvoker: async () => ({
          text: "not-json",
          stopReason: "end_turn",
        }),
      },
      deps,
    );

    const first = await agent.checkAgencyHealth();
    expect(first.decisions).toHaveLength(1);
    expect(first.decisions[0]?.shouldFollowUp).toBe(true);

    now += 5 * 60 * 1000;
    const second = await agent.checkAgencyHealth();
    expect(second.decisions).toHaveLength(1);
    expect(second.decisions[0]?.shouldFollowUp).toBe(false);

    agent.stopHeartbeat();
  });

  it("checkAgencyHealth returns decisions when model output is valid JSON", async () => {
    let now = Date.now();
    const deps = makeDeps(() => now);
    const session = makeSession("agency", "lead-2", now - 60_000);
    await seedSession(deps, session);

    const agent = new AgencyDirector(
      {
        id: "agency",
        model: "test-model",
        leadInactivityMs: 0,
        modelInvoker: async () => ({
          text: JSON.stringify([
            {
              sessionId: "lead-2",
              shouldFollowUp: false,
              reason: "recent touchpoint",
            },
          ]),
          stopReason: "end_turn",
        }),
      },
      deps,
    );

    const report = await agent.checkAgencyHealth();
    expect(report.decisions).toHaveLength(1);
    expect(report.decisions[0]).toEqual({
      sessionId: "lead-2",
      shouldFollowUp: false,
      reason: "recent touchpoint",
    });

    agent.stopHeartbeat();
  });

  it("notifyOwnerOfJob logs urgent metadata", async () => {
    const log = createTestLogger();
    const deps = makeDeps(() => Date.now(), log);
    const agent = new AgencyDirector(
      {
        id: "agency",
        model: "test-model",
        leadInactivityMs: 0,
        modelInvoker: async () => ({
          text: "[]",
          stopReason: "end_turn",
        }),
      },
      deps,
    );

    await agent.notifyOwnerOfJob({
      jobId: "job-9",
      summary: "Inbound lead from fintech startup.",
      priority: "urgent",
    });

    const infoCalls = (log.info as ReturnType<typeof vi.fn>).mock.calls;
    expect(infoCalls).toHaveLength(1);
    expect(infoCalls[0]?.[1]).toEqual(expect.objectContaining({ URGENT: true }));

    agent.stopHeartbeat();
  });

  it("notify_owner tool definition is manual gate", () => {
    const notifyTool = adminTools.find((tool) => tool.name === "notify_owner");
    expect(notifyTool?.tsgate).toBe("manual");
  });
});
