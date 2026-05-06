---
phase: 3
slug: body-handling-public-api-surface
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-06
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `03-RESEARCH.md` § Validation Architecture (committed `a70c55d`).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 |
| **Config file** | `vitest.config.ts` (root) — currently `{ test: { include: ['src/**/*.test.ts'], environment: 'node' } }` |
| **Quick run command** | `npx vitest run <path-pattern>` (e.g., `npx vitest run src/middleware.test.ts`) |
| **Full suite command** | `npm test` |
| **Type-test command** | `npx tsc --noEmit -p tsconfig.test.json` (Wave 0 must add this config) |
| **Estimated runtime** | ~10s after Phase 3 lands (~21 existing + ~30 new tests across 8 new files) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <files-this-task-touched>` (sub-30s for any single file).
- **After every plan wave:** Run `npm test` (full suite).
- **Before `/gsd-verify-work`:** `npm run lint && npm run typecheck && npm run build && npm test` all green.
- **Compile-time type-test gate:** `npx tsc --noEmit -p tsconfig.test.json` exits 0. Non-zero means `@ts-expect-error` directives are no longer catching the error they should — discriminated union has weakened.
- **Max feedback latency:** 30 seconds (single-file vitest run).

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| BODY-01 | `req.rawBody` populated by standalone middleware before signature check | unit + supertest | `npx vitest run src/raw-body/middleware.test.ts` | ❌ Wave 0 | ⬜ pending |
| BODY-01 | `req.rawBody` populated by `express.json({ verify })` helper before signature check | unit + supertest | `npx vitest run src/raw-body/verify.test.ts` | ❌ Wave 0 | ⬜ pending |
| BODY-01 | `req.rawBody` shape (Buffer) is identical across both surfaces | unit | `npx vitest run src/raw-body/` | ❌ Wave 0 | ⬜ pending |
| BODY-02 | `express.json({ verify: captureRawBody })` integration pattern works in a real Express app | supertest | `npx vitest run src/raw-body/verify.test.ts` | ❌ Wave 0 | ⬜ pending |
| API-01 | `createWebhookMiddleware(provider, options)` is the primary export | unit (reachability smoke) | `npx vitest run src/index.test.ts` | ✅ (extended) | ⬜ pending |
| API-01 | Factory throws synchronously on unknown provider (D-02) | unit | `npx vitest run src/middleware.test.ts -t 'unknown provider'` | ❌ Wave 0 | ⬜ pending |
| API-01 | Factory throws synchronously on missing/empty secret (PITFALLS #11) | unit | `npx vitest run src/middleware.test.ts -t 'missing secret'` | ❌ Wave 0 | ⬜ pending |
| API-01 | Returned RequestHandler is compatible with both Express 4 and 5 | unit + CI matrix | CI job runs `npx vitest run` against both Express versions (Phase 1 D-07) | ✅ CI / ❌ test | ⬜ pending |
| API-03 | `req.webhook` discriminated union narrows correctly | type-only | `npx tsc --noEmit -p tsconfig.test.json` | ❌ Wave 0 | ⬜ pending |
| API-03 | Cross-branch field access is a compile-time error | type-only | same as above | ❌ Wave 0 | ⬜ pending |
| API-04 | Validation failures yield 401 by default | unit + supertest | `npx vitest run src/error-handler.test.ts` | ❌ Wave 0 | ⬜ pending |
| API-04 | Response body contains no signature/secret/body bytes | unit | inherited from Phase 2 D-11; extended for `'malformed_payload'` in `src/errors.test.ts` | ✅ (extension) | ⬜ pending |
| API-04 | Library never logs (D-16) | unit | `npx vitest run src/middleware.test.ts -t 'no logging'` (uses `vi.spyOn(console, ...)`) | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tsconfig.test.json` — extends main config, removes `**/*.test.ts` from exclude. Required for D-20 compile-time tests to actually run. (Pitfall 1.)
- [ ] `package.json#scripts.typecheck` — `tsc --noEmit -p tsconfig.test.json`. CI matrix should run this.
- [ ] `npm install -D supertest @types/supertest` — neither is installed today; D-21 requires them.
- [ ] `src/raw-body/middleware.test.ts` — covers BODY-01 (standalone middleware path).
- [ ] `src/raw-body/verify.test.ts` — covers BODY-01 + BODY-02 (verify-helper path).
- [ ] `src/middleware.test.ts` — covers API-01 (factory shape, throw-on-unknown, secret validation, no logging, fake-provider success path).
- [ ] `src/error-handler.test.ts` — covers API-04 (status code, JSON body shape, 4-arg detection via integration test, no logging).
- [ ] `src/providers/registry.test.ts` — covers D-01 (register/get round-trip).
- [ ] `src/types.test.ts` — covers API-03 (compile-time discriminated-union narrowing via `@ts-expect-error`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TypeScript consumer experience: `req.webhook` narrows in their handler with no `?.` chain | API-03 | The consumer-side compile experience is what SC3 promises; an in-tree `@ts-expect-error` test asserts the structural shape but does not exercise a real downstream `tsc` run | After Phase 3 lands, hand-create a tiny consumer app under `examples/consumer-typecheck/` with `import { createWebhookMiddleware } from 'express-webhook-validator'`, mount it, and run `tsc --noEmit` in the consumer dir. Defer the runnable example to DOCS-03 / Phase 7; this is a one-shot smoke. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`tsconfig.test.json`, `supertest`, 6 new test files)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter once Wave 0 lands and the Per-Task Verification Map is fully ✅

**Approval:** pending
