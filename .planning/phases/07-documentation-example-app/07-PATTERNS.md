# Phase 7: Documentation & Example App - Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 7 new/modified files
**Analogs found:** 7 / 7 (100% coverage)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `README.md` | documentation | request-response | `README.md` (current) | exact (reshape existing) |
| `examples/example-app/package.json` | config | dependency-management | `package.json` (root) | role-match |
| `examples/example-app/tsconfig.json` | config | build | `tsconfig.json` (root) | role-match |
| `examples/example-app/src/index.ts` | service | request-response | `tests/integration/stripe.test.ts` | exact (express app + middleware mounting) |
| `examples/example-app/src/stripe.ts` | utility | crypto | `tests/integration/stripe.test.ts` (makeSignature) | exact (independent HMAC signing) |
| `examples/example-app/src/github.ts` | utility | crypto | `tests/integration/github.test.ts` (makeSignature) | exact (independent HMAC signing) |
| `examples/example-app/src/shopify.ts` | utility | crypto | `tests/integration/shopify.test.ts` (makeSignature) | exact (independent HMAC signing) |

## Pattern Assignments

### `README.md` (documentation, request-response)

**Analog:** `README.md` (current — lines 1-100+, fully read during research)

**Current Structure to Reshape:**
The existing README (206 lines) is well-structured but lacks top-level onboarding sections. Current order:
1. Title + status banner (line 1-5) — **REPLACE** per D-02
2. "What this is" (lines 7-16)
3. "Webhooks, briefly" (lines 20-32)
4. "Provider notes" (lines 34-62) — **PRESERVE & DEMOTE**
5. System/internal flow diagrams (lines 64-100+) — **PRESERVE & DEMOTE**

**New Structure (D-01, canonical OSS shape):**
1. **Title** (1 line) — `express-webhook-validator`
2. **Installation** (D-04):
   ```markdown
   npm install express-webhook-validator
   
   **Note:** This package is not yet published to npm. A future release will make it available as a standard npm install. For now, refer to the library source code or a local file: dependency for examples.
   ```
3. **Per-Provider Quickstarts** (D-03, three copy-pasteable blocks):
   - Stripe (with tolerance comment, ref RESEARCH.md Example 1)
   - GitHub (with deliveryId dedup note, ref RESEARCH.md Example 2)
   - Shopify (with topic/webhookId note, ref RESEARCH.md Example 3)
4. **Configuration Reference** (D-05, table format):
   - `createWebhookMiddleware(provider, options)` — secret, tolerance, per provider
   - `rawBodyCapture(options)` — limit default '1mb'
   - `captureRawBody(req, res, buf, encoding)` — verify callback helper
   - `webhookErrorHandler()` — error middleware factory
5. **Security Notes** (D-06, three pillars + replay landscape):
   - Raw-body handling (capture before JSON parse)
   - Constant-time comparison (timing attacks, `timingSafeCompare` built-in)
   - Per-provider replay-protection landscape (Stripe timestamp default 300s; GitHub/Shopify need consumer dedup)
   - Explicit table: Provider | Signed Timestamp? | Replay Defense | Consumer Action
6. **Below the fold (preserved existing prose):**
   - "What this is" (shortened intro)
   - "Webhooks, briefly"
   - "Provider notes" (existing Stripe/GitHub/Shopify mechanics)
   - System-level + internal data-flow diagrams

**New Status Banner (D-02):**
Replace line 5 stale banner with:
```markdown
> **Status — v1.0 / Ready to use.** All three providers (Stripe, GitHub, Shopify) have real HMAC-SHA256 signature validators. The library is feature-complete and production-ready.
```

**Imports/Baseline Pattern (From current README + provider types):**
Use concrete code blocks from RESEARCH.md Examples 1–3 (Stripe, GitHub, Shopify quickstarts) for the per-provider sections.

---

### `examples/example-app/package.json` (config, dependency-management)

**Analog:** Root `package.json` (verified at `/home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru/package.json`)

**Structure Pattern (D-08: local file: dependency):**
```json
{
  "name": "express-webhook-validator-example",
  "version": "0.0.1",
  "description": "Runnable example app demonstrating express-webhook-validator webhook validation",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "build": "tsc",
    "start": "node build/index.js"
  },
  "dependencies": {
    "express": "^4.18.0 || ^5.0.0",
    "express-webhook-validator": "file:../../"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "typescript": "^5.0.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

**Key Points:**
- `"express-webhook-validator": "file:../.."` — local dependency per D-08 (matches real consumer code, not `../../src`)
- `"type": "module"` — aligns with root tsup ESM export
- `"start"` script calls `node build/index.js` — the compiled output per D-07 (one-shot npm start)
- Dependencies: `express` (peer) and the local library (file:)

---

### `examples/example-app/tsconfig.json` (config, build)

**Analog:** Root `tsconfig.json` (minimal config, standard TypeScript)

**Structure Pattern:**
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./build",
    "rootDir": "./src"
  },
  "include": [
    "src/**/*.ts"
  ]
}
```

**Rationale:**
- Extends root `tsconfig.json` for consistency (compiler flags, target, module type)
- Overrides `outDir` and `rootDir` for example-app-specific layout
- Minimal, follows project convention

---

### `examples/example-app/src/index.ts` (service, request-response)

**Analog:** `tests/integration/stripe.test.ts` (lines 23–39, makeApp factory pattern + middleware mounting)

**Core Pattern - Express App Bootstrap + Three Routes (D-07):**

```typescript
// Source: tests/integration/stripe.test.ts:23-39 (app factory pattern)
//         src/middleware.ts:59-100 (createWebhookMiddleware signature)
//         src/raw-body/middleware.ts:45-70 (rawBodyCapture pattern)
//         src/error-handler.ts:31-45 (webhookErrorHandler mounting)

import express from 'express';
import {
  createWebhookMiddleware,
  rawBodyCapture,
  webhookErrorHandler,
} from 'express-webhook-validator';
import { fireStripeRequest } from './stripe.js';
import { fireGitHubRequest } from './github.js';
import { fireShopifyRequest } from './shopify.js';

const app = express();
const PORT = 3000;

// Stripe webhook endpoint
app.post(
  '/webhooks/stripe',
  rawBodyCapture(),
  createWebhookMiddleware('stripe', {
    secret: 'test_stripe_secret',
    tolerance: 300,
  }),
  (req, res) => {
    if (req.webhook?.provider === 'stripe') {
      console.log('✓ Stripe webhook received:', {
        provider: req.webhook.provider,
        eventId: req.webhook.eventId,
        timestamp: req.webhook.timestamp,
        parsed: req.webhook.parsed,
      });
    }
    res.sendStatus(200);
  }
);

// GitHub webhook endpoint
app.post(
  '/webhooks/github',
  rawBodyCapture(),
  createWebhookMiddleware('github', {
    secret: 'test_github_secret',
  }),
  (req, res) => {
    if (req.webhook?.provider === 'github') {
      console.log('✓ GitHub webhook received:', {
        provider: req.webhook.provider,
        deliveryId: req.webhook.deliveryId,
        eventId: req.webhook.eventId,
        timestamp: req.webhook.timestamp,
        parsed: req.webhook.parsed,
      });
    }
    res.sendStatus(200);
  }
);

// Shopify webhook endpoint
app.post(
  '/webhooks/shopify',
  rawBodyCapture(),
  createWebhookMiddleware('shopify', {
    secret: 'test_shopify_secret',
  }),
  (req, res) => {
    if (req.webhook?.provider === 'shopify') {
      console.log('✓ Shopify webhook received:', {
        provider: req.webhook.provider,
        topic: req.webhook.topic,
        webhookId: req.webhook.webhookId,
        eventId: req.webhook.eventId,
        timestamp: req.webhook.timestamp,
        parsed: req.webhook.parsed,
      });
    }
    res.sendStatus(200);
  }
);

// Error handler (D-07: print errors to stdout, then exit)
app.use(webhookErrorHandler());

// Start server
const server = app.listen(PORT, async () => {
  console.log(`Listening on http://localhost:${PORT}`);

  try {
    // Fire three signed requests in parallel (D-07 one-shot demo)
    await Promise.all([
      fireStripeRequest('localhost', PORT),
      fireGitHubRequest('localhost', PORT),
      fireShopifyRequest('localhost', PORT),
    ]);
    console.log('\n✓ All three mock webhooks validated successfully');
    process.exit(0);
  } catch (err) {
    console.error('Mock webhook failed:', err);
    process.exit(1);
  }
});
```

**Key Patterns:**
- Per-route `rawBodyCapture()` mounting (line 19, 36, 53) — not global
- `createWebhookMiddleware(provider, { secret })` — provider-specific configuration
- Handler uses discriminated union narrowing: `if (req.webhook?.provider === 'stripe')` — ensures type safety per provider
- `webhookErrorHandler()` mounted globally after all routes (error delegation pattern from src/error-handler.ts)
- `Promise.all()` fires three requests in parallel (D-07: one-shot, all-at-once)
- Exit 0 on success, exit 1 on failure (D-07: integration test pattern)

---

### `examples/example-app/src/stripe.ts` (utility, crypto)

**Analog:** `tests/integration/stripe.test.ts` (lines 16–20, makeSignature function + usage)

**Independent Crypto Signing Pattern (D-09: NOT importing library's computeHmac):**

```typescript
// Source: tests/integration/stripe.test.ts:16-20 (makeSignature)
//         Stripe signing rule: src/providers/stripe.ts:116-119
//         ("${timestamp}.${rawBody.toString('utf8')}" → hex HMAC)

import { createHmac } from 'node:crypto';
import http from 'node:http';

// D-09: Independent Node crypto.createHmac — NOT library's computeHmac
// This proves the validator and sender agree on the signing rule.
function signStripeRequest(
  body: string,
  secret: string,
  timestamp: number
): string {
  const signedPayload = `${timestamp}.${body}`;
  const digest = createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

export async function fireStripeRequest(host: string, port: number): Promise<void> {
  const payload = JSON.stringify({
    id: 'evt_example_1234',
    type: 'charge.succeeded',
    created: Math.floor(Date.now() / 1000),
  });

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signStripeRequest(payload, 'test_stripe_secret', timestamp);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port: port,
      path: '/webhooks/stripe',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': signature,
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        resolve();
      } else {
        reject(new Error(`Stripe request failed: ${res.statusCode}`));
      }
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
```

**Signing Rule (Stripe) — Extract from src/providers/stripe.ts:116–119:**
- Signed bytes: `${timestamp}.${rawBody.toString('utf8')}`
- Digest: HMAC-SHA256, hex-encoded
- Header format: `Stripe-Signature: t=<timestamp>,v1=<hex>`
- Default tolerance: 300 seconds (from src/middleware.ts line 43)

---

### `examples/example-app/src/github.ts` (utility, crypto)

**Analog:** `tests/integration/github.test.ts` (lines 17–20, makeSignature function)

**Independent Crypto Signing Pattern (D-09):**

```typescript
// Source: tests/integration/github.test.ts:17-20 (makeSignature)
//         GitHub signing rule: src/providers/github.ts:93-96
//         (raw Buffer only, NO timestamp prefix; sha256= prefix in header)

import { createHmac } from 'node:crypto';
import http from 'node:http';

// D-09: Independent Node crypto — NOT library's computeHmac
function signGitHubRequest(body: string, secret: string): string {
  const digest = createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return `sha256=${digest}`;
}

export async function fireGitHubRequest(host: string, port: number): Promise<void> {
  const deliveryId = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff';
  const payload = JSON.stringify({
    action: 'opened',
    number: 42,
    repository: { id: 123456, name: 'example-repo' },
  });

  const signature = signGitHubRequest(payload, 'test_github_secret');

  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port: port,
      path: '/webhooks/github',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': signature,
        'X-GitHub-Delivery': deliveryId,
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        resolve();
      } else {
        reject(new Error(`GitHub request failed: ${res.statusCode}`));
      }
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
```

**Signing Rule (GitHub) — Extract from src/providers/github.ts:93–96:**
- Signed bytes: raw Buffer only (NO timestamp prefix)
- Digest: HMAC-SHA256, hex-encoded
- Header format: `X-Hub-Signature-256: sha256=<hex>`
- Metadata: `X-GitHub-Delivery` (UUID per delivery, surfaced as `req.webhook.deliveryId`)
- NO signed timestamp; replay defense requires consumer dedup

---

### `examples/example-app/src/shopify.ts` (utility, crypto)

**Analog:** `tests/integration/shopify.test.ts` (lines 18–20, makeSignature function)

**Independent Crypto Signing Pattern (D-09):**

```typescript
// Source: tests/integration/shopify.test.ts:18-20 (makeSignature)
//         Shopify signing rule: src/providers/shopify.ts:77-80
//         (raw Buffer only, base64-encoded digest, NO prefix in header)

import { createHmac } from 'node:crypto';
import http from 'node:http';

// D-09: Independent Node crypto — NOT library's computeHmac
// CRITICAL: Shopify uses BASE64 encoding, NOT hex (D-09 anti-pattern from RESEARCH.md)
function signShopifyRequest(body: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(body)
    .digest('base64'); // BASE64, not 'hex' — common mistake
}

export async function fireShopifyRequest(host: string, port: number): Promise<void> {
  const topic = 'orders/create';
  const webhookId = 'ddddeeee-ffff-0000-1111-222233334444';
  const payload = JSON.stringify({
    order_id: 9999,
    customer: { email: 'test@example.com', id: 55555 },
  });

  const signature = signShopifyRequest(payload, 'test_shopify_secret');

  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port: port,
      path: '/webhooks/shopify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Hmac-Sha256': signature,
        'X-Shopify-Topic': topic,
        'X-Shopify-Webhook-Id': webhookId,
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        resolve();
      } else {
        reject(new Error(`Shopify request failed: ${res.statusCode}`));
      }
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
```

**Signing Rule (Shopify) — Extract from src/providers/shopify.ts:77–80:**
- Signed bytes: raw Buffer only (NO timestamp)
- Digest: HMAC-SHA256, **base64-encoded** (NOT hex — critical difference)
- Header format: `X-Shopify-Hmac-Sha256: <base64>` (bare digest, NO prefix)
- Metadata: `X-Shopify-Topic` (type of event) and `X-Shopify-Webhook-Id` (UUID per webhook definition)
- NO signed timestamp; replay defense requires consumer dedup

---

## Shared Patterns

### Middleware Mounting Pattern (All Three Routes)
**Source:** `src/raw-body/middleware.ts:45-70` + `src/middleware.ts:59-100`
**Apply to:** All three webhook routes (Stripe, GitHub, Shopify)

Per-route mounting order (critical for signature validation):
```typescript
app.post(
  '/webhooks/<provider>',
  rawBodyCapture(),  // 1. Capture raw bytes BEFORE JSON parse
  createWebhookMiddleware('<provider>', { secret }),  // 2. Validate signature + set req.webhook
  handler  // 3. Business logic
);
```

**Why this order matters (from README "Webhooks, briefly" section):**
- Raw body must be captured before `express.json()` parses it
- JSON round-trip loses the exact bytes the sender hashed
- `computeHmac` requires the raw bytes, not re-serialized JSON

### Error Handling Pattern (All Routes)
**Source:** `src/error-handler.ts:31-45`
**Apply to:** All endpoints globally

```typescript
app.use(webhookErrorHandler());
```

- Detects `WebhookValidationError` instances
- Responds with `{ error: 'webhook validation failed', reason: <discriminated> }` JSON
- Passes non-matching errors through to consumer's pipeline
- Never logs (D-16: library-never-logs guarantee)

### Type-Safe Provider Narrowing (All Handlers)
**Source:** `tests/integration/stripe.test.ts:33-35` + provider types (`src/providers/stripe.ts:24–34`, `github.ts:28–38`, `shopify.ts:26–37`)
**Apply to:** All three webhook handlers

```typescript
// Discriminated union narrowing per provider
if (req.webhook?.provider === 'stripe') {
  // TypeScript knows: eventId, timestamp, parsed, replayWindowMs
  // Does NOT have: deliveryId, topic, webhookId
}
```

Per-provider fields:
- **Stripe:** `eventId, timestamp, parsed, replayWindowMs`
- **GitHub:** `eventId (=deliveryId), timestamp, parsed, deliveryId`
- **Shopify:** `eventId (=webhookId), timestamp, parsed, topic, webhookId`

---

## Per-Provider Signing Rules (Summary Table)

**For the example app mock senders (D-09):**

| Provider | Signed Payload | Digest Algorithm | Encoding | Header Name | Header Format | Notes |
|----------|---|---|---|---|---|---|
| Stripe | `<timestamp>.<rawBody>` | HMAC-SHA256 | hex | `Stripe-Signature` | `t=<ts>,v1=<hex>` | Timestamp is signed; 300s tolerance default; multi-`v1=` rotation supported |
| GitHub | `<rawBody>` (raw bytes only) | HMAC-SHA256 | hex | `X-Hub-Signature-256` | `sha256=<hex>` | NO signed timestamp; deliveryId in `X-GitHub-Delivery` header |
| Shopify | `<rawBody>` (raw bytes only) | HMAC-SHA256 | **base64** | `X-Shopify-Hmac-Sha256` | `<base64>` (bare, no prefix) | NO signed timestamp; topic + webhookId in separate headers |

**Source extraction:**
- Stripe: `src/providers/stripe.ts` lines 116–119 (signedPayload format) + lines 45–68 (parseStripeSignature)
- GitHub: `src/providers/github.ts` lines 93–96 (computeHmac over Buffer directly) + lines 75–91 (parse sha256= prefix)
- Shopify: `src/providers/shopify.ts` lines 77–80 (Buffer-direct HMAC) + line 87 (base64 decode)

---

## No Analog Found

All files have clear analogs in the existing codebase:
- Integration tests provide the exact signing patterns and middleware mounting
- Root `package.json` and `tsconfig.json` provide configuration baselines
- Current README provides prose to preserve and restructure
- Middleware and error-handler patterns are production-ready, directly reusable

**No gaps:** The example app and README restructure depend entirely on existing, tested code patterns.

---

## Metadata

**Analog search scope:** 
- `src/` directory (middleware, providers, error handling)
- `tests/integration/` (signed request patterns)
- `src/raw-body/` (raw-body capture patterns)
- Root `package.json`, `tsconfig.json` (configuration baseline)
- Current `README.md` (prose to preserve/demote)

**Files scanned:** 12 key source/test files; 100% match rate.

**Pattern extraction date:** 2026-06-03

**Confidence:** HIGH — all signing rules and middleware patterns extracted directly from production code verified in Phases 4–6. Integration tests provide exact examples of independent crypto signing (D-09) that the example app will mirror.

---

## Critical Implementation Notes for Planner

### D-09 Anti-Pattern Reminder: Independent Crypto
The mock sender in `examples/example-app/src/{stripe,github,shopify}.ts` MUST use `crypto.createHmac()` directly, NOT `import { computeHmac } from 'express-webhook-validator'`.

**Why:** If both validator and sender use the library's `computeHmac`, they succeed or fail together even if the function contains a bug. The example is supposed to be an independent correctness check. Using separate implementations proves they agree.

### Shopify Base64 Encoding Critical
Shopify is the only provider using **base64** digest encoding (not hex). This is the most common integration footgun. The example must show:
```typescript
.digest('base64')  // NOT .digest('hex')
```

And the header must be the bare base64 value with NO `sha256=` prefix.

### Package Build Ordering
The example app's `package.json` uses `"express-webhook-validator": "file:../.."` (D-08). Before running `npm install` in the example app directory, the library's `dist/` must be available. Ensure a `npm run build` runs at the library root (or verify it's cached) before the example app setup task.

---

*Phase: 7-documentation-example-app*
*Pattern mapping completed: 2026-06-03*
*Files classified: 7*
*Analog coverage: 100% (7/7)*
