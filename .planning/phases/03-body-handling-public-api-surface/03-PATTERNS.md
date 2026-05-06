# Phase 3: Body Handling & Public API Surface - Pattern Map

**Mapped:** 2026-05-06
**Files analyzed:** 22 (16 new + 6 modified)
**Analogs found:** 18 / 22 (4 files have no in-repo analog — see "No Analog Found")

## File Classification

### New Files

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/middleware.ts` | factory / middleware | request-response | `src/errors.ts` (factory shape) + RESEARCH.md Pattern 1 | role-match |
| `src/middleware.test.ts` | test (unit + supertest) | request-response | `src/errors.test.ts` + `src/index.test.ts` | role-match |
| `src/error-handler.ts` | factory / error middleware | request-response (error path) | `src/errors.ts` (factory style) + RESEARCH.md Pattern 5 | role-match |
| `src/error-handler.test.ts` | test (unit + supertest) | request-response | `src/errors.test.ts` (table-driven `it.each`) | role-match |
| `src/types.ts` | type module + global augmentation | type-only | `src/errors.ts` (type-union + module shape) | role-match |
| `src/types.test.ts` | test (compile-time / type-only) | type-only | `src/index.test.ts` line 38-41 (type-only smoke) | partial |
| `src/raw-body/middleware.ts` | factory / middleware | streaming → buffer | `src/crypto/hmac.ts` (single-purpose Node `crypto` wrapper) + RESEARCH.md Pattern 4 | role-match |
| `src/raw-body/middleware.test.ts` | test (unit + supertest) | streaming → buffer | `src/crypto/hmac.test.ts` (vector check) | role-match |
| `src/raw-body/verify.ts` | utility (callback adapter) | request-response | `src/crypto/compare.ts` (single-purpose pure function) | role-match |
| `src/raw-body/verify.test.ts` | test (unit + supertest) | request-response | `src/crypto/compare.test.ts` | role-match |
| `src/providers/types.ts` | type module (interface) | type-only | `src/errors.ts` (union + module shape) | role-match |
| `src/providers/registry.ts` | utility (state singleton) | CRUD (in-memory map) | NONE — see "No Analog Found" | none |
| `src/providers/registry.test.ts` | test (unit) | CRUD | `src/crypto/compare.test.ts` (3-case shape) | partial |
| `src/providers/stripe.ts` | provider stub + branch type | event-driven (registers on import) | NONE — see "No Analog Found" | none |
| `src/providers/github.ts` | provider stub + branch type | event-driven | NONE — see "No Analog Found" | none |
| `src/providers/shopify.ts` | provider stub + branch type | event-driven | NONE — see "No Analog Found" | none |

### Modified Files

| Modified File | Role | Change | Analog (precedent) |
|---------------|------|--------|--------------------|
| `src/index.ts` | barrel | extend named re-exports + add side-effect imports | `src/index.ts` Phase 2 (current 5 exports — exact existing pattern) |
| `src/index.test.ts` | reachability smoke tests | extend with smokes for new exports | `src/index.test.ts` Phase 2 (existing 5 smoke tests — exact pattern to repeat) |
| `src/errors.ts` | type union + lookup table | add `'malformed_payload'` to `WebhookValidationReason`; ensure `messageFor` covers it | `src/errors.ts` Phase 2 (already shipped — widening only) |
| `src/errors.test.ts` | unit test | add one case for `'malformed_payload'` to `it.each` block | `src/errors.test.ts` lines 53-65 (existing `it.each` table) |
| `package.json` | manifest | add `supertest` + `@types/supertest` to `devDependencies`; add `typecheck` script | `package.json` Phase 1 (existing devDeps + scripts blocks) |
| `tsconfig.test.json` (NEW) | TypeScript config | extends `tsconfig.json`; removes `**/*.test.ts` exclude | `tsconfig.json` (existing config — extension target) |

---

## Pattern Assignments

### `src/middleware.ts` (factory, request-response)

**Closest analog:** `src/errors.ts` (locked-options factory style) + RESEARCH.md Pattern 1.

**Imports pattern** (model from RESEARCH.md `[VERIFIED: @types/express-serve-static-core/index.d.ts:55-68]`):

```ts
import type { RequestHandler } from 'express';
import { WebhookValidationError } from './errors.js';
import { getProvider } from './providers/registry.js';
```

**File-header doc comment pattern** — copy the *style* from `src/errors.ts` lines 1-9 (note: that comment block lives at module scope above the type alias, NOT as a JSDoc on a symbol):

```ts
// Phase 2 (errors.ts) precedent:
// Discriminated reason union for webhook signature validation failures.
// Phase 2 ships exactly the 4 reasons mandated by ROADMAP success criterion 3.
// Each later phase widens this union in the SAME commit that ships the test
// exercising the new reason. Phase 2 D-07 — DO NOT pre-add reasons.
```

For `middleware.ts`, header should reference D-01..D-04, D-13, D-17, and D-12 narrowing notes.

**Factory pattern** (RESEARCH.md Pattern 1, lines 345-388 of 03-RESEARCH.md — also reflects D-02/D-04/D-07/D-13):

```ts
export function createWebhookMiddleware(
  providerName: string,
  options: { secret: string }
): RequestHandler {
  // D-02: synchronous validation at call time, not request time.
  const provider = getProvider(providerName);
  if (!provider) {
    throw new Error(
      `Unknown webhook provider: '${providerName}'. ` +
      `Registered providers: ${Array.from(/* ... */).join(', ')}`
    );
  }
  // D-04: plain Error for config issues, not WebhookValidationError.
  // PITFALLS #11: fail loudly on missing config (empty/undefined secret).
  if (!options.secret) {
    throw new Error(`Webhook secret required for provider '${providerName}'`);
  }

  return (req, _res, next) => {
    // D-07: missing rawBody → malformed_payload validation error.
    if (!req.rawBody) {
      return next(new WebhookValidationError({
        reason: 'malformed_payload',
        provider: providerName,
        statusCode: 400,
      }));
    }
    try {
      const metadata = provider.validate(req, options.secret);
      req.webhook = metadata;
      next();
    } catch (err) {
      next(err);  // D-13: never write res ourselves; delegate via next(err).
    }
  };
}
```

**Error-construction pattern** — copy from `src/errors.ts` lines 47-57 (the locked options-object constructor; DO NOT positional-arg, DO NOT add `cause` or `details`):

```ts
new WebhookValidationError({
  reason: 'malformed_payload',
  provider: providerName,
  statusCode: 400,
})
```

**Style notes from existing code:**
- Single-quote strings (Biome `recommended` rule from Phase 1).
- Trailing semicolons on every statement (see `src/crypto/hmac.ts` line 17, `src/errors.ts` line 9).
- `import type` on type-only imports (see `src/errors.ts` test lines).
- Use `.js` extension on relative imports (verified in `src/index.ts` lines 7-9 — `'./crypto/compare.js'`, `'./crypto/hmac.js'`, `'./errors.js'`).

---

### `src/middleware.test.ts` (test, request-response — supertest + unit)

**Closest analog:** `src/errors.test.ts` (table-driven structure) + RESEARCH.md Code Example 3 (lines 950-1003).

**Imports pattern** (RESEARCH.md Code Example 3):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createWebhookMiddleware } from './middleware.js';
import { rawBodyCapture } from './raw-body/middleware.js';
import {
  registerProvider,
  _clearRegistryForTesting,
} from './providers/registry.js';
import type { Provider } from './providers/types.js';
```

**Vitest describe/it pattern** — copy structure from `src/errors.test.ts` lines 12-91:

```ts
describe('createWebhookMiddleware', () => {
  beforeEach(() => {
    // Register the production providers via side-effect import (D-22 pattern)
    // OR clear and register fakes — planner picks per test.
  });

  it('throws synchronously on unknown provider (D-02)', () => {
    expect(() =>
      createWebhookMiddleware('not-registered', { secret: 's' })
    ).toThrow(/unknown.*provider/i);
  });

  it('throws synchronously on missing/empty secret (PITFALLS #11)', () => {
    expect(() =>
      createWebhookMiddleware('test-fake', { secret: '' })
    ).toThrow(/secret/i);
  });

  it('returns a RequestHandler that calls next() on the success path', async () => {
    /* supertest body — see RESEARCH.md Code Example 3 */
  });

  it('does not call any console method during validation failure', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    /* ... exercise failure path ... */
    expect(errSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
```

**Sample-leak assertion pattern** — copy verbatim from `src/errors.test.ts` lines 7-10 + 67-79 if any test of this file constructs a `WebhookValidationError` (e.g., the `'malformed_payload'` path):

```ts
const SAMPLE_SIGNATURE = 't=1700000000,v1=deadbeefcafe1234567890abcdef';
const SAMPLE_SECRET = 'whsec_super_secret_value_do_not_leak';
const SAMPLE_BODY = '{"id":"evt_test","type":"charge.succeeded"}';
// ... assert json/string never contains any of [SAMPLE_*]
```

---

### `src/error-handler.ts` (factory, error middleware, request-response)

**Closest analog:** `src/errors.ts` (single-export module style) + RESEARCH.md Pattern 5 (lines 593-614 of 03-RESEARCH.md).

**Imports pattern**:

```ts
import type { ErrorRequestHandler } from 'express';
import { WebhookValidationError } from './errors.js';
```

**Factory pattern** (RESEARCH.md Pattern 5; D-14, D-15, D-16):

```ts
export function webhookErrorHandler(): ErrorRequestHandler {
  // D-14: 4-arg factory. fn.length === 4 preserved through factory return
  // (verified empirically — RESEARCH.md Pattern 5).
  return (err, _req, res, next) => {
    if (err instanceof WebhookValidationError) {
      // D-15: { error: <generic>, reason: <discriminated> }
      // D-16: NO logging.
      res.status(err.statusCode).json({
        error: 'webhook validation failed', // generic phrase (uniform — Assumption A5)
        reason: err.reason,                  // discriminated programmatic signal
      });
      return;
    }
    // D-14: pass non-WebhookValidationError errors through.
    next(err);
  };
}
```

**Comment style** — copy from `src/errors.ts` lines 26-41 (multi-line block comment above the export):

```ts
/**
 * Opt-in 4-arg Express error middleware (Phase 3 D-14).
 *
 * Detects `err instanceof WebhookValidationError` and emits the
 * `{ error, reason }` JSON shape (D-15) at `err.statusCode`. Passes
 * non-matching errors through to `next(err)` so consumers' downstream
 * error pipelines (Sentry, structured logging, etc.) keep ownership.
 *
 * D-16: this handler calls NO logging methods. Library-never-logs is
 * a structural guarantee — any logging is the consumer's choice.
 *
 * Mounted by the consumer: `app.use(webhookErrorHandler())`. NEVER
 * auto-mounted from inside `createWebhookMiddleware()` (D-14).
 */
```

---

### `src/error-handler.test.ts` (test, error middleware)

**Closest analog:** `src/errors.test.ts` lines 1-91 — combination of `it.each` table + supertest mounting.

**Imports pattern**:

```ts
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { webhookErrorHandler } from './error-handler.js';
import { WebhookValidationError, type WebhookValidationReason } from './errors.js';
```

**Test structure** (mix of `errors.test.ts` `it.each` + supertest):

```ts
describe('webhookErrorHandler', () => {
  it.each<[WebhookValidationReason, number]>([
    ['signature_mismatch', 401],
    ['timestamp_too_old',  401],
    ['missing_header',     401],
    ['missing_secret',     401],
    ['malformed_payload',  400],
  ])('emits %s with status %d and { error, reason } body', async (reason, statusCode) => {
    const app = express();
    app.get('/boom', (_req, _res, next) => {
      next(new WebhookValidationError({ reason, provider: 'stripe', statusCode }));
    });
    app.use(webhookErrorHandler());

    const res = await request(app).get('/boom');
    expect(res.status).toBe(statusCode);
    expect(res.body).toEqual({ error: 'webhook validation failed', reason });
  });

  it('passes non-WebhookValidationError errors through to next(err)', async () => {
    /* mount handler, throw a plain Error, assert response is the consumer's
       fallback handler / 500 — NOT { error, reason } shape. */
  });

  it('calls no logging methods (D-16)', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    /* ... exercise both paths (instanceof + passthrough) ... */
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('preserves fn.length === 4 (Express 4-arg detection)', () => {
    expect(webhookErrorHandler().length).toBe(4);
  });
});
```

The `it.each` block above is the **direct extension** of the `it.each` table on `src/errors.test.ts:53-65` — same shape, same vitest helper.

---

### `src/types.ts` (type module + global augmentation, type-only)

**Closest analog:** `src/errors.ts` lines 5-9 (top-level type alias union pattern) + RESEARCH.md Pattern 2 (lines 411-431 of 03-RESEARCH.md).

**Imports + augmentation pattern** (RESEARCH.md Pattern 2; D-10, D-11):

```ts
import type { StripeWebhook } from './providers/stripe.js';
import type { GitHubWebhook } from './providers/github.js';
import type { ShopifyWebhook } from './providers/shopify.js';

export type WebhookMetadata = StripeWebhook | GitHubWebhook | ShopifyWebhook;

// D-11: global declaration merging on Express.Request.
// File MUST be a module (it has exports above), so consumers picking
// up this augmentation requires only `import { ... } from 'express-webhook-validator'`
// somewhere in their build graph. The barrel re-exports from this file (D-19).
declare global {
  namespace Express {
    interface Request {
      webhook?: WebhookMetadata;
      rawBody?: Buffer;
    }
  }
}
```

**Pattern justification** (planner reference):
- The pattern matches Phase 2 `src/errors.ts` lines 5-9 union shape.
- The global block lives in `src/types.ts` (a module file, NOT `src/express.d.ts`). RESEARCH.md Open Question 1 resolves this — module file is canonical.
- The `webhook?:` is OPTIONAL per D-12; consumer-side narrowing via `if (req.webhook?.provider === 'stripe')` is the documented path.

**File-header comment** — extend the Phase 2 style from `src/errors.ts:1-4`:

```ts
// WebhookMetadata: discriminated union of per-provider webhook branches.
// Each branch is co-located in its provider module (D-10): see
// src/providers/stripe.ts, github.ts, shopify.ts.
//
// Global Express.Request augmentation (D-11) lives at the bottom of
// this file. Consumers get `req.webhook?: WebhookMetadata` and
// `req.rawBody?: Buffer` typed automatically once they import any
// value from `express-webhook-validator`.
```

---

### `src/types.test.ts` (test, type-only / compile-time)

**Closest analog:** `src/index.test.ts` lines 38-41 (type-only smoke pattern) + RESEARCH.md Code Example 2 (lines 913-944 of 03-RESEARCH.md).

**Imports pattern**:

```ts
import { describe, expectTypeOf, it } from 'vitest';
import type { WebhookMetadata } from './types.js';
```

**Test pattern** (RESEARCH.md Code Example 2 — verbatim usable):

```ts
describe('WebhookMetadata discriminated union', () => {
  it('narrows to StripeWebhook when provider === "stripe"', () => {
    const meta = {} as WebhookMetadata;
    if (meta.provider === 'stripe') {
      expectTypeOf(meta.replayWindowMs).toEqualTypeOf<number>();
    }
  });

  it('forbids accessing Shopify-only fields on a Stripe-narrowed branch', () => {
    const meta = {} as WebhookMetadata;
    if (meta.provider === 'stripe') {
      // @ts-expect-error — `topic` is a Shopify-only field.
      const _topic = meta.topic;
    }
  });

  it('forbids accessing GitHub-only fields on a Stripe-narrowed branch', () => {
    const meta = {} as WebhookMetadata;
    if (meta.provider === 'stripe') {
      // @ts-expect-error — `deliveryId` is a GitHub-only field.
      const _deliveryId = meta.deliveryId;
    }
  });
});
```

**Critical infrastructure dependency:** This test ONLY exercises the type system if `tsconfig.test.json` exists and is run via `tsc --noEmit -p tsconfig.test.json`. See "Shared Patterns → typecheck infrastructure" below.

---

### `src/raw-body/middleware.ts` (factory / middleware, streaming → buffer)

**Closest analog:** `src/crypto/hmac.ts` (single-purpose Node-built-in wrapper, exactly one export, file-header comment + JSDoc) + RESEARCH.md Pattern 4 (lines 519-548 of 03-RESEARCH.md).

**Imports pattern** (RESEARCH.md Pattern 4):

```ts
import type { RequestHandler } from 'express';
import getRawBody from 'raw-body';
```

**Factory pattern** (RESEARCH.md Pattern 4; D-08):

```ts
export interface RawBodyOptions {
  /** Default '1mb' (D-08). Accepts any string the `bytes` package parses. */
  limit?: string | number;
}

export function rawBodyCapture(options: RawBodyOptions = {}): RequestHandler {
  const limit = options.limit ?? '1mb';

  return (req, _res, next) => {
    // Skip if a previous middleware (e.g., express.json with verify) already captured.
    // Matches Pitfall 3 guidance — preserve raw bytes across multiple capture surfaces.
    if (req.rawBody) return next();

    getRawBody(req, { limit, length: req.headers['content-length'] })
      .then((buf) => {
        req.rawBody = buf;
        next();
      })
      .catch((err) => {
        // raw-body throws RawBodyError with .status set (413, 400, 415).
        // D-13: never write res ourselves; delegate via next(err).
        // Pitfall 4: 413 is NOT a WebhookValidationError; consumer's pipeline
        // handles it (or webhookErrorHandler passes it through unchanged).
        next(err);
      });
  };
}
```

**JSDoc style** — copy from `src/crypto/hmac.ts` lines 3-15 (param-by-param block above export):

```ts
/**
 * Phase 3 D-05 standalone raw-body capture middleware.
 *
 * Reads the request stream into a Buffer and stores it at `req.rawBody`
 * before any JSON parsing. Mount BEFORE `express.json()` on a per-route
 * basis (PITFALLS #18 — never globally).
 *
 * @param options.limit - Maximum body size (default '1mb', D-08). Accepts
 *                        bytes-string ('1mb', '500kb') or raw byte count.
 *                        Bodies exceeding this limit reject with HTTP 413
 *                        before HMAC computation runs.
 *
 * Skips capture when `req.rawBody` is already set (Pitfall 3 — preserves
 * the raw bytes from a prior `express.json({ verify: captureRawBody })`
 * pass on the same route).
 */
```

---

### `src/raw-body/middleware.test.ts` (test, streaming)

**Closest analog:** `src/crypto/hmac.test.ts` (vector check + return-type assertion) + RESEARCH.md Common Operation 1.

**Imports pattern**:

```ts
import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { rawBodyCapture } from './middleware.js';
```

**Test structure** — extends `src/crypto/hmac.test.ts` shape (known-vector + type assertion) with supertest:

```ts
describe('rawBodyCapture', () => {
  it('populates req.rawBody as a Buffer with the exact bytes sent', async () => {
    const app = express();
    let captured: Buffer | undefined;
    app.post('/wh', rawBodyCapture(), (req, res) => {
      captured = req.rawBody;
      res.json({ ok: true });
    });

    const body = '{"id":"evt_test"}';
    await request(app).post('/wh').set('content-type', 'application/json').send(body);

    expect(Buffer.isBuffer(captured)).toBe(true);
    expect(captured?.toString('utf8')).toBe(body);
  });

  it('respects { limit } and rejects oversize with 413', async () => {
    const app = express();
    app.post('/wh', rawBodyCapture({ limit: '10b' }), (_req, res) => res.json({ ok: true }));
    /* default Express error handler emits 413 */
    const res = await request(app).post('/wh').send('x'.repeat(100));
    expect(res.status).toBe(413);
  });

  it('skips capture when req.rawBody is already set (Pitfall 3)', async () => {
    /* mount express.json({ verify: captureRawBody }) BEFORE rawBodyCapture();
       assert the second middleware doesn't overwrite or error. */
  });

  it('413 errors are NOT WebhookValidationError (Pitfall 4)', async () => {
    /* exercise oversize path; assert err.status === 413 and
       err is not instanceof WebhookValidationError. */
  });
});
```

**Buffer-assertion idiom** — copy from `src/crypto/hmac.test.ts:18`: `expect(Buffer.isBuffer(digest)).toBe(true);` is the canonical pattern in this repo.

---

### `src/raw-body/verify.ts` (utility, request-response)

**Closest analog:** `src/crypto/compare.ts` (single pure function, no state, exactly one export, length-guard pattern) + RESEARCH.md Pattern 3 (lines 454-475 of 03-RESEARCH.md).

**Imports + helper pattern** (RESEARCH.md Pattern 3; D-05/D-06; Pitfall 6):

```ts
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Helper for `express.json({ verify: captureRawBody })`. Stores the raw
 * pre-parse Buffer at `req.rawBody` so the validation middleware can
 * compute the HMAC against the exact bytes the provider sent.
 *
 * @param req - Node IncomingMessage (NOT Express Request — body-parser
 *              invokes verify before Express's Request shape is established;
 *              see Pitfall 6).
 * @param buf - The raw pre-parse Buffer from body-parser.
 *
 * Why a single shared property name: matches the standalone middleware (D-06).
 * The `req.rawBody` field is declared globally on Express.Request in src/types.ts.
 */
export function captureRawBody(
  req: IncomingMessage,
  _res: ServerResponse,
  buf: Buffer,
  _encoding: string
): void {
  // D-06: stash on req.rawBody as Buffer. Do NOT decode using `encoding` —
  // providers sign raw bytes, not decoded strings.
  // Pitfall 6: `req` is IncomingMessage here; cast inline to attach property.
  (req as IncomingMessage & { rawBody?: Buffer }).rawBody = buf;
}
```

**Style mirror from `src/crypto/compare.ts`:**
- Single export (line 15 of compare.ts).
- File-header doc block above export (lines 3-14).
- `node:` prefix on built-in imports (line 1: `import { timingSafeEqual } from 'node:crypto'`).
- No try/catch — this helper does nothing that can throw (Pitfall 5 in PITFALLS.md / Pitfall in RESEARCH.md anti-patterns: "Throwing in `verify` callback").

---

### `src/raw-body/verify.test.ts` (test, request-response)

**Closest analog:** `src/crypto/compare.test.ts` (3-case shape with no setup overhead) + RESEARCH.md Common Operation 1.

**Imports pattern**:

```ts
import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { captureRawBody } from './verify.js';
```

**Test structure** — copy `src/crypto/compare.test.ts` 3-case minimalism but exercise via supertest:

```ts
describe('captureRawBody', () => {
  it('stores raw body Buffer at req.rawBody when used as express.json verify callback', async () => {
    const app = express();
    let captured: Buffer | undefined;
    app.post('/wh', express.json({ verify: captureRawBody }), (req, res) => {
      captured = req.rawBody;
      res.json({ ok: true });
    });

    const body = '{"id":"evt_test"}';
    await request(app).post('/wh').set('content-type', 'application/json').send(body);

    expect(Buffer.isBuffer(captured)).toBe(true);
    expect(captured?.toString('utf8')).toBe(body);
  });

  it('produces the same Buffer shape as the standalone middleware', async () => {
    /* parallel test: run both surfaces against identical input;
       compare resulting Buffers byte-for-byte (BODY-01 cross-surface
       parity). */
  });

  it('does not throw or decode the body using the encoding parameter', () => {
    /* unit-only: invoke captureRawBody directly with a Buffer + encoding;
       assert no decoding side-effect. */
  });
});
```

---

### `src/providers/types.ts` (type module — interface)

**Closest analog:** `src/errors.ts` lines 5-9 (type union shape) + RESEARCH.md Pattern 6 (lines 635-645 of 03-RESEARCH.md).

**Pattern**:

```ts
import type { Request } from 'express';
import type { WebhookMetadata } from '../types.js';

export interface Provider {
  readonly name: string;
  // Phase 4-5 will define this method's full shape.
  // Phase 3 ships a stub that throws if invoked at request time.
  validate(req: Request, secret: string): WebhookMetadata;
}
```

**Style notes:** Single-export module (matches `src/errors.ts` shape — one type alias, one class). `import type` for compile-time-only imports.

---

### `src/providers/registry.ts` (utility — in-memory state singleton)

**No close in-repo analog.** This is the first stateful utility in the codebase. Phase 2 had only pure functions (`computeHmac`, `timingSafeCompare`) and one error class. RESEARCH.md Pattern 6 is the binding spec.

**Pattern** (RESEARCH.md Pattern 6, lines 647-665):

```ts
import type { Provider } from './types.js';

const registry = new Map<string, Provider>();

/**
 * Register a provider implementation by name (D-01, D-03).
 * Last-write-wins on duplicate name (planner discretion per CONTEXT
 * "Claude's Discretion" — replace, don't throw, to stay consistent
 * with `Map.set` defaults and to allow Phase 4/5 to substitute the
 * stub providers without forcing a clear).
 */
export function registerProvider(name: string, provider: Provider): void {
  registry.set(name, provider);
}

/**
 * Look up a registered provider by name. Returns `undefined` if not
 * registered — `createWebhookMiddleware` interprets `undefined` as
 * the unknown-provider failure (D-02) and throws a plain Error.
 */
export function getProvider(name: string): Provider | undefined {
  return registry.get(name);
}

/**
 * Test-only escape hatch for clearing registry state between cases.
 * Leading-underscore name signals private API; not re-exported from
 * `src/index.ts`. Used by Phase 3 unit tests (D-22) to isolate
 * fake-provider registration from the production side-effect imports.
 */
export function _clearRegistryForTesting(): void {
  registry.clear();
}
```

**Style notes (synthesized from existing code):**
- Module-scope `const` for the singleton (matches the pattern of `src/errors.ts` having a module-scope `messageFor` helper at line 19).
- File-header comment explaining D-01/D-03 (style copied from `src/errors.ts:1-4` block-comment style).
- Three named exports total. NOT re-exported as a `default` (Phase 2 03-03 pattern: named exports only).

---

### `src/providers/registry.test.ts` (test, CRUD)

**Closest analog:** `src/crypto/compare.test.ts` (3-case shape with no setup overhead).

**Imports pattern**:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { _clearRegistryForTesting, getProvider, registerProvider } from './registry.js';
import type { Provider } from './types.js';
```

**Test structure** (registry-isolated — see Pitfall 2 in RESEARCH.md):

```ts
describe('provider registry', () => {
  beforeEach(() => {
    _clearRegistryForTesting();
  });

  it('register/get round-trip returns the same provider instance', () => {
    const fake: Provider = { name: 'x', validate: () => ({ /* ... */ } as never) };
    registerProvider('x', fake);
    expect(getProvider('x')).toBe(fake);
  });

  it('returns undefined for an unregistered name', () => {
    expect(getProvider('not-registered')).toBeUndefined();
  });

  it('last-write-wins on duplicate registration', () => {
    const a: Provider = { name: 'dup', validate: () => ({ /* ... */ } as never) };
    const b: Provider = { name: 'dup', validate: () => ({ /* ... */ } as never) };
    registerProvider('dup', a);
    registerProvider('dup', b);
    expect(getProvider('dup')).toBe(b);
  });
});
```

**Critical Pitfall 2 note:** This test file imports `./registry.js` directly — NOT through `'../index.js'` — to avoid triggering the side-effect imports that pre-populate the registry with stripe/github/shopify.

---

### `src/providers/stripe.ts`, `github.ts`, `shopify.ts` (provider stubs + branch types)

**No close in-repo analog.** First per-provider modules in the repo. RESEARCH.md Pattern 6 is the binding spec.

**Pattern for each provider** (RESEARCH.md Pattern 6, lines 668-690 of 03-RESEARCH.md; D-09, D-10, D-03):

```ts
// src/providers/stripe.ts
import type { Provider } from './types.js';
import { registerProvider } from './registry.js';

export type StripeWebhook = {
  provider: 'stripe';
  eventId: string;
  timestamp: number;
  parsed: Record<string, unknown>;
  replayWindowMs: number;
};

const stripeProvider: Provider = {
  name: 'stripe',
  validate(_req, _secret) {
    // Phase 4 fills this in.
    throw new Error('Stripe provider not yet implemented (Phase 4)');
  },
};

// D-03: side-effect registration at top level.
registerProvider('stripe', stripeProvider);
```

**Per-provider field shapes (D-09 — exact branch types):**

```ts
// stripe.ts
export type StripeWebhook = {
  provider: 'stripe';
  eventId: string;
  timestamp: number;
  parsed: Record<string, unknown>;
  replayWindowMs: number;  // Stripe-specific: replay window for timestamp check
};

// github.ts
export type GitHubWebhook = {
  provider: 'github';
  eventId: string;
  timestamp: number;
  parsed: Record<string, unknown>;
  deliveryId: string;  // GitHub-specific: X-GitHub-Delivery header
};

// shopify.ts
export type ShopifyWebhook = {
  provider: 'shopify';
  eventId: string;
  timestamp: number;
  parsed: Record<string, unknown>;
  topic: string;       // Shopify-specific: X-Shopify-Topic header
  webhookId: string;   // Shopify-specific: X-Shopify-Webhook-Id header
};
```

**Stub error message convention** — uses plain `Error` (D-04 mandates plain Error for non-validation paths; the stub is in a similar "this should never happen if the phase is correctly bounded" category):

```ts
throw new Error('<Provider> provider not yet implemented (Phase <N>)');
```

**File-header comment** — extend `src/errors.ts:1-4` style:

```ts
// Stripe provider stub (Phase 3, fills in Phase 4).
//
// D-09: StripeWebhook branch type co-located here per D-10. Phase 4
// will populate `validate()` with real signature-checking logic;
// Phase 3 ships a throwing stub so the registry has the entry but
// Phase 3 tests register a fake (D-22) instead of invoking this stub.
```

**Tests:** No `<provider>.test.ts` is required by D-20 — Phase 3 tests register a fake provider per D-22 and never invoke the stub `validate()`. Provider unit tests land in Phase 4/5 with the real implementations. (`src/providers/registry.test.ts` covers the registration round-trip without exercising the stubs.)

---

### `src/index.ts` (modified — barrel)

**Closest analog:** `src/index.ts` (current file — exact pattern to extend).

**Current 5 exports** (`src/index.ts:1-9`):

```ts
// express-webhook-validator
// Phase 2 surface: crypto primitives + discriminated error class.
// Phases 3-5 will add the middleware factory and per-provider modules.

export const VERSION = '0.0.1';

export { timingSafeCompare } from './crypto/compare.js';
export { computeHmac } from './crypto/hmac.js';
export { WebhookValidationError, type WebhookValidationReason } from './errors.js';
```

**Phase 3 extension pattern** (D-19; preserves Biome `organizeImports` alphabetical order by source path):

```ts
// express-webhook-validator
// Phase 3 surface: crypto primitives, discriminated error class,
// middleware factory, raw-body capture, per-provider types.

export const VERSION = '0.0.1';

export { timingSafeCompare } from './crypto/compare.js';
export { computeHmac } from './crypto/hmac.js';
export { webhookErrorHandler } from './error-handler.js';
export { WebhookValidationError, type WebhookValidationReason } from './errors.js';
export { createWebhookMiddleware } from './middleware.js';
export { rawBodyCapture, type RawBodyOptions } from './raw-body/middleware.js';
export { captureRawBody } from './raw-body/verify.js';
export type { GitHubWebhook } from './providers/github.js';
export type { ShopifyWebhook } from './providers/shopify.js';
export type { StripeWebhook } from './providers/stripe.js';
export type { WebhookMetadata } from './types.js';

// D-03 / D-19: side-effect imports register all three providers transparently.
// Order is the alphabetical order of the source path (Biome organizeImports rule).
import './providers/github.js';
import './providers/shopify.js';
import './providers/stripe.js';
```

**Style preservation notes:**
- Inline `type` modifier on the same line as the value re-export when both are needed (Phase 2 03-03 pattern, see line 9 of current `src/index.ts`: `WebhookValidationError, type WebhookValidationReason`).
- Type-only re-exports use `export type { ... }` form when no value is involved (matches Phase 2 plan-level convention).
- Side-effect imports placed BELOW the named exports, with a comment explaining D-03.
- Alphabetical-by-source-path ordering (Biome `organizeImports: "on"` from Phase 1).
- Header comment must NOT match the speculative-export grep `Provider|createWebhookMiddleware|RawBodyOptions` — Phase 2 plan-defect lesson; Phase 3 can now USE these literal tokens because they're real exports.

---

### `src/index.test.ts` (modified — reachability smoke tests)

**Closest analog:** `src/index.test.ts` (current file — exact pattern to extend).

**Current 5 smoke tests** (`src/index.test.ts:10-42`) — extend with one test per new export:

```ts
// New smokes to add (per Phase 2 03-03 reachability pattern):

it('re-exports createWebhookMiddleware (callable from the public barrel)', () => {
  // D-22: register a fake first, then expect the factory NOT to throw.
  // Or: assert the factory is a function and throws on unknown provider.
  expect(typeof createWebhookMiddleware).toBe('function');
});

it('re-exports webhookErrorHandler (callable from the public barrel)', () => {
  const handler = webhookErrorHandler();
  expect(typeof handler).toBe('function');
  expect(handler.length).toBe(4); // Express 4-arg detection (RESEARCH.md Pattern 5)
});

it('re-exports rawBodyCapture (callable from the public barrel)', () => {
  const mw = rawBodyCapture();
  expect(typeof mw).toBe('function');
  expect(mw.length).toBe(3); // (req, res, next)
});

it('re-exports captureRawBody (callable from the public barrel)', () => {
  expect(typeof captureRawBody).toBe('function');
  expect(captureRawBody.length).toBe(4); // (req, res, buf, encoding)
});

it('re-exports the WebhookMetadata type and per-provider types (compile-time check)', () => {
  // Type-only smoke: similar to existing line 38-41 pattern for WebhookValidationReason.
  const meta: WebhookMetadata = {
    provider: 'stripe',
    eventId: 'evt_x',
    timestamp: 0,
    parsed: {},
    replayWindowMs: 0,
  };
  expect(meta.provider).toBe('stripe');
});
```

**Style mirror** — every new test follows the existing `it('re-exports X (callable/constructable from the public barrel)', () => { ... })` pattern from lines 16, 21, 27, 38 of the current file.

---

### `src/errors.ts` (modified — widen reason union)

**Closest analog:** `src/errors.ts` itself (current file).

**Change pattern** (D-17 — minimal-diff widening):

```ts
// BEFORE (lines 5-9):
export type WebhookValidationReason =
  | 'signature_mismatch'
  | 'timestamp_too_old'
  | 'missing_header'
  | 'missing_secret';

// AFTER:
export type WebhookValidationReason =
  | 'signature_mismatch'
  | 'timestamp_too_old'
  | 'missing_header'
  | 'missing_secret'
  | 'malformed_payload';  // NEW in Phase 3 (D-17)
```

**`messageFor` impact:** The current implementation (`src/errors.ts:19-24`) is:

```ts
function messageFor(reason: WebhookValidationReason, provider: string): string {
  const humanReason = reason.replace(/_/g, ' ');
  return `${provider} webhook ${humanReason}`;
}
```

This is **already structurally correct** for the new reason — `'malformed_payload'.replace(/_/g, ' ')` yields `'malformed payload'`, producing `'<provider> webhook malformed payload'`. No code change to the function body is needed, but a comment update or test confirms coverage.

**Comment update at line 1-9** (rename "Phase 2" to acknowledge Phase 3 widening):

```ts
// Discriminated reason union for webhook signature validation failures.
// Phase 2 shipped 4 reasons; Phase 3 adds 'malformed_payload' (D-17).
// Each phase widens this union in the SAME commit that ships the test
// exercising the new reason. Phase 2 D-07 — DO NOT pre-add reasons.
```

---

### `src/errors.test.ts` (modified — add `'malformed_payload'` case)

**Closest analog:** `src/errors.test.ts` itself (current file — `it.each` block at lines 53-65).

**Change pattern** (D-17, D-22 — extend existing `it.each` table):

```ts
// BEFORE (lines 53-65):
it.each<WebhookValidationReason>([
  'signature_mismatch',
  'timestamp_too_old',
  'missing_header',
  'missing_secret',
])('round-trips reason %s via instance.reason', (reason) => {
  const err = new WebhookValidationError({
    reason,
    provider: 'stripe',
    statusCode: 401,
  });
  expect(err.reason).toBe(reason);
});

// AFTER (extend the array):
it.each<WebhookValidationReason>([
  'signature_mismatch',
  'timestamp_too_old',
  'missing_header',
  'missing_secret',
  'malformed_payload',  // NEW in Phase 3
])('round-trips reason %s via instance.reason', (reason) => {
  const err = new WebhookValidationError({
    reason,
    provider: 'stripe',
    statusCode: reason === 'malformed_payload' ? 400 : 401,  // D-07: 400 for malformed
  });
  expect(err.reason).toBe(reason);
});
```

**Optional companion test** for the `messageFor` derivation:

```ts
it('auto-derives a human-readable message for malformed_payload', () => {
  const err = new WebhookValidationError({
    reason: 'malformed_payload',
    provider: 'stripe',
    statusCode: 400,
  });
  expect(err.message).toBe('stripe webhook malformed payload');
});
```

---

### `package.json` (modified — devDeps + typecheck script)

**Closest analog:** `package.json` (current file).

**Change pattern** (RESEARCH.md Wave 0 gaps + Pitfall 1):

```jsonc
// devDependencies — add two entries (alphabetized):
"devDependencies": {
  "@biomejs/biome": "^2.4.14",
  "@types/express": "^4.17.21",
  "@types/node": "^20.0.0",
  "@types/supertest": "<latest>",   // NEW
  "supertest": "<latest>",           // NEW
  "tsup": "^8.5.1",
  "typescript": "^6.0.3",
  "vitest": "^4.1.5"
}

// scripts — add typecheck:
"scripts": {
  "build": "tsup",
  "test": "vitest run",
  "typecheck": "tsc --noEmit -p tsconfig.test.json",  // NEW (D-20 / Pitfall 1)
  "lint": "biome check .",
  "format": "biome format --write ."
}
```

**Version-pin convention** — match existing `^X.Y.Z` style. Run `npm view supertest version && npm view @types/supertest version` per RESEARCH.md before pinning.

---

### `tsconfig.test.json` (NEW — TypeScript test config)

**No close in-repo analog.** First TypeScript multi-config in the repo.

**Pattern** (RESEARCH.md Pitfall 1):

```jsonc
// tsconfig.test.json
{
  "extends": "./tsconfig.json",
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**Why this exists:** The main `tsconfig.json` (lines 17-19) has `"exclude": ["node_modules", "dist", "**/*.test.ts"]`. The `**/*.test.ts` exclusion silently removes test files from `tsc --noEmit` runs, breaking the compile-time `@ts-expect-error` directives in `src/types.test.ts`. The test config DROPS the test-file exclusion so `npm run typecheck` actually checks the type-only test file.

---

## Shared Patterns

### Co-located Tests (Phase 1 D-04 / Phase 2 D-12)

**Source:** Phase 1 `01-CONTEXT.md` D-04; Phase 2 `02-CONTEXT.md` D-12.
**Apply to:** Every new `.ts` source file in Phase 3 (except provider stubs `stripe.ts`/`github.ts`/`shopify.ts` which defer their unit tests to Phases 4/5).

Pattern (from existing repo state):
```
src/foo.ts
src/foo.test.ts          ← always next to source
```

Verified across:
- `src/crypto/hmac.ts` + `src/crypto/hmac.test.ts`
- `src/crypto/compare.ts` + `src/crypto/compare.test.ts`
- `src/errors.ts` + `src/errors.test.ts`
- `src/index.ts` + `src/index.test.ts`

---

### Vitest Imports (deterministic ordering)

**Source:** `src/errors.test.ts:1`, `src/crypto/hmac.test.ts:1`, `src/crypto/compare.test.ts:1`, `src/index.test.ts:1`.
**Apply to:** Every new `.test.ts` file in Phase 3.

```ts
import { describe, expect, it } from 'vitest';
```

When additional helpers are needed (alphabetical order, single import line):
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describe, expectTypeOf, it } from 'vitest';   // for types.test.ts
```

---

### `.js` Extension on Relative Imports

**Source:** `src/index.ts:7-9`, `src/errors.test.ts:2`.
**Apply to:** Every relative import in every new `.ts` file.

Pattern:
```ts
import { computeHmac } from './crypto/hmac.js';     // ✓ correct
import { computeHmac } from './crypto/hmac';        // ✗ wrong (ESM bundler resolution requires extension)
```

This is enforced by `tsconfig.json:7` `"moduleResolution": "bundler"` plus the Phase 1 ESM-output convention.

---

### `node:` Prefix on Built-In Imports

**Source:** `src/crypto/hmac.ts:1` (`'node:crypto'`), `src/crypto/compare.ts:1` (`'node:crypto'`).
**Apply to:** Every Node built-in import in Phase 3 (e.g., `node:http`, `node:buffer`).

Pattern:
```ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHmac } from 'node:crypto';
```

---

### Single-Quote Strings + Trailing Semicolons (Biome `recommended`)

**Source:** Every existing `.ts` file in `src/`.
**Apply to:** Every new file. Biome `recommended` rules from Phase 1 D-01 enforce this.

---

### Named Re-Exports Only in `src/index.ts` (Phase 2 03-03 Pattern)

**Source:** `src/index.ts:7-9` — every export is named, NO `export *`.
**Apply to:** All Phase 3 additions to `src/index.ts`.

Adding a new internal symbol must NEVER silently leak it via barrel re-export — every public export is explicit.

---

### Inline `type` Modifier for Mixed Value+Type Re-Exports

**Source:** `src/index.ts:9` — `export { WebhookValidationError, type WebhookValidationReason } from './errors.js';`.
**Apply to:** Phase 3 re-exports where the same source module exports both a runtime value and a type (e.g., `export { rawBodyCapture, type RawBodyOptions } from './raw-body/middleware.js';`).

Pure type-only re-exports use `export type { ... }`:
```ts
export type { WebhookMetadata } from './types.js';
export type { GitHubWebhook } from './providers/github.js';
```

---

### `WebhookValidationError` Construction (Phase 2 D-05 — Locked Constructor)

**Source:** `src/errors.ts:47-57`.
**Apply to:** `src/middleware.ts` (the `'malformed_payload'` path) and any Phase 4/5 site that throws this error.

Pattern (LOCKED — DO NOT add `cause`/`details`/`message` parameters):
```ts
new WebhookValidationError({
  reason: '<one-of-the-union>',
  provider: '<provider-name>',
  statusCode: <number>,
})
```

---

### Reason Union Widening Pattern (Phase 2 D-07)

**Source:** Phase 2 `02-CONTEXT.md` D-07 — "the reason value AND the test exercising it land in the SAME commit."
**Apply to:** Phase 3's `'malformed_payload'` addition. Concrete files affected in a single commit:
- `src/errors.ts` — widen union (one-line addition).
- `src/errors.test.ts` — extend `it.each` table (one-line addition + maybe one new `it` for `messageFor`).
- `src/middleware.ts` — exercises the new reason via `next(new WebhookValidationError({ reason: 'malformed_payload', ... }))`.
- `src/middleware.test.ts` — supertest-based test that mounts the middleware WITHOUT prior `rawBodyCapture()` and asserts the resulting error.

---

### typecheck Infrastructure (NEW Cross-Cutting Pattern)

**Source:** RESEARCH.md Pitfall 1; new in Phase 3.
**Apply to:** All compile-time tests, especially `src/types.test.ts`.

Required artifacts:
- `tsconfig.test.json` — extends `tsconfig.json`, drops `**/*.test.ts` exclude.
- `package.json#scripts.typecheck` — `tsc --noEmit -p tsconfig.test.json`.
- CI workflow integration: add `npm run typecheck` to the existing matrix (Phase 1 D-08 currently runs `lint && build && test`; Phase 3 adds `typecheck`).

Without this infrastructure, `// @ts-expect-error` directives in `src/types.test.ts` are silently skipped and the discriminated-union compile-time guarantee (SC3) is unverified.

---

### Library-Never-Logs Audit Pattern (D-16)

**Source:** D-16; new structural guarantee in Phase 3.
**Apply to:** Every new test that exercises a Phase 3 code path which could plausibly log.

Pattern:
```ts
import { vi } from 'vitest';

it('does not call any console method during <path>', () => {
  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  /* exercise the path */
  expect(errSpy).not.toHaveBeenCalled();
  expect(logSpy).not.toHaveBeenCalled();
  expect(warnSpy).not.toHaveBeenCalled();
});
```

Required in (at minimum): `src/middleware.test.ts`, `src/error-handler.test.ts`. Extends Phase 2's structural no-leakage stance from `WebhookValidationError` (D-11) to the entire Phase 3 surface.

---

### Sample-Leak Guard for `WebhookValidationError` Sites (Phase 2 D-11)

**Source:** `src/errors.test.ts:7-10, 67-79`.
**Apply to:** Any Phase 3 test that constructs a `WebhookValidationError` and serializes it.

Pattern:
```ts
const SAMPLE_SIGNATURE = 't=1700000000,v1=deadbeefcafe1234567890abcdef';
const SAMPLE_SECRET = 'whsec_super_secret_value_do_not_leak';
const SAMPLE_BODY = '{"id":"evt_test","type":"charge.succeeded"}';

it('does not leak sample signature/secret/body via JSON.stringify or String()', () => {
  /* ... construct an error ... */
  const json = JSON.stringify(err);
  const str = String(err);
  for (const leak of [SAMPLE_SIGNATURE, SAMPLE_SECRET, SAMPLE_BODY]) {
    expect(json).not.toContain(leak);
    expect(str).not.toContain(leak);
  }
});
```

Recommended location for Phase 3: extend the existing `src/errors.test.ts` leakage assertion with a `'malformed_payload'`-reasoned error to confirm the new reason value doesn't introduce any leak vector.

---

### Pitfall 2: Registry-Isolated Tests

**Source:** RESEARCH.md Pitfall 2.
**Apply to:** `src/providers/registry.test.ts` (and any future test that asserts registry state).

Rule: Import the registry module DIRECTLY (`'./registry.js'`), NOT via the public barrel (`'../index.js'`). Importing the barrel triggers the side-effect imports in `src/index.ts:130-132` which pre-populate the registry with `stripe`/`github`/`shopify`.

---

### Pitfall 3: Single Capture Surface Per Route

**Source:** RESEARCH.md Pitfall 3.
**Apply to:** `src/raw-body/middleware.ts` (skip-if-already-set guard) and JSDoc on both raw-body exports.

Implementation guard (in `rawBodyCapture()`):
```ts
if (req.rawBody) return next();
```

Documentation guard: JSDoc on both `rawBodyCapture` and `captureRawBody` must say "use ONE of the two surfaces per route, NOT both."

---

### Pitfall 4: 413 ≠ `WebhookValidationError`

**Source:** RESEARCH.md Pitfall 4.
**Apply to:** `src/raw-body/middleware.ts` (do NOT translate 413 to `WebhookValidationError`); `src/error-handler.ts` (passes non-`WebhookValidationError` through unchanged — already lock by D-14); `src/raw-body/middleware.test.ts` and `src/error-handler.test.ts` (assert this behavior).

Rule: Phase 3 NEVER widens `WebhookValidationReason` with `'payload_too_large'`. The 413 is a body-parser concern; it propagates through `next(err)` to either Express's default error handler or the consumer's pipeline.

---

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns + Phase-3 decisions as the binding spec):

| File | Role | Data Flow | Reason | Authoritative Source |
|------|------|-----------|--------|----------------------|
| `src/providers/registry.ts` | utility (state singleton) | CRUD (in-memory map) | First stateful module in the repo. Phase 2 had only pure functions and one error class — no precedent for a module-scope `Map` singleton. | RESEARCH.md Pattern 6 (lines 647-665); CONTEXT.md D-01. |
| `src/providers/stripe.ts` | provider stub + branch type | event-driven (registers on import) | First per-provider module + first side-effect-import file in the repo. | RESEARCH.md Pattern 6 (lines 668-690); CONTEXT.md D-03, D-09, D-10. |
| `src/providers/github.ts` | provider stub + branch type | event-driven | Same — copies pattern of stripe.ts with GitHub-specific fields. | RESEARCH.md Pattern 6; CONTEXT.md D-09 (`deliveryId`). |
| `src/providers/shopify.ts` | provider stub + branch type | event-driven | Same — copies pattern of stripe.ts with Shopify-specific fields. | RESEARCH.md Pattern 6; CONTEXT.md D-09 (`topic`, `webhookId`). |
| `tsconfig.test.json` (NEW) | TypeScript config | type-only | First multi-config TypeScript setup; main `tsconfig.json` is the extension target. | RESEARCH.md Pitfall 1. |

These five files all have authoritative pattern sources elsewhere — RESEARCH.md provides verbatim-usable patterns for `registry.ts`, the three provider stubs, and `tsconfig.test.json`. Planner should cite RESEARCH.md line numbers in the corresponding plan actions.

---

## Metadata

**Analog search scope:**
- `src/` (4 directories, 8 source files: 4 source + 4 test).
- `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts` (build/test infra).
- `.planning/phases/01-foundation-tooling/` (Phase 1 decisions).
- `.planning/phases/02-crypto-core-error-class/` (Phase 2 decisions + 02-PATTERNS.md as a precedent for this document's shape).

**Files scanned:** 14 source/test/config files + 4 phase planning files.

**Strong matches found:** 18/22 (the 4 misses are all in `src/providers/` plus `tsconfig.test.json` — all have authoritative spec in RESEARCH.md).

**Pattern extraction date:** 2026-05-06.
