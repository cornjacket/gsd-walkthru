# Work log

Task-granularity record of work in this repo, indexed by short commit hash. See `CLAUDE.md` → "Work log (log.md)" for the rule. Each entry is one line:

```
- **YYYY-MM-DD** — <one or two sentences of what changed and why>. Task: `<task-name>`. [Subtask: `<subtask-name>`.] Commit: `<short-hash>`.
```

Newest entries at the bottom.

- **2026-05-07** — Implemented both raw-body capture surfaces (`rawBodyCapture()` standalone middleware and `captureRawBody` verify-callback helper) under `src/raw-body/` with co-located supertest-driven tests; 8 new tests pass covering capture, 413 limit enforcement, skip-if-set guard, cross-surface parity, and no-console contract. Task: `03-03-raw-body-capture-surfaces`. Commit: `6c8462d`.
