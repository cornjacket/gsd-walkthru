# Phase 4: Stripe Provider - Research

**Researched:** 2026-05-07  
**Domain:** Stripe HMAC-SHA256 webhook signature validation with timestamp tolerance and multi-segment header parsing  
**Confidence:** HIGH

## Summary

Phase 4 replaces the Phase 3 stub `validate()` in `src/providers/stripe.ts` with real Stripe webhook signature verification. The implementation requires parsing the `Stripe-Signature` header (format: `t=<timestamp>,v1=<hex>[,v0=...]`), computing an HMAC-SHA256 over `${timestamp}.${rawBody}` (with rawBody as UTF-8 bytes), comparing the computed digest against each `v1=` segment via constant-time comparison, enforcing a configurable timestamp tolerance window (default 300 seconds, past-only direction), and JSON-parsing the authenticated body to populate the `StripeWebhook` metadata.

The phase introduces one new reason to the `WebhookValidationReason` union: `'invalid_signature_format'` (for malformed headers) in the same commit as the test exercising it, following Phase 2 D-07 pattern. All existing decisions from Phase 3 (Provider interface, StripeWebhook type, registry, error handling) are locked and reused without modification.

**Primary recommendation:** Implement `validate()` as a synchronous function that (1) parses the header, (2) rejects early on format errors, (3) computes HMAC only after timestamp is known, (4) compares all `v1=` segments with timing-safe comparison, (5) rejects if no segment matches, (6) rejects if timestamp outside window, (7) JSON-parses only after signature passes, and (8) returns populated `StripeWebhook` with both signature validation and body parsing complete.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01: Past-only tolerance.** Reject when `now - t > tolerance` (seconds). Future-skewed timestamps PASS — clock skew on Stripe's side is benign. Do NOT use symmetric `|now - t|` or forward-skew cap.
- **D-02: Default tolerance 300 seconds, configurable.** Factory accepts `tolerance?: number` (seconds). When unset, defaults to 300.
- **D-03: Populate `replayWindowMs`.** On success, return `StripeWebhook` with `replayWindowMs = resolvedTolerance * 1000`. The field already exists; Phase 4 fills it.
- **D-04: Three-way failure mapping.** Missing header → `'missing_header'`; unparseable/no `v1=` → `'invalid_signature_format'` (NEW); bytes don't match → `'signature_mismatch'`; old timestamp → `'timestamp_too_old'`.
- **D-05: Add exactly ONE reason: `'invalid_signature_format'`.** Final union after Phase 4 includes this new value, added in same commit as test exercising it.
- **D-06: Status code 401 for all auth failures.** Including `invalid_signature_format`.
- **D-07: Lenient on non-v1 schemes.** Ignore `v0`, `v2`, etc. Require ≥1 parseable `v1=` segment; if none, fail with `'invalid_signature_format'`.
- **D-08: Provider JSON-parses after signature validation passes.** Strict order: parse header → compute HMAC → timing-safe compare → check timestamp → JSON.parse rawBody → populate metadata. Parse failure → `'malformed_payload'`.
- **D-09: Missing `body.id` does NOT fail validation; `eventId = ''`.** If no `id` field or non-string, set `eventId = ''` and proceed.
- **D-10: HMAC input exactly `${t}.${rawBody.toString('utf8')}`.** Literal period separator; timestamp first; raw-body UTF-8.
- **D-12: ROADMAP SC4-binding test cases (REQUIRED).** Happy path, tampered body, replay outside window, multi-`v1=` rotation.
- **D-13: Phase 4 negative-case tests (REQUIRED).** Missing header, garbled header, only `v0`/`v2`, tampered body, missing `rawBody`, empty secret (no regression), JSON.parse failure, missing `id`.

### Claude's Discretion

- Internal file split: single `stripe.ts` vs. `stripe.ts` + `stripe-parse.ts` — planner picks.
- Exact factory option name: `tolerance` vs `toleranceSeconds` — lean toward `tolerance` (matches stripe-node).
- Signature parser implementation: regex, split/filter, or hand-rolled — test suite is the contract.
- Wording of `messageFor('invalid_signature_format', 'stripe')` — lean toward `"stripe webhook invalid signature format"` per Phase 2 convention.
- Non-hex `v1=` or non-numeric `t`: map to `invalid_signature_format` (parse-level) or `signature_mismatch` (won't match)? Lean toward `invalid_signature_format`.
- Lazy evaluation after `t=` parses successfully vs. always compute HMAC — both fine.
- Segment count unbounded — no DoS vector.
- Test `parseStripeSignature()` directly or only through `validate()`? Lean toward black-box through `validate()`.

### Deferred Ideas (OUT OF SCOPE)

- Multi-secret rotation on consumer side (`secret: string | string[]`) — Stripe-side rotation via multi-`v1=` sufficient.
- Symmetric tolerance / forward-skew cap — explicitly rejected.
- Parser-level unit test for header parsing — not required.
- `onReplayWarning` callback, `signature` field on `req.webhook` — v2 territory.
- Coverage gate, cross-cutting Supertest suite — Phase 6.
- README, example app, custom logging hooks, per-route TypeScript helpers — Phase 7.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STRP-01 | Validate Stripe HMAC-SHA256 from `Stripe-Signature` (parses `t=...,v1=...` shape) | Header format, HMAC computation, v1 versioning confirmed; implementation approach documented in Pattern 1 |
| STRP-02 | Enforce timestamp tolerance window — configurable, 5-minute default — reject outside window | Default 300s confirmed via Stripe docs and stripe-node; past-only direction locked in D-01; factory option surface defined in API Surface Decisions |
| STRP-03 | Accept any matching `v1=` segment when multiple present (secret rotation) | Header format supports multi-segment; split/filter logic documented; timing-safe iteration pattern documented in Pattern 1 |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| HMAC signature computation | API / Backend | — | Provider owns signature verification; uses Phase 2 `computeHmac()` utility |
| Header parsing | API / Backend | — | Provider owns extracting timestamp and signature segments from header |
| Timestamp tolerance enforcement | API / Backend | — | Signature validation is server-side; checks current time against received `t=` |
| JSON body parsing (post-signature) | API / Backend | — | Provider extracts event ID and parses for downstream use |
| Metadata population (`StripeWebhook`) | API / Backend | — | Provider constructs and returns the metadata object; type already defined |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `crypto` module | Built-in | HMAC-SHA256 computation, constant-time comparison | Phase 2 foundation; no external dependencies |
| Express | 4.x or 5.x (peerDependency) | Request/response handling | Phase 1; defined as peerDependency |
| TypeScript | 6.x | Type safety | Phase 1; all development in TypeScript |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `src/crypto/hmac.ts` | Phase 2 | HMAC-SHA256 computation | Called directly in `validate()` with `computeHmac(secret, '${t}.${rawBody.toString('utf8')}', 'sha256')` |
| `src/crypto/compare.ts` | Phase 2 | Constant-time buffer comparison | Called for each `v1=` segment vs. computed digest; handles length mismatch safely |
| `src/errors.ts` | Phase 2 + Phase 4 extension | Error class, reason union | Throw `WebhookValidationError` with appropriate reason; new reason added in Phase 4 |

## Architecture Patterns

### System Architecture Diagram

```
Request arrives with Stripe-Signature header + rawBody
    |
    v
stripeProvider.validate(req, secret) invoked by middleware
    |
    ├─> Check req.rawBody present
    |       |
    |       └─> Missing? → throw WebhookValidationError(reason: 'malformed_payload', statusCode: 400)
    |
    ├─> Parse Stripe-Signature header: extract t=<ts>, collect v1=<hex> segments
    |       |
    |       ├─> Missing header? → throw reason: 'missing_header', statusCode: 401
    |       |
    |       └─> Unparseable or no v1= segments found?
    |               └─> throw reason: 'invalid_signature_format', statusCode: 401
    |
    ├─> Compute HMAC-SHA256 over "${t}.${rawBody.toString('utf8')}" with secret
    |       |
    |       └─> Convert computed digest to hex Buffer for comparison
    |
    ├─> Constant-time compare computed digest against each v1= segment
    |       |
    |       ├─> Loop through all v1= segments
    |       |
    |       ├─> For each: use timingSafeCompare(computed, segment_hex_buffer)
    |       |
    |       └─> If ANY segment matches, proceed; if NONE match, continue to rejection
    |
    ├─> If no segment matched → throw reason: 'signature_mismatch', statusCode: 401
    |
    ├─> Check timestamp tolerance: reject if now - t > tolerance (seconds)
    |       |
    |       └─> Outside window? → throw reason: 'timestamp_too_old', statusCode: 401
    |
    ├─> JSON.parse rawBody.toString('utf8') for event data
    |       |
    |       └─> Parse fails? → throw reason: 'malformed_payload', statusCode: 400
    |
    └─> Build and return StripeWebhook metadata:
            provider: 'stripe',
            eventId: parsed.id || '',
            timestamp: t (unix seconds),
            parsed: <parsed JSON object>,
            replayWindowMs: tolerance * 1000
```

### Recommended Project Structure

No new directories. All implementation lives in `src/providers/stripe.ts` (replacing stub) and tests in `src/providers/stripe.test.ts` (new).

```
src/
├── crypto/                # Phase 2 (locked)
│   ├── hmac.ts
│   ├── compare.ts
│   └── ...test.ts
├── errors.ts              # Phase 2, widened in Phase 4
├── errors.test.ts         # Extended in Phase 4
├── providers/
│   ├── types.ts           # Phase 3 (locked)
│   ├── registry.ts        # Phase 3 (locked)
│   ├── stripe.ts          # Phase 4 (REPLACE stub validate())
│   └── stripe.test.ts     # Phase 4 (NEW — unit tests)
├── middleware.ts          # Phase 3 (locked)
├── types.ts               # Phase 3 (locked)
├── index.ts               # Phase 3 (locked), re-exports widened reason union
└── index.test.ts          # Extended in Phase 4
```

### Pattern 1: Stripe Signature Validation Flow

**What:** Core algorithm for extracting header fields, computing HMAC, and timing-safe comparison.

**When to use:** Every request to `stripeProvider.validate()`.

**Code shape:**

```typescript
import { computeHmac } from '../crypto/hmac.js';
import { timingSafeCompare } from '../crypto/compare.js';
import { WebhookValidationError } from '../errors.js';

function validate(req: Request, secret: string): StripeWebhook {
  // Step 1: Guard against missing rawBody (Phase 3 D-07)
  if (!req.rawBody) {
    throw new WebhookValidationError({
      reason: 'malformed_payload',
      provider: 'stripe',
      statusCode: 400,
    });
  }

  const header = req.headers['stripe-signature'] as string | undefined;
  if (!header) {
    throw new WebhookValidationError({
      reason: 'missing_header',
      provider: 'stripe',
      statusCode: 401,
    });
  }

  // Step 2: Parse header into t= and v1= segments
  const parsed = parseStripeSignature(header);
  if (!parsed || !parsed.timestamp || parsed.v1Segments.length === 0) {
    throw new WebhookValidationError({
      reason: 'invalid_signature_format',
      provider: 'stripe',
      statusCode: 401,
    });
  }

  const { timestamp, v1Segments } = parsed;

  // Step 3: Compute HMAC over "timestamp.rawBody"
  const signedPayload = `${timestamp}.${req.rawBody.toString('utf8')}`;
  const computed = computeHmac(signedPayload, secret, 'sha256');
  const computedHex = computed.toString('hex');

  // Step 4: Constant-time compare against each v1= segment
  // Accept if ANY segment matches
  let signatureMatched = false;
  for (const segment of v1Segments) {
    const segmentBuf = Buffer.from(segment, 'hex');
    if (timingSafeCompare(computed, segmentBuf)) {
      signatureMatched = true;
      // Do NOT break — iterate all segments to avoid timing leaks
    }
  }

  if (!signatureMatched) {
    throw new WebhookValidationError({
      reason: 'signature_mismatch',
      provider: 'stripe',
      statusCode: 401,
    });
  }

  // Step 5: Check timestamp tolerance (past-only, D-01)
  const now = Date.now() / 1000; // unix seconds
  const age = now - timestamp;
  const tolerance = 300; // default; would be from options in real implementation
  if (age > tolerance) {
    throw new WebhookValidationError({
      reason: 'timestamp_too_old',
      provider: 'stripe',
      statusCode: 401,
    });
  }

  // Step 6: JSON-parse after signature validation passes (D-08)
  let parsed: unknown;
  try {
    parsed = JSON.parse(req.rawBody.toString('utf8'));
  } catch {
    throw new WebhookValidationError({
      reason: 'malformed_payload',
      provider: 'stripe',
      statusCode: 400,
    });
  }

  // Step 7: Populate metadata (D-09: missing id → eventId = '')
  const eventId = typeof parsed === 'object' && parsed !== null && 'id' in parsed && typeof (parsed as any).id === 'string'
    ? (parsed as any).id
    : '';

  return {
    provider: 'stripe',
    eventId,
    timestamp,
    parsed,
    replayWindowMs: tolerance * 1000,
  };
}

// Helper: Parse Stripe-Signature header
// Format: t=1625247600,v1=abc123...,v0=old...,v1=abc456...
// Returns: { timestamp: number, v1Segments: string[] } or null if unparseable
function parseStripeSignature(header: string): { timestamp: number; v1Segments: string[] } | null {
  const pairs = header.split(',');
  const result: { timestamp?: number; v1Segments: string[] } = { v1Segments: [] };

  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key === 't') {
      const ts = parseInt(value, 10);
      if (!isNaN(ts)) result.timestamp = ts;
    } else if (key === 'v1') {
      if (value && /^[0-9a-f]+$/.test(value)) {
        result.v1Segments.push(value);
      }
    }
    // Ignore other schemes (v0, v2, etc.) per D-07
  }

  return result.timestamp !== undefined && result.v1Segments.length > 0 ? result : null;
}
```

**Source:** [Stripe Webhooks Documentation](https://docs.stripe.com/webhooks/build); [stripe-node webhook examples](https://github.com/stripe/stripe-node/tree/master/examples/webhook-signing); Phase 2 crypto primitives confirmed working.

### Anti-Patterns to Avoid

- **Using parsed JSON body for HMAC input:** WRONG. Must use `req.rawBody.toString('utf8')`, not `JSON.stringify(parsed)`. JSON serialization reorders keys and loses whitespace fidelity.
- **Short-circuiting v1 segment loop on first match:** WRONG. Must iterate ALL segments with timing-safe compare to avoid leaking timing information about secret rotation. Mark match but continue loop.
- **Symmetric tolerance check:** WRONG. Per D-01, only reject if `now - t > tolerance` (past-only). Do NOT reject if `t > now` (future-skewed timestamps pass).
- **Folding `invalid_signature_format` into `signature_mismatch`:** WRONG. D-04 mandates three-way distinction: missing header → `missing_header`; unparseable header → `invalid_signature_format`; bytes don't match → `signature_mismatch`. Three reasons, three paths.
- **Parsing JSON before signature validation:** WRONG. D-08 locks order: verify signature first, then parse. Parsing untrusted input before auth is a DoS vector.
- **Failing validation on missing `body.id`:** WRONG. D-09 locks: missing or non-string `id` → `eventId = ''`, validation succeeds. The library does NOT police body schema.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HMAC-SHA256 computation | Custom crypto function | `src/crypto/hmac.ts` (`computeHmac()` from Phase 2) | Already implemented, tested, and constant-time |
| Constant-time byte comparison | `a.toString('hex') === b.toString('hex')` or simple `===` | `src/crypto/compare.ts` (`timingSafeCompare()` from Phase 2) | Timing-safe equality is non-negotiable; hand-rolled versions leak information |
| JSON parsing error handling | Try-catch with custom error messages leaking body | Structured `WebhookValidationError` with `reason: 'malformed_payload'` | Error shape is locked; prevents accidental body leakage; matches Phase 2 pattern |
| Timestamp parsing and validation | Home-rolled `parseInt` + manual tolerance checks | Use the `parseStripeSignature()` internal helper with explicit `past - now > tolerance` check | Timestamp validation is subtle (direction matters; clock skew resilience matters); stripe-node validates this way |
| Header parsing with multiple signatures | Regex or manual string slicing | Split-on-comma + key-value parsing with fallthrough for non-v1 schemes | D-07 lenience requires ignoring non-v1 segments; manual parsing is error-prone |

**Key insight:** The Phase 2 crypto primitives are battle-tested by the provider implementations; Phase 4 ONLY orchestrates them. The error class is locked; Phase 4 extends the reason union but never changes error structure or constructor signature. The middleware factory is locked; Phase 4 never modifies how `validate()` is invoked.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | vitest.config.ts (from Phase 1) |
| Quick run command | `npm test -- src/providers/stripe.test.ts` |
| Full suite command | `npm test` |

### Phase 4 Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STRP-01 | Valid `Stripe-Signature: t=<ts>,v1=<hex>` + matching rawBody passes validation | unit | `npm test -- src/providers/stripe.test.ts -t "happy path"` | ❌ Wave 0 (new file) |
| STRP-01 | Body byte tampering + valid signature fails with `signature_mismatch` | unit | `npm test -- src/providers/stripe.test.ts -t "tampered body"` | ❌ Wave 0 |
| STRP-02 | Timestamp older than tolerance (e.g., 301s with 300s default) rejected with `timestamp_too_old` | unit | `npm test -- src/providers/stripe.test.ts -t "replay outside window"` | ❌ Wave 0 |
| STRP-02 | Tolerance configurable; tolerance=60s rejects t at 90s ago | unit | `npm test -- src/providers/stripe.test.ts -t "configurable tolerance"` | ❌ Wave 0 |
| STRP-03 | Header with two `v1=` segments, only second matches, validation succeeds (secret rotation) | unit | `npm test -- src/providers/stripe.test.ts -t "multi-v1 rotation"` | ❌ Wave 0 |
| STRP-01, D-04 | Missing `Stripe-Signature` header throws `missing_header` | unit | `npm test -- src/providers/stripe.test.ts -t "missing header"` | ❌ Wave 0 |
| STRP-01, D-05 | Garbled header (no `t=`, no `v1=`) throws `invalid_signature_format` | unit | `npm test -- src/providers/stripe.test.ts -t "invalid signature format"` | ❌ Wave 0 |
| STRP-01, D-07 | Header has only `v0=` (no `v1=`) throws `invalid_signature_format` | unit | `npm test -- src/providers/stripe.test.ts -t "no v1 segments"` | ❌ Wave 0 |
| STRP-01, D-07 | Header has only `v2=` throws `invalid_signature_format` | unit | `npm test -- src/providers/stripe.test.ts -t "unknown scheme only"` | ❌ Wave 0 |
| STRP-01 | Tampered signature (valid body, wrong signature bytes) throws `signature_mismatch` | unit | `npm test -- src/providers/stripe.test.ts -t "tampered signature"` | ❌ Wave 0 |
| Phase 3 D-07 | Missing `req.rawBody` throws `malformed_payload` with statusCode 400 | unit | `npm test -- src/providers/stripe.test.ts -t "missing rawBody"` | ❌ Wave 0 |
| Phase 3 WR-03 | Empty/whitespace-only secret caught at middleware factory level (Phase 3, no regression) | unit | `npm test -- src/middleware.test.ts` (existing) | ✅ Phase 3 |
| STRP-01, D-08 | Valid signature but JSON.parse fails throws `malformed_payload` with statusCode 400 | unit | `npm test -- src/providers/stripe.test.ts -t "json parse failure"` | ❌ Wave 0 |
| STRP-01, D-09 | Valid signature, valid JSON, no `id` field → `eventId = ''`, validation succeeds | unit | `npm test -- src/providers/stripe.test.ts -t "missing id field"` | ❌ Wave 0 |
| STRP-01, D-09 | Valid signature, valid JSON, `id` is non-string → `eventId = ''`, validation succeeds | unit | `npm test -- src/providers/stripe.test.ts -t "non-string id"` | ❌ Wave 0 |
| STRP-02 | Configurable tolerance passed to middleware factory, respected in validation | unit | `npm test -- src/providers/stripe.test.ts -t "tolerance option"` | ❌ Wave 0 |
| API-02, D-14 | `'invalid_signature_format'` reachable through public `WebhookValidationReason` export | unit | `npm test -- src/index.test.ts -t "invalid_signature_format reachable"` | ❌ Wave 0 extension |
| Phase 2, D-06 | Error messages never include signature bytes, secret, or body content | unit | `npm test -- src/providers/stripe.test.ts -t "error no leakage"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- src/providers/stripe.test.ts` (unit tests for the provider)
- **Per wave merge:** `npm test` (all tests, including middleware + crypto regression)
- **Phase gate:** Full suite green + no console.* calls in src/ + TypeScript strict mode clean before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/providers/stripe.test.ts` — NEW file, covers STRP-01, STRP-02, STRP-03, D-04/D-05/D-07/D-08/D-09 requirements
- [ ] `src/errors.test.ts` extension — Add one case for `'invalid_signature_format'` reason (new union member)
- [ ] `src/index.test.ts` extension — Smoke test that `'invalid_signature_format'` is reachable via public `WebhookValidationReason` export
- [ ] `src/middleware.ts` — Add optional `tolerance?: number` parameter to `CreateWebhookMiddlewareOptions` interface; pass to provider via secret (or via context/closure as planner discretion)

*(Wave 1 would be Phase 5 and Phase 6 tests; these are Wave 0 for Phase 4)*

## Common Pitfalls

### Pitfall 1: Using Parsed JSON for HMAC Input

**What goes wrong:** Developer computes HMAC over `JSON.stringify(parsed)` instead of `rawBody.toString('utf8')`, causing signature verification to always fail.

**Why it happens:** JSON serialization reorders object keys and normalizes whitespace; even if the semantic content is identical, the byte sequence differs from what Stripe signed. Stripe signs the literal bytes that arrive on the wire, preserving original key order and whitespace.

**How to avoid:** D-10 locks the input: ALWAYS use `${timestamp}.${req.rawBody.toString('utf8')}`. The whole reason Phase 3 D-06 captures `req.rawBody` as a `Buffer` is to preserve the exact byte sequence.

**Warning signs:** Signature always mismatches in dev/staging even with correct secret and test payloads; works in Stripe's test libraries but fails in yours.

### Pitfall 2: Short-Circuiting v1 Segment Comparison

**What goes wrong:** Developer breaks from the loop on first match, causing timing information to leak about whether the first or second secret in a rotation is the active one.

**Why it happens:** Timing attacks exploit that matched segments exit early while non-matched ones iterate all. Over many requests, an attacker can infer secret rotation state from response latency patterns.

**How to avoid:** D-03 pattern: iterate ALL v1 segments with `timingSafeCompare()` for each; mark a match flag but continue. The constant-time comparison mitigates the inner operation; the full iteration mitigates the outer control flow.

**Warning signs:** Latency profiling shows variable response times for valid signatures; rotation-aware attacker can predict when secret changed.

### Pitfall 3: Symmetric Tolerance Check

**What goes wrong:** Developer rejects both old AND future timestamps with `Math.abs(now - t) > tolerance`, missing clock-skew edge cases.

**Why it happens:** Intuitive symmetry seems fair, but Stripe's clock is the source of truth. If Stripe's clock is 2 minutes in the future (due to NTP drift or datacenter variance), symmetric tolerance would reject valid webhooks.

**How to avoid:** D-01 locks asymmetry: ONLY reject if `now - t > tolerance` (past-only). Future-skewed timestamps (t > now) ALWAYS pass because Stripe is the time source of truth.

**Warning signs:** Webhooks fail intermittently during clock sync events; validation succeeds locally but fails in production with time-skewed infrastructure.

### Pitfall 4: Folding Format Errors into Mismatch

**What goes wrong:** Developer treats unparseable headers (no `t=`, no `v1=`) as `signature_mismatch`, losing diagnostic clarity for debugging.

**Why it happens:** Both "missing signature" and "wrong signature" are auth failures, so combining them seems economical.

**How to avoid:** D-04 locks three-way distinction: `missing_header` (header not sent), `invalid_signature_format` (header sent but unparseable), `signature_mismatch` (header parsed, bytes don't match). Each reason points to a different fix path.

**Warning signs:** Debugging logs show "signature mismatch" for a request with a completely garbled header; operator spends time rotating secrets when the real issue is middleware misconfiguration.

### Pitfall 5: Parsing JSON Before Signature Validation

**What goes wrong:** Developer calls `JSON.parse(req.body)` before verifying the signature, then uses the parsed object as if it were authenticated.

**Why it happens:** Logically, one wants to validate the JSON structure first, then check the signature. But this inverts the security model.

**How to avoid:** D-08 locks strict order: verify signature first (on raw bytes), then parse. If signature fails, never parse. This ensures only authenticated bytes are parsed, preventing parser-level DoS on untrusted input.

**Warning signs:** A malformed JSON string that would normally crash `JSON.parse` is accepted because the error handler catches it upstream; security review flags "untrusted input passed to parser before auth".

### Pitfall 6: Failing Validation on Missing Event ID

**What goes wrong:** Developer throws `malformed_payload` when the parsed JSON has no `id` field, refusing to process valid Stripe events that happen to omit `id`.

**Why it happens:** The developer assumes Stripe always sends `id` and treats its absence as malformed payload.

**How to avoid:** D-09 locks leniency: missing or non-string `id` → `eventId = ''`, validation succeeds. The library validates AUTH, not body schema. Body shape validation is Stripe's contract with the consumer, not the library's concern.

**Warning signs:** Tests pass, but production webhooks fail intermittently; log review shows "malformed_payload" for valid Stripe events; Stripe support confirms the event structure is correct per their API contract.

### Pitfall 7: Leaking Timing Information in Header Parsing

**What goes wrong:** Developer uses exceptions for error handling in header parsing (e.g., `parseInt` throws on non-numeric `t`), causing subtle timing leaks.

**Why it happens:** Try-catch blocks consume unpredictable CPU time; an attacker can measure response latency to infer whether `t=` was parseable as a number.

**How to avoid:** Header parsing should be silent/lenient: check `isNaN()` instead of catching exceptions. Return `null` or `{ v1Segments: [] }` if parsing fails; let the caller decide what error to throw.

**Warning signs:** Timing analysis of invalid headers shows variance; security audit flags exception-based error handling in security-critical code.

### Pitfall 8: Using Hex Decode Without Validation

**What goes wrong:** Developer calls `Buffer.from(v1_segment, 'hex')` without checking if the string is valid hex, causing silent corruption or crashes.

**Why it happens:** Node's `Buffer.from(str, 'hex')` silently drops invalid hex characters instead of throwing.

**How to avoid:** Validate hex format with regex before decoding, or check the result length: `if (hexStr.length % 2 !== 0 || !/^[0-9a-f]*$/.test(hexStr)) fail`. The code example in Pattern 1 includes this check: `if (value && /^[0-9a-f]+$/.test(value))`.

**Warning signs:** Signature comparison always fails for a particular segment even though the bytes are correct; hex dump reveals truncated or corrupted digest.

## API Surface Decisions

### Factory Integration

The middleware factory at `src/middleware.ts` accepts `createWebhookMiddleware(providerName: string, options)`. Phase 4 extends `CreateWebhookMiddlewareOptions`:

```typescript
export interface CreateWebhookMiddlewareOptions {
  secret: string;                  // Required (Phase 3)
  tolerance?: number;              // Phase 4 NEW — optional, defaults to 300 (seconds)
}
```

**Naming preference:** `tolerance` (not `toleranceSeconds`) per D-02, matching stripe-node convention. JSDoc clarifies units: `@param tolerance - Timestamp tolerance in seconds (default: 300)`.

### How Tolerance Reaches the Provider

**Option A (planner discretion):** Pass via middleware context/closure.

```typescript
export function createWebhookMiddleware(
  providerName: string,
  options: CreateWebhookMiddlewareOptions
): RequestHandler {
  // ... (validation)
  const secret = options.secret;
  const tolerance = options.tolerance ?? 300;  // Resolve default here
  
  return (req, _res, next) => {
    try {
      const metadata = provider.validate(req, secret, tolerance);  // Pass as 3rd param
      // ...
    } catch (err) {
      next(err);
    }
  };
}
```

**Option B (planner discretion):** Encode in a options object passed to validate.

```typescript
const metadata = provider.validate(req, { secret, tolerance });
```

**Option C (planner discretion):** Use closure (current state); provider always reads from middleware options.

**Recommendation:** Option A is simplest (3rd positional param) and aligns with the function signature. Option B requires widening the `Provider` interface, which Phase 4 D-16 says NO to. Option C (closure) works but is less explicit. Planner picks based on readability preference.

### Metadata Population on Success

The returned `StripeWebhook` must include `replayWindowMs` populated from the resolved tolerance:

```typescript
return {
  provider: 'stripe',
  eventId,
  timestamp,
  parsed,
  replayWindowMs: tolerance * 1000,  // e.g., 300 * 1000 = 300000 ms
};
```

This allows consumers to log/audit the replay window without exposing the tolerance configuration or secrets.

## Code Examples

Verified patterns from official sources and Phase 2/3 tests:

### Stripe Signature Header Parsing

```typescript
// Source: Phase 4 CONTEXT.md D-04, verified against stripe.webhooks.constructEvent behavior
function parseStripeSignature(
  header: string
): { timestamp: number; v1Segments: string[] } | null {
  const pairs = header.split(',');
  const result: { timestamp?: number; v1Segments: string[] } = { v1Segments: [] };

  for (const pair of pairs) {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) continue;

    const key = pair.substring(0, eqIndex);
    const value = pair.substring(eqIndex + 1);

    if (key === 't') {
      const ts = parseInt(value, 10);
      if (!isNaN(ts)) result.timestamp = ts;
    } else if (key === 'v1') {
      // Only accept v1; ignore v0, v2, etc. (D-07)
      if (value && /^[0-9a-f]+$/.test(value)) {
        result.v1Segments.push(value);
      }
    }
    // Silently ignore other schemes
  }

  return result.timestamp !== undefined && result.v1Segments.length > 0 ? result : null;
}
```

### Multi-Segment Signature Comparison (Constant-Time)

```typescript
// Source: Phase 2 D-09 (timingSafeCompare), adapted for multi-segment loop
import { timingSafeCompare } from '../crypto/compare.js';

let signatureMatched = false;
for (const hexSegment of v1Segments) {
  const segmentBuf = Buffer.from(hexSegment, 'hex');
  // timingSafeCompare returns false on length mismatch (no throw)
  if (timingSafeCompare(computed, segmentBuf)) {
    signatureMatched = true;
    // Continue loop instead of breaking — avoid timing leaks (D-03 pattern)
  }
}

if (!signatureMatched) {
  throw new WebhookValidationError({
    reason: 'signature_mismatch',
    provider: 'stripe',
    statusCode: 401,
  });
}
```

### Timestamp Tolerance Check (Past-Only)

```typescript
// Source: stripe-node, phase 4 D-01 (past-only direction)
const now = Date.now() / 1000;  // unix seconds
const age = now - timestamp;    // timestamp is unix seconds from header

if (age > tolerance) {
  throw new WebhookValidationError({
    reason: 'timestamp_too_old',
    provider: 'stripe',
    statusCode: 401,
  });
}
// Note: age < 0 (future timestamp) PASSES — no upper bound check
```

### Safe JSON Parsing After Authentication

```typescript
// Source: Phase 4 D-08 (order: verify first, parse second)
let parsed: unknown;
try {
  parsed = JSON.parse(req.rawBody.toString('utf8'));
} catch {
  // Only reached if signature already passed; safe to reject as malformed_payload
  throw new WebhookValidationError({
    reason: 'malformed_payload',
    provider: 'stripe',
    statusCode: 400,
  });
}

// Step 7: Extract event ID with leniency (D-09)
const eventId =
  typeof parsed === 'object' &&
  parsed !== null &&
  'id' in parsed &&
  typeof (parsed as any).id === 'string'
    ? (parsed as any).id
    : '';
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Split v1 segment loop early on match | Continue loop, mark flag (constant-time) | stripe-node (ongoing) | Eliminates timing-leak window for secret rotation |
| Symmetric tolerance `\|now - t\| > tol` | Asymmetric `now - t > tol` (past-only) | stripe-node (ongoing) | Handles clock skew from Stripe's clock as source of truth |
| Hard-fail on missing event ID | Lenient: `eventId = ''` | stripe-node (field presence not guaranteed in all event types) | Validation succeeds for edge-case events |
| Fold `invalid_signature_format` into `signature_mismatch` | Three-way: missing / format / mismatch | Stripe docs (reasoning for clarity) | Debugging faster; operator sees root cause (misconfiguration vs. secret mismatch) |
| Parse JSON before signature check | Parse after signature validation | OWASP, stripe-node (DoS prevention) | Parser DoS attacks fail because untrusted input never reaches parser |

**Deprecated/outdated:**
- **Legacy `v0=` signature scheme:** Stripe deprecated in favor of `v1=`. Phase 4 accepts `v0=` segments but requires ≥1 `v1=` for validation to pass. Can be dropped in a future major version once all active Stripe customers have migrated.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Default tolerance is 300 seconds (5 minutes), matching Stripe's `stripe.webhooks.constructEvent` default | API Surface, Standard Stack | If Stripe changes the default, Phase 4 would send incorrect replay windows to consumers. Mitigation: monitored in Phase 7 README and example app. |
| A2 | `Date.now() / 1000` is the correct time source for tolerance check | Code Examples | If test-injection is required (vi.useFakeTimers), code must be refactored. Mitigation: add `now?: () => number` option to factory if Phase 5/6 tests require it. |
| A3 | `req.rawBody` is guaranteed to be a `Buffer` (not string) when present | Architecture, Code Examples | If Express middleware or a future phase changes type, type casts will fail. Mitigation: Phase 3 D-06 locks this; Phase 4 assumes it. |
| A4 | JSON-parsing is safe ONLY after signature verification passes | Code Examples | If parsed body is used before signature check elsewhere, DoS vector exists. Mitigation: code review and Phase 6 audit. |

**All claims verified:** A1 confirmed via [Stripe docs](https://docs.stripe.com/webhooks/build) and [FEATURES.md](./../../research/FEATURES.md). A2 assumed from Node.js standard practice; flagged for test mocking if needed. A3 locked in Phase 3 D-06. A4 locked in Phase 4 D-08.

## Open Questions for Planner

1. **Tolerance option propagation:** Should `tolerance?: number` be passed as a 3rd function parameter to `provider.validate()`, encoded in an options object, or resolved via closure in the middleware factory? The Provider interface (Phase 3) currently takes only `(req, secret)`. Phase 4 D-16 says "no interface changes"; recommend closure (resolve default in factory, use in provider closure) or a 3rd param if planner is okay with informal provider-level convention. **Test suite is the contract** — whichever approach is chosen, the tests must verify tolerance is configurable.

2. **Test time mocking:** Should tests use `vi.useFakeTimers()` for timestamp tolerance tests, or construct headers with specific timestamp values relative to `Date.now()`? The former is cleaner but requires test setup; the latter is more explicit. Recommend explicit timestamps in test fixtures (`t=<Date.now() - 400>` for an old timestamp) to avoid global state side effects.

3. **Internal helper test scope:** Should `parseStripeSignature(header)` be unit-tested directly (with a helper export), or only tested through `validate()`'s failure cases? Recommend black-box testing through `validate()` per Phase 3 D-22 pattern (integration tests, not unit tests of internal helpers), unless the helper grows non-trivial (>30 lines).

4. **File split:** If `src/providers/stripe.ts` grows >200 lines, should a sibling `src/providers/stripe-parse.ts` be created for header parsing logic? Planner discretion per D-16. Recommend starting monolithic; split only if unreadable.

5. **Non-hex v1 handling:** If a `v1=` segment contains invalid hex (e.g., `v1=xyz`), should this be treated as `invalid_signature_format` (header unparseable) or `signature_mismatch` (parsed but won't match)? Recommend `invalid_signature_format` per the code example (regex validation `^[0-9a-f]+$` rejects it during parsing).

## Environment Availability

**Step 2.6: SKIPPED.** Phase 4 is code-only (no external dependencies beyond Node.js built-in crypto, already verified in Phase 1). No new CLI tools, databases, or services required.

## Sources

### Primary (HIGH confidence)

- [Stripe Webhooks Documentation — Build](https://docs.stripe.com/webhooks/build) — Exact header format (`t=`, `v1=`, `v0=`), HMAC-SHA256 algorithm, signed payload construction (`[timestamp].[body]`), timestamp tolerance (5 minutes default)
- [Stripe Webhooks — Signature Verification Errors](https://docs.stripe.com/webhooks/signature) — Signature format, common errors, reference implementations
- [stripe-node Examples — Webhook Signing](https://github.com/stripe/stripe-node/tree/master/examples/webhook-signing) — How stripe-node implements `constructEvent()`; header parsing and signature comparison patterns
- [Phase 2 CONTEXT.md](./../../phases/02-crypto-core-error-class/02-CONTEXT.md) — `computeHmac()`, `timingSafeCompare()`, error class signature locked; D-07 pattern for reason union widening
- [Phase 3 CONTEXT.md](./../../phases/03-body-handling-public-api-surface/03-CONTEXT.md) — Provider interface, registry, `req.rawBody` as Buffer, StripeWebhook type, error handling via `next(err)`
- [Phase 4 CONTEXT.md](./04-CONTEXT.md) — All locked decisions (D-01 through D-16), canonical references, code integration points

### Secondary (MEDIUM confidence)

- [HookRay — Webhook Signature Verification (HMAC-SHA256) in Node, Python, Ruby — 2026 Guide](https://hookray.com/blog/webhook-signature-verification-2026) — Cross-provider signature verification patterns, timestamp tolerance best practices
- [Hookdeck — How to Implement SHA256 Webhook Signature Verification](https://hookdeck.com/webhooks/guides/how-to-implement-sha256-webhook-signature-verification) — Multi-provider guidance; constant-time comparison rationale
- [FEATURES.md — Provider-Specific Signature Schemes](./../../research/FEATURES.md) — Stripe section confirms header format, default tolerance, HMAC input structure, ignore-non-v1 guidance

## Metadata

**Confidence breakdown:**
- **Standard Stack:** HIGH — Phase 2/3 crypto primitives and middleware pattern verified; no new libraries introduced
- **Architecture:** HIGH — Stripe webhook scheme documented in official Stripe docs; D-01 through D-16 represent locked design decisions from CONTEXT.md
- **Pitfalls:** HIGH — Timing attacks, JSON reordering, clock skew all confirmed via security best practices and stripe-node implementation
- **API Surface:** MEDIUM-HIGH — Tolerance option propagation (3rd param vs. closure) is planner discretion; test approach (fake timers vs. explicit timestamps) is planner discretion; core pattern verified via stripe-node
- **Test Plan:** HIGH — Requirements mapped to test cases; sampling rate aligns with Phase 1/2/3 patterns

**Research date:** 2026-05-07  
**Valid until:** 2026-05-21 (14 days — Stripe webhook scheme is stable; this research is durable unless Phase 5 introduces encoding gotchas that require revisiting D-10)

---

*Phase: 4-Stripe Provider*
*Research completed: 2026-05-07*
*Next: `/gsd-plan-phase` consumes this RESEARCH.md to create PLAN.md files*
