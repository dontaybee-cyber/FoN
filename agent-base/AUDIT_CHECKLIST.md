# Agent Audit Checklist

Use this checklist to compare your existing agents against the standards defined in `AGENT_STANDARDS.md`.
Score each item ✅ / ⚠️ / ❌ as you review each file.

---

## 1. Project Structure

| Check | Status | Notes |
|---|---|---|
| Source lives under `src/` with logical domain subfolders | | |
| Tests colocated as `*.test.ts` next to source files | | |
| No logic in CLI wiring files (CLI only wires commands) | | |
| Plugins/extensions have their own `package.json` with local deps | | |
| No re-export wrapper files (no files that just re-export from another) | | |

---

## 2. Language & TypeScript

| Check | Status | Notes |
|---|---|---|
| `strict: true` in `tsconfig.json` | | |
| Zero `any` usages | | |
| Zero `@ts-nocheck` directives | | |
| All imports use `.js` extension (ESM) | | |
| `import type { X }` used for type-only imports | | |
| No prototype mutation (`Object.defineProperty`, `applyPrototypeMixins`, etc.) | | |
| `noImplicitOverride` enabled | | |

---

## 3. Terminal Output

| Check | Status | Notes |
|---|---|---|
| Centralized palette file exists — no inline hex/ANSI codes in feature code | | |
| Semantic theme wrapper used (`theme.success()`, `theme.error()`, etc.) | | |
| Table rendering via shared utility (not hand-rolled column math) | | |
| Spinners and progress via shared utility (not hand-rolled `setInterval`) | | |

---

## 4. Shared Utilities

| Check | Status | Notes |
|---|---|---|
| Time formatting via centralized module (no local `formatAge` / `formatDuration`) | | |
| Rate limiter imported from shared infra (not hand-rolled per feature) | | |
| Logger creates namespaced instances (not raw `console.log`) | | |
| Logger respects `LOG_LEVEL` env var | | |

---

## 5. Security

| Check | Status | Notes |
|---|---|---|
| Max prompt/input size enforced — constant documented with CWE reference | | |
| Tool permission classifier is conservative (defaults to "require-approval") | | |
| Token-based tool name matching (not substring — no false positives like "thread"→"read") | | |
| Known dangerous tools always blocked regardless of classification (`bash`, `shell`, `eval`, etc.) | | |
| No secrets in code, tests, or docs | | |

---

## 6. Dependency Injection

| Check | Status | Notes |
|---|---|---|
| Agent/feature modules accept a `deps` parameter | | |
| `createDefaultDeps()` factory provides all real implementations | | |
| Tests override deps per-instance (no prototype patching in tests) | | |
| All storage operations go through injected store (not direct FS/DB calls) | | |
| `now: () => number` injectable for deterministic time in tests | | |

---

## 7. Agent Behavior

| Check | Status | Notes |
|---|---|---|
| Session creation is rate-limited | | |
| Input size validated before model invocation | | |
| Tool calls routed through permission gate before execution | | |
| Session messages append consistently (user + assistant each turn) | | |
| `IAgent` interface implemented (`prompt`, `listSessions`, `getSession`) | | |

---

## 8. Tool Schemas

| Check | Status | Notes |
|---|---|---|
| All tool schemas have `type: "object"` at top level | | |
| No `anyOf` / `oneOf` / `allOf` in tool input schemas | | |
| `"format"` not used as a property name | | |
| String enums use a typed enum helper (not raw `{ "enum": [...] }` strings) | | |
| Optional fields use `Optional(...)` not `... \| null` (or documented equivalent) | | |

---

## 9. Testing

| Check | Status | Notes |
|---|---|---|
| Vitest used as test framework | | |
| V8 coverage configured with 70% thresholds | | |
| No prototype patching in tests | | |
| Live tests gated behind env var (e.g. `LIVE=1`) | | |
| Test file naming follows `*.test.ts` / `*.e2e.test.ts` convention | | |

---

## 10. CI / Quality Gates

| Check | Status | Notes |
|---|---|---|
| Type-check command: `pnpm tsgo` (or equivalent) | | |
| Lint + format: `pnpm check` (or equivalent) | | |
| Tests: `pnpm test` | | |
| All three gates run before push | | |
| Format-only diffs folded into the same commit (no separate "fix formatting" commits) | | |

---

## 11. Git & PR Discipline

| Check | Status | Notes |
|---|---|---|
| Commit messages follow `Domain: action` format | | |
| No bundling of unrelated refactors in a single commit | | |
| Multi-agent safety rules documented (no stash, no branch switch without request) | | |

---

## 12. Documentation

| Check | Status | Notes |
|---|---|---|
| `AGENTS.md` present at repo root | | |
| `CLAUDE.md` symlinked to `AGENTS.md` | | |
| Source-of-truth locations table in `AGENTS.md` | | |
| Critical rules listed (the "never do X" items) | | |

---

## Summary Score

| Section | ✅ | ⚠️ | ❌ |
|---|---|---|---|
| 1. Project Structure | | | |
| 2. TypeScript | | | |
| 3. Terminal Output | | | |
| 4. Shared Utilities | | | |
| 5. Security | | | |
| 6. Dependency Injection | | | |
| 7. Agent Behavior | | | |
| 8. Tool Schemas | | | |
| 9. Testing | | | |
| 10. CI / Quality Gates | | | |
| 11. Git & PR Discipline | | | |
| 12. Documentation | | | |
| **Total** | | | |

---

## Priority Order for Remediation

When there are gaps, address them in this order:

1. **Security** — input size limits, permission gates, dangerous tool blocklist
2. **Dependency Injection** — the DI pattern enables everything else (clean tests, swappable implementations)
3. **TypeScript strictness** — remove `any`, enable strict flags
4. **Shared utilities** — consolidate duplicate formatters, loggers, color constants
5. **Testing** — add colocated tests, set coverage thresholds, remove prototype patching
6. **Structure & docs** — AGENTS.md, CI gates, commit conventions
