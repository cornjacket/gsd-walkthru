# SECURITY.md — Phase 6 Audit

**Phase:** 6 — Integration Tests, Coverage Gate & Negative-Case Audit
**Audited:** 2026-06-02
**ASVS Level:** default
**Verdict:** OPEN_THREATS — 1 BLOCKER

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-06-01-01 | Tampering | mitigate | CLOSED | vitest.config.ts:11 — `perFile: true` inside `test.coverage.thresholds`; all four metrics at 90 |
| T-06-01-02 | Repudiation | mitigate | CLOSED | `grep -rn "v8 ignore" src/` returns zero matches — confirmed by empty grep output |
| T-06-01-03 | EoP | accept | CLOSED | Accept disposition; documented rationale in 06-01-PLAN.md threat register (D-04: CI gate runs only on Node 22 × Express 5.x by design) |
| T-06-01-04 | DoS | accept | CLOSED | Accept disposition; documented rationale in 06-01-PLAN.md threat register (gate at 90% with headroom) |
| T-06-02-01 | Tampering | mitigate | CLOSED | All three integration test files use `createHmac` directly (non-tautological); tampered-body tests present in all three files (stripe.test.ts:57, github.test.ts:57, shopify.test.ts:59) |
| T-06-02-02 | Info Disclosure | accept | CLOSED | Accept disposition; documented rationale in 06-02-PLAN.md threat register (secrets prefixed `_integration_test_`) |
| T-06-02-03 | Spoofing | mitigate | CLOSED | shopify.test.ts:74-87 — hex-encoded digest sent as header, asserts 401 with reason `signature_mismatch` |
| T-06-02-04 | EoP | mitigate | CLOSED | All three integration files have exactly 2 `describe()` blocks; both `rawBodyCapture` and `captureRawBody` imported in each file (confirmed grep) |
| T-06-03-01 | Spoofing | mitigate | CLOSED | stripe.ts:91-103 — two-guard split: `header === undefined` → `missing_header`, `typeof header !== 'string'` → `invalid_signature_format`; stripe.test.ts:149-165 asserts reason `invalid_signature_format` AND `.not.toBe('missing_header')` |
| T-06-03-02 | Tampering | mitigate | CLOSED | middleware.ts:87-100 — `Number.isFinite` guard with message "Webhook tolerance must be a non-negative finite number"; rejects NaN/non-finite/negative at factory call time |
| T-06-03-03 | Tampering | mitigate | CLOSED | stripe.ts:54 — `/^-?\d+$/.test(value)` regex gate before `parseInt`; non-numeric suffixes (e.g. `xyz`) cause timestamp to remain `undefined` → `invalid_signature_format` |
| T-06-03-04 | Info Disclosure | mitigate | CLOSED | github.test.ts:267 — `expect(json).not.toContain('XXXXXX')` (actual tampered bytes); shopify.test.ts:300 — `expect(json).not.toContain('XXXXX')` (actual tampered bytes); defense-in-depth `str` assertions also present |
| T-06-03-05 | Tampering | mitigate | CLOSED | stripe.ts:79 — `toleranceSeconds?: number` (no `= 300`; parameter is optional but no default); middleware.ts:107 — `const tolerance = options.tolerance ?? 300` is the sole source of the 300s default |
| T-06-04-01 | Repudiation | mitigate | CLOSED | 06-VERIFICATION.md documents "git status clean — zero uncommitted modifications"; current `git status` confirms clean working tree |
| T-06-04-02 | Tampering | mitigate | **OPEN** | See details below |
| T-06-04-03 | DoS | accept | CLOSED | Accept disposition; documented rationale in 06-04-PLAN.md threat register (~50 seconds total mutation run time) |
| T-06-04-04 | Repudiation | mitigate | CLOSED | All 5 table rows in 06-VERIFICATION.md contain actual test names; `grep "EVIDENCE FROM TASK 2"` returns zero matches |

---

## OPEN THREATS (BLOCKERS)

### T-06-04-02 — Mutation 3 evidence table not updated after gap closure

**Category:** Tampering
**Declared mitigation:** Each of 5 mutations fails an INTEGRATION test; VERIFICATION.md table records tests/integration/ paths.

**Finding:** The VERIFICATION.md Guard Removal Demonstrations table row 3 (missing-header guard mutation) records Tier as `unit (integration gap noted)` and the `Failed Integration Test(s)` column describes the integration test as *passing* during the mutation. The threat requires the table to record a `tests/integration/` path as the failing tier for all 5 mutations.

The gap was subsequently fixed in code: `tests/integration/stripe.test.ts:80` now asserts `res.body.reason === 'missing_header'` (added during gap-closure WR-01), which means the mutation *would* now fail the integration test. However, the VERIFICATION.md evidence table was never updated to reflect this — the table still documents the pre-fix state.

The mitigation plan's stated evidence requirement ("VERIFICATION.md table records tests/integration/ paths") is not satisfied by the current table for Mutation 3. The table and the code are contradictory: the code has the fix; the evidence document still says the integration test passes during the mutation.

**Files searched:**
- `.planning/phases/06-integration-tests-coverage-gate-negative-case-audit/06-VERIFICATION.md` — table row 3, Tier column
- `tests/integration/stripe.test.ts:70-81` — now contains reason assertion (post-gap-closure state)

**Required resolution:** Update 06-VERIFICATION.md table row 3 to record Tier as `integration` and update `Failed Integration Test(s)` to name "Stripe integration — rawBodyCapture mode (BODY-01) > missing Stripe-Signature header: returns 401 with reason missing_header" (the test that now catches this mutation via the `res.body.reason === 'missing_header'` assertion at line 80). Alternatively, re-run the mutation experiment against the current codebase and record the output.

---

## Unregistered Flags

No new attack surface was detected in SUMMARY.md `## Threat Flags` sections that lacks a mapping to a threat ID in the register.

---

## Accepted Risks Log

| Threat ID | Rationale |
|-----------|-----------|
| T-06-01-03 | CI coverage gate runs only on Node 22 × Express 5.x by design (D-04); V8 coverage is Node-version-agnostic for this codebase; the 5 other matrix cells remain test-only |
| T-06-01-04 | Gate set at 90% with headroom; if gate trips, fix is a real test (D-05), not an ignore comment |
| T-06-02-02 | Test secrets are clearly prefixed `_integration_test_`; never logged by the library (P3 D-16); test runner does not emit them on pass |
| T-06-04-03 | Each `npm test` run during mutation experiment is ~5-10 seconds; 5 mutations ≈ 50 seconds total; acceptable for a one-shot verification pass |

---

## Coverage Gate Status Note

The independent verifier (06-VERIFICATION.md) detected and documented an SC2 BLOCKER (coverage: block placed at top level of defineConfig instead of inside test:) that was fixed in-phase. The current vitest.config.ts:7 correctly places `coverage:` inside `test:`. The gap-closure evidence (06-VERIFICATION.md lines 237-259) documents both directions of the gate test (below threshold → EXIT 1; at/above threshold → EXIT 0). This BLOCKER is resolved in the committed code.
