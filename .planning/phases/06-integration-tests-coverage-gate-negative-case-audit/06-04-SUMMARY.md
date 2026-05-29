---
phase: "06"
plan: "04"
subsystem: testing/verification
tags: [mutation-experiment, verification, integration-tests, guard-removal, evidence]
dependency_graph:
  requires: ["06-02", "06-03"]
  provides: ["06-VERIFICATION.md", "QUAL-04", "ROADMAP-SC3"]
  affects: []
tech_stack:
  added: []
  patterns: ["D-17 sequential mutation experiment", "D-18 evidence table in VERIFICATION.md", "D-19 no-commit mutation discipline"]
key_files:
  created:
    - ".planning/phases/06-integration-tests-coverage-gate-negative-case-audit/06-VERIFICATION.md"
  modified:
    - "log.md"
decisions:
  - "Mutation 3 (missing-header guard) reveals a gap: the integration test only checks HTTP 401 status code, not the error reason, so both `missing_header` and `invalid_signature_format` satisfy the assertion — only the unit test catches the guard removal. Documented as a coverage gap, not a blocker for QUAL-04 (the security behavior — rejecting the request — is preserved either way)."
metrics:
  duration_seconds: 250
  completed_date: "2026-05-29"
  task_count: 3
  file_count: 2
---

# Phase 06 Plan 04: Mutation Experiment + 06-VERIFICATION.md Summary

Five sequential guard mutations confirmed that the integration test suite catches four out of five critical security guard removals at the integration tier; the fifth (missing-header guard) is caught by the unit tier, with the gap documented.

## Tasks Completed

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Verify prerequisite state and baseline test pass | Done | (pre-check, no commit) |
| 2 | Execute 5 sequential guard mutations and collect evidence | Done | (no commits per D-19) |
| 3 | Write 06-VERIFICATION.md with Guard Removal Demonstrations table | Done | 88ecdef |

## Mutation Evidence Summary

All 5 mutations executed sequentially per D-19 discipline. No commits during the experiment. Each file reverted with `git checkout -- <file>` after each run. Final `git status` clean.

| # | Guard | File | Integration Test(s) Failed |
|---|-------|------|---------------------------|
| 1 | HMAC compare | `src/providers/stripe.ts` | Stripe BODY-01 + BODY-02 tampered body tests (2 integration failures) |
| 2 | timingSafeCompare always-true | `src/crypto/compare.ts` | All three providers' tampered body integration tests (7 integration failures) |
| 3 | Missing-header guard (Stripe) | `src/providers/stripe.ts` | **Gap:** integration test only checks status 401; both guards return 401; only unit test caught reason difference |
| 4 | Age/tolerance check | `src/providers/stripe.ts` | Stripe BODY-01 replay outside tolerance window (1 integration failure) |
| 5 | Shopify base64→hex | `src/providers/shopify.ts` | Shopify BODY-01 valid-sig test + BODY-02 valid-sig test (2 integration failures); hex-encoding test also flipped |

## Deviations from Plan

### Deviation: Mutation 3 only failed a unit test, not an integration test

**Rule:** N/A — this is not a bug to auto-fix; it is a coverage gap surfaced during the experiment per the plan's explicit instructions ("if `npm test` does NOT fail during a mutation, capture that as evidence... report it in the VERIFICATION.md table as 'no failing test — coverage gap'").

**Found during:** Task 2, Mutation 3

**Issue:** The plan expected "Stripe missing-header integration test (expects 401, gets 200 or a different error)". In reality, after the `header === undefined` guard is commented out, the request falls through to `typeof header !== 'string'` (undefined is not a string), which also throws with status 401 but reason `'invalid_signature_format'`. The integration test only asserts `expect(res.status).toBe(401)` — both guard paths satisfy this assertion. The unit test asserts the specific `reason: 'missing_header'` and correctly fails.

**Documented in:** 06-VERIFICATION.md Mutation 3 row and Gap Assessment section.

**Fix:** Not fixed during this plan per D-19 (no source changes during mutation experiment). A future improvement: the integration test should also assert `res.body.reason === 'missing_header'` to catch this guard removal at the integration tier.

## Known Stubs

None — 06-VERIFICATION.md is a pure evidence document with no stubs or placeholders. All 5 table rows have actual failing test names.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. This plan writes only a documentation artifact (`06-VERIFICATION.md`) with zero source changes.

## Self-Check: PASSED

- [x] `06-VERIFICATION.md` exists at `.planning/phases/06-integration-tests-coverage-gate-negative-case-audit/06-VERIFICATION.md`
- [x] Commit 88ecdef exists in git history
- [x] `npm test` exits 0 with 135/135 passing
- [x] `git status` shows no source file modifications
- [x] `06-VERIFICATION.md` contains `## Guard Removal Demonstrations` section
- [x] `06-VERIFICATION.md` has 5 table rows with actual test names (not placeholders)
- [x] All 5 rows have `yes` in the Reverted column
