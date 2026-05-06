# Phase 3: Body Handling & Public API Surface - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-06
**Phase:** 3-body-handling-public-api-surface
**Areas discussed:** Provider plumbing strategy, Raw-body capture mechanism, req.webhook discriminated union shape, 401 failure response shape

---

## Provider Plumbing Strategy

### Q1: Wire-up shape for the factory before any provider exists

| Option | Description | Selected |
|--------|-------------|----------|
| Provider registry | Provider interface + empty registry map. Factory looks up by name; throws if not registered. Phase 4 calls registerProvider('stripe', stripeProvider). Clean plugin separation. | ✓ |
| Throwing per-provider stubs | Phase 3 creates src/providers/stripe.ts, github.ts, shopify.ts with all methods throwing not_implemented. Factory has hardcoded switch. Phase 4-5 fills in stub methods. | |
| Factory throws at request time | Factory accepts provider as string, stores it, returns middleware that throws on actual requests. Minimal Phase 3 surface but mounting succeeds at startup. | |

**User's choice:** Provider registry (Recommended)

### Q2: Failure timing if provider not registered

| Option | Description | Selected |
|--------|-------------|----------|
| At factory call time | Throws synchronously the moment createWebhookMiddleware is called. Misconfiguration surfaces at app startup. PITFALLS #11 spirit. | ✓ |
| At first request | Factory returns middleware regardless; throws on first incoming request if provider was never registered. Closer to lazy-load. | |
| Both — startup-time AND request-time guards | Belt-and-suspenders; catches no-registration AND hypothetical de-registration. | |

**User's choice:** At factory call time (Recommended)

### Q3: Registration mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Self-registering on import | Each provider module calls registerProvider at top level. Public barrel imports all three providers transparently. Zero ceremony. | ✓ |
| Consumer calls registerStripeProvider() explicitly | Library exports per-provider register functions. Clear graph of which providers are used; better tree-shaking signal. | |
| Auto-register inside the factory call itself | Factory lazy-imports './providers/stripe' when 'stripe' first requested. Dynamic import complicates dual CJS/ESM build. | |

**User's choice:** Self-registering on import (Recommended)

### Q4: Error type for unknown provider

| Option | Description | Selected |
|--------|-------------|----------|
| Plain Error with actionable message | throw new Error("Unknown provider 'stripe' — ..."). Keeps WebhookValidationError focused on request-time HTTP validation. Node convention for misuse. | ✓ |
| Extend WebhookValidationReason with 'unknown_provider' | Widen the union per Phase 2 D-07. Reason: 'unknown_provider', statusCode: 500. Conflates config errors with validation errors. | |
| New WebhookConfigError class | Sibling error class for setup/configuration mistakes. Clean separation but adds a second public error type. | |

**User's choice:** Plain Error with actionable message (Recommended)

**Notes:** All four answers were the recommended option. Provider plumbing settled in one round of 4 questions.

---

## Raw-Body Capture Mechanism

### Q1: What does Phase 3 ship to satisfy SC2 (both integration patterns must work)?

| Option | Description | Selected |
|--------|-------------|----------|
| Both — standalone middleware AND verify() helper | Ship rawBodyCapture() AND captureRawBody helper. Both paths set req.rawBody to same Buffer. | ✓ |
| Standalone middleware only; verify() pattern documented in README | Ship rawBodyCapture() only; the verify() integration is a one-line snippet in README. | |
| verify()-helper only | Don't ship standalone middleware. Forces one integration shape. Contradicts SC2. | |

**User's choice:** Both — standalone middleware AND verify() helper (Recommended)

### Q2: Where does the raw body land on req?

| Option | Description | Selected |
|--------|-------------|----------|
| req.rawBody as Buffer | Standard Express convention. TypeScript declaration merging extends Express.Request with rawBody?: Buffer. | ✓ |
| Stash on req.webhook.rawBody | Single namespace for everything webhook-related. Pollutes the discriminated union with raw bytes. | |
| Symbol-keyed property | Non-enumerable Symbol key. Stays out of accidental logging but opaque to debugging. | |

**User's choice:** req.rawBody as Buffer (Recommended)

### Q3: Missing req.rawBody at validation time — how to handle?

| Option | Description | Selected |
|--------|-------------|----------|
| Throw with new 'malformed_payload' reason | Widen WebhookValidationReason union (Phase 2 D-07 anticipated this). statusCode: 400. Same commit as test. | ✓ |
| Throw plain Error explaining the misconfiguration | Matches plain-Error-for-config-mistakes pattern from Area 1, but happens at request time. | |
| Return 500 silently with empty body | Status 500, no body, no signal. Breaks debuggability. | |

**User's choice:** Throw with new 'malformed_payload' reason (Recommended)

### Q4: Body-size limit?

| Option | Description | Selected |
|--------|-------------|----------|
| Default limit + configurable override | rawBodyCapture({ limit: '1mb' }) by default. Mitigates pre-validation memory-DoS. | ✓ |
| No limit; rely on consumer's reverse proxy/load balancer | Library captures whatever comes in. Footgun for vanilla Node setups. | |
| Hard cap at 1mb, not configurable | Stripe/GitHub/Shopify v1 payloads all fit. Removes a config knob and misconfiguration risk. | |

**User's choice:** Default limit + configurable override (Recommended)

**Notes:** All four answers were the recommended option. Raw-body capture settled in one round of 4 questions.

---

## req.webhook Discriminated Union Shape

### Q1: How wide are the per-provider branches in Phase 3?

| Option | Description | Selected |
|--------|-------------|----------|
| Full per-provider fields per ARCHITECTURE.md | All three branches with the fields Phase 4-5 will populate. Sources: ARCHITECTURE.md system overview + REQUIREMENTS.md GHUB-03/SHOP-02. | ✓ |
| Minimal: provider discriminator + common fields only | Each branch has just { provider, parsed }. Phase 4-5 widens. SC3's narrowing test can't pass without provider-specific fields. | |
| Provider discriminator only | Just the discriminator. Phase 4-5 immediately rewrites each branch. | |

**User's choice:** Full per-provider fields per ARCHITECTURE.md (Recommended)

### Q2: Where do the branch types live?

| Option | Description | Selected |
|--------|-------------|----------|
| Co-located in each provider module | src/providers/stripe.ts exports type StripeWebhook. Central src/types.ts re-exports the union. | ✓ |
| Centralized in src/types.ts | All three branches in one file. Phase 4-5 must edit central file to widen branches. | |
| Defined inline in src/middleware.ts | Branch types live next to the factory. middleware.ts becomes a junk drawer. | |

**User's choice:** Co-located in each provider module (Recommended)

### Q3: How does req.webhook attach to Express.Request?

| Option | Description | Selected |
|--------|-------------|----------|
| Global declaration merging | declare global { namespace Express { interface Request { webhook?: WebhookMetadata } } }. Canonical Express-extension pattern. | ✓ |
| Generic typed handler wrapper | stripeWebhookHandler<T>() wrapper. REQUIREMENTS.md DX-03 explicitly defers to v2. | |
| Cast at consumer site | (req as Request & { webhook: WebhookMetadata }).webhook. Contradicts SC3's "narrows" phrasing. | |

**User's choice:** Global declaration merging on Express.Request (Recommended)

### Q4: Optionality of req.webhook

| Option | Description | Selected |
|--------|-------------|----------|
| Optional on Request, narrows to required after middleware runs | Global declaration: webhook?: WebhookMetadata. Middleware's typed signature narrows in next() continuation. | ✓ |
| Always optional everywhere | webhook?: WebhookMetadata in all contexts. Consumers must write `req.webhook?.provider === 'stripe'`. | |
| Always required (non-optional) | webhook: WebhookMetadata everywhere. Routes without webhook middleware lie at compile time. | |

**User's choice:** Optional on Request, narrows to required after middleware runs (Recommended)

**Notes:** All four answers were the recommended option. req.webhook shape settled in one round of 4 questions.

---

## 401 Failure Response Shape

### Q1: Direct response or delegate to Express error chain?

| Option | Description | Selected |
|--------|-------------|----------|
| Delegate via next(err) to Express error handler | Middleware does `next(new WebhookValidationError(...))`. Library ships opt-in webhookErrorHandler(). Idiomatic Express. | ✓ |
| Respond directly with res.status(401).json(...) | Middleware writes 401 itself, never calls next(err). Zero ceremony but consumers can't intercept. | |
| Respond directly by default; opt-out via { passThroughErrors: true } | Hybrid. Default direct response; opt-out switches to next(err). Two code paths to test. | |

**User's choice:** Delegate via next(err) to Express error handler (Recommended)

### Q2: Default webhookErrorHandler() response shape

| Option | Description | Selected |
|--------|-------------|----------|
| Status + minimal JSON: { error: 'unauthorized', reason } | Programmatic signal via discriminated reason; generic phrase for human readability. Safe per SC4. | ✓ |
| Status + plain text body: 'Unauthorized' | Smallest possible response. No programmatic signal; debuggability suffers. | |
| Status only, empty body | Most opaque; nothing leaked, ever. No signal at all in browser dev tools or test assertions. | |

**User's choice:** Status + minimal JSON: { error: 'unauthorized', reason } (Recommended)

### Q3: Server-side logging stance

| Option | Description | Selected |
|--------|-------------|----------|
| Library never logs; consumer's error handler decides | No console.log/console.error/debug() from anywhere in src/. Phase 2 D-11 already guarantees no leakage in serialization. | ✓ |
| Library logs reason + provider via a debug() hook | Use the debug npm package. Pulls in a runtime dependency; PROJECT.md tension. | |
| Provide an onError callback option | Consumer-supplied logging hook. REQUIREMENTS.md DX-01 explicitly defers to v2. | |

**User's choice:** Library never logs; consumer's error handler decides (Recommended)

### Q4: Default error handler — opt-in or auto-mounted?

| Option | Description | Selected |
|--------|-------------|----------|
| Opt-in — consumer calls app.use(webhookErrorHandler()) | Library exports the factory; README quickstart shows mounting. Idiomatic Express. | ✓ |
| Auto-mount on the same Router as the validation middleware | createWebhookMiddleware returns a Router with both handlers. One-line mount but harder to override. | |
| No default error handler — consumer must write their own | Zero opinion in the library. Every consumer writes the same boilerplate. | |

**User's choice:** Opt-in — consumer calls app.use(webhookErrorHandler()) (Recommended)

**Notes:** All four answers were the recommended option. Failure response shape settled in one round of 4 questions.

---

## Claude's Discretion

The following implementation details were left to the planner/executor (per CONTEXT.md `<decisions>` "Claude's Discretion" subsection):

- Exact file split inside `src/raw-body/` (separate `middleware.ts`/`verify.ts` vs co-located `index.ts`)
- Whether `Provider` interface lives in `src/providers/types.ts` or `src/types.ts`
- Whether the registry uses `Map<string, Provider>` or plain `Record<string, Provider>`
- Exact wording of error messages for unknown provider and missing rawBody (human-readable surface only)
- Whether `WebhookMetadata`'s `parsed` field is `Record<string, unknown>` or `unknown`
- Whether the error handler's "generic phrase" varies by status code or stays uniform
- Whether `rawBodyCapture()` accepts a `contentTypes` filter option
- Implementation of body-size limit (use `raw-body` npm package vs roll a minimal stream consumer)

## Deferred Ideas

- Async secret resolution (DX-02 v2)
- Custom logging hook / `onError` callback (DX-01 v2)
- Per-route TypeScript helpers (DX-03 v2)
- `onReplayWarning` callback (Phase 4 — Stripe replay)
- `signature` field on `req.webhook` for debugging (rejected per SC4 no-leakage)
- Additional reason values: `invalid_signature_format` (Phase 4), `invalid_encoding` (Phase 5)
- Coverage gate >90% on core (QUAL-03; Phase 6)
- Negative-case audit (QUAL-04; Phase 6)
- README quickstart and security notes (DOCS-01, DOCS-02; Phase 7)
- Runnable example app (DOCS-03; Phase 7)

---

*Discussion conducted via /gsd-discuss-phase on 2026-05-06.*
*Mode: default (4 questions per area, 4 areas, 16 total decisions captured).*
*All 16 user selections were the recommended option — no deviations from the proposed shape.*
