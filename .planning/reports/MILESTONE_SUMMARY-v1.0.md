# Milestone v1.0 — Project Summary

**Project:** Express Webhook Validator
**Generated:** 2026-06-04
**Purpose:** Team onboarding and project review
**Status:** ✅ Complete — 7/7 phases delivered and verified

---

## 1. Project Overview

**What it is:** An Express-first middleware library that unifies HMAC signature validation across three third-party webhook providers — **Stripe, GitHub, and Shopify**. Backend developers drop in one consistent middleware per provider instead of stitching together each vendor's own pattern.

**Core value:** Validate any supported provider's webhook signatures correctly with one line of middleware — with replay protection where the provider supports it, and *documented honesty* about where it doesn't.

**Why it exists:** The webhook-validation landscape is fragmented — Stripe ships `constructEvent` (pulls in the full SDK), GitHub has `@octokit/webhooks` (tied to Octokit), Shopify offers only doc snippets. There's no widely-used Express-first library unifying all three. This is a reusable, portfolio-quality project whose quality bar is: *looks shippable from a GitHub README on first glance.*

**Differentiators:** Express-first (not framework-agnostic), zero vendor SDK dependencies, Node built-in `crypto` only, constant-time comparison, and a library that **never logs** and structurally cannot leak signature/secret/body material in errors.

---

## 2. Architecture & Technical Decisions

The library is a small, layered TypeScript package (`src/`, 14 source modules) built around a provider registry and a single middleware factory.

- **Provider registry pattern** *(Phase 3)* — `registerProvider(name, impl)` with self-registering side-effect imports; `createWebhookMiddleware(provider, options)` does a factory-time synchronous lookup and **throws at startup** on an unknown provider (not at request time).
- **Two raw-body capture surfaces** *(Phase 3)* — a standalone `rawBodyCapture()` middleware *and* a `captureRawBody` verify-callback for `express.json({ verify })`, supporting either middleware-ordering style. Raw bytes land at `req.rawBody` as a Buffer.
- **Crypto core** *(Phase 2)* — `computeHmac` returns a raw Buffer (no encoding baked in; providers convert at their own boundary); `timingSafeCompare` is Buffer-only with a top-level length guard implementing the constant-time pattern.
- **Discriminated error model** *(Phase 2)* — `WebhookValidationError { reason, provider, statusCode }` with no `message`/`cause` params; `toJSON` whitelists only safe keys so leakage is *structurally* impossible. Reasons use `lowercase_underscore` naming and are widened one-at-a-time, each in the same commit as the test exercising it.
- **HMAC strategy diverges by provider** — Stripe signs `${timestamp}.${rawBody}` (UTF-8 string) with a 300s default tolerance window and multi-`v1=` rotation support *(Phase 4)*; GitHub & Shopify sign the raw body **Buffer-direct** (GitHub hex `sha256=…`, Shopify **base64**) *(Phase 5)*.
- **Honest replay-protection posture** — Stripe gets a real timestamp-window defense; GitHub/Shopify expose `deliveryId`/`webhookId` for consumer-side dedup but ship **no built-in store** (stateful dedup belongs in the app, documented as a gap).
- **Build & tooling** *(Phase 1)* — dual ESM/CJS via tsup, Vitest, Biome lint+format, Express as a `peerDependency` (`4.x || 5.x`), and a 3×2 GitHub Actions matrix (Node 20/22/24 × Express 4.x/5.x).
- **Quality enforcement** *(Phase 6)* — an **enforcing** >90% per-file V8 coverage gate (`src/crypto/**`, `src/providers/**`, `src/middleware.ts`) on the Node 22 × Express 5.x CI cell, plus a Supertest integration suite across both body-parser modes.

---

## 3. Phases Delivered

| Phase | Name | Status | One-Liner |
|-------|------|--------|-----------|
| 1 | Foundation & Tooling | ✅ Complete | TypeScript scaffold: dual ESM/CJS (tsup), Vitest, Biome, 3×2 Node/Express CI matrix, Express as peer dep. |
| 2 | Crypto Core & Error Class | ✅ Complete | Node-crypto HMAC + length-guarded constant-time compare; discriminated `WebhookValidationError` with structurally-impossible leakage. |
| 3 | Body Handling & Public API Surface | ✅ Complete | Raw-body capture (two surfaces), `createWebhookMiddleware` factory + provider registry, per-provider request types, opt-in error handler. |
| 4 | Stripe Provider | ✅ Complete | Real Stripe validator: `t=…,v1=…` header, HMAC over `${t}.${body}`, 300s tolerance, multi-`v1=` rotation, parse-after-validate. |
| 5 | GitHub & Shopify Providers | ✅ Complete | Buffer-direct HMAC-SHA256 validators (GitHub hex, Shopify base64) with day-one fixes for Phase 4 header/test defects. |
| 6 | Integration Tests, Coverage Gate & Negative-Case Audit | ✅ Complete | Supertest suite (3 providers × 2 body modes), enforcing >90% per-file coverage gate, 8 advisory carry-overs closed, mutation-verified. |
| 7 | Documentation & Example App | ✅ Complete | README into canonical OSS shape (install → quickstarts → config → honest replay table) + runnable 3-provider example app; v1.0.0. |

---

## 4. Requirements Coverage

All milestone requirements are delivered and their phases verified complete (ROADMAP/STATE confirm 7/7).

- ✅ **FOUND-01..04** (Phase 1) — Foundation & tooling
- ✅ **CRYP-01, CRYP-02** (Phase 2) — HMAC + constant-time compare
- ✅ **API-02** (Phase 2), **API-01/03/04, BODY-01/02** (Phase 3) — Public API surface & body handling
- ✅ **STRP-01..03** (Phase 4) — Stripe validation with timestamp-window replay protection
- ✅ **GHUB-01..03, SHOP-01/02** (Phase 5) — GitHub & Shopify validation
- ✅ **QUAL-01..04** (Phase 6) — Integration tests, coverage gate, negative-case audit
- ✅ **DOCS-01..03** (Phase 7) — README, security notes, runnable example app

> ⚠️ **Traceability drift (tech debt):** `.planning/REQUIREMENTS.md`'s traceability table still marks several earlier-phase IDs (FOUND-*, CRYP-*, STRP-*, API-*) as `Pending` even though their phases are verified complete. The status is cosmetic table drift, not missing work. See §6.

---

## 5. Key Decisions Log

| ID | Decision | Phase | Rationale |
|----|----------|-------|-----------|
| Architecture | Express-first, not framework-agnostic | — | Differentiator; tighter ergonomics for the dominant Node framework. |
| Architecture | Unified middleware shape across providers | — | Reduces mental overhead vs each SDK's own pattern — the main DX angle. |
| Architecture | No vendor SDK dependencies | — | Small footprint; reinforces "validate without buying into a vendor's whole SDK." |
| P1-D07 | Single 3×2 Node/Express CI matrix job | 1 | Full cross-product coverage without job sprawl. |
| P1-D13 | Express as `peerDependency` only | 1 | Never ship/bundle the host framework. |
| P2-D03 | `timingSafeCompare` Buffer-only + length guard | 2 | Implements the constant-time / length-mismatch pattern safely. |
| P2-D11 | Structural leakage prevention (`toJSON` whitelist) | 2 | Makes secret/body leakage impossible by construction, not by discipline. |
| P3-D01..03 | Provider registry + startup-time throw on unknown provider | 3 | Fail fast at boot, not per request. |
| P3-D05 | Ship both raw-body surfaces | 3 | Supports either middleware-ordering style. |
| P3-D16 | Library never logs (zero `console.*` in `src/`) | 3 | No accidental signature/secret/body disclosure via logs. |
| P4-D01/D08 | Past-only tolerance; parse JSON *after* validation | 4 | Correct replay-window semantics; never parse untrusted body before HMAC check. |
| P4-D04 | Three-way header-parse failure mapping | 4 | Distinguishes missing / malformed / mismatch precisely. |
| P5-D07 | Buffer-direct HMAC for GitHub & Shopify | 5 | Avoids a lossy UTF-8 round-trip; matches each provider's signing rule. |
| P5-D10/D14 | Day-one fixes for Phase 4 WR-03/WR-02 in new providers | 5 | Don't propagate known defects into new code. |
| P6-D03 | `perFile: true` 90% coverage thresholds | 6 | Per-file gate prevents one well-tested file masking a thin one. |
| P7-D06 | Security notes must show the honest per-provider replay table | 7 | "Documented honesty" — don't overstate GitHub/Shopify protection. |
| P7-D09 | Example mock signers use independent Node crypto | 7 | Proves validator and signer genuinely agree (no circular validation). |

---

## 6. Tech Debt & Deferred Items

**Open advisories (non-blocking) from Phase 7 code review (`07-REVIEW.md`):**
- **WR-02** — README internal data-flow diagram's reason set drifts from `src/errors.ts`: omits `invalid_signature_format` (actually thrown by all three providers) and includes `missing_secret` (a *declared-but-never-thrown* union member — config errors throw plain `Error`). Root cause: dead union member at `src/errors.ts`.
- **WR-03** — README points to the example app but gives no inline run instructions (they live only in the example's source header).
- **WR-01 (resolved as false positive)** — review flagged the "139 tests / 16 files" badge as wrong; `npm test` authoritatively reports **139 across 16 files**, matching the README. No action needed.
- Info: numeric `Content-Length` headers in example senders (should be strings); hardcoded delivery/webhook IDs in the example (could use `randomUUID()` to reinforce the dedup lesson); README links the transitive `bytes` package; example `tsconfig` inherits `moduleResolution: "bundler"` while emitting via plain `tsc` (latent, not live).

**Process/tracking debt:**
- REQUIREMENTS.md traceability table shows stale `Pending` markers for completed early-phase IDs (see §4).
- `phase complete` flagged 7 REQ-IDs (DX-*, PROV-*, DIST-01) present in the REQUIREMENTS body but missing from the traceability table.
- No `SECURITY.md` artifact was generated for Phase 7 (`workflow.security_enforcement=true`); the phase's only "threat" is documentation accuracy, so it's low-stakes — run `/gsd-secure-phase 7` if the artifact is wanted on record.

**Deferred to v2 (out of v1 scope by design):**
- npm publishing pipeline (`DIST-01`); pre-commit hooks; Renovate/Dependabot.
- Async secret resolution (`DX-02`), custom logging/`onError` hook (`DX-01`), per-route TypeScript helpers (`DX-03`).
- Additional providers (Slack, Twilio, …); non-Express frameworks; built-in delivery-ID dedup store; typed event payloads.

---

## 7. Getting Started

- **Run the tests:** `npm test` — 139 tests across 16 files (Vitest). `npm run build` for the dual ESM/CJS bundle (tsup).
- **See it work end-to-end:** `cd examples/example-app && npm install && npm start` — boots an Express server, fires three correctly-signed mock webhooks (Stripe/GitHub/Shopify), prints each validated `req.webhook`, and exits 0.
- **Key directories:**
  - `src/crypto/` — `computeHmac`, `timingSafeCompare` (the security primitives)
  - `src/providers/` — `registry.ts`, `stripe.ts`, `github.ts`, `shopify.ts`, `types.ts`
  - `src/middleware.ts` — `createWebhookMiddleware` factory (the main entry point)
  - `src/raw-body/` — `rawBodyCapture()` middleware + `captureRawBody` verify callback
  - `src/errors.ts`, `src/error-handler.ts` — `WebhookValidationError` + opt-in `webhookErrorHandler()`
  - `src/index.ts` — public barrel (named exports only)
  - `examples/example-app/` — runnable three-provider demo
- **Where to look first:** Start at the README (installation → quickstarts → config reference → security notes), then `src/middleware.ts` to see the factory → registry → provider flow, then a provider (`src/providers/stripe.ts`) for the validation contract.
- **Public exports:** `createWebhookMiddleware`, `rawBodyCapture`, `captureRawBody`, `webhookErrorHandler`, `WebhookValidationError`, `computeHmac`, `timingSafeCompare`, plus types (`WebhookMetadata`, per-provider webhook types, `WebhookValidationReason`).

---

## Stats

- **Timeline:** 2026-05-05 → 2026-06-04 (~30 days)
- **Phases:** 7 / 7 complete
- **Commits:** 202 (since the first phase commit; includes planning + code)
- **Files changed:** 152 (+37,798 / −70)
- **Source modules:** 14 TypeScript files in `src/` (+ co-located tests)
- **Tests:** 139 across 16 files; >90% per-file coverage gate enforced in CI
- **Contributors:** David Taylor
- **Version:** 1.0.0 (not published to npm — by design for v1)
