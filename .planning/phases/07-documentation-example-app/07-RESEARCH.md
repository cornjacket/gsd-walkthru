# Phase 7: Documentation & Example App - Research

**Researched:** 2026-06-03
**Domain:** Documentation patterns, OSS onboarding, example app architecture
**Confidence:** HIGH

## Summary

Phase 7 has two deliverables: (1) restructure the current 206-line README into canonical OSS shape (installation → per-provider quickstarts → configuration reference → security notes), preserving existing high-quality prose by demoting it below the fold; and (2) build a runnable example Express app that auto-fires three correctly-signed mock requests (Stripe, GitHub, Shopify) and prints validated `req.webhook` to stdout. The phase decisions (D-01..D-09) are locked and specific: exact section ordering, shippable-v1.0 framing, three copy-pasteable per-provider blocks, honest security notes covering raw-body handling and per-provider replay protection, and a mock sender that signs independently with Node crypto to demonstrate that the validator and sender agree.

The implementation is straightforward: the README reshapes existing content without inventing new material; the example app has no external dependencies beyond the library itself and standard Node crypto; and both components reference the already-verified (Phase 4–6) provider signatures. The main open question is version alignment: `package.json` is `0.0.1` while the README will present as v1.0 — this is flagged as Claude's Discretion and the planner should surface the decision.

**Primary recommendation:** Treat the phase decisions as locked (D-01..D-09) and focus planning on task ordering: README first (lower risk, reuses existing prose), then example app (depends on README security notes being finalized for content accuracy). The example app consumption model (local `file:`/workspace dependency to match real-world use) requires the library's `dist` to be available, so verify build pipeline is up to date before the example app executes.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| README structure & installation notes | Documentation | — | Static content, portfolio-quality narrative |
| Per-provider quickstarts & configuration reference | Documentation | Frontend (reader's integration code) | Shows real mounting patterns users will copy |
| Security notes (raw-body, timing, replay) | Documentation | API tier (library behavior) | Documents library-provided guarantees and gaps |
| Example app server bootstrap | Backend (Node.js / Express) | — | Runs locally, fires requests, prints results |
| Mock webhook sender (crypto signing) | Backend (Node.js / crypto) | — | Independent implementation proves validator correctness |
| Example app dependency resolution | Package Manager / Build | — | Local `file:`/workspace link + `npm install` |

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** README into canonical OSS shape — installation, per-provider quickstarts, configuration reference, security notes (top sections) with existing strong prose preserved-and-demoted below the fold
- **D-02:** Replace stale status banner with shippable-v1.0 framing; present all three providers as working
- **D-03:** Three self-contained, copy-pasteable per-provider quickstart blocks (Stripe, GitHub, Shopify) — allow repetition
- **D-04:** Headline `npm install express-webhook-validator` with one-line caveat that the package is not yet published (future step)
- **D-05:** Configuration reference table per export (option / type / default / description) covering `createWebhookMiddleware`, `rawBodyCapture`, `captureRawBody`, `webhookErrorHandler`
- **D-06:** Security notes MUST explicitly cover raw-body handling, constant-time comparison, and per-provider replay-protection landscape (Stripe timestamp window default on; GitHub/Shopify need consumer dedup)
- **D-07:** Example app one-shot demo — `npm start` boots server, auto-fires three signed requests, prints `req.webhook` to stdout, exits 0
- **D-08:** Example app consumes library by package name via local `file:`/workspace dependency (reads like real consumer code, not `../../src`)
- **D-09:** Mock sender signs with independent Node `crypto` (Stripe `t.body`, GitHub/Shopify raw body) — NOT imported from library, proves validator agreement

### Claude's Discretion
- **Version bump:** `package.json` is currently `0.0.1` while README will present as v1.0. Decide whether to bump to `1.0.0` for consistency or keep decoupled. Surface explicitly in plan.

### Deferred Ideas (OUT OF SCOPE)
- npm publishing — explicitly out of scope; install note (D-04) acknowledges as future step
- Built-in delivery-ID dedup store (GitHub/Shopify) — stateful, belongs in consumer app; documented as gap with guidance

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DOCS-01 | README includes installation, per-provider quickstarts, and configuration reference | Public exports verified; option names/defaults documented below |
| DOCS-02 | README includes security notes: raw-body handling, timing attacks, per-provider replay-protection caveats | Library behavior (Stripe tolerance defaults, GitHub/Shopify delivery-ID availability) documented |
| DOCS-03 | Runnable example app accepts mock signed payloads for all three providers, prints validated `req.webhook` to stdout | Signing rules (per-provider) extracted from source; example app architecture documented |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| express-webhook-validator | 0.0.1 (local library) | Webhook signature validation | This is the library being documented; imports from `src/index.ts` |
| Node.js `crypto` | builtin | HMAC-SHA256 signing (mock sender) | Phase 2 crypto primitives use it; mock sender uses same primitives to prove agreement |
| Express | 4.x / 5.x (peer) | Server framework (example app) | Library targets Express; example app demonstrates real integration |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `raw-body` | 3.0.0 | Raw request body capture (example app) | transitive dep of express; example app mounts it per documented pattern |

### Alternatives Considered
None — the phase is documentation + example, not a new technology choice. The configuration reference (D-05) and quickstarts (D-03) reference existing library exports; no alternatives exist.

**Installation (for example app):**
```bash
npm install express-webhook-validator
```

**Version verification:** Library is currently at `0.0.1` in `package.json` (verified 2026-06-03). Dual CJS/ESM exports with types configured; build pipeline (tsup) is confirmed working in Phase 1.

## Architecture Patterns

### System Architecture Diagram

The example app demonstrates the webhook validation lifecycle end-to-end:

```
┌──────────────────────────────────────────────────────────┐
│  Example App Server                                      │
│  (Express + library middleware)                          │
│                                                          │
│  POST /webhooks/stripe   ◄──┐                            │
│  POST /webhooks/github   ◄──┤ Mock sender fires 3        │
│  POST /webhooks/shopify  ◄──┘ signed requests            │
│                      │                                   │
│                      ▼                                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ rawBodyCapture()  or  express.json({verify})     │   │
│  │ Captures req.rawBody before JSON parsing         │   │
│  └──────────────────────────────────────────────────┘   │
│                      │                                   │
│                      ▼                                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ createWebhookMiddleware(provider, {secret})      │   │
│  │ Validates signature, sets req.webhook            │   │
│  └──────────────────────────────────────────────────┘   │
│                      │                                   │
│                      ▼                                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Handler: print req.webhook to stdout             │   │
│  │ Discriminate on req.webhook.provider             │   │
│  │ (stripe | github | shopify)                      │   │
│  └──────────────────────────────────────────────────┘   │
│                      │                                   │
│                      ▼ (success)                        │
│              console.log(req.webhook)                    │
│                      │                                   │
└──────────────────────────────────────────────────────────┘
                      │
                      ▼
        After all 3 requests complete → exit(0)
```

### Recommended Project Structure

```
examples/
└── example-app/
    ├── package.json          # local file: dependency on library
    ├── src/
    │   ├── index.ts          # server bootstrap, route handlers
    │   ├── stripe.ts         # mock Stripe sender (independent crypto)
    │   ├── github.ts         # mock GitHub sender (independent crypto)
    │   └── shopify.ts        # mock Shopify sender (independent crypto)
    ├── build/                # output from npm run build (created at runtime)
    │   └── index.js
    └── start.sh              # or package.json "start" script
```

### Pattern 1: Per-Provider Quickstart Block

**What:** A self-contained, copy-pasteable code example showing one provider's full integration — including all imports, middleware mounting, handler boilerplate, and comments on key details (e.g., Stripe tolerance default).

**When to use:** In README for each supported provider; readers should be able to copy one block and have a working integration immediately.

**Example (Stripe):**
```typescript
// Source: /src/index.ts (library exports) + /src/middleware.ts (tolerance default)
import express from 'express';
import {
  createWebhookMiddleware,
  rawBodyCapture,
} from 'express-webhook-validator';

const app = express();

app.post(
  '/webhooks/stripe',
  rawBodyCapture(),
  createWebhookMiddleware('stripe', {
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
    // tolerance: 300  // default 5-minute window; set lower if needed
  }),
  (req, res) => {
    // At this point, req.webhook.provider === 'stripe'
    // req.webhook.eventId, req.webhook.timestamp, req.webhook.parsed
    console.log('Stripe event:', req.webhook.eventId, req.webhook.parsed);
    res.sendStatus(200);
  }
);

app.listen(3000);
```

### Pattern 2: Configuration Reference Table

**What:** A scannable table of all exported configuration options — one row per export or per-provider option, columns for option name, type, default value, and brief description.

**When to use:** Once in the README so users can find option names without reading code or hunting through separate docs.

**Coverage (from D-05 and source inspection):**

| Export | Option | Type | Default | Description |
|--------|--------|------|---------|-------------|
| `createWebhookMiddleware(provider, options)` | `secret` | string | *required* | Webhook signing secret from provider (Stripe API key, GitHub app, Shopify key); must be non-empty |
| | `tolerance` | number (seconds) | 300 | Stripe only: timestamp tolerance window. Requests outside this window are rejected. GitHub/Shopify ignore this value. |
| `rawBodyCapture(options)` | `limit` | string or number | `'1mb'` | Maximum request body size (parsed by `bytes` package). Larger bodies are rejected with HTTP 413. |
| `captureRawBody(req, res, buf, encoding)` | N/A (verify callback) | — | — | Drop-in `verify` callback for `express.json({ verify: captureRawBody })`. Captures raw bytes at `req.rawBody`. |
| `webhookErrorHandler()` | N/A (error middleware) | — | — | 4-arg error handler. Responds to `WebhookValidationError` with `{ error, reason }` JSON at appropriate HTTP status. Passes other errors through. |

### Pattern 3: Mock Webhook Sender (Independent Crypto)

**What:** A helper module that signs requests independently using Node's `crypto` module — NOT using the library's exported `computeHmac` — and fires them at the local server.

**Why:** Proves the library's validator is correct. If both validator and sender use the same code path, they'll succeed or fail together even if both are wrong. Independent signing is the integration test.

**Per-provider signing rules (from source inspection):**

| Provider | Header | Digest Algorithm | Signed Bytes | Encoding | Notes |
|----------|--------|------------------|--------------|----------|-------|
| Stripe | `Stripe-Signature` | HMAC-SHA256 | `<timestamp>.<rawBody>` | hex, prefixed `t=<ts>,v1=<hex>` | multi-`v1=` rotation supported; any one match passes |
| GitHub | `X-Hub-Signature-256` | HMAC-SHA256 | `<rawBody>` (raw bytes) | hex, prefixed `sha256=<hex>` | deprecated SHA-1 header ignored |
| Shopify | `X-Shopify-Hmac-Sha256` | HMAC-SHA256 | `<rawBody>` (raw bytes) | base64 (NOT hex) | no prefix; bare digest in header |

**Example (Stripe mock sender):**
```typescript
// Source: /src/providers/stripe.ts (signing rule extraction)
import crypto from 'crypto';

function signStripeRequest(rawBody: string, secret: string, timestamp: number): string {
  const signedContent = `${timestamp}.${rawBody}`;
  const digest = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

// Then fire the request:
// const sig = signStripeRequest(JSON.stringify(payload), secret, Date.now() / 1000);
// POST to /webhooks/stripe with header Stripe-Signature: <sig>
```

### Anti-Patterns to Avoid

- **Using the library's `computeHmac` in the mock sender:** The whole point of the example is to demonstrate independent correctness. If sender and validator both use `computeHmac`, they succeed together even if the function is wrong.
- **Hardcoding secrets in example code:** Use `process.env.STRIPE_WEBHOOK_SECRET!` in both README snippets and the example app. Document that users must set env vars.
- **Mounting `rawBodyCapture()` globally on the app:** The pattern is per-route. Mounting globally forces every request through the raw-body read, which is unnecessary overhead. Show `app.post('/webhooks/<provider>', rawBodyCapture(), ...)`.
- **Omitting the optional `tolerance` from Stripe examples:** The field exists and is important for replay defense. Show it in the config reference; in the quickstart, either show the default or a comment explaining when to customize.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HMAC-SHA256 computation | Custom crypto using `crypto.createHash` | `computeHmac` (already exported) | Bugs in digest format (hex vs. base64) are easy; library version is tested |
| Constant-time comparison | String `===` on hex digests | `timingSafeCompare` (already exported) | Timing-attack side channels leak information about matching bytes; library uses `crypto.timingSafeEqual` |
| Raw body capture before JSON parsing | Manual stream reading | `rawBodyCapture()` or `express.json({ verify: captureRawBody })` (both exported) | Stream handling, encoding, error delegation are subtle; library version handles all three |
| Per-provider signature format parsing | Regex or string splits | Library's provider implementations | Each provider's header format differs (Stripe comma-sep, GitHub `sha256=` prefix, Shopify bare base64); mistakes compound in integration |

**Key insight:** The library already exports everything needed for a consumer to validate webhooks. The example app demonstrates these exports end-to-end; don't add alternatives or hand-rolled implementations.

## Common Pitfalls

### Pitfall 1: Version Framing Mismatch
**What goes wrong:** README claims "v1.0 / shippable" (per D-02) but `package.json` stays at `0.0.1`. Users may assume inconsistency means something is wrong.

**Why it happens:** D-02 is about portfolio narrative (this looks production-quality), not version semantics. The decision treats version as decoupled from readiness.

**How to avoid:** The planner must decide: (1) bump `package.json` to `1.0.0` and update both places, or (2) accept the decoupling and document it in both README and package.json (`description` or `dist/README.md`). Either is valid; surface the choice explicitly in the plan.

**Warning signs:** If the planner silently does one or the other without noting it, the researcher or verifier will catch the inconsistency.

### Pitfall 2: Example App Dependency Link Missing or Stale
**What goes wrong:** Example app's `package.json` has `"express-webhook-validator": "file:../.."`  but the library's `dist/` is stale or missing. `npm install` in the example app succeeds (local file link) but `npm start` fails when trying to import from `dist`.

**Why it happens:** The example app task is often scheduled after the README task and may run in a separate shell or test environment where the library build is not re-run. A `npm run build` in the library root must run before `npm install` in the example app root.

**How to avoid:** The planner should explicitly task a build step in the library root (or verify it's cached) before the example app setup task runs. Document this dependency in the plan.

**Warning signs:** "Module not found: express-webhook-validator" when the app tries to start.

### Pitfall 3: Mock Sender Using Library's `computeHmac`
**What goes wrong:** The example app's mock sender does:
```typescript
import { computeHmac } from 'express-webhook-validator';
const digest = computeHmac(body, secret, 'sha256');
```
Then fires the request. The validator (which also uses `computeHmac`) succeeds. But if `computeHmac` has a bug, both sender and validator fail silently — the integration test is vacuous.

**Why it happens:** Copy-paste from a real consumer app (which would use `computeHmac`), forgetting that this example is supposed to be an independent correctness check.

**How to avoid:** The planner's task for the mock sender (D-09) must explicitly require independent crypto. Use `crypto.createHmac` directly; document why in a code comment.

**Warning signs:** Validator and sender always agree (no negative test). If a future mutation breaks the validator, the sender still succeeds.

### Pitfall 4: Incomplete Per-Provider Header Metadata
**What goes wrong:** The README quickstarts show `req.webhook.eventId` and `req.webhook.parsed` for all providers, but GitHub also surfaces `req.webhook.deliveryId` and Shopify surfaces `req.webhook.topic` + `req.webhook.webhookId`. The example app handler does not narrow on `provider` and tries to access fields that don't exist on all branches.

**Why it happens:** A handler template is copied from one provider to all three without adjusting for discriminated-union narrowing.

**How to avoid:** The planner should require the example app's main handler to show the three-way `if (req.webhook?.provider === 'stripe')` narrowing idiom, so readers see that `deliveryId` is GitHub-specific, `topic`/`webhookId` are Shopify-specific, and all three share `eventId`/`timestamp`/`parsed`.

**Warning signs:** TypeScript compilation fails with "Property 'deliveryId' does not exist on type X" (union is not narrowed).

### Pitfall 5: Security Notes Omitting Replay-Protection Gaps
**What goes wrong:** D-06 requires honest documentation of per-provider replay defenses, but the README security section only covers the happy path (Stripe timestamp window, GitHub/Shopify metadata surfaces) without explicitly stating "GitHub and Shopify have NO signed timestamp; replay defense requires your dedup store."

**Why it happens:** It feels like bad salesmanship to document gaps. But D-06 is explicit: "documented honesty about where it doesn't protect" is a locked decision and a PROJECT.md Key Decision.

**How to avoid:** The planner's README task must include a table or list explicitly comparing providers:

| Provider | Signed Timestamp? | Replay Defense | Consumer Action |
|----------|------------------|---|---|
| Stripe | Yes (`t=`) | Built-in 5-min window | Configure tolerance if needed |
| GitHub | No | Signed delivery UUID only | Implement dedup store (Redis, DB) |
| Shopify | No | Signed webhook ID only | Implement dedup store (Redis, DB) |

**Warning signs:** If the security section doesn't mention "dedup store" or "delivery ID", it's incomplete per D-06.

## Code Examples

Verified patterns from official sources (library source code):

### Example 1: Stripe Quickstart (Ready to Paste)
```typescript
// Source: /src/middleware.ts (CreateWebhookMiddlewareOptions) + /src/providers/stripe.ts (StripeWebhook type)
import express from 'express';
import {
  createWebhookMiddleware,
  rawBodyCapture,
} from 'express-webhook-validator';

const app = express();

app.post(
  '/webhooks/stripe',
  rawBodyCapture(),
  createWebhookMiddleware('stripe', {
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
    tolerance: 300, // default: 5-minute replay window
  }),
  (req, res) => {
    if (req.webhook?.provider === 'stripe') {
      console.log(`Stripe event ${req.webhook.eventId}:`, req.webhook.parsed);
    }
    res.sendStatus(200);
  }
);

app.listen(3000, () => console.log('Listening on :3000'));
```

### Example 2: GitHub Quickstart (Ready to Paste)
```typescript
// Source: /src/providers/github.ts (GitHubWebhook type) + /src/error-handler.ts (webhookErrorHandler)
import express from 'express';
import {
  createWebhookMiddleware,
  rawBodyCapture,
  webhookErrorHandler,
} from 'express-webhook-validator';

const app = express();

app.post(
  '/webhooks/github',
  rawBodyCapture(),
  createWebhookMiddleware('github', {
    secret: process.env.GITHUB_WEBHOOK_SECRET!,
    // tolerance is ignored for GitHub (no signed timestamp)
  }),
  (req, res) => {
    if (req.webhook?.provider === 'github') {
      console.log(`GitHub delivery ${req.webhook.deliveryId}:`, req.webhook.parsed);
      // Implement your own dedup using deliveryId → Redis/DB
    }
    res.sendStatus(200);
  }
);

app.use(webhookErrorHandler());
app.listen(3000, () => console.log('Listening on :3000'));
```

### Example 3: Shopify Quickstart (Ready to Paste)
```typescript
// Source: /src/providers/shopify.ts (ShopifyWebhook type)
import express from 'express';
import {
  createWebhookMiddleware,
  rawBodyCapture,
} from 'express-webhook-validator';

const app = express();

app.post(
  '/webhooks/shopify',
  rawBodyCapture(),
  createWebhookMiddleware('shopify', {
    secret: process.env.SHOPIFY_WEBHOOK_SECRET!,
    // tolerance is ignored for Shopify (no signed timestamp)
  }),
  (req, res) => {
    if (req.webhook?.provider === 'shopify') {
      console.log(
        `Shopify topic ${req.webhook.topic} (ID: ${req.webhook.webhookId}):`,
        req.webhook.parsed
      );
      // Implement dedup using webhookId → Redis/DB
    }
    res.sendStatus(200);
  }
);

app.listen(3000, () => console.log('Listening on :3000'));
```

### Example 4: Mock Stripe Request (Independent Crypto)
```typescript
// Source: /src/providers/stripe.ts (parseStripeSignature, signing rule extraction)
// NOT using library's computeHmac — independent implementation
import crypto from 'crypto';
import http from 'http';

function signStripeRequest(
  body: string,
  secret: string,
  timestamp: number
): string {
  const signedContent = `${timestamp}.${body}`;
  const digest = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

function fireStripeRequest(
  body: string,
  secret: string,
  host: string,
  port: number,
  callback: (error: Error | null) => void
) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signStripeRequest(body, secret, timestamp);

  const options = {
    hostname: host,
    port: port,
    path: '/webhooks/stripe',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': signature,
      'Content-Length': Buffer.byteLength(body),
    },
  };

  const req = http.request(options, (res) => {
    if (res.statusCode !== 200) {
      callback(new Error(`Expected 200, got ${res.statusCode}`));
    } else {
      callback(null);
    }
  });

  req.on('error', callback);
  req.write(body);
  req.end();
}

// Usage:
const payload = JSON.stringify({ type: 'charge.succeeded', id: 'evt_123' });
fireStripeRequest(payload, 'whsec_test_secret', 'localhost', 3000, (err) => {
  if (err) console.error('Stripe request failed:', err);
  else console.log('Stripe request succeeded');
});
```

### Example 5: Discriminated Union Narrowing
```typescript
// Source: /src/types.ts (WebhookMetadata union) + /src/providers/*.ts (discriminated types)
// Handler pattern to safely access provider-specific fields
app.post('/webhooks/:provider', (req, res) => {
  const webhook = req.webhook;

  // Compile-time discriminated union narrowing
  if (webhook?.provider === 'stripe') {
    // TypeScript knows: eventId, timestamp, parsed, replayWindowMs
    // derivedDeliveryId NOT available
    console.log(`Stripe: ${webhook.eventId} (timestamp: ${webhook.timestamp})`);
  } else if (webhook?.provider === 'github') {
    // TypeScript knows: eventId, timestamp, parsed, deliveryId
    // topic, webhookId NOT available
    console.log(`GitHub: ${webhook.deliveryId}`);
  } else if (webhook?.provider === 'shopify') {
    // TypeScript knows: eventId, timestamp, parsed, topic, webhookId
    // deliveryId, replayWindowMs NOT available
    console.log(`Shopify: ${webhook.webhookId} (topic: ${webhook.topic})`);
  }

  res.sendStatus(200);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| README status: "Phase 3 of 7, validators stubbed" | README status: "v1.0 / shippable" | Phase 7 | Portfolio narrative now matches Phase 6 completion |
| No example app | Runnable example with 3 mock providers | Phase 7 | Reviewers can clone and immediately see it work |
| No security notes | Explicit per-provider replay-protection landscape | Phase 7 | Users can make informed decisions about dedup |
| No configuration reference | Scannable table of all exports + options | Phase 7 | Consumers can find option names without reading code |

**Deprecated/outdated:**
- Status banner "validators stubbed" — Phase 4–6 shipped real providers for Stripe/GitHub/Shopify. This banner is false and must be replaced (D-02).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Example app can consume library via local `file:`/workspace link without npm publishing | Architecture Patterns / Pitfall 2 | High — if file: links don't work in the test environment, the example app won't run. Verify `npm install` resolves the link before declaring success. |
| A2 | Mock sender can sign requests independently using Node `crypto` without importing library functions | Architecture Patterns / Pattern 3 | Low — Node's `crypto` module is stable and tested; this is straightforward. But if the signing rule extraction from source is wrong, the mock requests will be rejected. Verify signing rules match source code exactly. |
| A3 | Tolerance default of 300 seconds (5 minutes) is correct for Stripe | Code Examples / Example 1 | Low — verified in source at `src/middleware.ts` line 107 (`options.tolerance ?? 300`). |
| A4 | `webhookErrorHandler()` factory returns a function with `fn.length === 4` (required for Express error middleware detection) | Common Pitfalls / Pitfall 3 | Medium — this is tested in source (code comments reference "empirically verified"), but if Express's 4-arg detection changes, the handler won't mount correctly. Verify in plan that the handler is actually mounted and fires on errors. |

## Open Questions

1. **Version alignment (Claude's Discretion)**
   - What we know: `package.json` is `0.0.1`; D-02 presents as "v1.0 / shippable"
   - What's unclear: Should `package.json` be bumped to `1.0.0` now or left as-is?
   - Recommendation: The planner should surface this as a discrete choice in the plan. Either approach is acceptable; document the decision in commit messages or PLAN.md.

2. **Example app launch mechanics**
   - What we know: D-07 requires `npm start` to boot server, fire 3 requests, print results, exit 0
   - What's unclear: Should the requests fire synchronously (block on each response) or in parallel (fire all three, wait for all to complete)?
   - Recommendation: Parallel is less likely to have ordering bugs. Implement with `Promise.all` so all three fire simultaneously and all must succeed before exit.

3. **Error handling in example app**
   - What we know: The library's `createWebhookMiddleware` delegates errors via `next(err)`; `webhookErrorHandler()` formats them
   - What's unclear: Should the example app also mount `webhookErrorHandler()` (making the demo complete), or should it show a custom error handler, or let errors propagate?
   - Recommendation: Mount `webhookErrorHandler()` to show the documented pattern. But also add one custom handler for non-validation errors (e.g., if the request itself fails) so readers see both options.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Example app (mock sender, crypto) | ✓ | 20+ (per `package.json` engines) | — |
| npm | Example app (`npm start`, dependency link) | ✓ | Latest in env | — |
| Git | Example clone workflow (user clones repo) | ✓ | Any recent version | — |
| `express-webhook-validator` (library build) | Example app dependency link | ✓ (must build before example app runs) | 0.0.1 or bumped to 1.0.0 | — |

**Missing dependencies with no fallback:** None — all dependencies are standard tooling.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 (via Phase 1) |
| Config file | `vitest.config.ts` (configured in Phase 6) |
| Quick run command | `npm test` |
| Full suite command | `npm test` (full suite runs by default) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOCS-01 | README has installation, per-provider quickstarts, config reference | Manual (docs review) | N/A (visually verify README structure) | — |
| DOCS-02 | README includes security notes with raw-body, timing, replay-protection coverage | Manual (docs review) | N/A (grep README for key phrases: "raw body", "constant-time", "replay") | — |
| DOCS-03 | Example app boots, fires 3 signed requests, validates, prints, exits 0 | Integration | `node examples/example-app/build/index.js` or `npm start` from example app dir | ❌ Wave 0 (greenfield) |

### Sampling Rate
- **Per task commit:** Manual verification (README structure is visually inspectable; example app runs locally)
- **Per wave merge:** Run the example app; verify `console.log(req.webhook)` appears 3 times (once per provider); verify exit code 0
- **Phase gate:** Example app runs successfully with all three mock providers; README diff is reviewed for structure/content/tone

### Wave 0 Gaps
- [ ] `examples/example-app/src/index.ts` — server bootstrap, three route handlers (Stripe/GitHub/Shopify), error handler mount
- [ ] `examples/example-app/src/stripe.ts` — mock Stripe request sender (independent crypto)
- [ ] `examples/example-app/src/github.ts` — mock GitHub request sender (independent crypto)
- [ ] `examples/example-app/src/shopify.ts` — mock Shopify request sender (independent crypto)
- [ ] `examples/example-app/package.json` — local `file:../../` dependency on library, scripts for build + start
- [ ] `examples/example-app/tsconfig.json` — minimal TypeScript config for the example (or inherit from root)
- [ ] `README.md` — restructured with sections: installation, per-provider quickstarts, config reference, security notes, and existing prose demoted below fold

## Security Domain

Phase 7 is primarily documentation and examples. No new cryptographic code is introduced. However, the security notes (D-06) must accurately document library-provided guarantees and gaps:

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | N/A | Not a user authentication system |
| V3 Session Management | N/A | Stateless webhook validation |
| V4 Access Control | Partial | Webhook authentication via HMAC; no authorization logic |
| V5 Input Validation | Yes | Raw body capture before parsing; malformed JSON rejected gracefully |
| V6 Cryptography | Yes | HMAC-SHA256 (Phase 2); constant-time comparison (Phase 2); per-provider rules documented |

### Known Threat Patterns for Express Webhook Validation

| Pattern | STRIDE | Standard Mitigation | Phase |
|---------|--------|---------------------|-------|
| Replay attacks — Stripe | Tampering / Repudiation | Signed timestamp + configurable tolerance window (built-in) | Phase 4 |
| Replay attacks — GitHub/Shopify | Tampering / Repudiation | Delivery ID / Webhook ID provided; consumer implements dedup store | Phase 7 (documented gap) |
| Timing attacks on signature comparison | Information Disclosure | `crypto.timingSafeEqual` (constant-time); library uses it via `timingSafeCompare` | Phase 2 |
| Header injection (duplicate/array headers) | Tampering | Three-way header check (undefined → error, array → error, string → process) | Phase 5 |
| Raw-body consumption before capture | Tampering | Middleware ordered correctly; documented `rawBodyCapture()` or `express.json({ verify })` pattern | Phase 3 / Phase 7 (docs) |
| Information leakage in error messages | Information Disclosure | Error class sanitizes `toJSON()`; no signature/secret/body in messages; optional `webhookErrorHandler()` further restricts response | Phase 2 / Phase 3 |

## Sources

### Primary (HIGH confidence)
- Library source code (`src/` directory) — verified 2026-06-03
  - `src/index.ts` — public exports, VERSION constant
  - `src/middleware.ts` — `CreateWebhookMiddlewareOptions`, tolerance default (300s)
  - `src/raw-body/middleware.ts` — `RawBodyOptions`, limit default ('1mb')
  - `src/error-handler.ts` — `webhookErrorHandler()` factory signature
  - `src/providers/stripe.ts` — StripeWebhook type, `parseStripeSignature()`, signing rule (`<t>.<body>`)
  - `src/providers/github.ts` — GitHubWebhook type, signing rule (raw body only), header format (`sha256=<hex>`)
  - `src/providers/shopify.ts` — ShopifyWebhook type, signing rule (raw body only), header format (base64, no prefix)
- `package.json` — verified version 0.0.1, dual CJS/ESM exports, `raw-body` 3.0.0 dependency
- `.planning/phases/07-documentation-example-app/07-CONTEXT.md` — locked decisions D-01..D-09
- `.planning/REQUIREMENTS.md` — DOCS-01, DOCS-02, DOCS-03 requirements
- `.planning/PROJECT.md` — core value, Key Decisions, out-of-scope boundaries
- `.planning/ROADMAP.md` — Phase 7 goal and success criteria
- Current README.md — existing prose to preserve and demote

### Secondary (MEDIUM confidence)
- None — all primary sources are in-repo and authoritative

### Tertiary (LOW confidence — for validation in plan/verify phases)
None initially; any assumptions about environment availability or tooling behavior should be verified during planning.

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all exports verified in source; versions confirmed in package.json
- Architecture: HIGH — phase decisions are locked (D-01..D-09); signing rules extracted from tested Phase 4–6 code
- Pitfalls: HIGH — based on Phase 1–6 experience and common documentation/example-app mistakes
- Configuration reference: HIGH — sourced directly from middleware.ts and provider signatures
- Code examples: HIGH — patterns extracted from library source and match real signatures

**Research date:** 2026-06-03
**Valid until:** 2026-07-03 (30 days; documentation + example patterns are stable after Phase 6 completion)

---

*Phase: 7-documentation-example-app*
*Research completed: 2026-06-03*
*Requirements addressed: DOCS-01, DOCS-02, DOCS-03*
*Decisions referenced: CONTEXT.md D-01..D-09*
