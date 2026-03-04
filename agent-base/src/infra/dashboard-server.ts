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

  private setupRoutes() {
    this.app.get('/', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>FoN Control Center</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { font-family: -apple-system, sans-serif; background: #020617; color: #f8fafc; margin: 0; padding: 20px; }
              .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
              .stat-card { background: #1e293b; padding: 15px; border-radius: 12px; border: 1px solid #334155; margin-bottom: 15px; }
              .label { color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
              .value { font-size: 24px; font-weight: bold; margin-top: 5px; color: #3b82f6; }
              .log-container { background: #000; border-radius: 8px; padding: 10px; font-family: monospace; font-size: 13px; height: 300px; overflow-y: auto; border: 1px solid #1e293b; }
              .log-entry { margin-bottom: 5px; color: #4ade80; border-left: 2px solid #334155; padding-left: 10px; }
              .pulse { height: 10px; width: 10px; background: #22c55e; border-radius: 50%; display: inline-block; margin-right: 5px; box-shadow: 0 0 8px #22c55e; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>🌪️ FoN</h1>
              <div style="display: flex; align-items: center;"><span class="pulse"></span> LIVE</div>
            </div>
            
            <div class="stat-card">
              <div class="label">Current Operation</div>
              <div class="value" id="current-op">Scanning Vault...</div>
            </div>

            <div class="label" style="margin-bottom: 8px;">Activity Feed</div>
            <div class="log-container" id="logs">
              ${this.logs.map(log => `<div class="log-entry">${log}</div>`).join('')}
            </div>

            <script>
              // Simple auto-refresh for the "Face"
              setInterval(() => location.reload(), 30000); 
            </script>
          </body>
        </html>
      `);
    });
  }

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