---
phase: 4
slug: stripe-provider
status: active
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-07
updated: 2026-05-07
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | vitest.config.ts (from Phase 1, no changes needed) |
| **Quick run command** | `npm test -- src/providers/stripe.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~4 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- src/providers/stripe.test.ts` (once that file exists; errors/index tests for earlier tasks)
- **After every plan wave:** Run `npm test` (full suite, regression check)
- **Before `/gsd-verify-work`:** Full suite must be green; no `console.*` calls in `src/`; TypeScript strict mode clean
- **Max feedback latency:** ~4 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | STRP-01 | T-4-01 | `invalid_signature_format` reason does not leak bytes; statusCode=401 | unit | `npm test -- src/errors.test.ts` | ✅ exists (extend) | ⬜ pending |
| 4-01-02 | 01 | 1 | STRP-01 | T-4-01 | Reason reachable via public export; no new leakage surface | unit | `npm test -- src/index.test.ts` | ✅ exists (extend) | ⬜ pending |
| 4-02-01 | 02 | 1 | STRP-02 | T-4-02 | Tolerance option validated at config-time; default 300 never leaks | unit | `npm test -- src/middleware.test.ts` | ✅ exists (no new tests needed) | ⬜ pending |
| 4-03-01 | 03 | 2 | STRP-01, STRP-02, STRP-03 | T-4-01, T-4-02, T-4-03 | HMAC uses rawBody not parsed JSON; constant-time loop; timestamp past-only | unit | `npm test -- src/providers/stripe.test.ts` | ❌ Wave 0 (new file) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/errors.ts` — widen `WebhookValidationReason` union with `'invalid_signature_format'`; extend `messageFor` lookup (Plan 01, Task 1)
- [x] `src/errors.test.ts` — add one case for `'invalid_signature_format'` in existing `it.each()` + one explicit message test (Plan 01, Task 1)
- [x] `src/index.test.ts` — add smoke: `const reason: WebhookValidationReason = 'invalid_signature_format'` (Plan 01, Task 2)
- [x] `src/middleware.ts` — add `tolerance?: number` to `CreateWebhookMiddlewareOptions`; resolve default 300 in factory closure (Plan 02, Task 1)
- [ ] `src/providers/stripe.test.ts` — NEW file covering D-12 + D-13 test cases (Plan 03, Task 2 — ships with implementation)

*All Wave 0 infrastructure is in-plan. The test file for stripe is created in Plan 03 alongside the implementation per the co-located test pattern and ROADMAP SC4 ("unit tests ship in the same commits as the code").*

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 4s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-07
