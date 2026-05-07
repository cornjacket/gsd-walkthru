# Roadmap: Express Webhook Validator

**Milestone:** v1.0 (initial release)
**Created:** 2026-05-05
**Granularity:** standard (7 phases)

## Overview

Build a TypeScript Express middleware library that unifies HMAC signature validation across Stripe, GitHub, and Shopify webhooks. The journey starts with project tooling — including a working test runner from day one — and a CI matrix, then layers in shared crypto primitives and the structured error class that every provider depends on, with unit tests landing alongside the code that ships them. With those tested foundations in place, we land the public API surface and raw-body capture pattern (also unit-tested as it ships), then implement Stripe first (the richest case — signed timestamp, multi-segment header) to prove the abstraction. GitHub and Shopify follow, validating that the unified shape fits simpler providers. Phase 6 then shifts from "write all the tests" to a smaller, sharper job: a Supertest-driven integration suite across all three providers, an enforced coverage gate, and an audit pass that closes any negative-case gaps left after Phases 2-5. The milestone closes with the portfolio-quality README plus runnable example app that make this look shippable on first GitHub glance.

**Tradeoff: Co-located testing.** Tests for crypto, raw-body, the public API, and each provider land in the same phase that introduces that code rather than being deferred to a single late "test coverage" phase. This makes Phases 2-5 land roughly 30-50% slower in clock time, but eliminates the "Phase 6 is a swamp" failure mode where tests written long after the fact catch defects in Stripe/Shopify combinations that should have been caught at the source. Phase 6 still owns integration tests, the coverage gate, and a deliberate negative-case audit — it just no longer carries the entire unit-test backlog.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Foundation & Tooling** - TypeScript project scaffold with dual CJS/ESM build, lint/format, a configured test runner (`npm test` works on day one), and Node 20/22/24 x Express 4/5 CI matrix
- [x] **Phase 2: Crypto Core & Error Class** - HMAC computation, length-safe constant-time comparison, and the discriminated `WebhookValidationError` class — with unit tests shipping alongside the code
- [x] **Phase 3: Body Handling & Public API Surface** - Raw-body capture, the `createWebhookMiddleware` factory, full TypeScript types, and safe 401 error responses — with unit tests shipping alongside the code
- [ ] **Phase 4: Stripe Provider** - Stripe HMAC validation with timestamp tolerance window and multi-`v1=` segment support for secret rotation — with unit tests shipping alongside the code
- [ ] **Phase 5: GitHub & Shopify Providers** - GitHub SHA-256 validation and Shopify base64-encoded validation with provider metadata exposure — with unit tests shipping alongside the code
- [ ] **Phase 6: Integration Tests, Coverage Gate & Negative-Case Audit** - Supertest integration suite across all three providers, enforced >90% coverage gate on core validation logic in CI, and an audit pass that closes any remaining negative-case gaps from Phases 2-5
- [ ] **Phase 7: Documentation & Example App** - README with per-provider quickstarts and security notes, plus a runnable example Express app demonstrating all three providers

## Phase Details

### Phase 1: Foundation & Tooling
**Goal**: A reviewer cloning the repo gets a working TypeScript build, a working test runner, and green CI on day one.
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04
**Success Criteria** (what must be TRUE):
  1. `npm run build` produces both CJS and ESM artifacts with type declarations and a correct `exports` map.
  2. `npm run lint` and `npm run format` pass on a clean checkout and fail on a deliberately malformed file.
  3. GitHub Actions CI runs the test job across Node 20, 22, and 24 against both Express 4.x and 5.x and reports green on the default branch.
  4. `npm install` in a fresh consumer project does not pull Express transitively — Express is declared only as a peerDependency for `4.x || 5.x`.
  5. `npm test` runs and exits 0 on a placeholder smoke test from a fresh checkout, in CI and locally — the test runner (Vitest, unless STACK.md says otherwise) is wired up so every subsequent phase can ship tests alongside its code.
**Plans**: 4 plans
Plans:
- [x] 01-01-PACKAGE-SCAFFOLD-PLAN.md — package.json + tsconfig + repo shape scaffold
- [x] 01-02-BUILD-TEST-PLAN.md — tsup build + Vitest test runner wired up
- [x] 01-03-BIOME-PLAN.md — Biome lint + format configured and verified
- [x] 01-04-CI-PLAN.md — GitHub Actions 3×2 Node/Express CI matrix

### Phase 2: Crypto Core & Error Class
**Goal**: A developer reading `src/crypto/` and `src/errors.ts` sees the security primitives every provider will depend on, with no provider knowledge required — and the unit tests that prove those primitives behave correctly ship in the same commits as the code.
**Depends on**: Phase 1
**Requirements**: CRYP-01, CRYP-02, API-02
**Success Criteria** (what must be TRUE):
  1. `computeHmac(rawBody, secret, 'sha256')` returns a digest produced by Node's built-in `crypto` with no external crypto dependency.
  2. `timingSafeCompare(a, b)` returns `false` (without throwing) when buffer lengths differ, and uses `crypto.timingSafeEqual` when they match.
  3. A developer can `throw new WebhookValidationError({ reason: 'signature_mismatch', provider, statusCode: 401 })` and inspect a discriminated `reason` field covering at least `signature_mismatch`, `timestamp_too_old`, `missing_header`, and `missing_secret`.
  4. Error instances never serialize signature bytes, secrets, or body content when passed through `JSON.stringify` or `String(err)`.
  5. Unit tests cover `computeHmac`, `timingSafeCompare` (both equal-length match path and length-mismatch safety path), and `WebhookValidationError` (discriminated `reason` cases, no signature/secret/body leakage in serialized form). All tests pass.
**Plans**: 3 plans
Plans:
- [x] 02-01-CRYPTO-PRIMITIVES-PLAN.md — computeHmac + timingSafeCompare + co-located unit tests under src/crypto/
- [x] 02-02-ERROR-CLASS-PLAN.md — WebhookValidationError class with locked { reason, provider, statusCode } shape + co-located unit tests in src/errors.test.ts
- [x] 02-03-PUBLIC-BARREL-PLAN.md — extend src/index.ts barrel with 4 new exports (computeHmac, timingSafeCompare, WebhookValidationError, type WebhookValidationReason) + reachability smoke tests

### Phase 3: Body Handling & Public API Surface
**Goal**: A developer can import `createWebhookMiddleware` and mount it on an Express route with full TypeScript types, even before any provider is wired up — and the unit tests that pin down raw-body capture, the factory shape, the `req.webhook` discriminated union, and the no-leakage failure path ship in the same commits as the code.
**Depends on**: Phase 2
**Requirements**: BODY-01, BODY-02, API-01, API-03, API-04
**Success Criteria** (what must be TRUE):
  1. The library's main export is `createWebhookMiddleware(provider, options)` and it returns a standard Express `RequestHandler` compatible with both Express 4 and 5.
  2. Raw request bytes are available to the middleware whether it is mounted before `express.json()` or alongside `express.json({ verify: ... })`, and the documented integration pattern is captured in code (helper or example) for the `verify` callback case.
  3. In a TypeScript consumer project, `req.webhook` narrows to a per-provider discriminated union — accessing a Shopify-only field on a Stripe branch is a compile-time error.
  4. When validation fails, the middleware responds with HTTP 401 by default and the response body, headers, and any logged error contain no signature, secret, or raw body bytes.
  5. Unit tests cover raw-body capture (mounted before `express.json()` and alongside `express.json({ verify })`), the `createWebhookMiddleware` factory shape, the typed `req.webhook` discriminated union, and the no-leakage assertion on validation failures. All tests pass.
**Plans**: 7 plans
Plans:
- [x] 03-01-PLAN.md — Wave 0 test infrastructure (tsconfig.test.json + typecheck script + supertest devDeps)
- [x] 03-02-PLAN.md — Provider plumbing: Provider interface + registry + 3 stub modules with D-09 branch types & self-registration
- [x] 03-03-PLAN.md — Raw-body capture: rawBodyCapture() standalone middleware + captureRawBody verify-callback helper (BODY-01, BODY-02)
- [x] 03-04-PLAN.md — Reason-union widening ('malformed_payload') + opt-in webhookErrorHandler() factory (D-17, D-14, D-15)
- [x] 03-05-PLAN.md — WebhookMetadata union + global Express.Request augmentation + compile-time @ts-expect-error narrowing test (D-11, SC3)
- [x] 03-06-PLAN.md — createWebhookMiddleware factory (API-01) + fail-loudly + next(err) delegation + no-leakage tests
- [x] 03-07-PLAN.md — Public barrel: extend src/index.ts with Phase 3 exports + side-effect provider imports + reachability smokes (D-19, D-03)

### Phase 4: Stripe Provider
**Goal**: A developer pointing a Stripe webhook at the middleware gets correct, replay-resistant validation with one line of mounting code — and the unit tests that pin down the happy path, tampered-body rejection, the timestamp window, and multi-`v1=` rotation behavior ship in the same commits as the code.
**Depends on**: Phase 3
**Requirements**: STRP-01, STRP-02, STRP-03
**Success Criteria** (what must be TRUE):
  1. A request with a valid `Stripe-Signature: t=<ts>,v1=<hex>` header and matching raw body passes validation; tampering one byte of the body or signature fails it.
  2. A request whose `t=` timestamp is older than the configured tolerance is rejected with `reason: 'timestamp_too_old'`, and the tolerance defaults to 300 seconds when unset.
  3. A `Stripe-Signature` header containing multiple `v1=` segments validates successfully when at least one segment matches — supporting Stripe secret rotation.
  4. Unit tests cover Stripe signature validation (happy path), tampered-body rejection, the configurable timestamp tolerance window including replay rejection outside the window, and multi-`v1=` segment matching for secret rotation. All tests pass.
**Plans**: 3 plans
Plans:
- [ ] 04-01-PLAN.md — Widen WebhookValidationReason with 'invalid_signature_format' + errors and index test extensions
- [ ] 04-02-PLAN.md — Add tolerance option to CreateWebhookMiddlewareOptions + factory closure resolution
- [ ] 04-03-PLAN.md — Real stripeProvider.validate() implementation + co-located unit tests (D-12 + D-13)

### Phase 5: GitHub & Shopify Providers
**Goal**: A developer mounting GitHub or Shopify middleware gets validation that uses the right header, the right encoding, and exposes the metadata they need for downstream dedup — and the unit tests that pin down each provider's correct-header / wrong-header / wrong-encoding behavior and metadata exposure ship in the same commits as the code.
**Depends on**: Phase 4
**Requirements**: GHUB-01, GHUB-02, GHUB-03, SHOP-01, SHOP-02
**Success Criteria** (what must be TRUE):
  1. A request with a valid `X-Hub-Signature-256: sha256=<hex>` header passes GitHub validation, and a request that supplies only the deprecated `X-Hub-Signature` (SHA-1) is rejected.
  2. After a successful GitHub validation, downstream handlers can read `req.webhook.deliveryId` (sourced from `X-GitHub-Delivery`) for their own delivery-ID dedup.
  3. A request with a valid base64-encoded `X-Shopify-Hmac-Sha256` header passes Shopify validation, while the same digest hex-encoded is rejected.
  4. After a successful Shopify validation, downstream handlers can read `req.webhook.topic` and `req.webhook.webhookId` (sourced from `X-Shopify-Topic` and `X-Shopify-Webhook-Id`).
  5. Unit tests cover GitHub HMAC-SHA256 validation (happy path + tampered body), explicit rejection of the deprecated `X-Hub-Signature` (SHA-1) header, exposure of `X-GitHub-Delivery` on `req.webhook`, Shopify base64-decoded validation (happy path), explicit rejection of hex-encoded Shopify digest, and exposure of `X-Shopify-Topic` and `X-Shopify-Webhook-Id` on `req.webhook`. All tests pass.
**Plans**: TBD

### Phase 6: Integration Tests, Coverage Gate & Negative-Case Audit
**Goal**: A reviewer running `npm test` sees a Supertest-driven integration suite that exercises all three providers end-to-end through a real Express app, an enforced coverage gate above 90% on core validation logic, and an audited negative-case suite that fails when its guard is removed. By the time we reach this phase, unit tests for crypto, the error class, and each provider already exist (shipped in Phases 2-5); this phase verifies that work holistically and adds the cross-cutting coverage that only makes sense once all providers are in place.
**Depends on**: Phase 5
**Requirements**: QUAL-01, QUAL-02, QUAL-03, QUAL-04
**Success Criteria** (what must be TRUE):
  1. Integration tests use Supertest against a real Express app and exercise all three providers end-to-end (mounting, raw-body capture, success path, failure path) — satisfying QUAL-02.
  2. Coverage tooling is configured and a CI threshold gate enforces greater than 90% line coverage across `src/crypto/`, `src/providers/`, and `src/middleware.ts`; the build fails when coverage drops below the threshold — satisfying QUAL-03.
  3. A deliberate audit of negative-case completeness across Phases 2-5 has been performed, any gaps filled, and the resulting suite demonstrably fails when each guard is removed — covering tampered body, wrong secret, missing header, Stripe replay outside the tolerance window, and Shopify hex-vs-base64 encoding mismatch — satisfying QUAL-04.
  4. A holistic review confirms QUAL-01 is satisfied: every crypto utility, every `WebhookValidationError` discriminated case, and every provider's signature logic has unit tests (shipped in Phases 2-5); any coverage gaps surfaced during the audit are closed in this phase.
**Plans**: TBD

### Phase 7: Documentation & Example App
**Goal**: A portfolio reviewer landing on the GitHub README believes this library is shippable within thirty seconds and can clone the example app to see all three providers running locally.
**Depends on**: Phase 6
**Requirements**: DOCS-01, DOCS-02, DOCS-03
**Success Criteria** (what must be TRUE):
  1. The README opens with installation and per-provider quickstarts (Stripe, GitHub, Shopify) showing one-line middleware mounting and a complete configuration reference.
  2. The README includes a security notes section that explicitly covers raw-body handling, constant-time comparison, and the per-provider replay-protection landscape (Stripe timestamp window vs. GitHub/Shopify dedup gap with guidance).
  3. A runnable example Express app under `examples/` boots locally, accepts mock signed payloads for all three providers, and prints the validated `req.webhook` payload to stdout.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Tooling | 4/4 | Complete | 2026-05-05 |
| 2. Crypto Core & Error Class | 3/3 | Complete | 2026-05-06 |
| 3. Body Handling & Public API Surface | 0/7 | Not started | - |
| 4. Stripe Provider | 0/3 | In progress | - |
| 5. GitHub & Shopify Providers | 0/TBD | Not started | - |
| 6. Integration Tests, Coverage Gate & Negative-Case Audit | 0/TBD | Not started | - |
| 7. Documentation & Example App | 0/TBD | Not started | - |
