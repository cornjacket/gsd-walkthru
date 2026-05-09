# Daily plan — 2026-05-10

Carry Phase 6 (Integration Tests, Coverage Gate & Negative-Case Audit) from
context → plan → execute in one sitting, same arc as Phase 4 and Phase 5.
Today's discuss step locked 19 decisions across four areas (coverage tooling,
integration suite layout, all 8 carry-over advisory fixes, and the manual
guard-removal mutation experiment), so plan-phase has unusually low ambiguity
to resolve. Phase 6 is the cross-cutting quality gate that finishes v1's
testing story; Phase 7 (README + example app) is all that follows.

```
   Phase 6 context                                     Phase 6 closed
   on disk (06-CONTEXT.md)                             (verifier green)
        │                                                    │
        ▼                                                    ▼
   ┌──────────┐    ┌──────────┐    ┌─────────────┐    ┌─────────────┐
   │   plan   │ →  │ execute  │ →  │ mutation    │ →  │  verify +   │
   │ phase 6  │    │ phase 6  │    │ experiment  │    │  ROADMAP    │
   │ (~4      │    │ (waves   │    │ (5 guards,  │    │  Phase 6 [x]│
   │  plans)  │    │  drafted)│    │  revert ea.)│    │  + STATE    │
   └──────────┘    └──────────┘    └─────────────┘    └─────────────┘
      AM              AM-mid           midday               PM
```

Notes:
- **Plan likely splits into ~4 plans**: coverage tooling install + vitest
  config + CI step + script alias; integration suite (3 files, both
  body-parser modes per file); audit-fix bundle (D-12..D-16, possibly split
  into stripe-source-fixes vs test-file-fixes); mutation experiment +
  06-VERIFICATION.md "Guard Removal Demonstrations". Plans 2 and 3 are
  largely independent — good parallelism for execute-phase.
- **Stripe touches concentrate**: D-12 (array-header three-way split), D-13
  (factory tolerance loud-fail), D-14 (strict-numeric `t=`), D-15 P4 WR-04
  (default-tolerance dedupe). All in `src/middleware.ts` + `src/providers/stripe.ts`
  + `src/providers/stripe.test.ts` — keep these atomic so review diff stays
  scannable.
- **`tests/integration/` is greenfield**: P1 D-05 reserved the directory
  but Phase 6 actually creates it. `vitest.config.ts` `include` MUST expand
  to pick it up, otherwise the new tests run on no machine.
- **Mutation experiment discipline**: D-19 says edit → test → revert → next,
  no commits. Verify `git status` is clean after all 5 guards. The only
  artifact is the evidence table in 06-VERIFICATION.md.
- **EOD signoff**: if Phase 6 closes cleanly, only Phase 7 (README + runnable
  example app) remains for v1.0. Write Monday's plan or signal Phase 7 ready.
