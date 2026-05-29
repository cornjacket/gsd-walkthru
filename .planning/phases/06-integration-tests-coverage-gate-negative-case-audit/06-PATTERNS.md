# Phase 6: Integration Tests, Coverage Gate & Negative-Case Audit - Pattern Map

**Mapped:** 2026-05-29
**Files analyzed:** 10 new + modified
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `tests/integration/stripe.test.ts` | test | request-response | `src/providers/stripe.test.ts` | exact |
| `tests/integration/github.test.ts` | test | request-response | `src/providers/github.test.ts` + `src/middleware.test.ts` | exact |
| `tests/integration/shopify.test.ts` | test | request-response | `src/providers/shopify.test.ts` + `src/middleware.test.ts` | exact |
| `vitest.config.ts` | config | test-config | `vitest.config.ts` (self) | exact |
| `package.json` | config | test-config | `package.json` (self) | exact |
| `.github/workflows/test.yml` | config | CI-config | `.github/workflows/test.yml` (self) | exact |
| `src/middleware.ts` | middleware | request-response | `src/middleware.ts` (self) | exact |
| `src/providers/stripe.ts` | provider | CRUD | `src/providers/stripe.ts` (self) | exact |
| `src/providers/stripe.test.ts` | test | request-response | `src/providers/stripe.test.ts` (self) | exact |
| `src/providers/github.test.ts` | test | request-response | `src/providers/github.test.ts` (self) | exact |
| `src/providers/shopify.test.ts` | test | request-response | `src/providers/shopify.test.ts` (self) | exact |
| `src/middleware.test.ts` | test | request-response | `src/middleware.test.ts` (self) | exact |

## Pattern Assignments

### `tests/integration/stripe.test.ts` (test, request-response)

**Analog:** `src/middleware.test.ts` (Supertest + Express setup) + `src/providers/stripe.test.ts` (fixture builders)

**Imports pattern** (from `src/middleware.test.ts:1-10`):
```typescript
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { webhookErrorHandler } from './error-handler.js';
import { createWebhookMiddleware } from './middleware.js';
import { rawBodyCapture } from './raw-body/middleware.js';
```

**Helper factory pattern** (from `src/providers/stripe.test.ts:14-18`):
```typescript
function makeSignature(body: string, secret: string, timestamp: number): string {
  const payload = `${timestamp}.${body}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}
```

**App builder pattern** (from `src/middleware.test.ts:97-105`):
```typescript
const app = express();
app.post(
  '/wh',
  rawBodyCapture(),
  createWebhookMiddleware('test-fake', { secret: 'wh_test_secret' }),
  (req, res) => {
    res.json({ webhook: req.webhook });
  }
);

const res = await request(app)
  .post('/wh')
  .set('content-type', 'application/json')
  .send('{"id":"evt_test"}');
```

**Supertest assertions pattern** (from `src/middleware.test.ts:107-114`):
```typescript
expect(res.status).toBe(200);
expect(res.body.webhook?.provider).toBe('test-fake');
```

**Error handler mounting** (from `src/middleware.test.ts:148-161`):
```typescript
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    captured = err;
    res.status(500).end();
  }
);
```

---

### `tests/integration/github.test.ts` (test, request-response)

**Analog:** `src/middleware.test.ts` (Supertest + Express integration) + `src/providers/github.test.ts` (fixture builders)

**Imports pattern** (from `src/middleware.test.ts:1-10`):
```typescript
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
```

**Fixture builder pattern with array headers** (from `src/providers/github.test.ts:19-48`):
```typescript
function makeSignature(body: string | Buffer, secret: string): string {
  const sig = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${sig}`;
}

function makeReq(opts: {
  body?: string;
  rawBody?: Buffer | undefined;
  signature?: string | string[] | undefined;
  delivery?: string | string[] | undefined;
  extraHeaders?: Record<string, string | string[]>;
}): unknown {
  const body = opts.body ?? SAMPLE_BODY;
  const headers: Record<string, string | string[]> = {};
  if (opts.signature !== undefined) headers['x-hub-signature-256'] = opts.signature;
  if (opts.delivery !== undefined) headers['x-github-delivery'] = opts.delivery;
  if (opts.extraHeaders) Object.assign(headers, opts.extraHeaders);
  return {
    rawBody: opts.rawBody !== undefined ? opts.rawBody : Buffer.from(body),
    headers,
  };
}
```

**Express app factory from middleware test** (see stripe integration pattern above)

---

### `tests/integration/shopify.test.ts` (test, request-response)

**Analog:** `src/middleware.test.ts` (Supertest + Express integration) + `src/providers/shopify.test.ts` (fixture builders — follows same pattern as github.test.ts)

**Imports and app builder:** See Stripe and GitHub integration patterns above.

**Fixture builder pattern** (from `src/providers/github.test.ts:19-22` — Shopify mirrors this):
```typescript
function makeSignature(body: string | Buffer, secret: string): string {
  const sig = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${sig}`;
}
```

---

### `vitest.config.ts` (config, test-config)

**Current pattern** (lines 1-8):
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
```

**Modifications needed (per D-06 + D-01..D-05):**
- Expand `include` to add `'tests/integration/**/*.test.ts'`
- Add `coverage` block with `include: ['src/crypto/**', 'src/providers/**', 'src/middleware.ts']`
- Set `coverage.thresholds.perFile = true` with `statements/branches/functions/lines: 90`

---

### `package.json` (config, test-config)

**Current scripts section** (lines 19-25):
```json
"scripts": {
  "build": "tsup",
  "test": "vitest run",
  "lint": "biome check .",
  "format": "biome format --write .",
  "typecheck": "tsc --noEmit -p tsconfig.test.json"
},
```

**Current devDependencies** (lines 36-45):
```json
"devDependencies": {
  "@biomejs/biome": "^2.4.14",
  "@types/express": "^4.17.21",
  "@types/node": "^20.0.0",
  "@types/supertest": "^7.2.0",
  "supertest": "^7.2.2",
  "tsup": "^8.5.1",
  "typescript": "^6.0.3",
  "vitest": "^4.1.5"
}
```

**Modifications needed (per D-07 + D-01):**
- Add `"test:coverage": "vitest run --coverage"` to scripts
- Add `@vitest/coverage-v8` to devDependencies

---

### `.github/workflows/test.yml` (config, CI-config)

**Current structure** (lines 1-46):
```yaml
name: Test

on:
  push:
    branches: ["**"]
  pull_request:
    branches: ["**"]

jobs:
  test:
    name: "Node ${{ matrix.node-version }} / Express ${{ matrix.express-version }}"
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node-version: [20.x, 22.x, 24.x]
        express-version: ["4.21.x", "5.x"]
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Set up Node.js
        ...
      - name: Install dependencies
        run: npm ci
      - name: Lint (Biome check)
        run: npm run lint
      - name: Build (tsup)
        run: npm run build
      - name: Test (Vitest)
        run: npm test
```

**Modifications needed (per D-04):**
- Add a 4th step after `Test (Vitest)` that runs ONLY on `matrix.node-version == '22.x' && matrix.express-version == '5.x'`
- Step runs: `npm run test:coverage`

---

### `src/middleware.ts` (middleware, request-response)

**Current pattern** (lines 59-70):
```typescript
export function createWebhookMiddleware(
  providerName: string,
  options: CreateWebhookMiddlewareOptions
): RequestHandler {
  // Secret validation at call time
  if (!options.secret?.trim()) {
    throw new Error(
      `Webhook secret required for provider '${providerName}'`
    );
  }
  
  const provider = getProvider(providerName);
  // ...
}
```

**Modifications needed (per D-13):**
- After secret validation, add tolerance NaN guard immediately:
```typescript
if (options.tolerance !== undefined) {
  if (typeof options.tolerance !== 'number' || !Number.isFinite(options.tolerance) || options.tolerance < 0) {
    throw new Error(
      `Webhook tolerance must be a non-negative finite number for provider '${providerName}' (got ${String(options.tolerance)})`
    );
  }
}
```
- Pass `tolerance` explicitly to `provider.validate()` call in the middleware request handler (removing the parameter default from stripe.ts per D-15 P4 WR-04)

---

### `src/providers/stripe.ts` (provider, CRUD)

**Current header guard pattern** (lines 80-88):
```typescript
const header = req.headers['stripe-signature'];
if (!header || typeof header !== 'string') {
  throw new WebhookValidationError({
    reason: 'missing_header',
    provider: 'stripe',
    statusCode: 401,
  });
}
```

**Current t= parser pattern** (lines 55-57):
```typescript
if (key === 't') {
  const ts = parseInt(value, 10);
  if (!isNaN(ts)) timestamp = ts;
}
```

**Modifications needed:**

**D-12 (WR-03): Three-way header split** — replace lines 80-88 with:
```typescript
const header = req.headers['stripe-signature'];
if (header === undefined) {
  throw new WebhookValidationError({
    reason: 'missing_header',
    provider: 'stripe',
    statusCode: 401,
  });
}
if (typeof header !== 'string') {
  throw new WebhookValidationError({
    reason: 'invalid_signature_format',
    provider: 'stripe',
    statusCode: 401,
  });
}
```

**D-14 (WR-05): Strict numeric t= parser** — replace lines 55-57 with:
```typescript
if (key === 't') {
  if (/^-?\d+$/.test(value)) {
    const ts = parseInt(value, 10);
    if (!isNaN(ts)) timestamp = ts;
  }
}
```

**D-15 P4 WR-04: Remove default from validate signature** — change line 70 from:
```typescript
validate(req: Request, secret: string, toleranceSeconds = 300): StripeWebhook {
```
to:
```typescript
validate(req: Request, secret: string, toleranceSeconds: number): StripeWebhook {
```

---

### `src/providers/stripe.test.ts` (test, request-response)

**Current test pattern** (from lines 42-54):
```typescript
it('happy path: valid signature and matching rawBody returns StripeWebhook', () => {
  const secret = SAMPLE_SECRET;
  const body = SAMPLE_BODY;
  const timestamp = Math.floor(Date.now() / 1000);
  const sig = makeSignature(body, secret, timestamp);
  const req = makeReq({ body, signature: sig });
  const result = stripeProvider.validate(req as any, secret);
  expect(result.provider).toBe('stripe');
  expect(result.eventId).toBe('evt_test');
});
```

**Outer toThrow guard pattern** (from lines 63-72):
```typescript
expect(() => stripeProvider.validate(req as any, secret)).toThrow(
  WebhookValidationError
);
try {
  stripeProvider.validate(req as any, secret);
} catch (err) {
  expect((err as WebhookValidationError).reason).toBe('signature_mismatch');
}
```

**Modifications needed:**

**D-15 P4 WR-02:** Wrap the 4 vacuous tests (lines 152-165, 167-180, 198-210, 243-259) with outer `toThrow` guards.

**D-12 (WR-03): Add array-header test** — new test after line 150:
```typescript
it('array-shaped Stripe-Signature header throws invalid_signature_format', () => {
  const timestamp = Math.floor(Date.now() / 1000);
  const req = makeReq({
    body: SAMPLE_BODY,
    signature: undefined, // omit, then add headers manually
  });
  (req as any).headers = {
    'stripe-signature': ['t=' + timestamp + ',v1=abc', 't=' + timestamp + ',v1=def']
  };
  expect(() => stripeProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
    WebhookValidationError
  );
  try {
    stripeProvider.validate(req as any, SAMPLE_SECRET);
  } catch (err) {
    expect((err as WebhookValidationError).reason).toBe('invalid_signature_format');
    expect((err as WebhookValidationError).reason).not.toBe('missing_header');
  }
});
```

**D-14 (WR-05): Add strict-numeric t= test** — new test:
```typescript
it('non-numeric t= value throws invalid_signature_format (D-14)', () => {
  const secret = SAMPLE_SECRET;
  const body = SAMPLE_BODY;
  const req = makeReq({
    body,
    signature: 't=1700000000xyz,v1=deadbeefcafe...'
  });
  expect(() => stripeProvider.validate(req as any, secret)).toThrow(
    WebhookValidationError
  );
  try {
    stripeProvider.validate(req as any, secret);
  } catch (err) {
    expect((err as WebhookValidationError).reason).toBe('invalid_signature_format');
  }
});
```

**D-15 P4 WR-04: Update happy-path to pass 300 explicitly** — change line 48:
```typescript
const result = stripeProvider.validate(req as any, secret, 300);
```

---

### `src/providers/github.test.ts` (test, request-response)

**Current test structure** (from lines 53-66):
```typescript
it('happy path: valid signature and matching rawBody returns GitHubWebhook with eventId === deliveryId', () => {
  const sig = makeSignature(SAMPLE_BODY, SAMPLE_SECRET);
  const req = makeReq({ signature: sig, delivery: SAMPLE_DELIVERY });
  const result = githubProvider.validate(req as any, SAMPLE_SECRET);
  expect(result.provider).toBe('github');
  expect(result.eventId).toBe(SAMPLE_DELIVERY);
});
```

**Outer toThrow guard pattern** (from lines 86-95):
```typescript
expect(() => githubProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
  WebhookValidationError
);
try {
  githubProvider.validate(req as any, SAMPLE_SECRET);
} catch (err) {
  expect((err as WebhookValidationError).reason).toBe('signature_mismatch');
}
```

**Leakage assertion pattern** (from lines 230-251):
```typescript
it('error serializations do not contain signature, secret, or body bytes', () => {
  const sig = makeSignature(SAMPLE_BODY, SAMPLE_SECRET);
  const tampered = Buffer.from(SAMPLE_BODY.replace('opened', 'XXXXXX'));
  const req = makeReq({ rawBody: tampered, signature: sig, delivery: SAMPLE_DELIVERY });
  expect(() => githubProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
    WebhookValidationError
  );
  try {
    githubProvider.validate(req as any, SAMPLE_SECRET);
  } catch (err) {
    const json = JSON.stringify(err);
    expect(json).not.toContain(SAMPLE_SECRET);
    expect(json).not.toContain(SAMPLE_BODY);
  }
});
```

**Modifications needed:**

**D-15 P5 WR-01: Add empty-string signature test** — new test after line 157:
```typescript
it('empty-string X-Hub-Signature-256 throws invalid_signature_format (D-15 P5 WR-01)', () => {
  const req = makeReq({ signature: '', delivery: SAMPLE_DELIVERY });
  expect(() => githubProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
    WebhookValidationError
  );
  try {
    githubProvider.validate(req as any, SAMPLE_SECRET);
  } catch (err) {
    expect((err as WebhookValidationError).reason).toBe('invalid_signature_format');
  }
});
```

**D-15 P5 WR-02: Fix vacuous body-leakage assertion at line 230** — replace the assertion with:
```typescript
it('error serializations do not contain signature, secret, or body bytes', () => {
  const sig = makeSignature(SAMPLE_BODY, SAMPLE_SECRET);
  const tampered = Buffer.from(SAMPLE_BODY.replace('opened', 'XXXXXX'));
  const req = makeReq({ rawBody: tampered, signature: sig, delivery: SAMPLE_DELIVERY });
  expect(() => githubProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
    WebhookValidationError
  );
  try {
    githubProvider.validate(req as any, SAMPLE_SECRET);
  } catch (err) {
    const json = JSON.stringify(err);
    const str = String(err);
    expect(json).not.toContain(SAMPLE_SECRET);
    expect(json).not.toContain(SAMPLE_BODY);
    expect(str).not.toContain(SAMPLE_SECRET);
    // D-16 defense-in-depth: the tampered buffer sent was 'opened' → 'XXXXXX'
    expect(json).not.toContain('XXXXXX');
  }
});
```

---

### `src/providers/shopify.test.ts` (test, request-response)

**Analog:** Identical pattern to `src/providers/github.test.ts`

**Modifications needed:** (Mirror of GitHub.test.ts)

**D-15 P5 WR-01: Add empty-string signature test** — new test:
```typescript
it('empty-string X-Shopify-Hmac-Sha256 throws signature_mismatch (D-15 P5 WR-01)', () => {
  const req = makeReq({ signature: '', /* body, ... */ });
  expect(() => shopifyProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
    WebhookValidationError
  );
  try {
    shopifyProvider.validate(req as any, SAMPLE_SECRET);
  } catch (err) {
    expect((err as WebhookValidationError).reason).toBe('signature_mismatch');
  }
});
```

**D-15 P5 WR-02: Fix vacuous body-leakage assertion** — at line 233, replace the assertion to assert against the unique bytes actually sent (e.g., `'XXXXX'` for Shopify instead of comparing against a buffer that doesn't equal `SAMPLE_BODY`).

**D-16: Add defense-in-depth leakage assertion** — add to the `'invalid_signature_format'` test path:
```typescript
expect(json).not.toContain(<bareHex>);
```
where `<bareHex>` is a 64-character hex segment from the error path.

---

### `src/middleware.test.ts` (test, request-response)

**Current test structure** (from lines 45-84):
```typescript
describe('createWebhookMiddleware', () => {
  beforeEach(() => {
    _clearRegistryForTesting();
    registerProvider('test-fake', makeFakeProvider());
  });

  it('throws synchronously on unknown provider (D-02)', () => {
    expect(() => createWebhookMiddleware('not-registered', { secret: 'x' })).toThrow(
      /unknown webhook provider/i
    );
  });

  it('throws synchronously on empty secret (PITFALLS #11, T-3-03)', () => {
    expect(() => createWebhookMiddleware('test-fake', { secret: '' })).toThrow(/secret/i);
  });
});
```

**Modifications needed (per D-13):**

Add three new tests after the empty-secret test (lines 72-83):

```typescript
it('throws synchronously on tolerance: NaN', () => {
  expect(() => createWebhookMiddleware('test-fake', { secret: 'x', tolerance: NaN })).toThrow(
    /tolerance.*non-negative finite/i
  );
});

it('throws synchronously on tolerance: -1', () => {
  expect(() => createWebhookMiddleware('test-fake', { secret: 'x', tolerance: -1 })).toThrow(
    /tolerance.*non-negative finite/i
  );
});

it('throws synchronously on tolerance: Infinity', () => {
  expect(() => createWebhookMiddleware('test-fake', { secret: 'x', tolerance: Infinity })).toThrow(
    /tolerance.*non-negative finite/i
  );
});

it('accepts tolerance: 0 (explicit safe-fail)', () => {
  expect(() => createWebhookMiddleware('test-fake', { secret: 'x', tolerance: 0 })).not.toThrow();
});

it('accepts tolerance: undefined (defaults to 300 in provider)', () => {
  expect(() => createWebhookMiddleware('test-fake', { secret: 'x', tolerance: undefined })).not.toThrow();
});
```

---

## Shared Patterns

### Test Fixture Builder Convention
**Source:** `src/providers/stripe.test.ts:14-37`, `src/providers/github.test.ts:19-48`
**Apply to:** All new integration test files (`tests/integration/*.test.ts`)

Each integration file defines inline (non-extracted) helper functions:
1. `makeSignature(body, secret, [timestamp])` — computes the correct header value per provider spec
2. `makeReq(opts)` — constructs a minimal Request object with `rawBody` and `headers`

Example structure:
```typescript
const SAMPLE_SECRET = 'whsec_test_secret_do_not_leak';
const SAMPLE_BODY = '{"id":"evt_test","type":"charge.succeeded"}';

function makeSignature(body: string, secret: string, timestamp: number): string {
  // Compute per provider's HMAC spec
}

function makeReq(opts: { body?: string; rawBody?: Buffer; signature?: string }): unknown {
  return {
    rawBody: opts.rawBody ?? Buffer.from(opts.body ?? SAMPLE_BODY),
    headers: opts.signature ? { 'header-name': opts.signature } : {},
  };
}
```

### Supertest Integration Pattern
**Source:** `src/middleware.test.ts:97-114`
**Apply to:** All integration test files

Each integration file creates a fresh Express app per test via factory:

```typescript
const app = express();
app.use(rawBodyCapture()); // or app.use(express.json({ verify: captureRawBody }))
app.post('/webhook', createWebhookMiddleware('stripe', { secret }), (req, res) => {
  res.json({ webhook: req.webhook });
});
app.use(webhookErrorHandler());

const res = await request(app)
  .post('/webhook')
  .set('content-type', 'application/json')
  .send(SAMPLE_BODY);

expect(res.status).toBe(200);
expect(res.body.webhook?.provider).toBe('stripe');
```

### Error Assertion Convention
**Source:** `src/providers/stripe.test.ts:63-72`, `src/providers/github.test.ts:86-95`
**Apply to:** All new integration and modified unit tests

Two-tier assertion pattern for error cases:
1. Outer `expect(() => fn()).toThrow(WebhookValidationError)` — ensures the throw happened
2. Inner try/catch with reason and statusCode assertions — specific error details

```typescript
expect(() => stripeProvider.validate(req as any, secret)).toThrow(
  WebhookValidationError
);
try {
  stripeProvider.validate(req as any, secret);
} catch (err) {
  expect((err as WebhookValidationError).reason).toBe('signature_mismatch');
  expect((err as WebhookValidationError).statusCode).toBe(401);
}
```

### Leakage Assertion Convention
**Source:** `src/providers/stripe.test.ts:243-259`, `src/providers/github.test.ts:230-251`
**Apply to:** All provider test files (existing + modified)

Assert that error serializations never leak sensitive material:

```typescript
try {
  stripeProvider.validate(req as any, SAMPLE_SECRET);
} catch (err) {
  const json = JSON.stringify(err);
  const str = String(err);
  expect(json).not.toContain(SAMPLE_SECRET);
  expect(json).not.toContain(SAMPLE_BODY);
  expect(str).not.toContain(SAMPLE_SECRET);
  // Defense-in-depth (D-16)
  expect(json).not.toContain('XXXXXX'); // or other body substring
}
```

### Factory-Time Validation Guard Pattern
**Source:** `src/middleware.test.ts:72-83`
**Apply to:** `src/middleware.ts` (tolerance check per D-13)

Plain `Error` (not `WebhookValidationError`) thrown synchronously at factory call time for configuration errors:

```typescript
if (options.tolerance !== undefined) {
  if (typeof options.tolerance !== 'number' || !Number.isFinite(options.tolerance) || options.tolerance < 0) {
    throw new Error(
      `Webhook tolerance must be a non-negative finite number for provider '${providerName}' (got ${String(options.tolerance)})`
    );
  }
}
```

### Vitest Coverage Config Pattern
**Source:** `vitest.config.ts` (to be expanded)
**Apply to:** Coverage setup in Phase 6

```typescript
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
  },
  coverage: {
    provider: 'v8',
    include: ['src/crypto/**', 'src/providers/**', 'src/middleware.ts'],
    thresholds: {
      perFile: true,
      statements: 90,
      branches: 90,
      functions: 90,
      lines: 90,
    },
  },
});
```

### NPM Script Convention
**Source:** `package.json` (existing scripts)
**Apply to:** Coverage script addition (D-07)

Existing pattern: `"test": "vitest run"`, `"lint": "biome check ."`, etc.

New addition: `"test:coverage": "vitest run --coverage"` — follows the `<category>:<action>` namespacing.

### CI Matrix and Coverage Gate Pattern
**Source:** `.github/workflows/test.yml` (lines 10-21, 44-45)
**Apply to:** Coverage step addition (D-04)

Existing 3×2 matrix (Node 20/22/24 × Express 4.21/5) runs all 6 cells with same steps.

New coverage gate: Add as 4th step (after `Test (Vitest)`) with conditional:
```yaml
- name: Test Coverage (Node 22 × Express 5.x)
  if: matrix.node-version == '22.x' && matrix.express-version == '5.x'
  run: npm run test:coverage
```

---

## No Analog Found

All files have direct analogs in the codebase:
- Integration test files mirror existing unit test file structure + Supertest patterns from `src/middleware.test.ts`
- Configuration files (`vitest.config.ts`, `package.json`, `.github/workflows/test.yml`) are self-analogs with targeted additions
- Modified provider and middleware files build on existing patterns with specific guards and validation rules

---

## Metadata

**Analog search scope:** `src/**/*.test.ts`, `src/middleware.ts`, `src/providers/**`, `.github/workflows/`, root config files

**Files scanned:** 13 (all existing test files + configs)

**Pattern extraction date:** 2026-05-29
