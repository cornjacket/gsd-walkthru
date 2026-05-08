---
phase: 5
slug: github-shopify-providers
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-08
updated: 2026-05-08
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | vitest.config.ts (from Phase 1, no changes needed) |
| **Quick run command** | `npm test -- --run src/providers/github.test.ts src/providers/shopify.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~4 seconds (full suite); ~1 second (per-provider file) |

---

## Sampling Rate

- **After every task commit:** Run the relevant per-provider test file (`npm test -- --run src/providers/github.test.ts` or `src/providers/shopify.test.ts`).
- **After every plan wave:** Run `npm test` (full suite, regression check across all 11 existing test files + 2 new = 13 total when both plans are done).
- **Before `/gsd-verify-work`:** Full suite must be green; no `console.*` calls in `src/`; TypeScript strict mode clean (`npx tsc --noEmit -p tsconfig.json`); `WebhookValidationReason` union in `src/errors.ts` byte-for-byte unchanged (still 6 members).
- **Max feedback latency:** ~4 seconds.

---

## Per-Task Verification Map

> Each plan task in this phase has an `<automated>` verify command. Below is the consolidated map.

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-T1 | 05-01 | 1 | GHUB-01, GHUB-02, GHUB-03 | T-5gh-01, T-5gh-02, T-5gh-03, T-5gh-04, T-5gh-06, T-5gh-08, T-5gh-11 | Real `githubProvider.validate()` HMAC-SHA256 implementation; Buffer-direct HMAC (D-07); `sha256=` prefix parse (D-03); D-10 three-way header split corrected from day one; `timingSafeCompare` byte compare (D-04); JSON.parse-after-success (D-13 step 7); `eventId === deliveryId` (D-11); receipt timestamp (D-12); validator never reads `x-hub-signature` (D-02) | grep + tsc | `npx tsc --noEmit -p tsconfig.json && grep -q "export const githubProvider" src/providers/github.ts && grep -q "computeHmac(req.rawBody, secret, 'sha256')" src/providers/github.ts && grep -q "registerProvider('github', githubProvider)" src/providers/github.ts && [ "$(grep -cE 'x-hub-signature[^-]' src/providers/github.ts)" = "0" ] && [ "$(grep -cE 'console\\.' src/providers/github.ts)" = "0" ] && [ "$(grep -c 'throw new Error' src/providers/github.ts)" = "0" ]` | will exist after task | ⬜ |
| 05-01-T2 | 05-01 | 1 | GHUB-01, GHUB-02, GHUB-03 (test coverage for SC1, SC2, SC5) | T-5gh-01..T-5gh-11 (test-side verification of every threat) | 13 unit tests covering happy path + tampered + SHA-1-only + dual-header + bare-hex + non-hex-tail + missing + duplicate + missing-rawBody + non-JSON + missing-delivery + array-delivery + leakage assertion. Mandatory `expect(() => ...).toThrow(WebhookValidationError)` outer guard on every error-case test (D-14, avoids WR-02). | unit (Vitest) | `npm test -- --run src/providers/github.test.ts && grep -q "describe('githubProvider.validate()'" src/providers/github.test.ts && grep -q "import { githubProvider } from './github" src/providers/github.test.ts && [ "$(grep -c 'import { computeHmac' src/providers/github.test.ts)" = "0" ] && [ "$(grep -cE 'expect\\(\\(\\) => githubProvider\\.validate' src/providers/github.test.ts)" -ge "9" ]` | will exist after task | ⬜ |
| 05-02-T1 | 05-02 | 1 | SHOP-01, SHOP-02 | T-5sh-01, T-5sh-02, T-5sh-03, T-5sh-04, T-5sh-05, T-5sh-07, T-5sh-09, T-5sh-13 | Real `shopifyProvider.validate()` HMAC-SHA256 implementation; Buffer-direct HMAC (D-07); LOOSE base64 decode (D-06 — no pre-check); D-10 three-way header split corrected from day one; `timingSafeCompare` byte compare with hex-as-base64 falling through length-mismatch path (D-05); JSON.parse-after-success (D-13 step 7); `eventId === webhookId` (D-11); receipt timestamp (D-12); `WebhookValidationReason` union NOT widened (no `'invalid_encoding'` reason) | grep + tsc | `npx tsc --noEmit -p tsconfig.json && grep -q "export const shopifyProvider" src/providers/shopify.ts && grep -q "computeHmac(req.rawBody, secret, 'sha256')" src/providers/shopify.ts && grep -q "Buffer.from(header, 'base64')" src/providers/shopify.ts && grep -q "registerProvider('shopify', shopifyProvider)" src/providers/shopify.ts && [ "$(grep -c 'invalid_encoding' src/providers/shopify.ts)" = "0" ] && [ "$(grep -cE 'console\\.' src/providers/shopify.ts)" = "0" ] && [ "$(grep -c 'throw new Error' src/providers/shopify.ts)" = "0" ]` | will exist after task | ⬜ |
| 05-02-T2 | 05-02 | 1 | SHOP-01, SHOP-02 (test coverage for SC3, SC4, SC5) | T-5sh-01..T-5sh-13 (test-side verification) | 11 unit tests covering happy path + tampered + hex-as-base64 (D-05 critical case with `not.toBe('invalid_encoding')` defense-in-depth) + missing + array (D-10 with `not.toBe('missing_header')`) + missing-rawBody + non-JSON + missing-topic + missing-webhookId + array-topic + leakage assertion. Mandatory outer-guard pattern (D-14). | unit (Vitest) | `npm test -- --run src/providers/shopify.test.ts && grep -q "describe('shopifyProvider.validate()'" src/providers/shopify.test.ts && grep -q "import { shopifyProvider } from './shopify" src/providers/shopify.test.ts && [ "$(grep -c 'import { computeHmac' src/providers/shopify.test.ts)" = "0" ] && [ "$(grep -cE 'expect\\(\\(\\) => shopifyProvider\\.validate' src/providers/shopify.test.ts)" -ge "7" ]` | will exist after task | ⬜ |

**Sampling continuity check:** No 3 consecutive tasks lack automated verify — every task has one. ✅

**Pre-`/gsd-verify-work` gate (run after both plans complete):**

```bash
# Full-suite regression
npm test

# TypeScript strict
npx tsc --noEmit -p tsconfig.json

# Library-never-logs invariant (Phase 3 D-16)
test "$(grep -rcE 'console\\.' src/ | grep -v ':0$' | grep -vE '/(.*\\.)?test\\.ts:' | wc -l)" = "0"

# Reason union NOT widened (Phase 5 D-05 + D-08 + D-16 explicit)
test "$(grep -c \"^  | '\" src/errors.ts)" = "6"

# Both providers self-registered (Phase 3 D-03 preserved)
grep -q "registerProvider('github', githubProvider)" src/providers/github.ts
grep -q "registerProvider('shopify', shopifyProvider)" src/providers/shopify.ts

# Both providers exported as named exports (Plan 05-01/05-02 critical delta)
grep -q "export const githubProvider" src/providers/github.ts
grep -q "export const shopifyProvider" src/providers/shopify.ts

# GitHub deprecated header NEVER read
test "$(grep -cE 'x-hub-signature[^-]' src/providers/github.ts)" = "0"

# Shopify NO union widening
test "$(grep -c 'invalid_encoding' src/providers/shopify.ts)" = "0"
```

---

## Wave 0 Requirements

> Phase 5 has NO Wave 0 scaffolding tasks.

Per the established co-located test pattern (Phase 1 D-04, Phase 4 D-11) and ROADMAP SC5 ("unit tests ship in the same commits as the code"), the test files (`src/providers/github.test.ts`, `src/providers/shopify.test.ts`) are created alongside the implementation in their respective plans — Plan 05-01 Task 2 creates `github.test.ts`, Plan 05-02 Task 2 creates `shopify.test.ts`.

**Why no Wave 0 needed:**

- All test infrastructure is already in place from Phase 1 (Vitest config, TypeScript strict, tsconfig.test.json, supertest devDeps from Phase 3 — though Phase 5 doesn't use Supertest, that's Phase 6).
- All shared modules (`src/crypto/hmac.ts`, `src/crypto/compare.ts`, `src/errors.ts`, `src/providers/types.ts`, `src/providers/registry.ts`) are shipped from Phases 2-3.
- Phase 4 (Stripe) is the structural template; both Plan 05-01 and Plan 05-02 reference `src/providers/stripe.{ts,test.ts}` as a read-first artifact.
- No new types, interfaces, contracts, or test fixtures need to be created before implementation begins.
- The two NEW test files are written in the same task as their implementation (per ROADMAP SC5 "tests ship in the same commits as the code").
- Both plans have ZERO file-overlap (`src/providers/github.{ts,test.ts}` vs `src/providers/shopify.{ts,test.ts}`), so they execute in parallel as Wave 1 — no sequencing required.

**MISSING references audit:** Performed grep across both PLAN.md files for `MISSING — Wave 0 must create` strings. Result: zero matches. All `<verify>` blocks reference automated commands that operate on files created by their own task or by ambient infrastructure shipped in Phases 1-3.

---

## Manual-Only Verifications

All phase behaviors have automated verification via the per-task verify commands above. No manual-only checks are required for Phase 5.

The closest thing to a "manual" check is the WR-02 anti-pattern audit on the test files — that the outer `expect(() => ...).toThrow(WebhookValidationError)` guard precedes every `try/catch` introspection block. The acceptance criteria use grep counts (`expect-toThrow count >= try-block count` proxy) to make this automated, but a brief manual scan of the test files during code review is recommended as defense-in-depth.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands (4/4 tasks)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task has one)
- [x] Wave 0 covers all MISSING references (no MISSING references — Phase 5 needs no Wave 0)
- [x] No watch-mode flags (all `npm test` invocations use `--run` for one-shot execution where applicable; the full-suite invocation uses Vitest's default one-shot mode in CI)
- [x] Feedback latency < 4s (full suite ~4s; per-provider file ~1s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved by gsd-planner — 2026-05-08

---

## Reference: Decision-to-Test Mapping

For verifier traceability, the locked CONTEXT decisions map to specific tests as follows. Every locked decision has at least one test (or one acceptance-criterion grep) covering it.

### GitHub (Plan 05-01)

| Decision | Plan/Task | Test or Acceptance Criterion |
|----------|-----------|------------------------------|
| D-01 (SHA-1-only → `'missing_header'`) | 05-01-T2 | Test 3 |
| D-02 (validator never reads `x-hub-signature`) | 05-01-T1 + T2 | Acceptance grep `x-hub-signature[^-]` count = 0; Test 4 (dual-header happy path) |
| D-03 (header parse failures → `'invalid_signature_format'`) | 05-01-T2 | Tests 5, 6 |
| D-04 (Buffer-on-both-sides timing-safe compare) | 05-01-T1 | Acceptance grep `timingSafeCompare(computed, headerBuf)` |
| D-07 (Buffer-direct HMAC, no UTF-8 round-trip) | 05-01-T1 | Acceptance grep `computeHmac(req.rawBody, secret, 'sha256')` |
| D-08 (missing metadata → `''`, validation proceeds) | 05-01-T2 | Test 11 |
| D-09 (array metadata → `[0] || ''`) | 05-01-T2 | Test 12 |
| D-10 (auth header three-way split) | 05-01-T1 + T2 | Acceptance grep `header === undefined` + `typeof header !== 'string'`; Tests 7, 8 |
| D-11 (`eventId === deliveryId`) | 05-01-T1 + T2 | Acceptance grep `eventId: deliveryId`; Tests 1, 11, 12 |
| D-12 (receipt timestamp `Math.floor(Date.now()/1000)`) | 05-01-T1 + T2 | Acceptance grep `Math\\.floor\\(Date\\.now\\(\\) / 1000\\)`; Test 1 timestamp range assertion |
| D-13 (8-step pipeline, JSON.parse after signature passes) | 05-01-T1 + T2 | Implementation step order; Tests 9, 10 |
| D-14 (co-located test file with mandatory outer-guard pattern) | 05-01-T2 | Acceptance grep outer-guard count ≥ 9 |
| D-15 (Express-lowercase header keys) | 05-01-T1 | Acceptance grep `x-hub-signature-256` + `x-github-delivery` (lowercase) |

### Shopify (Plan 05-02)

| Decision | Plan/Task | Test or Acceptance Criterion |
|----------|-----------|------------------------------|
| D-05 (hex-as-base64 → `'signature_mismatch'`, no `'invalid_encoding'` widening) | 05-02-T1 + T2 | Acceptance grep `invalid_encoding` count = 0; Test 3 with explicit `not.toBe('invalid_encoding')` |
| D-06 (loose base64 decode, no pre-check) | 05-02-T1 | Acceptance grep `Buffer.from(header, 'base64')`; absence of `/^[A-Za-z0-9` regex |
| D-07 (Buffer-direct HMAC, no UTF-8 round-trip) | 05-02-T1 | Acceptance grep `computeHmac(req.rawBody, secret, 'sha256')` |
| D-08 (missing metadata → `''`) | 05-02-T2 | Tests 8, 9 |
| D-09 (array metadata → `[0] || ''`) | 05-02-T2 | Test 10 |
| D-10 (auth header three-way split) | 05-02-T1 + T2 | Acceptance grep `header === undefined` + `typeof header !== 'string'`; Tests 4, 5 |
| D-11 (`eventId === webhookId`) | 05-02-T1 + T2 | Acceptance grep `eventId: webhookId`; Tests 1, 9 |
| D-12 (receipt timestamp) | 05-02-T1 + T2 | Acceptance grep + Test 1 timestamp range assertion |
| D-13 (8-step pipeline) | 05-02-T1 + T2 | Implementation step order; Tests 6, 7 |
| D-14 (co-located test file with outer-guard pattern) | 05-02-T2 | Acceptance grep outer-guard count ≥ 7 |
| D-15 (Express-lowercase header keys) | 05-02-T1 | Acceptance grep `x-shopify-hmac-sha256` + `x-shopify-topic` + `x-shopify-webhook-id` (lowercase) |
| D-16 (no reason union widening, no test-file outside the new ones) | 05-01-T1 + 05-02-T1 | `git diff src/errors.ts` returns empty; `git diff` for stripe.test.ts / errors.test.ts / index.test.ts / middleware.test.ts returns empty |
| D-17 (only 4 files modified/created) | both plans | `files_modified` frontmatter (2 per plan, zero overlap) |
