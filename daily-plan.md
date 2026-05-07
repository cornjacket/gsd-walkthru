# Daily plan — 2026-05-08

Close out Phase 3 review findings, then open Phase 4 (Stripe provider) at the
discuss step. Push the rebased main first thing — 50 local commits are sitting
ahead of `origin/main` post-rebase. Pending hash back-fills (log.md, four
03-*-SUMMARY.md files, `.gitignore`) ride into the BL-01 fix commit per CLAUDE.md
Rule 3, so no dedicated back-fill commit is needed.

```
   Phase 3 ✓                                         Phase 4 open
   verified                                          (discuss step)
       │                                                  │
       ▼                                                  ▼
   ┌───────┐    ┌───────────┐    ┌─────────────┐    ┌─────────────┐
   │ push  │ →  │ fix BL-01 │ →  │ /gsd-code-  │ →  │ /gsd-discuss│
   │ origin│    │ raw-body  │    │ review --fix│    │ -phase 4    │
   │ main  │    │ dep       │    │ (WR-02..06) │    │ (STRP-01..03)│
   └───────┘    └───────────┘    └─────────────┘    └─────────────┘
      AM           AM-mid           midday                PM
```

Notes:
- **BL-01 first**: `raw-body` is undeclared in `package.json` `dependencies` —
  real ship-blocker before Phase 4 builds on the raw-body capture surface.
- **WR-02..WR-06**: fold quick wins (provider-list-from-registry, secret trim,
  `parsed: unknown`) into the BL-01 commit; defer the rest into Phase 4 context.
- **No plan-phase today**: Phase 4 planning runs Monday on a clean review board.
- **EOD signoff**: write Monday's plan into `daily-plan.md` (Friday writes
  forward through the weekend tolerance window).
