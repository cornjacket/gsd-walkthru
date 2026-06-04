# Architecture

How `express-webhook-validator` is built and why. For installation and usage, see the [README](./README.md).

The library is a small, layered TypeScript package built around a **provider registry** and a single **middleware factory**. A request flows: `rawBodyCapture` stashes the exact bytes → `createWebhookMiddleware(provider)` looks the provider up in the registry → the provider validates the HMAC signature over the raw body → on success the parsed payload and metadata land on `req.webhook`; on failure a `WebhookValidationError` is passed to `next(err)`.

## Design decisions

- **Provider registry.** `registerProvider(name, impl)` registers each provider via a self-executing side-effect import; `createWebhookMiddleware(provider, options)` does a synchronous registry lookup and **throws at startup** on an unknown provider — failures surface at boot, not on the first webhook.
- **Two raw-body capture surfaces.** A standalone `rawBodyCapture()` middleware *and* a `captureRawBody` verify-callback for `express.json({ verify })`. Both support either middleware-ordering style; raw bytes land at `req.rawBody` as a `Buffer`. Capturing the unparsed body is the single most common webhook-integration footgun, so the library makes it a first-class, explicit step.
- **Crypto core.** `computeHmac` returns a raw `Buffer` (no encoding baked in — each provider converts at its own boundary). `timingSafeCompare` is `Buffer`-only with a top-level length guard, giving constant-time comparison and avoiding the timing side-channel of a naive string `===`.
- **Leak-proof error model.** `WebhookValidationError { reason, provider, statusCode }` takes no `message`/`cause`; its `toJSON` whitelists only safe keys, so signature, secret, and body material **cannot** leak through serialization. Reasons use `lowercase_underscore` naming and are widened one at a time, each in the same commit as the test that exercises it.
- **The library never logs.** There are zero `console.*` calls anywhere in `src/`. Any disclosure decision is left to the consuming application, so the library can't accidentally write secrets to a log sink.
- **HMAC strategy diverges by provider — deliberately.**
  - **Stripe** signs `${timestamp}.${rawBody}` (UTF-8 string) and ships a signed timestamp, so the library enforces a configurable tolerance window (300s default), supports multi-`v1=` key rotation, and **parses JSON only after** the signature validates.
  - **GitHub** and **Shopify** sign the raw body **Buffer-direct** (GitHub → hex `sha256=…`; Shopify → base64). Neither signs a timestamp.
- **Honest replay posture.** Stripe gets a real timestamp-window defense. GitHub and Shopify expose `deliveryId` / `webhookId` on `req.webhook` for consumer-side dedup but ship **no built-in store** — stateful dedup belongs in the application, and the README documents the gap rather than overstating protection.
- **No vendor SDK dependencies.** Only Node's built-in `crypto`. Express is a `peerDependency` (`4.x || 5.x`), never bundled. This keeps the footprint small and reinforces the positioning: validate webhooks without buying into a vendor's entire SDK.

## Key decisions log

| Decision | Rationale |
|----------|-----------|
| Express-first, not framework-agnostic | Differentiator; tighter ergonomics for the dominant Node web framework. |
| Unified middleware shape across providers | Reduces mental overhead vs each SDK's own pattern — the main DX angle. |
| No vendor SDK dependencies | Small footprint; "validate without buying into a vendor's whole SDK." |
| Express as a `peerDependency` only | Never ship or bundle the host framework. |
| `timingSafeCompare` is Buffer-only with a length guard | Constant-time comparison; length mismatch returns `false` without a side-channel. |
| Structural leakage prevention (`toJSON` whitelist) | Makes secret/body leakage impossible by construction, not by discipline. |
| Provider registry + startup-time throw on unknown provider | Fail fast at boot, not per request. |
| Ship both raw-body surfaces | Supports either middleware-ordering style. |
| Library never logs (`console.*`-free `src/`) | No accidental signature/secret/body disclosure via logs. |
| Past-only tolerance; parse JSON after validation | Correct replay-window semantics; never parse an untrusted body before the HMAC check. |
| Three-way header-parse failure mapping | Distinguishes missing / malformed / mismatch precisely. |
| Buffer-direct HMAC for GitHub & Shopify | Avoids a lossy UTF-8 round-trip; matches each provider's signing rule. |
| Honest per-provider replay table in docs | "Documented honesty" — don't overstate GitHub/Shopify protection. |
| Enforcing >90% per-file coverage gate | Per-file thresholds stop one well-tested file from masking a thin one. |

## Code layout

| Path | What lives here |
|------|-----------------|
| `src/crypto/` | `computeHmac`, `timingSafeCompare` — the security primitives. |
| `src/providers/` | `registry.ts`, `stripe.ts`, `github.ts`, `shopify.ts`, `types.ts`. |
| `src/middleware.ts` | `createWebhookMiddleware` factory — the main entry point. |
| `src/raw-body/` | `rawBodyCapture()` middleware + `captureRawBody` verify callback. |
| `src/errors.ts`, `src/error-handler.ts` | `WebhookValidationError` + opt-in `webhookErrorHandler()`. |
| `src/index.ts` | Public barrel — named exports only (no `export *`). |
| `examples/example-app/` | Runnable three-provider demo. |

**Public exports:** `createWebhookMiddleware`, `rawBodyCapture`, `captureRawBody`, `webhookErrorHandler`, `WebhookValidationError`, `computeHmac`, `timingSafeCompare`, plus types (`WebhookMetadata`, the per-provider webhook types, `WebhookValidationReason`).

## Working on the project

- **Tests:** `npm test` (Vitest). An enforcing >90% per-file V8 coverage gate runs in CI on the Node 22 × Express 5.x cell, covering `src/crypto/**`, `src/providers/**`, and `src/middleware.ts`.
- **Build:** `npm run build` produces a dual ESM/CJS bundle with type declarations (tsup).
- **See it end-to-end:** `cd examples/example-app && npm install && npm start` — boots an Express server, fires three correctly-signed mock webhooks (Stripe/GitHub/Shopify, signed with independent Node `crypto` so the validator and signer genuinely agree), prints each validated `req.webhook`, and exits 0.
- **Where to look first:** `src/middleware.ts` to see the factory → registry → provider flow, then a provider such as `src/providers/stripe.ts` for the validation contract.

## Out of scope (by design)

Additional providers (Slack, Twilio, …); non-Express frameworks (Fastify, Koa, Hono); a built-in delivery-ID dedup store; typed event payloads beyond signature validation. The library is security middleware, not an event router.
