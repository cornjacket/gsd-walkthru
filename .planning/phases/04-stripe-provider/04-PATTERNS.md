# Phase 4: Stripe Provider - Pattern Map

**Mapped:** 2026-05-07  
**Files analyzed:** 5  
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/providers/stripe.ts` | provider-service | request-response | `src/crypto/hmac.ts` (Phase 2) | exact role-match |
| `src/providers/stripe.test.ts` | test | request-response | `src/crypto/hmac.test.ts` + `src/middleware.test.ts` (Phase 2/3) | exact role-match |
| `src/errors.ts` | error-class (extend) | request-response | `src/errors.ts` (Phase 2) | exact |
| `src/errors.test.ts` | test (extend) | request-response | `src/errors.test.ts` (Phase 2) | exact |
| `src/index.test.ts` | test (extend) | request-response | `src/index.test.ts` (Phase 3) | exact |

## Pattern Assignments

### `src/providers/stripe.ts` (provider-service, request-response)

**Analog:** Combination of `src/crypto/hmac.ts` (Phase 2), `src/crypto/compare.ts` (Phase 2), existing stub at `src/providers/stripe.ts` (Phase 3), and `src/middleware.ts` (Phase 3)

**File structure & imports pattern** (lines 1-13):
```typescript
// Stripe provider stub (Phase 3, fills in Phase 4).
//
// D-09: StripeWebhook branch type co-located here per D-10.
// D-03: side-effect registration at top level — when `src/index.ts`
// (Plan 07) imports this module, the registerProvider call runs and
// 'stripe' becomes a known provider name.
//
// Phase 4 will populate validate() with real signature-checking
// logic; Phase 3 ships a throwing stub so the registry has the entry
// but Phase 3 tests register a fake (D-22) instead of invoking this stub.
import { registerProvider } from './registry.js';
import type { Provider } from './types.js';

export type StripeWebhook = {
  provider: 'stripe';
  eventId: string;
  timestamp: number;
  // WR-05: typed as `unknown` (not `Record<string, unknown>`) because the
  // library does not own the JSON parse and cannot guarantee the top-level
  // shape (object vs. array vs. primitive). Consumers must narrow before
  // accessing keys.
  parsed: unknown;
  replayWindowMs: number;
};
```

**Error handling pattern** (from `src/errors.ts` lines 43-78, reused):
```typescript
import { WebhookValidationError } from '../errors.js';

// Throw WebhookValidationError on validation failure
throw new WebhookValidationError({
  reason: 'signature_mismatch', // or other reasons
  provider: 'stripe',
  statusCode: 401, // or 400 for malformed_payload
});
```

**HMAC computation and constant-time comparison pattern** (from `src/crypto/hmac.ts` lines 1-18 and `src/crypto/compare.ts` lines 15-20):
```typescript
import { computeHmac } from '../crypto/hmac.js';
import { timingSafeCompare } from '../crypto/compare.js';

// Compute digest
const signedPayload = `${timestamp}.${req.rawBody.toString('utf8')}`;
const computed = computeHmac(signedPayload, secret, 'sha256');

// Constant-time compare (must iterate ALL segments, no early break)
let signatureMatched = false;
for (const hexSegment of v1Segments) {
  const segmentBuf = Buffer.from(hexSegment, 'hex');
  if (timingSafeCompare(computed, segmentBuf)) {
    signatureMatched = true;
    // Continue loop instead of breaking — avoid timing leaks
  }
}
```

**Request validation pattern** (from `src/middleware.ts` lines 80-90):
```typescript
// Guard against missing rawBody (Phase 3 D-07)
if (!req.rawBody) {
  throw new WebhookValidationError({
    reason: 'malformed_payload',
    provider: 'stripe',
    statusCode: 400,
  });
}
```

**Provider interface implementation** (from `src/providers/types.ts` lines 12-14):
```typescript
export interface Provider {
  readonly name: string;
  validate(req: Request, secret: string): WebhookMetadata;
}
```

**Registration pattern** (from existing stub `src/providers/stripe.ts` line 34):
```typescript
const stripeProvider: Provider = {
  name: 'stripe',
  validate(_req, _secret) {
    // Phase 4 implementation goes here
  },
};

registerProvider('stripe', stripeProvider);
```

---

### `src/providers/stripe.test.ts` (test, request-response)

**Analog:** `src/crypto/hmac.test.ts` (Phase 2) + `src/middleware.test.ts` (Phase 3) for structure and patterns

**Imports & test setup pattern** (from `src/crypto/hmac.test.ts` lines 1-3 and `src/middleware.test.ts` lines 1-18):
```typescript
import { describe, expect, it } from 'vitest';
import { Request } from 'express';
import { WebhookValidationError } from '../errors.js';
import { stripeProvider } from './stripe.js'; // or import Provider, computeHmac, etc.

// Sample sensitive material for negative-case leakage tests
const SAMPLE_SIGNATURE = 't=1700000000,v1=deadbeefcafe1234567890abcdef';
const SAMPLE_SECRET = 'whsec_super_secret_value_do_not_leak';
const SAMPLE_BODY = '{"id":"evt_test","type":"charge.succeeded"}';

describe('stripeProvider.validate()', () => {
  // Test cases per D-12 (ROADMAP SC4-binding) and D-13 (negative cases)
});
```

**Individual test case pattern** (from `src/crypto/hmac.test.ts` lines 5-14 and `src/middleware.test.ts` lines 85-115):
```typescript
it('happy path: valid Stripe-Signature and matching raw body returns StripeWebhook', () => {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = '{"id":"evt_1234","type":"charge.succeeded"}';
  const secret = 'whsec_test_secret';
  
  // Construct req fixture with rawBody and signature header
  const req = {
    rawBody: Buffer.from(body),
    headers: {
      'stripe-signature': `t=${timestamp},v1=${computedHex}`,
    },
  } as unknown as Request;
  
  const result = stripeProvider.validate(req, secret);
  
  expect(result.provider).toBe('stripe');
  expect(result.eventId).toBe('evt_1234');
  expect(result.parsed).toEqual({ id: 'evt_1234', type: 'charge.succeeded' });
  expect(result.replayWindowMs).toBe(300000); // 300s * 1000
});
```

**Error case pattern** (from `src/middleware.test.ts` lines 55-74):
```typescript
it('missing Stripe-Signature header throws with reason missing_header', () => {
  const req = {
    rawBody: Buffer.from('{"id":"evt_x"}'),
    headers: {}, // No stripe-signature
  } as unknown as Request;
  
  expect(() => stripeProvider.validate(req, 'secret')).toThrow(
    WebhookValidationError
  );
  try {
    stripeProvider.validate(req, 'secret');
  } catch (err) {
    if (err instanceof WebhookValidationError) {
      expect(err.reason).toBe('missing_header');
      expect(err.statusCode).toBe(401);
    }
  }
});
```

**Leakage assertion pattern** (from `src/errors.test.ts` lines 77-89):
```typescript
it('does not leak sample signature/secret/body via JSON.stringify or String()', () => {
  const req = {
    rawBody: Buffer.from(SAMPLE_BODY),
    headers: { 'stripe-signature': SAMPLE_SIGNATURE },
  } as unknown as Request;
  
  try {
    stripeProvider.validate(req, SAMPLE_SECRET);
  } catch (err) {
    const json = JSON.stringify(err);
    const str = String(err);
    for (const leak of [SAMPLE_SIGNATURE, SAMPLE_SECRET, SAMPLE_BODY]) {
      expect(json).not.toContain(leak);
      expect(str).not.toContain(leak);
    }
  }
});
```

---

### `src/errors.ts` (error-class, extend existing)

**Analog:** `src/errors.ts` (Phase 2, lines 1-10)

**Existing reason union** (current lines 5-10):
```typescript
export type WebhookValidationReason =
  | 'signature_mismatch'
  | 'timestamp_too_old'
  | 'missing_header'
  | 'missing_secret'
  | 'malformed_payload';
```

**New reason to add per Phase 4 D-05**:
```typescript
export type WebhookValidationReason =
  | 'signature_mismatch'
  | 'timestamp_too_old'
  | 'missing_header'
  | 'missing_secret'
  | 'malformed_payload'
  | 'invalid_signature_format';  // NEW in Phase 4
```

**Message lookup function pattern** (existing lines 20-25, extends naturally):
```typescript
function messageFor(reason: WebhookValidationReason, provider: string): string {
  // Convention: `<provider> webhook <human-readable reason>`.
  // Deterministic, contains the provider name, no inputs beyond reason/provider.
  const humanReason = reason.replace(/_/g, ' ');
  return `${provider} webhook ${humanReason}`;
}
// For 'invalid_signature_format', this produces:
// "stripe webhook invalid signature format"
```

**Constructor and serialization are unchanged** (lines 43-78 stay exactly as-is).

---

### `src/errors.test.ts` (test, extend existing)

**Analog:** `src/errors.test.ts` (Phase 2, lines 53-75 for reason enumeration pattern)

**Pattern to extend the `it.each()` test** (current lines 53-66):
```typescript
it.each<WebhookValidationReason>([
  'signature_mismatch',
  'timestamp_too_old',
  'missing_header',
  'missing_secret',
  'malformed_payload',
  'invalid_signature_format',  // ADD THIS
])('round-trips reason %s via instance.reason', (reason) => {
  const err = new WebhookValidationError({
    reason,
    provider: 'stripe',
    statusCode: reason === 'malformed_payload' ? 400 : 401,
  });
  expect(err.reason).toBe(reason);
});
```

**New test case for invalid_signature_format** (following Phase 2 D-17 pattern, lines 68-75):
```typescript
it('auto-derives a human-readable message for invalid_signature_format (Phase 4 D-05)', () => {
  const err = new WebhookValidationError({
    reason: 'invalid_signature_format',
    provider: 'stripe',
    statusCode: 401,
  });
  expect(err.message).toBe('stripe webhook invalid signature format');
});
```

---

### `src/index.test.ts` (test, extend existing)

**Analog:** `src/index.test.ts` (Phase 3, lines 50-53 for type reachability pattern)

**Pattern to extend the existing reason type test** (current lines 50-53):
```typescript
it('re-exports the WebhookValidationReason type (compile-time check)', () => {
  const reason: WebhookValidationReason = 'signature_mismatch';
  expect(reason).toBe('signature_mismatch');
});
```

**New smoke test per Phase 4 D-14** (append after existing re-export tests):
```typescript
it("includes 'invalid_signature_format' in the re-exported WebhookValidationReason type (Phase 4 D-14)", () => {
  // Compile-time check: if the new reason is NOT in the union, TypeScript
  // will error on this assignment. Runtime check verifies the error class
  // handles it (via the it.each in errors.test.ts and stripe.test.ts).
  const reason: WebhookValidationReason = 'invalid_signature_format';
  expect(reason).toBe('invalid_signature_format');
});
```

---

## Shared Patterns

### Authentication / Validation Error Handling
**Source:** `src/errors.ts` (Phase 2 D-05, D-06, D-11)  
**Apply to:** `src/providers/stripe.ts` (all validation failure paths)

Pattern: Always throw `WebhookValidationError` with discriminated `reason` and locked `statusCode`. Never construct error messages in the provider — use the error class's built-in `messageFor()` deterministic lookup.

```typescript
throw new WebhookValidationError({
  reason: 'signature_mismatch' | 'timestamp_too_old' | 'missing_header' | 'invalid_signature_format' | 'malformed_payload',
  provider: 'stripe',
  statusCode: reason === 'malformed_payload' ? 400 : 401,
});
```

### Constant-Time Comparison
**Source:** `src/crypto/compare.ts` (Phase 2 D-09)  
**Apply to:** `src/providers/stripe.ts` (multi-segment signature comparison loop)

Pattern: Always use `timingSafeCompare(a, b)` for any secret/signature comparison. Never use `===` or `a.toString('hex') === b.toString('hex')`. When comparing multiple segments (secret rotation), iterate ALL segments with the timing-safe function; never break early.

```typescript
import { timingSafeCompare } from '../crypto/compare.js';

let matched = false;
for (const segment of segments) {
  if (timingSafeCompare(computed, segment)) {
    matched = true;
    // Continue loop; do NOT break — avoid timing leaks
  }
}
```

### HMAC Computation
**Source:** `src/crypto/hmac.ts` (Phase 2 D-01, D-02)  
**Apply to:** `src/providers/stripe.ts` (signature computation)

Pattern: Call `computeHmac(payload, secret, 'sha256')` with the exact payload format per provider spec. Stripe uses `${timestamp}.${rawBody.toString('utf8')}`. Return value is a raw Buffer (not hex string).

```typescript
import { computeHmac } from '../crypto/hmac.js';

const payload = `${timestamp}.${req.rawBody.toString('utf8')}`;
const digest = computeHmac(payload, secret, 'sha256');
// digest is Buffer; convert to hex only when needed (e.g., for comparison via Buffer.from(hexStr, 'hex'))
```

### Request Guard Pattern
**Source:** `src/middleware.ts` (Phase 3 D-07)  
**Apply to:** `src/providers/stripe.ts` (first check before any crypto operation)

Pattern: Always check `req.rawBody` exists before reading it. Missing `req.rawBody` means the raw-body capture middleware upstream didn't run — throw `'malformed_payload'` with HTTP 400.

```typescript
if (!req.rawBody) {
  throw new WebhookValidationError({
    reason: 'malformed_payload',
    provider: 'stripe',
    statusCode: 400,
  });
}
```

### No Logging in Provider
**Source:** `src/middleware.ts` (Phase 3 D-16 via comment lines 25-27)  
**Apply to:** `src/providers/stripe.ts` (all code paths)

Pattern: Zero `console.*` calls anywhere in the provider. The error class structure (D-11) guarantees no secrets leak through errors. Logging is the consumer's responsibility via the optional error handler or their own pipeline.

---

## No Analog Found

All Phase 4 files have close analogs in Phase 2/3. The primary implementation work (`src/providers/stripe.ts` `validate()` function) is a direct orchestration of Phase 2's `computeHmac()` and `timingSafeCompare()` primitives combined with Phase 3's middleware request handling pattern and Phase 2's error class.

---

## Metadata

**Analog search scope:** `src/crypto/`, `src/providers/`, `src/middleware.ts`, `src/errors.ts`, `src/index.test.ts`  
**Files scanned:** 25 (including test files and provider stubs)  
**Pattern extraction date:** 2026-05-07

---

## PATTERN MAPPING COMPLETE

**Phase:** 4 - Stripe Provider  
**Files classified:** 5  
**Analogs found:** 5 / 5

### Coverage
- Files with exact analog: 5 / 5
- Files with role-match analog: 5 / 5
- Files with no analog: 0

### Key Patterns Identified
- All providers use `WebhookValidationError` with discriminated reasons from locked enum (Phase 2 D-05/D-07 pattern)
- Constant-time comparison is mandatory for all signature validation via `timingSafeCompare()` (never early-break loops)
- HMAC computation is delegated to Phase 2's `computeHmac()` with algorithm locked to 'sha256'
- Provider `validate()` always guards `req.rawBody` presence first (Phase 3 D-07)
- Request-time errors delegate via `next(err)` in middleware; provider throws `WebhookValidationError`
- New reason `'invalid_signature_format'` added in same commit as test exercising it (Phase 2 D-07 pattern)
- Zero logging in provider code; error class prevents secret/signature/body leakage via structural design

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns in PLAN.md files.
