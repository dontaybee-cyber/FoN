import { createProductionDeps } from "./agents/deps.js";
import { createAgencyDirector } from "./agents/agency-director.js";
import { createModelInvoker } from "./infra/model-adapter.js";
import { DashboardServer } from "./infra/dashboard-server.js";
import type { Logger } from "./infra/logger.js";
import { theme } from "./terminal/theme.js";

function formatMeta(meta: unknown): string {
  if (meta === undefined || meta === null) return "";
  if (meta instanceof Error) return ` — ${meta.message}`;
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return " [unserializable]";
  }
}

function createDashboardLogger(base: Logger, dashboard: DashboardServer): Logger {
  const write = (level: keyof Logger) => (msg: string, meta?: unknown) => {
    base[level](msg, meta);
    dashboard.addLog(`[${level.toUpperCase()}] ${msg}${formatMeta(meta)}`);
  };

  return {
    debug: write("debug"),
    info: write("info"),
    warn: write("warn"),
    error: write("error"),
  };
}

// ─── Startup validation ───────────────────────────────────────────────────────
const apiKey = process.env["GEMINI_API_KEY"];
if (!apiKey) {
  console.error(
    "[FATAL] GEMINI_API_KEY is not set. Add it to your .env file and restart.",
  );
  process.exit(1);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
console.log(theme.accent("Force of Nature booting..."));

const deps = createProductionDeps();
const modelInvoker = createModelInvoker(deps);

const director = createAgencyDirector(
  {
    id: "agency-coo-1",
    name: "Agency Director",
    model: "gemini-1.5-flash",
    systemPrompt:
      "You are the Agency Director COO. Proactively qualify leads, close deals, and notify the owner when a high-value job is detected. Respond only in structured JSON when making decisions.",
    modelInvoker,
  },
  deps,
);

// ─── Dashboard ────────────────────────────────────────────────────────────────
const dashboard = new DashboardServer({
  commandHandler: (cmd) => director.handleManualCommand(cmd),
});

deps.log = createDashboardLogger(deps.log, dashboard);
dashboard.addLog("Command Center boot sequence initiated.");
dashboard.start();

// ─── Heartbeat ────────────────────────────────────────────────────────────────
director.startHeartbeat();

console.log(theme.success("Force of Nature is ONLINE — 24/7 Heartbeat active."));
console.log(theme.accent("Press Ctrl+C to shut down gracefully."));

// ─── Graceful shutdown ────────────────────────────────────────────────────────
function shutdown(signal: string): void {
  console.log(theme.warn(`\nReceived ${signal}. Shutting down gracefully...`));
  director.stopHeartbeat();
  console.log(theme.success("Heartbeat stopped. Force of Nature offline."));
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ─── Safety net ───────────────────────────────────────────────────────────────
process.on("unhandledRejection", (reason) => {
  deps.log.error("Unhandled promise rejection", reason);
});

process.on("uncaughtException", (err) => {
  deps.log.error("Uncaught exception", err);
  director.stopHeartbeat();
  process.exit(1);
});
