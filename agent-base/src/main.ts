import { createProductionDeps } from "./agents/deps.js";
import { createAgencyDirector } from "./agents/agency-director.js";
import { createModelInvoker } from "./infra/model-adapter.js";
import { DashboardServer } from "./infra/dashboard-server.js";
import { theme } from "./terminal/theme.js";

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
const dashboard = new DashboardServer();
dashboard.start();

// ─── Heartbeat ────────────────────────────────────────────────────────────────
director.startHeartbeat();

console.log(theme.success("Force of Nature is ONLINE — 24/7 Heartbeat active."));
console.log(theme.accent("Press Ctrl+C to shut down gracefully."));

// ─── Keep-alive ping for Render free tier ────────────────────────────────────
const RENDER_URL = process.env["RENDER_EXTERNAL_URL"];
if (RENDER_URL) {
  setInterval(
    async () => {
      try {
        await fetch(RENDER_URL);
        deps.log.info("[KeepAlive] Pinged render service");
      } catch {
        deps.log.warn("[KeepAlive] Ping failed");
      }
    },
    14 * 60 * 1000, // every 14 minutes
  );
}

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
