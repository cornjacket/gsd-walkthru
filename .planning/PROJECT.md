# Express Webhook Validator

## What This Is

An Express-first middleware library that unifies HMAC signature validation across third-party webhook providers — Stripe, GitHub, and Shopify. Backend developers drop in one consistent middleware per provider, instead of stitching together each vendor's own pattern. Built as a reusable, portfolio-quality project.

## Core Value

A backend developer integrating any supported webhook provider can validate signatures correctly with one line of middleware — with replay protection where the provider supports it, and documented honesty about where it doesn't.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- [x] Validate Stripe webhook signatures with timestamp-window replay protection (configurable, 5-minute default) — Validated in Phase 4: real `stripeProvider.validate()` (HMAC-SHA256, multi-`v1=` rotation, past-only tolerance, JSON-parse-after-HMAC) + 15 unit tests cover SC1–SC4 + D-13 negatives; STRP-01/STRP-02/STRP-03 all green; 86/86 suite passes.
- [x] Validate GitHub webhook signatures (HMAC-SHA256 of raw body, `X-Hub-Signature-256`) — Validated in Phase 5: real `githubProvider.validate()` (HMAC-SHA256 over rawBody Buffer-direct, `sha256=` prefix + hex-tail parse, deprecated SHA-1 header invisible to validator, three-way auth-header split fixing P4 WR-03 from day one) + 13 unit tests cover SC1+SC2+SC5; GHUB-01/GHUB-02/GHUB-03 all green; `req.webhook.deliveryId` surfaces `X-GitHub-Delivery` for downstream dedup.
- [x] Validate Shopify webhook signatures (HMAC-SHA256 of raw body, `X-Shopify-Hmac-Sha256`) — Validated in Phase 5: real `shopifyProvider.validate()` (HMAC-SHA256 over rawBody Buffer-direct, loose base64 decode, hex-as-base64 rejected via P2 D-09 length-mismatch path → `'signature_mismatch'`, NO reason union widening) + 11 unit tests cover SC3+SC4+SC5; SHOP-01/SHOP-02 all green; `req.webhook.topic` and `req.webhook.webhookId` surface `X-Shopify-Topic` + `X-Shopify-Webhook-Id` for downstream dedup.

### Active

<!-- Current scope. Building toward these. -->

- [ ] Provide a single consistent middleware API shape across all three providers
- [ ] Capture raw request body correctly (the most common integration footgun)
- [ ] Use constant-time comparison for signature verification
- [ ] Return clear, actionable errors on validation failure without leaking internals
- [ ] Ship full TypeScript types
- [ ] Comprehensive test coverage (unit + integration against a real Express app)
- [ ] Polished README with installation, per-provider quickstarts, and security notes
- [ ] Runnable example Express app demonstrating all three providers end-to-end

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Slack, Twilio, and other webhook providers — Stripe/GitHub/Shopify are the v1 target; broader provider support can come later
- Built-in delivery-ID deduplication store for GitHub/Shopify replay protection — stateful, belongs in the user's app, not a pure middleware library; documented as a gap with guidance instead
- Webhook event parsing or typed event payloads beyond signature validation — this is a security middleware, not an event router
- npm publishing — the project is reusable across the developer's own projects; public publishing is a possible future step, not a v1 goal
- Non-Express frameworks (Fastify, Koa, Hono) — Express-first is part of the differentiator

## Context

- Learning / portfolio project. Reviewer-facing quality bar: looks shippable from a GitHub README on first glance.
- The existing landscape is fragmented:
  - Stripe ships `stripe.webhooks.constructEvent` (not middleware; pulls in the full SDK)
  - GitHub has `@octokit/webhooks` (tied to Octokit's ecosystem)
  - Shopify has helper snippets in their docs (no canonical library)
  - There is no widely-used Express-first library that unifies all three
- Replay-protection landscape varies sharply by provider:
  - Stripe signs a timestamp alongside the body — full timestamp-window mitigation is possible
  - GitHub signs only the body and provides `X-GitHub-Delivery` (UUID) separately — replay defense requires server-side delivery-ID dedup
  - Shopify signs only the body — same situation as GitHub
- Common integration pitfalls to address explicitly:
  - Body-parser ordering: `express.json()` consumes the raw body before signature middleware sees it
  - Raw-body vs parsed-body mismatch in HMAC input
  - Timing attacks from naive string `===` comparison
  - Signature material accidentally surfacing in error messages or logs

## Constraints

- **Tech stack**: TypeScript; Express 4.x at minimum (5.x compatibility a goal); Node's built-in `crypto` for HMAC — no external crypto dependencies
- **Compatibility**: Must compose cleanly with `express.json()` / `express.urlencoded()` without breaking signature validation
- **Footprint**: No vendor SDK dependencies — don't pull in `stripe` or `@octokit/webhooks`
- **Security**: Constant-time comparison for signatures; no signature, secret, or body material in errors or logs

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Express-first, not framework-agnostic | Differentiates from existing libraries; tighter ergonomics for the dominant Node web framework | — Pending |
| Unified middleware shape across providers | Reduces mental overhead vs each SDK's own pattern; this is the project's main DX angle | — Pending |
| Stripe replay protection on by default; GitHub/Shopify gap documented | Only Stripe signs a timestamp; honest documentation beats false promises | Stripe shipped in Phase 4 (300s default tolerance, configurable, multi-`v1=` rotation); GitHub/Shopify validators shipped in Phase 5 with receipt-time `timestamp` (NOT provider-signed — honest about replay-defense gap); README docs deferred to Phase 7 |
| No built-in delivery-ID dedup store | Pure middleware library; stateful dedup belongs in the user's application | — Pending |
| Ship runnable example Express app | Portfolio reviewers can clone and run; concrete demos beat abstract claims | — Pending |
| No vendor SDK dependencies | Keeps footprint small; reinforces "validate without buying into a vendor's whole SDK" positioning | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-08 after Phase 5 (GitHub & Shopify Providers) completion — real `githubProvider.validate()` (HMAC-SHA256 over rawBody Buffer-direct, `sha256=<hex>` parse, deprecated SHA-1 header invisible per D-02, `eventId === deliveryId`) and `shopifyProvider.validate()` (HMAC-SHA256 over rawBody Buffer-direct, loose base64 decode, hex-as-base64 rejected via Phase 2 D-09 length-mismatch → `'signature_mismatch'`, `eventId === webhookId`). Phase 5 shipped Phase 4 WR-03 fix (D-10 three-way auth-header split — array → `'invalid_signature_format'`, not folded into `'missing_header'`) and Phase 4 WR-02 fix (D-14 mandatory outer-`expect(toThrow)` guard) from day one in BOTH new providers. NO new public exports, NO `WebhookValidationReason` union widening, NO touches to errors/middleware/index/registry/types/stripe — only `src/providers/{github,shopify}.{ts,test.ts}`. 110 tests green across 13 files (+24 from 86/11 baseline: 13 GitHub + 11 Shopify). 3 advisory code-review warnings (empty-string asymmetry untested, leakage assertion shape, leakage assertion not on tampered path) tracked in `05-REVIEW.md` for Phase 6 negative-case audit. Phase 6 (integration tests + coverage gate + cross-provider audit including the 5 advisory carry-overs from Phase 4 + 3 from Phase 5) and Phase 7 (README + example app) remain.*
