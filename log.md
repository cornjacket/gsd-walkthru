# Work log

Task-granularity record of work in this repo, indexed by short commit hash. See `CLAUDE.md` → "Work log (log.md)" for the rule. Each entry is one line:

```
- **YYYY-MM-DD** — <one or two sentences of what changed and why>. Task: `<task-name>`. [Subtask: `<subtask-name>`.] Commit: `<short-hash>`.
```

Newest entries at the bottom.

- **2026-05-06** — Planned Phase 3 (Body Handling & Public API Surface) end-to-end via `/gsd-plan-phase 3`: research → validation strategy → patterns map → 7 PLAN.md files in 5 waves → revision pass after plan-checker found 1 blocker + 4 warnings → re-verified clean. All 5 phase requirements (BODY-01, BODY-02, API-01, API-03, API-04) covered. Task: `phase-3-plan`. Commit: `61e69b6`.
- **2026-05-07** — Added `tsconfig.test.json` (extends base config, drops `**/*.test.ts` exclusion) and `typecheck` npm script so tsc includes test files in its compilation graph (D-20/RESEARCH Pitfall 1); installed supertest and @types/supertest as devDependencies to enable Phase 3 integration-shape tests (D-21). Task: `03-01`. Commit: `26079ff`.
- **2026-05-07** — Shipped provider plumbing for Phase 3: Provider interface (D-01), Map-backed registry with last-write-wins semantics and _clearRegistryForTesting, 3 discriminated-union branch types co-located with self-registering stubs (StripeWebhook/GitHubWebhook/ShopifyWebhook), and registry tests (3 cases, Pitfall 2 isolation). Task: `03-02-provider-interface-registry-stubs`. Commit: `59ae72f`.
- **2026-05-07** — Implemented both raw-body capture surfaces (`rawBodyCapture()` standalone middleware and `captureRawBody` verify-callback helper) under `src/raw-body/` with co-located supertest-driven tests; 8 new tests pass covering capture, 413 limit enforcement, skip-if-set guard, cross-surface parity, and no-console contract. Task: `03-03-raw-body-capture-surfaces`. Commit: `6c8462d`.
