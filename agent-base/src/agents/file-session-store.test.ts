/**
 * Tests for src/agents/file-session-store.ts
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createFileSessionStore } from "./file-session-store.js";
import type { AgentSession } from "./types.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = join(tmpdir(), `agency-store-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
  vi.restoreAllMocks();
});

describe("file-session-store", () => {
  it("set() then get() writes and reads session with updatedAt refreshed", async () => {
    const dir = await createTempDir();
    const store = createFileSessionStore(dir);
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);

    const session: AgentSession = {
      id: "sess-1",
      agentId: "agent-1",
      status: "idle",
      messages: [],
      createdAt: now - 10_000,
      updatedAt: now - 5_000,
    };

    await store.set(session);
    const result = await store.get("sess-1");

    expect(result).not.toBeNull();
    expect(result?.id).toBe("sess-1");
    expect(result?.agentId).toBe("agent-1");
    expect(result?.updatedAt).toBe(now);
  });

  it("listAll() skips corrupted files and logs a warning", async () => {
    const dir = await createTempDir();
    const store = createFileSessionStore(dir);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const session: AgentSession = {
      id: "sess-valid",
      agentId: "agent-1",
      status: "idle",
      messages: [],
      createdAt: 1,
      updatedAt: 2,
    };

    await store.set(session);
    await writeFile(join(dir, "bad.json"), JSON.stringify({ foo: "bar" }), "utf-8");

    const results = await store.listAll();

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("sess-valid");
    expect(warnSpy).toHaveBeenCalled();
  });

  it("get() with malformed file returns null", async () => {
    const dir = await createTempDir();
    const store = createFileSessionStore(dir);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await writeFile(join(dir, "bad.json"), JSON.stringify({ foo: "bar" }), "utf-8");

    const result = await store.get("bad");
    expect(result).toBeNull();
  });

  it("delete() removes session file", async () => {
    const dir = await createTempDir();
    const store = createFileSessionStore(dir);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const session: AgentSession = {
      id: "sess-delete",
      agentId: "agent-1",
      status: "idle",
      messages: [],
      createdAt: 1,
      updatedAt: 2,
    };

    await store.set(session);
    const deleted = await store.delete("sess-delete");
    expect(deleted).toBe(true);
    const result = await store.get("sess-delete");
    expect(result).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
