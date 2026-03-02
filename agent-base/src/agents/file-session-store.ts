import { mkdir, readFile, writeFile, unlink, readdir, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { AgentSession, SessionId } from "./types.js";
import type { SessionStore } from "./session-store.js";

/**
 * PRODUCTION-GRADE PERSISTENCE
 * Implements SessionStore interface using atomic file-system operations.
 * Ensures 24/7 Agency Director survives process restarts/crashes.
 */
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

export function createFileSessionStore(storageDir: string): SessionStore {
  const ensureDir = async (): Promise<void> => {
    await mkdir(storageDir, { recursive: true });
  };
  const getFilePath = (id: SessionId): string => join(storageDir, `${id}.json`);

  return {
    async get(sessionId) {
      try {
        const data = await readFile(getFilePath(sessionId), "utf-8");
        const parsed = JSON.parse(data) as unknown;
        const sanitized =
          typeof parsed === "object" && parsed !== null
            ? stripGateState(parsed as Record<string, unknown>)
            : null;
        if (!isValidSession(sanitized)) {
          console.warn(`[WARN] Malformed session file for sessionId: ${sessionId}`);
          return null;
        }
        // Gate state is intentionally ephemeral — do not read from persisted sessions.
        return sanitized as AgentSession;
      } catch (err) {
        if (
          typeof err === "object" &&
          err !== null &&
          (err as NodeJS.ErrnoException).code === "ENOENT"
        ) {
          // File not found — expected after delete or first access. Silent return.
          return null;
        }
        console.warn(`[WARN] Failed to read session file for sessionId: ${sessionId}`, err);
        return null;
      }
    },

    async set(session) {
      await ensureDir();
      const payload: AgentSession = { ...session, updatedAt: Date.now() };
      // Atomic write: temporary file + rename.
      const finalPath = getFilePath(session.id);
      const tmpPath = finalPath + `.${randomUUID()}.tmp`;
      await writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf-8");
      await rename(tmpPath, finalPath);
    },

    async delete(sessionId) {
      try {
        await unlink(getFilePath(sessionId));
        return true;
      } catch {
        return false;
      }
    },

    async listByAgent(agentId) {
      const all = await this.listAll();
      return all
        .filter((session) => session.agentId === agentId)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async listAll() {
      try {
        await ensureDir();
        const files = await readdir(storageDir);
        const results = await Promise.all(
          files
            .filter((file) => file.endsWith(".json"))
            .map(async (file) => {
              try {
                const data = await readFile(join(storageDir, file), "utf-8");
                const parsed = JSON.parse(data) as unknown;
                if (typeof parsed !== "object" || parsed === null) {
                  console.warn(`[WARN] Skipping malformed session file: ${file}`);
                  return null;
                }
                const sanitized = stripGateState(parsed as Record<string, unknown>);
                if (!isValidSession(sanitized)) {
                  console.warn(`[WARN] Skipping malformed session file: ${file}`);
                  return null;
                }
                return sanitized as AgentSession;
              } catch {
                console.warn(`[WARN] Failed to read session file: ${file}`);
                return null;
              }
            }),
        );
        return results
          .filter((session): session is AgentSession => session !== null)
          .sort((a, b) => b.updatedAt - a.updatedAt);
      } catch {
        return [];
      }
    },
  };
}
