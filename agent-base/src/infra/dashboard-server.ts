import express, { type Request, type Response } from "express";

export interface ChatMessage {
  timestamp: string;
  sender: "FoN" | "System" | "Owner";
  text: string;
}

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

export class DashboardServer {
  private app = express();
  private port = Number(process.env["PORT"] ?? 3000);
  private logs: string[] = [];
  private messages: ChatMessage[] = [];
  private maxMessages = 50;
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

  public addMessage(sender: "FoN" | "System" | "Owner", text: string): void {
    const msg: ChatMessage = {
      timestamp: new Date().toLocaleTimeString(),
      sender,
      text,
    };
    this.messages.push(msg);
    if (this.messages.length > this.maxMessages) {
      this.messages.shift();
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

    this.app.get("/api/messages", (_req: Request, res: Response) => {
      res.json(this.messages);
    });

    this.app.get("/api/stats", (_req: Request, res: Response) => {
      res.json({ metrics: this.getMetrics() });
    });

    this.app.get("/logs", (_req: Request, res: Response) => {
      res.json({
        logs: this.logs.slice(0, MAX_LOG_LINES),
        metrics: this.getMetrics(),
      });
    });

    this.app.post("/api/command", async (req: Request, res: Response) => {
      const body = req.body as Record<string, unknown> | undefined;
      const raw = body?.["text"];
      const text = typeof raw === "string" ? raw.trim() : "";

      if (!text) {
        res.status(400).json({ error: "No text provided" });
        return;
      }

      this.addMessage("Owner", text);

      try {
        let responseText = "Command executed successfully.";
        if (this.commandHandler) {
          const result = await this.commandHandler(text);
          if (typeof result === "string" && result.trim().length > 0) {
            responseText = result.trim();
          }
        } else {
          responseText = "No command handler configured.";
        }

        this.addMessage("FoN", responseText);
        res.json({ success: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        this.addMessage("System", `Error: ${message}`);
        res.status(500).json({ error: message });
      }
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
        this.addMessage("Owner", cmd);

        let resultText = "Command accepted.";
        if (this.commandHandler) {
          const result = await this.commandHandler(cmd);
          if (typeof result === "string" && result.trim().length > 0) {
            resultText = result.trim();
          }
        } else {
          resultText = "No command handler configured.";
        }

        this.addMessage("FoN", resultText);
        res.json({ ok: true, result: resultText });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        this.addLog(`[ERROR] Manual command failed: ${message}`);
        this.addMessage("System", `Command failed: ${message}`);
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
    const clientScript = `
    let lastMsgCount = 0;

    function updateChat() {
      fetch("/api/messages")
        .then((res) => res.json())
        .then((msgs) => {
          if (!Array.isArray(msgs)) return;
          if (msgs.length === lastMsgCount) return;

          const chatBox = document.getElementById("chat-box");
          if (!chatBox) return;

          chatBox.innerHTML = "";
          msgs.forEach((m) => {
            const sender = m && m.sender ? String(m.sender) : "System";
            const text = m && m.text ? String(m.text) : "";
            const timestamp = m && m.timestamp ? String(m.timestamp) : "";
            const bubble = document.createElement("div");
            bubble.className = "message " + sender.toLowerCase();

            const label = document.createElement("strong");
            label.textContent = sender;
            bubble.appendChild(label);
            bubble.appendChild(document.createTextNode(": " + text));

            const time = document.createElement("span");
            time.className = "timestamp";
            time.textContent = timestamp;
            bubble.appendChild(time);

            chatBox.appendChild(bubble);
          });

          chatBox.scrollTop = chatBox.scrollHeight;
          lastMsgCount = msgs.length;
        })
        .catch(() => {
          // Silent refresh failure.
        });
    }

    function updateStats() {
      fetch("/api/stats")
        .then((res) => res.json())
        .then((data) => {
          if (!data || !data.metrics) return;

          const uptimeEl = document.getElementById("uptime");
          const memoryEl = document.getElementById("memory-text");
          const memoryBar = document.getElementById("memory-bar");

          if (uptimeEl) uptimeEl.textContent = data.metrics.uptimeMinutes + " min";
          if (memoryEl) {
            memoryEl.textContent =
              data.metrics.memoryUsedMb + "MB / " +
              data.metrics.memoryTotalMb + "MB (" +
              data.metrics.memoryPct + "%)";
          }
          if (memoryBar) memoryBar.style.width = data.metrics.memoryPct + "%";
        })
        .catch(() => {
          // Silent refresh failure.
        });
    }

    const commandForm = document.getElementById("command-form");
    const commandInput = document.getElementById("command-input");

    if (commandForm && commandInput) {
      commandForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const text = String(commandInput.value || "").trim();
        if (!text) return;

        commandInput.value = "";
        fetch("/api/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text }),
        }).then(() => {
          updateChat();
        });
      });
    }

    updateChat();
    updateStats();
    setInterval(updateChat, 2000);
    setInterval(updateStats, 5000);
  `;

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>FoN Command Center</title>
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600&display=swap");

      :root {
        --bg: #0f172a;
        --panel: #1e293b;
        --panel-border: #334155;
        --cyan: #38bdf8;
        --text: #f8fafc;
        --muted: #94a3b8;
        --green: #22c55e;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        background: radial-gradient(circle at top, #101b36 0%, #0b1326 45%, #050812 100%);
        color: var(--text);
        font-family: "Space Grotesk", "IBM Plex Sans", sans-serif;
      }

      .sidebar {
        width: 300px;
        background: linear-gradient(180deg, #17243d 0%, #0f172a 100%);
        border-right: 1px solid var(--panel-border);
        padding: 24px;
      }

      .sidebar h3 {
        margin: 0 0 16px;
        color: var(--cyan);
        letter-spacing: 1px;
        text-transform: uppercase;
        font-size: 14px;
      }

      .metric-tile {
        background: #101c34;
        border: 1px solid var(--panel-border);
        padding: 14px;
        margin-bottom: 12px;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(5, 10, 24, 0.4);
      }

      .metric-tile p {
        margin: 0 0 10px;
        font-size: 13px;
        color: var(--muted);
      }

      .metric-tile span {
        color: var(--text);
        font-weight: 600;
      }

      .progress-bg {
        background: #0f172a;
        height: 10px;
        width: 100%;
        border-radius: 8px;
        overflow: hidden;
      }

      .progress-fill {
        background: linear-gradient(90deg, #06b6d4 0%, #38bdf8 100%);
        height: 100%;
        width: 0%;
        border-radius: 8px;
        transition: width 0.5s ease;
      }

      .chat-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        background: linear-gradient(180deg, rgba(15, 23, 42, 0.95), rgba(8, 12, 24, 0.98));
      }

      .chat-header {
        padding: 20px 24px;
        border-bottom: 1px solid var(--panel-border);
        display: flex;
        align-items: center;
        gap: 12px;
        background: rgba(15, 23, 42, 0.9);
        backdrop-filter: blur(6px);
      }

      .status-dot {
        width: 10px;
        height: 10px;
        background: var(--green);
        border-radius: 50%;
        box-shadow: 0 0 10px var(--green);
        animation: pulse 1.6s infinite;
      }

      .messages-area {
        flex-grow: 1;
        overflow-y: auto;
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        animation: fadeIn 0.5s ease;
      }

      .input-area {
        padding: 16px 20px;
        background: #1e293b;
        border-top: 1px solid #334155;
        display: flex;
        gap: 10px;
      }

      .input-area input {
        flex-grow: 1;
        background: #0f172a;
        border: 1px solid #334155;
        padding: 12px;
        border-radius: 8px;
        color: var(--text);
        outline: none;
        font-family: inherit;
      }

      .input-area input:focus {
        border-color: #38bdf8;
      }

      .input-area button {
        background: #38bdf8;
        color: #0f172a;
        border: none;
        padding: 0 24px;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
      }

      .input-area button:hover {
        background: #06b6d4;
      }

      .message {
        max-width: 70%;
        padding: 12px 16px;
        border-radius: 12px;
        font-size: 0.95rem;
        line-height: 1.4;
        box-shadow: 0 8px 20px rgba(6, 182, 212, 0.08);
      }

      .message.fon {
        align-self: flex-start;
        background: #1e293b;
        border: 1px solid #334155;
        color: var(--cyan);
      }

      .message.owner {
        align-self: flex-end;
        background: rgba(56, 189, 248, 0.12);
        border: 1px solid rgba(56, 189, 248, 0.4);
        color: var(--text);
      }

      .message.system {
        align-self: center;
        background: transparent;
        color: var(--muted);
        font-size: 0.8rem;
        border: none;
        box-shadow: none;
      }

      .timestamp {
        font-size: 0.7rem;
        opacity: 0.5;
        margin-top: 6px;
        display: block;
      }

      ::-webkit-scrollbar {
        width: 6px;
      }

      ::-webkit-scrollbar-thumb {
        background: #334155;
        border-radius: 10px;
      }

      @keyframes pulse {
        0% {
          transform: scale(0.85);
          opacity: 0.6;
        }
        50% {
          transform: scale(1.2);
          opacity: 1;
        }
        100% {
          transform: scale(0.85);
          opacity: 0.6;
        }
      }

      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @media (max-width: 900px) {
        body {
          flex-direction: column;
        }

        .sidebar {
          width: 100%;
          border-right: none;
          border-bottom: 1px solid var(--panel-border);
        }
      }
    </style>
  </head>
  <body>
    <div class="sidebar">
      <h3>FoN Analytics</h3>
      <div class="metric-tile">
        <p>UPTIME: <span id="uptime">${metrics.uptimeMinutes} min</span></p>
        <p>MEMORY: <span id="memory-text">${metrics.memoryUsedMb}MB / ${metrics.memoryTotalMb}MB (${metrics.memoryPct}%)</span></p>
        <div class="progress-bg">
          <div id="memory-bar" class="progress-fill" style="width: ${metrics.memoryPct}%"></div>
        </div>
      </div>
    </div>

    <div class="chat-container">
      <div class="chat-header">
        <div class="status-dot"></div>
        <h2 style="margin: 0;">Force of Nature</h2>
      </div>

      <div class="messages-area" id="chat-box"></div>
      <form class="input-area" id="command-form">
        <input
          type="text"
          id="command-input"
          placeholder="Type a command (e.g., /status or /pause)..."
          autocomplete="off"
        />
        <button type="submit">Send</button>
      </form>
    </div>

    <script>${clientScript}</script>
  </body>
</html>`;
  }
}
