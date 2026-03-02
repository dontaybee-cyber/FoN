/**
 * Subsystem-scoped logger factory.
 * Creates a namespaced logger per module — keep logs identifiable in production.
 *
 * STANDARD: Never use console.log directly in feature code. Use createLogger.
 *
 * @example
 * const log = createLogger("agent-scope");
 * log.info("Agent resolved", { agentId });
 * log.warn("Fallback triggered");
 * log.error("Connection failed", err);
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type Logger = {
  debug: (msg: string, meta?: unknown) => void;
  info:  (msg: string, meta?: unknown) => void;
  warn:  (msg: string, meta?: unknown) => void;
  error: (msg: string, meta?: unknown) => void;
};

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info:  1,
  warn:  2,
  error: 3,
};

// Configurable globally — set via LOG_LEVEL env var.
function getMinLevel(): LogLevel {
  const env = (process.env["LOG_LEVEL"] ?? "info").toLowerCase();
  if (env === "debug" || env === "info" || env === "warn" || env === "error") {
    return env as LogLevel;
  }
  return "info";
}

function formatMeta(meta: unknown): string {
  if (meta === undefined || meta === null) return "";
  if (meta instanceof Error) return ` — ${meta.message}`;
  try {
    return " " + JSON.stringify(meta);
  } catch {
    return " [unserializable]";
  }
}

/**
 * Creates a named logger scoped to a subsystem.
 * Respects LOG_LEVEL env var at call time (hot-reloadable).
 */
export function createLogger(subsystem: string): Logger {
  function write(level: LogLevel, msg: string, meta?: unknown): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[getMinLevel()]) return;

    const ts = new Date().toISOString();
    const line = `[${ts}] [${level.toUpperCase().padEnd(5)}] [${subsystem}] ${msg}${formatMeta(meta)}`;

    if (level === "error" || level === "warn") {
      process.stderr.write(line + "\n");
    } else {
      process.stdout.write(line + "\n");
    }
  }

  return {
    debug: (msg, meta) => write("debug", msg, meta),
    info:  (msg, meta) => write("info",  msg, meta),
    warn:  (msg, meta) => write("warn",  msg, meta),
    error: (msg, meta) => write("error", msg, meta),
  };
}
