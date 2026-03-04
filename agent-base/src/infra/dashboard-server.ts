import express, { type Request, type Response } from "express";

type CommandHandler = (cmd: string) => Promise<string | void>;

type DashboardServerOptions = {
  commandHandler?: CommandHandler;
};

type DashboardMetrics = {
  uptimeMinutes: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  memoryPct: number;
  leadsScanned: number;
  heartbeatActive: boolean;
};

const MAX_LOG_LINES = 50;

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ESCAPE_MAP[char] ?? char);
}

export class DashboardServer {
  private app = express();
  private port = Number(process.env["PORT"] ?? 3000);
  private logs: string[] = [];
  private leadsScanned = 0;
  private readonly commandHandler?: CommandHandler;

  constructor(options: DashboardServerOptions = {}) {
    this.commandHandler = options.commandHandler;
    this.app.use(express.urlencoded({ extended: false }));
    this.app.use(express.json({ limit: "64kb" }));
    this.setupRoutes();
    this.addLog("System initialized. Waiting for heartbeat...");
  }

  public addLog(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    const line = `[${timestamp}] ${message}`;
    this.logs.unshift(line);
    if (this.logs.length > MAX_LOG_LINES) {
      this.logs.length = MAX_LOG_LINES;
    }
  }

  public incrementLeadsScanned(count = 1): void {
    if (count <= 0) return;
    this.leadsScanned += count;
  }

  public start(): void {
    this.app.listen(this.port, () => {
      console.log(`\n\uD83D\uDE80 Dashboard live at http://localhost:${this.port}`);
      this.addLog(`Command Center online on port ${this.port}.`);
    });

    const renderUrl = process.env["RENDER_EXTERNAL_URL"];
    if (renderUrl) {
      this.addLog("Keep-alive ping armed.");
      setInterval(async () => {
        try {
          await fetch(renderUrl);
          this.addLog("Keep-alive ping succeeded.");
        } catch {
          this.addLog("Keep-alive ping failed.");
        }
      }, 14 * 60 * 1000);
    }
  }

  private setupRoutes(): void {
    this.app.get("/", (_req: Request, res: Response) => {
      res.send(this.getDashboardHTML());
    });

    this.app.get("/logs", (_req: Request, res: Response) => {
      res.json({
        logs: this.logs.slice(0, MAX_LOG_LINES),
        metrics: this.getMetrics(),
      });
    });

    this.app.get("/api/stats", (_req: Request, res: Response) => {
      res.json({ metrics: this.getMetrics() });
    });

    this.app.post("/command", async (req: Request, res: Response) => {
      try {
        const body = req.body as Record<string, unknown> | undefined;
        const raw = body?.["command"] ?? body?.["cmd"];
        const cmd = typeof raw === "string" ? raw.trim() : "";

        if (!cmd) {
          res.status(400).json({ ok: false, error: "Command is required." });
          return;
        }

        this.addLog(`CMD > ${cmd}`);

        let resultText = "Command accepted.";
        if (this.commandHandler) {
          const result = await this.commandHandler(cmd);
          if (typeof result === "string" && result.trim().length > 0) {
            resultText = result.trim();
          }
        } else {
          resultText = "No command handler configured.";
        }

        res.json({ ok: true, result: resultText });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        this.addLog(`[ERROR] Manual command failed: ${message}`);
        res.status(500).json({ ok: false, error: "Command failed." });
      }
    });
  }

  private getMetrics(): DashboardMetrics {
    const used = process.memoryUsage().heapUsed / 1024 / 1024;
    const total = process.memoryUsage().heapTotal / 1024 / 1024;
    const memoryPct = total > 0 ? Math.round((used / total) * 100) : 0;

    return {
      uptimeMinutes: Math.floor(process.uptime() / 60),
      memoryUsedMb: Math.round(used),
      memoryTotalMb: Math.round(total),
      memoryPct: Math.min(100, Math.max(0, memoryPct)),
      leadsScanned: this.leadsScanned,
      heartbeatActive: true,
    };
  }

  private getDashboardHTML(): string {
    const metrics = this.getMetrics();
    const logLines = this.logs
      .slice(0, MAX_LOG_LINES)
      .reverse()
      .map((line) => `<div class="log-line">${escapeHtml(line)}</div>`)
      .join("");

    const clientScript = `
    const logLines = document.getElementById("log-lines");
    const leadsEl = document.getElementById("leads");
    const commandForm = document.getElementById("command-form");
    const commandInput = document.getElementById("command-input");
    const commandStatus = document.getElementById("command-status");

    async function updateStats() {
      try {
        const res = await fetch("/api/stats");
        const data = await res.json();

        const uptimeEl = document.getElementById("uptime");
        const memoryEl = document.getElementById("memory-text");
        const memoryBar = document.getElementById("memory-bar");

        if (uptimeEl) uptimeEl.textContent = data.metrics.uptimeMinutes + " min";
        if (memoryEl) {
          memoryEl.textContent = data.metrics.memoryUsedMb + "MB / " +
            data.metrics.memoryTotalMb + "MB (" + data.metrics.memoryPct + "%)";
        }
        if (memoryBar) memoryBar.style.width = data.metrics.memoryPct + "%";
        if (leadsEl) leadsEl.textContent = data.metrics.leadsScanned;
      } catch (err) {
        console.error("Failed to update stats:", err);
      }
    }

    async function refreshLogs() {
      try {
        const res = await fetch("/logs");
        if (!res.ok) return;
        const data = await res.json();

        if (!logLines) return;
        logLines.innerHTML = "";
        const lines = data.logs.slice().reverse();
        for (const line of lines) {
          const div = document.createElement("div");
          div.className = "log-line";
          div.textContent = line;
          logLines.appendChild(div);
        }
        logLines.scrollTop = logLines.scrollHeight;
      } catch (err) {
        console.error("Failed to refresh logs:", err);
      }
    }

    if (commandForm && commandInput && commandStatus) {
      commandForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const cmd = commandInput.value.trim();
        if (!cmd) {
          commandStatus.textContent = "Command required.";
          commandStatus.className = "status error";
          return;
        }

        commandStatus.textContent = "Dispatching...";
        commandStatus.className = "status";

        try {
          const res = await fetch("/command", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: cmd }),
          });
          const data = await res.json();
          if (res.ok && data.ok) {
            commandStatus.textContent = data.result || "Command accepted.";
            commandStatus.className = "status ok";
            commandInput.value = "";
          } else {
            commandStatus.textContent = data.error || "Command failed.";
            commandStatus.className = "status error";
          }
        } catch (err) {
          console.error("Command failed:", err);
          commandStatus.textContent = "Command failed.";
          commandStatus.className = "status error";
        }
      });
    }

    updateStats();
    refreshLogs();
    setInterval(updateStats, 5000);
    setInterval(refreshLogs, 2000);
  `;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Force of Nature Command Center</title>
  <style>
    :root {
      --bg: #0f172a;
      --panel: #0b1220;
      --panel-border: #122139;
      --cyan: #06b6d4;
      --red: #ef4444;
      --text: #e2e8f0;
      --muted: #94a3b8;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: "Courier New", monospace;
    }

    .container {
      max-width: 1100px;
      margin: 0 auto;
      padding: 32px 20px 40px;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 24px;
    }

    .title {
      font-size: 28px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--cyan);
      text-shadow: 0 0 12px rgba(6, 182, 212, 0.55);
    }

    .subtitle {
      color: var(--muted);
      font-size: 14px;
      margin-top: 6px;
    }

    .heartbeat {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 14px;
      border: 1px solid var(--panel-border);
      border-radius: 999px;
      background: rgba(6, 182, 212, 0.08);
      color: var(--cyan);
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 1px;
    }

    .pulse {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--cyan);
      box-shadow: 0 0 10px rgba(6, 182, 212, 0.9);
      animation: pulse 1.6s infinite;
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .tile {
      background: var(--panel);
      border: 1px solid var(--panel-border);
      padding: 16px;
      border-radius: 12px;
      box-shadow: 0 0 20px rgba(6, 182, 212, 0.08);
    }

    .tile-label {
      color: var(--muted);
      font-size: 12px;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 10px;
    }

    .tile-value {
      font-size: 24px;
      color: var(--cyan);
      text-shadow: 0 0 12px rgba(6, 182, 212, 0.4);
    }

    .bar {
      margin-top: 12px;
      height: 8px;
      border-radius: 999px;
      background: rgba(6, 182, 212, 0.1);
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, rgba(6, 182, 212, 0.5), rgba(6, 182, 212, 1));
      box-shadow: 0 0 12px rgba(6, 182, 212, 0.6);
    }

    .grid {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
      gap: 16px;
    }

    .panel {
      background: var(--panel);
      border: 1px solid var(--panel-border);
      border-radius: 14px;
      overflow: hidden;
      position: relative;
    }

    .panel-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--panel-border);
      font-size: 12px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--muted);
    }

    .terminal {
      height: 320px;
    }

    .terminal::before {
      content: "";
      position: absolute;
      inset: 0;
      background: repeating-linear-gradient(
        to bottom,
        rgba(6, 182, 212, 0.08),
        rgba(6, 182, 212, 0.08) 1px,
        transparent 1px,
        transparent 3px
      );
      pointer-events: none;
      animation: scan 6s linear infinite;
    }

    .log-lines {
      position: relative;
      z-index: 1;
      height: calc(100% - 41px);
      padding: 16px;
      overflow-y: auto;
      color: var(--cyan);
      text-shadow: 0 0 8px rgba(6, 182, 212, 0.45);
      font-size: 13px;
      line-height: 1.4;
    }

    .log-line {
      margin-bottom: 6px;
      white-space: pre-wrap;
    }

    .command-panel {
      display: flex;
      flex-direction: column;
    }

    form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
    }

    input[type="text"] {
      background: transparent;
      border: 1px solid var(--panel-border);
      border-radius: 10px;
      padding: 12px;
      color: var(--text);
      font-family: inherit;
      font-size: 14px;
      box-shadow: inset 0 0 12px rgba(6, 182, 212, 0.2);
    }

    button {
      background: var(--cyan);
      color: #001018;
      border: none;
      padding: 12px 16px;
      border-radius: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      font-weight: bold;
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      box-shadow: 0 0 16px rgba(6, 182, 212, 0.55);
    }

    button:hover {
      transform: translateY(-1px);
      box-shadow: 0 0 24px rgba(6, 182, 212, 0.8);
    }

    .status {
      padding: 0 16px 16px;
      color: var(--muted);
      min-height: 18px;
      font-size: 12px;
    }

    .status.ok {
      color: var(--cyan);
    }

    .status.error {
      color: var(--red);
    }

    .hint {
      color: var(--muted);
      font-size: 12px;
      padding: 0 16px 16px;
    }

    @keyframes pulse {
      0% { transform: scale(0.85); opacity: 0.5; }
      50% { transform: scale(1.2); opacity: 1; }
      100% { transform: scale(0.85); opacity: 0.5; }
    }

    @keyframes scan {
      0% { opacity: 0.1; }
      50% { opacity: 0.25; }
      100% { opacity: 0.1; }
    }

    @media (max-width: 900px) {
      .grid {
        grid-template-columns: 1fr;
      }
      .terminal {
        height: 280px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div>
        <div class="title">Force of Nature</div>
        <div class="subtitle">Cyberpunk Command Center</div>
      </div>
      <div class="heartbeat">
        <span class="pulse"></span>
        Heartbeat Active
      </div>
    </header>

    <section class="metrics">
      <div class="tile">
        <div class="tile-label">Uptime</div>
        <div class="tile-value" id="uptime">${metrics.uptimeMinutes} min</div>
      </div>
      <div class="tile">
        <div class="tile-label">Memory</div>
        <div class="tile-value" id="memory-text">${metrics.memoryUsedMb}MB / ${metrics.memoryTotalMb}MB (${metrics.memoryPct}%)</div>
        <div class="bar">
          <div class="bar-fill" id="memory-bar" style="width: ${metrics.memoryPct}%"></div>
        </div>
      </div>
      <div class="tile">
        <div class="tile-label">Leads Scanned</div>
        <div class="tile-value" id="leads">${metrics.leadsScanned}</div>
      </div>
    </section>

    <section class="grid">
      <div class="panel terminal">
        <div class="panel-header">Matrix Feed</div>
        <div class="log-lines" id="log-lines">
          ${logLines}
        </div>
      </div>

      <div class="panel command-panel">
        <div class="panel-header">Manual Command Console</div>
        <form id="command-form">
          <input id="command-input" type="text" name="command" placeholder="Enter directive..." autocomplete="off" />
          <button type="submit">Dispatch</button>
        </form>
        <div id="command-status" class="status"></div>
        <div class="hint">Examples: health, ping, status</div>
      </div>
    </section>
  </div>

  <script>${clientScript}</script>
</body>
</html>`;
  }
}
