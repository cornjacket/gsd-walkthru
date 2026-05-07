# Work log

Task-granularity record of work in this repo, indexed by short commit hash. See `CLAUDE.md` → "Work log (log.md)" for the rule. Each entry is one line:

```
- **YYYY-MM-DD** — <one or two sentences of what changed and why>. Task: `<task-name>`. [Subtask: `<subtask-name>`.] Commit: `<short-hash>`.
```

Newest entries at the bottom.

- **2026-05-07** — Widened `WebhookValidationReason` union with `'malformed_payload'` (Phase 3 D-17); added messageFor derivation test and leakage test extension per D-07 same-commit pattern. Task: `03-04 Task 1: Widen WebhookValidationReason with 'malformed_payload'`. Commit: `2e0ecda`.
- **2026-05-07** — Created `webhookErrorHandler()` opt-in 4-arg Express error middleware factory (D-14/D-15/D-16) with 9 supertest-driven tests covering all 5 reasons, passthrough, no-logging, fn.length, and response no-leakage. Task: `03-04 Task 2: webhookErrorHandler() factory + tests`. Commit: `3912135`.
