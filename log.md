# Work log

Task-granularity record of work in this repo, indexed by short commit hash. See `CLAUDE.md` → "Work log (log.md)" for the rule. Each entry is one line:

```
- **YYYY-MM-DD** — <one or two sentences of what changed and why>. Task: `<task-name>`. [Subtask: `<subtask-name>`.] Commit: `<short-hash>`.
```

Newest entries at the bottom.

- **2026-05-07** — Shipped provider plumbing for Phase 3: Provider interface (D-01), Map-backed registry with last-write-wins semantics and _clearRegistryForTesting, 3 discriminated-union branch types co-located with self-registering stubs (StripeWebhook/GitHubWebhook/ShopifyWebhook), and registry tests (3 cases, Pitfall 2 isolation). Task: `03-02-provider-interface-registry-stubs`. Commit: `59ae72f`.
