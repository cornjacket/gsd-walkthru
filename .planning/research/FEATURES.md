# Feature Research: Express Webhook Signature Validation Middleware

**Domain:** Express middleware for unified HMAC-SHA256 webhook signature validation across Stripe, GitHub, and Shopify

**Researched:** 2026-05-04

**Confidence:** HIGH (Official provider documentation verified; existing library patterns confirmed)

## Provider-Specific Signature Schemes

### Stripe

| Property | Value |
|----------|-------|
| **Header Name** | `Stripe-Signature` |
| **Hash Algorithm** | HMAC-SHA256 |
| **What Gets Signed** | Timestamp (as string) + "." + JSON request body (raw) |
| **Signature Format** | `t=<timestamp>,v1=<hex-encoded-signature>[,v0=...]` |
| **Timestamp Tolerance** | Default 5 minutes (300 seconds), configurable |
| **Encoding** | Hex-encoded signature; ignore `v0` signatures (legacy), only accept `v1` |
| **Signature Material** | `[timestamp].[body]` — concatenated with period separator |
| **Recommended Env Var** | `STRIPE_WEBHOOK_SECRET` or `STRIPE_SIGNING_SECRET` |
| **Key Gotchas** | Multiple signatures in header (v0, v1, v2) — ignore non-v1; timestamp is critical; body must be raw bytes, not parsed JSON |

### GitHub

| Property | Value |
|----------|-------|
| **Header Name** | `X-Hub-Signature-256` |
| **Hash Algorithm** | HMAC-SHA256 |
| **What Gets Signed** | Raw request body only (no timestamp) |
| **Signature Format** | `sha256=<hex-encoded-signature>` |
| **Timestamp/Delivery Tracking** | No timestamp in signature; separate `X-GitHub-Delivery` header contains UUID for dedup (app-side responsibility) |
| **Encoding** | Hex-encoded |
| **Signature Material** | Raw body bytes only |
| **Recommended Env Var** | `GITHUB_WEBHOOK_SECRET` |
| **Replay Protection** | Not provided by provider; requires server-side delivery-ID deduplication (out of scope for this library) |
| **Key Gotchas** | No replay protection via signature; must handle body as raw bytes; GitHub allows fallback to SHA-1 (X-Hub-Signature) for legacy, but SHA-256 is preferred |

### Shopify

| Property | Value |
|----------|-------|
| **Header Name** | `X-Shopify-Hmac-SHA256` |
| **Hash Algorithm** | HMAC-SHA256 |
| **What Gets Signed** | Raw request body only (no timestamp) |
| **Signature Format** | Base64-encoded HMAC digest |
| **Timestamp/Delivery Tracking** | No timestamp; separate `X-Shopify-Webhook-Id` header for idempotency tracking (app-side responsibility) |
| **Encoding** | Base64 (unlike GitHub's hex) — this is the critical difference |
| **Signature Material** | Raw body bytes only |
| **Recommended Env Var** | `SHOPIFY_WEBHOOK_SECRET` or `SHOPIFY_API_SECRET` |
| **Replay Protection** | Not provided; requires server-side webhook-ID deduplication |
| **Key Gotchas** | Base64 encoding (not hex); must use raw body; secret rotation takes up to 1 hour to propagate; app collision with other Shopify secrets possible without clear naming |

## Feature Landscape

### Table Stakes (Users Expect These)

Features without which the library is fundamentally broken or unsafe.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Stripe HMAC-SHA256 signature validation with timestamp-window replay protection | Core use case; Stripe is the dominant webhook provider in e-commerce/SaaS | MEDIUM | Must handle `t=` and `v1=` header parsing; default 5-minute window; reject on window breach |
| GitHub HMAC-SHA256 signature validation | Core use case; GitHub webhooks are standard for CI/automation teams | MEDIUM | Header parsing for `sha256=` prefix; hex decode; no timestamp component |
| Shopify HMAC-SHA256 signature validation | Core use case; Shopify is dominant e-commerce webhook provider | MEDIUM | Base64 encoding (critical difference from GitHub); header parsing for raw digest |
| Raw body capture before JSON parsing | Without this, all signature validation fails (body is modified by `express.json()`) | MEDIUM | Must support middleware ordering pattern: `app.post('/stripe', express.raw({...}), validateStripe())` or `bodyParser.json({verify})` option |
| Constant-time signature comparison | Without this, timing attacks leak signature material | LOW | Use `crypto.timingSafeEqual()` instead of `===` or `==` |
| 4xx (e.g., 401) error response on validation failure | Standard HTTP convention for auth failures | LOW | Return 401 Unauthorized, never 500 |
| No signature/secret/body material in error messages or logs | Security requirement; prevents information leakage in error traces | LOW | Generic error messages only; log validation outcome without sensitive data |
| Express middleware shape (compatible with `app.use()`, route handlers, etc.) | Required to fit into Express ecosystem | LOW | Standard `(req, res, next)` signature; support both per-route and app-level mounting |
| TypeScript definitions with full type coverage | Required for portfolio quality; users expect modern Node libraries to be typed | LOW | Ship `.d.ts` files; type signature verification outcomes |

### Differentiators (Competitive Advantage)

Features that set this library apart from `stripe.webhooks.constructEvent`, `@octokit/webhooks`, and hand-rolled solutions.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Unified middleware API across all three providers** | Users integrate Stripe, GitHub, and Shopify without learning three different APIs; consistent error handling across all three | MEDIUM | Single middleware shape: `validateWebhook(provider, secret, options)` instead of `stripe.webhooks.constructEvent`, `webhooks.verify`, custom code for Shopify |
| **Express-first design, not framework-agnostic** | Tighter DX than libraries trying to support Fastify/Koa/Hono; middleware composes naturally with existing Express patterns | LOW | Leverage Express conventions; don't add abstraction layers; no attempt to run on other frameworks |
| **Zero vendor SDK dependencies** | Lightweight (only uses Node built-in `crypto`); users don't have to buy into Stripe SDK, Octokit, etc. | LOW | `npm install stripe` pulls 50+ dependencies; this library is ~5KB, zero deps; users get validation without SDK overhead |
| **Detailed, actionable errors without leaking internals** | Similar to HookInbox/Adyen pattern: errors include failure kind (`timestamp_too_old`, `signature_mismatch`, `missing_header`) instead of generic "verification failed" | MEDIUM | Structured error object with `kind`, `timestamp_age_seconds`, etc.; safe for logging; helps debugging |
| **Per-provider timestamp tolerance configuration** | Only Stripe supports timestamps; users configure tolerance (default 5 min) at middleware init, not per-request | LOW | `{tolerance: 300}` option; document that GitHub/Shopify don't support this |
| **Documented honesty about replay protection gaps** | Unlike other libraries that hide it, explicitly document that GitHub/Shopify don't sign timestamps and require server-side delivery-ID dedup (out of scope) | LOW | In docs and errors, state clearly: "Stripe: timestamp-protected. GitHub/Shopify: no replay protection—use delivery-ID dedup in your app" |
| **TypeScript request type narrowing (optional)** | Middleware can narrow `req` type to indicate signature was validated, enabling stricter type checking in handlers | HIGH | e.g., `ValidatedWebhookRequest<'stripe'>` type that narrows handler expectations; optional but powerful for type-safe handlers |
| **Custom logging hooks** | Users can plug in structured logging, span tracing, metrics without monkey-patching | MEDIUM | `onSuccess`, `onFailure` callbacks that receive validation context; allows integration with Winston, Pino, APM tools |

### Anti-Features (Deliberately NOT Building)

These seem valuable but create problems. Documented here to prevent re-scoping.

| Feature | Why Requested | Why Problematic | Alternative / Reasoning |
|---------|---------------|-----------------|-------------|
| **Built-in delivery-ID deduplication store** | GitHub/Shopify replay protection requires tracking seen delivery IDs; seems like a library should handle it | Dedup is stateful, requires a database or in-memory store; belongs in user's application logic, not a pure middleware library; tightly coupled to user's infrastructure (Redis vs DB vs in-memory vs distributed) | Document the gap and provide clear guidance: store `X-GitHub-Delivery` / `X-Shopify-Webhook-Id` in your app's database, check before processing. Provide example code in README. |
| **Webhook event parsing and typed payloads** | Users want `req.body` to be strongly typed (e.g., `StripeEvent`, `GitHubWebhookPayload`) | Out of scope for a security middleware; event payloads change frequently; type generation requires SDK dependencies or manual definitions; users have different type needs (some want full Stripe types, others want minimal) | This is validation-only. Provide example of how to layer `stripe-event-types` on top for users who want it. |
| **Non-Express framework adapters** (Fastify, Koa, Hono, etc.) | Other frameworks are popular; seems like a library should be portable | Express-first is the differentiator; supporting multiple frameworks adds complexity (different error handling, middleware shapes, raw body patterns) and dilutes focus; can be added in v2+ if demand is high | Start with Express only. If ported later, make it a separate package (`@library/webhook-fastify`, etc.). |
| **Built-in webhook endpoint registration and management** | Some platforms (e.g., AWS API Gateway) need explicit route setup; library could expose a route factory | This is application-specific; users have different routing needs (nested routes, auth, logging); framework-agnostic route generation is too abstract | Provide clear example app showing recommended routing patterns. Users wire their own routes. |
| **npm publishing and semver guarantees** | Seems like a public library should be on npm | v1 is a learning/portfolio project; publishing before portfolio validation is premature; publishing adds governance overhead (security advisories, breaking change communication, etc.) | Ship on GitHub with portfolio-quality docs and example app. Publishing is a v2 goal after validation. |
| **Cloudflare Workers / Edge Runtime Support** | Edge functions are increasingly popular; library should work everywhere | Requires testing on runtimes without `crypto` module or with different APIs; adds complexity; Node.js is the primary v1 target | Keep to Node.js in v1. Add to roadmap for v2 if edge adoption is proven. |
| **CRON-based health checks and event log persistence** | Users want to know if webhook is down; might want to replay failed deliveries | Belongs in an orchestration/queueing layer, not validation middleware; users have different replay strategies (manual vs automatic, time windows, etc.) | Document recommended patterns: queue webhooks, implement health checks in your app, use providers' replay UI. |
| **Automatic signature header field detection** | Some providers might change header names; library could auto-detect | Breaking contract with documentation; users need explicit control; auto-detection hides configuration errors; defeats purpose of "know what you're validating" | Require explicit provider name. Validate header names at initialization. |

## Feature Dependencies

```
[Stripe Signature Validation]
    └──requires──> [Raw Body Capture]
                       └──requires──> [Express Body Handling Strategy]

[GitHub Signature Validation]
    └──requires──> [Raw Body Capture]

[Shopify Signature Validation]
    └──requires──> [Raw Body Capture]
    └──requires──> [Base64 Decoding]

[Constant-Time Comparison]
    └──enhances──> [All Signature Validations] (security hardening)

[Timestamp Validation (Stripe)]
    └──requires──> [Stripe Signature Validation]

[Error Handling with Safe Messages]
    └──enhances──> [All Signature Validations]

[TypeScript Type Narrowing]
    └──optional enhancement to──> [Express Middleware Shape]
```

### Dependency Notes

- **Raw Body Capture requires Express Body Handling Strategy:** All three providers sign the raw body; Express's default `json()` middleware consumes and loses the raw body. Solution must support: (1) `express.raw()` on webhook routes before JSON parsing, or (2) body-parser's `verify` option to capture raw before parsing. Both must be documented with examples.

- **Timestamp Validation requires Stripe Signature Validation:** Only Stripe includes timestamp; signature verification must parse the `t=` field from header before comparing timestamp age.

- **Base64 Decoding required for Shopify:** Unlike GitHub's hex encoding, Shopify uses Base64. Decoding step must happen before `timingSafeEqual()` comparison.

- **Error Handling enhances all validations:** Clear, safe error messages reduce debugging friction; must be consistent across providers.

- **TypeScript Type Narrowing optional but powerful:** Middleware can narrow req type to `ValidatedWebhookRequest` to prevent accidental use of unvalidated bodies in downstream handlers.

## Provider-Specific Features & Gotchas

### Stripe-Specific

| Feature | Detail |
|---------|--------|
| **Timestamp Format** | Passed as Unix seconds in `t=` field, as a string |
| **Multiple Signatures** | Header may include `v1=`, `v0=`, `v2=` signatures; must ignore all but current `v1` |
| **Signature Scheme Versioning** | Currently v1 is live; document that we only accept v1 to prevent downgrade attacks |
| **Tolerance Window** | Default 5 minutes; must be configurable; reject requests older than tolerance without processing |
| **Real Gotcha: Body Modifications** | If body is modified after signature generation (even whitespace), validation fails; Express order matters |
| **Real Gotcha: Encoding** | Stripe sends JSON body as-is; must preserve UTF-8 encoding, line endings, etc. exactly |

### GitHub-Specific

| Feature | Detail |
|---------|--------|
| **Delivery ID** | `X-GitHub-Delivery` header contains UUID; separate from signature but used for replay dedup (app responsibility) |
| **No Timestamp** | Only body is signed; no timestamp protection; replay = same webhook, same signature, same delivery ID (provider resends if timeout) |
| **Fallback Signature** | May also include legacy `X-Hub-Signature` (SHA-1); recommend X-Hub-Signature-256 but both exist |
| **Real Gotcha: Multiple Signing Methods** | If both SHA-1 and SHA-256 headers present, must check correct one; clearly document which to use |
| **Real Gotcha: Delivery Duplication** | GitHub retries for up to 3 days with exponential backoff; same delivery ID = same event; dedup is critical |

### Shopify-Specific

| Feature | Detail |
|---------|--------|
| **Base64 Encoding** | Unlike GitHub (hex), Shopify encodes signature in Base64; this is the most common integration footgun |
| **Webhook ID** | `X-Shopify-Webhook-Id` is separate header for idempotency (app responsibility) |
| **No Timestamp** | Same situation as GitHub: no replay protection via signature |
| **Secret Rotation** | When API secret is rotated, new secret takes up to 1 hour to propagate; during rotation window, both old and new secrets may be valid (provider-side) |
| **Real Gotcha: Base64 vs Hex** | Developers copying GitHub code or examples using hex decoding will fail with Shopify; error message must clarify |
| **Real Gotcha: Secret Naming Collisions** | Shopify secrets can collide with other Shopify app secrets if not carefully namespaced; recommend `SHOPIFY_WEBHOOK_SECRET_<APP_ID>` |

## DX Features Backend Developers Expect

### Middleware Mounting Patterns

| Pattern | Expected? | How We Handle It |
|---------|-----------|------------------|
| **Per-route (Webhook endpoint only)** | YES | `app.post('/webhook/stripe', validateStripeWebhook(secret), handler)` — supported |
| **App-level (All routes protected)** | NO (rarely used) | Not recommended for webhooks; document why (all routes would need raw body handling); allow it but warn in docs |
| **Router-level (Sub-routes)** | YES (if webhook routes are under `/webhooks/*`) | `router.post('/stripe', validateStripeWebhook(secret), handler)` — supported |

### Error Handling Patterns

| Pattern | Details |
|---------|---------|
| **Return 401 on signature failure** | Standard HTTP convention; expected by webhook senders |
| **No exception throwing in middleware** | Middleware should call `next(err)` with a structured error, not throw; allows Express error handler to manage response |
| **Structured error object** | Should include: `kind` (signature_mismatch, timestamp_too_old, etc.), `message` (safe for user, no secrets), `timestamp_age_seconds` (for Stripe) |
| **Logging-friendly** | Errors should be safe to pass to structured loggers (Winston, Pino) without leaking secrets |

### TypeScript Ergonomics

| Feature | Expected | How We Handle It |
|---------|----------|------------------|
| **Full `.d.ts` shipping** | YES | All types exported; no `// @ts-ignore` needed in user code |
| **Generic middleware type** | YES | `ValidateWebhookMiddleware<Provider, Body>` generic allows type narrowing |
| **Request type narrowing** | MAYBE (nice-to-have) | Optional `req.webhook` property narrowed to provider type; requires module augmentation in user's types |
| **Event payload typing** | NO (anti-feature) | Out of scope; users layer `stripe-event-types` if needed |
| **Configuration object typing** | YES | `StripeWebhookOptions { tolerance?: number }` typed cleanly |

### Configuration Shape

| Aspect | Expectation | Our Approach |
|--------|-------------|--------------|
| **Unified vs per-provider config** | Prefer unified | Single `validateWebhook(provider: 'stripe' | 'github' | 'shopify', secret, options)` shape |
| **Environment variables** | Encouraged but not forced | Document standard env var names; users pass in manually or via `process.env` |
| **Per-request override** | NOT expected | Config set at middleware init time; can't override per-request (signature is fixed at send time) |
| **Validation of missing secret** | YES, should fail fast | Throw at middleware init if secret is falsy; don't wait for request |
| **Sensible defaults** | YES | Stripe: 300s tolerance; GitHub/Shopify: no defaults (no timestamps); require explicit provider |

### Developer Experience Pitfalls to Address

| Pitfall | How We Prevent It | Documentation |
|---------|------------------|-----------------|
| **Body-parser ordering (most common)** | Provide clear example code with `express.raw()` or `bodyParser.json({verify})` | "Quick Start" shows both patterns; example app demonstrates correct setup |
| **Using parsed `req.body` for HMAC** | TypeError/validation failure message must hint at ordering; consider mentioning in error | "Debugging" section in docs: "Signature mismatch? Check body-parser order." |
| **Forgetting to handle `next(err)` in error case** | Middleware should call `next(err)` if validation fails, not throw | Example code shows both patterns (and why `next(err)` is safer) |
| **Not validating signatures because "it's only internal traffic"** | No runtime prevention; rely on docs + review + tests | Security section: "Always validate. Internal networks are vulnerable to internal threats." |
| **Using timing-based equality check** | We do `timingSafeEqual` internally; users can't bypass it | Transparent in code; no user decision point |
| **Leaking secrets in logs** | Generic error messages; middleware never logs signature, secret, or body | Docs: "Errors are safe to log." Example shows structured logging integration. |
| **Confusing base64 vs hex (Shopify vs GitHub)** | Document prominently; error message if user tries hex decode on Shopify | Provider config includes encoding detail in error messages if mismatch detected |

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept and meet core requirements from PROJECT.md.

- [ ] **Stripe signature validation** — core use case; timestamp-window replay protection with configurable tolerance (default 5 min); handle `t=` and `v1=` header format
- [ ] **GitHub signature validation** — core use case; HMAC-SHA256 of raw body, `X-Hub-Signature-256` header with `sha256=` prefix; document replay protection gap
- [ ] **Shopify signature validation** — core use case; HMAC-SHA256 of raw body, Base64-encoded `X-Shopify-Hmac-SHA256` header; document replay protection gap
- [ ] **Raw body handling** — support both `express.raw()` per-route and `bodyParser.json({verify})` patterns with clear examples
- [ ] **Constant-time signature comparison** — use `crypto.timingSafeEqual` internally; prevent timing attacks
- [ ] **Structured error responses** — 401 on validation failure; include failure `kind` (signature_mismatch, timestamp_too_old, missing_header) without leaking secrets
- [ ] **Express middleware shape** — standard `(req, res, next)` compatible with `app.use()` and route-level mounting
- [ ] **Full TypeScript support** — ship `.d.ts` files; type all public APIs; no `any` types in signatures
- [ ] **Comprehensive test coverage** — unit tests for signature validation logic; integration tests with real Express app; tests for all three providers
- [ ] **Polished README** — installation, per-provider quickstarts, body-parser setup guidance, security notes, debugging guide
- [ ] **Runnable example Express app** — demonstrates all three providers end-to-end; includes proper error handling and logging

### Add After Validation (v1.x)

Features to add once core is shipped and validated.

- [ ] **Custom logging hooks** — `onSuccess`, `onFailure` callbacks for integration with Winston/Pino; helps users with structured logging
- [ ] **Request type narrowing** — optional `req.webhook` property narrowed to provider type; improves TypeScript DX in handlers
- [ ] **Detailed diagnostics for debugging** — enhanced error messages with specific guidance (e.g., "Base64 decode failed—are you using Shopify? Shopify uses Base64, not hex.")

### Future Consideration (v2+)

Features to defer until product-market fit is established or broader scope emerges.

- [ ] **Additional providers** — Slack, Twilio, Paddle, etc. (expand from current Stripe/GitHub/Shopify focus)
- [ ] **npm publishing** — publish to npm once portfolio validation is complete; handle semver and security advisories
- [ ] **Framework adapters** — Fastify, Koa, Hono adapters if demand justifies (initially Express-only)
- [ ] **Edge runtime support** — Cloudflare Workers, Vercel Edge Functions (currently Node.js only)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Rationale |
|---------|------------|---------------------|----------|-----------|
| Stripe signature validation + timestamp protection | HIGH | MEDIUM | P1 | Core use case; largest user base; timestamp is differentiator |
| GitHub signature validation | HIGH | MEDIUM | P1 | Core use case; GitHub webhooks ubiquitous |
| Shopify signature validation | HIGH | MEDIUM | P1 | Core use case; Base64 gotcha requires careful handling |
| Raw body handling (express.raw / body-parser.json{verify}) | HIGH | MEDIUM | P1 | Without this, all validation breaks; most common integration failure point |
| Constant-time comparison | HIGH | LOW | P1 | Security critical; non-negotiable |
| Structured error responses | HIGH | LOW | P1 | Improves DX; prevents information leakage |
| TypeScript definitions | MEDIUM | LOW | P1 | Portfolio quality requirement |
| Comprehensive tests | MEDIUM | MEDIUM | P1 | Validation against real Express; confidence in shipping |
| README + example app | MEDIUM | MEDIUM | P1 | Portfolio credibility; demonstrates competence |
| Custom logging hooks | MEDIUM | MEDIUM | P2 | Nice-to-have; users can layer logging themselves; valuable for mature installs |
| Request type narrowing | MEDIUM | MEDIUM | P2 | Improves TypeScript DX; not critical for functionality |
| Detailed diagnostics/improved error messages | LOW | MEDIUM | P2 | Debugging aid; can iterate based on real usage feedback |
| npm publishing | LOW | LOW | P3 | v2+ goal; not blocking v1 validation |
| Non-Express framework support | LOW | HIGH | P3 | Express-first differentiator; multiframework support can wait |

**Priority key:**
- **P1:** Must have for v1 launch (portfolio-quality validation)
- **P2:** Should have in v1.x once core is stable; improves maturity
- **P3:** Future consideration; v2+ roadmap

## Competitor Feature Analysis

| Feature | Stripe SDK (`stripe.webhooks.constructEvent`) | `@octokit/webhooks` | Hand-Rolled Solutions | Our Approach |
|---------|----------------------------------------------|--------------------|-----------------------|--------------|
| **Unified API** | NO (Stripe-only) | NO (GitHub-only) | NO (provider-specific) | YES — single `validateWebhook()` across all three |
| **Replay Protection** | YES (Stripe timestamp) | Partial (delivery-ID only, no enforcement) | Varies | YES for Stripe via timestamp; explicit gap for GitHub/Shopify with guidance |
| **Framework Coupling** | Heavy (pulls full Stripe SDK; 50+ dependencies) | Tied to Octokit ecosystem; requires npm package | None or custom | Zero dependencies; lightweight |
| **TypeScript Support** | YES (full Stripe types) | YES | Varies | YES, full type coverage |
| **Error Handling** | Generic try-catch (users responsible for shape) | Error events + handlers | Custom per-project | Structured error objects with failure `kind` |
| **Express Middleware** | NOT native (requires wrapper) | Custom middleware available but not standard | Custom per-project | Native middleware shape; documented patterns |
| **Logging/Observability** | No hooks (users add logging manually) | Event handlers for logging | Custom | Optional logging callbacks for structured integration |
| **Documentation Quality** | Good (Stripe-centric) | Good (GitHub-centric) | Varies | Portfolio-quality README; multiple quickstarts; security section |
| **Runnable Example** | Snippet code; not end-to-end | Example in repo, GitHub-specific | Rare | Full example Express app, all three providers |
| **Express-First Design** | NO (general library) | NO (general library) | Varies | YES — optimized for Express DX |

## Confidence Justification

| Area | Confidence | Source | Notes |
|------|------------|--------|-------|
| **Stripe signature scheme** | HIGH | Official Stripe docs + HookRay 2026 guide | Exact header format, timestamp field, v1 versioning confirmed |
| **GitHub signature scheme** | HIGH | Official GitHub docs + research | `X-Hub-Signature-256`, hex encoding, no timestamp confirmed |
| **Shopify signature scheme** | HIGH | Official Shopify docs + community discussions | `X-Shopify-Hmac-SHA256`, Base64 encoding (critical difference) confirmed; gotchas documented |
| **Raw body handling gotchas** | HIGH | Multiple sources (express.raw docs, body-parser docs, Medium articles on webhook security) | express.raw() and bodyParser.json({verify}) patterns verified |
| **Constant-time comparison** | HIGH | Node.js crypto module docs + security best practices | `crypto.timingSafeEqual` is standard, confirmed across Stripe, GitHub, Shopify official docs |
| **DX expectations** | MEDIUM-HIGH | Reviewed Stripe SDK, @octokit/webhooks, HookInbox library patterns | Patterns consistent across existing solutions; custom logging hooks and type narrowing are differentiators, not expectations |
| **Error handling patterns** | HIGH | Express error-handling guide + research articles | 4xx status codes, error middleware, `next(err)` pattern confirmed |
| **TypeScript middleware patterns** | HIGH | LogRocket, evertpot, Steve Kinney resources | Generic middleware types, request type narrowing, module augmentation patterns verified |

## Sources

- [Stripe Webhook Documentation](https://docs.stripe.com/webhooks/build)
- [GitHub Webhook Signature Validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [Shopify Webhook HTTPS Setup](https://shopify.dev/docs/apps/build/webhooks/subscribe/https)
- [Webhook Signature Verification (HMAC-SHA256) in Node, Python, Ruby — 2026 Guide | HookRay](https://hookray.com/blog/webhook-signature-verification-2026)
- [How to Implement SHA256 Webhook Signature Verification](https://hookdeck.com/webhooks/guides/how-to-implement-sha256-webhook-signature-verification)
- [Hash-based Message Authentication Code (HMAC) - Docs](https://webhooks.fyi/security/hmac)
- [GitHub - HookInbox/hookinbox-verify: Zero-dependency webhook signature verification](https://github.com/HookInbox/hookinbox-verify)
- [GitHub - octokit/webhooks.js](https://github.com/octokit/webhooks.js)
- [Express Body-Parser Middleware](https://expressjs.com/en/resources/middleware/body-parser.html)
- [How to Get Raw Request Body with Express?](https://thewebdev.info/lesson/nodejs-tips/express-get-raw-body/)
- [Express Error Handling Patterns | Better Stack Community](https://betterstack.com/community/guides/scaling-nodejs/error-handling-express/)
- [Webhook Best Practices: Retry Logic, Idempotency, and Error Handling](https://dev.to/henry_hang/webhook-best-practices-retry-logic-idempotency-and-error-handling-27i3)
- [A Generic Middleware Pattern in Typescript](https://evertpot.com/generic-middleware/)
- [How to Extend the Express Request Object in TypeScript](https://blog.logrocket.com/extend-express-request-object-typescript/)
- [Building a Robust Webhook Handler in Node.js: Validation, Queuing, and Retry Logic](https://blog.ozigi.app/blog/robust-webhook-handler-in-nodejs)
- [Express Middleware Patterns: Composition, Error Handling, and Auth (2026 Guide)](https://dev.to/young_gao/middleware-patterns-in-express-composition-error-handling-and-auth-k16)

---

*Feature research for: Express webhook signature validation middleware*

*Researched: 2026-05-04*
