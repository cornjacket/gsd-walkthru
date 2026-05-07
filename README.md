# express-webhook-validator

Express middleware for unified Hash-based Message Authentication Code (HMAC) webhook signature validation across **Stripe**, **GitHub**, and **Shopify**.

> **Status — v0.0.1 (in development).** Phase 3 of 7 complete: public API surface, raw-body capture, error class, opt-in error handler, and provider registry are shipped and tested. Per-provider signature verification (Stripe in Phase 4; GitHub & Shopify in Phase 5) is currently stubbed — calling `validate()` on a real provider throws `... not yet implemented`. The shape of the consumer API is stable; what's pending is the crypto inside each provider's `validate()`.

## What this is

A single, consistent Express middleware for verifying HMAC-signed webhook deliveries. Drop in one factory call per route and you get:

- Length-guarded, constant-time signature comparison
- Raw-body capture done correctly (the most common integration footgun)
- A discriminated `WebhookValidationError` class with no signature/secret/body bytes anywhere on it
- TypeScript types that narrow `req.webhook` per provider
- An opt-in error middleware that emits a sanitized `{ error, reason }` JSON response
- No vendor SDK dependencies — no `stripe`, no `@octokit/webhooks`

Express 4.x and 5.x are both supported via `peerDependencies`. Node ≥ 20.

## Webhooks, briefly

A webhook is an outbound HTTPS POST that a third-party service (Stripe, GitHub, Shopify, …) sends to a URL you've registered with them whenever an event happens. Your server is the receiver; the third party is the sender. Because the request arrives unsolicited from the public internet, **anyone can POST to that URL** — so the receiver has to prove the request actually came from the claimed sender before acting on it.

The standard proof is an HMAC: the sender computes `HMAC-SHA256(payload, sharedSecret)`, attaches the digest as a header, and your server recomputes the same HMAC and compares. If the digests match byte-for-byte, the request is authentic and untampered.

Three things have to be true for that comparison to actually be sound:

1. **You must hash the exact bytes the sender hashed.** Once `express.json()` parses the body, those bytes are gone — re-serializing the parsed object is *not* byte-identical. Raw-body capture has to happen *before* JSON parsing.
2. **The comparison must be constant-time.** Using `===` on hex digests leaks timing information about how many bytes matched and is a textbook side-channel.
3. **Replay must be addressed where possible.** Capturing a valid signed request and replaying it is undetectable from the signature alone — you need a signed timestamp (Stripe), a delivery ID + dedup store (GitHub, Shopify), or both.

This library handles (1) and (2) correctly out of the box. (3) is partly the library's job (Stripe timestamp window) and partly the consumer's (GitHub/Shopify delivery-ID dedup is documented; not bundled).

## Provider notes

Each provider differs in header shape, encoding, and what replay defenses are even possible. The library hides the per-provider mechanics behind one factory but the differences are real and worth knowing.

### Stripe

- Header: `Stripe-Signature: t=<unix-ts>,v1=<hex-digest>[,v1=<hex-digest>...]`
- Signed payload: `<t>.<rawBody>` (timestamp + dot + body) — *not* just the body
- Encoding: lower-case hex
- Replay protection: **yes** — the timestamp is signed, so a configurable tolerance window (5-minute default) rejects stale/replayed requests
- Multiple `v1=` segments are valid during secret rotation; any one matching segment is acceptance
- Provider-specific gotcha: hashing just the body (the obvious mistake) always fails — the `<t>.` prefix is mandatory

### GitHub

- Header: `X-Hub-Signature-256: sha256=<hex-digest>`
- Signed payload: `<rawBody>` only
- Encoding: lower-case hex
- Replay protection: **partial** — `X-GitHub-Delivery` is a UUID per delivery, surfaced on `req.webhook.deliveryId`, but defending against replay requires a server-side dedup store (Redis, DB) which is the consumer's responsibility
- Provider-specific gotcha: a deprecated `X-Hub-Signature` (SHA-1) header exists. This library does not honor it — only `X-Hub-Signature-256` is accepted

### Shopify

- Header: `X-Shopify-Hmac-Sha256: <base64-digest>`
- Signed payload: `<rawBody>` only
- Encoding: **base64** — not hex. This is the single most common source of "my signature doesn't match" reports against Shopify integrations
- Replay protection: **partial** — `X-Shopify-Webhook-Id` is surfaced on `req.webhook.webhookId` for consumer-side dedup, same as GitHub
- Topic is surfaced separately on `req.webhook.topic` from `X-Shopify-Topic`
- Provider-specific gotcha: hex-decoding the header (the natural assumption coming from Stripe/GitHub) silently produces a wrong-length comparison every time

## System-level data flow

How a webhook delivery reaches your code, end to end:

```
  ┌───────────────┐                               ┌──────────────────────────────┐
  │ Stripe /      │                               │ Your Express app             │
  │ GitHub /      │   1. Event happens            │                              │
  │ Shopify       │      (charge.succeeded,       │  POST /webhooks/stripe       │
  │  (event       │       push, orders/create)    │  POST /webhooks/github       │
  │   source)     │                               │  POST /webhooks/shopify      │
  └───────┬───────┘                               └────────────────┬─────────────┘
          │                                                        │
          │ 2. Sign:                                               │
          │    digest = HMAC-SHA256(payload, sharedSecret)         │
          │    payload differs per provider:                       │
          │      Stripe   → "<t>.<body>"                           │
          │      GitHub   → "<body>"                               │
          │      Shopify  → "<body>"                               │
          │                                                        │
          │ 3. HTTPS POST  ─────────────────────────────────────►  │
          │      headers: provider-specific signature header       │
          │      body:    raw JSON bytes                           │
          │                                                        │
          │ 4. (no response body needed beyond 2xx/4xx)            │
          │      ◄───────────────────────────────────────────────  │
          │                                                        │
          │ 5. Retries on non-2xx                                  │
          │    (each provider has its own retry policy)            │
          │                                                        │
   public internet                                       trust boundary
   (anyone can POST                                  (signature must match
    to your URL)                                      before any business
                                                      logic runs)
```

The library lives entirely on the right side of that boundary — between the inbound socket and your handler — and its single job is to make sure step 4 only returns 2xx for requests whose HMAC validates against the secret you configured.

## Internal data flow (within this package)

What the request actually traverses inside your Express pipeline once `express-webhook-validator` is mounted:

```
   inbound HTTPS POST  /webhooks/<provider>
            │
            ▼
  ┌──────────────────────────────────────────────────────────┐
  │  rawBodyCapture()                                        │
  │   — or —                                                 │
  │  express.json({ verify: captureRawBody })                │
  │                                                          │
  │  reads request stream (limit 1mb default, → 413)         │
  │  stashes Buffer at req.rawBody  ◄── exact bytes signed   │
  └──────────────────────────────────┬───────────────────────┘
                                     │
                                     ▼
  ┌──────────────────────────────────────────────────────────┐
  │  createWebhookMiddleware(providerName, { secret })       │
  │                                                          │
  │  call-time guards (throw plain Error):                   │
  │    • providerName must be in registry                    │
  │    • secret must be non-empty / non-whitespace           │
  │                                                          │
  │  request-time path:                                      │
  │    1. req.rawBody missing? → next(WebhookValidationError │
  │                                  reason: malformed_payload│
  │                                  statusCode: 400)        │
  │    2. registry lookup ─────► Provider.validate(req,      │
  │                                                  secret) │
  └──────────────────────────────────┬───────────────────────┘
                                     │
                  ┌──────────────────┴──────────────────┐
                  │                                     │
                  ▼                                     ▼
   ┌───────────────────────────────┐    ┌────────────────────────────────┐
   │  Provider.validate()          │    │  next(err)                     │
   │  (stripe.ts / github.ts /     │    │   → WebhookValidationError     │
   │   shopify.ts)                 │    │     reason ∈ {                 │
   │                               │    │       signature_mismatch,      │
   │  • parse provider header      │    │       timestamp_too_old,       │
   │  • computeHmac(rawBody,       │    │       missing_header,          │
   │                secret,        │    │       missing_secret,          │
   │                'sha256')      │    │       malformed_payload }      │
   │  • timingSafeCompare(         │    │                                │
   │      headerDigest, computed)  │    └─────────────┬──────────────────┘
   │  • (Stripe) check timestamp   │                  │
   │    against tolerance window   │                  │
   │  • returns WebhookMetadata    │                  │
   └──────────────┬────────────────┘                  │
                  │                                   │
                  ▼                                   ▼
   ┌───────────────────────────────┐    ┌────────────────────────────────┐
   │  req.webhook = metadata       │    │  webhookErrorHandler()         │
   │   (discriminated union;       │    │   (opt-in 4-arg middleware)    │
   │    narrows by                 │    │                                │
   │    req.webhook.provider)      │    │   instanceof check →           │
   │   next()                      │    │     res.status(err.statusCode) │
   └──────────────┬────────────────┘    │       .json({ error, reason }) │
                  │                     │                                │
                  ▼                     │   non-matching errors →        │
            your handler                │     pass through unchanged     │
            (business logic)            └────────────────────────────────┘
```

Three contracts make this layout work:

- **The middleware never writes to `res`.** All failure paths go through `next(err)`. The opt-in `webhookErrorHandler()` formats the response — or your own pipeline does. This keeps Sentry / structured logging / custom envelopes in the consumer's hands.
- **`WebhookValidationError` carries no sensitive data structurally.** No `cause`, no `details`, no `message` parameter — the message is auto-derived from `reason` + `provider`. `toJSON()` whitelists what gets serialized. Even a future maintainer adding a private field can't accidentally leak signature/secret/body bytes through the standard serialization path.
- **The library never logs.** Zero `console.*` calls. Logging is the consumer's choice and lives in the consumer's middleware.

## Quick example

```ts
import express from 'express';
import {
  createWebhookMiddleware,
  rawBodyCapture,
  webhookErrorHandler,
} from 'express-webhook-validator';

const app = express();

app.post(
  '/webhooks/stripe',
  rawBodyCapture(),
  createWebhookMiddleware('stripe', { secret: process.env.STRIPE_WEBHOOK_SECRET! }),
  (req, res) => {
    if (req.webhook?.provider === 'stripe') {
      // req.webhook.eventId, req.webhook.timestamp, req.webhook.parsed are typed
    }
    res.sendStatus(200);
  }
);

// Mount once, after all webhook routes. Optional — bring your own pipeline if preferred.
app.use(webhookErrorHandler());
```

The `'github'` and `'shopify'` providers register the same way; `req.webhook` narrows to the matching branch (`deliveryId` for GitHub, `topic` + `webhookId` for Shopify) once you check `req.webhook?.provider`.

## License

MIT — see [LICENSE](./LICENSE).
