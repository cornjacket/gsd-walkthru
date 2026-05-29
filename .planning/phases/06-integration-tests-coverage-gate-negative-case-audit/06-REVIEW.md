---
phase: 06-integration-tests-coverage-gate-negative-case-audit
reviewed: 2026-05-29T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - src/providers/stripe.ts
  - src/providers/github.ts
  - src/providers/shopify.ts
  - src/middleware.ts
  - src/providers/stripe.test.ts
  - src/providers/github.test.ts
  - src/providers/shopify.test.ts
  - src/middleware.test.ts
  - tests/integration/stripe.test.ts
  - tests/integration/github.test.ts
  - tests/integration/shopify.test.ts
  - vitest.config.ts
  - .github/workflows/test.yml
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-05-29
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Phase 6 delivers integration tests for all three providers (Stripe, GitHub, Shopify),
a per-file >90% branch/statement/function/line coverage gate via `@vitest/coverage-v8`,
and a set of audit fixes resolving carry-over defects from Phases 4 and 5. The
security-critical surface — timing-safe comparison, HMAC computation, replay-window
enforcement, and header-guard ordering — is correctly implemented. No bypass
is possible through the optional `toleranceSeconds` path: the undefined guard at
`stripe.ts:139` throws a loud plain `Error` before the timestamp check executes,
so the replay window cannot be silently skipped.

Three warnings are raised. Two concern test quality at the integration tier and are
actionable without touching production code. One concerns a correctness inconsistency
in the Stripe provider's hex-validation regex. Two info items flag minor test hygiene
gaps. No blockers.

---

## Warnings

### WR-01: Integration-tier negative tests assert only HTTP status, not error reason — coverage gap applies to all three providers

**File:** `tests/integration/stripe.test.ts:74`, `tests/integration/github.test.ts:75`, `tests/integration/shopify.test.ts` (no missing-header test at all)
**Issue:** Every negative-case integration test (`tampered body`, `missing header`, `replay`) asserts only `expect(res.status).toBe(401)`. The documented Mutation 3 gap in `06-VERIFICATION.md` — that removing the `header === undefined` guard in `stripe.ts` goes undetected at the integration tier — applies equally to GitHub and Shopify. If the `header === undefined` guard were removed in any provider, the request falls through to the `typeof header !== 'string'` guard, which also returns HTTP 401 (with reason `invalid_signature_format`), and every integration test continues to pass. The integration tier therefore does not distinguish between `missing_header` and `invalid_signature_format`, nor between `signature_mismatch` and `timestamp_too_old`. The unit tier catches these distinctions, but the integration tier does not validate the full contract.

Additionally, GitHub and Shopify have no missing-header integration test at all (only Stripe has one), so even the HTTP-status-only assertion is absent for those two providers.

**Fix:**
```typescript
// In tests/integration/stripe.test.ts, github.test.ts, and shopify.test.ts
// For all negative-case tests, add reason assertion alongside status assertion:
it('missing Stripe-Signature header: returns 401 with reason missing_header', async () => {
  const res = await request(makeApp('rawBodyCapture'))
    .post('/webhook')
    .set('content-type', 'application/json')
    .send(SAMPLE_PAYLOAD);
  expect(res.status).toBe(401);
  expect(res.body.reason).toBe('missing_header'); // Add this
});

// Add equivalent missing-header tests to github.test.ts and shopify.test.ts.
```

---

### WR-02: `shopify.ts` branch coverage is 80% but the per-file gate exits 0 — gate enforcement is weaker than documented

**File:** `vitest.config.ts:11-17`, `src/providers/shopify.ts:99-110`
**Issue:** The `06-VERIFICATION.md` coverage table shows `shopify.ts` at 80% branch coverage (uncovered lines 100, 106-107 — the `|| ''` fallback for array-typed topic/webhookId headers with an empty first element). The `vitest.config.ts` sets `thresholds.perFile: true` with `branches: 90`. By the stated configuration, `shopify.ts` should fail the gate and cause `npm run test:coverage` to exit nonzero. Instead it exits 0. The VERIFICATION narrative incorrectly claims "all gated files at or above 90%." This indicates that `@vitest/coverage-v8`'s `perFile` threshold is not enforcing the configured 90% branch threshold for this file — likely because v8's branch instrumentation counts ternary-within-ternary `|| ''` sub-paths differently from istanbul's AST model. The effective branch gate is therefore weaker than the configuration implies, and the documented QUAL-03 assurance overstates coverage enforcement.

The uncovered branch paths are in post-auth metadata extraction (not in the HMAC comparison), so there is no direct security impact. However, the broken gate means future regressions in any branch may go undetected.

**Fix:**
Verify that `npm run test:coverage` actually exits nonzero when shopify.ts drops below 90% branch coverage by temporarily removing the array-shaped topic test and running coverage. If the gate does not fail, add a comment in `vitest.config.ts` documenting the v8 limitation and add a unit test for the empty-first-element array case:

```typescript
// In src/providers/shopify.test.ts — add:
it('array-shaped X-Shopify-Topic with empty first element → topic === "" (D-09 fallback)', () => {
  const sig = makeSignature(SAMPLE_BODY, SAMPLE_SECRET);
  const req = makeReq({ signature: sig, topic: ['', 'orders/update'], webhookId: SAMPLE_WEBHOOK_ID });
  const result = shopifyProvider.validate(req as any, SAMPLE_SECRET);
  expect((result as any).topic).toBe('');
});
// Repeat for webhookId.
```

---

### WR-03: Stripe `v1=` segment hex regex is lowercase-only; GitHub uses case-insensitive — inconsistency could cause spurious `invalid_signature_format`

**File:** `src/providers/stripe.ts:59`
**Issue:** `parseStripeSignature` validates each `v1=` segment with `/^[0-9a-f]+$/` (lowercase-only). GitHub's hex-tail validation uses `/^[0-9a-fA-F]+$/` (case-insensitive). Stripe's own SDK produces lowercase hex, and the documented spec uses lowercase, so this works in practice. However, if a proxy, load balancer, or future Stripe version delivers an uppercase `v1=` hex segment, the segment is silently dropped (not rejected with an error — it simply isn't pushed to `v1Segments`). If ALL `v1=` segments contain uppercase hex, `v1Segments` remains empty and `parseStripeSignature` returns `null`, producing `invalid_signature_format` for a valid signature. This is a latent correctness bug rather than a security bypass (an attacker cannot benefit from it — they cannot force uppercase normalization without controlling the secret).

**Fix:**
```typescript
// src/providers/stripe.ts line 59 — change to case-insensitive:
} else if (key === 'v1') {
  if (value && /^[0-9a-fA-F]+$/.test(value)) {  // was /^[0-9a-f]+$/
    v1Segments.push(value.toLowerCase());          // normalize before comparison
  }
}
```
The `Buffer.from(hexSegment, 'hex')` call is already case-insensitive, so normalizing to lowercase is defensive but not strictly required. The main fix is widening the regex.

---

## Info

### IN-01: `stripe.test.ts` leakage test is missing the `str`-level body assertion present in `github.test.ts` and `shopify.test.ts`

**File:** `src/providers/stripe.test.ts:281-299`
**Issue:** The leakage test asserts `expect(json).not.toContain(SAMPLE_BODY)` and `expect(str).not.toContain(SAMPLE_SECRET)`, but does not assert `expect(str).not.toContain(SAMPLE_BODY)`. The GitHub and Shopify leakage tests assert both `json` and `str` for the tampered bytes (D-15 P5 WR-02 and D-16). The stripe test also does not assert that `SAMPLE_SIGNATURE_VAL` is absent from either `json` or `str` (the signature contains the raw hex digest). The asymmetry was partially addressed in Plan 06-03 task 3 but `str`-level body/signature assertions were not added.

**Fix:**
```typescript
// src/providers/stripe.test.ts, inside the leakage test catch block:
expect(json).not.toContain(SAMPLE_SECRET);
expect(json).not.toContain(SAMPLE_BODY);
expect(str).not.toContain(SAMPLE_SECRET);
expect(str).not.toContain(SAMPLE_BODY);       // add this
// Optionally, also check the signature string is not leaked:
// expect(json).not.toContain(SAMPLE_SIGNATURE_VAL);
```

---

### IN-02: `wrongSig` in the multi-v1 rotation test is 66 hex chars (33 decoded bytes) rather than 64 chars (32 bytes); it fails for the wrong reason

**File:** `src/providers/stripe.test.ts:114`
**Issue:** The "multi-v1 rotation" test constructs a wrong signature as a 66-character hex string (`'deadbeef...0123'`). SHA-256 produces a 32-byte digest = 64 hex characters. A 66-character hex string decodes to 33 bytes. `timingSafeCompare(computed_32bytes, wrong_33bytes)` returns `false` due to length mismatch (line 17 of `compare.ts`), not content mismatch. The test passes and correctly validates that the loop continues to the second `v1=` segment, but the "wrong" signature fails because its decoded length is wrong, not because its content differs from the HMAC. A correct wrong signature would be exactly 64 hex chars with different content, making the test more faithful.

**Fix:**
```typescript
// src/providers/stripe.test.ts line 114 — use a 64-char hex string:
const wrongSig = 'deadbeefcafe012345678901234567890123456789012345678901234567890123';
//               ^--- 64 hex chars = 32 bytes (same length as SHA-256 digest, wrong content)
```

---

_Reviewed: 2026-05-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
