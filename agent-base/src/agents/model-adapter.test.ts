import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createModelInvoker,
  mapMessagesToProvider,
  toProviderTools,
  DEFAULT_MAX_PROMPT_BYTES,
  type ModelInvoker,
} from "../infra/model-adapter.js";
import { createMemorySessionStore } from "./session-store.js";
import { createRateLimiter } from "../infra/rate-limit.js";
import type { AgentDeps } from "./deps.js";
import type { SessionMessage, ToolDefinition } from "./types.js";
import { Buffer } from "node:buffer";
import type { ModelOutput } from "../agents/agent.js";
import { theme } from "../terminal/theme.js";

/**
 * Tests for src/infra/model-adapter.ts
 */

// ─── Test helpers ─────────────────────────────────────────────────────────────

type TestLogger = AgentDeps["log"];

function createTestLogger(): TestLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
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

function stubFetchOnce(response: Response): void {
  vi.stubGlobal("fetch", vi.fn(async () => response));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("model-adapter", () => {
  it("API key guard throws when GEMINI_API_KEY is missing", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const deps = makeDeps(() => Date.now());
    expect(() => createModelInvoker(deps)).toThrow(/GEMINI_API_KEY/);
  });

  it("mapMessagesToProvider maps user, assistant, and tool roles", () => {
    const messages: SessionMessage[] = [
      { role: "user", content: "hi", timestamp: 1 },
      { role: "assistant", content: "hello", timestamp: 2 },
      { role: "tool", content: "{\"ok\":true}", timestamp: 3, toolName: "lookup" },
    ];
    const mapped = mapMessagesToProvider(messages);
    expect(mapped).toHaveLength(3);
    expect(mapped[0]).toEqual({ role: "user", parts: [{ text: "hi" }] });
    expect(mapped[1]).toEqual({ role: "model", parts: [{ text: "hello" }] });
    expect(mapped[2]).toEqual({
      role: "user",
      parts: [{ text: "[tool:lookup] {\"ok\":true}" }],
    });
  });

  it("toProviderTools maps JSON schema tools", () => {
    const tools: ToolDefinition[] = [
      {
        name: "read_file",
        description: "Read a file",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    ];

    const mapped = toProviderTools(tools);
    expect(mapped).toEqual([
      {
        name: "read_file",
        description: "Read a file",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    ]);
  });

  it("prompt truncation keeps payload within max bytes", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const deps = makeDeps(() => 10);
    const invoker = createModelInvoker(deps, { maxPromptBytes: 20 });

    const longMessage = "abcdefghijklmnopqrstuvwxyz";
    const session = {
      id: "s1",
      agentId: "a1",
      status: "idle" as const,
      messages: [{ role: "user" as const, content: longMessage, timestamp: 1 }],
      createdAt: 1,
      updatedAt: 1,
    };

    const response = new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: "ok" }],
              role: "model",
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
    stubFetchOnce(response);

    await invoker({
      sessionId: "s1",
      input: "ping",
      session,
      systemPrompt: "",
      model: "test-model",
      tools: [],
    });

    const fetchMock = vi.mocked(fetch);
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    expect(typeof body).toBe("string");
    const payload = JSON.parse(body as string) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    const combined = payload.contents
      .flatMap((message) => message.parts)
      .map((part) => part.text)
      .join("");
    expect(Buffer.byteLength(combined, "utf8")).toBeLessThanOrEqual(20);
  });

  it("transient API failure throws TRANSIENT_API_FAILURE", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const deps = makeDeps(() => 10);
    const invoker = createModelInvoker(deps);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const err = new Error("rate limit");
        // Cast through unknown to safely attach status to Error object
        (err as unknown as Record<string, unknown>)["status"] = 429;
        throw err;
      }),
    );

    await expect(
      invoker({
        sessionId: "s2",
        input: "ping",
        session: {
          id: "s2",
          agentId: "a1",
          status: "idle" as const,
          messages: [],
          createdAt: 1,
          updatedAt: 1,
        },
        systemPrompt: "",
        model: "test-model",
        tools: [],
      }),
    ).rejects.toThrow("TRANSIENT_API_FAILURE");
  });

  it("valid model response returns ModelOutput with tool calls", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const deps = makeDeps(() => 20);
    const invoker = createModelInvoker(deps);

    const response = new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                { text: "Result" },
                { functionCall: { name: "read_file", args: { path: "/tmp/a" } } },
              ],
              role: "model",
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 7 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
    stubFetchOnce(response);

    const output = await invoker({
      sessionId: "s3",
      input: "ping",
      session: {
        id: "s3",
        agentId: "a1",
        status: "idle" as const,
        messages: [],
        createdAt: 1,
        updatedAt: 1,
      },
      systemPrompt: "",
      model: "test-model",
      tools: [],
    });

    expect(output.text).toBe("Result");
    expect(output.stopReason).toBe("end_turn");
    expect(output.toolCalls).toBeUndefined();
  });

  it("invalid model response rejects without crashing", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const deps = makeDeps(() => 30);
    const invoker = createModelInvoker(deps);

    const response = new Response(
      JSON.stringify({ candidates: [] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
    stubFetchOnce(response);

    await expect(
      invoker({
        sessionId: "s4",
        input: "ping",
        session: {
          id: "s4",
          agentId: "a1",
          status: "idle" as const,
          messages: [],
          createdAt: 1,
          updatedAt: 1,
        },
        systemPrompt: "",
        model: "test-model",
        tools: [],
      }),
    ).rejects.toThrow();
  });
});
