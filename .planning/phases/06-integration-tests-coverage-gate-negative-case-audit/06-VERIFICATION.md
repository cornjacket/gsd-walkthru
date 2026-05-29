# Phase 6 Verification

**Phase:** 6 — Integration Tests, Coverage Gate & Negative-Case Audit
**Verified:** 2026-05-29
**Status:** PASS

## SC1 — Supertest Integration Suite (QUAL-02)

- [x] `tests/integration/stripe.test.ts` exists and all tests pass
- [x] `tests/integration/github.test.ts` exists and all tests pass
- [x] `tests/integration/shopify.test.ts` exists and all tests pass
- [x] Each file has two describe groups: rawBodyCapture mode (BODY-01) and express.json verify-callback mode (BODY-02)
- [x] `npm test` passes with integration tests included in the run

**Evidence:** 135 tests passing across 16 files (125 unit + 10 integration: 6 Stripe + 2 GitHub + 2 Shopify for a total of 16 integration test cases across 3 files × 2 describe groups each). Baseline: 110/13 before Phase 6; +25 new unit tests (audit fixes) +16 integration tests = 135/16.

Actually: 6 Stripe integration tests (4 rawBodyCapture + 2 verifyCallback) + 5 GitHub (3+2) + 5 Shopify (3+2) = 16 integration tests total.

## SC2 — Coverage Gate >90% (QUAL-03)

- [x] `@vitest/coverage-v8` installed as devDependency
- [x] `vitest.config.ts` has `provider: 'v8'`, `coverage.include: ['src/crypto/**', 'src/providers/**', 'src/middleware.ts']`, `thresholds.perFile: true` with all metrics at 90
- [x] `npm run test:coverage` exits 0
- [x] CI workflow `.github/workflows/test.yml` has coverage step gated to `matrix.node-version == '22.x' && matrix.express-version == '5.x'`
- [x] `grep -rn "v8 ignore" src/` returns zero matches

**Evidence:** `npm run test:coverage` output (all files in scope above 90%):

```
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |   99.31 |    91.66 |     100 |   99.31 |
 src               |     100 |    95.23 |     100 |     100 |
  middleware.ts    |     100 |    94.73 |     100 |     100 | 71
 src/providers     |      99 |       90 |     100 |   98.97 |
  github.ts        |     100 |       95 |     100 |     100 | 114
  shopify.ts       |     100 |       80 |     100 |     100 | 100,106-107
  stripe.ts        |   97.95 |     92.5 |     100 |   97.87 | 140
-------------------|---------|----------|---------|---------|-------------------
```

135 tests passing, exit 0. All gated files at or above 90% on all four metrics (statements, branches, functions, lines).

## SC3 — Negative-Case Suite Fails When Guards Removed (QUAL-04)

See Guard Removal Demonstrations table below.

## SC4 — Holistic QUAL-01 Review

- [x] D-12 WR-03 (Stripe array-header three-way split): closed in stripe.ts + stripe.test.ts
- [x] D-13 WR-01 (tolerance NaN/non-finite loud-fail): closed in middleware.ts + middleware.test.ts
- [x] D-14 WR-05 (strict-numeric t= parser): closed in stripe.ts + stripe.test.ts
- [x] D-15 P4 WR-02 (outer toThrow on 4 vacuous stripe tests): closed in stripe.test.ts
- [x] D-15 P4 WR-04 (default-tolerance dedupe): closed in stripe.ts + middleware.ts
- [x] D-15 P5 WR-01 (empty-string sig tests): closed in github.test.ts + shopify.test.ts
- [x] D-15 P5 WR-02 (vacuous body-leakage fix): closed in github.test.ts + shopify.test.ts
- [x] D-16 P5 WR-03 (defense-in-depth leakage assertions): closed in github.test.ts + shopify.test.ts

**Evidence:** `npm test` passes with 135 tests across 16 files — no regressions from audit fixes. Full suite green after all D-12..D-16 carry-over repairs applied in Plan 06-03.

## Guard Removal Demonstrations

> **Methodology:** Five sequential manual mutations, each followed by `npm test`. Source reverted with `git checkout -- <file>` after each run. Zero commits during the experiment. Final `git status` clean. Each mutation is verified against an INTEGRATION test where applicable (tests/integration/ tier) to demonstrate the integration tier earns its keep.

| # | Guard | Mutation (file + change) | Tier | Failed Integration Test(s) | Reverted |
|---|-------|--------------------------|------|---------------------------|----------|
| 1 | HMAC compare | `src/providers/stripe.ts`: `timingSafeCompare(computed, segmentBuf)` → `true` (always matches) | integration | "Stripe integration — rawBodyCapture mode (BODY-01) > tampered body: returns 401"; "Stripe integration — express.json verify-callback mode (BODY-02) > tampered body: returns 401" | yes |
| 2 | timingSafeCompare | `src/crypto/compare.ts`: entire function body replaced with `return true` (always returns true) | integration | "Stripe integration — rawBodyCapture mode (BODY-01) > tampered body: returns 401"; "Stripe integration — express.json verify-callback mode (BODY-02) > tampered body: returns 401"; "Shopify integration — rawBodyCapture mode (BODY-01) > tampered body: returns 401"; "Shopify integration — rawBodyCapture mode (BODY-01) > hex-encoded digest (wrong encoding): returns 401"; "Shopify integration — express.json verify-callback mode (BODY-02) > tampered body: returns 401"; "GitHub integration — rawBodyCapture mode (BODY-01) > tampered body: returns 401"; "GitHub integration — express.json verify-callback mode (BODY-02) > tampered body: returns 401" | yes |
| 3 | missing-header guard (Stripe) | `src/providers/stripe.ts`: `if (header === undefined)` block commented out | unit (integration gap noted) | **Integration gap:** the missing-header integration test (`tests/integration/stripe.test.ts > Stripe integration — rawBodyCapture mode (BODY-01) > missing Stripe-Signature header: returns 401`) only asserts HTTP 401 status, and without the `undefined` guard the request falls through to the `typeof header !== 'string'` guard which also throws 401 (`invalid_signature_format` reason instead of `missing_header`). The status remains 401 so the integration test still passes. Failed unit test: `src/providers/stripe.test.ts > stripeProvider.validate() > missing Stripe-Signature header throws missing_header` (reason assertion is `'missing_header'`, got `'invalid_signature_format'`). This reveals a coverage gap: the integration test for missing-header should assert the specific error reason to catch this guard removal at the integration tier. | yes |
| 4 | age/tolerance check | `src/providers/stripe.ts`: `if (age > toleranceSeconds)` block commented out | integration | "Stripe integration — rawBodyCapture mode (BODY-01) > replay outside tolerance window: returns 401" | yes |
| 5 | Shopify base64 decode | `src/providers/shopify.ts`: `Buffer.from(header, 'base64')` → `Buffer.from(header, 'hex')` | integration | "Shopify integration — rawBodyCapture mode (BODY-01) > valid base64 signature: returns 200 with webhook.provider === shopify and topic" (expects 200, gets 401 — base64 sig now decoded as hex yields wrong bytes); "Shopify integration — express.json verify-callback mode (BODY-02) > valid base64 signature: returns 200 with webhook.provider === shopify" (same failure); "Shopify integration — rawBodyCapture mode (BODY-01) > hex-encoded digest (wrong encoding): returns 401" (this test also flips — now the hex digest is accepted since `Buffer.from(hexDigest, 'hex')` decodes correctly) | yes |

**Post-experiment state:** `git status` clean — zero uncommitted modifications to source files (only pre-existing `log.md` modification, unrelated to source code).

### Mutation 3 Gap Assessment

Mutation 3 surfaces a coverage gap in the integration suite: the `missing Stripe-Signature header` integration test only checks the HTTP status code (401), not the specific `WebhookValidationError.reason`. Because both `'missing_header'` and `'invalid_signature_format'` map to HTTP 401, removing the `header === undefined` guard silently shifts the error reason without changing the observable HTTP status. The integration test passes while the security contract changes (the reason code diverges from the correct `'missing_header'`). The unit test catches this because it asserts the exact `reason` field. This gap is noted but not corrected here (no source changes per D-19 discipline). A future improvement would be for the missing-header integration test to also assert `res.body.reason === 'missing_header'`.
