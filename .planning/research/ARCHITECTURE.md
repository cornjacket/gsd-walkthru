# Architecture Research: Express Webhook Validator

**Domain:** Express middleware library for HMAC webhook signature validation
**Researched:** 2026-05-04
**Confidence:** HIGH (based on Express patterns, prior art analysis, and standardized webhook practices)

## Architectural Tension: Unified vs. Pluggable

The core design challenge is supporting a **unified middleware shape** (one consistent API across Stripe/GitHub/Shopify) while remaining **pluggable** (adding new providers without core changes). This tension is resolved through:

1. **Common provider abstraction** — shared interface that all providers implement
2. **Factory-based public API** — single entry point (`createWebhookMiddleware()`) that returns provider-specific middleware
3. **Declarative provider config** — provider-specific secrets/options managed per-provider, not per-route
4. **Shared crypto utilities** — HMAC, signature comparison, error handling centralized

The structure mirrors how Helmet (per-header composition) and CORS (per-route configuration) achieve both consistency and flexibility.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PUBLIC API LAYER                             │
├─────────────────────────────────────────────────────────────────────┤
│  createWebhookMiddleware('stripe', opts)   [Factory function]       │
│         ↓                                                             │
│  Returns: (req, res, next) => Promise<void>  [Express middleware]   │
└────────────┬────────────────────────────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────────────────────────────┐
│                     PROVIDER ABSTRACTION LAYER                       │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ StripeProvider   │  │ GitHubProvider   │  │ ShopifyProvider  │  │
│  │  • extractSig()  │  │  • extractSig()  │  │  • extractSig()  │  │
│  │  • getTimestamp()│  │  • getTimestamp()│  │  • getTimestamp()│  │
│  │  • computeSig()  │  │  • computeSig()  │  │  • computeSig()  │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  │
└───────────┼────────────────────┼────────────────────┼──────────────┘
            │                    │                    │
            └────────────────────┼────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────────┐
│                     SIGNATURE VALIDATION CORE                        │
├─────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ validateSignature(rawBody, signature, secret, algorithm)       │ │
│  │  • Constant-time HMAC comparison (crypto.timingSafeEqual)      │ │
│  │  • Returns: { valid: bool, error?: ValidationError }          │ │
│  └────────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ validateReplayWindow(timestamp, window, tolerance)             │ │
│  │  • Checks timestamp freshness (5-minute default for Stripe)    │ │
│  │  • Returns: { valid: bool, error?: ValidationError }          │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
             ↓
┌─────────────────────────────────────────────────────────────────────┐
│                        ERROR HANDLING LAYER                          │
├─────────────────────────────────────────────────────────────────────┤
│  WebhookValidationError (discriminated by reason)                   │
│  • SIGNATURE_MISMATCH                                               │
│  • TIMESTAMP_INVALID (Stripe only)                                  │
│  • MISSING_HEADER                                                   │
│  • MALFORMED_PAYLOAD                                                │
│  • REPLAY_SUSPECTED (GitHub/Shopify gap warning)                    │
│  (All errors exclude sensitive material: no signature/secret bytes) │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **createWebhookMiddleware(provider, opts)** | Factory function that returns configured Express middleware | Higher-order function; validates options at creation time; returns async `(req, res, next) => Promise<void>` |
| **[Provider]Handler** (Stripe/GitHub/Shopify) | Provider-specific logic for extracting headers, building signature material, computing expected signature | Class or object with methods for `extractSignature()`, `buildSignedString()`, `getTimestamp()`, and validation-specific quirks |
| **SignatureValidator** | Core HMAC computation and constant-time comparison | Thin wrapper around Node's `crypto.createHmac()` and `crypto.timingSafeEqual()` |
| **ReplayWindowValidator** | Timestamp freshness check (Stripe only) | Compares `Date.now()` against signed timestamp within configurable window |
| **WebhookValidationError** | Discriminated error class | Class with `reason` discriminant and provider-safe error messages (no signature bytes, secrets, or body contents) |
| **Raw Body Capture** | Middleware that stores raw body buffer before `express.json()` parses it | Custom middleware using `req.on('data')` or integration with body-parser's `verify` callback |
| **Request Augmentation** | Attaches webhook metadata to `req.webhook` | Object with `{ provider, eventId, timestamp, parsed: any }` (parsed JSON only after signature validates) |

---

## Recommended Project Structure

```
src/
├── index.ts                           # Main entry point: exports createWebhookMiddleware, types
├── middleware.ts                      # Core middleware factory and composition logic
├── errors.ts                          # WebhookValidationError + discriminated reasons
├── types.ts                           # Provider type definitions, interfaces, request augmentation
│
├── providers/                         # Provider-specific handlers (pluggable architecture)
│   ├── types.ts                       # Interface all providers must implement
│   ├── stripe.ts                      # StripeProvider implementation
│   ├── github.ts                      # GitHubProvider implementation
│   └── shopify.ts                     # ShopifyProvider implementation
│
├── crypto/                            # Shared cryptographic utilities
│   ├── hmac.ts                        # HMAC computation (createHmac wrapper)
│   ├── compare.ts                     # Constant-time signature comparison
│   └── timestamp.ts                   # Timestamp validation (Stripe only)
│
├── raw-body/                          # Raw body capture for signature validation
│   ├── middleware.ts                  # Express middleware that captures raw buffer
│   └── helpers.ts                     # Utilities for reading/storing raw body
│
└── __tests__/                         # Test suite (mirrors src structure)
    ├── stripe.test.ts
    ├── github.test.ts
    ├── shopify.test.ts
    ├── crypto/
    └── e2e.test.ts                    # Integration tests with real Express app
```

### Structure Rationale

- **Flat top-level exports:** `createWebhookMiddleware` is the main API; supporting utilities live in subdirectories for clarity but don't pollute the public interface
- **providers/ as pluggable abstraction:** New providers (Slack, Twilio, etc.) can be added in the future without touching core logic. Each implements the same interface
- **crypto/ as shared utilities:** HMAC, comparison, and timestamp logic are centralized to prevent drift and ensure consistency across providers
- **raw-body/ separated:** Raw body capture is Express-specific and orthogonal to the validation logic itself; isolated here to keep concerns separate
- **Test structure mirrors src:** Makes it easy to find and add tests; encourages comprehensive coverage

---

## Data Flow: Request Through Middleware

A webhook request travels through the middleware in this order:

```
Incoming HTTPS POST (raw body stream)
  ↓
[Raw Body Capture Middleware]  ← Must run BEFORE express.json()
  • Reads req.on('data') into Buffer
  • Stores raw bytes in req.rawBody
  • Calls next()
  ↓
[createWebhookMiddleware(provider, opts)]  ← Main validation middleware
  ├─ Extract provider-specific headers
  │  • Stripe: X-Stripe-Signature
  │  • GitHub: X-Hub-Signature-256
  │  • Shopify: X-Shopify-Hmac-Sha256
  │  └─ If missing → 401 + WebhookValidationError(MISSING_HEADER)
  │
  ├─ Validate raw body is available
  │  └─ If missing → 500 + WebhookValidationError(MALFORMED_PAYLOAD)
  │
  ├─ Compute expected signature
  │  • Call provider-specific buildSignedString(rawBody, options)
  │  • Use crypto.createHmac('sha256', secret) with provider's algorithm
  │  • Handle provider quirks: Stripe timestamp+body, GitHub/Shopify body-only
  │
  ├─ Constant-time comparison
  │  • Use crypto.timingSafeEqual(computed, provided)
  │  └─ If mismatch → 401 + WebhookValidationError(SIGNATURE_MISMATCH)
  │
  ├─ Replay protection (provider-specific)
  │  • Stripe: validateTimestamp(signedTs, replayWindow)
  │  │  └─ If expired → 401 + WebhookValidationError(TIMESTAMP_INVALID)
  │  • GitHub/Shopify: return warning in metadata (no built-in defense)
  │  │  └─ Emit debug log: "Consider implementing delivery-ID dedup"
  │
  ├─ Parse JSON body (NOW SAFE — signature already verified)
  │  • JSON.parse(rawBody.toString())
  │  └─ If parse error → 400 + WebhookValidationError(MALFORMED_PAYLOAD)
  │
  ├─ Augment request object
  │  • req.webhook = {
  │      provider: 'stripe' | 'github' | 'shopify',
  │      eventId: <provider-specific ID>,
  │      timestamp: <milliseconds since epoch>,
  │      parsed: <JSON body>,
  │      signature: <extracted header value>  [ONLY for logging/debugging]
  │    }
  │  • Note: signature field is intentionally NOT exposed by default
  │
  └─ Call next()
     ↓
[Downstream route handler]
  • req.webhook is fully populated and type-safe
  • Can safely assume signature is valid
  • Access event data: req.webhook.parsed
  ↓
[Error handling middleware (if error thrown)]
  • 4-argument middleware catches validation errors
  • Responds with 401 + sanitized error message
  • Never logs signature, secret, or body material
```

### Key Data Flow Decisions

1. **Raw body must be captured BEFORE express.json()** — The most common integration error. Raw body capture middleware runs first in the stack.
2. **Signature validation BEFORE JSON parsing** — Prevents parsing untrusted payloads. If signature fails, body is never parsed.
3. **Error short-circuits at each step** — Missing header → stop immediately. Signature mismatch → stop immediately. This prevents wasted computation and information leakage.
4. **Request augmentation is type-safe** — `req.webhook` is a discriminated union by provider, so TypeScript can narrow types in downstream handlers.

---

## Public API Design

### Factory Function (Primary Entry Point)

```typescript
// createWebhookMiddleware(provider, options)
// Returns: Express middleware

type CreateWebhookMiddlewareOptions = {
  secret: string | ((req: Request) => Promise<string>); // Support async secret lookup
  replayWindow?: number; // milliseconds; Stripe default 5 * 60 * 1000
  onReplayWarning?: (reason: string) => void; // GitHub/Shopify: log replay gap
};

interface WebhookMiddleware {
  (req: Request, res: Response, next: NextFunction): Promise<void>;
}

function createWebhookMiddleware<T extends Provider>(
  provider: T,
  options: CreateWebhookMiddlewareOptions & ProviderOptions<T>
): WebhookMiddleware;
```

### Request Augmentation Type (Discriminated by Provider)

```typescript
type WebhookMetadata = 
  | {
      provider: 'stripe';
      eventId: string; // event.id
      timestamp: number; // milliseconds
      parsed: Record<string, unknown>; // Full event JSON
      replayWindowMs: number; // Actual window used
    }
  | {
      provider: 'github';
      eventId: string; // X-GitHub-Delivery UUID
      timestamp: number; // Now, since GitHub doesn't sign timestamp
      parsed: Record<string, unknown>;
      deliveryId: string; // For user-implemented dedup
    }
  | {
      provider: 'shopify';
      eventId: string; // Shopify topic + timestamp
      timestamp: number; // Now, since Shopify doesn't sign timestamp
      parsed: Record<string, unknown>;
    };

declare global {
  namespace Express {
    interface Request {
      webhook?: WebhookMetadata;
    }
  }
}
```

### Downstream Usage (Type-Safe Narrowing)

```typescript
// TypeScript automatically narrows req.webhook type based on provider
app.post('/webhooks/stripe', createWebhookMiddleware('stripe', { secret: STRIPE_SECRET }), (req, res) => {
  // req.webhook has type { provider: 'stripe'; ... } — only stripe fields available
  const eventId = req.webhook.eventId; // OK
  const deliveryId = req.webhook.deliveryId; // TS error — GitHub-only field
  
  const event = req.webhook.parsed as StripeEvent; // User-provided type assertion
  res.json({ received: true });
});
```

---

## Error Model

### Discriminated Error Class

```typescript
type WebhookValidationErrorReason =
  | 'SIGNATURE_MISMATCH'
  | 'MISSING_HEADER'
  | 'MALFORMED_PAYLOAD'
  | 'TIMESTAMP_INVALID'
  | 'REPLAY_SUSPECTED'; // GitHub/Shopify gap warning

class WebhookValidationError extends Error {
  reason: WebhookValidationErrorReason;
  statusCode: number; // 401 for crypto, 400 for malformed, 500 for infrastructure
  provider: string;

  constructor(reason: WebhookValidationErrorReason, provider: string, message: string) {
    super(message); // Human-readable, signature/secret-safe
    this.reason = reason;
    this.statusCode = this.computeStatusCode(reason);
    this.provider = provider;
  }

  private computeStatusCode(reason: WebhookValidationErrorReason): number {
    switch (reason) {
      case 'SIGNATURE_MISMATCH':
      case 'TIMESTAMP_INVALID':
        return 401; // Unauthorized
      case 'MISSING_HEADER':
      case 'MALFORMED_PAYLOAD':
        return 400; // Bad request
      case 'REPLAY_SUSPECTED':
        return 202; // Accepted (warning only, doesn't fail validation)
      default:
        return 500; // Internal error
    }
  }
}
```

### Error Handling in Middleware

```typescript
// Error short-circuits with minimal information leakage
app.post('/webhooks/stripe', stripeWebhook, (req, res, next) => {
  // ... route handler
}, (err: WebhookValidationError, req: Request, res: Response, next: NextFunction) => {
  // 4-argument error handler
  // Log to structured logger (safe to include provider + reason + status)
  logger.warn('webhook_validation_failed', {
    provider: err.provider,
    reason: err.reason,
    statusCode: err.statusCode
  });
  
  // Response to client (never includes signature, secret, or body)
  res.status(err.statusCode).json({
    error: err.message, // e.g., "Webhook signature invalid"
    reason: err.reason
  });
});
```

---

## Configuration & Composition Patterns

### Pattern 1: Factory Function with Static Secret

**What:** Simplest case — secret known at startup time, supplied once.

**When to use:** Development, testing, or when secret is hardcoded environment variable.

**Example:**
```typescript
const stripeMiddleware = createWebhookMiddleware('stripe', {
  secret: process.env.STRIPE_WEBHOOK_SECRET!
});

app.post('/webhooks/stripe', stripeMiddleware, (req, res) => {
  // ...
});
```

---

### Pattern 2: Async Secret Lookup

**What:** Secret loaded from database or external config service at request time.

**When to use:** Multi-tenant SaaS where secrets vary by customer/organization.

**Example:**
```typescript
const stripeMiddleware = createWebhookMiddleware('stripe', {
  secret: async (req) => {
    // Extract tenant ID from request context (e.g., from webhook URL or domain)
    const tenantId = req.params.tenantId || extractTenantFromDomain(req.hostname);
    const secret = await secretManager.get(`stripe:${tenantId}`);
    return secret;
  }
});

app.post('/webhooks/:tenantId/stripe', stripeMiddleware, (req, res) => {
  // Secret was looked up based on tenantId
});
```

---

### Pattern 3: Per-Provider Middleware Stack

**What:** Multiple webhook providers on one Express app, each with separate middleware.

**When to use:** Standard case — app integrates with multiple vendors.

**Example:**
```typescript
const stripeMiddleware = createWebhookMiddleware('stripe', { secret: STRIPE_SECRET });
const githubMiddleware = createWebhookMiddleware('github', { secret: GITHUB_SECRET });
const shopifyMiddleware = createWebhookMiddleware('shopify', { secret: SHOPIFY_SECRET });

app.post('/webhooks/stripe', stripeMiddleware, handleStripeEvent);
app.post('/webhooks/github', githubMiddleware, handleGithubEvent);
app.post('/webhooks/shopify', shopifyMiddleware, handleShopifyEvent);

function handleStripeEvent(req: Request, res: Response) {
  if (req.webhook?.provider === 'stripe') {
    // Type-safe access to Stripe-specific fields
    console.log(`Stripe event ${req.webhook.eventId}`);
  }
}
```

---

### Pattern 4: Conditional Middleware (Route-Level Validation)

**What:** Validation middleware applied only to specific routes based on configuration.

**When to use:** Disabling webhook validation in development, or per-route feature flags.

**Example:**
```typescript
function conditionalValidation(provider: Provider, options: Options) {
  if (process.env.DISABLE_WEBHOOK_VALIDATION === 'true') {
    // Skip validation, but still parse body
    return (req: Request, res: Response, next: NextFunction) => {
      req.webhook = { provider, eventId: 'dev', parsed: JSON.parse(req.body) };
      next();
    };
  }
  return createWebhookMiddleware(provider, options);
}

app.post('/webhooks/stripe', conditionalValidation('stripe', opts), handler);
```

---

## Build Order & Component Dependencies

The architecture is designed to emerge in phases:

### Phase 1: Shared Foundation (Stripe First)

**Goal:** Build the core abstraction by implementing Stripe.

- **Build order:**
  1. `crypto/` — HMAC computation, constant-time comparison
  2. `errors.ts` — WebhookValidationError class
  3. `types.ts` — TypeScript interfaces (Provider, WebhookMetadata)
  4. `raw-body/middleware.ts` — Raw body capture (most common footgun)
  5. `providers/stripe.ts` — StripeProvider implementation
  6. `middleware.ts` — Core factory + orchestration
  7. `index.ts` — Public exports
  8. **Tests:** crypto → raw-body → middleware → Stripe integration

- **Why Stripe first:** Has timestamp-based replay protection, demonstrating the full feature set; cleanest crypto requirements; most mature ecosystem

- **Emergent abstraction:** By end of Phase 1, the Provider interface is concrete and documented in types.ts.

---

### Phase 2: Multi-Provider Support (GitHub + Shopify)

**Goal:** Validate the unified abstraction against simpler providers.

- **Build order:**
  1. `providers/github.ts` — GitHub-specific handler (simpler: no timestamp)
  2. `providers/shopify.ts` — Shopify-specific handler (similar to GitHub)
  3. Update `middleware.ts` to handle provider branching
  4. Update `types.ts` discriminated union for all three providers
  5. Integration tests across all three

- **Why this order:** GitHub and Shopify are simpler than Stripe; testing the abstraction against them validates that the shared crypto layer is flexible enough

- **Abstraction validation:** Does the Provider interface fit GitHub/Shopify without modification? If not, abstract it further

---

### Phase 3: Robustness & Documentation

**Goal:** Polish, tests, examples, docs.

- **Build order:**
  1. E2E tests with real Express app (all three providers)
  2. Error handling tests (coverage for all WebhookValidationErrorReason values)
  3. Security tests (timing-attack resistance, signature leakage)
  4. README with per-provider quickstarts
  5. Example app (src/examples/)

---

## Architectural Patterns to Follow

### Pattern: Provider Interface as Contract

**What:** Each provider (Stripe, GitHub, Shopify) implements a standard interface, allowing new providers to be added without modifying core logic.

**When to use:** Always — this is the core abstraction.

**Example:**
```typescript
interface Provider {
  name: 'stripe' | 'github' | 'shopify' | string;
  
  // Extract the signature from request headers
  extractSignature(req: Request): string | null;
  
  // Build the string to be signed (differs per provider)
  buildSignedString(rawBody: Buffer, options?: Record<string, any>): string;
  
  // Extract metadata (event ID, timestamp) for augmentation
  extractMetadata(req: Request, rawBody: Buffer): {
    eventId: string;
    timestamp: number;
    extra?: Record<string, any>;
  };
  
  // Algorithm to use (all are 'sha256' for now, but interface allows flexibility)
  algorithm(): 'sha256';
}
```

**Trade-offs:**
- **Pro:** Adding Slack, Twilio, etc. requires only a new class; middleware logic doesn't change
- **Con:** Small overhead from indirection; all providers must work through the same interface

---

### Pattern: Constant-Time Comparison for Crypto

**What:** Use `crypto.timingSafeEqual()` instead of `===` or `.equals()` to prevent timing attacks.

**When to use:** Always for signature comparison. Non-negotiable security requirement.

**Example:**
```typescript
function constantTimeCompare(actual: Buffer, expected: Buffer): boolean {
  try {
    return crypto.timingSafeEqual(actual, expected);
  } catch (err) {
    // timingSafeEqual throws if lengths differ; that's a mismatch
    return false;
  }
}

// Usage:
const expectedSig = crypto.createHmac('sha256', secret).update(body).digest();
const isValid = constantTimeCompare(
  Buffer.from(providedSig, 'hex'),
  expectedSig
);
```

**Trade-offs:**
- **Pro:** Prevents timing attacks (attacker can't deduce signature byte-by-byte)
- **Con:** Negligible performance cost; non-issue in practice

---

### Pattern: Error Short-Circuiting

**What:** Each validation step returns early if it fails, preventing unnecessary computation and information leakage.

**When to use:** All security-critical paths.

**Example:**
```typescript
async function validateWebhook(req: Request, secret: string): Promise<WebhookValidationError | null> {
  // Step 1: Extract header
  const signature = provider.extractSignature(req);
  if (!signature) {
    return new WebhookValidationError('MISSING_HEADER', provider, 'X-Stripe-Signature header missing');
  }

  // Step 2: Validate body exists
  if (!req.rawBody) {
    return new WebhookValidationError('MALFORMED_PAYLOAD', provider, 'Raw body not captured');
  }

  // Step 3: Compute and compare signature
  const expected = computeSignature(req.rawBody, secret);
  if (!constantTimeCompare(expected, Buffer.from(signature, 'hex'))) {
    return new WebhookValidationError('SIGNATURE_MISMATCH', provider, 'Signature invalid');
  }

  // Step 4: Replay check (provider-specific)
  if (provider === 'stripe') {
    const replayError = await validateReplay(...);
    if (replayError) return replayError;
  }

  return null; // Valid
}
```

**Trade-offs:**
- **Pro:** Fails fast; prevents wasted work; each error is specific and actionable
- **Con:** Slightly more verbose than combining checks

---

### Pattern: Request Augmentation via Discriminated Union

**What:** Extend `express.Request` with a `webhook` property that has provider-specific shape, allowing TypeScript to narrow types.

**When to use:** Type-safe access to webhook metadata in downstream handlers.

**Example:**
```typescript
// In middleware:
req.webhook = {
  provider: 'stripe' as const,
  eventId: event.id,
  timestamp: event.created * 1000,
  parsed: event
};

// In handler:
if (req.webhook?.provider === 'stripe') {
  const event = req.webhook.parsed as StripeEvent; // Safe narrowing
  console.log(event.type); // TS knows Stripe event types
}
```

**Trade-offs:**
- **Pro:** Full TypeScript support; no `as any` casts needed
- **Con:** Requires declaration merging in Express types; slightly complex setup

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Signature Validation AFTER JSON Parsing

**What people do:** Parse the request body with `express.json()` first, then try to validate the signature.

**Why it's wrong:** 
- Parsing modifies the body (whitespace normalization, key ordering, etc.)
- The signature was computed against the **original raw bytes**, not the parsed + re-stringified version
- Signatures fail even for valid payloads due to byte mismatch

**Do this instead:**
- Capture raw body in custom middleware BEFORE any parsing middleware
- Validate signature against raw bytes
- Only parse JSON after validation succeeds

---

### Anti-Pattern 2: Using String Equality for Signature Comparison

**What people do:**
```typescript
if (computed === provided) { /* valid */ } // WRONG
```

**Why it's wrong:**
- String equality (`===`) is susceptible to timing attacks
- Attacker can deduce correct signature byte-by-byte by measuring response time
- Not cryptographically safe

**Do this instead:**
```typescript
crypto.timingSafeEqual(computed, provided); // Use constant-time comparison
```

---

### Anti-Pattern 3: Leaking Secrets or Signatures in Error Messages

**What people do:**
```typescript
throw new Error(`Invalid signature. Expected ${expected}, got ${provided}`); // WRONG
throw new Error(`Secret ${secret} not found`); // WRONG
```

**Why it's wrong:**
- Exposes sensitive material in logs, error responses, or stack traces
- Attackers monitor logs for this information
- Compliance/security audit failure

**Do this instead:**
```typescript
// Error message: provider-safe, no secrets or signature bytes
throw new WebhookValidationError('SIGNATURE_MISMATCH', 'stripe', 'Webhook signature invalid');

// Logging: log reason + status, not the actual values
logger.warn('signature_validation_failed', {
  provider: 'stripe',
  reason: 'SIGNATURE_MISMATCH'
});
```

---

### Anti-Pattern 4: Trusting Body Before Signature Validation

**What people do:**
```typescript
const event = JSON.parse(body); // Parse first
if (isSignatureValid(body)) { // Validate after
  // This could be attacker-supplied JSON!
}
```

**Why it's wrong:**
- Malicious JSON could cause DoS (deeply nested objects, huge arrays)
- You've already parsed and acted on untrusted data
- Signature validation comes too late

**Do this instead:**
```typescript
// Step 1: Validate signature against raw body
const isValid = await validateSignature(rawBody);
if (!isValid) return 401;

// Step 2: Only NOW parse as trusted data
const event = JSON.parse(rawBody);
```

---

## Handling the Unified vs. Pluggable Tension

### Why It Matters

The core design goal is a **unified middleware shape** (one consistent API across providers), but with **pluggable providers** (easy to add new ones). These can conflict:

- **Unified:** Suggests a single, inflexible API—all providers fit one mold
- **Pluggable:** Suggests high customization per provider—lots of options and branching

### The Resolution

1. **Unified public API:** All providers expose the same middleware signature `(req, res, next) => Promise<void>`

2. **Provider abstraction hides differences:** Implementation details (how Stripe signs, how GitHub signs) are encapsulated in provider classes. Core middleware doesn't care.

3. **Type-safe narrowing:** While the middleware shape is unified, TypeScript's discriminated unions ensure downstream code can safely access provider-specific metadata.

4. **Composable configuration:** Options are provider-agnostic at the top level (`secret`, `replayWindow`), but provider-specific options can be passed via a generic object.

**Example:**
```typescript
// Same factory function, different providers
const stripeMiddleware = createWebhookMiddleware('stripe', { secret: STRIPE_SECRET });
const githubMiddleware = createWebhookMiddleware('github', { secret: GITHUB_SECRET });

// Same middleware signature
app.post('/webhooks/stripe', stripeMiddleware, handler); // Identical pattern
app.post('/webhooks/github', githubMiddleware, handler);  // Identical pattern

// But downstream, types narrow correctly
if (req.webhook?.provider === 'stripe') {
  // Only Stripe fields available here
}
```

This design is inspired by how Helmet structures headers (unified interface, per-header config) and how CORS handles dynamic rules (single factory, flexible options).

---

## Integration with Express Conventions

### Raw Body Capture: Integration with express.json()

The biggest footgun is body-parser consuming the raw body before signature validation. Two solutions:

**Option A: Custom Middleware (Recommended)**
```typescript
// Middleware order matters!
app.use(rawBodyCapture()); // Must come FIRST
app.use(express.json()); // Can use normally now
app.post('/webhooks/stripe', stripeWebhook, handler); // Validates captured raw body
```

**Option B: Using body-parser's verify Callback**
```typescript
app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf; // Store raw bytes before parsing
  }
}));
app.post('/webhooks/stripe', stripeWebhook, handler);
```

Option A is clearer; Option B requires less middleware but couples signature validation to JSON parsing setup.

---

### Error Handling: Express 4 vs. Express 5

**Express 4:** Async errors in middleware must be manually passed to `next(err)`.

```typescript
// Express 4: Must wrap async middleware to catch errors
const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

app.post('/webhooks/stripe', asyncHandler(stripeMiddleware), handler);
```

**Express 5:** Async/await errors are automatically caught.

```typescript
// Express 5: Async errors just work
app.post('/webhooks/stripe', stripeMiddleware, handler);
```

This library should support both. Likely approach: detect Express version and wrap conditionally, or provide an explicit wrapper function.

---

## Scaling Considerations

| Scale | Approach |
|-------|----------|
| **Dev / Single webhook provider** | Start with Phase 1 (Stripe); raw-body middleware + factory. No special scaling needed. |
| **Multiple providers (Stripe + GitHub + Shopify)** | Implement Phase 2. Each route mounts its own middleware. No bottleneck at the validation layer. |
| **High-volume webhooks (100s per second)** | Bottleneck is not validation (HMAC is fast), but downstream event processing. Consider async job queue (Redis, Kafka, RabbitMQ) after validation passes. Validation itself is stateless and CPU-bound. |
| **Multi-tenant (different secrets per customer)** | Use async secret lookup pattern. Populate from database, Redis cache, or secrets manager. Validation remains stateless; only secret loading requires I/O. |
| **Replay detection for GitHub/Shopify** | Validation middleware stays the same. User app implements delivery-ID dedup in their own store (Redis, database). Middleware documents this gap; user chooses their dedup strategy. |

**First bottleneck:** Downstream event processing (business logic), not signature validation. Keep validation fast and stateless.

---

## Sources

- [Express Error Handling Guide](https://expressjs.com/en/guide/error-handling.html)
- [Express Middleware Guide](https://expressjs.com/en/guide/using-middleware.html)
- [Stripe Webhooks Documentation](https://docs.stripe.com/webhooks)
- [How to extend the Express Request object in TypeScript - LogRocket Blog](https://blog.logrocket.com/extend-express-request-object-typescript/)
- [Express Middleware Patterns: Composition, Error Handling, and Auth (2026 Guide) - DEV Community](https://dev.to/young_gao/middleware-patterns-in-express-composition-error-handling-and-auth-k16)
- [Helmet Middleware - Security Headers](https://helmetjs.github.io/)
- [CORS Middleware](https://expressjs.com/en/resources/middleware/cors.html)
- [A generic middleware pattern in Typescript](https://evertpot.com/generic-middleware/)
- [TypeScript: Discriminated Unions](https://basarat.gitbook.io/typescript/type-system/discriminated-unions)
- [Webhook Signature Verification (HMAC-SHA256) in Node, Python, Ruby — 2026 Guide | HookRay](https://hookray.com/blog/webhook-signature-verification-2026)
- [@octokit/webhooks.js - GitHub Webhook Handling](https://github.com/octokit/webhooks.js)
- [Tern - Universal Webhook Verification Framework](https://tern.hookflo.com/)

---

*Architecture research for: Express webhook validation middleware*
*Researched: 2026-05-04*
