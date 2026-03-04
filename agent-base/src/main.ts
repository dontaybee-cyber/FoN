import { createProductionDeps } from "./agents/deps.js";
import { createAgencyDirector } from "./agents/agency-director.js";
import { createModelInvoker } from "./infra/model-adapter.js";
import { theme } from "./terminal/theme.js";

// ─── Startup validation ───────────────────────────────────────────────────────
const apiKey = process.env["GEMINI_API_KEY"];
if (!apiKey) {
  console.error(
    "[FATAL] GEMINI_API_KEY is not set. Add it to your .env file and restart."
  );
  process.exit(1);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
console.log(theme.accent("Force of Nature booting..."));

const deps = createProductionDeps();
const modelInvoker = createModelInvoker(deps);
// Instead of scanning 50 sites at once, do them in chunks of 3
const BATCH_SIZE = 3;
for (let i = 0; i < leads.length; i += BATCH_SIZE) {
  const batch = leads.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(lead => enricher.enrich(lead)));
  console.log(`Processed batch ${i / BATCH_SIZE + 1}. Taking a breath...`);
}

const director = createAgencyDirector(
  {
    id: "agency-coo-1",
    name: "Agency Director",
    model: "gemini-1.5-flash",
    systemPrompt: "You are the Agency Director COO. Proactively qualify leads, close deals, and notify the owner when a high-value job is detected. Respond only in structured JSON when making decisions.",
    modelInvoker,
  },
  deps,
);

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

process.on("SIGINT",  () => shutdown("SIGINT"));
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
// Self-pinging Heartbeat to prevent Render Sleep
const RENDER_URL = process.env.RENDER_EXTERNAL_URL; // Render automatically provides this

if (RENDER_URL) {
  setInterval(() => {
    fetch(RENDER_URL)
      .then(() => console.log('💓 Heartbeat: Staying awake and alert.'))
      .catch((err) => console.error('💔 Heartbeat failed:', err.message));
  }, 14 * 60 * 1000); // 14 minutes
}
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
  setInterval(() => {
    fetch(RENDER_URL)
      .then(() => console.log('💓 Heartbeat: Staying awake and alert.'))
      .catch((err: any) => console.error('💔 Heartbeat failed:', err.message));
  }, 14 * 60 * 1000); // 14 minutes
}