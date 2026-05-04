# Domain Pitfalls: Webhook Signature Validation Middleware

**Domain:** Express middleware for HMAC signature validation across third-party webhook providers (Stripe, GitHub, Shopify)  
**Researched:** 2026-05-04  
**Scope:** Security-critical implementation patterns, provider-specific gotchas, operational risks  

---

## Critical Pitfalls

Mistakes in this category cause silent failures, false positives, or security breaches. Must prevent before shipping.

### Pitfall 1: Naive String Equality for Signature Comparison

**What goes wrong:** Using `===` or `==` to compare the computed signature against the header value.

```javascript
// WRONG
if (computedSig === headerSig) { /* accept */ }

// RIGHT
crypto.timingSafeEqual(Buffer.from(computedSig), Buffer.from(headerSig))
```

**Why it happens:** String comparison is the obvious choice. Developers often copy examples that don't emphasize constant-time requirements.

**Consequences:** 
- Timing attacks: An attacker can iteratively forge signatures by measuring response time to narrow down the correct bytes
- Each character mismatch ends the comparison at different times, leaking information about where the secret diverges
- Stripe, GitHub, and Shopify documentation all explicitly warn against `===`

**Prevention:**
- Always use `crypto.timingSafeEqual()` in Node.js (requires Buffer arguments, not strings)
- Document in README why this matters
- Add a test that verifies invalid signatures are rejected (not just accepted signatures verified)
- Use a linter rule or TypeScript wrapper to catch `===` comparisons of signature values

**Detection:** 
- Code review: grep for `signature.*===` or `===.*signature`
- Security scan: Flag any string equality on cryptographic values
- Test: Compare against known-bad signatures; if response time varies, timing attack exists

**Phase:** Core validation logic (Phase 1)

---

### Pitfall 2: Timing-Safe Comparison with Mismatched Buffer Lengths

**What goes wrong:** `crypto.timingSafeEqual()` throws an error if the two buffers have different lengths, and this error can leak information about the secret's length.

```javascript
const computed = crypto.createHmac('sha256', secret).update(body).digest('hex');
const header = req.headers['x-hub-signature-256']?.replace('sha256=', '');

// WRONG - throws if lengths differ, timing leak
crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(header));

// RIGHT - length check first, no early return
if (computed.length !== header.length) {
  return false; // Don't throw; safe timing
}
crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(header));
```

**Why it happens:** Developers assume `timingSafeEqual()` handles all edge cases. They don't read the Node.js docs carefully enough.

**Consequences:**
- Error thrown with different lengths can be caught and re-thrown, causing timing variation
- Exception messages leak information about relative lengths
- If header is truncated or malformed, length mismatch becomes a signal for attackers

**Prevention:**
- Check length equality explicitly before calling `timingSafeEqual()`, with no early return
- Wrap both buffers in a safe comparison helper that handles length mismatch
- Use typed constants for expected lengths (64 chars for SHA256 hex, 43 for base64)
- Test with truncated/malformed signatures to verify no exceptions leak

**Detection:**
- Code review: Verify length check precedes `timingSafeEqual()` call
- Test: Pass signatures with wrong length; verify no exception thrown
- Linting: Flag `timingSafeEqual()` calls without length guards

**Phase:** Core validation logic (Phase 1)

---

### Pitfall 3: Raw Body vs. Parsed Body Mismatch

**What goes wrong:** Middleware accesses `req.body` (a parsed JavaScript object) instead of raw bytes when computing the HMAC.

```javascript
// WRONG - body is parsed JSON object
const body = JSON.stringify(req.body); // Re-serialization adds/removes whitespace
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');

// RIGHT - use raw bytes as sent by provider
const sig = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
```

**Why it happens:**
- Express.json() by default parses the body into an object
- Re-serializing with `JSON.stringify()` changes key order, whitespace, unicode escaping
- Developers don't realize HMAC was computed on the *exact bytes* the provider sent, not the parsed structure

**Consequences:**
- Signature verification fails silently for all webhooks
- Especially insidious if some requests succeed (those with canonical JSON formatting) and others fail
- Hard to debug because the signature algorithm and secret are correct; only the input differs
- Affects all three providers: Stripe, GitHub, Shopify

**Prevention:**
- Use `express.raw()` or a custom body parser that captures raw bytes in `req.rawBody`
- Alternatively, use `express.json()` with a `verify` hook to capture raw body
- Test with real provider payloads to ensure signature validates
- Add a test with deliberately non-canonical JSON (extra spaces, key reordering) to catch this early
- Document in README: "Always verify against raw body, not parsed JSON"

**Detection:**
- Code review: Check that HMAC input is `req.rawBody` or equivalent, not `req.body`
- Integration test: Validate signature against actual Stripe/GitHub/Shopify test payloads
- Debug: Compare computed signature against provider test signature; if mismatch, check body representation

**Phase:** Middleware setup (Phase 1); test with real payloads (Phase 2)

---

### Pitfall 4: Express Middleware Ordering—Body Parser Before Signature Verification

**What goes wrong:** Global `app.use(express.json())` parses the body before the webhook route middleware runs, consuming `req.rawBody` and populating `req.body`.

```javascript
// WRONG - order causes body to be parsed before webhook sees it
app.use(express.json());

app.post('/webhook/stripe', verifyStripeSignature, (req, res) => {
  // req.body is parsed, req.rawBody is gone
  // Signature verification already failed above
});

// RIGHT - webhook route before global JSON parser
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), verifyStripeSignature, (req, res) => {
  // req.body is still a Buffer
});

app.use(express.json()); // Parse JSON for non-webhook routes
```

**Why it happens:**
- Express middleware processes in order, and most apps apply `express.json()` globally at startup
- Developers don't realize that signature middleware runs *after* body parsing if the order is wrong
- This is the most commonly cited cause of webhook verification failures in Stripe/GitHub community forums

**Consequences:**
- All webhook requests fail validation
- Webhooks are silently ignored or return 400 errors
- Provider retries with exponential backoff, eventually stops sending
- Root cause is hard to diagnose: secret looks correct, algorithm is right, but validation always fails

**Prevention:**
- Mount signature verification middleware *before* global `express.json()`
- Use `express.raw()` on webhook routes to prevent parsing
- Alternatively, place webhook routes before `app.use(express.json())` and add `express.json()` after
- Document middleware ordering in README with a working example
- Test with a real Express app to catch this during development
- Add a note: "Middleware order matters: webhook routes must see raw body"

**Detection:**
- Code review: Verify `app.use(express.json())` is not before webhook route
- Check route handler `req.body` type: should be `Buffer`, not `object`
- Integration test: Mount middleware in wrong order; verify test catches the failure
- Linting: Flag `app.use(express.json())` without a comment explaining body parser ordering

**Phase:** Middleware integration (Phase 1); runnable example app (Phase 3)

---

### Pitfall 5: Leaking Signature Material in Errors or Logs

**What goes wrong:** Error messages, stack traces, or debug logs contain the signature, secret, or request body.

```javascript
// WRONG - logs the signature
if (!isValid) {
  console.error(`Signature mismatch: expected ${headerSig}, got ${computedSig}`);
  return res.status(401).json({ error: 'Unauthorized' });
}

// WRONG - leaks secret in stack trace
const secret = process.env.STRIPE_WEBHOOK_SECRET;
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');

// RIGHT - never log or expose signature material
if (!isValid) {
  console.error('Webhook signature verification failed');
  return res.status(401).json({ error: 'Unauthorized' });
}
```

**Why it happens:**
- During debugging, developers add `console.log()` of values to understand failures
- Error messages naturally include the data that failed to validate
- Secrets are in environment variables; if an exception bubbles up, it can include them in context
- A stack trace in production logging could expose `STRIPE_WEBHOOK_SECRET` or similar

**Consequences:**
- If logs are centralized and accessible, signature material leaks to logging service
- If stack traces are sent to error tracking (Sentry, Rollbar), secrets leak there
- An attacker with log access can forge webhooks using the leaked signature
- Compliance/security audit finds secrets in logs and fails the review

**Prevention:**
- Never log signatures, secrets, or raw bodies
- Provide actionable error messages without exposing sensitive data
- Use a custom error class that sanitizes secrets before serialization
- Test with `JSON.stringify()` on errors to verify no sensitive fields leak
- Add a pre-commit hook that scans logs for `secret`, `signature`, `hmac`
- Document: "If validation fails, log only the provider name and timestamp, not the values"

**Detection:**
- Code review: Search for `console.log`, `console.error`, or `logger` calls near signature validation
- Test: Intentionally trigger validation failure and check logs for sensitive data
- Linting: Flag string interpolation or object serialization of `secret`, `signature`, `body`
- Log scanning: Audit logs in test runs for leaked environment variables

**Phase:** Error handling (Phase 1); logging guidelines in README (Phase 3)

---

### Pitfall 6: Stripe-Signature Header Format Parsing—Multiple v1 Segments

**What goes wrong:** Stripe can send multiple `v1=` signatures in the header (during secret rotation), but code only checks the first one or fails on the second.

```javascript
// Header: t=1234567890,v1=sig1,v1=sig2,v0=oldsig
// WRONG - only checks first signature
const parts = header.split(',');
const v1Index = parts.findIndex(p => p.startsWith('v1='));
const sig = parts[v1Index].split('=')[1]; // Only gets sig1

// RIGHT - check all v1 signatures
const v1Sigs = header.split(',')
  .filter(p => p.startsWith('v1='))
  .map(p => p.split('=')[1]);

for (const sig of v1Sigs) {
  if (crypto.timingSafeEqual(...)) return true; // Accept if any match
}
```

**Why it happens:**
- Stripe's documentation shows the header format but doesn't emphasize multiple v1 segments
- Developers assume one signature per header
- During secret rotation, Stripe temporarily includes both old and new signatures so webhooks don't fail

**Consequences:**
- When Stripe rotates a signing secret, the old key is added to the rotation window
- Requests with the new secret fail validation if code only checks the first `v1=`
- Webhooks are rejected during the rollover period, breaking integrations temporarily
- Provider support team gets complaints about "signature failures after secret rotation"

**Prevention:**
- Parse all `v1=` segments and validate against each one
- Use a robust header parser that handles multiple values
- Document: "Stripe may send multiple v1 signatures during secret rotation; validate against all"
- Test with a header that has multiple v1 segments (even if providers currently don't send them during normal operation)
- Mention in README: "Supports seamless secret rotation"

**Detection:**
- Code review: Verify header parsing extracts all `v1=` values, not just the first
- Unit test: Pass a header with `t=123,v1=sig1,v1=sig2`; verify validation succeeds with either secret
- Stripe documentation: Check if multiple signatures are documented for rotation scenarios

**Phase:** Stripe validation (Phase 2); header parsing unit tests (Phase 1)

---

### Pitfall 7: Stripe Timestamp Tolerance Window Misconfiguration

**What goes wrong:** Timestamp tolerance is set too wide (accepting old requests) or too narrow (rejecting valid recent requests).

```javascript
// WRONG - 1 hour tolerance accepts old replays
const tolerance = 3600; // seconds

// WRONG - 1 second tolerance rejects valid requests due to clock skew
const tolerance = 1;

// RIGHT - 5 minutes (300s) is Stripe's default, balances security and reliability
const tolerance = 300;
```

**Why it happens:**
- Developers either set tolerance very high to avoid false positives (weakening security)
- Or set it too low to maximize security, not realizing clock skew between servers is normal
- The tolerance window is optional and defaults to 300 seconds; developers may not know about it
- If requests queue up behind a slow handler, they'll be marked old by the time they're validated

**Consequences:**
- Too wide: Replay attacks bypass protection. An attacker can re-send a captured webhook after minutes/hours.
- Too narrow: Legitimate webhooks rejected due to clock skew (request sent at t=100, validated at t=102). Provider retries, but user's integration looks broken.
- Incorrect tolerance is hard to detect in testing; manifests as flaky tests or production failures

**Prevention:**
- Use Stripe's default tolerance of 300 seconds (5 minutes)
- If tolerance must change, document the security rationale
- For processing delays: Verify the signature immediately (before queuing), then process asynchronously
- Test with timestamps at the edge of the tolerance window
- If clock skew is a problem, fix the clock sync on servers, not the tolerance
- Document in README: "Tolerance defaults to 300 seconds; increase only if you understand the replay risk"

**Detection:**
- Code review: Check tolerance parameter in Stripe validation
- Test: Create a webhook with a timestamp 290 seconds old; verify it validates. Then 310 seconds old; verify rejection.
- Monitor: Log rejected webhooks due to timestamp; if many rejections, investigate server clock sync

**Phase:** Stripe validation (Phase 2)

---

### Pitfall 8: Hex vs. Base64 Encoding Confusion

**What goes wrong:** Provider sends signature in one encoding, code expects another.

**Provider Encoding:**
- **Stripe:** `v1=<hex-encoded HMAC>`
- **GitHub:** `sha256=<hex-encoded HMAC>` (uppercase sha256 prefix)
- **Shopify:** `X-Shopify-Hmac-SHA256: <base64-encoded HMAC>` (base64, not hex)

```javascript
// WRONG for Shopify - uses hex
const computed = crypto.createHmac('sha256', secret).update(body).digest('hex');
const header = req.headers['x-shopify-hmac-sha256']; // base64
crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(header));

// RIGHT for Shopify - uses base64
const computed = crypto.createHmac('sha256', secret).update(body).digest('base64');
const header = req.headers['x-shopify-hmac-sha256'];
crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(header));
```

**Why it happens:**
- Providers inconsistently choose hex vs. base64. Stripe uses hex, Shopify uses base64.
- Many examples online use hex (more common in security tutorials)
- The difference is subtle—code "looks right" until you compare the values

**Consequences:**
- All signatures from that provider fail validation
- No errors, just silent rejection
- Manifests as "signature verification always fails for this provider"

**Prevention:**
- Check provider documentation for exact encoding (check both official docs and recent community posts)
- Use a wrapper that specifies encoding clearly: `createSignature('sha256', secret, body, 'base64')`
- Test against real provider test payloads (they include exact expected signatures)
- Document encoding for each provider in README with examples
- Add type-safe constants: `STRIPE_ENCODING = 'hex'`, `SHOPIFY_ENCODING = 'base64'`

**Detection:**
- Code review: Check `.digest()` argument matches provider specification
- Test: Validate signature against provider's test payload; compare byte-by-byte output
- Debug: Print computed signature in both hex and base64; compare both against header

**Phase:** Per-provider validation (Phases 2–4)

---

### Pitfall 9: GitHub X-Hub-Signature-256 vs. Deprecated X-Hub-Signature

**What goes wrong:** Code validates against the deprecated SHA-1 signature header instead of the current SHA-256 header.

```javascript
// WRONG - uses deprecated SHA-1 signature
const sig = req.headers['x-hub-signature']; // sha1=...
// Validation will succeed even though security is weak

// RIGHT - uses current SHA-256 signature
const sig = req.headers['x-hub-signature-256']; // sha256=...
```

**Why it happens:**
- GitHub still sends both headers for backward compatibility
- Old tutorials and examples use `X-Hub-Signature`
- Developers copy old code without reading GitHub's latest documentation

**Consequences:**
- Relying on SHA-1 (cryptographically broken) instead of SHA-256
- False sense of security; provider says "verify signatures" but weak hash is acceptable
- If webhook secret is compromised, SHA-1 is much easier to brute-force
- Portfolio review sees weak crypto and down-votes security

**Prevention:**
- Always use `X-Hub-Signature-256` header
- Ignore `X-Hub-Signature` header
- Document in README: "We validate using SHA-256 (X-Hub-Signature-256), not deprecated SHA-1"
- Linting: Flag any reference to `x-hub-signature` (without `-256` suffix)
- Test: Verify code rejects `X-Hub-Signature` if it's the only header provided

**Detection:**
- Code review: Check for string match on `X-Hub-Signature` header name
- Test: Try validating with only SHA-1 header; verify rejection
- GitHub webhook settings: Confirm webhook receives both headers but code uses the new one

**Phase:** GitHub validation (Phase 2)

---

## Moderate Pitfalls

Mistakes in this category degrade reliability or DX but don't cause outright failure.

### Pitfall 10: Missing Signature Header Handling

**What goes wrong:** Code assumes signature header is always present, crashes if missing.

```javascript
// WRONG - assumes header exists
const sig = req.headers['x-shopify-hmac-sha256'].split(',')[0]; // TypeError if undefined

// RIGHT - check before accessing
const sig = req.headers['x-shopify-hmac-sha256'];
if (!sig) {
  return res.status(400).json({ error: 'Missing signature header' });
}
```

**Why it happens:**
- Happy-path testing uses requests with valid signatures
- Missing header scenario is an edge case developers don't test
- TypeScript may not catch this if headers are typed as `any`

**Consequences:**
- Requests without signature header cause a crash (500 error)
- Provider sees error, retries, eventually stops sending
- Logs fill with TypeError exceptions
- Operational visibility is poor: "Why are webhooks failing?"

**Prevention:**
- Check for header existence before accessing
- Return 400 (bad request) if required header is missing
- Use TypeScript with strict typing: headers are optional, require explicit null checks
- Test: Send webhook without signature header; verify graceful 400 response

**Detection:**
- Code review: Check that header access is guarded by existence check
- Test: Pass request without signature header; verify no crash
- Linting: Flag direct property access on optional objects without guards

**Phase:** Error handling (Phase 1); test coverage (Phase 2)

---

### Pitfall 11: Failing Open on Missing or Misconfigured Secret

**What goes wrong:** If the webhook secret is missing (not set in env vars), code defaults to accepting all signatures.

```javascript
// WRONG - silent failure if secret is missing
const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
const computed = crypto.createHmac('sha256', secret).update(body).digest('hex');
// If secret is '', HMAC is computed with empty key; may still match if attacker guesses

// RIGHT - fail loudly
const secret = process.env.STRIPE_WEBHOOK_SECRET;
if (!secret) {
  throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
}
const computed = crypto.createHmac('sha256', secret).update(body).digest('hex');
```

**Why it happens:**
- Developers add defaults to avoid crashes during development
- The code runs but validates incorrectly
- Easy to miss during code review because it doesn't crash

**Consequences:**
- In production, if secret env var is forgotten, middleware accepts all webhooks (forged or legitimate)
- Security vulnerability: attacker can inject false events
- In tests, code may pass because secret is hardcoded or empty string
- Very hard to detect: no obvious errors, just wrong behavior

**Prevention:**
- Require secret to be configured; throw error if missing
- Check secret configuration at middleware setup time, not at request time
- Use environment validation at app startup: verify all required secrets are present
- Test: Run without setting env var; verify startup error (not silent acceptance)
- Document: "All three provider secrets are required; startup will fail if missing"

**Detection:**
- Code review: Verify no default values for secrets
- Test: Run app without setting env vars; verify error (not success)
- Linting: Flag `process.env.X || 'default'` patterns for secret-like variable names

**Phase:** Configuration validation (Phase 1); startup checks (Phase 1)

---

### Pitfall 12: Insufficient Test Coverage for Signature Validation

**What goes wrong:** Tests don't validate actual signatures, so bugs go undetected.

```javascript
// WRONG - test doesn't verify signature matches
app.post('/webhook', verifySignature, (req, res) => {
  // In tests, request has no signature header, middleware is skipped
  // or signature is hardcoded/mocked
});

test('webhook is accepted', async () => {
  const res = await request(app)
    .post('/webhook')
    .send({ some: 'data' });
  expect(res.status).toBe(200); // Passes even if verifySignature is broken
});

// RIGHT - test validates actual signature
test('webhook with valid signature is accepted', async () => {
  const body = JSON.stringify({ some: 'data' });
  const secret = 'test-secret';
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
  
  const res = await request(app)
    .post('/webhook')
    .set('X-Stripe-Signature', `t=1234,v1=${sig}`)
    .send(body);
  expect(res.status).toBe(200);
});

test('webhook with invalid signature is rejected', async () => {
  const res = await request(app)
    .post('/webhook')
    .set('X-Stripe-Signature', 't=1234,v1=badsignature')
    .send({ some: 'data' });
  expect(res.status).toBe(401);
});
```

**Why it happens:**
- Developers write happy-path tests and assume success
- Mocking the signature check is convenient and tests pass quickly
- Real signature generation requires knowing the secret and exact request format
- Integration tests are harder to set up than unit tests

**Consequences:**
- Critical signature validation bugs go undetected until production
- Weak timing-safe comparison bugs don't surface in unit tests
- Body-parser ordering issues don't appear until integration test
- Portfolio reviewers see weak test coverage and down-vote quality

**Prevention:**
- Write both unit tests (signature parsing) and integration tests (end-to-end)
- For each provider, test: valid signature, invalid signature, tampered body, missing header, wrong secret
- Use real provider test payloads and expected signatures from their documentation
- Test edge cases: truncated signature, multiple v1 segments, whitespace variations
- Test with wrong middleware ordering (body parsed before signature check)
- Ensure tests fail if you break the signature logic

**Detection:**
- Code review: Check test coverage; verify signature validation is tested
- Run mutation tests: flip bits in signature logic; verify tests catch the failures
- Coverage report: ensure signature validation code has 100% coverage

**Phase:** Unit tests (Phase 1); integration tests with real Express app (Phase 2); test payloads from providers (Phase 2)

---

### Pitfall 13: Confusing X-Shopify-Hmac-SHA256 Header with Signature in Body

**What goes wrong:** Assuming Shopify signature is in the request body (like some providers) instead of the header.

```javascript
// WRONG - Shopify signature is never in the body
const sig = JSON.parse(req.body).hmac; // undefined

// RIGHT - Shopify signature is in the header
const sig = req.headers['x-shopify-hmac-sha256'];
```

**Why it happens:**
- Some webhook providers encode metadata in the body
- Developers don't read Shopify docs carefully
- Copy-paste from examples for a different provider

**Consequences:**
- Signature is never found; validation always fails
- All Shopify webhooks are rejected

**Prevention:**
- Check documentation for exact header name
- Test with real Shopify webhook (via Shopify CLI) to verify header is sent
- Document in README where each provider's signature is located

**Detection:**
- Code review: Verify Shopify signature is read from header, not body
- Test: Log all headers in test; verify `x-shopify-hmac-sha256` is present and validated

**Phase:** Shopify validation (Phase 2)

---

### Pitfall 14: No Replay Protection Documentation

**What goes wrong:** Code implements Stripe's timestamp-window protection but doesn't document that GitHub and Shopify have no built-in replay protection.

```javascript
// WRONG - implies all providers have replay protection
const validationConfig = {
  stripe: { toleranceWindow: 300 },
  github: { toleranceWindow: 300 },    // GitHub has no timestamp!
  shopify: { toleranceWindow: 300 },   // Shopify has no timestamp!
};

// RIGHT - honest about what each provider supports
const validationConfig = {
  stripe: { 
    toleranceWindow: 300,
    note: 'Stripe signs with timestamp; full replay protection available' 
  },
  github: { 
    replayProtection: 'NOT SUPPORTED - provide X-GitHub-Delivery dedup in your app',
    note: 'GitHub provides delivery ID but no automatic dedup'
  },
  shopify: { 
    replayProtection: 'NOT SUPPORTED - implement your own delivery dedup',
    note: 'Shopify provides no timestamp; no automatic protection' 
  },
};
```

**Why it happens:**
- Stripe's docs emphasize timestamp verification; developers assume all providers have it
- GitHub and Shopify documentation are less prominent about this limitation
- Developers may not test replay scenarios for all three

**Consequences:**
- Users think they have replay protection on GitHub/Shopify when they don't
- Security review finds that middleware doesn't protect against replays for all providers
- Users are surprised to learn they need to implement their own dedup in the app
- Credibility is damaged: "The library claims to validate signatures; it should prevent replays"

**Prevention:**
- Document clearly: "Replay protection support varies by provider"
- Create a comparison table in README showing which providers have built-in replay protection
- For GitHub/Shopify, provide guidance on implementing delivery-ID dedup
- Never claim "full replay protection" unless all providers support it
- Mention in PITFALLS or FAQ: "Why doesn't GitHub/Shopify have replay protection?"

**Detection:**
- Code review: Check README for honest replay protection claims
- Tests: Verify replay scenarios are tested for all providers (especially missing for GitHub/Shopify)

**Phase:** Documentation (Phase 3); feature validation (Phase 2)

---

## Minor Pitfalls

Mistakes in this category are low risk but good practice to prevent.

### Pitfall 15: Gzip-Compressed Request Bodies

**What goes wrong:** Request body arrives gzip-compressed, but signature was computed on uncompressed bytes.

```javascript
// Rare but possible: some proxies compress webhook payloads
// Content-Encoding: gzip

// WRONG - compresses body again
const body = zlib.gzipSync(req.body);
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');

// RIGHT - provider signature is on uncompressed body, even if transport was gzipped
const body = req.body; // Express decompresses automatically if handler expects it
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
```

**Why it happens:**
- Gzip compression is usually transparent; Express decompresses automatically
- Developers might see `Content-Encoding: gzip` header and think body is still compressed
- Rare enough that it's not commonly tested

**Consequences:**
- If body is accidentally re-compressed, signature fails
- All webhooks fail if this scenario occurs

**Prevention:**
- Let Express handle decompression (it does by default)
- Understand that signature is always on the uncompressed logical body
- If body is provided as a Buffer, it's already decompressed
- Document: "Signature verification assumes uncompressed body"

**Detection:**
- Operational: Monitor webhook validation failures; if they coincide with gzip headers, investigate
- Test: Send gzip-compressed request; verify it validates correctly

**Phase:** Low priority; mention in advanced troubleshooting (Phase 3)

---

### Pitfall 16: TypeScript Type Exports and Dual ESM/CJS Publishing

**What goes wrong:** Types are not properly exported in package.json, breaking TypeScript imports in some projects.

```json
{
  "main": "dist/cjs/index.js",
  "module": "dist/esm/index.js",
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.js",
      "types": "./dist/esm/index.d.ts"  // WRONG - points to ESM types for both
    }
  }
}

// CORRECT
{
  "exports": {
    ".": {
      "types": "./dist/esm/index.d.ts",
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.js"
    }
  }
}
```

**Why it happens:**
- Dual package publishing is complex
- TypeScript type export configuration is error-prone
- Tools like tsup make it easier but require correct setup

**Consequences:**
- TypeScript projects can't import the library or get type errors
- CJS projects might get ESM types and vice versa
- Type checking fails in downstream projects
- Library appears broken for some TypeScript configurations

**Prevention:**
- Use a proven build tool: tsup with dual output configuration
- Test package.json exports against both ESM and CJS import scenarios
- Validate types with `npm install` in a test project; verify no type errors
- Include `.d.cts` (CommonJS types) and `.d.ts` (ESM types) in both output directories
- Test in GitHub Actions with multiple Node/TypeScript versions

**Detection:**
- TypeScript check: `tsc --noEmit` on downstream test projects
- Package validation: `npm pack` and inspect the tarball for proper type files
- CI: Run type checks in both ESM and CJS test projects

**Phase:** Packaging (Phase 3); CI validation (Phase 2)

---

### Pitfall 17: Missing peerDependencies for Express

**What goes wrong:** Express is listed as a regular dependency instead of peerDependency, causing duplicate Express installations.

```json
{
  "dependencies": {
    "express": "^4.18.0"  // WRONG - can cause two copies of Express
  }
}

// CORRECT
{
  "peerDependencies": {
    "express": "^4.18.0 || ^5.0.0"
  },
  "peerDependenciesMeta": {
    "express": { "optional": false }
  }
}
```

**Why it happens:**
- Developers want to ensure Express is installed
- Using a peerDependency requires users to install Express themselves
- Confusion about the difference between dependency and peerDependency

**Consequences:**
- Project has two copies of Express (one in node_modules, one in library's node_modules)
- Larger bundle size
- Potential issues if middleware instances don't match (version conflicts)
- npm 7+ warns about missing peerDependencies, confusing users

**Prevention:**
- Use peerDependencies for Express; it's a framework assumption, not a hidden dependency
- Specify range that includes Express 4.x and 5.x if compatible
- Document: "This library is for Express 4.x and above"
- Test against multiple Express versions in CI

**Detection:**
- Package.json review: Verify Express is in peerDependencies, not dependencies
- npm install: Check that npm warns about peerDependencies only, not conflicts
- Test: Verify library works with both Express 4.x and 5.x

**Phase:** Package setup (Phase 1); testing (Phase 2)

---

### Pitfall 18: Middleware That Breaks Non-Webhook Routes

**What goes wrong:** Signature validation middleware is global and rejects requests that don't have signature headers.

```javascript
// WRONG - breaks all routes
app.use(verifyStripeSignature); // Applied globally
app.get('/health', (req, res) => res.json({ ok: true })); // Returns 401

// RIGHT - apply only to webhook routes
app.post('/webhook/stripe', verifyStripeSignature, (req, res) => {
  // Only this route is validated
});

app.get('/health', (req, res) => res.json({ ok: true })); // Works normally
```

**Why it happens:**
- Developers apply middleware globally for convenience
- Don't realize it affects all routes
- Early code organization mistakes that propagate

**Consequences:**
- Health checks, status endpoints, and other non-webhook routes fail
- Load balancers think app is down
- Monitoring systems alert false positive
- App appears broken

**Prevention:**
- Always mount signature middleware on specific routes, not globally
- Provide a wrapper function that makes mounting easy: `app.use('/webhook/stripe', verifyStripeSignature(config))`
- Document in README with examples: "Mount middleware per provider"
- Test: Verify health check succeeds without signature header

**Detection:**
- Code review: Verify middleware is not in a global `app.use()` call
- Test: Call non-webhook route; verify it succeeds without signature header

**Phase:** Middleware design (Phase 1); example app (Phase 3)

---

## Phase-Specific Warnings

| Phase | Topic | Likely Pitfall | Mitigation |
|-------|-------|---------------|-----------|
| Phase 1: Core | Signature comparison | Naive `===` instead of timing-safe | Add test that validates timing-safe comparison required |
| Phase 1: Core | Buffer/string handling | Mismatched types to `timingSafeEqual()` | Helper function with type validation |
| Phase 1: Core | Body handling | Parse before signature check | Test with `express.raw()` and `.rawBody` |
| Phase 1: Core | Secret configuration | Missing env var accepted silently | Startup validation; fail loudly if unconfigured |
| Phase 1: Core | Test coverage | Mocked signatures; real bugs hidden | Require actual signature generation in tests |
| Phase 2: Providers | Stripe timestamp | Tolerance too wide/narrow | Test at edge boundaries; default to 300s |
| Phase 2: Providers | Stripe multiple v1 | Only first v1= checked | Parse and validate all v1 segments |
| Phase 2: Providers | GitHub encoding | SHA-1 instead of SHA-256 | Linting rule; flag x-hub-signature (deprecated) |
| Phase 2: Providers | Shopify base64 | Hex instead of base64 encoding | Test against real Shopify test payload |
| Phase 2: Providers | Replay protection | False claim for GitHub/Shopify | Document per-provider support clearly |
| Phase 3: DX | Packaging | Broken TypeScript imports | Test exports in ESM and CJS projects |
| Phase 3: DX | Packaging | Express in dependencies | Verify peerDependencies is used |
| Phase 3: DX | Documentation | Insufficient examples | Provide working Express app with all three providers |

---

## Sources

- [Webhook HMAC Validation – EasyPost Support](https://support.easypost.com/hc/en-us/articles/39826034964237-Webhook-HMAC-Validation)
- [Webhook Security Guide: HMAC Signatures & Replay Protection | Hooklistener](https://www.hooklistener.com/learn/webhook-security-fundamentals)
- [Validating webhook deliveries - GitHub Docs](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [Webhook Signature Verification: Complete Security Guide](https://inventivehq.com/blog/webhook-signature-verification-guide)
- [Webhook Security Vulnerabilities Guide](https://hookdeck.com/webhooks/guides/webhook-security-vulnerabilities-guide)
- [Webhook Security Best Practices: Signatures, Replay Protection, and Secret Rotation | Hooque](https://hooque.io/guides/webhook-security/)
- [HMAC Secrets Explained: Authentication You Can Actually Implement](https://blog.gitguardian.com/hmac-secrets-explained-authentication/)
- [Receive Stripe events in your webhook endpoint | Stripe Documentation](https://docs.stripe.com/webhooks)
- [Resolve webhook signature verification errors | Stripe Documentation](https://docs.stripe.com/webhooks/signature)
- [Stripe Webhook Signature Verification Failed: Common Causes and Fixes](https://hooknexus.com/learn/stripe-webhook-signature-verification-failed/)
- [Handling Payment Webhooks Reliably (Idempotency, Retries, Validation)](https://medium.com/@sohail_saifii/handling-payment-webhooks-reliably-idempotency-retries-validation-69b762720bf5)
- [Webhook Security: How to Verify Incoming Requests with HMAC Signatures - DEV Community](https://dev.to/snappy_tools/webhook-security-how-to-verify-incoming-requests-with-hmac-signatures-2d)
- [Validate Stripe Webhook Signatures using request raw body - YepCode Blog](https://yepcode.io/blog/validate-stripe-webhook-signatures/)
- [Webhook Signature Verification (HMAC-SHA256) in Node, Python, Ruby — 2026 Guide | HookRay](https://hookray.com/blog/webhook-signature-verification-2026)
- [Stripe Webhooks: Complete Implementation Guide (2026) — Node.js, PHP & Python | Hooklistener](https://www.hooklistener.com/learn/stripe-webhooks-implementation)
- [Unable to validate X-Hub-Signature-256 from webhook · community · Discussion #24646](https://github.com/orgs/community/discussions/24646)
- [Best practice for securely validating GitHub webhook payloads in a REST API service · community · Discussion #182735](https://github.com/orgs/community/discussions/182735)
- [Intercepting Raw HTTP Request Bodies: Ensuring Security and Authenticity in Webhooks and API Integrations](https://stenzr.medium.com/intercepting-raw-http-request-bodies-ensuring-security-and-webhooks-api-3b365b8a795b)
- [GitHub - compwright/x-hub-signature-middleware: X-Hub-Signature webhook verification middleware for Express and Node.js](https://github.com/compwright/x-hub-signature-middleware)
- [Troubleshooting webhooks - GitHub Docs](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/troubleshooting-webhooks)
- [How do I implement HMAC signature for webhook verification in a Remix](https://community.shopify.com/t/how-do-i-implement-hmac-signature-for-webhook-verification-in-a-remix-run-app/316010)
- [Issue Verifying Webhook HMAC from Shopify - Webhooks and Events - Shopify Developer Community Forums](https://community.shopify.dev/t/issue-verifying-webhook-hmac-from-shopify/16928)
- [Verifying Your Shopify Webhooks in Next.js APIs - John Schmidt](https://johnschmidt.de/post/verifying-shopify-webhooks-in-serverless-functions)
- [Implementing Secure Shopify Webhooks with HMAC Verification and Queue Processing (Node.js & Python Guide) - DEV Community](https://dev.to/lucy1/implementing-secure-shopify-webhooks-with-hmac-verification-and-queue-processing-nodejs-python-59p1)
- [Shopify webhooks: HMAC validation on NodeJS Express](https://medium.com/@jophin.joseph88/shopify-webhooks-hmac-validation-on-nodejs-express-ac66bc288e3e)
- [Implement an HMAC signature to verify webhooks - Authentication & Access - Shopify Developer Community Forums](https://community.shopify.dev/t/implement-an-hmac-signature-to-verify-webhooks/7915)
- [Why Shopify Webhook HMAC Verification Keeps Failing - DEV Community](https://dev.to/prateek32177/why-shopify-webhook-hmac-verification-keeps-failing-4i80)
- [Enhancing Request Body Parsing in Express.js: Handling JSON and Raw Body](https://medium.com/@sbrsubuvga/enhancing-request-body-parsing-in-express-js-handling-json-and-raw-body-c765bb28b174)
- [Express.js express.raw() Function - GeeksforGeeks](https://www.geeksforgeeks.org/express-js-express-raw-function/)
- [How to access Raw Body of a Post Request in Express.js?](https://www.geeksforgeeks.org/node-js/how-to-access-raw-body-of-a-post-request-in-express-js/)
- [Using timingSafeEqual · Cloudflare Workers docs](https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks/)
- [crypto.timingSafeEqual is not really time safe? · Issue #17178 · nodejs/node](https://github.com/nodejs/node/issues/17178)
- [How to properly use crypto.timingSafeEqual(a, b)? · Issue #39 · jshttp/basic-auth](https://github.com/jshttp/basic-auth/issues/39)
- [Timing Attacks in Node.js - DEV Community](https://dev.to/silentwatcher_95/timing-attacks-in-nodejs-4pmb)
- [Node.js - Guarding Against Timing Attacks: How crypto.timingSafeEqual() Protects Your Secrets](https://runebook.dev/en/articles/node/crypto/cryptotimingsafeequala-b)
- [Constant-time comparison of strings in Node | Simon Willison's TILs](https://til.simonwillison.net/node/constant-time-compare-strings)
- [How to use crypto.timingSafeEqual with strings](https://evanhahn.com/crypto-timingsafeequal-with-strings/)
- [Common Webhook Errors and How to Fix Them (2025 Guide) | WebhookDebugger](https://www.webhookdebugger.com/blog/common-webhook-errors-and-how-to-fix-them)
- [Debugging Stripe Webhook Signature Verification Errors in Production - DEV Community](https://dev.to/nerdincode/debugging-stripe-webhook-signature-verification-errors-in-production-1h7c)
- [Debugging Invalid Webhook Signatures | by Sachin Mittal | Medium](https://sachinmittal98.medium.com/debugging-invalid-webhook-signatures-9e92017ea548)
- [Webhook Signature Verification](https://developers.anduintransact.com/docs/webhook-signature-verification)
- [The importance of verifying webhook signatures | Snyk](https://snyk.io/blog/verifying-webhook-signatures/)
- [The Webhook Failure Modes Nobody Warns You About - DEV Community](https://dev.to/jamesbrown/the-webhook-failure-modes-nobody-warns-you-about-346m)
- [Webhook signature verification and bodyParser.json issue · Issue #341 · stripe/stripe-node](https://github.com/stripe/stripe-node/issues/341)
- [Building a Robust Webhook Handler in Node.js: Validation, Queuing, and Retry Logic](https://blog.ozigi.app/blog/robust-webhook-handler-in-nodejs)
- [Stripe Webhook Signature Mismatch: Why the Stripe-Signature Header Never Matches and How to Fix It in 2026](https://copyprogramming.com/howto/the-stripe-signature-header-never-matches)
- [Webhook signature verification for stripe: Are you passing raw request body received from stripe?](https://sukhadagholb.medium.com/webhook-signature-verification-for-stripe-are-you-passing-raw-request-body-received-from-stripe-3b2deed6a75d)
- [Why your API responses look like gibberish: the gzip decompression trap](https://www.zyte.com/learn/why-your-api-responses-look-like-gibberish-the-gzip-decompression-trap/)
- [Publishing dual ESM+CJS packages - Mayank](https://mayank.co/blog/dual-packages/)
- [Dual Publishing ESM and CJS Modules with tsup and Are the Types Wrong?](https://johnnyreilly.com/dual-publishing-esm-cjs-modules-with-tsup-and-are-the-types-wrong/)
- [Building an npm package compatible with ESM and CJS in 2024 | Snyk](https://snyk.io/blog/building-npm-package-compatible-with-esm-and-cjs-2024/)
- [Building an npm package compatible with ESM and CJS in 2024 - DEV Community](https://dev.to/snyk/building-npm-package-compatible-with-esm-and-cjs-88m)
- [Building and Publishing a Dual-Package NPM Module | Leapcell](https://leapcell.io/blog/building-and-publishing-a-dual-package-npm-module)
- [Publishing ESM Packages - npm, Dual Package & Exports Guide](https://esmodules.com/publishing/)
- [Ship ESM & CJS in one Package](https://antfu.me/posts/publish-esm-and-cjs)
- [GitHub Webhooks: Complete Guide with Event Examples](https://www.magicbell.com/blog/github-webhooks-guide)
- [Guide to GitHub Webhooks Features and Best Practices](https://hookdeck.com/webhooks/platforms/guide-github-webhooks-features-and-best-practices)
- [Best practices for using webhooks - GitHub Docs](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)
- [Clarify that X-GitHub-Delivery is unique per event, not per delivery · Issue #32822 · github/docs](https://github.com/github/docs/issues/32822)
- [Shopify Webhooks - ngrok documentation](https://ngrok.com/docs/integrations/webhooks/shopify-webhooks)
- [Deliver webhooks through HTTPS - Shopify Docs](https://shopify.dev/docs/apps/build/webhooks/subscribe/https)
- [Use the Stripe CLI | Stripe Documentation](https://docs.stripe.com/stripe-cli/use-cli)
