---
phase: 05-github-shopify-providers
plan: 02
subsystem: api
tags: [shopify, hmac, sha256, base64, webhook, signature-validation, provider]

# Dependency graph
requires:
  - phase: 02-crypto-core-error-class
    provides: "computeHmac(), timingSafeCompare(), WebhookValidationError"
  - phase: 03-body-handling-public-api-surface
    provides: "req.rawBody Buffer, ShopifyWebhook type co-located, registerProvider registry, parsed: unknown (WR-05)"
  - phase: 04-stripe-provider
    provides: "WebhookValidationReason union locked at 6 members incl. 'invalid_signature_format'; CreateWebhookMiddlewareOptions.tolerance option ignored by Shopify (no provider-signed timestamp)"
provides:
  - "Real shopifyProvider.validate() — HMAC-SHA256 over rawBody Buffer-direct, base64-decoded header compare"
  - "11-case unit test suite covering SC3 (base64 valid + hex-as-base64 reject), SC4 (topic + webhookId surfaced), SC5 binding"
  - "Day-one fix of Phase 4 WR-03 (auth-header three-way split) and Phase 4 WR-02 (mandatory outer-toThrow guard)"
  - "Phase 5 requirements SHOP-01, SHOP-02 satisfied"
affects:
  - phase-06-integration-tests
  - phase-07-docs-example

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-13 step order: rawBody guard → header three-way split → HMAC → base64-decode + timingSafeCompare → metadata read → JSON.parse → return"
    - "D-07 Buffer-direct HMAC: computeHmac(req.rawBody, secret, 'sha256') — NO .toString('utf8') round-trip; divergence from Phase 4 stripe.ts which uses string concat for `${t}.${body}`"
    - "D-06 loose base64 decode: Buffer.from(header, 'base64') with NO length pre-check, NO alphabet regex; the timingSafeCompare length-mismatch path (P2 D-09) is the auth gate"
    - "D-05 hex-as-base64 rejects naturally: 64-char hex in a base64-decoded buffer yields ~48 bytes, mismatches the 32-byte computed digest, returns false → 'signature_mismatch'"
    - "D-10 three-way auth-header split: undefined → 'missing_header'; array → 'invalid_signature_format'; string → continue (Phase 4 WR-03 fix from day one)"
    - "D-08/D-09 metadata array-collapse: missing → ''; array → [0] || '' (post-auth normalization)"
    - "D-11 eventId === webhookId; D-12 timestamp = Math.floor(Date.now()/1000) (receipt time, NOT provider-signed)"
    - "D-14 mandatory two-step test shape: outer expect(() => ...).toThrow(WebhookValidationError) THEN try/catch introspection — Phase 4 WR-02 fix from day one"

key-files:
  created:
    - src/providers/shopify.test.ts
  modified:
    - src/providers/shopify.ts

key-decisions:
  - "D-05 honored: hex-as-base64 rejects via the timingSafeCompare length-mismatch path → 'signature_mismatch'; the WebhookValidationReason union is NOT widened with 'invalid_encoding'"
  - "D-06 honored: loose base64 decode — no length-44 pre-check, no /^[A-Za-z0-9+/]+={0,2}$/ regex; trust the byte-compare gate"
  - "D-07 honored: HMAC computed over req.rawBody Buffer DIRECTLY (no UTF-8 round-trip) — divergence from Phase 4 stripe.ts:103 string-concat pattern"
  - "D-10 honored from day one: array-shaped X-Shopify-Hmac-Sha256 → 'invalid_signature_format' (NOT folded into 'missing_header' as Phase 4 stripe.ts:82 does — that is the WR-03 defect Phase 6 audit owns for stripe.ts)"
  - "D-13 step 7 honored: JSON.parse runs ONLY after HMAC verification passes — only authenticated bytes reach the parser"
  - "D-14 honored from day one: every error-case test wraps the throw assertion in expect(() => ...).toThrow(WebhookValidationError) BEFORE try/catch introspection — 7 outer guards present (the 4 success-path tests do not need them)"
  - "D-16 honored: src/errors.ts byte-for-byte unchanged (verified via git diff returning empty); zero touches to middleware, index, types, registry, stripe, github"
  - "D-17 honored: only src/providers/shopify.ts modified and src/providers/shopify.test.ts created"

patterns-established:
  - "Buffer-direct HMAC at the provider boundary when the wire format is bare (no prefix/timestamp segment)"
  - "Defense-in-depth `.reason !== 'invalid_encoding'` assertion in the hex-as-base64 test catches any future union-widening regression"
  - "Defense-in-depth `.reason !== 'missing_header'` assertion in the array-header test catches any future fold-back regression (the WR-03 shape)"

requirements-completed: [SHOP-01, SHOP-02]

# Metrics
duration: ~5 min
completed: 2026-05-08
---

# Phase 5 Plan 02: Shopify Provider Implementation Summary

**Shopify HMAC-SHA256 webhook validator with base64-decoded header compare, naturally-rejecting hex-as-base64 path, and 11-case test suite that locks down Phase 4 WR-02 and WR-03 from day one.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-08T17:53:00Z
- **Completed:** 2026-05-08T17:55:30Z
- **Tasks:** 2
- **Files modified:** 1 (`src/providers/shopify.ts`)
- **Files created:** 1 (`src/providers/shopify.test.ts`)

## Accomplishments

- Replaced the Phase 3 throwing stub at `src/providers/shopify.ts` with the real 8-step pipeline (D-13): rawBody guard → auth-header three-way split (D-10) → Buffer-direct HMAC (D-07) → loose base64 decode + `timingSafeCompare` (D-06, D-05 length-mismatch) → metadata array-collapse for both `X-Shopify-Topic` and `X-Shopify-Webhook-Id` (D-08, D-09) → JSON.parse-after-success (D-13 step 7) → ShopifyWebhook build with `eventId === webhookId` (D-11) and receipt timestamp (D-12).
- Changed `const shopifyProvider` → `export const shopifyProvider` (the only API-surface delta) so the co-located test file can import it directly. The `registerProvider('shopify', shopifyProvider)` self-registration call at the file bottom is preserved (Phase 3 D-03).
- Created `src/providers/shopify.test.ts` (260 lines) with 11 `it(...)` blocks covering CONTEXT D-14 Shopify scope: happy path, tampered body, hex-as-base64 (the SHOP-01 critical case), missing/array auth header (D-10), missing rawBody, non-JSON authenticated body, missing/array metadata, and a leakage assertion. Test fixtures use `node:crypto`'s `createHmac` directly so the suite is not tautological with the implementation.
- Every error-case test (7 of 11) carries the mandatory outer `expect(() => shopifyProvider.validate(...)).toThrow(WebhookValidationError)` guard BEFORE the `try/catch` introspection block — the D-14 fix of the Phase 4 WR-02 vacuous-pass shape.
- The hex-as-base64 test asserts BOTH `'signature_mismatch'` AND `.reason !== 'invalid_encoding' as any` — defense-in-depth so a future union-widening regression cannot silently re-classify the case.
- The array-header test asserts BOTH `'invalid_signature_format'` AND `.reason !== 'missing_header'` — pinning down that Phase 5 does NOT replicate the Phase 4 WR-03 fold (`stripe.ts:82`).
- Full suite went from 86 → **97 tests green** across **12 test files**; TypeScript strict build clean (`npx tsc --noEmit -p tsconfig.json` exit 0); zero `console.*` calls in the new code.

## Coverage of Requirements & Success Criteria

| Requirement / SC | How met |
|------------------|---------|
| **SHOP-01** (base64 HMAC + reject hex-as-base64) | Step 4 (Buffer-direct HMAC) + Step 5 (`Buffer.from(header, 'base64')` + `timingSafeCompare`). Test 1 (happy path) + Test 2 (tampered) + Test 3 (hex-as-base64 → `'signature_mismatch'`). |
| **SHOP-02** (`req.webhook.topic` + `req.webhook.webhookId` surfaced) | Step 6 (metadata read with array-collapse) + Step 8 (ShopifyWebhook build). Test 1 (both fields populated) + Test 8 (missing topic → `''`) + Test 9 (missing webhookId → `''`, eventId → `''`) + Test 10 (array topic → `firstValue`). |
| **SC3** (Shopify base64 valid passes; hex rejected) | Test 1 + Test 2 + Test 3. |
| **SC4** (provider-specific metadata exposed) | Step 6 + Step 8; Tests 1, 8, 9, 10. |
| **SC5** (Shopify binding) | Test 1 (asserts `result.provider === 'shopify'`, `eventId === webhookId`, `topic`, `webhookId`, `parsed`, `timestamp`). |

## Decision References Honored

| Decision | Realization |
|----------|-------------|
| **D-05** (hex-as-base64 → `'signature_mismatch'`, NO `'invalid_encoding'` widening) | Step 5 length-mismatch path; Test 3 with explicit `.not.toBe('invalid_encoding' as any)` guard; `grep -c 'invalid_encoding' src/providers/shopify.ts` returns 0; `git diff src/errors.ts` returns empty. |
| **D-06** (loose base64 decode — no length, no alphabet pre-check) | `Buffer.from(header, 'base64')` directly; no regex literal in `shopify.ts`. |
| **D-07** (Buffer-direct HMAC) | `computeHmac(req.rawBody, secret, 'sha256')` exactly once; no `.toString('utf8')` on the HMAC input; no prefix string. |
| **D-08** (missing metadata → `''`) | Step 6 fall-through: `typeof topicRaw === 'string' ? topicRaw : ''`. Tests 8 + 9. |
| **D-09** (array metadata → `[0] || ''`) | Step 6 `Array.isArray(...)` branch. Test 10. |
| **D-10** (auth-header three-way split — WR-03 day-one fix) | Step 2: `header === undefined → 'missing_header'`; `typeof header !== 'string' → 'invalid_signature_format'`; string → continue. Tests 4 + 5; Test 5 also asserts `.reason !== 'missing_header'`. |
| **D-11** (`eventId === webhookId`) | Step 8: `eventId: webhookId,`. Tests 1, 9. |
| **D-12** (`timestamp = floor(Date.now()/1000)`) | Step 8. Test 1 brackets the value with `before`/`after` floor-of-now. |
| **D-13** (8-step pipeline; JSON.parse after signature) | All 8 steps present in code with the prescribed comment markers. Test 7 verifies authenticated-but-non-JSON → `'malformed_payload'`. |
| **D-14** (mandatory outer-toThrow guard — WR-02 day-one fix) | 7 outer guards present (one for each error-case test). |
| **D-15** (lowercase header keys, single-key path) | `req.headers['x-shopify-hmac-sha256']`, `'x-shopify-topic'`, `'x-shopify-webhook-id'` — each grep-checked to count == 1. |
| **D-16** (no union widening, no shared-file touches) | `git diff src/errors.ts src/middleware.ts src/index.ts src/providers/types.ts src/providers/registry.ts src/providers/stripe.ts src/providers/github.ts` returns empty. |
| **D-17** (module scope: only `shopify.{ts,test.ts}`) | `git diff --stat HEAD~2 HEAD` shows exactly those two paths. |

## Verification Evidence

- `npx tsc --noEmit -p tsconfig.json` → exit 0
- `npm test -- --run src/providers/shopify.test.ts` → 11/11 passed
- `npm test` (full suite regression) → 12 files, 97 tests passed
- `grep -c 'invalid_encoding' src/providers/shopify.ts` → 0
- `grep -cE 'console\.' src/providers/shopify.ts` → 0
- `grep -cE 'console\.' src/providers/shopify.test.ts` → 0
- `grep -c 'throw new Error' src/providers/shopify.ts` → 0 (Phase 3 stub `throw new Error(...)` removed)
- `grep -cE 'expect\(\(\) => shopifyProvider\.validate' src/providers/shopify.test.ts` → 7 (≥ 7 required by D-14)
- `git diff src/errors.ts` → empty
- `git diff src/middleware.ts src/index.ts src/providers/{types,registry,stripe,github}.ts` → empty
- `git status --porcelain src/providers/{stripe,github}.test.ts src/{middleware,errors,index}.test.ts` → empty

## Commits

| Task | Commit | Subject |
|------|--------|---------|
| 1 — implement shopify.ts | `f17bf45` | feat(05-02): implement Shopify HMAC-SHA256 webhook validator |
| 2 — co-located test file | `7fb70b4` | test(05-02): add co-located unit tests for shopifyProvider.validate() |

## Deviations from Plan

**Rule 1 (auto-fix bug) — comment string violating literal-grep acceptance criterion (Task 1).**

- **Found during:** Task 1 verification.
- **Issue:** The plan's literal action block at line 293 included a comment line containing the literal string `'invalid_encoding'`, but the plan's acceptance criterion at line 374 requires `grep -c 'invalid_encoding' src/providers/shopify.ts` to return 0. The literal action and the literal acceptance check were mutually inconsistent.
- **Fix:** Reworded the comment from `// NO union widening for 'invalid_encoding' — D-05 explicitly rejects.` to `// NO union widening for an encoding-confusion reason — D-05 explicitly rejects it.`, preserving the meaning while satisfying the grep gate. The comment for `step 4` (line 12) was similarly reworded (`computeHmac(req.rawBody, secret, 'sha256') Buffer-direct (D-07)` → `Buffer-direct over req.rawBody (D-07)`) so the literal `computeHmac(req.rawBody, secret, 'sha256')` count stays at exactly 1.
- **Files modified:** `src/providers/shopify.ts` only.
- **Justification:** This is a Rule 1 fix — the plan's literal text would have caused the executor's own acceptance criteria to fail. The semantic intent (no `'invalid_encoding'` reason in code or comments serving as code-by-pattern; exactly one Buffer-direct HMAC call) is preserved.

**Rule 2 (auto-add missing critical functionality) — outer-toThrow guard on the leakage test (Task 2).**

- **Found during:** Task 2 verification.
- **Issue:** The plan's literal action template at lines 653-673 omitted the outer `expect(() => ...).toThrow(WebhookValidationError)` guard on the leakage test (#11). The plan's acceptance criterion at line 693 requires the outer-guard count to be ≥ 7; the literal template yields exactly 6 (one for each of tests 2, 3, 4, 5, 6, 7 — the 4 success-path tests don't need them, leaving the leakage test as the 7th candidate). Without the guard, the leakage test would silently pass even if `validate()` failed to throw at all (the WR-02 vacuous-pass defect Phase 5 explicitly rejects).
- **Fix:** Added the outer-toThrow guard immediately before the `try/catch` introspection block in test 11. Now the count is 7, satisfying both the literal acceptance count AND the structural intent of D-14.
- **Files modified:** `src/providers/shopify.test.ts` only.
- **Justification:** This is a Rule 2 fix — the missing guard would have replicated WR-02 in the leakage test specifically, undermining the D-14 intent. Adding the guard is structurally correct and required by the acceptance count.

No other deviations. No architectural changes (Rule 4) needed.

## Threat Surface Scan

No new attack surface introduced beyond what the plan's `<threat_model>` already enumerates (T-5sh-01 through T-5sh-13). All `mitigate` dispositions in the threat register are realized in the implementation; both `accept` dispositions (T-5sh-10 header-size DoS bounded by upstream HTTP server config; T-5sh-11/T-5sh-12 audit-trail / replay defense documented in Phase 7 README) are unaffected by this plan's scope.

## Self-Check: PASSED

- `src/providers/shopify.ts` exists and contains real 8-step pipeline (verified by greps above).
- `src/providers/shopify.test.ts` exists with 11 it blocks (verified by `grep -c '^  it('`).
- Commit `f17bf45` exists in git log (`feat(05-02): implement Shopify HMAC-SHA256 webhook validator`).
- Commit `7fb70b4` exists in git log (`test(05-02): add co-located unit tests for shopifyProvider.validate()`).
- Full suite green: 97/97 across 12 files.
- `git diff src/errors.ts` returns empty; the 6-member `WebhookValidationReason` union is unchanged.
