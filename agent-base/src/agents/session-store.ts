/**
 * In-memory session store.
 * Default implementation — swap for a persistent store in production via DI.
 *
 * STANDARD: All storage operations through the SessionStore interface.
 * Feature code never calls storage directly; it receives a store via deps.
 */

import type { AgentSession, SessionId, AgentId } from "./types.js";

export type SessionStore = {
  get(sessionId: SessionId): Promise<AgentSession | null>;
  set(session: AgentSession): Promise<void>;
  delete(sessionId: SessionId): Promise<boolean>;
  listByAgent(agentId: AgentId): Promise<AgentSession[]>;
  listAll(): Promise<AgentSession[]>;
};

/**
 * Creates an in-memory session store.
 * Suitable for development, testing, and single-process deployments.
 * Not shared across processes — use a persistent store for multi-instance deployments.
 */
export function createMemorySessionStore(): SessionStore {
  const store = new Map<SessionId, AgentSession>();

  return {
    async get(sessionId) {
      return store.get(sessionId) ?? null;
    },

    async set(session) {
      store.set(session.id, { ...session, updatedAt: Date.now() });
    },

    async delete(sessionId) {
      return store.delete(sessionId);
    },

    async listByAgent(agentId) {
      const results: AgentSession[] = [];
      for (const session of store.values()) {
        if (session.agentId === agentId) {
          results.push(session);
        }
      }
      return results.sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async listAll() {
      return [...store.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    },
  };
}
