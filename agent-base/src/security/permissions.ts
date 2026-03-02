/**
 * Tool permission classification.
 *
 * STANDARD: Default to "dangerous" unless there is high confidence a tool is read-only.
 * Use token-based matching (split on ._-) to avoid substring false positives.
 * e.g., "thread" must NOT match "read".
 *
 * See AGENT_STANDARDS.md — Security Defaults, Agent-Specific Patterns.
 */

export type ToolKind = "read" | "search" | "fetch" | "write" | "delete" | "execute" | "unknown";

export type PermissionLevel = "auto-approve" | "require-approval";

const SAFE_KINDS: Set<ToolKind> = new Set(["read", "search"]);

/**
 * Returns whether a given tool kind can be auto-approved without user confirmation.
 * Conservative: only "read" and "search" are auto-approved.
 */
export function canAutoApprove(kind: ToolKind): boolean {
  return SAFE_KINDS.has(kind);
}

/**
 * Tokenizes a tool name on common separators: `.`, `_`, `-`.
 * Used for safe token-based matching that avoids substring false positives.
 *
 * @example
 * tokenize("thread_read_file") // ["thread", "read", "file"]
 */
function tokenize(name: string): string[] {
  return name.toLowerCase().split(/[._-]+/).filter(Boolean);
}

/**
 * Classifies a tool name into a ToolKind.
 * Defaults to "unknown" (treated as dangerous) when classification is uncertain.
 *
 * STANDARD: Prefer conservative classification. Only mark safe when confident.
 *
 * @example
 * classifyToolKind("read_file")          // "read"
 * classifyToolKind("search_documents")   // "search"
 * classifyToolKind("delete_record")      // "delete"
 * classifyToolKind("thread_read")        // "read"  ← token match, not substring
 */
export function classifyToolKind(toolName: string): ToolKind {
  const tokens = new Set(tokenize(toolName));

  // Exact token checks — ordered from most specific to most general.
  if (tokens.has("delete") || tokens.has("remove") || tokens.has("destroy")) return "delete";
  if (tokens.has("execute") || tokens.has("run") || tokens.has("exec") || tokens.has("shell")) return "execute";
  if (tokens.has("write") || tokens.has("create") || tokens.has("insert") || tokens.has("update") || tokens.has("patch") || tokens.has("post") || tokens.has("put")) return "write";
  if (tokens.has("fetch") || tokens.has("http") || tokens.has("request") || tokens.has("download")) return "fetch";
  if (tokens.has("search") || tokens.has("find") || tokens.has("query") || tokens.has("list")) return "search";
  if (tokens.has("read") || tokens.has("get") || tokens.has("load") || tokens.has("view")) return "read";

  return "unknown";
}

/**
 * Resolves the required permission level for a tool.
 *
 * @example
 * resolvePermissionLevel("search_files") // "auto-approve"
 * resolvePermissionLevel("delete_user")  // "require-approval"
 */
export function resolvePermissionLevel(toolName: string): PermissionLevel {
  const kind = classifyToolKind(toolName);
  return canAutoApprove(kind) ? "auto-approve" : "require-approval";
}

/**
 * Named set of tools that are always dangerous regardless of name heuristics.
 * Extend this list as your tool surface grows.
 */
export const ALWAYS_DANGEROUS_TOOLS: ReadonlySet<string> = new Set([
  "bash",
  "shell",
  "exec",
  "eval",
  "system",
  "computer",
]);

/**
 * Returns true if a tool is unconditionally dangerous (overrides heuristic classification).
 */
export function isAlwaysDangerous(toolName: string): boolean {
  return ALWAYS_DANGEROUS_TOOLS.has(toolName.toLowerCase().trim());
}
