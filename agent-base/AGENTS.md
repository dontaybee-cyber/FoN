# Agent Guidelines — agent-base

> Agents working in this repo: read this first, every time.

## Quick Commands

```bash
pnpm install        # install deps
pnpm build          # type-check + compile
pnpm tsgo           # TypeScript strict check only
pnpm check          # lint + format
pnpm test           # run test suite
pnpm test:coverage  # run tests with V8 coverage report
```

## Source-of-Truth Locations

| Concern | Module |
|---|---|
| Colors / palette tokens | `src/terminal/palette.ts` |
| Semantic theme (success/error/warn) | `src/terminal/theme.ts` |
| Table rendering | `src/terminal/table.ts` |
| Spinners / progress bars | `src/cli/progress.ts` |
| Time / duration formatting | `src/infra/format-time.ts` |
| Rate limiting | `src/infra/rate-limit.ts` |
| Structured logging | `src/infra/logger.ts` |
| Tool permission classification | `src/security/permissions.ts` |
| Dependency injection | `src/agents/deps.ts` (createDefaultDeps) |
| Session storage | `src/agents/session-store.ts` |
| Base agent | `src/agents/agent.ts` |
| Types & interfaces | `src/agents/types.ts` |

## Critical Rules

1. **Never create local formatAge / formatDuration / formatElapsed.** Import from `src/infra/format-time.ts`.
2. **Never hardcode ANSI codes or hex colors.** Import from `src/terminal/palette.ts` or use `src/terminal/theme.ts`.
3. **Never hand-roll spinners or progress bars.** Use `src/cli/progress.ts`.
4. **Never patch prototypes.** Use the `createDefaultDeps` DI pattern for composition.
5. **Never use `any`.** Fix the root cause. Never add `@ts-nocheck`.
6. **Never write re-export wrapper files.** Import directly from the source module.
7. **Tool schemas:** top-level `{ type: "object", properties: {...} }` only. No `anyOf/oneOf/allOf`. No `format` as a property key.
8. **Conservative permission defaults.** Only "read" and "search" tools are auto-approved.

## Before Every Commit

```bash
pnpm tsgo    # zero type errors
pnpm check   # zero lint/format violations
pnpm test    # all tests pass
```

## When Stuck

Read `AGENT_STANDARDS.md` (in project root) — it contains the rationale behind every rule above.
