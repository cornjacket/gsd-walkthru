---
phase: 06-integration-tests-coverage-gate-negative-case-audit
plan: "02"
subsystem: testing
tags: [vitest, supertest, express, stripe, github, shopify, integration-tests, hmac]

# Dependency graph
requires:
  - phase: 06-01
    provides: vitest.config.ts expanded include for tests/integration/**/*.test.ts
  - phase: 05-github-shopify-providers
    provides: githubProvider and shopifyProvider implementations
  - phase: 04-stripe-provider
    provides: stripeProvider implementation
  - phase: 03-body-handling-public-api-surface
    provides: rawBodyCapture, captureRawBody, createWebhookMiddleware, webhookErrorHandler
provides:
  - "Stripe integration tests covering rawBodyCapture and verifyCallback modes (6 tests)"
  - "GitHub integration tests covering rawBodyCapture and verifyCallback modes (5 tests)"
  - "Shopify integration tests covering rawBodyCapture and verifyCallback modes (5 tests)"
  - "BODY-01 and BODY-02 bound at integration tier for all three providers"
  - "QUAL-02 satisfied: Supertest end-to-end coverage for all providers"
affects: [06-04-mutation-experiment, 07-documentation-example-app]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-test makeApp factory (D-09): fresh Express instance per test, no leaked state"
    - "Inline makeSignature helper (D-11): per-provider, not shared across files"
    - "Dual describe-group structure (D-10): rawBodyCapture mode + verifyCallback mode per provider"
    - "Side-effect import of provider modules to trigger registerProvider"

key-files:
  created:
    - tests/integration/stripe.test.ts
    - tests/integration/github.test.ts
    - tests/integration/shopify.test.ts
  modified: []

key-decisions:
  - "Import path for captureRawBody is src/raw-body/verify.js (not captureRawBody.js — file is verify.ts)"
  - "Shopify tampered payload uses 8888 not 0000 — 0000 is invalid JSON (leading zeros not permitted)"
  - "All three integration files are structurally identical: imports, constants, inline makeSignature, makeApp factory, two describe groups"

patterns-established:
  - "Integration test structure: inline makeSignature + per-test makeApp factory + two describe groups"
  - "Provider side-effect import pattern for integration tests"

requirements-completed: [QUAL-02, BODY-01, BODY-02]

# Metrics
duration: 3min
completed: 2026-05-29
---

# Phase 06 Plan 02: Integration Suite Summary

**Supertest integration tests for Stripe, GitHub, and Shopify providers under both body-parser mounting modes (rawBodyCapture and verifyCallback), satisfying QUAL-02 and binding BODY-01/BODY-02 at integration tier**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-29T21:31:56Z
- **Completed:** 2026-05-29T21:35:20Z
- **Tasks:** 2
- **Files modified:** 3 created

## Accomplishments

- Created three integration test files at `tests/integration/{stripe,github,shopify}.test.ts`
- Each file has two `describe()` groups: rawBodyCapture mode (BODY-01) and verifyCallback mode (BODY-02)
- Stripe: 6 integration tests (valid sig, tampered body, missing header, replay, + BODY-02 valid/tampered)
- GitHub: 5 integration tests (valid sig with deliveryId, tampered body, missing header, + BODY-02 valid/tampered)
- Shopify: 5 integration tests (valid sig with topic/webhookId, tampered body, hex-encoding rejection, + BODY-02 valid/tampered)
- All 126 tests pass across 16 files (up from 110 in 13 files before this plan)

## Task Commits

1. **Task 1: Create tests/integration/stripe.test.ts** - `c9cd5b9` (feat)
2. **Task 2: Create tests/integration/github.test.ts and shopify.test.ts** - `d782c44` (feat, includes Rule 1 bug fix)

**Plan metadata:** `_pending_`

## Files Created/Modified

- `tests/integration/stripe.test.ts` - Stripe end-to-end integration tests (rawBodyCapture + verifyCallback modes, 6 tests)
- `tests/integration/github.test.ts` - GitHub end-to-end integration tests (rawBodyCapture + verifyCallback modes, 5 tests)
- `tests/integration/shopify.test.ts` - Shopify end-to-end integration tests (rawBodyCapture + verifyCallback modes, 5 tests)

## Decisions Made

- Import path for `captureRawBody` is `src/raw-body/verify.js` — the plan specified `captureRawBody.js` but the actual file is `verify.ts`; plan interface doc was slightly incorrect about filename, corrected to match actual implementation
- Each file uses per-test `makeApp()` factory returning a fresh Express instance (D-09)
- Each file has its own inline `makeSignature()` helper (D-11 — no shared signers module)
- No `tests/integration/_helpers.ts` created (plan explicitly forbids it per D-11)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed invalid JSON in Shopify tampered body test**
- **Found during:** Task 2 (Shopify integration tests)
- **Issue:** Plan's sample tampered payload used `SAMPLE_PAYLOAD.replace('9999', '0000')` which produces `{"order_id":0000,...}` — `0000` is not valid JSON (leading zeros in numeric literals are forbidden by RFC 7159). In the verifyCallback mode, `express.json()` parses the body before route handling, so it returned 400 (JSON parse error) instead of 401 (signature mismatch).
- **Fix:** Changed replacement from `'0000'` to `'8888'` in both rawBodyCapture and verifyCallback tampered-body tests, producing valid JSON that still fails signature verification
- **Files modified:** `tests/integration/shopify.test.ts`
- **Verification:** All 5 Shopify tests pass; both 401 assertions verified
- **Committed in:** `d782c44` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Essential fix for test correctness. No scope creep.

## Issues Encountered

None beyond the auto-fixed bug above.

## User Setup Required

None - no external service configuration required.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All files are test-only.

## Known Stubs

None - all integration tests exercise real implementations end-to-end.

## Next Phase Readiness

- All three integration test files exist and all tests pass
- Phase 06-03 (audit fixes) and 06-04 (mutation experiment) can proceed
- Mutation experiment (06-04) can reference `tests/integration/shopify.test.ts` for the Shopify hex-encoding guard removal test (D-17 mutation #5)
- Phase 07 README can reference these integration tests as canonical runnable examples

## Self-Check: PASSED

Files exist:
- `tests/integration/stripe.test.ts`: FOUND
- `tests/integration/github.test.ts`: FOUND
- `tests/integration/shopify.test.ts`: FOUND

Commits exist:
- `c9cd5b9`: FOUND
- `d782c44`: FOUND

---
*Phase: 06-integration-tests-coverage-gate-negative-case-audit*
*Completed: 2026-05-29*
