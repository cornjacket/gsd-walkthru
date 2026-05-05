# Express Webhook Validator

## What This Is

An Express-first middleware library that unifies HMAC signature validation across third-party webhook providers — Stripe, GitHub, and Shopify. Backend developers drop in one consistent middleware per provider, instead of stitching together each vendor's own pattern. Built as a reusable, portfolio-quality project.

## Core Value

A backend developer integrating any supported webhook provider can validate signatures correctly with one line of middleware — with replay protection where the provider supports it, and documented honesty about where it doesn't.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

- [ ] Validate Stripe webhook signatures with timestamp-window replay protection (configurable, 5-minute default)
- [ ] Validate GitHub webhook signatures (HMAC-SHA256 of raw body, `X-Hub-Signature-256`)
- [ ] Validate Shopify webhook signatures (HMAC-SHA256 of raw body, `X-Shopify-Hmac-Sha256`)
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
| Stripe replay protection on by default; GitHub/Shopify gap documented | Only Stripe signs a timestamp; honest documentation beats false promises | — Pending |
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
*Last updated: 2026-05-05 after Phase 1 (Foundation & Tooling) completion — TypeScript scaffold, dual CJS/ESM build via tsup, Vitest test runner, Biome lint/format, and 3×2 Node × Express CI matrix all green on first push.*
