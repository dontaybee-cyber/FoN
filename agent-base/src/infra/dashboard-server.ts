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