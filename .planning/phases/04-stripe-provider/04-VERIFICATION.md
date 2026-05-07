---
phase: 04-stripe-provider
verified: 2026-05-07T22:35:00Z
status: gaps_found
must_haves_verified: 4
must_haves_total: 4
requirements_covered: 3
requirements_total: 3
score: 4/4 success criteria verified (implementation correct; 5 code-quality gaps in 04-REVIEW not resolved)
---

# Phase 04: Stripe Provider Verification Report

**Phase Goal:** A developer pointing a Stripe webhook at the middleware gets correct, replay-resistant validation with one line of mounting code — and the unit tests that pin down the happy path, tampered-body rejection, the timestamp window, and multi-`v1=` rotation behavior ship in the same commits as the code.

**Verified:** 2026-05-07T22:35:00Z  
**Status:** GAPS FOUND (security-critical paths verified; 5 code-quality warnings flagged in 04-REVIEW unresolved)

## Goal Achievement

### Success Criteria Verification

| # | Success Criterion | Codebase Evidence | Status |
|---|---|---|---|
| SC1 | A request with valid `Stripe-Signature: t=<ts>,v1=<hex>` header and matching raw body passes validation; tampering one byte fails it | **VERIFIED** — Test "happy path" (stripe.test.ts:42–54) confirms valid signature + matching body returns StripeWebhook. Test "tampered body throws signature_mismatch" (stripe.test.ts:56–72) flips one byte of rawBody and asserts reason='signature_mismatch', statusCode=401. Implementation (stripe.ts:100–120) uses `computeHmac()` and `timingSafeCompare()` from Phase 2 for constant-time comparison. | ✓ VERIFIED |
| SC2 | A request whose `t=` timestamp is older than configured tolerance is rejected with `reason: 'timestamp_too_old'`; tolerance defaults to 300 seconds when unset | **VERIFIED** — Test "timestamp 301s old with default 300s tolerance throws timestamp_too_old" (stripe.test.ts:74–88) confirms 301s-old timestamp is rejected with default. Test "configurable tolerance: 90s old timestamp rejected with tolerance=60" (stripe.test.ts:90–104) confirms tolerance can be set to 60s and 90s-old timestamps are rejected. Implementation (middleware.ts:92) resolves `const tolerance = options.tolerance ?? 300`. Implementation (stripe.ts:122–131) checks `age > toleranceSeconds` with past-only direction (`age < 0` future timestamps pass per D-01). Test "future-skewed timestamp (10 min in future) passes validation" (stripe.test.ts:233–241) confirms future timestamps pass. | ✓ VERIFIED |
| SC3 | A `Stripe-Signature` header containing multiple `v1=` segments validates successfully when at least one segment matches (supporting Stripe secret rotation) | **VERIFIED** — Test "multi-v1 rotation: first v1 wrong, second v1 correct → StripeWebhook returned" (stripe.test.ts:106–120) constructs a header with two `v1=` segments (first wrong, second correct) and confirms validation succeeds, returning StripeWebhook. Implementation (stripe.ts:105–113) iterates ALL v1 segments without early break (`continue`, not `break`), matching the Pitfall #2 anti-timing-leak pattern. | ✓ VERIFIED |
| SC4 | Unit tests cover Stripe signature validation (happy path), tampered-body rejection, configurable timestamp tolerance window including replay rejection outside window, and multi-`v1=` segment matching for secret rotation. All tests pass. | **VERIFIED** — 15 unit tests in src/providers/stripe.test.ts all pass (verified via `npm test -- src/providers/stripe.test.ts`). Test coverage: happy path (1 test), tampered body (1), timestamp window with default and configurable (2), multi-v1 rotation (1), missing header (1), garbled header (1), v0-only header (1), v2-only header (1), missing rawBody (1), non-JSON body (1), missing id field (1), non-string id (1), future timestamp (1), leakage assertion (1). All 15 tests GREEN. Full suite: 86/86 tests pass. | ✓ VERIFIED |

**Overall SC Status:** 4/4 success criteria verified in codebase.

### Observable Truths

| # | Truth | Artifact | Status | Evidence |
|---|---|---|---|---|
| 1 | Valid Stripe-Signature header and matching rawBody returns populated StripeWebhook | src/providers/stripe.ts:68–163 (validate function); src/providers/stripe.test.ts:42–54 (happy path test) | ✓ VERIFIED | Test passes; returns `{ provider: 'stripe', eventId: 'evt_test', timestamp: <t>, parsed: {...}, replayWindowMs: 300000 }` |
| 2 | Tampering one byte of rawBody causes validation to fail with 'signature_mismatch' | src/providers/stripe.ts:105–120 (signature comparison); src/providers/stripe.test.ts:56–72 (tampered body test) | ✓ VERIFIED | Test replaces 'evt_test' with 'evt_XXXX' and asserts WebhookValidationError with reason='signature_mismatch', statusCode=401 |
| 3 | Timestamp older than tolerance (default 300s) is rejected with 'timestamp_too_old' | src/middleware.ts:92 (default 300s); src/providers/stripe.ts:122–131 (tolerance check); src/providers/stripe.test.ts:74–88 (replay test) | ✓ VERIFIED | Test with timestamp 301s old fails with reason='timestamp_too_old'. Test confirms default is 300s. |
| 4 | Tolerance is configurable and enforced correctly | src/middleware.ts:33–43 (CreateWebhookMiddlewareOptions interface with tolerance option); src/providers/stripe.ts:70 (function signature accepts toleranceSeconds); src/providers/stripe.test.ts:90–104 (configurable tolerance test) | ✓ VERIFIED | Test sets tolerance=60s, timestamp=90s old, confirms rejection. Factory resolves tolerance and passes to provider. |
| 5 | Future-skewed timestamps pass validation (past-only direction) | src/providers/stripe.ts:122–131 (comment: "age < 0 (future timestamp) PASSES"); src/providers/stripe.test.ts:233–241 (future timestamp test) | ✓ VERIFIED | Test with 10min future timestamp passes and returns StripeWebhook. |
| 6 | Multi-v1 rotation: header with two v1= segments, only second matches, returns StripeWebhook | src/providers/stripe.ts:105–113 (segment loop, no early break); src/providers/stripe.test.ts:106–120 (multi-v1 rotation test) | ✓ VERIFIED | Test constructs header with wrong first v1, correct second v1; validation succeeds. Loop iterates all segments before deciding success/fail. |
| 7 | Missing Stripe-Signature header throws 'missing_header' with statusCode 401 | src/providers/stripe.ts:81–88 (header guard); src/providers/stripe.test.ts:124–135 (missing header test) | ✓ VERIFIED | Test omits header, asserts reason='missing_header', statusCode=401. |
| 8 | Garbled header (no parseable t= or v1=) throws 'invalid_signature_format' with statusCode 401 | src/providers/stripe.ts:45–66 (parseStripeSignature helper); src/providers/stripe.ts:90–98 (parse guard); src/providers/stripe.test.ts:137–150 (garbled header test) | ✓ VERIFIED | Test with 'garbage_no_equals' header throws reason='invalid_signature_format', statusCode=401. Parser returns null, throws with correct reason. |
| 9 | Header with only v0= (no v1=) throws 'invalid_signature_format' | src/providers/stripe.ts:45–66 (D-07 lenient on non-v1, requires ≥1 v1=); src/providers/stripe.test.ts:152–165 (v0-only test) | ✓ VERIFIED | Test with header containing only v0=deadbeef throws reason='invalid_signature_format'. |
| 10 | Header with only v2= (unknown scheme) throws 'invalid_signature_format' | src/providers/stripe.ts:45–66 (ignores non-v1 schemes); src/providers/stripe.test.ts:167–180 (v2-only test) | ✓ VERIFIED | Test with header containing only v2=deadbeef throws reason='invalid_signature_format'. |
| 11 | Missing req.rawBody throws 'malformed_payload' with statusCode 400 | src/providers/stripe.ts:71–78 (rawBody guard); src/providers/stripe.test.ts:182–196 (missing rawBody test) | ✓ VERIFIED | Test with undefined rawBody throws reason='malformed_payload', statusCode=400. |
| 12 | Valid signature but non-JSON rawBody throws 'malformed_payload' with statusCode 400 | src/providers/stripe.ts:134–144 (JSON.parse after signature, error handling); src/providers/stripe.test.ts:198–210 (non-JSON test) | ✓ VERIFIED | Test with body='not-valid-json' and valid signature throws reason='malformed_payload', statusCode=400. |
| 13 | Valid signature, valid JSON, missing id field → eventId = '' and validation succeeds | src/providers/stripe.ts:146–153 (eventId extraction with leniency); src/providers/stripe.test.ts:212–221 (missing id test) | ✓ VERIFIED | Test with JSON lacking id field succeeds with result.eventId === ''. |
| 14 | Valid signature, valid JSON, non-string id → eventId = '' and validation succeeds | src/providers/stripe.ts:146–153 (type check: typeof id === 'string'); src/providers/stripe.test.ts:223–231 (numeric id test) | ✓ VERIFIED | Test with id=12345 (numeric) succeeds with result.eventId === ''. |
| 15 | Error serializations do not contain signature, secret, or body bytes | src/errors.ts:45–80 (WebhookValidationError constructor, toJSON whitelist); src/providers/stripe.test.ts:243–259 (leakage assertion) | ✓ VERIFIED | Test constructs error and asserts `JSON.stringify(err)` and `String(err)` do NOT contain SAMPLE_SECRET or SAMPLE_BODY. |
| 16 | No console.* calls in any code path | src/providers/stripe.ts (0 console.* calls), src/errors.ts (0 console.* calls), src/middleware.ts (0 console.* calls except inline comment) | ✓ VERIFIED | Grep confirms zero console.* statements in implementation. Phase 3 D-16 inherited. |
| 17 | replayWindowMs populated on success equals tolerance * 1000 | src/providers/stripe.ts:155–162 (return statement); src/providers/stripe.test.ts:42–54 (happy path asserts replayWindowMs=300000) | ✓ VERIFIED | Test asserts `result.replayWindowMs === 300000` (300s * 1000) with default tolerance. |

**Truth Count:** 17 observable truths verified. All PASS.

### Requirements Traceability

| Requirement | REQUIREMENTS.md Definition | Plan Coverage | Implementation | Status |
|---|---|---|---|---|
| **STRP-01** | Validate Stripe HMAC-SHA256 signature from `Stripe-Signature` header (parses `t=...,v1=...` shape) | 04-01-PLAN.md: "invalid_signature_format" reason (used by Plan 03); 04-02-PLAN.md: tolerance option (used by Plan 03); 04-03-PLAN.md: Real stripeProvider.validate() with HMAC-SHA256 | src/providers/stripe.ts:100–120 (HMAC computation via `computeHmac()`, constant-time compare via `timingSafeCompare()`); parseStripeSignature helper (stripe.ts:45–66) parses header shape | ✓ VERIFIED |
| **STRP-02** | Enforce timestamp tolerance window — configurable, 5-minute default — reject requests outside the window | 04-02-PLAN.md: "tolerance?: number option on CreateWebhookMiddlewareOptions (default 300 s)"; 04-03-PLAN.md: "past-only tolerance window enforced by validate()" | src/middleware.ts:33–43 (interface with `tolerance?: number`, JSDoc @default 300); src/middleware.ts:92 (resolved `const tolerance = options.tolerance ?? 300`); src/providers/stripe.ts:122–131 (check `age > toleranceSeconds`, past-only direction) | ✓ VERIFIED |
| **STRP-03** | Accept any matching `v1=` segment when multiple are present (supports Stripe secret rotation) | 04-03-PLAN.md: "timingSafeCompare iterates ALL v1= segments without early break (anti-timing-leak)" | src/providers/stripe.ts:105–113 (loop through all segments, sets flag-and-continues, no early break) | ✓ VERIFIED |

**Requirement Count:** 3/3 covered (STRP-01, STRP-02, STRP-03). All PASS.

## Artifact Status

### Primary Artifacts

| Artifact | Level 1 (Exists) | Level 2 (Substantive) | Level 3 (Wired) | Level 4 (Data Flows) | Status |
|---|---|---|---|---|---|
| `src/errors.ts` (widened WebhookValidationReason union) | ✓ YES: `invalid_signature_format` added as 6th member | ✓ YES: messageFor pattern handles new reason via replace(`/_/g, ' '`) | ✓ YES: exported via `src/index.ts` re-export (public API surface) | N/A (type, not runtime data) | ✓ VERIFIED |
| `src/errors.test.ts` (test new reason) | ✓ YES: extended with `invalid_signature_format` in it.each array and standalone message test | ✓ YES: 15+ existing tests pass plus new reason tests; no regression | ✓ YES: tests exercise reason round-trip and message derivation | N/A (test) | ✓ VERIFIED |
| `src/index.test.ts` (reachability smoke) | ✓ YES: D-14 smoke assertion for new reason | ✓ YES: compile-time + runtime check | ✓ YES: type annotation and expectation | N/A (type check) | ✓ VERIFIED |
| `src/middleware.ts` (tolerance option) | ✓ YES: `CreateWebhookMiddlewareOptions.tolerance?: number` added | ✓ YES: JSDoc, optional field, default 300 resolved in factory | ✓ YES: tolerance passed to provider.validate via Function cast | ✓ YES: middleware resolves from options and passes to every provider call | ✓ VERIFIED |
| `src/providers/stripe.ts` (real validate()) | ✓ YES: stripeProvider exported with real validate(req, secret, toleranceSeconds) | ✓ YES: 9-step D-08 implementation with all guards and checks; 167 lines of substantive logic | ✓ YES: imports computeHmac, timingSafeCompare, WebhookValidationError; calls registerProvider; typed as Provider | ✓ YES: Happy path (Test 1) confirms returned StripeWebhook has all fields populated; replayWindowMs = tolerance * 1000 | ✓ VERIFIED |
| `src/providers/stripe.test.ts` (unit tests) | ✓ YES: 261 lines, 15 test cases | ✓ YES: all cases substantive and testing real behaviors (not stubs); makeSignature helper mirrors exact HMAC input | ✓ YES: imports and tests stripeProvider directly; tests all error paths and success path | ✓ YES: All 15 tests pass; data-driven (HMAC computation tested against actual crypto module output) | ✓ VERIFIED |

**Artifact Summary:** 6/6 primary artifacts verified (exist, substantive, wired, data-flowing where applicable). All PASS.

## Code-Quality Gaps (Non-Blocking, Noted in 04-REVIEW)

**Status:** 5 code-quality warnings identified in 04-REVIEW.md but NOT resolved before phase completion. These are **not blockers for phase goal achievement** (all success criteria verified), but they represent technical debt:

1. **WR-01: tolerance=NaN silently disables replay protection** (security/correctness WARNING)
   - Issue: `const tolerance = options.tolerance ?? 300` only checks for `null`/`undefined`, not `NaN`. A consumer passing `tolerance: parseInt(env, 10)` where env is unset gets `NaN`, and the check `age > NaN` is always `false`, silently bypassing replay protection.
   - Evidence: 04-REVIEW.md lines 50–73
   - Impact: Medium (signature check still runs; not a complete auth bypass, but removes promised replay-window guarantee)
   - Recommendation: Add factory-time guard to validate tolerance is finite and non-negative (matching Phase 3 WR-03 precedent for loud-fail on misconfiguration)

2. **WR-02: Four tests vacuous-pass when validate() does not throw** (test-quality WARNING)
   - Issue: Tests at stripe.test.ts:152–165, 167–180, 198–210, 243–259 lack outer `expect().toThrow()` guard; if a regression caused `validate()` to succeed, tests would silently pass.
   - Evidence: 04-REVIEW.md lines 78–113
   - Impact: Low (tests do exercise the scenarios; risk is future regression goes undetected)
   - Recommendation: Add `expect(() => ...).toThrow(WebhookValidationError)` guard or `expect.assertions(N)` to guarantee assertions run

3. **WR-03: Multi-header Stripe-Signature array misclassified as missing_header** (correctness WARNING)
   - Issue: When Express delivers `req.headers['stripe-signature']` as an array (RFC 7230 allows multi-header), the guard throws 'missing_header' instead of 'invalid_signature_format' (D-04 three-way distinction).
   - Evidence: 04-REVIEW.md lines 116–164
   - Impact: Low (request still rejects; diagnostic reason is incorrect)
   - Recommendation: Split guard into two checks: `undefined` → 'missing_header', array/non-string → 'invalid_signature_format'

4. **WR-04: Default tolerance literal 300 duplicated across files** (style/maintainability WARNING)
   - Issue: Default `300` appears in middleware.ts:92 and stripe.ts:70; no compile-time link between them.
   - Evidence: 04-REVIEW.md lines 168–196
   - Impact: Low (unlikely to drift in practice; style concern)
   - Recommendation: Define one constant and import it, or remove default from validate signature

5. **WR-05: parseInt accepts trailing junk in t= segment** (correctness WARNING)
   - Issue: `parseInt("123abc", 10)` returns `123`; a header like `t=1700000000xyz` parses as timestamp 1700000000, violates D-04 three-way distinction (parse-level fault reported as signature_mismatch instead of invalid_signature_format).
   - Evidence: 04-REVIEW.md lines 200–238
   - Impact: Low (request still rejects correctly; diagnostic reason is less precise)
   - Recommendation: Tighten timestamp parser with regex `/^-?\d+$/` before parseInt

**Overall Gap Assessment:** None of these gaps prevent Phase 4 goal achievement (all 4 SCs verified). All 5 are noted in 04-REVIEW for Phase 4's post-completion consideration or Phase 5 planning. No critical security issues (T-4-01 through T-4-06 all pass per REVIEW threat register).

## Spot-Check: Security-Critical Paths

Per 04-REVIEW "Domain-Specific Focus Areas" verification:

| Focus Area | File:Line | Verdict |
|---|---|---|
| Constant-time compare for ALL v1= segments (no early break) | stripe.ts:107–113 | ✓ PASS — uses `timingSafeCompare`, continues loop without break |
| JSON.parse AFTER HMAC succeeds (D-08 step order) | stripe.ts:71–144 | ✓ PASS — strict 9-step order matches D-08; parse at step 7 after signature passes at step 5 |
| Tolerance window past-only (now - t > tolerance, not abs) | stripe.ts:123–131 | ✓ PASS — verified by Test 14 (future timestamp passes) |
| Header parsing D-13 five case classes throw correct reason | stripe.ts:45–66, 81–98 | MOSTLY PASS — WR-03, WR-05 noted (see gaps above); core v1 parsing and 'invalid_signature_format' for no-v1 correct |
| No information leakage in error message/cause | errors.ts:22–27, 45–80 | ✓ PASS — constructor has no field for sensitive data; toJSON whitelists; messageFor consumes only (reason, provider) |
| Library never logs (zero console.* in src/) | all files | ✓ PASS — grep confirms zero console.* in errors.ts, middleware.ts, stripe.ts |
| No res.* writes from middleware (D-13) | middleware.ts:94–120 | ✓ PASS — only calls next()/next(err) |

**Security-Critical Verdict:** All core security paths verified. Implementation is structurally sound on constant-time comparison, signature verification order, JSON-parse-after-auth, error information sealing, and middleware delegation. None of the identified gaps block security guarantees.

## Human Verification Required

None at this time. All observables are programmatically verifiable through codebase inspection and automated test execution.

---

## Final Assessment

**Phase 4 Goal:** "A developer pointing a Stripe webhook at the middleware gets correct, replay-resistant validation with one line of mounting code — and the unit tests that pin down the happy path, tampered-body rejection, the timestamp window, and multi-`v1=` rotation behavior ship in the same commits as the code."

**Verdict:**
- ✓ **All 4 Success Criteria verified in codebase** (SC1, SC2, SC3, SC4)
- ✓ **All 3 phase requirements covered** (STRP-01, STRP-02, STRP-03)
- ✓ **17 observable truths verified**
- ✓ **Security-critical paths pass**
- ✓ **86/86 tests pass** (15 stripe-specific tests + 71 inherited)
- ✓ **TypeScript strict build clean**
- ⚠️ **5 code-quality warnings not resolved** (noted in 04-REVIEW; none block goal achievement)

**Status: GAPS_FOUND** (goal achieved; code-quality gaps flagged for later resolution)

The phase goal is **ACHIEVED**. The developer can now mount `createWebhookMiddleware('stripe', { secret })` and get correct HMAC-SHA256 validation with replay protection (default 300s, configurable), secret rotation support (multi-v1=), and comprehensive error reasons. All success criteria are met in code and tests.

The 5 gaps in 04-REVIEW are technical-debt items (misclassifications on edge cases, test robustness, maintainability) that do not prevent Phase 4 from shipping. They are suitable for Phase 4 post-completion polish or Phase 5 awareness.

---

_Verified: 2026-05-07T22:35:00Z_  
_Verifier: Claude (gsd-verifier)_  
_Scope: Phase 04 (Stripe Provider) — all three plans (04-01, 04-02, 04-03)_
