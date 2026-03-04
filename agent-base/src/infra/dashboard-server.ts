import express, { type Request, type Response } from "express";

export class DashboardServer {
  private app = express();
  private port = process.env["PORT"] ?? 3000;
  private logs: string[] = [];

  constructor() {
    this.setupRoutes();
    this.addLog("System initialized. Waiting for heartbeat...");
  }

  private addLog(msg: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.logs.unshift(`[${timestamp}] ${msg}`);
    if (this.logs.length > 20) this.logs.pop();
  }

  private setupRoutes(): void {
    this.app.get("/", (_req: Request, res: Response) => {
      const greetings = [
        "I'm awake and scanning the horizon for leads.",
        "All systems are green. Ready for your instructions.",
        "Data is flowing. I've got everything under control.",
        "Just crunching some numbers. What's on your mind?",
      ];
      const randomGreeting =
        greetings[Math.floor(Math.random() * greetings.length)] ?? greetings[0];

      const used = process.memoryUsage().heapUsed / 1024 / 1024;
      const total = process.memoryUsage().heapTotal / 1024 / 1024;
      const memPct = Math.round((used / total) * 100);

      res.send(`<!DOCTYPE html>
<html>
<head><title>Force of Nature</title></head>
<body style="background:#0f172a;color:#38bdf8;font-family:'Courier New',monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="text-align:center;border:1px solid #1e293b;padding:2rem;border-radius:8px;max-width:600px;width:100%;">
    <h1 style="color:#f8fafc;">🌪️ Force of Nature (FoN)</h1>
    <p style="font-size:1.2rem;margin-bottom:2rem;">"${randomGreeting}"</p>
    <div style="text-align:left;background:#1e293b;padding:1.5rem;border-radius:4px;">
      <code>STATUS: <span style="color:#4ade80;">OPERATIONAL</span></code><br/>
      <code>UPTIME: ${Math.floor(process.uptime() / 60)} minutes</code><br/>
      <code>MEMORY: ${Math.round(used)}MB / ${Math.round(total)}MB (${memPct}%)</code>
      <div style="width:100%;background:#0f172a;height:10px;margin-top:8px;border-radius:5px;">
        <div style="width:${memPct}%;background:#38bdf8;height:100%;border-radius:5px;"></div>
      </div>
    </div>
    <div style="margin-top:1.5rem;text-align:left;background:#1e293b;padding:1rem;border-radius:4px;font-size:0.85rem;">
      ${this.logs.map((l) => `<div style="color:#94a3b8;">${l}</div>`).join("")}
    </div>
  </div>
</body>
</html>`);
    });
  }

  public log(msg: string): void {
    this.addLog(msg);
  }

  public start(): void {
    this.app.listen(this.port, () => {
      console.log(`\n🚀 Dashboard live at http://localhost:${this.port}`);
    });
  }
}