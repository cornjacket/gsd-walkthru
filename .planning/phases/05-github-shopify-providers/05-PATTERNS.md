# Phase 5: GitHub & Shopify Providers - Pattern Map

**Mapped:** 2026-05-08
**Files analyzed:** 4 (2 modified, 2 NEW)
**Analogs found:** 4 / 4 (all map to Phase 4 Stripe)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/providers/github.ts` (modify — replace stub `validate()`) | provider-service | request-response | `src/providers/stripe.ts` (Phase 4) | exact — same role, same data flow, same registration shape |
| `src/providers/github.test.ts` (NEW) | test (Vitest, co-located) | request-response | `src/providers/stripe.test.ts` (Phase 4) | exact — same fixture builder pattern, same outer-toThrow guard |
| `src/providers/shopify.ts` (modify — replace stub `validate()`) | provider-service | request-response | `src/providers/stripe.ts` (Phase 4) | exact — same role / shape; encoding axis differs (base64 vs hex) |
| `src/providers/shopify.test.ts` (NEW) | test (Vitest, co-located) | request-response | `src/providers/stripe.test.ts` (Phase 4) | exact — same shape; signature builder produces base64 instead of `t=…,v1=…` |

**Files explicitly NOT modified by Phase 5** (pattern map intentionally skips them — they stay byte-for-byte unchanged): `src/errors.ts`, `src/errors.test.ts`, `src/index.ts`, `src/index.test.ts`, `src/middleware.ts`, `src/middleware.test.ts`, `src/error-handler.ts`, `src/providers/registry.ts`, `src/providers/registry.test.ts`, `src/providers/types.ts`, `src/types.ts`, `src/providers/stripe.ts`, `src/providers/stripe.test.ts`. Per CONTEXT D-16 + D-17 and the WR-03/WR-02 deferrals to Phase 6.

---

## Pattern Assignments

### `src/providers/github.ts` (provider-service, request-response)

**Analog:** `src/providers/stripe.ts` (Phase 4 — modify-by-replacing-stub-body, then run a clean diff against this file).

**File header / import block — ADAPT pattern from `src/providers/stripe.ts:1-22`:**

```typescript
// Stripe header (lines 1-16 of stripe.ts) — adapt the step list to GitHub's pipeline:
//   1. rawBody guard      → 'malformed_payload' (400)
//   2. header guard       → 'missing_header' / 'invalid_signature_format' (D-10 split)
//   3. parse header       → strip 'sha256=' prefix; hex-tail check → 'invalid_signature_format'
//   4. compute HMAC       → computeHmac(req.rawBody, secret, 'sha256')   ← Buffer-direct (D-07)
//   5. compare bytes      → Buffer.from(headerHex, 'hex') vs computed → 'signature_mismatch'
//   6. read metadata      → X-GitHub-Delivery (D-08 missing→''; D-09 array→[0]||'')
//   7. JSON.parse body    → 'malformed_payload' (400) if parse fails
//   8. build GitHubWebhook with eventId === deliveryId (D-11) and timestamp = floor(Date.now()/1000) (D-12)
import type { Request } from 'express';
import { computeHmac } from '../crypto/hmac.js';
import { timingSafeCompare } from '../crypto/compare.js';
import { WebhookValidationError } from '../errors.js';
import { registerProvider } from './registry.js';
import type { Provider } from './types.js';
```

**Branch type (KEEP unchanged from current `github.ts:12-22`):**

```typescript
export type GitHubWebhook = {
  provider: 'github';
  eventId: string;
  timestamp: number;
  // WR-05: typed as `unknown` — consumers must narrow before key access.
  parsed: unknown;
  deliveryId: string;
};
```

**Step 1 — rawBody guard (COPY from `src/providers/stripe.ts:71-78`, swap `provider: 'stripe'` → `'github'`):**

```typescript
if (!req.rawBody) {
  throw new WebhookValidationError({
    reason: 'malformed_payload',
    provider: 'github',
    statusCode: 400,
  });
}
```

**Step 2 — Header three-way split (NEW pattern — D-10 corrected from day one; DO NOT copy `src/providers/stripe.ts:81-88` verbatim, that retains the WR-03 defect that folds array into `'missing_header'`):**

```typescript
const header = req.headers['x-hub-signature-256'];
if (header === undefined) {
  throw new WebhookValidationError({
    reason: 'missing_header',
    provider: 'github',
    statusCode: 401,
  });
}
if (typeof header !== 'string') {
  // Array-shaped (RFC 7230 duplicate header). Phase 4 stripe.ts folds this
  // into 'missing_header' (WR-03 defect, deferred to Phase 6 audit). Phase 5
  // ships the corrected three-way split from day one per D-10.
  throw new WebhookValidationError({
    reason: 'invalid_signature_format',
    provider: 'github',
    statusCode: 401,
  });
}
```

**Step 3 — `sha256=` prefix strip + hex tail validation (NEW — no Stripe analog, but the *shape* mirrors `parseStripeSignature()` returning `null` → throw `'invalid_signature_format'` at `src/providers/stripe.ts:91-98`):**

```typescript
// D-03: missing 'sha256=' prefix or non-hex tail → 'invalid_signature_format'
const PREFIX = 'sha256=';
if (!header.startsWith(PREFIX)) {
  throw new WebhookValidationError({
    reason: 'invalid_signature_format',
    provider: 'github',
    statusCode: 401,
  });
}
const headerHex = header.slice(PREFIX.length);
if (headerHex.length === 0 || !/^[0-9a-fA-F]+$/.test(headerHex)) {
  throw new WebhookValidationError({
    reason: 'invalid_signature_format',
    provider: 'github',
    statusCode: 401,
  });
}
```

Note the regex allows mixed case (`a-fA-F`); `parseStripeSignature` at `src/providers/stripe.ts:59` is lowercase-only. GitHub's spec is lowercase, but accepting mixed case is forgiving without changing security since `Buffer.from(hex, 'hex')` is case-insensitive anyway. Planner: pick lowercase-only `/^[0-9a-f]+$/` for strict consistency with stripe, or mixed case. Either is defensible — D-03 only requires "non-hex → invalid_signature_format".

**Step 4 — HMAC computation (DIFFERS from `src/providers/stripe.ts:102-103` — D-07 forbids the `${t}.` prefix and the `.toString('utf8')` round-trip):**

```typescript
// D-07: pass req.rawBody Buffer DIRECTLY — no UTF-8 round-trip, no prefix.
// computeHmac accepts Buffer | string (src/crypto/hmac.ts:16) and returns 32-byte Buffer.
const computed = computeHmac(req.rawBody, secret, 'sha256');
```

**Step 5 — Byte-compare via `timingSafeCompare` (ADAPT `src/providers/stripe.ts:106-120` — single segment, not a v1= loop; no early-break concern because there's only one segment):**

```typescript
// D-04: Buffer-on-both-sides, length-mismatch returns false (Phase 2 D-09)
const headerBuf = Buffer.from(headerHex, 'hex');
if (!timingSafeCompare(computed, headerBuf)) {
  throw new WebhookValidationError({
    reason: 'signature_mismatch',
    provider: 'github',
    statusCode: 401,
  });
}
```

**Step 6 — Read metadata header `X-GitHub-Delivery` (NEW — D-08 + D-09; no Stripe analog because Stripe has no metadata header):**

```typescript
// D-08: missing/empty → ''; D-09: array → [0] || ''. Auth has passed; this is post-auth metadata.
const deliveryRaw = req.headers['x-github-delivery'];
const deliveryId =
  Array.isArray(deliveryRaw)
    ? (deliveryRaw[0] || '')
    : (typeof deliveryRaw === 'string' ? deliveryRaw : '');
```

**Step 7 — JSON.parse rawBody (COPY from `src/providers/stripe.ts:135-144`, swap provider name):**

```typescript
let parsedBody: unknown;
try {
  parsedBody = JSON.parse(req.rawBody.toString('utf8'));
} catch {
  throw new WebhookValidationError({
    reason: 'malformed_payload',
    provider: 'github',
    statusCode: 400,
  });
}
```

**Step 8 — Build GitHubWebhook (NEW — D-11 `eventId === deliveryId`, D-12 receipt timestamp):**

```typescript
return {
  provider: 'github',
  eventId: deliveryId,                          // D-11
  timestamp: Math.floor(Date.now() / 1000),     // D-12 — receipt time, not provider-signed
  parsed: parsedBody,
  deliveryId,
};
```

**Validator signature & registration (ADAPT `src/providers/stripe.ts:68-70` and `:166`):**

```typescript
// IN-04 carry-over: accept the 3rd positional arg, ignore it. The middleware
// factory passes tolerance to all providers via positional cast (Phase 4 IN-02);
// GitHub has no timestamp, so silently swallow.
export const githubProvider: Provider = {
  name: 'github',
  validate(req: Request, secret: string, _toleranceSeconds?: number): GitHubWebhook {
    // Steps 1-8 above
  },
};

registerProvider('github', githubProvider);
```

**CRITICAL DELTA from current stub:** the stub at `src/providers/github.ts:24` declares `const githubProvider: Provider` (NOT exported). Stripe at `src/providers/stripe.ts:68` is `export const stripeProvider`. Phase 5's test file imports `githubProvider` directly (mirroring `src/providers/stripe.test.ts:4`), so the planner MUST add the `export` keyword. Same for shopify.ts — current `const shopifyProvider` (line 26) → `export const shopifyProvider`.

---

### `src/providers/shopify.ts` (provider-service, request-response)

**Analog:** `src/providers/stripe.ts` for skeleton + the github.ts pattern above for D-10 split, D-07 Buffer-direct HMAC, and metadata header reads. Shopify differs from GitHub on exactly two axes: (1) header decode is base64 not hex, (2) two metadata headers (topic + webhookId) instead of one (deliveryId).

**Header / import block (same shape as github.ts; only the comment specializes):**

```typescript
// Shopify provider — real HMAC-SHA256 signature validator (Phase 5).
// Pipeline:
//   1. rawBody guard      → 'malformed_payload' (400)
//   2. header guard       → 'missing_header' / 'invalid_signature_format' (D-10 split)
//   3. (no parse step — Shopify header is the bare base64 digest, no prefix)
//   4. compute HMAC       → computeHmac(req.rawBody, secret, 'sha256')  ← Buffer-direct (D-07)
//   5. compare bytes      → Buffer.from(headerValue, 'base64') vs computed
//                            (D-06 loose decode; D-05 hex-in-base64 falls through here as length-mismatch → 'signature_mismatch')
//   6. read metadata      → X-Shopify-Topic + X-Shopify-Webhook-Id (D-08/D-09)
//   7. JSON.parse body    → 'malformed_payload' (400) if parse fails
//   8. build ShopifyWebhook with eventId === webhookId (D-11), timestamp = floor(Date.now()/1000) (D-12)
import type { Request } from 'express';
import { computeHmac } from '../crypto/hmac.js';
import { timingSafeCompare } from '../crypto/compare.js';
import { WebhookValidationError } from '../errors.js';
import { registerProvider } from './registry.js';
import type { Provider } from './types.js';
```

**Branch type (KEEP unchanged from current `shopify.ts:13-24`):**

```typescript
export type ShopifyWebhook = {
  provider: 'shopify';
  eventId: string;
  timestamp: number;
  parsed: unknown;
  topic: string;
  webhookId: string;
};
```

**Steps 1, 2 — rawBody guard + three-way header split (SAME shape as github.ts above; swap `provider: 'github'` → `'shopify'` and the header name to `'x-shopify-hmac-sha256'`).**

**Step 3 — NO parse step.** Shopify's header value is the bare base64 digest with no prefix. Skip directly to step 4.

**Step 4 — HMAC computation (IDENTICAL to GitHub step 4 — D-07 Buffer-direct):**

```typescript
const computed = computeHmac(req.rawBody, secret, 'sha256');
```

**Step 5 — Byte-compare via `timingSafeCompare` (D-06 loose base64 decode, D-05 length-mismatch path):**

```typescript
// D-06: loose base64 decode — no pre-check on length or alphabet.
//       Buffer.from(_, 'base64') is lenient (whitespace, missing padding OK).
// D-05: hex-string-in-base64-header decodes to wrong-length buffer
//       (~48 bytes from 64 hex chars vs 32-byte computed).
//       timingSafeCompare returns false on length mismatch (Phase 2 D-09)
//       → throws 'signature_mismatch'. NO union widening for 'invalid_encoding'.
const headerBuf = Buffer.from(header, 'base64');
if (!timingSafeCompare(computed, headerBuf)) {
  throw new WebhookValidationError({
    reason: 'signature_mismatch',
    provider: 'shopify',
    statusCode: 401,
  });
}
```

**Step 6 — Read metadata headers — TWO of them (NEW — same `Array.isArray ? [0]||'' : typeof===string ? h : ''` shape as GitHub, applied twice):**

```typescript
const topicRaw = req.headers['x-shopify-topic'];
const topic =
  Array.isArray(topicRaw)
    ? (topicRaw[0] || '')
    : (typeof topicRaw === 'string' ? topicRaw : '');

const webhookIdRaw = req.headers['x-shopify-webhook-id'];
const webhookId =
  Array.isArray(webhookIdRaw)
    ? (webhookIdRaw[0] || '')
    : (typeof webhookIdRaw === 'string' ? webhookIdRaw : '');
```

Per CONTEXT "Claude's Discretion": planner MAY hoist this 3-line pattern into a `extractFirstValue(h: string | string[] | undefined): string` helper if total uses across the file exceed 5. Across both providers it's used 3× total (deliveryId, topic, webhookId), so inline duplication is fine.

**Step 7 — JSON.parse (IDENTICAL to GitHub step 7; swap provider name).**

**Step 8 — Build ShopifyWebhook:**

```typescript
return {
  provider: 'shopify',
  eventId: webhookId,                           // D-11 — eventId === webhookId
  timestamp: Math.floor(Date.now() / 1000),     // D-12
  parsed: parsedBody,
  topic,
  webhookId,
};
```

**Validator signature & registration (same as github.ts; export `shopifyProvider`):**

```typescript
export const shopifyProvider: Provider = {
  name: 'shopify',
  validate(req: Request, secret: string, _toleranceSeconds?: number): ShopifyWebhook {
    // Steps 1-8 above
  },
};

registerProvider('shopify', shopifyProvider);
```

---

### `src/providers/github.test.ts` (test, request-response) — NEW

**Analog:** `src/providers/stripe.test.ts` (Phase 4 — entire file structure, with WR-02 vacuous-pass defect *avoided* from day one).

**Imports & sample sensitive material — ADAPT `src/providers/stripe.test.ts:1-8`:**

```typescript
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { WebhookValidationError } from '../errors.js';
import { githubProvider } from './github.js';

const SAMPLE_SECRET = 'whsec_github_test_secret_do_not_leak';
const SAMPLE_BODY = '{"action":"opened","number":1,"repository":{"id":42}}';
const SAMPLE_DELIVERY = '01234567-89ab-cdef-0123-456789abcdef';
```

**Signature builder — ADAPT `src/providers/stripe.test.ts:14-18` (drop `t=…,v1=` prefix shape; produce `sha256=<hex>` of body Buffer):**

```typescript
/**
 * Build a correct X-Hub-Signature-256 value for the given body/secret.
 * Mirrors the exact HMAC input githubProvider.validate() computes:
 * the rawBody Buffer DIRECTLY (no timestamp prefix, no .toString('utf8') — D-07).
 */
function makeSignature(body: string | Buffer, secret: string): string {
  const sig = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${sig}`;
}
```

**Request fixture builder — ADAPT `src/providers/stripe.test.ts:24-37` (replace `'stripe-signature'` with `'x-hub-signature-256'`; add `x-github-delivery`):**

```typescript
function makeReq(opts: {
  body?: string;
  rawBody?: Buffer | undefined;
  signature?: string | string[] | undefined;
  delivery?: string | string[] | undefined;
}): unknown {
  const body = opts.body ?? SAMPLE_BODY;
  const headers: Record<string, string | string[]> = {};
  if (opts.signature !== undefined) headers['x-hub-signature-256'] = opts.signature;
  if (opts.delivery !== undefined) headers['x-github-delivery'] = opts.delivery;
  return {
    rawBody: opts.rawBody !== undefined ? opts.rawBody : Buffer.from(body),
    headers,
  };
}
```

**Mandatory outer-toThrow guard — D-14 (CONTRAST `src/providers/stripe.test.ts:152-180` which does NOT have the outer guard for two `it.each` cases — that's the WR-02 defect Phase 5 must avoid):**

Every error-case test MUST follow this exact two-step shape:

```typescript
it('<failure mode> throws <reason>', () => {
  const req = makeReq({ /* ... constructed to fail in this specific way ... */ });

  // Step 1 — outer guard: assert SOME WebhookValidationError is thrown.
  // Without this, if validate() silently returns instead of throwing, the
  // try/catch below vacuously passes (Phase 4 WR-02 defect).
  expect(() => githubProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
    WebhookValidationError
  );

  // Step 2 — introspection: assert the SPECIFIC reason and statusCode.
  try {
    githubProvider.validate(req as any, SAMPLE_SECRET);
  } catch (err) {
    expect((err as WebhookValidationError).reason).toBe('<expected_reason>');
    expect((err as WebhookValidationError).statusCode).toBe(401); // or 400
  }
});
```

**Test coverage — exact list per CONTEXT D-14 GitHub block (lines 102-114):**

| # | Test name | Setup | Expected | Decision binding |
|---|-----------|-------|----------|------------------|
| 1 | happy path: valid signature + matching rawBody → returns GitHubWebhook with eventId === deliveryId | `makeSignature(body, secret)`, delivery set | `provider==='github'`, `eventId===SAMPLE_DELIVERY`, `deliveryId===SAMPLE_DELIVERY`, `parsed` matches body, `timestamp` ≈ now | SC1, SC2, D-11, D-12 |
| 2 | tampered body throws signature_mismatch | sig built for original body; rawBody flipped | `WebhookValidationError`, reason `'signature_mismatch'` | SC1 negative |
| 3 | SHA-1-only request throws missing_header | `x-hub-signature` only (NO `-256`) | reason `'missing_header'`, status 401 | D-01, SC1 |
| 4 | both `x-hub-signature-256` and `x-hub-signature` present → SHA-256 validates normally | both headers, `-256` is correct | happy-path return; SHA-1 silently ignored | D-02 |
| 5 | bare hex (no `sha256=` prefix) throws invalid_signature_format | sig is `<64-hex-chars>` without prefix | reason `'invalid_signature_format'` | D-03 |
| 6 | non-hex tail throws invalid_signature_format | sig is `'sha256=zzzzz...'` | reason `'invalid_signature_format'` | D-03 |
| 7 | missing X-Hub-Signature-256 throws missing_header | no signature header | reason `'missing_header'`, status 401 | D-10 |
| 8 | array-shaped X-Hub-Signature-256 throws invalid_signature_format | `signature: ['sha256=...', 'sha256=...']` | reason `'invalid_signature_format'`, status 401 | D-10 (corrected from day one — DO NOT mirror Phase 4 stripe.ts WR-03 fold-into-missing_header) |
| 9 | missing rawBody throws malformed_payload (400) | `rawBody: undefined` | reason `'malformed_payload'`, status 400 | P3 D-07 |
| 10 | valid signature on non-JSON body throws malformed_payload | sig over `Buffer.from('not-json')`; that body | reason `'malformed_payload'`, status 400 | D-13 step 7 |
| 11 | missing X-GitHub-Delivery → success with deliveryId === '' and eventId === '' | sig correct, no delivery header | `deliveryId === ''`, `eventId === ''` | D-08, D-11 |
| 12 | array-shaped X-GitHub-Delivery → deliveryId === firstValue | sig correct, delivery is `['abc', 'def']` | `deliveryId === 'abc'`, `eventId === 'abc'` | D-09 |
| 13 | error serializations leak no signature/secret/body | trigger any failure with SAMPLE values | `JSON.stringify(err)` and `String(err)` contain none of SAMPLE_SIGNATURE / SAMPLE_SECRET / SAMPLE_BODY | P3 D-16, P2 D-11 |

**Leakage-assertion pattern — COPY `src/providers/stripe.test.ts:243-259`, swap provider:**

```typescript
it('error serializations do not contain signature, secret, or body bytes', () => {
  // Construct a deliberately failing case (e.g., tampered body) so we land in catch.
  const correctSig = makeSignature(SAMPLE_BODY, SAMPLE_SECRET);
  const tampered = Buffer.from(SAMPLE_BODY.replace('opened', 'XXXXXX'));
  const req = makeReq({ rawBody: tampered, signature: correctSig, delivery: SAMPLE_DELIVERY });
  try {
    githubProvider.validate(req as any, SAMPLE_SECRET);
  } catch (err) {
    const json = JSON.stringify(err);
    const str = String(err);
    expect(json).not.toContain(SAMPLE_SECRET);
    expect(json).not.toContain(SAMPLE_BODY);
    expect(str).not.toContain(SAMPLE_SECRET);
    // No need to assert the signature itself doesn't leak — error class
    // never receives it (P2 D-11 structural guarantee). Assertion is
    // defense-in-depth.
  }
});
```

---

### `src/providers/shopify.test.ts` (test, request-response) — NEW

**Analog:** `src/providers/stripe.test.ts` skeleton + the github.test.ts patterns above. Differs from github.test.ts only on: (1) signature builder produces base64 not `sha256=<hex>`, (2) two metadata headers (topic + webhookId) instead of one (delivery), (3) hex-as-base64 negative case replaces SHA-1 negative case.

**Signature builder — base64 not hex:**

```typescript
function makeSignature(body: string | Buffer, secret: string): string {
  // Bare base64 digest — no prefix, unlike GitHub's 'sha256=' prefix.
  return createHmac('sha256', secret).update(body).digest('base64');
}
```

**Request fixture builder — three optional headers:**

```typescript
function makeReq(opts: {
  body?: string;
  rawBody?: Buffer | undefined;
  signature?: string | string[] | undefined;
  topic?: string | string[] | undefined;
  webhookId?: string | string[] | undefined;
}): unknown {
  const body = opts.body ?? SAMPLE_BODY;
  const headers: Record<string, string | string[]> = {};
  if (opts.signature !== undefined) headers['x-shopify-hmac-sha256'] = opts.signature;
  if (opts.topic !== undefined) headers['x-shopify-topic'] = opts.topic;
  if (opts.webhookId !== undefined) headers['x-shopify-webhook-id'] = opts.webhookId;
  return {
    rawBody: opts.rawBody !== undefined ? opts.rawBody : Buffer.from(body),
    headers,
  };
}
```

**Test coverage — exact list per CONTEXT D-14 Shopify block (lines 116-126):**

| # | Test name | Setup | Expected | Decision binding |
|---|-----------|-------|----------|------------------|
| 1 | happy path: valid base64 signature + matching rawBody → returns ShopifyWebhook with eventId === webhookId | `makeSignature(body, secret)`, topic + webhookId set | `provider==='shopify'`, `eventId===SAMPLE_WEBHOOK_ID`, `webhookId===SAMPLE_WEBHOOK_ID`, `topic===SAMPLE_TOPIC`, `parsed` matches body | SC3, SC4, D-11, D-12 |
| 2 | tampered body throws signature_mismatch | sig built for original; rawBody flipped | reason `'signature_mismatch'` | SC3 negative |
| 3 | hex-encoded digest in base64 header throws signature_mismatch | sig is the same digest in **hex** (64 chars) instead of base64 (44 chars) — decodes to wrong-length buffer via `Buffer.from(_, 'base64')` | reason `'signature_mismatch'` (NOT `'invalid_encoding'` — D-05 explicitly rejects union widening) | D-05, SC3 |
| 4 | missing X-Shopify-Hmac-Sha256 throws missing_header | no signature header | reason `'missing_header'`, status 401 | D-10 |
| 5 | array-shaped X-Shopify-Hmac-Sha256 throws invalid_signature_format | `signature: [sig, sig]` | reason `'invalid_signature_format'` (D-10 day-one fix) | D-10 |
| 6 | missing rawBody throws malformed_payload (400) | `rawBody: undefined` | reason `'malformed_payload'`, status 400 | P3 D-07 |
| 7 | valid signature on non-JSON body throws malformed_payload | sig over `Buffer.from('not-json')`; that body | reason `'malformed_payload'`, status 400 | D-13 step 7 |
| 8 | missing X-Shopify-Topic → success with topic === '' | sig correct, no topic header | `topic === ''`, validation proceeds | D-08 |
| 9 | missing X-Shopify-Webhook-Id → success with webhookId === '' and eventId === '' | sig correct, no webhookId header | `webhookId === ''`, `eventId === ''` | D-08, D-11 |
| 10 | array-shaped X-Shopify-Topic → topic === firstValue | sig correct, topic is `['orders/create', 'orders/update']` | `topic === 'orders/create'` | D-09 |
| 11 | error serializations leak no signature/secret/body | trigger any failure with SAMPLE values | identical to GitHub test 13 | P3 D-16, P2 D-11 |

**Hex-as-base64 fixture — KEY case for SC3 / D-05 / SHOP-01:**

```typescript
it('hex-encoded digest in X-Shopify-Hmac-Sha256 header throws signature_mismatch', () => {
  // The digest IS the correct HMAC, but we encode it as hex (64 chars)
  // instead of base64 (44 chars). Buffer.from(_, 'base64') decodes the
  // 64-char hex string with the base64 alphabet, producing ~48 bytes
  // (vs. 32 bytes from the correct base64 of the same digest).
  // timingSafeCompare returns false on length mismatch (P2 D-09).
  const hexDigest = createHmac('sha256', SAMPLE_SECRET)
    .update(Buffer.from(SAMPLE_BODY))
    .digest('hex');                              // 64 hex chars
  const req = makeReq({
    body: SAMPLE_BODY,
    signature: hexDigest,                        // sent as base64 header — wrong encoding
    topic: SAMPLE_TOPIC,
    webhookId: SAMPLE_WEBHOOK_ID,
  });

  expect(() => shopifyProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
    WebhookValidationError
  );
  try {
    shopifyProvider.validate(req as any, SAMPLE_SECRET);
  } catch (err) {
    expect((err as WebhookValidationError).reason).toBe('signature_mismatch');
    expect((err as WebhookValidationError).statusCode).toBe(401);
  }
});
```

---

## Shared Patterns

Cross-cutting patterns applied identically to both `github.ts` and `shopify.ts`:

### 1. WebhookValidationError throw shape

**Source:** `src/errors.ts:45-60` (constructor); `src/providers/stripe.ts:73-77, 83-87, 93-97, 115-119, 126-130, 139-143` (call sites).

**Apply to:** every failure path in github.ts and shopify.ts.

```typescript
throw new WebhookValidationError({
  reason: '<one of: missing_header | invalid_signature_format | signature_mismatch | malformed_payload>',
  provider: '<github | shopify>',
  statusCode: <401 for auth failures, 400 for malformed_payload>,
});
```

NEVER pass `message` — `messageFor()` derives it deterministically (Phase 2 D-06). NEVER pass `cause` or `details` — Phase 2 D-11 structural leakage prevention.

### 2. Three-way header distinction (D-10 corrected from day one)

**Source:** Phase 4 D-04 + WR-03 corrected. NOT a copy from `src/providers/stripe.ts:81-88` — that retains the WR-03 defect that folds array → `'missing_header'`.

**Apply to:** the auth header read in both github.ts (line of `x-hub-signature-256` read) and shopify.ts (line of `x-shopify-hmac-sha256` read).

```typescript
const header = req.headers['<auth-header-name>'];
if (header === undefined) {
  throw new WebhookValidationError({ reason: 'missing_header', provider, statusCode: 401 });
}
if (typeof header !== 'string') {
  throw new WebhookValidationError({ reason: 'invalid_signature_format', provider, statusCode: 401 });
}
```

DO NOT consolidate this into `if (!header || typeof header !== 'string')` — that's the Phase 4 stripe.ts defect (`stripe.ts:82`). The two cases must throw different reasons.

### 3. Buffer-direct HMAC input (D-07 — diverges from Stripe)

**Source:** Phase 5 D-07. **Anti-analog:** `src/providers/stripe.ts:102` uses `${timestamp}.${req.rawBody.toString('utf8')}` because Stripe needs the timestamp prefix.

**Apply to:** the `computeHmac` call in both github.ts and shopify.ts.

```typescript
const computed = computeHmac(req.rawBody, secret, 'sha256');
//                            ^^^^^^^^^^ Buffer DIRECTLY — no .toString('utf8'), no prefix
```

`computeHmac` accepts `Buffer | string` (`src/crypto/hmac.ts:16`). Passing the Buffer skips a UTF-8 round-trip and matches what GitHub/Shopify signed byte-for-byte.

### 4. Constant-time comparison via timingSafeCompare

**Source:** `src/crypto/compare.ts:15-20`. Returns `false` on length mismatch without throwing (Phase 2 D-09). Single comparison only — no rotation loop (no early-break concern).

**Apply to:** the byte-compare step in both providers.

```typescript
const headerBuf = Buffer.from(headerValue, '<hex | base64>');
if (!timingSafeCompare(computed, headerBuf)) {
  throw new WebhookValidationError({ reason: 'signature_mismatch', provider, statusCode: 401 });
}
```

NEVER use `===`, `Buffer.compare`, or `headerBuf.equals(computed)` — all leak timing.

### 5. rawBody guard as step 1

**Source:** `src/providers/stripe.ts:71-78`. Always the first step before any header read or crypto operation.

**Apply to:** start of `validate()` body in both providers.

```typescript
if (!req.rawBody) {
  throw new WebhookValidationError({
    reason: 'malformed_payload',
    provider,
    statusCode: 400,
  });
}
```

### 6. JSON.parse AFTER signature passes

**Source:** `src/providers/stripe.ts:135-144` (Phase 4 D-08 step 7). Defense against parser-level DoS on attacker-controlled input — only authenticated bytes reach `JSON.parse`.

**Apply to:** step 7 of both providers' validators.

```typescript
let parsedBody: unknown;
try {
  parsedBody = JSON.parse(req.rawBody.toString('utf8'));
} catch {
  throw new WebhookValidationError({
    reason: 'malformed_payload',
    provider,
    statusCode: 400,
  });
}
```

### 7. Metadata header read with array-collapse (D-08 + D-09)

**Source:** Phase 5 D-08 + D-09 (no Stripe analog — Stripe has no metadata headers).

**Apply to:** every metadata header read (deliveryId in github.ts; topic + webhookId in shopify.ts).

```typescript
const raw = req.headers['<metadata-header-name>'];
const value =
  Array.isArray(raw)
    ? (raw[0] || '')
    : (typeof raw === 'string' ? raw : '');
```

Per CONTEXT "Claude's Discretion": MAY hoist into `extractFirstValue()` helper if usage exceeds 5; current count is 3 across both files, so inline duplication is preferred.

### 8. Co-located test file structure

**Source:** Phase 1 D-04 + Phase 4 D-11 + `src/providers/stripe.test.ts` whole-file shape.

**Apply to:** github.test.ts and shopify.test.ts.

- `import { describe, expect, it } from 'vitest';`
- `import { createHmac } from 'node:crypto';` (signature builder — never import `computeHmac` from `../crypto/hmac.js` in tests; that would make the test tautological).
- `import { WebhookValidationError } from '../errors.js';`
- `import { <providerName>Provider } from './<provider>.js';`
- Top-of-file `SAMPLE_SECRET` / `SAMPLE_BODY` constants for leakage assertions.
- Helper `makeSignature(body, secret)` and `makeReq(opts)` builder functions.
- Single top-level `describe('<providerName>Provider.validate()', () => { ... })`.
- Each error-case test: outer `expect(() => ...).toThrow(WebhookValidationError)` THEN `try/catch` introspection of `.reason` and `.statusCode`.
- Inline duplication of constants (no shared `test-fixtures.ts` — keep test files self-contained per Phase 1 D-04 spirit).

### 9. No `console.*` anywhere in `src/`

**Source:** Phase 3 D-16 (`src/middleware.ts:25-27` rationale comment).

**Apply to:** github.ts and shopify.ts (and their test files — no `console.log` debug leftovers).

The library never logs. Error class structural design (Phase 2 D-11) prevents secret/signature/body leakage. Logging is the consumer's responsibility via the optional error handler from Phase 3.

### 10. Provider interface compliance + IN-04 carry-over

**Source:** `src/providers/types.ts:12-14` (interface); `src/providers/stripe.ts:70` (`toleranceSeconds = 300` shape).

**Apply to:** both validator signatures.

```typescript
validate(req: Request, secret: string, _toleranceSeconds?: number): GitHubWebhook | ShopifyWebhook
```

The 3rd positional `_toleranceSeconds?` is type-erased at the middleware-factory call site (Phase 4 IN-02); GitHub/Shopify silently ignore it (Phase 4 IN-04). DO NOT widen the Provider interface for an options object — DX-01 v2 territory.

### 11. Self-registration at file bottom

**Source:** Phase 3 D-03 + `src/providers/stripe.ts:166`. Already present in current github.ts:32 and shopify.ts:34 stubs — Phase 5 KEEPS these lines unchanged.

**Apply to:** last line of github.ts and shopify.ts.

```typescript
registerProvider('github', githubProvider);   // KEEP — already in stub
registerProvider('shopify', shopifyProvider); // KEEP — already in stub
```

Phase 5 does NOT add separate exported registration functions; the side-effect import from `src/index.ts` (Phase 3 D-19) drives registration.

### 12. Branch type stays untouched

**Source:** Phase 3 D-09 + WR-05 lock.

**Apply to:** the `export type GitHubWebhook` (`github.ts:12-22`) and `export type ShopifyWebhook` (`shopify.ts:13-24`) declarations.

Phase 5 populates these at runtime; does NOT widen the types, does NOT add new fields, does NOT change `parsed: unknown` to a stricter type.

---

## No Analog Found

Two patterns have no direct analog in the existing codebase — the planner should treat these as Phase-5-original:

| Pattern | Reason no analog | RESEARCH.md guidance |
|---------|------------------|----------------------|
| `Buffer.from(headerHex, 'hex')` after `sha256=` prefix strip | Stripe has multi-segment v1= parsing (different shape); no provider has a single-prefix-and-tail pattern | RESEARCH.md GitHub section: header value is `sha256=<hex>`; strip prefix, validate hex tail, decode to Buffer |
| `Buffer.from(headerValue, 'base64')` loose decode | No provider in the codebase decodes base64 | RESEARCH.md Shopify section: base64-encoded HMAC; loose decode trusts P2 D-09 length-mismatch path; D-06 explicitly rejects pre-check |

Both are mechanically simple (one line each); the planner should reference CONTEXT D-03 / D-04 / D-05 / D-06 directly when writing the plan actions.

---

## Cross-Phase Pattern Anti-Examples (DO NOT COPY)

Surfaced here so the planner knows what NOT to mirror from Phase 4:

| Stripe pattern | Why Phase 5 must NOT copy |
|----------------|---------------------------|
| `src/providers/stripe.ts:82` — `if (!header || typeof header !== 'string')` collapsing missing + array into `'missing_header'` | Phase 4 WR-03 defect. Phase 5 D-10 splits these into two reasons from day one. |
| `src/providers/stripe.ts:102` — `${timestamp}.${req.rawBody.toString('utf8')}` HMAC input | Stripe-specific (timestamp prefix). Phase 5 D-07 passes Buffer directly with no prefix. |
| `src/providers/stripe.ts:122-131` — timestamp tolerance check | GitHub/Shopify have no provider-signed timestamp; D-12 uses receipt time. No tolerance arg processing. |
| `src/providers/stripe.test.ts:152-180` — `it('header with only v0= ...')` and `it('header with only v2= ...')` skip the outer `expect(() => ...).toThrow(WebhookValidationError)` guard before `try/catch` | Phase 4 WR-02 vacuous-pass defect. Phase 5 D-14 mandates the outer guard on every error-case test. |
| Phase 4 implicit assumption that `validate()` always throws on bad input | If validate() ever returns silently (e.g., during refactor), the WR-02 tests pass falsely. Outer guard catches this immediately. |

---

## Metadata

**Analog search scope:** `src/providers/`, `src/crypto/`, `src/errors.ts`, `src/middleware.ts`, `src/types.ts`.
**Files scanned:** 9 (stripe.ts, stripe.test.ts, github.ts stub, shopify.ts stub, hmac.ts, compare.ts, errors.ts, types.ts, registry.ts).
**Pattern extraction date:** 2026-05-08.
**Phase 4 analog quality:** stripe.ts is a near-exact structural template for github.ts/shopify.ts; the 4 deltas are: (1) HMAC input shape (D-07), (2) header parse/decode shape (D-03/D-06), (3) D-10 three-way split corrected from day one, (4) metadata header reads + receipt timestamp (D-08/D-09/D-12). All other architectural concerns (error throwing, rawBody guard, JSON.parse-after-signature, no logging, registration, branch type lock) carry forward verbatim.

---

## PATTERN MAPPING COMPLETE

**Phase:** 5 - GitHub & Shopify Providers
**Files classified:** 4 (2 modify, 2 NEW)
**Analogs found:** 4 / 4

### Coverage
- Files with exact analog: 4 / 4 (all four mirror Phase 4 stripe.{ts,test.ts})
- Files with role-match analog: 4 / 4
- Files with no analog: 0

### Key Patterns Identified
- All Phase 5 validators reuse `WebhookValidationError({ reason, provider, statusCode })` — ZERO new reasons added (D-05, D-08 explicit; `WebhookValidationReason` union locked at 6 members).
- HMAC input divergence from Stripe: `computeHmac(req.rawBody, secret, 'sha256')` Buffer-direct (D-07) — no UTF-8 round-trip, no `${t}.` prefix.
- D-10 three-way header split (`undefined → 'missing_header'`; array → `'invalid_signature_format'`; parses-but-no-match → `'signature_mismatch'`) ships from day one in github.ts and shopify.ts; Phase 4 stripe.ts retains the WR-03 defect for Phase 6 audit.
- Test files mandate `expect(() => ...).toThrow(WebhookValidationError)` outer guard before any `try/catch` introspection (D-14 — corrects Phase 4 WR-02 from day one).
- `eventId` cross-provider mapping locked: GitHub `eventId === deliveryId`; Shopify `eventId === webhookId`; Stripe `eventId === body.id` (Phase 4).
- Receipt timestamp `Math.floor(Date.now()/1000)` (D-12) — honest about no provider-signed timestamp on GitHub/Shopify.
- Step order: rawBody → header guard → header parse (GitHub only) → HMAC → byte-compare → metadata read → JSON.parse → build (D-13).
- Provider self-registration at file bottom (`registerProvider('<name>', <provider>)`) UNCHANGED from Phase 3 stubs.
- One delta the planner MUST add: change `const githubProvider` (`github.ts:24`) and `const shopifyProvider` (`shopify.ts:26`) to `export const` so test files can import them (mirrors `src/providers/stripe.ts:68`).

### File Created
`/home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru/.planning/phases/05-github-shopify-providers/05-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns in PLAN.md files; every Phase 5 plan action has a concrete file:line excerpt to copy from (or anti-copy from, in the WR-02/WR-03 cases).
