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
      @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap");

      :root {
        --bg-color: #020617;
        --glass-bg: rgba(30, 41, 59, 0.7);
        --accent-cyan: #22d3ee;
        --border-color: rgba(255, 255, 255, 0.1);
        --text: #f8fafc;
        --muted: #94a3b8;
        --green: #22c55e;
      }

      * {
        box-sizing: border-box;
      }

      body {
        background: radial-gradient(circle at top right, #1e293b, #020617);
        color: var(--text);
        font-family: "Inter", system-ui, sans-serif;
        margin: 0;
        display: flex;
        height: 100vh;
        overflow: hidden;
      }

      .sidebar {
        width: 280px;
        background: var(--glass-bg);
        backdrop-filter: blur(12px);
        border-right: 1px solid var(--border-color);
        padding: 30px 20px;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .sidebar h3 {
        margin: 0;
        color: var(--accent-cyan);
        letter-spacing: 1.5px;
        text-transform: uppercase;
        font-size: 13px;
      }

      .metric-tile {
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid var(--border-color);
        padding: 16px;
        border-radius: 16px;
        box-shadow: 0 20px 40px rgba(2, 6, 23, 0.4);
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
        background: rgba(2, 6, 23, 0.6);
        height: 10px;
        width: 100%;
        border-radius: 8px;
        overflow: hidden;
      }

      .progress-fill {
        background: linear-gradient(90deg, rgba(34, 211, 238, 0.4), rgba(34, 211, 238, 0.95));
        height: 100%;
        width: 0%;
        border-radius: 8px;
        transition: width 0.5s ease;
      }

      .chat-container {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        margin: 20px;
        background: var(--glass-bg);
        backdrop-filter: blur(16px);
        border: 1px solid var(--border-color);
        border-radius: 24px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        overflow: hidden;
      }

      .chat-header {
        padding: 22px 28px;
        border-bottom: 1px solid var(--border-color);
        display: flex;
        align-items: center;
        gap: 12px;
        background: rgba(2, 6, 23, 0.35);
      }

      .status-dot {
        width: 10px;
        height: 10px;
        background: var(--green);
        border-radius: 50%;
        box-shadow: 0 0 12px rgba(34, 197, 94, 0.6);
        animation: pulse 2s infinite;
      }

      .messages-area {
        flex-grow: 1;
        overflow-y: auto;
        padding: 28px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .message {
        max-width: 80%;
        padding: 14px 18px;
        border-radius: 18px;
        font-size: 0.95rem;
        line-height: 1.4;
        backdrop-filter: blur(4px);
      }

      .message.fon {
        align-self: flex-start;
        background: rgba(34, 211, 238, 0.1);
        border: 1px solid rgba(34, 211, 238, 0.2);
        color: var(--accent-cyan);
        border-bottom-left-radius: 4px;
      }

      .message.owner {
        align-self: flex-end;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--border-color);
        color: var(--text);
        border-bottom-right-radius: 4px;
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

      .input-area {
        padding: 24px;
        background: rgba(15, 23, 42, 0.5);
        display: flex;
        gap: 12px;
        border-top: 1px solid var(--border-color);
      }

      .input-area input {
        flex-grow: 1;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid var(--border-color);
        padding: 14px 20px;
        border-radius: 14px;
        color: white;
        transition: all 0.3s ease;
        outline: none;
        font-family: inherit;
      }

      .input-area input:focus {
        border-color: var(--accent-cyan);
        box-shadow: 0 0 15px rgba(34, 211, 238, 0.3);
      }

      .input-area button {
        background: var(--accent-cyan);
        color: #0f172a;
        border: none;
        padding: 0 24px;
        border-radius: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .input-area button:hover {
        background: #06b6d4;
      }

      ::-webkit-scrollbar {
        width: 6px;
      }

      ::-webkit-scrollbar-thumb {
        background: rgba(148, 163, 184, 0.4);
        border-radius: 10px;
      }

      @keyframes pulse {
        0% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(1.2); }
        100% { opacity: 1; transform: scale(1); }
      }

      @media (max-width: 900px) {
        body {
          flex-direction: column;
          height: auto;
        }

        .sidebar {
          width: 100%;
          border-right: none;
          border-bottom: 1px solid var(--border-color);
        }

        .chat-container {
          margin: 16px;
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
        <h2 style="margin: 0; letter-spacing: 2px;">
          DBAI <span style="color:var(--accent-cyan)">FORCE OF NATURE</span>
        </h2>
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
