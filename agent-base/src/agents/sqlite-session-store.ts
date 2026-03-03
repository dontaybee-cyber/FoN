import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AgentSession, SessionId, AgentId } from "./types.js";
import type { SessionStore } from "./session-store.js";

type SqliteRunResult = { changes: number };

type SqliteStatement<TRow> = {
  get(...params: readonly unknown[]): TRow | undefined;
  all(...params: readonly unknown[]): TRow[];
  run(...params: readonly unknown[]): SqliteRunResult;
};

type SqliteDatabase = {
  prepare<TRow = Record<string, unknown>>(sql: string): SqliteStatement<TRow>;
  exec(sql: string): void;
  pragma?: (sql: string) => unknown;
};

type SqliteConstructor = new (
  filename: string,
  options?: { readonly?: boolean; fileMustExist?: boolean },
) => SqliteDatabase;

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3") as unknown as SqliteConstructor;

function isValidSession(data: unknown): data is AgentSession {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as Record<string, unknown>)["id"] === "string" &&
    typeof (data as Record<string, unknown>)["agentId"] === "string" &&
    typeof (data as Record<string, unknown>)["updatedAt"] === "number"
  );
}

function stripGateState(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...data };
  delete sanitized["approved"];
  delete sanitized["gateStatus"];
  return sanitized;
}

function parseSession(raw: string, context: string): AgentSession | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      console.warn(`[WARN] Malformed session payload (${context})`);
      return null;
    }
    const sanitized = stripGateState(parsed as Record<string, unknown>);
    if (!isValidSession(sanitized)) {
      console.warn(`[WARN] Malformed session payload (${context})`);
      return null;
    }
    return sanitized as AgentSession;
  } catch (err) {
    console.warn(`[WARN] Failed to parse session payload (${context})`, err);
    return null;
  }
}

/**
 * PRODUCTION-GRADE PERSISTENCE
 * Implements SessionStore interface using SQLite (better-sqlite3).
 * Ensures 24/7 Agency Director survives process restarts/crashes.
 */
export function createSqliteSessionStore(dbPath = "./fon_data.db"): SessionStore {
  const resolvedPath = resolve(dbPath);
  mkdirSync(dirname(resolvedPath), { recursive: true });

  const db = new Database(resolvedPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
  `);

  const selectById = db.prepare<{ data: string }>(
    "SELECT data FROM sessions WHERE id = ?",
  );
  const selectAll = db.prepare<{ id: string; data: string }>(
    "SELECT id, data FROM sessions",
  );
  const upsert = db.prepare(
    "INSERT OR REPLACE INTO sessions (id, data) VALUES (?, ?)"
  );
  const deleteStmt = db.prepare("DELETE FROM sessions WHERE id = ?");

  return {
    async get(sessionId: SessionId) {
      try {
        const row = selectById.get(sessionId);
        if (!row) {
          return null;
        }
        return parseSession(row.data, `sessionId: ${sessionId}`);
      } catch (err) {
        console.warn(
          `[WARN] Failed to read session from SQLite for sessionId: ${sessionId}`,
          err,
        );
        return null;
      }
    },

    async set(session: AgentSession) {
      try {
        const payload: AgentSession = { ...session, updatedAt: Date.now() };
        upsert.run(payload.id, JSON.stringify(payload));
      } catch (err) {
        console.warn(
          `[WARN] Failed to persist session to SQLite for sessionId: ${session.id}`,
          err,
        );
      }
    },

    async delete(sessionId: SessionId) {
      try {
        const result = deleteStmt.run(sessionId);
        return result.changes > 0;
      } catch (err) {
        console.warn(
          `[WARN] Failed to delete session from SQLite for sessionId: ${sessionId}`,
          err,
        );
        return false;
      }
    },

    async listByAgent(agentId: AgentId) {
      const all = await this.listAll();
      return all
        .filter((session) => session.agentId === agentId)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async listAll() {
      try {
        const rows = selectAll.all();
        const sessions = rows
          .map((row) => parseSession(row.data, `row id: ${row.id}`))
          .filter((session): session is AgentSession => session !== null);
        return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      } catch (err) {
        console.warn("[WARN] Failed to list sessions from SQLite", err);
        return [];
      }
    },
  };
}
