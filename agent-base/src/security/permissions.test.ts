/**
 * Tests for src/security/permissions.ts
 *
 * STANDARD: Colocated *.test.ts. Use per-instance stubs, never prototype mutation.
 * Coverage target: 70% lines/branches/functions/statements (Vitest V8).
 */

import { describe, it, expect } from "vitest";
import {
  classifyToolKind,
  resolvePermissionLevel,
  canAutoApprove,
  isAlwaysDangerous,
} from "../security/permissions.js";

describe("classifyToolKind", () => {
  it("classifies read tools correctly", () => {
    expect(classifyToolKind("read_file")).toBe("read");
    expect(classifyToolKind("get_user")).toBe("read");
    expect(classifyToolKind("load_config")).toBe("read");
    expect(classifyToolKind("view_document")).toBe("read");
  });

  it("classifies search tools correctly", () => {
    expect(classifyToolKind("search_documents")).toBe("search");
    expect(classifyToolKind("find_records")).toBe("search");
    expect(classifyToolKind("query_db")).toBe("search");
    expect(classifyToolKind("list_files")).toBe("search");
  });

  it("classifies write tools correctly", () => {
    expect(classifyToolKind("write_file")).toBe("write");
    expect(classifyToolKind("create_record")).toBe("write");
    expect(classifyToolKind("update_user")).toBe("write");
    expect(classifyToolKind("insert_row")).toBe("write");
    expect(classifyToolKind("patch_config")).toBe("write");
  });

  it("classifies delete tools correctly", () => {
    expect(classifyToolKind("delete_user")).toBe("delete");
    expect(classifyToolKind("remove_file")).toBe("delete");
    expect(classifyToolKind("destroy_session")).toBe("delete");
  });

  it("classifies execute tools correctly", () => {
    expect(classifyToolKind("execute_query")).toBe("execute");
    expect(classifyToolKind("run_script")).toBe("execute");
    expect(classifyToolKind("exec_command")).toBe("execute");
    expect(classifyToolKind("shell_command")).toBe("execute");
  });

  it("returns unknown for unrecognized tool names", () => {
    expect(classifyToolKind("do_thing")).toBe("unknown");
    expect(classifyToolKind("process_data")).toBe("unknown");
    expect(classifyToolKind("xyz")).toBe("unknown");
  });

  // Key regression: token-based match prevents substring false positives.
  it("does not match 'read' inside 'thread'", () => {
    const kind = classifyToolKind("thread_pool");
    // "thread" contains "read" as a substring but NOT as a token.
    expect(kind).toBe("unknown");
  });

  it("does not match 'find' inside 'refined'", () => {
    const kind = classifyToolKind("refined_output");
    expect(kind).toBe("unknown");
  });
});

describe("canAutoApprove", () => {
  it("approves read and search", () => {
    expect(canAutoApprove("read")).toBe(true);
    expect(canAutoApprove("search")).toBe(true);
  });

  it("does not approve write, delete, execute, fetch, unknown", () => {
    expect(canAutoApprove("write")).toBe(false);
    expect(canAutoApprove("delete")).toBe(false);
    expect(canAutoApprove("execute")).toBe(false);
    expect(canAutoApprove("fetch")).toBe(false);
    expect(canAutoApprove("unknown")).toBe(false);
  });
});

describe("resolvePermissionLevel", () => {
  it("auto-approves read tools", () => {
    expect(resolvePermissionLevel("read_config")).toBe("auto-approve");
    expect(resolvePermissionLevel("get_user")).toBe("auto-approve");
  });

  it("requires approval for write tools", () => {
    expect(resolvePermissionLevel("write_file")).toBe("require-approval");
    expect(resolvePermissionLevel("delete_record")).toBe("require-approval");
    expect(resolvePermissionLevel("create_user")).toBe("require-approval");
  });

  it("requires approval for unknown tools (conservative default)", () => {
    expect(resolvePermissionLevel("mystery_tool")).toBe("require-approval");
  });
});

describe("isAlwaysDangerous", () => {
  it("flags known dangerous tool names", () => {
    expect(isAlwaysDangerous("bash")).toBe(true);
    expect(isAlwaysDangerous("shell")).toBe(true);
    expect(isAlwaysDangerous("eval")).toBe(true);
    expect(isAlwaysDangerous("exec")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isAlwaysDangerous("BASH")).toBe(true);
    expect(isAlwaysDangerous("Shell")).toBe(true);
  });

  it("does not flag safe tools", () => {
    expect(isAlwaysDangerous("read_file")).toBe(false);
    expect(isAlwaysDangerous("search_docs")).toBe(false);
  });
});
