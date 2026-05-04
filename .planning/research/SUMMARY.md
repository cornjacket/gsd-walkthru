# Research Summary: Express Webhook Validator

**Domain:** Express middleware library for validating HMAC webhook signatures (Stripe, GitHub, Shopify)
**Greenfield:** Yes
**Overall Confidence:** HIGH

## Executive Summary

A real fragmentation gap exists: developers integrating Stripe, GitHub, and Shopify webhooks must use three different validation patterns or hand-roll each. Stripe ships `webhooks.constructEvent` (not middleware, full SDK), `@octokit/webhooks` is tied to Octokit, and Shopify offers only doc snippets. A **unified, Express-first middleware API** with a pluggable provider abstraction is a defensible niche.

**Technical approach:** TypeScript on Node 20/22/24, Express 4.x + 5.x as peerDependencies, `tsup` for dual CJS/ESM build, Vitest + Supertest for testing. Cryptography uses only Node's built-in `crypto` module — no vendor SDK dependencies.

**Key risk mitigation:** Architecture explicitly addresses the most common integration footguns:
- Raw body capture via `express.json({ verify: callback })` before JSON parsing
- Constant-time signature comparison with `crypto.timingSafeEqual()` (with length-mismatch handling)
- Structured error responses with safe messages (no signature/secret leakage)
- Honest documentation about replay protection: Stripe enforces a timestamp window; GitHub/Shopify require server-side delivery-ID dedup that is out of scope

## Key Findings

### Stack — HIGH confidence

| Area | Choice | Rationale |
|------|--------|-----------|
| Language | TypeScript 6.0.3 | Strong types are part of the portfolio polish |
| Runtime | Node 20/22/24 LTS | Node 18 EOL April 2025; matrix-test all three |
| Web framework | Express 4.x and 5.x as **peerDependencies** | Don't lock users into a single major; supports both |
| Build | `tsup` | Zero-config dual CJS/ESM; simpler than tsc/Vite for libraries |
| Test runner | Vitest 4.x | ESM-native, 5–10× faster than Jest for TS/ESM |
| Integration tests | Supertest | De facto standard for Express |
| Lint/format | Biome (or ESLint flat config + Prettier as fallback) | Biome is one tool, faster; ESLint still has wider plugin ecosystem |
| Crypto | Node `crypto` (built-in) | Zero deps; constant-time compare via `crypto.timingSafeEqual` |
| Package format | Dual CJS/ESM via package.json `exports` map | 2026 standard for libraries |
| CI | GitHub Actions matrix on Node 20/22/24 + Express 4/5 | Catches version-skew bugs |

### Features — HIGH confidence

**Table stakes (P1, ship in v1 or it's broken):**
- HMAC validation for all three providers (Stripe, GitHub, Shopify)
- Raw body capture (the most common integration footgun)
- Constant-time signature comparison
- Structured 401 errors with `kind` field; never leak secrets/signatures
- Full TypeScript types (function signatures, options, augmented `req.webhook`)
- Stripe timestamp window enforcement (configurable, 5-min default)

**Differentiators vs existing solutions:**
- **Unified middleware shape** across all three providers (vs three different SDK patterns)
- **Express-first** — built for middleware, not adapted from generic helpers
- **Zero vendor SDK dependencies** — no `stripe`, no `@octokit/webhooks`
- **Honest replay-protection documentation** — explains the GitHub/Shopify gap rather than papering over it
- **Runnable example app** for portfolio reviewers to clone and try

**Per-provider signature schemes (verified against official docs):**

| Provider | Header | Algorithm | Encoding | What's Signed | Replay Defense |
|----------|--------|-----------|----------|---------------|----------------|
| Stripe | `Stripe-Signature: t=<ts>,v1=<hex>` | HMAC-SHA256 | hex | `${t}.${rawBody}` | Signed timestamp + window |
| GitHub | `X-Hub-Signature-256: sha256=<hex>` | HMAC-SHA256 | hex | rawBody only | None in signature; needs `X-GitHub-Delivery` dedup |
| Shopify | `X-Shopify-Hmac-Sha256: <base64>` | HMAC-SHA256 | **base64** | rawBody only | None in signature; needs delivery-ID dedup |

**Anti-features (out of scope, with reasoning):**
- Built-in delivery-ID dedup store — stateful, belongs in user's app; document instead
- Event payload typing / event router — this is security middleware, not an event router
- Non-Express frameworks (Fastify, Koa, Hono) — Express-first is the differentiator
- npm publishing in v1 — reusable across user's projects; publishing is a future step

**P2 (v1.x, after v1 ships):**
- Custom logging hooks
- Async secret resolution (function returning Promise<string>)
- Request type narrowing helpers

### Architecture — HIGH confidence

**Core abstraction:** A `Provider` interface with three required hooks:
- `extractSignature(req)` → header value(s)
- `buildSignedString(rawBody, headers)` → bytes to HMAC
- `extractMetadata(req)` → provider-specific event metadata (id, type, etc.)

**Public API:** Single factory:
```ts
createWebhookMiddleware(provider: 'stripe' | 'github' | 'shopify', options): RequestHandler
```
Mirrors the shape of `helmet()`, `cors()`, `express.json()` — familiar Express idiom.

**Request augmentation:** `req.webhook` typed as a discriminated union so downstream handlers narrow safely:
```ts
if (req.webhook?.provider === 'stripe') {
  req.webhook.eventId; // typed
}
```

**Data flow:**
1. Raw body captured (via custom raw-capture middleware mounted before validation)
2. Header(s) extracted
3. Signed string assembled per provider
4. HMAC computed with secret
5. Constant-time compare
6. (Stripe only) Timestamp tolerance check
7. JSON parse (deferred, after validation)
8. `req.webhook` attached
9. `next()` — or `next(WebhookValidationError)` on failure

**Build order (informs phases):**
1. Crypto utilities (`timingSafeCompare`, `computeHmac`) — foundation
2. `WebhookValidationError` class — used by every provider
3. `Provider` interface contract — abstract contract
4. **Stripe** first — richest case (timestamp), forces good abstraction
5. Factory middleware — composes provider + crypto + raw body
6. GitHub & Shopify — validate abstraction against simpler providers
7. Tests, example app, README, CI — polish

**Why Stripe first:** It exercises the full pipeline (timestamp window, multi-segment header). If the abstraction handles Stripe cleanly, GitHub and Shopify will fit. Doing it in reverse risks an under-powered abstraction.

### Pitfalls — HIGH confidence

**Critical (must address in Phase 1 / foundation):**
1. Naive `===` string compare → timing attack (use `crypto.timingSafeEqual` on equal-length Buffers)
2. `crypto.timingSafeEqual` throws on length mismatch — must early-return false on mismatch *before* calling
3. Raw body vs. parsed body mismatch — JSON re-stringification changes bytes; must capture raw
4. Express middleware ordering — `express.json()` before validation eats the raw body
5. Leaking signature material in errors/logs/stack traces
6. Stripe's multiple `v1=` segments during secret rotation — must accept any matching segment

**Provider-specific:**
- Stripe: timestamp tolerance misconfig (too long → replay risk; too short → clock skew false positives)
- GitHub: don't trust `X-Hub-Signature` (SHA-1, deprecated) — use `X-Hub-Signature-256`
- Shopify: **base64**, not hex — most common integration error

**Operational/DX:**
- Failing open if secret unconfigured (must fail closed)
- Mounting middleware globally and breaking non-webhook routes (must be route-scoped)
- TypeScript dual CJS/ESM exports map mistakes
- Express in `dependencies` instead of `peerDependencies`

## Roadmap Implications

**Suggested 3-phase structure (matches Standard granularity, ~3-5 plans per phase):**

### Phase 1: Foundation + Stripe
**Goal:** Working Stripe webhook validation middleware with full security correctness.
**Why first:** Stripe is the richest case (signed timestamp, multi-segment header). Building it first forces a strong abstraction.
**Deliverables:**
- Repo scaffold (TypeScript, tsup, Vitest, Biome/ESLint, GitHub Actions)
- `crypto` utilities (timing-safe compare, HMAC compute)
- `WebhookValidationError` class
- `Provider` interface
- Raw-body capture middleware
- StripeProvider implementation (with timestamp window)
- Factory middleware (`createWebhookMiddleware`)
- Unit tests for crypto + Stripe; integration tests against a real Express app

### Phase 2: GitHub + Shopify Providers
**Goal:** Multi-provider support — validates the abstraction against simpler providers.
**Why second:** If the Provider interface from Phase 1 fits GitHub & Shopify without modification, the abstraction is solid.
**Deliverables:**
- GitHubProvider (HMAC-SHA256, hex)
- ShopifyProvider (HMAC-SHA256, **base64** — different encoding tests)
- Per-provider unit + integration tests
- Refactor any abstraction creaks discovered

### Phase 3: Polish & Documentation
**Goal:** Reviewer-ready repo.
**Why last:** Polish is meaningless until functionality is locked.
**Deliverables:**
- Runnable example Express app showing all three providers
- Polished README (installation, per-provider quickstarts, security section, replay-protection caveats)
- High test coverage (>90%)
- CI green on Node 20/22/24 × Express 4/5
- Type-only re-exports verified

## Research Flags

**Phases needing further research:** None — all three providers have official, current documentation; HMAC patterns and Express idioms are well-established.

**Open questions for plan-phase:**
- Custom logging hook shape (defer to Phase 3 planning if it lands in v1.x)
- Express 4 vs 5 async error handling — does the middleware need version detection?
- Code example for GitHub/Shopify delivery-ID dedup in README (Redis snippet?)

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Stack | HIGH | Official docs verified; dual-publish is 2026 standard |
| Features | HIGH | Provider schemes verified against official Stripe/GitHub/Shopify docs |
| Architecture | HIGH | Provider abstraction mirrors Helmet/CORS pattern; raw-body via `verify` callback is documented Express idiom |
| Pitfalls | HIGH | Cross-referenced provider docs and security guidance |

**Overall: HIGH.** Ready to define requirements and create roadmap without further research.
