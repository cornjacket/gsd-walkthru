# Requirements: Express Webhook Validator

**Defined:** 2026-05-04
**Core Value:** A backend developer integrating any supported webhook provider can validate signatures correctly with one line of middleware — with replay protection where the provider supports it, and documented honesty about where it doesn't.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [ ] **FOUND-01**: Project scaffolded with TypeScript, builds dual CJS/ESM output via `tsup`, package.json `exports` map configured
- [ ] **FOUND-02**: GitHub Actions CI matrix runs tests on Node 20/22/24 × Express 4.x/5.x
- [ ] **FOUND-03**: Lint and format configured (Biome or ESLint flat config + Prettier) and enforced in CI
- [ ] **FOUND-04**: `express` declared as `peerDependency` (4.x and 5.x), not a regular dependency

### Crypto

- [ ] **CRYP-01**: `computeHmac(rawBody, secret, algorithm)` utility built on Node's `crypto` module
- [ ] **CRYP-02**: `timingSafeCompare` helper that handles length-mismatch safely (does not throw, returns false) and uses `crypto.timingSafeEqual` for equal-length inputs

### Body Handling

- [ ] **BODY-01**: Raw request body captured before any JSON parsing — middleware works whether mounted before or alongside `express.json()`
- [ ] **BODY-02**: Documented integration pattern with `express.json({ verify: ... })` for users who want a single body parser

### Stripe Provider

- [ ] **STRP-01**: Validate Stripe HMAC-SHA256 signature from `Stripe-Signature` header (parses `t=...,v1=...` shape)
- [ ] **STRP-02**: Enforce timestamp tolerance window — configurable, 5-minute default — reject requests outside the window
- [ ] **STRP-03**: Accept any matching `v1=` segment when multiple are present (supports Stripe secret rotation)

### GitHub Provider

- [x] **GHUB-01**: Validate GitHub HMAC-SHA256 signature from `X-Hub-Signature-256`
- [x] **GHUB-02**: Do not accept deprecated `X-Hub-Signature` (SHA-1) — explicitly reject or ignore
- [x] **GHUB-03**: Surface `X-GitHub-Delivery` ID in `req.webhook` for downstream dedup by user code

### Shopify Provider

- [x] **SHOP-01**: Validate Shopify HMAC-SHA256 signature from `X-Shopify-Hmac-Sha256` using **base64** decoding (not hex)
- [x] **SHOP-02**: Surface `X-Shopify-Topic` and `X-Shopify-Webhook-Id` in `req.webhook` for downstream use

### Public API

- [ ] **API-01**: Single `createWebhookMiddleware(provider, options)` factory exported as the primary entry point
- [ ] **API-02**: `WebhookValidationError` class with discriminated `reason` field (`signature_mismatch`, `timestamp_too_old`, `missing_header`, `missing_secret`, etc.)
- [ ] **API-03**: Full TypeScript types — `req.webhook` typed as a discriminated union narrowing per provider
- [ ] **API-04**: Validation failures return 401 by default and never include signature, secret, or body content in error messages or logs

### Quality

- [ ] **QUAL-01**: Unit tests cover crypto utilities, error class, and each provider's signature logic
- [ ] **QUAL-02**: Integration tests run against a real Express app via Supertest, exercising all three providers
- [ ] **QUAL-03**: Test coverage > 90% on core validation logic
- [ ] **QUAL-04**: Tests include negative cases: tampered body, wrong secret, missing header, replay outside window (Stripe), wrong encoding (Shopify hex vs base64)

### Documentation

- [ ] **DOCS-01**: README includes installation, per-provider quickstarts, and configuration reference
- [ ] **DOCS-02**: README includes a security notes section covering raw-body handling, timing attacks, and replay-protection caveats per provider
- [ ] **DOCS-03**: Runnable example Express app demonstrates all three providers with mock signed payloads

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### DX Polish

- **DX-01**: Custom logging hook (callback fired on validation success/failure)
- **DX-02**: Async secret resolution — `secret` may be a function returning `string | Promise<string>` for multi-tenant lookups
- **DX-03**: Per-route TypeScript helpers (e.g., `stripeWebhookHandler<T>(...)` typed wrappers)

### More Providers

- **PROV-01**: Slack webhook signature validation
- **PROV-02**: Twilio webhook signature validation
- **PROV-03**: Generic / custom HMAC provider for arbitrary webhook sources

### Distribution

- **DIST-01**: npm publishing pipeline (release-please or changesets)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Built-in delivery-ID dedup store (GitHub/Shopify replay defense) | Stateful; belongs in user's app. Documented gap with Redis snippet in README. |
| Webhook event payload typing / event router | This is security middleware, not an event router. Users layer separately. |
| Non-Express framework adapters (Fastify, Koa, Hono) | Express-first is the differentiator and project scope. |
| Vendor SDK dependencies (`stripe`, `@octokit/webhooks`) | Footprint goal: validate without buying into a vendor's full SDK. |
| Bundled retry / queue / DLQ | Out of scope — middleware validates, downstream handlers decide what to do next. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Pending |
| FOUND-02 | Phase 1 | Pending |
| FOUND-03 | Phase 1 | Pending |
| FOUND-04 | Phase 1 | Pending |
| CRYP-01 | Phase 2 | Pending |
| CRYP-02 | Phase 2 | Pending |
| BODY-01 | Phase 3 | Pending |
| BODY-02 | Phase 3 | Pending |
| STRP-01 | Phase 4 | Pending |
| STRP-02 | Phase 4 | Pending |
| STRP-03 | Phase 4 | Pending |
| GHUB-01 | Phase 5 | Complete |
| GHUB-02 | Phase 5 | Complete |
| GHUB-03 | Phase 5 | Complete |
| SHOP-01 | Phase 5 | Complete |
| SHOP-02 | Phase 5 | Complete |
| API-01 | Phase 3 | Pending |
| API-02 | Phase 2 | Pending |
| API-03 | Phase 3 | Pending |
| API-04 | Phase 3 | Pending |
| QUAL-01 | Phase 6 | Pending |
| QUAL-02 | Phase 6 | Pending |
| QUAL-03 | Phase 6 | Pending |
| QUAL-04 | Phase 6 | Pending |
| DOCS-01 | Phase 7 | Pending |
| DOCS-02 | Phase 7 | Pending |
| DOCS-03 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0

**Per-phase counts:**
- Phase 1 (Foundation & Tooling): 4 — FOUND-01, FOUND-02, FOUND-03, FOUND-04
- Phase 2 (Crypto Core & Error Class): 3 — CRYP-01, CRYP-02, API-02
- Phase 3 (Body Handling & Public API Surface): 5 — BODY-01, BODY-02, API-01, API-03, API-04
- Phase 4 (Stripe Provider): 3 — STRP-01, STRP-02, STRP-03
- Phase 5 (GitHub & Shopify Providers): 5 — GHUB-01, GHUB-02, GHUB-03, SHOP-01, SHOP-02
- Phase 6 (Integration Tests, Coverage Gate & Negative-Case Audit): 4 — QUAL-01, QUAL-02, QUAL-03, QUAL-04
- Phase 7 (Documentation & Example App): 3 — DOCS-01, DOCS-02, DOCS-03

---
*Requirements defined: 2026-05-04*
*Last updated: 2026-05-05 after roadmap creation*
