# Work log

Task-granularity record of work in this repo, indexed by short commit hash. See `CLAUDE.md` → "Work log (log.md)" for the rule. Each entry is one line:

```
- **YYYY-MM-DD** — <one or two sentences of what changed and why>. Task: `<task-name>`. [Subtask: `<subtask-name>`.] Commit: `<short-hash>`.
```

Newest entries at the bottom.

- **2026-05-07** — Added `tsconfig.test.json` (extends base config, drops `**/*.test.ts` exclusion) and `typecheck` npm script so tsc includes test files in its compilation graph (D-20/RESEARCH Pitfall 1); installed supertest and @types/supertest as devDependencies to enable Phase 3 integration-shape tests (D-21). Task: `03-01`. Commit: `26079ff`.
