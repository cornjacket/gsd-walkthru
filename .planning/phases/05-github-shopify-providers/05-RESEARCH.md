# Phase 5: GitHub & Shopify Providers - Research

**Researched:** 2026-05-08
**Domain:** HMAC-SHA256 webhook signature validation for GitHub (`X-Hub-Signature-256`, hex) and Shopify (`X-Shopify-Hmac-Sha256`, base64), plus exposure of provider-specific dedup metadata (`X-GitHub-Delivery`, `X-Shopify-Topic`, `X-Shopify-Webhook-Id`) on `req.webhook`.
**Confidence:** HIGH

## Summary

Phase 5 fills the throwing stubs at `src/providers/github.ts` and `src/providers/shopify.ts` with real signature validators that mirror the Phase 4 Stripe template, with three structural differences: (1) the HMAC input is `req.rawBody` Buffer directly (no timestamp prefix, no UTF-8 round-trip — D-07), (2) GitHub decodes the header via hex while Shopify decodes via base64 (the encoding fork is the entire reason these two providers can't share a body) and (3) post-auth metadata population is lenient — missing or array-shaped metadata headers degrade to `''` rather than failing validation (D-08, D-09). The phase ships zero new public exports, zero `WebhookValidationReason` widenings, and zero changes outside `src/providers/{github,shopify}.{ts,test.ts}`.

The corrective work over Phase 4 is targeted: the WR-03 three-way auth-header split (`undefined → 'missing_header'`, `array → 'invalid_signature_format'`, `parses-but-no-match → 'signature_mismatch'`) is implemented from day one for both providers (D-10). Phase 4's stripe.ts retains the WR-03 defect for the Phase 6 audit pass to fold back. WR-02's vacuous-pass test pattern is also corrected from day one — every test that asserts a thrown reason wraps the call in `expect(() => ...).toThrow(WebhookValidationError)` before introspecting `.reason`/`.statusCode`.

The Shopify hex-as-base64 rejection path (SC3's binding negative case) leans on a structural property verified in this research: `Buffer.from(<64 hex chars>, 'base64')` produces a 48-byte buffer (not 32), so the Phase 2 D-09 length-mismatch path inside `timingSafeCompare` returns `false` and the validator throws `'signature_mismatch'`. No regex pre-check, no new reason — the existing primitive does the work.

**Primary recommendation:** Implement both `validate()` bodies as 8-step pipelines that copy the Phase 4 stripe.ts shape verbatim except for steps 3 (no signature-format parser for GitHub beyond `sha256=` prefix; none at all for Shopify), step 4 (HMAC input is `req.rawBody` Buffer directly), step 5 (GitHub does `Buffer.from(hex, 'hex')`; Shopify does `Buffer.from(value, 'base64')`), and step 6 (read provider-specific metadata headers with the D-09 array-aware extractor). Tests mirror `stripe.test.ts`'s fixture-builder + outer-toThrow-guard shape. Total scope: 4 file changes (two replacements, two new test files).

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01: SHA-1-only request → `'missing_header'`.** Validator only looks at `x-hub-signature-256`. SHA-1 header is invisible. Do NOT widen the union with `'unsupported_algorithm'`. Do NOT map to `'invalid_signature_format'`.
- **D-02: Validator reads `x-hub-signature-256` only; `x-hub-signature` is invisible.** Both-header case → silently use SHA-256, ignore SHA-1. Do NOT actively detect-and-reject the deprecated header.
- **D-03: GitHub header parse failures → `'invalid_signature_format'`.** Missing/wrong `sha256=` prefix OR non-hex tail → throw `'invalid_signature_format'`. Do NOT fold to `'signature_mismatch'`.
- **D-04: GitHub uses `Buffer.from(hex, 'hex')` ↔ `Buffer` digest comparison via `timingSafeCompare`.** Mirrors Phase 4 D-13 stripe pattern verbatim.
- **D-05: Hex-in-base64-header → `'signature_mismatch'`.** A hex digest in `X-Shopify-Hmac-Sha256` decodes to 48 bytes via `Buffer.from(hex, 'base64')`; length-mismatch in `timingSafeCompare` → `'signature_mismatch'`. Do NOT widen with `'invalid_encoding'`.
- **D-06: Shopify base64 decode is loose.** `Buffer.from(headerValue, 'base64')` directly; no length/alphabet pre-check. Trust D-09 length-mismatch.
- **D-07: GitHub & Shopify pass `req.rawBody` Buffer directly to `computeHmac`.** No `.toString('utf8')` round-trip. Stripe stays on `${t}.${rawBody.toString('utf8')}`.
- **D-08: Missing/empty metadata header AFTER signature passes → field set to `''`, validation proceeds.** Mirrors P4 D-09 missing-id pattern.
- **D-09: Array-shaped metadata header → take `[0] || ''`.**
- **D-10: Phase 5 auth-header guards split missing vs duplicate from day one.** `header === undefined` → `'missing_header'`; `typeof header !== 'string'` (array) → `'invalid_signature_format'`; parses-but-no-match → `'signature_mismatch'`.
- **D-11: `eventId` per provider:** Stripe = `body.id` (locked); GitHub = `deliveryId`; Shopify = `webhookId`.
- **D-12: GitHub & Shopify `timestamp = Math.floor(Date.now() / 1000)` at validation time.** Receipt timestamp; honest about no provider-signed timestamp.
- **D-13: GitHub & Shopify JSON.parse `rawBody` after signature passes** (mirrors P4 D-08 step 7). Step order documented in CONTEXT.md.
- **D-14: Co-located unit tests at `src/providers/{github,shopify}.test.ts`** with the test scope enumerated in CONTEXT.md.
- **D-15: Express normalizes header keys to lowercase.** Read all headers via lowercase keys.
- **D-16: No reachability smoke test changes.** Phase 5 adds ZERO reasons; `src/index.test.ts`, `src/errors.ts`, `src/errors.test.ts` are untouched.
- **D-17: Phase 5 modifies / creates exactly:** `src/providers/github.ts` (replace stub validate body), `src/providers/github.test.ts` (NEW), `src/providers/shopify.ts` (replace stub validate body), `src/providers/shopify.test.ts` (NEW). Nothing else.

### Claude's Discretion

- Internal file split inside `src/providers/`: monolithic vs split (`github-parse.ts`, `shopify-parse.ts`). Both fine; planner picks based on file size.
- Helper-function naming: `parseGitHubSignature(header)` vs `extractGitHubHexDigest(header)`. Either; tests are the contract.
- Whether to define a tiny shared `extractFirstValue(h: string | string[] | undefined): string` helper for D-09. Both fine; lean toward inline duplication if total uses ≤ 5.
- `crypto.timingSafeEqual` direct vs Phase 2 `timingSafeCompare`. Lean toward `timingSafeCompare` (P2 D-09 length-mismatch safety).
- Test fixture style: straight `it` blocks vs `it.each`. Phase 4 uses straight `it` — same shape recommended for consistency.
- Test fixture sharing between `github.test.ts` and `shopify.test.ts` (sibling fixtures file vs inline duplication). Lean toward inline duplication (test files stay self-contained).

### Deferred Ideas (OUT OF SCOPE)

- `'invalid_encoding'` reason for Shopify — explicitly rejected in D-05.
- Active SHA-1 detection / reject — explicitly rejected in D-02.
- Strict base64 alphabet pre-check on Shopify header — explicitly rejected in D-06.
- Phase 4 WR-03 fix for stripe.ts — Phase 6 audit territory.
- Phase 4 WR-01 (NaN tolerance), WR-04 (default-tolerance literal), WR-05 (parseInt timestamp leniency) — Stripe-specific; Phase 6 audit.
- Phase 4 WR-02 fix in stripe.test.ts — Phase 6 audit territory.
- Phase 4 IN-04 (tolerance positionally passed) — confirmed and absorbed: GitHub & Shopify accept `_toleranceSeconds?: number` and silently ignore.
- Provider interface widening to options object — DX-01..DX-03 v2 territory.
- Async secret resolution / custom logging hook / per-route typed handlers — REQUIREMENTS.md DX-01..DX-03; v2.
- Slack/Twilio/generic HMAC providers — REQUIREMENTS.md PROV-01..PROV-03; v2.
- Coverage gate (>90%), cross-cutting Supertest suite, negative-case audit — Phase 6.
- README per-provider quickstart, replay-protection caveats prose, runnable example app — Phase 7.
- Cloudflare Workers / Edge runtime, npm publishing — v2.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GHUB-01 | Validate GitHub HMAC-SHA256 signature from `X-Hub-Signature-256` | Header format `sha256=<hex>` confirmed via Pitfall 9, FEATURES.md, and official GitHub webhooks docs (verified 2026-05-08); 64-char hex tail decodes to 32 bytes via `Buffer.from(hex, 'hex')`; HMAC input is raw body bytes only. Implementation pattern in Pattern 1 below. |
| GHUB-02 | Do not accept deprecated `X-Hub-Signature` (SHA-1) — explicitly reject or ignore | D-01 binds the "ignore" interpretation: validator reads only `x-hub-signature-256`; SHA-1-only requests fail with `'missing_header'` (the SHA-256 header is absent). GitHub still sends both today (verified via official docs 2026-05-08), so D-02 silently uses SHA-256 when both arrive. |
| GHUB-03 | Surface `X-GitHub-Delivery` ID in `req.webhook` for downstream dedup | `X-GitHub-Delivery` is a 36-char GUID per official docs (e.g., `72d3162e-cc78-11e3-81ab-4c9367dc0958`); D-08 binds missing → `''`; D-09 binds array → `[0] || ''`; D-11 binds `eventId === deliveryId`. |
| SHOP-01 | Validate Shopify HMAC-SHA256 signature from `X-Shopify-Hmac-Sha256` using **base64** decoding (not hex) | Base64 encoding confirmed via Pitfall 8, FEATURES.md, and Shopify HTTPS docs (verified 2026-05-08); 32-byte digest → 44-char base64 string with `=` padding (verified via `node -e` test below); D-05 hex-as-base64 path produces 48-byte decode; D-06 loose decode trusts P2 D-09 length-mismatch. |
| SHOP-02 | Surface `X-Shopify-Topic` and `X-Shopify-Webhook-Id` in `req.webhook` for downstream use | Topic values are slash-delimited identifiers (e.g., `products/create`, `orders/create`) per Shopify docs; webhook-id is a unique-per-store identifier (format spec not strict — letters/numbers per Shopify community); D-08/D-09 lenient population; D-11 `eventId === webhookId`. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| GitHub HMAC validation | API / Backend | — | Provider owns signature verification; uses Phase 2 `computeHmac()` + `timingSafeCompare()` |
| Shopify HMAC validation | API / Backend | — | Same; only differs at the encoding boundary (`Buffer.from(value, 'base64')` vs `'hex'`) |
| Header parsing (`sha256=` prefix strip + hex check) | API / Backend | — | Provider-internal; no shared header-parser layer |
| Metadata header extraction (D-09 array-aware) | API / Backend | — | Provider-internal; lives inside each `validate()` body or a tiny shared helper |
| Receipt-timestamp generation (D-12) | API / Backend | — | Provider sets `Math.floor(Date.now()/1000)` at validation success time |
| JSON body parsing (post-signature) | API / Backend | — | Provider runs `JSON.parse(rawBody.toString('utf8'))` AFTER auth (D-13 step 7) |
| Cross-branch `eventId` semantic mapping (D-11) | API / Backend | — | Provider assigns `eventId = deliveryId` (GitHub) / `eventId = webhookId` (Shopify); consumers read `req.webhook.eventId` without narrowing |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `crypto` (built-in) | Node 20/22/24 | HMAC-SHA256 + constant-time compare (via Phase 2 wrappers) | No external crypto deps per PROJECT.md "no vendor SDKs"; native `createHmac` + `timingSafeEqual` are battle-tested. |
| Express (peer) | `4.x \|\| 5.x` | Request handling | Phase 1 D-13 locks peerDependency only. Headers normalized to lowercase by Express convention (D-15). |
| TypeScript | 6.x | Type safety, strict mode | Phase 1 D-15 locked. |

### Supporting (project-internal — DO NOT re-implement)
| Module | Phase Origin | Purpose | When to Use in Phase 5 |
|--------|--------------|---------|-----------------------|
| `src/crypto/hmac.ts` (`computeHmac`) | Phase 2 D-01 | HMAC-SHA256 over `Buffer \| string`, returns 32-byte raw `Buffer` digest | Both providers call `computeHmac(req.rawBody, secret, 'sha256')` (D-07). No `.toString('utf8')` round-trip — pass Buffer directly. |
| `src/crypto/compare.ts` (`timingSafeCompare`) | Phase 2 D-09 | Length-guarded constant-time `Buffer` ↔ `Buffer` comparison; returns `false` on length mismatch (no throw) | Both providers call `timingSafeCompare(decodedHeaderBuffer, computedDigest)`. The length-mismatch path is what makes D-05's hex-in-base64 case reject naturally as `'signature_mismatch'`. |
| `src/errors.ts` (`WebhookValidationError`, `WebhookValidationReason`, `messageFor`) | Phase 2 D-05/D-06/D-11 | Discriminated error class; reason union locked at 6 members after Phase 4 | Both providers throw `new WebhookValidationError({ reason, provider, statusCode })` for every failure path. NO new reasons in Phase 5. |
| `src/providers/registry.ts` (`registerProvider`) | Phase 3 D-01/D-03 | Registry lookup; self-registration on import | Phase 5's `github.ts` and `shopify.ts` keep their existing `registerProvider('github', ...)` / `('shopify', ...)` calls at file bottom. |
| `src/providers/types.ts` (`Provider` interface) | Phase 3 D-01 | Contract for `validate(req, secret)` | Phase 5 satisfies, does NOT widen. The 3rd `_toleranceSeconds?: number` arg is silently accepted (Phase 4 IN-04). |

### Alternatives Considered (and rejected)
| Instead of | Could Use | Why we don't |
|------------|-----------|--------------|
| Hand-rolled `Buffer.from(hex, 'hex')` + `timingSafeCompare` | `crypto.timingSafeEqual` directly | Phase 2 D-09 length-safety wraps `timingSafeEqual` and the Stripe provider already uses this primitive. Direct use bypasses the length-mismatch defense for malformed-but-prefix-stripped GitHub hex. Per Claude's Discretion: lean `timingSafeCompare`. |
| Active SHA-1 rejection in GitHub (read `x-hub-signature` and reject) | Detect-and-reject pattern | D-02 explicitly rejects this. GitHub still sends both headers in normal traffic (verified 2026-05-08 via official docs); active rejection breaks legitimate webhooks. |
| Strict `/^[A-Za-z0-9+/]+={0,2}$/` pre-check on Shopify base64 | Regex gate before decode | D-06 rejects. Hex chars are also valid base64-alphabet, so the regex doesn't actually screen the hex case; the length-mismatch path already does. |
| New reason `'invalid_encoding'` for Shopify hex case | Union widening | D-05 explicitly rejects. SC3's "rejected" criterion is satisfied by `'signature_mismatch'`; widening means messageFor entry, same-commit test, index reachability test — all unjustified. |
| `@octokit/webhooks` for GitHub validation | Vendor library | PROJECT.md "no vendor SDK dependencies". |

**Installation:** No new packages. Phase 5 adds zero `dependencies`/`devDependencies`. The phase is pure code/test changes against the existing stack.

**Version verification:** No new packages to verify. Existing stack (Vitest 4.x, tsup, TypeScript 6.x) was version-locked in Phase 1 and remains green per Phase 4 verification (86/86 tests passing). [VERIFIED: existing package.json + Phase 4 04-VERIFICATION.md].

## Architecture Patterns

### System Architecture Diagram

```
HTTP request arrives at Express app
    |
    v
Raw-body capture middleware (Phase 3) — populates req.rawBody as Buffer
    |
    v
createWebhookMiddleware('github' | 'shopify', { secret })  ← Phase 3 factory
    |
    v
provider.validate(req, secret, _tolerance?)   ← Phase 5 implementation entry
    |
    +-- 1. rawBody guard
    |     undefined? → throw WebhookValidationError({ reason: 'malformed_payload', statusCode: 400 })
    |
    +-- 2. Auth header read
    |     req.headers['x-hub-signature-256']        (GitHub)
    |     req.headers['x-shopify-hmac-sha256']      (Shopify)
    |     |
    |     +-- header === undefined        → throw 'missing_header' (401)
    |     +-- typeof header !== 'string'  → throw 'invalid_signature_format' (401)   ← D-10 from day one
    |
    +-- 3. GitHub-only — header parse
    |     |
    |     +-- doesn't start with 'sha256='   → throw 'invalid_signature_format' (401)
    |     +-- tail not /^[0-9a-f]+$/         → throw 'invalid_signature_format' (401)
    |     (Shopify skips — base64 decode is loose per D-06)
    |
    +-- 4. computeHmac(req.rawBody, secret, 'sha256')   ← Buffer in, 32-byte Buffer digest out
    |     (NO `.toString('utf8')` round-trip — D-07)
    |     (NO `${t}.` prefix — neither provider signs a timestamp)
    |
    +-- 5. Decode header value to Buffer
    |     |  GitHub:  Buffer.from(headerHex, 'hex')           → 32 bytes (or fewer if malformed; caught by step 5b)
    |     |  Shopify: Buffer.from(headerValue, 'base64')      → 32 bytes if valid; 48 bytes if hex was passed (D-05)
    |     |
    |     5b. timingSafeCompare(decoded, computed)
    |          → false → throw 'signature_mismatch' (401)
    |          → true  → proceed
    |
    +-- 6. Read metadata headers (post-auth, lenient per D-08, D-09)
    |     |  GitHub:  X-GitHub-Delivery        → deliveryId
    |     |  Shopify: X-Shopify-Topic          → topic
    |     |           X-Shopify-Webhook-Id     → webhookId
    |     |
    |     extractFirstValue helper:
    |        Array.isArray(h) ? (h[0] || '') : (typeof h === 'string' ? h : '')
    |
    +-- 7. JSON.parse(req.rawBody.toString('utf8'))
    |     parse fails → throw 'malformed_payload' (400)
    |     (Runs ONLY on authenticated bytes — DoS defense)
    |
    +-- 8. Build branch type and return
          GitHub:  { provider: 'github',  eventId: deliveryId, timestamp: now, parsed, deliveryId }
          Shopify: { provider: 'shopify', eventId: webhookId,  timestamp: now, parsed, topic, webhookId }
                                                        ↑
                                            Math.floor(Date.now()/1000)  (D-12 receipt timestamp)

    Returns to middleware (Phase 3):
        req.webhook = metadata
        next()  ← consumers' route handler runs with typed req.webhook narrowed by `provider` discriminator
```

### Recommended Project Structure

No directory changes. The 4 file modifications stay inside `src/providers/`:

```
src/providers/
├── github.ts         # REPLACE validate() body — Phase 5
├── github.test.ts    # NEW — Phase 5
├── shopify.ts        # REPLACE validate() body — Phase 5
└── shopify.test.ts   # NEW — Phase 5
```

Untouched (locked):
- `src/providers/types.ts` (Provider interface)
- `src/providers/registry.ts` (registerProvider / getProvider)
- `src/providers/stripe.ts`, `src/providers/stripe.test.ts` (Phase 4 retains WR-03 defect for Phase 6)
- `src/crypto/hmac.ts`, `src/crypto/compare.ts`
- `src/errors.ts`, `src/errors.test.ts`
- `src/middleware.ts`, `src/middleware.test.ts`
- `src/error-handler.ts`, `src/error-handler.test.ts`
- `src/types.ts`, `src/index.ts`, `src/index.test.ts`
- `src/raw-body/` (entire directory)

### Pattern 1: GitHub Validator Skeleton

**What:** Replacement for the stub `validate()` body in `src/providers/github.ts`. 8 steps, top-to-bottom, no early break in any compare loop (single-segment compare for GitHub, so no loop here — the no-early-break Stripe pattern doesn't apply).

**When to use:** The single body of `githubProvider.validate(req, secret)`. Helper `extractFirstValue` may be inlined or hoisted as a private file-level function.

**Code shape:**

```typescript
// Source: Phase 4 stripe.ts pattern + CONTEXT D-01..D-13; verified against
//         GitHub webhooks docs (2026-05-08): X-Hub-Signature-256 = "sha256=<hex>"
import type { Request } from 'express';
import { computeHmac } from '../crypto/hmac.js';
import { timingSafeCompare } from '../crypto/compare.js';
import { WebhookValidationError } from '../errors.js';
import { registerProvider } from './registry.js';
import type { Provider } from './types.js';

export type GitHubWebhook = {
  provider: 'github';
  eventId: string;
  timestamp: number;
  parsed: unknown;
  deliveryId: string;
};

/**
 * D-09 array-aware extractor for metadata headers (post-auth).
 * NOT used for the auth header — that uses the strict D-10 split.
 */
function extractFirstValue(h: string | string[] | undefined): string {
  if (Array.isArray(h)) return h[0] || '';
  if (typeof h === 'string') return h;
  return '';
}

const githubProvider: Provider = {
  name: 'github',
  validate(req: Request, secret: string, _toleranceSeconds?: number): GitHubWebhook {
    // Step 1 — rawBody guard (Phase 3 D-07)
    if (!req.rawBody) {
      throw new WebhookValidationError({
        reason: 'malformed_payload',
        provider: 'github',
        statusCode: 400,
      });
    }

    // Step 2 — Auth header three-way split (D-10, fixes Phase 4 WR-03 from day one)
    const header = req.headers['x-hub-signature-256'];
    if (header === undefined) {
      throw new WebhookValidationError({
        reason: 'missing_header',
        provider: 'github',
        statusCode: 401,
      });
    }
    if (typeof header !== 'string') {
      // Array (duplicate headers per RFC 7230) — present but unparseable
      throw new WebhookValidationError({
        reason: 'invalid_signature_format',
        provider: 'github',
        statusCode: 401,
      });
    }

    // Step 3 — Parse `sha256=<hex>` (D-03)
    if (!header.startsWith('sha256=')) {
      throw new WebhookValidationError({
        reason: 'invalid_signature_format',
        provider: 'github',
        statusCode: 401,
      });
    }
    const headerHex = header.slice('sha256='.length);
    if (headerHex.length === 0 || !/^[0-9a-f]+$/i.test(headerHex)) {
      throw new WebhookValidationError({
        reason: 'invalid_signature_format',
        provider: 'github',
        statusCode: 401,
      });
    }

    // Step 4 — Compute HMAC over rawBody Buffer directly (D-07)
    const computed = computeHmac(req.rawBody, secret, 'sha256');

    // Step 5 — Constant-time compare (D-04)
    const headerBuf = Buffer.from(headerHex, 'hex');
    if (!timingSafeCompare(headerBuf, computed)) {
      throw new WebhookValidationError({
        reason: 'signature_mismatch',
        provider: 'github',
        statusCode: 401,
      });
    }

    // Step 6 — Lenient metadata read (D-08, D-09)
    const deliveryId = extractFirstValue(req.headers['x-github-delivery']);

    // Step 7 — JSON.parse AFTER auth (D-13 step 7)
    let parsed: unknown;
    try {
      parsed = JSON.parse(req.rawBody.toString('utf8'));
    } catch {
      throw new WebhookValidationError({
        reason: 'malformed_payload',
        provider: 'github',
        statusCode: 400,
      });
    }

    // Step 8 — Build branch type (D-11 eventId, D-12 timestamp)
    return {
      provider: 'github',
      eventId: deliveryId,                          // D-11
      timestamp: Math.floor(Date.now() / 1000),     // D-12 receipt timestamp
      parsed,
      deliveryId,
    };
  },
};

registerProvider('github', githubProvider);
```

**Source:** Phase 4 `src/providers/stripe.ts` pattern (adapted); GitHub webhook docs verified [VERIFIED: official GitHub docs, https://docs.github.com/en/webhooks/webhook-events-and-payloads, 2026-05-08].

### Pattern 2: Shopify Validator Skeleton

**What:** Replacement for the stub `validate()` body in `src/providers/shopify.ts`. Same 8-step shape as GitHub except (a) no signature-format parser (loose base64 decode per D-06), (b) two metadata headers instead of one, (c) `eventId === webhookId` mapping.

**Code shape:**

```typescript
// Source: Phase 4 stripe.ts pattern + CONTEXT D-05..D-13; verified against
//         Shopify HTTPS webhook docs (2026-05-08): X-Shopify-Hmac-Sha256 = base64(HMAC-SHA256(rawBody))
import type { Request } from 'express';
import { computeHmac } from '../crypto/hmac.js';
import { timingSafeCompare } from '../crypto/compare.js';
import { WebhookValidationError } from '../errors.js';
import { registerProvider } from './registry.js';
import type { Provider } from './types.js';

export type ShopifyWebhook = {
  provider: 'shopify';
  eventId: string;
  timestamp: number;
  parsed: unknown;
  topic: string;
  webhookId: string;
};

function extractFirstValue(h: string | string[] | undefined): string {
  if (Array.isArray(h)) return h[0] || '';
  if (typeof h === 'string') return h;
  return '';
}

const shopifyProvider: Provider = {
  name: 'shopify',
  validate(req: Request, secret: string, _toleranceSeconds?: number): ShopifyWebhook {
    // Step 1 — rawBody guard
    if (!req.rawBody) {
      throw new WebhookValidationError({
        reason: 'malformed_payload',
        provider: 'shopify',
        statusCode: 400,
      });
    }

    // Step 2 — Auth header three-way split (D-10)
    const header = req.headers['x-shopify-hmac-sha256'];
    if (header === undefined) {
      throw new WebhookValidationError({
        reason: 'missing_header',
        provider: 'shopify',
        statusCode: 401,
      });
    }
    if (typeof header !== 'string') {
      throw new WebhookValidationError({
        reason: 'invalid_signature_format',
        provider: 'shopify',
        statusCode: 401,
      });
    }

    // (No Step 3 — D-06 loose base64; trust length-mismatch path)

    // Step 4 — Compute HMAC over rawBody Buffer directly (D-07)
    const computed = computeHmac(req.rawBody, secret, 'sha256');

    // Step 5 — Loose base64 decode + constant-time compare (D-06, D-05)
    //          Hex passed in this header decodes to 48 bytes → length-mismatch
    //          → timingSafeCompare returns false → 'signature_mismatch'.
    const headerBuf = Buffer.from(header, 'base64');
    if (!timingSafeCompare(headerBuf, computed)) {
      throw new WebhookValidationError({
        reason: 'signature_mismatch',
        provider: 'shopify',
        statusCode: 401,
      });
    }

    // Step 6 — Lenient metadata reads (D-08, D-09)
    const topic = extractFirstValue(req.headers['x-shopify-topic']);
    const webhookId = extractFirstValue(req.headers['x-shopify-webhook-id']);

    // Step 7 — JSON.parse AFTER auth
    let parsed: unknown;
    try {
      parsed = JSON.parse(req.rawBody.toString('utf8'));
    } catch {
      throw new WebhookValidationError({
        reason: 'malformed_payload',
        provider: 'shopify',
        statusCode: 400,
      });
    }

    // Step 8 — Build branch type
    return {
      provider: 'shopify',
      eventId: webhookId,                            // D-11
      timestamp: Math.floor(Date.now() / 1000),      // D-12
      parsed,
      topic,
      webhookId,
    };
  },
};

registerProvider('shopify', shopifyProvider);
```

**Source:** Phase 4 stripe.ts pattern; [VERIFIED: Shopify HTTPS webhook docs, https://shopify.dev/docs/apps/build/webhooks/subscribe/https, 2026-05-08]; encoding behavior verified via `node -e` test (see verification block below).

### Pattern 3: Test Fixture Builder (mirror of stripe.test.ts)

**What:** Per-test-file `makeReq` helper + `makeSignature` helper. Stays inline in each test file (no shared fixtures file, per Claude's Discretion lean toward duplication).

**GitHub `makeSignature` shape:**

```typescript
import { createHmac } from 'node:crypto';

function makeGitHubSignature(rawBody: Buffer | string, secret: string): string {
  const sig = createHmac('sha256', secret).update(rawBody).digest('hex');
  return `sha256=${sig}`;
}

function makeReq(opts: {
  body?: string;
  rawBody?: Buffer | undefined;
  signature?: string | string[];
  deliveryId?: string | string[];
}): unknown {
  const body = opts.body ?? '{"action":"opened","number":1}';
  const headers: Record<string, string | string[]> = {};
  if (opts.signature !== undefined) headers['x-hub-signature-256'] = opts.signature;
  if (opts.deliveryId !== undefined) headers['x-github-delivery'] = opts.deliveryId;
  return {
    rawBody: opts.rawBody !== undefined ? opts.rawBody : Buffer.from(body),
    headers,
  };
}
```

**Shopify `makeSignature` shape:**

```typescript
import { createHmac } from 'node:crypto';

function makeShopifySignature(rawBody: Buffer | string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('base64');
}

// Hex variant for the SC3-binding rejection test:
function makeShopifySignatureAsHex(rawBody: Buffer | string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}
```

**Outer-toThrow guard pattern (mandatory per D-14, fixes Phase 4 WR-02 from day one):**

```typescript
it('missing X-Hub-Signature-256 throws missing_header', () => {
  const req = makeReq({ body: SAMPLE_BODY });  // signature omitted
  expect(() => githubProvider.validate(req as Request, SAMPLE_SECRET)).toThrow(
    WebhookValidationError
  );
  try {
    githubProvider.validate(req as Request, SAMPLE_SECRET);
  } catch (err) {
    expect((err as WebhookValidationError).reason).toBe('missing_header');
    expect((err as WebhookValidationError).statusCode).toBe(401);
  }
});
```

**Source:** Phase 4 `src/providers/stripe.test.ts` (lines 14-37 fixture builder; lines 124-135 outer-guard pattern).

### Anti-Patterns to Avoid

- **Reading `x-hub-signature` for any purpose.** D-02 binds the validator's read on this header name to ZERO. Even a `console.log` for debugging that reads it would create surface area we don't want. Phase 7 README prose may mention it; Phase 5 source code does not.
- **Pre-checking base64 alphabet on Shopify header.** D-06 explicitly rejects `/^[A-Za-z0-9+/]+={0,2}$/` regex pre-checks. Hex is a subset of the base64 alphabet so the regex doesn't gate the SC3 hex case anyway.
- **Folding GitHub `sha256=` parse failure to `'signature_mismatch'`.** D-03 is explicit: parse-level fault gets `'invalid_signature_format'`. Same bucket as Stripe's "no parseable v1= segment".
- **Failing validation on missing metadata header.** D-08 mirrors P4 D-09: validator's job is auth, not contract-policing. Set `''` and proceed.
- **Rejecting array-shaped metadata header.** D-09 binds `[0] || ''`. Auth has already passed by step 6, so the duplicate-header attack vector is moot.
- **Folding array auth header into `'missing_header'` (the Phase 4 WR-03 defect).** D-10 implements the corrected three-way split from day one. Phase 4's stripe.ts retains the defect; Phase 5 must NOT inherit it.
- **JSON.parse before signature verification.** D-13 step 7 binds parse-after-auth. Authenticated bytes only.
- **`break` on `signatureMatched = true` in any compare loop.** GitHub has a single signature so this doesn't arise; if a future maintainer adds a multi-segment loop (it shouldn't), the no-break Stripe pattern applies.
- **`expect(...).toThrow(...)` outer guard omitted before `try/catch` introspection** (Phase 4 WR-02). Tests that lack the outer guard pass vacuously if a regression makes `validate()` succeed.
- **Console calls anywhere in provider code.** Phase 3 D-16 binds zero `console.*` in `src/`. Phase 5's negative-case tests assert no console emission on failure paths.
- **`@octokit/webhooks` or any Shopify SDK import.** PROJECT.md "no vendor SDKs". Hand-roll the 8-step pipeline; Node `crypto` + Phase 2 wrappers are sufficient.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HMAC-SHA256 over Buffer | `createHmac('sha256', secret).update(...).digest()` inline | `computeHmac(req.rawBody, secret, 'sha256')` from `src/crypto/hmac.ts` | Phase 2 D-01 wrapper handles algorithm narrowing and returns Buffer; matches stripe.ts; one less import per provider. |
| Constant-time byte compare | `crypto.timingSafeEqual` directly | `timingSafeCompare(a, b)` from `src/crypto/compare.ts` | Phase 2 D-09 wraps with length-mismatch safety. The Shopify hex-as-base64 SC3 case depends structurally on this returning false on length mismatch (not throwing). |
| Discriminated error throwing | `throw new Error('signature mismatch')` or `next(new Error(...))` | `throw new WebhookValidationError({ reason, provider, statusCode })` | Phase 2 D-05 locks the constructor. Plain `Error` doesn't have `.reason` / `.statusCode`; the error-handler (Phase 3 D-14) reads those for the response shape. |
| Header existence checking | `if (!header)` (treats `''` as missing — wrong since empty string is "present but unparseable") | `if (header === undefined) throw 'missing_header'` then `if (typeof header !== 'string') throw 'invalid_signature_format'` | D-10 explicit. Empty string is a degenerate "present" case that should hit the format-invalid path naturally (empty string after `sha256=` slice for GitHub; empty-string `Buffer.from('', 'base64')` for Shopify both end at length-mismatch in compare). |
| Base64 alphabet validation regex | `/^[A-Za-z0-9+/]+={0,2}$/.test(header)` before decode | `Buffer.from(header, 'base64')` directly; trust length-mismatch | D-06 explicit. Adds code, doesn't gate the only known footgun (hex decoded as base64 — which the regex passes anyway since hex is alphabet-subset). |
| Header case-handling | Try `req.headers['X-Hub-Signature-256']`, fall back to lowercase | Read lowercase only: `req.headers['x-hub-signature-256']` | D-15 explicit. Express normalizes incoming headers to lowercase per Node `http` module convention. Multi-casing defense is dead code. |
| Hex decoding on GitHub with manual length check | `if (headerHex.length !== 64) throw ...` then `Buffer.from(...)` | Just `Buffer.from(headerHex, 'hex')` after the regex check + trust `timingSafeCompare` length-mismatch | One source of truth for the length gate (Phase 2 D-09). The regex `/^[0-9a-f]+$/i` already rejects empty strings; non-64 lengths fail at compare time. Per Claude's Discretion: lean `timingSafeCompare` over direct `crypto.timingSafeEqual` precisely to keep the length gate centralized. |
| GitHub UUID validation on `X-GitHub-Delivery` | `if (!/^[0-9a-f-]{36}$/i.test(deliveryId)) throw ...` | Just expose what arrived; D-08 leniency | Not the validator's job. GitHub's docs call it a "GUID" without locking the format spec. A future GitHub change to a different ID shape shouldn't break our auth path. |
| Shopify topic enumeration validation | `if (!KNOWN_TOPICS.includes(topic)) throw ...` | Expose what arrived | Topic enum changes whenever Shopify ships new event types. Pinning a list creates a maintenance pull-request every time. |
| Idempotency / dedup store for GitHub/Shopify replays | In-memory or Redis-backed `Set<deliveryId>` | DOCUMENT THE GAP — out of scope per OUT-OF-SCOPE in REQUIREMENTS.md | Phase 7 README prose; Phase 5 surface only EXPOSES `deliveryId` / `webhookId` / `eventId`. Dedup is consumer-app responsibility. PROJECT.md's "documented honesty about replay protection" applies. |

**Key insight:** Phase 5's job is orchestration of Phase 2 primitives, not new primitive design. The encoding fork (hex vs base64) is the only place provider-specific logic lives; everything else is structurally identical to Phase 4 stripe.ts. If a Phase 5 file grows past ~100 lines of validator body, something has been hand-rolled that shouldn't be.

## Common Pitfalls

### Pitfall 1: Reading the wrong GitHub header

**What goes wrong:** Validator reads `req.headers['x-hub-signature']` (SHA-1) instead of `req.headers['x-hub-signature-256']` (SHA-256). Either the validator inadvertently validates against weak SHA-1 (security regression) or it preferentially uses SHA-1 when present and falls back to SHA-256.

**Why it happens:** Many old tutorials and Stack Overflow answers reference `X-Hub-Signature` because GitHub's webhook docs predate SHA-256. PITFALLS.md #9 catalogs this.

**How to avoid:** D-02 binds the validator's read on the SHA-1 header to ZERO. Grep `src/providers/github.ts` for the substring `x-hub-signature` after implementation — the only match should be `x-hub-signature-256`. The negative test "SHA-1-only request → `'missing_header'`" pins this contract.

**Warning signs:** Code review finds `req.headers['x-hub-signature']` anywhere in `github.ts`; tests pass for SHA-1-only fixtures (they should reject as `'missing_header'`).

### Pitfall 2: Shopify hex-as-base64 silently accepted (FEATURES.md "most common integration footgun")

**What goes wrong:** Developer copies GitHub-style hex computation, sees `Buffer.from(headerValue, 'base64')` decode without throwing (Node's base64 decoder is permissive on hex chars), and the byte compare somehow passes (e.g., because both sides are computed via the same encoding path).

**Why it happens:** Hex characters (`0-9`, `a-f`) are a subset of base64 alphabet. `Buffer.from('a'.repeat(64), 'base64')` succeeds with a 48-byte buffer (verified in this research, see verification block).

**How to avoid:** The implementation pattern (D-04 for GitHub: hex decode; D-06 for Shopify: base64 decode) puts each provider on the right encoding fork. The SC3-binding test ("hex-encoded digest in `X-Shopify-Hmac-Sha256` → `'signature_mismatch'`") pins it. The structural defense is that `timingSafeCompare(48bytes, 32bytes) === false` (Phase 2 D-09).

**Warning signs:** Shopify validator passes a hex-encoded fixture in tests; test fixtures use `digest('hex')` for both providers (they should use `'base64'` for Shopify only).

### Pitfall 3: Reusing Stripe's HMAC input shape for GitHub/Shopify

**What goes wrong:** Validator uses `${timestamp}.${rawBody.toString('utf8')}` (Stripe's input) for GitHub or Shopify, leading to all valid signatures failing.

**Why it happens:** Pattern reuse from `src/providers/stripe.ts:102` without recognizing that GitHub and Shopify don't sign timestamps. The Stripe input includes the `${t}.` prefix because Stripe signs `<timestamp>.<body>` per Stripe docs.

**How to avoid:** D-07 explicit: pass `req.rawBody` Buffer directly. The Stripe-specific `${t}.${rawBody.toString('utf8')}` is a Stripe-only HMAC input shape. Both GitHub and Shopify sign body bytes alone.

**Warning signs:** Tests fail with `'signature_mismatch'` even on a happy-path fixture where the test's `makeSignature` and the provider use the same secret/body.

### Pitfall 4: Array-shaped header misclassified as missing (Phase 4 WR-03)

**What goes wrong:** Validator uses `if (!header || typeof header !== 'string')` (Phase 4 stripe.ts:81-88 pattern), folding array case into `'missing_header'`. Consumers debugging see "header missing" when the actual problem is duplicate emission upstream.

**Why it happens:** Both `undefined` and `array` are falsy/non-string in a single guard; a unified check is shorter to write but loses diagnostic clarity.

**How to avoid:** D-10 binds the split: `header === undefined` → missing; `typeof header !== 'string'` (after the undefined check) → format-invalid. Test fixture with `headers: { 'x-hub-signature-256': ['sig1', 'sig2'] }` asserts `'invalid_signature_format'`.

**Warning signs:** Test for "duplicate header" returns `'missing_header'` instead of `'invalid_signature_format'`; Phase 4 WR-03 pattern echoed in `github.ts` / `shopify.ts`.

### Pitfall 5: JSON.parse runs on un-authenticated bytes

**What goes wrong:** Validator calls `JSON.parse(req.rawBody.toString('utf8'))` early (e.g., to extract `id` for the eventId before computing HMAC), exposing the parser to attacker-controlled bytes on every request — even ones that fail signature.

**Why it happens:** Logical instinct to "parse first, decide what to do later"; copying patterns from non-security middleware where parse-then-validate is fine.

**How to avoid:** D-13 binds step order: rawBody → header → (parse format) → HMAC → compare → metadata-headers → JSON.parse → build. JSON.parse is step 7, AFTER the byte-compare gate.

**Warning signs:** `JSON.parse` appears before the `timingSafeCompare` call in the validator; a malformed-but-unsigned body triggers a parse error reason that should never be reachable.

### Pitfall 6: Vacuous-pass tests (Phase 4 WR-02)

**What goes wrong:** A test asserts `.reason` / `.statusCode` inside a `try/catch` block but lacks an outer `expect(() => ...).toThrow(WebhookValidationError)` guard. If a regression makes `validate()` return successfully where it should throw, the `try` block completes, no `expect` inside the `catch` runs, and the test passes silently.

**Why it happens:** Author writes the test on the assumption that `validate()` will throw and structures the test around the catch.

**How to avoid:** D-14 mandates outer `expect(() => ...).toThrow(WebhookValidationError)` before the `try/catch` introspection. Alternative: `expect.assertions(N)` at top of test body, where N matches the count of `expect()` calls inside `catch`.

**Warning signs:** A test in `github.test.ts` or `shopify.test.ts` has only `try/catch` with `expect()` inside `catch` and no outer `toThrow`. Phase 4 WR-02 enumerated 4 affected stripe tests; Phase 5 must ship zero of these.

### Pitfall 7: Hardcoded UUID/topic format expectations

**What goes wrong:** Validator validates `X-GitHub-Delivery` against UUID v4 regex, or `X-Shopify-Topic` against a closed enum. A future provider-side change breaks legitimate webhooks.

**Why it happens:** Defensive over-engineering; the UUID example in GitHub docs (`72d3162e-cc78-11e3-81ab-4c9367dc0958`) looks like it should be enforceable.

**How to avoid:** D-08 leniency: take the value as-is; expose. Don't validate format. Consumer code that wants UUID-strict dedup keys can validate at its layer.

**Warning signs:** A regex like `/^[0-9a-f-]{36}$/i.test(deliveryId)` appears in `github.ts`; an array of known topic strings appears in `shopify.ts`.

### Pitfall 8: `req.rawBody` accessed without null guard

**What goes wrong:** Validator skips the Phase 3 D-07 guard and goes straight to `computeHmac(req.rawBody, ...)`. If a consumer mounted the validation middleware without first mounting `rawBodyCapture()` or `express.json({ verify: captureRawBody })`, `req.rawBody` is `undefined` and the call throws a generic TypeError instead of the structured `'malformed_payload'` 400.

**Why it happens:** Reordering or refactoring the 8 steps drops step 1.

**How to avoid:** Step 1 of the pipeline is non-negotiable. The "missing rawBody" test fixture in both test files asserts `'malformed_payload'` with statusCode 400.

**Warning signs:** A test for "missing rawBody" fixture gets a TypeError or unstructured Error instead of `WebhookValidationError`.

### Pitfall 9: Future-proofing Phase 4 IN-04 by widening Provider interface

**What goes wrong:** Implementer notices `_toleranceSeconds` is wasted on GitHub/Shopify and tries to "fix" it by widening the `Provider` interface to take an options object — incurring a Phase 3 D-16 violation and breaking the Phase 3 D-22 fake-provider tests in `middleware.test.ts`.

**Why it happens:** "Cleanup" instinct; the unused 3rd arg looks like dead weight.

**How to avoid:** D-17 + Phase 3 D-16 both lock the interface. The 3rd arg with `_` prefix is the deliberate v1 trade-off. Phase 4 IN-04 explicitly defers cleaner shape to v2.

**Warning signs:** `src/providers/types.ts` has been modified; `Provider.validate` signature changes.

### Pitfall 10: Console emission on failure path

**What goes wrong:** Debug-time `console.log('signature mismatch:', expected, got)` left in by accident, leaking signature bytes / secret.

**Why it happens:** Quick debugging during implementation; commit before cleanup.

**How to avoid:** Phase 3 D-16 + the no-leakage test (per D-14): every negative-case test asserts neither `JSON.stringify(err)` nor `String(err)` contains the secret/signature/body. As a structural guarantee, the constructor of `WebhookValidationError` has no field for sensitive data. Pre-commit grep: `grep -n 'console\.' src/providers/{github,shopify}.ts` should return zero.

**Warning signs:** Any `console.*` call in the new code; grep finds matches.

## Code Examples

Verified primitives the planner can reference directly. All code shown below either exists in the codebase (cited path) or is the smallest possible test-fixture pattern verified at research time.

### Verified: `Buffer.from(hex, 'base64')` produces 48 bytes from 64 hex chars

```bash
node -e "console.log(Buffer.from('a'.repeat(64), 'base64').length)"
# 48
```

[VERIFIED: Node 20 runtime, 2026-05-08]

This is the structural property D-05 depends on. A Shopify-style validator that base64-decodes a 64-character hex string gets a 48-byte buffer, not a 32-byte one. Length-mismatch in `timingSafeCompare` (Phase 2 D-09) returns `false` and the validator throws `'signature_mismatch'`.

### Verified: 32-byte digest base64 length

```bash
node -e "
const crypto = require('node:crypto');
const sig = crypto.createHmac('sha256', 'shpss_test').update('{\"id\":1}').digest('base64');
console.log('value:', sig);
console.log('chars:', sig.length);
console.log('decoded bytes:', Buffer.from(sig, 'base64').length);
"
# value: 1GxccvotnkOedTjSm8S0m/VA3yAUKshyqT52ccNYHj4=
# chars: 44
# decoded bytes: 32
```

[VERIFIED: Node 20 runtime, 2026-05-08]

A canonical Shopify-style base64 signature is 44 chars (32 bytes × 4/3 + 1 `=` padding rounded up). Decoded length is exactly 32 — matches the 32-byte computed digest from `computeHmac`.

### Verified: 32-byte digest hex length

```bash
node -e "
const crypto = require('node:crypto');
console.log(crypto.createHmac('sha256', 'k').update('body').digest('hex').length);
"
# 64
```

[VERIFIED: Node 20 runtime, 2026-05-08]

A canonical GitHub `sha256=<hex>` tail is 64 hex chars (32 bytes × 2). The header value as a whole is 71 chars (`sha256=` prefix + 64 hex).

### Existing pattern: Phase 4 stripe.ts step-order template

```typescript
// Source: src/providers/stripe.ts, Phase 4
//
// 9-step structure (Phase 5's GitHub/Shopify validators are 8-step variants):
// Step 1: rawBody guard (Phase 5 keeps verbatim)
// Step 2: header read + missing check (Phase 5 SPLITS into two-step D-10 guard)
// Step 3: parseStripeSignature (Phase 5 GitHub: minimal sha256= + hex check; Phase 5 Shopify: SKIP)
// Step 4: computeHmac with `${t}.${rawBody.toString('utf8')}` (Phase 5: rawBody Buffer directly)
// Step 5: timing-safe compare loop (Phase 5: single compare, no loop)
// Step 6: tolerance check (Phase 5: SKIP — no signed timestamp)
// Step 7: JSON.parse after success (Phase 5 keeps verbatim)
// Step 8: eventId extraction from body.id (Phase 5: from metadata header instead per D-11)
// Step 9: build StripeWebhook with replayWindowMs (Phase 5: build {GitHub,Shopify}Webhook with metadata)
```

### Existing pattern: Phase 4 stripe.test.ts fixture builder

```typescript
// Source: src/providers/stripe.test.ts:14-37
function makeReq(opts: {
  body?: string;
  rawBody?: Buffer | undefined;
  signature?: string;
}): unknown {
  const body = opts.body ?? '{"id":"evt_1234","type":"charge.succeeded"}';
  return {
    rawBody: opts.rawBody !== undefined ? opts.rawBody : Buffer.from(body),
    headers:
      opts.signature !== undefined
        ? { 'stripe-signature': opts.signature }
        : {},
  };
}
```

Phase 5 versions extend the headers shape to support array-typed values (for the D-10 duplicate-header test) and to thread metadata headers through fixtures (for the SC2/SC4 metadata-exposure tests).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Validate against `X-Hub-Signature` (SHA-1) | Validate against `X-Hub-Signature-256` (SHA-256); ignore SHA-1 | GitHub launched SHA-256 in 2019; SHA-1 is "for compatibility with existing integrations" per current docs | Phase 5 D-01 + D-02 implement the modern stance; SHA-1 visibility is zero in source code. |
| Pre-check Shopify base64 with regex | Loose `Buffer.from(value, 'base64')`; trust length-mismatch path | Webhook security guides 2024+ | D-06 implements the modern stance; reduces code surface, leverages Phase 2 D-09 primitive. |
| Hard-fail on missing dedup metadata | Lenient: set `''`, expose, let consumer decide | Validator-vs-policer split; "validate auth, not contract" — consistent with stripe-node's lenient missing-id handling | D-08 + D-09 implement; mirrors Phase 4 D-09 missing-id pattern. |
| Single auth-header guard `if (!header)` | Three-way split (`undefined` / non-string / parses-but-no-match) | Phase 4 WR-03 surfaced the diagnostic gap | D-10 implements from day one in Phase 5; Phase 4's stripe.ts retains for Phase 6 audit. |
| Provider-signed timestamp for replay defense | Receipt timestamp + documented honesty | PROJECT.md core value: "documented honesty about where replay protection is missing" | D-12 sets `Math.floor(Date.now()/1000)` at validation time; Phase 7 README documents the consumer-side dedup pattern. |

**Deprecated/outdated (do NOT carry forward):**
- **Active SHA-1 detection.** Some 2018–2020 tutorials show `if (req.headers['x-hub-signature'] && !req.headers['x-hub-signature-256']) reject(...)` patterns. GitHub still sends both today; active rejection breaks legitimate traffic. D-02 explicit.
- **`X-Shopify-Hmac-SHA256` (uppercase) header lookup.** Express normalizes to lowercase per Node `http` convention. D-15.
- **`@octokit/webhooks` for GitHub validation.** PROJECT.md "no vendor SDKs". Hand-roll is < 50 lines.
- **Hex pre-check on Shopify header to "diagnose" the encoding mistake.** D-05/D-06 explicit. Length-mismatch path is the structural diagnosis.

## Assumptions Log

> Each [ASSUMED] tag in this document is enumerated below. The planner and discuss-phase use this section to identify decisions needing user confirmation before execution.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | GitHub still sends both `X-Hub-Signature-256` and `X-Hub-Signature` in normal traffic when a webhook secret is configured | Phase Requirements GHUB-02; Pattern 1 anti-pattern note | Low — verified via WebFetch of `docs.github.com` 2026-05-08 ("X-Hub-Signature is provided for compatibility with existing integrations"). If GitHub deprecates the SHA-1 header, our D-02 silent-ignore stance still works (no SHA-1 header → still no behavior change; validator only ever read SHA-256). |
| A2 | Shopify webhook secret rotation completes "up to 1 hour" propagation, but we do NOT need to handle multi-secret rotation in v1 | Phase Requirements SHOP-01; Deferred | Low — confirmed via FEATURES.md and Shopify community discussions. Multi-secret support is REQUIREMENTS.md DX v2 territory (no consumer-side `secret: string \| string[]`). The validator has zero secret-rotation logic; consumers tolerating rotation windows is their choice. |
| A3 | `X-GitHub-Delivery` is stable across retries (i.e., GitHub re-sends the same UUID when retrying a failed delivery) | Phase Requirements GHUB-03 | Low — official docs describe the delivery ID as identifying the event, not the attempt; community consensus and PITFALLS #14 align. If wrong, consumers using `deliveryId` for dedup get false negatives but no security regression. Phase 5 doesn't itself depend on this stability — we just expose the value. Phase 7 README documents the consumer-side dedup pattern; if the stability assumption is wrong, that's a Phase 7 prose correction, not a Phase 5 code change. |
| A4 | `X-Shopify-Topic` values use slash-delimited identifiers like `products/create`, `orders/create` (no hard-locked enum exists) | Pattern 2 anti-pattern note | Low — Shopify docs confirm slash-delimited topic identifiers; no closed enum spec. We don't validate the format anyway (D-08 leniency); we only expose the value. If a future Shopify topic uses a different delimiter, it still passes through. |
| A5 | `X-Shopify-Webhook-Id` format is non-strict (per Shopify community, "letters and numbers unique to your store") | Pattern 2 | Low — we don't validate the format; we expose. If wrong, consumer-side dedup keys may have surprising shapes but auth is unaffected. |

**Verification status:** All five assumptions are LOW risk because Phase 5's behavior is to expose-not-validate the metadata fields. The SC1–SC5 binding criteria are about auth correctness, not metadata-format validation.

**If this table is empty:** N/A — five claims listed.

## Open Questions

1. **Should `extractFirstValue` be a tiny shared helper module, or inline-duplicated in each provider?**
   - What we know: D-09 is identical for both providers; the pattern is `Array.isArray(h) ? (h[0] || '') : (typeof h === 'string' ? h : '')`. Three uses in `shopify.ts` (auth header is its own D-10 split, not this helper; topic + webhookId both use it; rawBody read uses it implicitly = let's call it 2 uses), one use in `github.ts` (deliveryId only). Total = 3 uses across both files.
   - What's unclear: Whether 3 uses crosses the duplication threshold ("≤ 5 inline" per Claude's Discretion).
   - Recommendation: Inline duplication. Per CONTEXT Claude's Discretion guidance ("lean toward inline duplication if total uses ≤ 5"). The helper is 4 lines; the two test files share an obvious shape.

2. **Should the GitHub hex parser accept uppercase hex (`/^[0-9a-f]+$/i`) or lowercase only (`/^[0-9a-f]+$/`)?**
   - What we know: GitHub's docs example uses lowercase. `Buffer.from('AB', 'hex')` and `Buffer.from('ab', 'hex')` produce the same byte. Stripe's regex is lowercase-only `/^[0-9a-f]+$/` (verified at `src/providers/stripe.ts:59`).
   - What's unclear: Whether GitHub ever sends uppercase hex.
   - Recommendation: Match Stripe's lowercase-only `/^[0-9a-f]+$/` for cross-provider consistency. If a real-world case-sensitivity report surfaces, fold to case-insensitive (`/i`) in a Phase 6 audit pass — it's a one-character change and adds zero new reasons. Pin the lowercase-only choice in a test fixture (`sha256=ABC...` → `'invalid_signature_format'`).

3. **For the duplicate-auth-header test, should the fixture use string array (`['sig1', 'sig2']`) or some other multi-value shape?**
   - What we know: Express types `req.headers[name]` as `string | string[] | undefined`. RFC 7230 permits duplicate headers. The D-10 type guard is `typeof header !== 'string'` after the undefined check.
   - What's unclear: Whether to also fixture-test `null` or `123` (numeric) edge cases.
   - Recommendation: String array fixture only. Express won't deliver `null` or numeric values; testing those is dead-code exercise. The `typeof !== 'string'` guard catches array; the missing case is `undefined`. Two tests cover the discriminant.

4. **Should the hex-as-base64 SC3 test compute the hex against the same body+secret used in the happy path, or use a deterministic fixed-hex string?**
   - What we know: `digest('hex')` and `digest('base64')` of the same `(secret, body)` produce semantically equivalent bytes in different encodings; the hex form has length 64, base64 has length 44.
   - What's unclear: Test maintainability if the fixture body changes.
   - Recommendation: Compute the hex from the same `(secret, body)` as the happy path — gives the test a real-world feel ("the developer accidentally used hex instead of base64"). Store as: `const hexSig = createHmac('sha256', SAMPLE_SECRET).update(SAMPLE_BODY).digest('hex')` and assert the validator throws `'signature_mismatch'`. Self-documenting.

5. **For the no-leakage assertion, should we synthesize a sample signature into a constant for `expect(json).not.toContain(SAMPLE_SIGNATURE)` checks, or only assert `not.toContain(SAMPLE_SECRET)` and `not.toContain(SAMPLE_BODY)`?**
   - What we know: Phase 4 stripe.test.ts:243-259 includes signature in the leakage assertion list. Phase 2 D-11 guarantees structurally that the error class can't carry signature bytes (no field exists for them).
   - What's unclear: Whether the structural guarantee is strong enough that the signature-leak assertion is redundant.
   - Recommendation: Include the signature substring in the assertion list for parity with stripe.test.ts. Three lines of belt-and-braces test code; if a future maintainer accidentally adds a `cause` field carrying signature bytes (Phase 2 D-11 currently disallows), the test catches it.

## Environment Availability

**Step 2.6: SKIPPED.** Phase 5 is code-only with zero new external dependencies. The existing stack (Node 20+, Vitest 4.x, TypeScript 6.x, Biome) is verified green via Phase 4 (86/86 tests passing per `04-VERIFICATION.md`). No new CLI tools, services, runtimes, or packages are introduced.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x (locked Phase 1) |
| Config file | `vitest.config.ts` (locked Phase 1) |
| Quick run command | `npm test -- src/providers/github.test.ts src/providers/shopify.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map (SC1–SC5 binding)

| SC / Req | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|-------------|
| SC1 / GHUB-01 | Valid `X-Hub-Signature-256: sha256=<correct-hex>` + matching rawBody → `validate()` returns `GitHubWebhook` | unit | `npm test -- src/providers/github.test.ts -t "happy path"` | ❌ Wave 0 |
| SC1 / GHUB-01 | Tampered body, valid SHA-256 signature → throws `'signature_mismatch'` | unit | `npm test -- src/providers/github.test.ts -t "tampered body"` | ❌ Wave 0 |
| SC1 / GHUB-02 | SHA-1-only request (only `X-Hub-Signature` present, no `-256`) → throws `'missing_header'` (D-01) | unit | `npm test -- src/providers/github.test.ts -t "sha1 only missing header"` | ❌ Wave 0 |
| SC1 (D-02) | Both `X-Hub-Signature-256` AND deprecated `X-Hub-Signature` present → SHA-256 validates; SHA-1 silently ignored | unit | `npm test -- src/providers/github.test.ts -t "both headers"` | ❌ Wave 0 |
| GHUB-01 (D-03) | Header value bare hex (no `sha256=` prefix) → throws `'invalid_signature_format'` | unit | `npm test -- src/providers/github.test.ts -t "missing sha256 prefix"` | ❌ Wave 0 |
| GHUB-01 (D-03) | Header value `sha256=zzz...` (non-hex tail) → throws `'invalid_signature_format'` | unit | `npm test -- src/providers/github.test.ts -t "non-hex tail"` | ❌ Wave 0 |
| GHUB-01 (D-10) | `X-Hub-Signature-256` absent entirely → throws `'missing_header'` | unit | `npm test -- src/providers/github.test.ts -t "missing header"` | ❌ Wave 0 |
| GHUB-01 (D-10) | `X-Hub-Signature-256` is array (duplicate emission) → throws `'invalid_signature_format'` (corrects Phase 4 WR-03 from day one) | unit | `npm test -- src/providers/github.test.ts -t "array header"` | ❌ Wave 0 |
| GHUB-01 (P3 D-07) | Missing `req.rawBody` → throws `'malformed_payload'` (400) | unit | `npm test -- src/providers/github.test.ts -t "missing rawBody"` | ❌ Wave 0 |
| GHUB-01 (D-13 step 7) | JSON.parse failure on signed-but-non-JSON body → throws `'malformed_payload'` (400) | unit | `npm test -- src/providers/github.test.ts -t "json parse failure"` | ❌ Wave 0 |
| SC2 / GHUB-03 (D-08) | Happy path: `X-GitHub-Delivery: <uuid>` → `validate()` returns `GitHubWebhook` with `deliveryId === <uuid>`, `eventId === <uuid>` | unit | `npm test -- src/providers/github.test.ts -t "delivery id exposed"` | ❌ Wave 0 |
| SC2 / GHUB-03 (D-08) | Missing `X-GitHub-Delivery` → succeeds with `deliveryId === ''`, `eventId === ''` | unit | `npm test -- src/providers/github.test.ts -t "missing delivery"` | ❌ Wave 0 |
| SC2 / GHUB-03 (D-09) | Array-shaped `X-GitHub-Delivery` → `deliveryId === firstValue` | unit | `npm test -- src/providers/github.test.ts -t "array delivery"` | ❌ Wave 0 |
| GHUB-01 (P3 D-16, P2 D-11) | No-leakage: any thrown error's `JSON.stringify` and `String()` contain neither secret nor body content | unit | `npm test -- src/providers/github.test.ts -t "no leakage"` | ❌ Wave 0 |
| SC3 / SHOP-01 | Valid base64 `X-Shopify-Hmac-Sha256` + matching rawBody → returns `ShopifyWebhook` | unit | `npm test -- src/providers/shopify.test.ts -t "happy path"` | ❌ Wave 0 |
| SC3 / SHOP-01 | Tampered body, valid base64 signature → throws `'signature_mismatch'` | unit | `npm test -- src/providers/shopify.test.ts -t "tampered body"` | ❌ Wave 0 |
| SC3 / SHOP-01 (D-05) | Same digest hex-encoded (64 chars) instead of base64 (44 chars) → throws `'signature_mismatch'` (rejection via length-mismatch path) | unit | `npm test -- src/providers/shopify.test.ts -t "hex encoded rejected"` | ❌ Wave 0 |
| SHOP-01 (D-10) | `X-Shopify-Hmac-Sha256` absent → throws `'missing_header'` | unit | `npm test -- src/providers/shopify.test.ts -t "missing header"` | ❌ Wave 0 |
| SHOP-01 (D-10) | `X-Shopify-Hmac-Sha256` is array → throws `'invalid_signature_format'` | unit | `npm test -- src/providers/shopify.test.ts -t "array header"` | ❌ Wave 0 |
| SHOP-01 (P3 D-07) | Missing `req.rawBody` → throws `'malformed_payload'` (400) | unit | `npm test -- src/providers/shopify.test.ts -t "missing rawBody"` | ❌ Wave 0 |
| SHOP-01 (D-13 step 7) | JSON.parse failure on signed-but-non-JSON body → throws `'malformed_payload'` | unit | `npm test -- src/providers/shopify.test.ts -t "json parse failure"` | ❌ Wave 0 |
| SC4 / SHOP-02 (D-08) | Happy path: `X-Shopify-Topic` + `X-Shopify-Webhook-Id` exposed; `eventId === webhookId` | unit | `npm test -- src/providers/shopify.test.ts -t "metadata exposed"` | ❌ Wave 0 |
| SC4 / SHOP-02 (D-08) | Missing `X-Shopify-Topic` → succeeds with `topic === ''` | unit | `npm test -- src/providers/shopify.test.ts -t "missing topic"` | ❌ Wave 0 |
| SC4 / SHOP-02 (D-08) | Missing `X-Shopify-Webhook-Id` → succeeds with `webhookId === ''`, `eventId === ''` | unit | `npm test -- src/providers/shopify.test.ts -t "missing webhook id"` | ❌ Wave 0 |
| SC4 / SHOP-02 (D-09) | Array-shaped `X-Shopify-Topic` → `topic === firstValue` | unit | `npm test -- src/providers/shopify.test.ts -t "array topic"` | ❌ Wave 0 |
| SHOP-01 (P3 D-16, P2 D-11) | No-leakage: thrown error's `JSON.stringify`/`String()` contain neither secret nor body content nor signature bytes | unit | `npm test -- src/providers/shopify.test.ts -t "no leakage"` | ❌ Wave 0 |

**Total Phase 5 binding tests:** ~24 cases across 2 new files (12 GitHub + 13 Shopify, give or take overlap on no-leakage).

### SC5 Coverage Map

SC5 enumerates the binding test scope as:
1. GitHub HMAC-SHA256 validation (happy path + tampered body) → covered by rows 1, 2 above
2. Explicit rejection of deprecated `X-Hub-Signature` (SHA-1) header → covered by row 3
3. Exposure of `X-GitHub-Delivery` on `req.webhook` → covered by rows 11–13
4. Shopify base64-decoded validation (happy path) → covered by row 15
5. Explicit rejection of hex-encoded Shopify digest → covered by row 17
6. Exposure of `X-Shopify-Topic` and `X-Shopify-Webhook-Id` on `req.webhook` → covered by rows 22–25

All six sub-criteria of SC5 map to specific test rows above.

### Sampling Rate
- **Per task commit:** `npm test -- src/providers/github.test.ts src/providers/shopify.test.ts` (~24 cases, < 5s)
- **Per wave merge:** `npm test` (full suite ~86 + 24 = ~110 tests; verifies no Phase 1–4 regression)
- **Phase gate:** Full suite green + zero `console.*` calls in `src/` (grep gate) + TypeScript strict mode clean (`tsc --noEmit`) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/providers/github.test.ts` — NEW file. Covers SC1, SC2, GHUB-01, GHUB-02, GHUB-03, plus D-10 array case, D-13 step-7 JSON-parse failure, missing rawBody, and no-leakage.
- [ ] `src/providers/shopify.test.ts` — NEW file. Covers SC3, SC4, SHOP-01, SHOP-02, plus D-05 hex-as-base64, D-10 array case, D-13 step-7, missing rawBody, and no-leakage.
- [ ] Framework install: NONE — Vitest 4.x already configured. No new devDependencies.
- [ ] Shared fixtures: NONE — per Claude's Discretion guidance, each test file inlines its own `makeReq` / `makeSignature` helpers (Phase 1 D-04 spirit of self-contained co-located tests).

## CLAUDE.md Compliance

`./CLAUDE.md` (loaded) imposes ai-project-status `log.md` and `daily-plan.md` discipline. These rules apply to the **executor agent**, not to research output:

- **log.md**: Executor must append a task-granularity entry per task as Phase 5 work commits land. Format `- **YYYY-MM-DD** — <what>. Task: \`<task-name>\`. Commit: \`<short-hash>\`.`. After each `log.md` edit announce `📝 log.md updated`. After each commit announce `✅ commit <short-hash>`.
- **daily-plan.md**: Forward-looking single-day file with `# Daily plan — YYYY-MM-DD` header. Overwrite-only; date fixed at top. SessionStart hook (`.claude/hooks/check-daily-plan.py`) gates other work behind freshness — already addressed for the current session per `daily-plan.md`'s 2026-05-08 header (full Phase 5 arc).

Phase 5 implementation MUST follow these rules. The planner should ensure each Plan in `.planning/phases/05-github-shopify-providers/` includes a step that appends a `log.md` entry and announces the commit.

## Sources

### Primary (HIGH confidence)
- [GitHub Webhooks documentation — webhook events and payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads) — verified 2026-05-08; confirms `X-Hub-Signature-256` + `X-Hub-Signature` both still sent, GUID format for `X-GitHub-Delivery`, raw-body HMAC input
- [GitHub Webhooks — Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) — `sha256=<hex>` format, "Always use X-Hub-Signature-256" guidance
- [Shopify HTTPS webhook delivery docs](https://shopify.dev/docs/apps/build/webhooks/subscribe/https) — verified 2026-05-08; confirms base64 encoding, raw-body HMAC input
- [Shopify Webhooks API reference](https://shopify.dev/docs/api/webhooks/latest)
- `src/providers/stripe.ts` (Phase 4 reference implementation) — 9-step validator pattern Phase 5 adapts to 8-step
- `src/providers/stripe.test.ts` (Phase 4 reference test file) — fixture builder + outer-toThrow guard pattern Phase 5 mirrors
- `src/crypto/hmac.ts`, `src/crypto/compare.ts`, `src/errors.ts` (Phase 2 primitives — encoding-neutral, length-safe, no-leakage)
- `.planning/phases/05-github-shopify-providers/05-CONTEXT.md` (13 locked decisions D-01..D-17)
- `.planning/phases/04-stripe-provider/04-REVIEW.md` (WR-02, WR-03, IN-04 carry-overs)

### Secondary (MEDIUM confidence)
- [Hookdeck — Guide to Shopify Webhooks Features and Best Practices](https://hookdeck.com/webhooks/platforms/shopify-webhooks-features-and-best-practices-guide) — topic enum patterns (`products/create`, `orders/create`)
- [Magicbell — GitHub Webhooks: Complete Guide](https://www.magicbell.com/blog/github-webhooks-guide) — delivery ID format and stability discussion
- [Webhook Signature Verification (HMAC-SHA256) — 2026 Guide | HookRay](https://hookray.com/blog/webhook-signature-verification-2026) — cross-provider encoding patterns
- [GitHub Discussion #182735 — Best practice for securely validating GitHub webhook payloads](https://github.com/orgs/community/discussions/182735) — corroborates `X-Hub-Signature-256` exclusive read

### Tertiary (verified at research time, not just cited)
- Local Node 20 runtime verification of `Buffer.from(hex, 'base64')` length behavior (48 bytes for 64 hex chars) — see Code Examples block
- Local Node 20 runtime verification of HMAC-SHA256 base64 length (44 chars including `=` padding) and hex length (64 chars) — see Code Examples block

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All Phase 1–4 primitives verified green via Phase 4 86/86 test pass; no new packages introduced
- Architecture: HIGH — 8-step pipeline directly adapts the Phase 4 9-step stripe.ts pattern; only the encoding fork and metadata-population steps differ
- Provider-specific behavior: HIGH — GitHub `sha256=<hex>` + Shopify base64 confirmed via official docs (verified 2026-05-08); base64-decode-of-hex behavior verified at Node 20 runtime
- Pitfalls: HIGH — All Phase-5-relevant pitfalls (#1, #2, #3, #5, #8, #9, #10, #13, #14) directly addressed by locked CONTEXT decisions
- Test plan: HIGH — SC1–SC5 mapped to 24 specific test rows; outer-toThrow-guard pattern locked from day one to prevent WR-02 regression
- Cross-phase carry-overs: MEDIUM-HIGH — IN-04 (tolerance positionally passed) confirmed; WR-03 (array header misclassification) corrected from day one for new providers; Phase 4 stripe.ts intentionally retains defect for Phase 6 audit (CONTEXT D-10 explicit)

**Research date:** 2026-05-08
**Valid until:** 2026-05-22 (14 days — webhook scheme specs are stable; this research is durable. Re-verify if Phase 6 audit surfaces a Shopify or GitHub spec change.)

---

*Phase: 5-GitHub & Shopify Providers*
*Research completed: 2026-05-08*
*Next: `/gsd-plan-phase` consumes this RESEARCH.md to create PLAN.md files*
