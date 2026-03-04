import express from 'express';
import { AgencyDirector } from '../agents/agency-director.js';

export class DashboardServer {
  private app = express();
  private port = process.env.PORT || 3000;
  private logs: string[] = [];

  constructor(private director: AgencyDirector) {
    this.setupRoutes();
    // Hook into the director's console logs or events
    this.addLog("System initialized. Waiting for heartbeat...");
  }

  private addLog(msg: string) {
    const timestamp = new Date().toLocaleTimeString();
    this.logs.unshift(`[${timestamp}] ${msg}`);
    if (this.logs.length > 20) this.logs.pop(); // Keep it light
  }

// Replace the setupRoutes() method in agent-base/src/infra/dashboard-server.ts

private setupRoutes() {
  this.app.get('/', (req, res) => {
    const greetings = [
      "I'm awake and scanning the horizon for leads.",
      "System systems are green. Ready for your instructions.",
      "Data is flowing. I've got everything under control.",
      "Just crunching some numbers. What's on your mind?"
    ];
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    
    // Memory calculation
    const used = process.memoryUsage().heapUsed / 1024 / 1024;
    const total = process.memoryUsage().heapTotal / 1024 / 1024;

    res.send(`
      <html>
        <body style="background: #0f172a; color: #38bdf8; font-family: 'Courier New', monospace; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
          <div style="text-align: center; border: 1px solid #1e293b; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); max-width: 600px;">
            <h1 style="color: #f8fafc;">🌪️ Force of Nature (FoN)</h1>
            <p style="font-size: 1.2rem; margin-bottom: 2rem;">"${randomGreeting}"</p>
            <div style="display: inline-block; text-align: left; background: #1e293b; padding: 1.5rem; border-radius: 4px; width: 100%;">
              <code>STATUS: <span style="color: #4ade80;">OPERATIONAL</span></code><br>
              <code>UPTIME: ${Math.floor(process.uptime() / 60)} minutes</code><br>
              <code>MEMORY: ${Math.round(used)}MB / ${Math.round(total)}MB</code><br>
              <div style="width: 100%; background: #0f172a; height: 10px; margin-top: 5px; border-radius: 5px;">
                <div style="width: ${(used/total)*100}%; background: #38bdf8; height: 100%; border-radius: 5px;"></div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);
  });

  public start() {
    this.app.listen(this.port, () => {
      console.log(`\n🚀 Dashboard Live at http://localhost:${this.port}`);
    });
  }
}
app.get('/', (req, res) => {
  const greetings = [
    "I'm awake and scanning the horizon for leads.",
    "System systems are green. Ready for your instructions.",
    "Data is flowing. I've got everything under control.",
    "Just crunching some numbers. What's on your mind?"
  ];
  const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];

  res.send(`
    <html>
      <body style="background: #0f172a; color: #38bdf8; font-family: 'Courier New', monospace; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
        <div style="text-align: center; border: 1px solid #1e293b; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <h1 style="color: #f8fafc;">🌪️ Force of Nature (FoN)</h1>
          <p style="font-size: 1.2rem; margin-bottom: 2rem;">"${randomGreeting}"</p>
          <div style="display: inline-block; text-align: left; background: #1e293b; padding: 1rem; border-radius: 4px;">
            <code>STATUS: <span style="color: #4ade80;">OPERATIONAL</span></code><br>
            <code>UPTIME: ${Math.floor(process.uptime() / 60)} minutes</code><br>
            <code>ENGINE: Node 22 (Optimized)</code>
          </div>
        </div>
      </body>
    </html>
  `);
});