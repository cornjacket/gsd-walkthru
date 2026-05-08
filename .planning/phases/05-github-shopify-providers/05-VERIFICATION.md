---
phase: 05-github-shopify-providers
verified: 2026-05-08T18:15:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 5: GitHub & Shopify Providers Verification Report

**Phase Goal:** A developer mounting GitHub or Shopify middleware gets validation that uses the right header, the right encoding, and exposes the metadata they need for downstream dedup — and the unit tests that pin down each provider's correct-header / wrong-header / wrong-encoding behavior and metadata exposure ship in the same commits as the code.
**Verified:** 2026-05-08T18:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP SC1–SC5)

| # | Truth (Success Criterion) | Status | Evidence |
|---|---|---|---|
| SC1 | GitHub: valid `X-Hub-Signature-256: sha256=<hex>` passes; SHA-1-only `X-Hub-Signature` is rejected | VERIFIED | `src/providers/github.ts:40-141` implements 8-step pipeline; `header === undefined` (line 59) → `'missing_header'`; validator never reads `x-hub-signature` (grep `x-hub-signature[^-]` returns 0). Tests `github.test.ts:53-66` (happy path), `:99-113` (SHA-1-only → `missing_header`), `:82-95` (tampered body → `signature_mismatch`). |
| SC2 | After GitHub validation, `req.webhook.deliveryId` is sourced from `X-GitHub-Delivery` | VERIFIED | `github.ts:112-116` reads `x-github-delivery` with array-collapse; `:135-138` populates `deliveryId` and `eventId === deliveryId`. Tests `github.test.ts:53-66` (happy path), `:211-218` (missing → `''`), `:220-226` (array → `[0]`). |
| SC3 | Shopify: valid base64 `X-Shopify-Hmac-Sha256` passes; same digest hex-encoded is rejected | VERIFIED | `shopify.ts:87` decodes via `Buffer.from(header, 'base64')` (loose decode, D-06); `:88-94` uses `timingSafeCompare` which returns `false` on length-mismatch (32 bytes vs ~48 from hex), throwing `'signature_mismatch'`. Union NOT widened — `grep -c 'invalid_encoding' src/providers/shopify.ts` = 0; `git diff ed4b345 HEAD -- src/errors.ts` empty. Tests `shopify.test.ts:51-64` (happy), `:90-118` (hex-as-base64 with explicit `.not.toBe('invalid_encoding')`), `:68-86` (tampered). |
| SC4 | After Shopify validation, `req.webhook.topic` and `req.webhook.webhookId` from `X-Shopify-Topic` / `X-Shopify-Webhook-Id` | VERIFIED | `shopify.ts:98-108` reads both metadata headers with array-collapse; `:125-132` populates `topic`, `webhookId`, and `eventId === webhookId`. Tests `shopify.test.ts:51-64` (happy), `:201-208` (missing topic → `''`), `:210-217` (missing webhookId → `''` + eventId === ''), `:219-229` (array topic → first value). |
| SC5 | Unit tests cover GitHub HMAC happy + tampered, SHA-1 reject, delivery-id surface, Shopify base64 happy + hex-reject, topic/webhook-id surface — all pass | VERIFIED | `github.test.ts` has 13 `it()` blocks; `shopify.test.ts` has 11 `it()` blocks. `npm test` runs 110 tests across 13 files, 0 failures. `npx tsc --noEmit -p tsconfig.json` exits 0. |

**Score:** 5/5 truths verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/providers/github.ts` | Real HMAC-SHA256 8-step validator with `export const githubProvider` | VERIFIED | 144 lines (>= 80 min). Contains `export const githubProvider` (1 match), `computeHmac(req.rawBody, secret, 'sha256')` (line 96, code), three-way header split (`header === undefined`, `typeof header !== 'string'`), `sha256=` prefix parsing with hex-tail validation, `Buffer.from(headerHex, 'hex')`, `timingSafeCompare(computed, headerBuf)`, `Math.floor(Date.now() / 1000)`, `eventId: deliveryId`, `registerProvider('github', githubProvider)`. NO `throw new Error`. NO `console.*`. NO `x-hub-signature[^-]` (D-02). |
| `src/providers/github.test.ts` | 13 `it()` blocks with D-14 outer-toThrow guards | VERIFIED | 253 lines (>= 200 min). 13 `it()` blocks. Outer-toThrow count: 9 (one per error-case test, including leakage). D-10 array-shaped header test asserts both `'invalid_signature_format'` AND `not.toBe('missing_header')`. Imports `createHmac` from `node:crypto`, NOT `computeHmac` (non-tautological). Imports `githubProvider` (consumes named export delta). |
| `src/providers/shopify.ts` | Real base64 8-step validator with `export const shopifyProvider` | VERIFIED | 137 lines (>= 80 min). Contains `export const shopifyProvider` (1 match), `computeHmac(req.rawBody, secret, 'sha256')`, three-way header split, `Buffer.from(header, 'base64')` LOOSE decode (no length/alphabet pre-check), `timingSafeCompare(computed, headerBuf)`, `eventId: webhookId`, `Math.floor(Date.now() / 1000)`, `registerProvider('shopify', shopifyProvider)`. NO `invalid_encoding` (0 matches, D-05 explicit rejection). NO `throw new Error`. NO `console.*`. |
| `src/providers/shopify.test.ts` | 11 `it()` blocks with D-14 outer-toThrow guards + hex-as-base64 D-05 case | VERIFIED | 261 lines (>= 200 min). 11 `it()` blocks. Outer-toThrow count: 7 (one per error-case test, including leakage). Hex-as-base64 test asserts `'signature_mismatch'` AND `.not.toBe('invalid_encoding' as any)`. D-10 array test asserts `'invalid_signature_format'` AND `.not.toBe('missing_header')`. Imports `createHmac` only. |
| `src/errors.ts` | Byte-for-byte unchanged (no union widening, D-16) | VERIFIED | `git diff ed4b345 HEAD -- src/errors.ts` returns empty. Reason union still has exactly 6 members (`grep -cE "^  \\| '" src/errors.ts` = 6). |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `src/providers/github.ts` | `src/crypto/hmac.ts` | `computeHmac(req.rawBody, secret, 'sha256')` | WIRED | github.ts:96 — Buffer-direct call, exactly one code occurrence (line 12 is comment). |
| `src/providers/github.ts` | `src/crypto/compare.ts` | `timingSafeCompare(computed, headerBuf)` | WIRED | github.ts:101 — comparison gates the throw. |
| `src/providers/github.ts` | `src/errors.ts` | `new WebhookValidationError(...)` | WIRED | 5 distinct throw sites in github.ts (rawBody, header undef, header non-string, prefix, hex tail, signature mismatch, malformed JSON). |
| `src/providers/github.ts` | `src/providers/registry.ts` | `registerProvider('github', githubProvider)` | WIRED | github.ts:143 — final line, self-registration preserved (P3 D-03). |
| `src/providers/github.test.ts` | `src/providers/github.ts` | `import { githubProvider } from './github.js'` | WIRED | github.test.ts:4 — consumes the named-export delta. |
| `src/providers/shopify.ts` | `src/crypto/hmac.ts` | `computeHmac(req.rawBody, secret, 'sha256')` | WIRED | shopify.ts:80 — Buffer-direct, 1 occurrence. |
| `src/providers/shopify.ts` | `src/crypto/compare.ts` | `timingSafeCompare(computed, headerBuf)` | WIRED | shopify.ts:88 — D-05 length-mismatch path is the structural answer to hex-as-base64. |
| `src/providers/shopify.ts` | `src/errors.ts` | `new WebhookValidationError(...)` | WIRED | 4 throw sites: rawBody, header undef, header non-string, signature mismatch, malformed JSON. |
| `src/providers/shopify.ts` | `src/providers/registry.ts` | `registerProvider('shopify', shopifyProvider)` | WIRED | shopify.ts:136 — final line. |
| `src/providers/shopify.test.ts` | `src/providers/shopify.ts` | `import { shopifyProvider } from './shopify.js'` | WIRED | shopify.test.ts:4. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `githubProvider.validate()` | return value (`GitHubWebhook`) | `req.rawBody` Buffer + `req.headers` (consumer-supplied) | Yes — `parsed` from real `JSON.parse`, `deliveryId` from real header, `timestamp` from `Date.now()` | FLOWING |
| `shopifyProvider.validate()` | return value (`ShopifyWebhook`) | `req.rawBody` Buffer + `req.headers` | Yes — same as above; `topic` and `webhookId` from real headers | FLOWING |

Tests verify happy-path data flow (`result.parsed.toMatchObject`, `result.timestamp >= before`, `result.deliveryId === SAMPLE_DELIVERY` etc.).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full test suite passes | `npm test` | `Test Files 13 passed (13) / Tests 110 passed (110)` | PASS |
| TypeScript strict compile | `npx tsc --noEmit -p tsconfig.json` | exit 0 | PASS |
| Reason union not widened | `git diff ed4b345 HEAD -- src/errors.ts` | empty | PASS |
| Locked files untouched | `git diff ed4b345 HEAD -- src/middleware.ts src/index.ts src/providers/registry.ts src/providers/types.ts src/types.ts src/providers/stripe.ts` | empty | PASS |
| D-02 deprecated header invisible | `grep -cE 'x-hub-signature[^-]' src/providers/github.ts` | 0 | PASS |
| D-05 union not widened in shopify code | `grep -c 'invalid_encoding' src/providers/shopify.ts` | 0 | PASS |
| No console.* in 4 phase files | `grep -cE 'console\.' src/providers/{github,shopify}.{ts,test.ts}` | 0/0/0/0 | PASS |
| Named exports for tests | `grep -c 'export const githubProvider' src/providers/github.ts` | 1 | PASS |
| Named exports for tests | `grep -c 'export const shopifyProvider' src/providers/shopify.ts` | 1 | PASS |
| GitHub self-registration preserved | `grep -c "registerProvider('github', githubProvider)" src/providers/github.ts` | 1 | PASS |
| Shopify self-registration preserved | `grep -c "registerProvider('shopify', shopifyProvider)" src/providers/shopify.ts` | 1 | PASS |
| D-10 three-way split (github) | `grep -c 'header === undefined' && grep -c "typeof header !== 'string'"` | 1+1 | PASS |
| D-10 three-way split (shopify) | same | 1+1 | PASS |
| GitHub test count | `grep -c '^  it(' src/providers/github.test.ts` | 13 | PASS |
| Shopify test count | `grep -c '^  it(' src/providers/shopify.test.ts` | 11 | PASS |
| D-14 outer-toThrow guards (github) | `grep -cE "expect\\(\\(\\) => githubProvider\\.validate" src/providers/github.test.ts` | 9 (≥9 expected) | PASS |
| D-14 outer-toThrow guards (shopify) | `grep -cE "expect\\(\\(\\) => shopifyProvider\\.validate" src/providers/shopify.test.ts` | 7 (≥7 expected) | PASS |
| Phase-5 commits exist | `git log --oneline` shows `d1b2d5c`, `a96ae16`, `f17bf45`, `7fb70b4` | all present | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| GHUB-01 | 05-01-PLAN.md | Validate GitHub HMAC-SHA256 from `X-Hub-Signature-256` | SATISFIED | github.ts:96 (HMAC), :77-91 (`sha256=` prefix + hex tail), :100-107 (compare). Tests github.test.ts:53-66 (happy), :82-95 (tampered), :117-142 (format negatives), :159-174 (array). |
| GHUB-02 | 05-01-PLAN.md | Reject deprecated `X-Hub-Signature` (SHA-1) | SATISFIED | Validator NEVER reads `x-hub-signature` (D-02 invisible — `grep -cE 'x-hub-signature[^-]' src/providers/github.ts` = 0). SHA-1-only request → `'missing_header'` via the auth-header undef check. Test github.test.ts:99-113. |
| GHUB-03 | 05-01-PLAN.md | Surface `X-GitHub-Delivery` ID on `req.webhook` | SATISFIED | github.ts:112-116 reads header with array-collapse; :135-138 populates `deliveryId` and `eventId`. Tests github.test.ts:53-66 (happy), :211-218 (missing → `''`), :220-226 (array → `[0]`). |
| SHOP-01 | 05-02-PLAN.md | Validate Shopify HMAC-SHA256 using base64 (not hex) | SATISFIED | shopify.ts:87 `Buffer.from(header, 'base64')` LOOSE; :80 Buffer-direct HMAC; :88-94 timingSafeCompare. Hex-as-base64 → length mismatch → `'signature_mismatch'`. Tests shopify.test.ts:51-64 (happy), :68-86 (tampered), :90-118 (hex-as-base64 with `.not.toBe('invalid_encoding')` defense-in-depth). |
| SHOP-02 | 05-02-PLAN.md | Surface `X-Shopify-Topic` and `X-Shopify-Webhook-Id` | SATISFIED | shopify.ts:98-108 reads both headers with array-collapse; :125-132 populates `topic`, `webhookId`, `eventId === webhookId`. Tests shopify.test.ts:51-64 (happy), :201-208, :210-217, :219-229. |

**Orphan check:** REQUIREMENTS.md maps exactly 5 IDs to Phase 5 (GHUB-01/02/03, SHOP-01/02). All 5 are claimed and satisfied. No orphans.

**Note:** REQUIREMENTS.md status table still shows these 5 IDs as `Pending` — that is a closure-table bookkeeping update, not a verification gap. The implementation evidence is in place.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| (none) | — | No `console.*`, no `throw new Error` stub remnants, no `Buffer.compare`/`===` byte compares, no `JSON.parse` before signature pass, no widened reason union, no vendor SDK imports | — | — |

### Code-Review Advisory Warnings (Phase 5 — non-blocking)

Per the workflow's "advisory only — never blocks execution flow" rule, the 3 warnings in `05-REVIEW.md` are recorded but do NOT downgrade verification status:

- **WR-01:** Empty-string `X-Hub-Signature-256` / `X-Shopify-Hmac-Sha256` not directly tested. Behavior is correct (GitHub → `'invalid_signature_format'`, Shopify → `'signature_mismatch'`); the asymmetry is just untested.
- **WR-02:** Leakage assertion shape — the leakage tests (#13 in github, #11 in shopify) use `JSON.stringify(err)` and `String(err)` to scan for sensitive substrings, but do not also positively assert that the message field is a deterministic non-leaky shape.
- **WR-03:** Leakage assertion runs on a tampered-body path; it does not also exercise the parse-failure path or the array-header path. Defense-in-depth coverage gap, not a defect.

These can be addressed in Phase 6 (negative-case audit) — Phase 5's binding success criteria SC1–SC5 are independent of these advisory items.

### Human Verification Required

(none — all phase deliverables are programmatically verifiable: HMAC math, header parsing, error throwing, and JSON return shapes. The full unit-test suite (110 passing) exercises every binding criterion.)

### Gaps Summary

No gaps. All 5 ROADMAP success criteria for Phase 5 are realized in the code and locked down by passing unit tests:

- **SC1 (GitHub)** — pipeline at `src/providers/github.ts`, 13 tests in co-located test file, deprecated SHA-1 header invisible per D-02 grep.
- **SC2 (`deliveryId` exposure)** — three tests covering happy path, missing-header (→ `''`), and array-collapse.
- **SC3 (Shopify base64 + hex-reject)** — `Buffer.from(header, 'base64')` loose decode + `timingSafeCompare` length-mismatch path; the hex-as-base64 test explicitly asserts `'signature_mismatch'` AND defense-in-depth `.not.toBe('invalid_encoding')`.
- **SC4 (`topic` + `webhookId` exposure)** — four tests covering happy path, missing topic, missing webhookId (forces `eventId === ''`), and array-collapse.
- **SC5 (unit tests cover all of the above + all pass)** — `npm test` returns 110/110 across 13 files; `npx tsc --noEmit` exits 0.

Cross-cutting invariants verified: errors.ts byte-unchanged (no union widening — D-05/D-16), all 5 other locked files (middleware, index, registry, types, types.ts top-level, stripe.ts) byte-unchanged, no console.*, no throw new Error stubs, both providers retain self-registration. Both day-one fixes from Phase 4 (WR-03 three-way header split, WR-02 outer-toThrow test guards) are realized in both providers and explicitly asserted by the negative-test `.not.toBe(...)` checks.

Phase 5 goal achieved. Ready to proceed to Phase 6.

---
*Verified: 2026-05-08T18:15:00Z*
*Verifier: Claude (gsd-verifier)*
