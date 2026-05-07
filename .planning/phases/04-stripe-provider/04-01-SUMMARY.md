---
phase: 04-stripe-provider
plan: 01
subsystem: api
tags: [typescript, stripe, webhook, errors]

# Dependency graph
requires:
  - phase: 02-crypto-core-error-class
    provides: WebhookValidationError class and WebhookValidationReason union (D-07 widening pattern)
  - phase: 03-body-handling-public-api-surface
    provides: malformed_payload reason, public barrel re-exports, index.test.ts structure
provides:
  - "'invalid_signature_format' added to WebhookValidationReason union (6 members total)"
  - "errors.test.ts extended with round-trip and message derivation tests for new reason"
  - "index.test.ts extended with D-14 reachability smoke for new reason"
affects:
  - 04-stripe-provider (plan 03 — stripe.ts implementation will throw this reason on garbled headers)
  - 05-github-shopify-providers

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase 2 D-07 same-commit widening: reason union extended in same commit as test exercising it"
    - "TDD RED/GREEN: TypeScript compilation as the RED gate; Vitest runtime tests don't enforce compile-time type safety"

key-files:
  created: []
  modified:
    - src/errors.ts
    - src/errors.test.ts
    - src/index.test.ts

key-decisions:
  - "'invalid_signature_format' maps to HTTP 401 (auth-failure family); 400 is exclusive to malformed_payload (D-06)"
  - "messageFor() replace(/_/g, ' ') already handles the new reason — no body change required"
  - "TDD RED gate confirmed via TypeScript typecheck (not Vitest runtime) — Vitest doesn't enforce type annotations at runtime"

patterns-established:
  - "TDD RED gate for typed union widening: run npm run typecheck, not npm test, to confirm failures"

requirements-completed: [STRP-01]

# Metrics
duration: 2min
completed: 2026-05-07
---

# Phase 04 Plan 01: Error Union Widening Summary

**`WebhookValidationReason` union widened to 6 members with `'invalid_signature_format'`, tests shipped in same commit per Phase 2 D-07 pattern**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-07T22:09:47Z
- **Completed:** 2026-05-07T22:11:59Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `| 'invalid_signature_format'` to `WebhookValidationReason` union in `src/errors.ts` (6th member; Phase 4 D-05)
- Extended `src/errors.test.ts` with `'invalid_signature_format'` in the `it.each` round-trip array and a standalone message derivation test; all 15 tests pass
- Extended `src/index.test.ts` with a D-14 reachability smoke assertion; full suite 71 tests green across 10 files (no regressions)

## Task Commits

1. **Task 1 RED: Add failing tests for invalid_signature_format** - `adbf62a` (test)
2. **Task 1 GREEN: Widen WebhookValidationReason union** - `27c426f` (feat)
3. **Task 2: Extend index.test.ts reachability smoke** - `81b1a26` (feat)

## Files Created/Modified

- `src/errors.ts` — Added `| 'invalid_signature_format'` as 6th union member; updated header comment to reference Phase 4 D-05
- `src/errors.test.ts` — Added `'invalid_signature_format'` to `it.each` array and standalone message/reason/statusCode test
- `src/index.test.ts` — Added D-14 reachability smoke: type annotation `const reason: WebhookValidationReason = 'invalid_signature_format'`

## Decisions Made

- The TDD RED gate for union widening is TypeScript compilation (`npm run typecheck`), not Vitest runtime. Vitest doesn't enforce TypeScript type annotations, so `it.each<WebhookValidationReason>(['invalid_signature_format'])` passes at runtime even when the union lacks the value. `typecheck` produced 4 errors confirming TRUE RED before implementation.
- `messageFor()` function body required no change — the existing `replace(/_/g, ' ')` pattern produces `"stripe webhook invalid signature format"` automatically. This confirms the D-07 same-commit approach (no separate messageFor extension needed).

## Deviations from Plan

None - plan executed exactly as written.

The TDD execution followed strict RED/GREEN pattern: RED commit (`adbf62a`) with `typecheck` errors, GREEN commit (`27c426f`) with clean typecheck and passing tests. Task 2 (`81b1a26`) is not TDD-flagged in the plan and was committed in one step.

## Issues Encountered

None — the Vitest-vs-TypeScript RED gate subtlety was anticipated and handled by running `npm run typecheck` to confirm TRUE RED before the GREEN implementation commit.

## User Setup Required

None - no external service configuration required.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. This plan adds a string literal to a discriminated union — purely internal type widening. The `toJSON()` whitelist in `WebhookValidationError` (T-4-01 mitigation) remains unchanged; the new reason flows through the same structural guarantee.

## Next Phase Readiness

- `'invalid_signature_format'` is now available in the public `WebhookValidationReason` union re-exported through `src/index.ts`
- Plan 03 (`src/providers/stripe.ts` implementation) can now import and throw `new WebhookValidationError({ reason: 'invalid_signature_format', ... })` without any further type changes
- Plan 02 (middleware tolerance) is wave-parallel and unblocked
- No blockers

## Self-Check

Files exist:
- `src/errors.ts` — FOUND
- `src/errors.test.ts` — FOUND
- `src/index.test.ts` — FOUND

Commits exist:
- `adbf62a` — RED test commit
- `27c426f` — GREEN implementation commit
- `81b1a26` — Task 2 commit

---
*Phase: 04-stripe-provider*
*Completed: 2026-05-07*
