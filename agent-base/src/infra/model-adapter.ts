import { Buffer } from "node:buffer";
import type { SessionMessage, ToolDefinition, AgentSession } from "../agents/types.js";
import type { ModelOutput } from "../agents/agent.js";
import type { AgentDeps } from "../agents/deps.js";
import { theme } from "../terminal/theme.js";

// ─── Local provider types ────────────────────────────────────────────────────

/** Default max prompt size: 2MB — prevents DoS via memory exhaustion (CWE-400) */
export const DEFAULT_MAX_PROMPT_BYTES = 2 * 1024 * 1024;

const DEFAULT_MODEL = "gemini-1.5-flash";

type GeminiContentPart =
  | { text: string }
  | { functionCall: { name: string; args: unknown } };

type GeminiResponse = {
  candidates: Array<{
    content: {
      parts: GeminiContentPart[];
      role: string;
    };
    finishReason: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
  };
};

type AdapterOptions = {
  maxPromptBytes?: number;
};

export type ModelInvokerPayload = {
  sessionId: string;
  input: string;
  session: AgentSession;
  systemPrompt: string;
  model: string;
  tools: ToolDefinition[];
};

export type ModelInvoker = (payload: ModelInvokerPayload) => Promise<ModelOutput>;

// ─── Default token limit ─────────────────────────────────────────────────────

const DEFAULT_MAX_TOKENS = 1024;

// ─── Public functions ────────────────────────────────────────────────────────

export function mapMessagesToProvider(
  messages: SessionMessage[],
): Array<{ role: string; parts: Array<{ text: string }> }> {
  return messages.map((message) => {
    if (message.role === "tool") {
      const toolLabel = message.toolName ?? "tool";
      return {
        role: "user",
        parts: [{ text: `[tool:${toolLabel}] ${message.content}` }],
      };
    }
    // Gemini uses "model" instead of "assistant"
    const role = message.role === "assistant" ? "model" : "user";
    return {
      role,
      parts: [{ text: message.content }],
    };
  });
}

export function toProviderTools(
  tools: ToolDefinition[],
): Array<{ name: string; description: string; parameters: unknown }> {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: "object",
      properties: tool.inputSchema.properties,
      required: tool.inputSchema.required,
    },
  }));
}

export function createModelInvoker(deps: AgentDeps, options: AdapterOptions = {}): ModelInvoker {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required to call the model provider.");
  }

  const maxPromptBytes = options.maxPromptBytes ?? DEFAULT_MAX_PROMPT_BYTES;

  return async (payload: ModelInvokerPayload): Promise<ModelOutput> => {
    const startedAt = deps.now();

    // Rate limit gate — treat a blocked call the same as a transient API failure
    if (!deps.sessionRateLimiter.check()) {
      throw new Error("TRANSIENT_API_FAILURE");
    }
    deps.sessionRateLimiter.consume();

    const systemBytes = Buffer.byteLength(payload.systemPrompt, "utf8");
    const availableBytes = Math.max(0, maxPromptBytes - systemBytes);
    const { messages: trimmedMessages, truncated } = truncateMessagesToBytes(
      payload.session.messages,
      availableBytes,
    );

    if (truncated) {
      deps.log.warn(
        theme.warn(
          `Prompt truncated to ${availableBytes} bytes (limit ${maxPromptBytes} bytes).`,
        ),
        {
          maxPromptBytes,
          availableBytes,
          messageCount: payload.session.messages.length,
          retainedCount: trimmedMessages.length,
        },
      );
    }

    const providerMessages = mapMessagesToProvider(trimmedMessages);
    const providerTools = toProviderTools(payload.tools);
    const maxTokens = resolveMaxTokens();
    const model = payload.model || DEFAULT_MODEL;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            systemInstruction: payload.systemPrompt
              ? { parts: [{ text: payload.systemPrompt }] }
              : undefined,
            contents: providerMessages,
            tools: providerTools.length > 0
              ? [{ functionDeclarations: providerTools }]
              : undefined,
            generationConfig: {
              maxOutputTokens: maxTokens,
            },
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        const httpError = new Error(
          `Model provider request failed (${response.status}): ${errorText}`,
        );
        // Cast through unknown first to safely attach status to Error object
        (httpError as unknown as Record<string, unknown>)["status"] = response.status;
        throw httpError;
      }

      const result = (await response.json()) as GeminiResponse;
      const candidate = result.candidates[0];
      if (!candidate) {
        throw new Error("Gemini returned no candidates");
      }

      const parts = candidate.content.parts;

      const text = parts
        .filter((p): p is { text: string } => "text" in p)
        .map((p) => p.text)
        .join("");

      const toolCalls = parts
        .filter(
          (p): p is { functionCall: { name: string; args: unknown } } =>
            "functionCall" in p,
        )
        .map((p) => ({
          toolName: p.functionCall.name,
          input: p.functionCall.args,
        }));

      const stopReason = mapStopReason(candidate.finishReason);

      const latencyMs = deps.now() - startedAt;
      const inputTokens = result.usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = result.usageMetadata?.candidatesTokenCount ?? 0;
      deps.log.info(
        theme.info(
          `Model latency ${latencyMs}ms; tokens in/out ${inputTokens}/${outputTokens}`,
        ),
        { latencyMs, inputTokens, outputTokens, model },
      );

      return {
        text,
        stopReason,
        toolCalls: stopReason === "tool_use" && toolCalls.length > 0 ? toolCalls : undefined,
      };
    } catch (err) {
      if (isTransientApiError(err)) {
        throw new Error("TRANSIENT_API_FAILURE");
      }
      throw err;
    }
  };
}

// ─── Private helpers ─────────────────────────────────────────────────────────

function resolveMaxTokens(): number {
  const raw = process.env["ANTHROPIC_MAX_TOKENS"];
  if (!raw) return DEFAULT_MAX_TOKENS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_TOKENS;
}

function mapStopReason(reason: string): ModelOutput["stopReason"] {
  switch (reason) {
    case "STOP":
      return "end_turn";
    case "MAX_TOKENS":
      return "max_tokens";
    case "SAFETY":
    case "RECITATION":
    case "OTHER":
    default:
      return "end_turn";
  }
}

function truncateMessagesToBytes(
  messages: SessionMessage[],
  maxBytes: number,
): { messages: SessionMessage[]; truncated: boolean } {
  if (messages.length === 0) return { messages, truncated: false };

  const reversed: SessionMessage[] = [];
  let totalBytes = 0;
  let truncated = false;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message) continue;
    const bytes = Buffer.byteLength(message.content, "utf8");
    if (reversed.length === 0) {
      const clipped = clipMessageContent(message, maxBytes);
      reversed.push(clipped);
      totalBytes += Buffer.byteLength(clipped.content, "utf8");
      truncated = bytes > maxBytes;
      continue;
    }

    if (totalBytes + bytes <= maxBytes) {
      reversed.push(message);
      totalBytes += bytes;
    } else {
      truncated = true;
      break;
    }
  }

  return { messages: reversed.reverse(), truncated };
}

function clipMessageContent(message: SessionMessage, maxBytes: number): SessionMessage {
  if (maxBytes <= 0) {
    return { ...message, content: "" };
  }
  const text = message.content;
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return message;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const slice = text.slice(0, mid);
    if (Buffer.byteLength(slice, "utf8") <= maxBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return { ...message, content: text.slice(0, low) };
}

function isTransientApiError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as Record<string, unknown>;
  if (typeof e["status"] === "number") {
    return e["status"] === 429 || e["status"] === 503 || e["status"] === 504;
  }
  if (e["code"] === "ECONNRESET" || e["code"] === "ETIMEDOUT") return true;
  return false;
}
