# Phase 5: GitHub & Shopify Providers - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the Phase 3 stubs at `src/providers/github.ts` and `src/providers/shopify.ts` with real HMAC-SHA256 webhook signature validators. The `Provider` interface, `registerProvider` self-registration, `WebhookValidationError` shape, `messageFor` convention, raw-body capture (`req.rawBody: Buffer`), middleware factory, error handler, branch-type plumbing (`GitHubWebhook`, `ShopifyWebhook` from Phase 3 D-09), test conventions (Vitest + co-located), and the 6-member reason union are LOCKED from Phases 1–4. **Phase 5 does NOT widen the reason union** — every failure mode reuses an existing reason.

Concretely, Phase 5 delivers:

1. **Real `githubProvider.validate(req, secret)`** that:
   - Reads `req.headers['x-hub-signature-256']` (deprecated `x-hub-signature` is invisible to the validator — D-01, D-02)
   - Strips the `sha256=` prefix; validates the tail is hex; parse failure → `'invalid_signature_format'` (D-03)
   - Computes HMAC-SHA256 over `req.rawBody` (Buffer, not UTF-8 string — D-07) via `computeHmac()` (Phase 2)
   - `Buffer.from(headerHex, 'hex')` ↔ `computed` Buffer comparison via `timingSafeCompare()` (D-04)
   - Reads `X-GitHub-Delivery` for `deliveryId`; missing/empty → `''`, validation proceeds (D-08); array-shaped → take `[0] || ''` (D-09)
   - Sets `eventId === deliveryId` (D-11), `timestamp = Math.floor(Date.now()/1000)` at validation time (D-12), `parsed` = JSON.parse of rawBody after signature passes (D-13)

2. **Real `shopifyProvider.validate(req, secret)`** that:
   - Reads `req.headers['x-shopify-hmac-sha256']` (lowercase per Express convention)
   - `Buffer.from(headerValue, 'base64')` decode — loose, no pre-check (D-06); hex-in-base64-header rejects naturally via length-mismatch in `timingSafeCompare` → `'signature_mismatch'` (D-05, P2 D-09)
   - Computes HMAC-SHA256 over `req.rawBody` Buffer directly (no `.toString('utf8')` — D-07)
   - Reads `X-Shopify-Topic` and `X-Shopify-Webhook-Id` for `topic` / `webhookId` (D-08, D-09)
   - Sets `eventId === webhookId` (D-11), `timestamp = Math.floor(Date.now()/1000)` (D-12), `parsed` = JSON.parse after signature passes (D-13)

3. **Three-way header distinction applied from day one** (D-10): `header === undefined` → `'missing_header'`; `typeof header !== 'string'` (array) → `'invalid_signature_format'`; parses-but-no-match → `'signature_mismatch'`. This is the corrected pattern from Phase 4 WR-03 — Phase 5 implements it cleanly. Phase 4's stripe.ts retains the WR-03 defect for Phase 6 audit pass to fix.

4. **Unit tests** covering ROADMAP SC1–SC5 binding criteria plus the negative cases each new provider opens.

This phase delivers ZERO new public exports beyond what Phase 3 D-19 already shipped (`GitHubWebhook`, `ShopifyWebhook`, `WebhookMetadata` are already re-exported via `src/index.ts`). No middleware change, no factory change, no registry change, no error-handler change, no `WebhookValidationReason` union widening.

</domain>

<decisions>
## Implementation Decisions

### GitHub SHA-1 Rejection (GHUB-02 / SC1)

- **D-01: SHA-1-only request → `'missing_header'`.** The validator only looks at `x-hub-signature-256`. When that header is absent (regardless of whether `x-hub-signature` is present), throw `WebhookValidationError({ reason: 'missing_header', provider: 'github', statusCode: 401 })`. Mirrors the locked P4 D-04 'header MISSING entirely' bucket. PITFALLS #9 endorses this stance ('Always use X-Hub-Signature-256... Ignore X-Hub-Signature'). **Do NOT** widen the union with `'unsupported_algorithm'` — adds union complexity for no contract gain. **Do NOT** map this to `'invalid_signature_format'` — the SHA-256 header isn't there to be malformed.

- **D-02: Validator reads `x-hub-signature-256` only; `x-hub-signature` is invisible.** When BOTH headers arrive (the standard GitHub backward-compat shape), silently use the SHA-256 header and ignore the SHA-1 header. Mirrors P4 D-07 'lenient on non-v1 schemes' philosophy applied at the algorithm-version layer. **Do NOT** actively detect-and-reject the deprecated header — would break legitimate GitHub traffic that always sends both.

### GitHub Header Parsing (GHUB-01 / SC1)

- **D-03: GitHub header parse failures → `'invalid_signature_format'`.** The header value format is `sha256=<hex>`. If the `sha256=` prefix is missing/wrong, OR the tail is non-hex, throw `'invalid_signature_format'` (the Phase 4 reason; Phase 5 reuses, no widening). Aligns with the locked 3-way distinction (P4 D-04). Same bucket as Stripe's 'no parseable v1= segment'. **Do NOT** fold to `'signature_mismatch'` — that's the bytes-don't-match bucket per D-04.

- **D-04: GitHub uses `Buffer.from(hex, 'hex')` ↔ `Buffer` digest comparison via `timingSafeCompare`.** Mirrors Phase 4 D-13 stripe pattern verbatim. `computeHmac()` returns a 32-byte raw `Buffer` (P2 hmac.ts:16, encoding-neutral by P2 D-01); the GitHub validator decodes the header hex with `Buffer.from(headerHexAfterPrefixStrip, 'hex')` and timing-safe-compares. Length-mismatch returns `false` (P2 D-09). One uniform pattern across providers.

### Shopify Encoding (SHOP-01 / SC3)

- **D-05: Hex-in-base64-header → `'signature_mismatch'`.** A hex-encoded digest in `X-Shopify-Hmac-Sha256` decodes via `Buffer.from(hexString, 'base64')` to a wrong-length byte buffer (~48 bytes from 64 hex chars, vs the 32-byte computed digest). Phase 2 D-09 length-check in `timingSafeCompare` returns `false` → throws `'signature_mismatch'`. SC3's 'rejected' criterion is satisfied regardless of which reason. **Do NOT** widen the union with `'invalid_encoding'` (the 04-CONTEXT line 206 anticipated this; the discussion explicitly rejected it). **Do NOT** pre-check the header against a base64-only regex — option D-06 below specifies loose decode.

- **D-06: Shopify base64 decode is loose.** `Buffer.from(headerValue, 'base64')` as-is — no pre-check on length or alphabet. Trust Phase 2 D-09 length-mismatch in `timingSafeCompare` to reject any wrong-length result. Whitespace, missing padding, and lenient alphabet handling are all acceptable because the byte-compare gates the actual auth. Mirrors P4 D-07 'lenient on non-v1 schemes' philosophy applied at the encoding layer. **Do NOT** add a `/^[A-Za-z0-9+/]+={0,2}$/` shape pre-check — it'd reject hex (which is also valid base64-alphabet) anyway, and the length-mismatch path already handles the case.

- **D-07: GitHub & Shopify pass `req.rawBody` Buffer directly to `computeHmac`.** No `.toString('utf8')` round-trip. The `computeHmac` signature accepts `Buffer | string` (P2 hmac.ts:16); passing the Buffer skips an unnecessary UTF-8 conversion and matches what the providers signed byte-for-byte. Stripe's `${t}.${rawBody.toString('utf8')}` (P4 D-10) stays as-is — it needs the string concat for the timestamp prefix. GitHub & Shopify are body-only, so the Buffer goes straight in.

### Header Reading Convention

- **D-15: Express normalizes header keys to lowercase.** Read `req.headers['x-shopify-hmac-sha256']`, `req.headers['x-shopify-topic']`, `req.headers['x-shopify-webhook-id']`, `req.headers['x-hub-signature-256']`, `req.headers['x-github-delivery']`. Standard Express idiom; matches every other header read in the codebase. **Do NOT** try multiple casings — Express has already normalized.

### Metadata Header Robustness (GHUB-03 / SHOP-02 / SC2 + SC4)

- **D-08: Missing/empty metadata header AFTER signature passes → field set to `''`, validation proceeds.** Mirrors P4 D-09 (`eventId = ''` if `body.id` missing/non-string). The validator's job is auth, not contract-policing of vendor metadata. Set `req.webhook.deliveryId = ''` / `req.webhook.topic = ''` / `req.webhook.webhookId = ''` and let consumers decide (e.g., they can check `=== ''` before deduping). PROJECT.md's 'documented honesty about where replay protection is missing' applies — failing post-auth on missing metadata would create a new failure mode consumers don't currently see. **Do NOT** widen the reason union with `'missing_metadata_header'` or similar.

- **D-09: Array-shaped metadata header → take `[0] || ''`.** RFC 7230 permits duplicate headers; a misbehaving proxy could deliver `req.headers['x-github-delivery'] = ['abc', 'def']`. Take the first value if present (`Array.isArray(h) ? h[0] || '' : (typeof h === 'string' ? h : '')`). Avoids polluting the branch-typed `string` field with an array. Auth has already passed, so the duplicate-header attack vector is already neutralized at the signature layer. **Do NOT** reject the whole request — would contradict D-08's accept-and-empty stance for the directly-missing case.

- **D-10: Phase 5 auth-header guards split missing vs duplicate from day one.** For `x-hub-signature-256` and `x-shopify-hmac-sha256`:
  - `header === undefined` → `'missing_header'`
  - `typeof header !== 'string'` (i.e., array, the duplicate-header case) → `'invalid_signature_format'`
  - parses-but-no-match → `'signature_mismatch'` (after byte compare)
  This implements the Phase 4 WR-03 corrected pattern from day one. Phase 4's `src/providers/stripe.ts:81-88` retains the WR-03 defect (folds array into `'missing_header'`); the Phase 6 negative-case audit (REQUIREMENTS.md QUAL-04) can fold the fix back into stripe.ts.

### Cross-Provider Semantic Alignment

- **D-11: `eventId` per provider:**
  - **Stripe:** `body.id` (locked, P4 D-09)
  - **GitHub:** `eventId === deliveryId` (sourced from `X-GitHub-Delivery`)
  - **Shopify:** `eventId === webhookId` (sourced from `X-Shopify-Webhook-Id`)

  Cross-branch semantic: `req.webhook.eventId` = "the canonical per-event dedup identifier consumers should use". Provider-specific fields (`deliveryId`, `webhookId`) stay populated independently — no info loss. A consumer reading `req.webhook?.eventId` without narrowing always gets a meaningful dedup token. **Do NOT** map GitHub/Shopify `eventId` to `body.id` (their bodies don't have a canonical top-level `id` field). **Do NOT** leave `eventId = ''` for non-Stripe providers — surprises consumers.

- **D-12: GitHub & Shopify `timestamp = Math.floor(Date.now() / 1000)` at validation time.** Receipt timestamp, not provider-signed. Honest — PROJECT.md "documented honesty about where replay protection is missing" applies; neither provider exposes a signed timestamp. Useful for downstream logging/auditing ('when did this validate'). The branch-type `timestamp: number` lock from Phase 3 D-09 stays — no widening to `timestamp?: number`. **Do NOT** lock `timestamp = 0` as a sentinel — it'd require consumer pattern-matching that adds friction. **Do NOT** revisit the P3 D-09 type lock.

- **D-13: GitHub & Shopify JSON.parse `rawBody` after signature passes (mirror P4 D-08 step 7).** Step order:
  1. Read `req.rawBody` (Phase 3 D-06 already captured it as Buffer); missing → throw `'malformed_payload'` (400) per Phase 3 D-07
  2. Read `req.headers[...]`; apply D-10 three-way split (missing → `'missing_header'`; array → `'invalid_signature_format'`)
  3. **GitHub only:** strip `sha256=` prefix; validate hex tail; parse failure → `'invalid_signature_format'` (D-03)
  4. Compute HMAC over `req.rawBody` Buffer directly via `computeHmac(rawBody, secret, 'sha256')` (D-07)
  5. Decode header value (`Buffer.from(hex, 'hex')` for GitHub; `Buffer.from(value, 'base64')` for Shopify, loose per D-06); `timingSafeCompare` against computed digest; mismatch → `'signature_mismatch'`
  6. Read metadata headers (`X-GitHub-Delivery` / `X-Shopify-Topic` / `X-Shopify-Webhook-Id`); apply D-08/D-09 missing-or-array → `''`
  7. JSON.parse `req.rawBody.toString('utf8')`; parse failure → `'malformed_payload'` (400)
  8. Build and return the populated branch type with D-11 `eventId` mapping + D-12 `timestamp`

  Parsing AFTER signature pass means JSON.parse only runs on authenticated bytes (defense against parser-level DoS on attacker-controlled input). Consumers reading `req.webhook.parsed` get a consistent populated shape across all three providers.

### Test Strategy

- **D-14: Co-located unit tests at `src/providers/github.test.ts` and `src/providers/shopify.test.ts`.** Per Phase 1 D-04 / Phase 3 D-20 / Phase 4 D-11. Phase 5 replaces the contents of the existing throwing-stub `validate()` bodies with real implementations; the test files are NEW. Each test file mirrors the structure of `src/providers/stripe.test.ts` (Phase 4 D-12 + D-13). Test scope:
  - **GitHub (SC1, SC2, SC5 binding):**
    - Happy path — valid `X-Hub-Signature-256: sha256=<correct-hex>` + matching rawBody → returns populated `GitHubWebhook` with `eventId === deliveryId`
    - Tampered body — same valid signature, raw body byte flipped → throws `'signature_mismatch'`
    - SHA-1-only — only `X-Hub-Signature` present (no `-256`) → throws `'missing_header'` (D-01)
    - Both headers — both `X-Hub-Signature-256` AND deprecated `X-Hub-Signature` present → SHA-256 validates normally; deprecated header silently ignored (D-02)
    - Missing prefix — header value is bare hex, no `sha256=` prefix → throws `'invalid_signature_format'` (D-03)
    - Non-hex tail — header value is `sha256=zzz...` → throws `'invalid_signature_format'` (D-03)
    - Missing header — `X-Hub-Signature-256` absent entirely → throws `'missing_header'` (D-10)
    - Duplicate header — `X-Hub-Signature-256` is an array → throws `'invalid_signature_format'` (D-10)
    - Missing rawBody — provider invoked without raw-body capture → throws `'malformed_payload'` (P3 D-07)
    - JSON.parse failure on signed-but-non-JSON body → throws `'malformed_payload'` (D-13 step 7)
    - Missing X-GitHub-Delivery → `validate()` succeeds with `deliveryId === ''` and `eventId === ''` (D-08, D-11)
    - Array-shaped X-GitHub-Delivery → `deliveryId === firstValue` (D-09)
    - No-leakage assertion — `JSON.stringify(err)` and `String(err)` for any thrown error contain no signature bytes / secret / body content (P3 D-16, P2 D-11 structural guarantee)
  - **Shopify (SC3, SC4, SC5 binding):**
    - Happy path — valid base64 `X-Shopify-Hmac-Sha256` + matching rawBody → returns populated `ShopifyWebhook` with `eventId === webhookId`
    - Tampered body — same valid signature, raw body byte flipped → throws `'signature_mismatch'`
    - Hex-encoded digest — same digest in hex (64 chars instead of 44 base64) → throws `'signature_mismatch'` (D-05; rejection via length-mismatch path)
    - Missing header — `X-Shopify-Hmac-Sha256` absent → throws `'missing_header'` (D-10)
    - Duplicate header — `X-Shopify-Hmac-Sha256` is an array → throws `'invalid_signature_format'` (D-10)
    - Missing rawBody — provider invoked without raw-body capture → throws `'malformed_payload'` (P3 D-07)
    - JSON.parse failure on signed-but-non-JSON body → throws `'malformed_payload'` (D-13 step 7)
    - Missing X-Shopify-Topic → `topic === ''`, validation proceeds (D-08)
    - Missing X-Shopify-Webhook-Id → `webhookId === ''`, `eventId === ''` (D-08, D-11)
    - Array-shaped X-Shopify-Topic → `topic === firstValue` (D-09)
    - No-leakage assertion — same as GitHub above

  All tests use `expect(() => ...).toThrow(WebhookValidationError)` outer guard before inspecting `.reason` / `.statusCode` (Phase 4 WR-02 corrected pattern from day one — do NOT repeat the WR-02 vacuous-pass defect).

- **D-16: No reachability smoke test changes.** Phase 5 adds ZERO new reasons to the `WebhookValidationReason` union (D-05, D-08 explicitly rejected widening). `src/index.test.ts` is untouched. `src/errors.ts` is untouched. `src/errors.test.ts` is untouched. This is a pure provider-implementation phase.

### Module Layout

- **D-17: Phase 5 modifies / creates exactly these files:**
  ```
  src/
  └── providers/
      ├── github.ts           # REPLACE stub validate() with real implementation
      ├── github.test.ts      # NEW — unit tests per D-14
      ├── shopify.ts          # REPLACE stub validate() with real implementation
      └── shopify.test.ts     # NEW — unit tests per D-14
  ```

  No new directories. No new public exports. No changes to `src/errors.ts`, `src/middleware.ts`, `src/error-handler.ts`, `src/providers/registry.ts`, `src/providers/types.ts`, `src/types.ts`, `src/index.ts`, or any test file outside the two new ones. Internal helpers (header parser, base64 decode wrapper) live inside the respective provider module unless the planner judges a sibling helper file improves readability — see Claude's Discretion.

### Claude's Discretion

- Internal file split inside `src/providers/`: a single `github.ts` vs `github.ts` + `github-parse.ts`, same question for Shopify. Both fine; planner picks based on file size after implementation.
- Exact wording of helper-function names: e.g., `parseGitHubSignature(header)` vs `extractGitHubHexDigest(header)`. Either; the test suite is the contract.
- Whether to define a tiny shared `extractFirstValue(h: string | string[] | undefined): string` helper for D-09 array-handling, or duplicate the 3-line check in each metadata read. Both fine; lean toward inline duplication if total uses ≤ 5.
- Whether GitHub validates `t=` non-numeric (P4 WR-05 carry-over) — N/A for GitHub (no timestamp); Phase 5 does NOT need to address WR-05 because it doesn't ship a timestamp parser.
- Whether to use `crypto.timingSafeEqual` directly (since lengths are now known equal in the GitHub hex case after `Buffer.from(headerHex, 'hex')` produces a fixed-length buffer) vs `timingSafeCompare` from Phase 2. Lean toward `timingSafeCompare` (P2 D-09 length-mismatch safety is still useful when the header hex is malformed-but-prefix-stripped).
- Test fixture style: real Vitest `it`/`describe` blocks vs `it.each` parameterized tables. Both fine; Phase 4's stripe.test.ts uses straight `it` blocks — same shape is fine here for consistency.
- Whether to stash a tiny `SAMPLE_BODY` / `SAMPLE_SECRET` shared between github.test.ts and shopify.test.ts via a sibling test-fixtures file, or duplicate inline. Lean toward inline duplication (test files stay self-contained per Phase 1 D-04 spirit).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-Level
- `.planning/PROJECT.md` — Core value, "no vendor SDKs" (do NOT pull in `@octokit/webhooks` for GitHub or any Shopify lib), constant-time comparison non-negotiable, Express-first positioning, library-never-logs, "documented honesty about where replay protection is missing" (D-12 receipt-timestamp aligns with this).
- `.planning/REQUIREMENTS.md` — Phase 5 owns **GHUB-01, GHUB-02, GHUB-03, SHOP-01, SHOP-02**. DX-01/DX-02/DX-03 are v2 — DO NOT implement async secret resolution, custom logging hook, or per-route typed handlers. PROV-01/PROV-02/PROV-03 (Slack/Twilio/generic) are v2.
- `.planning/ROADMAP.md` — **Phase 5 success criteria SC1–SC5 are the binding spec.** SC1 binds GitHub happy-path + SHA-1 rejection. SC2 binds `req.webhook.deliveryId` exposure from `X-GitHub-Delivery`. SC3 binds Shopify base64 happy-path + hex rejection. SC4 binds `req.webhook.topic` and `req.webhook.webhookId` exposure. SC5 binds the test scope.

### Phase 5 Technical References
- `.planning/research/STACK.md` — TypeScript 6.x, Vitest 4.x, tsup, Biome, Node 20/22/24, Express 4 || 5 peer. Phase 5 inherits all of this; no new stack decisions.
- `.planning/research/ARCHITECTURE.md` — Provider Interface contract, `req.webhook` discriminated union shape, Express 4 vs 5 async handling. ARCHITECTURE's UPPER_SNAKE reason naming contradicts ROADMAP (ROADMAP wins — `lowercase_underscore`); Phase 4 already established this and Phase 5 inherits.
- `.planning/research/PITFALLS.md` — **MANDATORY.** Phase-5-relevant pitfalls:
  - **#1, #2** (timing attacks via `===` / mismatched buffer lengths) — `timingSafeCompare()` from Phase 2 is the structural answer; D-04 + D-06 reuse the locked pattern
  - **#3** (raw body vs parsed body) — D-07 binds HMAC input as `req.rawBody` Buffer directly
  - **#5** (leaking signatures/secrets/bodies) — Phase 2 D-11 + Phase 3 D-16 already structurally guarantee this; Phase 5's negative-case tests assert no `console.*` calls and no leakage in serialized errors
  - **#8** (hex vs base64 encoding confusion) — D-05 + D-06 directly address this for Shopify
  - **#9** (X-Hub-Signature-256 vs deprecated X-Hub-Signature) — D-01 + D-02 directly address this for GitHub
  - **#10** (missing signature header) — `'missing_header'` reason already locked; D-10 maps it
  - **#11** (failing open on missing/empty secret) — Phase 3 WR-03 already added whitespace-only rejection at factory call time; Phase 5 must NOT regress
  - **#13** (Shopify HMAC header vs body location) — already addressed; D-15 reads the header explicitly
  - **#14** (no replay-protection documentation) — Phase 7 territory; Phase 5 ships D-12 receipt-timestamp; the "no provider-signed timestamp for GitHub/Shopify" prose is Phase 7 README scope
- `.planning/research/FEATURES.md` — Provider-Specific Signature Schemes:
  - GitHub section confirms `sha256=<hex>` format, `X-GitHub-Delivery` UUID for dedup, no provider-signed timestamp, optional legacy `X-Hub-Signature` (SHA-1) backward-compat header
  - Shopify section confirms base64-encoded HMAC, `X-Shopify-Webhook-Id` for idempotency, `X-Shopify-Topic` for routing, no provider-signed timestamp, base64-vs-hex as 'the most common integration footgun'

### Phase Decisions That Carry Forward
- `.planning/phases/01-foundation-tooling/01-CONTEXT.md` — Co-located tests (D-04), Express as peerDependency only (D-13), no vendor SDKs (D-14), strict TypeScript settings (D-15). Phase 5 inherits all.
- `.planning/phases/02-crypto-core-error-class/02-CONTEXT.md`:
  - **D-01** `computeHmac()` returns raw `Buffer` (encoding-neutral) — Phase 5 D-07 leverages this directly (no UTF-8 round-trip)
  - **D-05** `WebhookValidationError` constructor locked at `{ reason, provider, statusCode }` — Phase 5 cannot widen
  - **D-06** `messageFor()` is the single source of error wording — Phase 5 reuses (no new reasons added, so no extension needed)
  - **D-07** Reason union widens in the SAME commit as the test exercising the new reason — Phase 5 adds NO new reasons (D-05 + D-08 explicit) so this rule has nothing to fire on
  - **D-08** Reason naming is lowercase_underscore — locked
  - **D-09** `timingSafeCompare` returns false on length-mismatch (no throw) — Phase 5 D-05 (Shopify hex-as-base64) and D-06 (loose base64 decode) both depend structurally on this
  - **D-11** Structural no-leakage on `WebhookValidationError` serialization — Phase 5's negative-case tests verify
- `.planning/phases/03-body-handling-public-api-surface/03-CONTEXT.md`:
  - **D-01** Provider registry pattern — Phase 5 substitutes the stubs via the existing `registerProvider(...)` calls; the registration calls at the bottom of `github.ts` and `shopify.ts` STAY
  - **D-03** Self-registration via top-level call — Phase 5 keeps this; no separate `registerGitHubProvider()` / `registerShopifyProvider()` exports
  - **D-06** `req.rawBody` is a `Buffer` — Phase 5 D-07 reads from this property, no other source
  - **D-07** Missing `req.rawBody` → `'malformed_payload'` (400) — Phase 5 D-13 step 1 reuses
  - **D-09** Branch shapes locked: `GitHubWebhook = { provider: 'github', eventId, timestamp, parsed: unknown, deliveryId }` and `ShopifyWebhook = { provider: 'shopify', eventId, timestamp, parsed: unknown, topic, webhookId }` — Phase 5 populates runtime values, does NOT widen the types
  - **D-13** Failure delegation via `next(err)` — Phase 5 throws `WebhookValidationError`; the middleware (Phase 3) wraps with `next(err)`; the providers do NOT call `next` directly
  - **D-16** Library NEVER logs — Phase 5 has zero `console.*` calls in `src/providers/github.ts` and `src/providers/shopify.ts`
  - **D-17** `'malformed_payload'` reason — Phase 5 reuses for JSON.parse failures (D-13 step 7)
  - **D-19** Public barrel — Phase 3 already re-exports `GitHubWebhook`, `ShopifyWebhook`, `WebhookMetadata`; Phase 5 doesn't touch `src/index.ts`
  - **D-20** Co-located test convention — `src/providers/github.test.ts` and `src/providers/shopify.test.ts`
  - **D-22** Fake-provider testing pattern — Phase 5's middleware-level integration with the real providers happens via the existing `src/middleware.test.ts` (no changes there); the new test files test `validate()` directly with constructed `req` fixtures
  - **WR-05** `parsed: unknown` (not `Record<string, unknown>`) on every branch — Phase 5 honors; consumers must narrow before key-access
- `.planning/phases/04-stripe-provider/04-CONTEXT.md`:
  - **D-04** Three-way header failure mapping (missing / unparseable / no-match) — Phase 5 D-03 + D-10 inherit; D-10 fixes the WR-03 array-handling defect from day one
  - **D-08** Step order (rawBody → header → parse → HMAC → compare → JSON.parse → build) — Phase 5 D-13 follows the same structure
  - **D-09** Missing `body.id` → `eventId = ''` — Phase 5 D-08 generalizes the same accept-and-empty pattern to metadata headers
  - **D-10** HMAC input bytes — Stripe uses `${t}.${rawBody.toString('utf8')}` (timestamp prefix); Phase 5 D-07 uses `rawBody` Buffer directly (no prefix), no UTF-8 round-trip
  - **D-11** Co-located unit tests — Phase 5 D-14 follows
  - **D-13** Test scope per provider (happy + tampered + negative cases) — Phase 5 D-14 mirrors structure for both providers
  - **D-16** Module layout (only the provider files + their test files change) — Phase 5 D-17 mirrors

- `.planning/phases/04-stripe-provider/04-REVIEW.md` — 5 advisory warnings + 4 info items from the Phase 4 code review. Phase-5-relevant carry-overs:
  - **WR-03** (multi-header array misclassified as `'missing_header'` instead of `'invalid_signature_format'`) — Phase 5 D-10 implements the corrected three-way split from day one in github.ts and shopify.ts; Phase 4's stripe.ts retains the defect for Phase 6 audit pass to fix
  - **WR-02** (vacuous-pass tests when `validate()` doesn't throw) — Phase 5 D-14 explicitly requires `expect(() => ...).toThrow(WebhookValidationError)` outer guard before inspecting `.reason` / `.statusCode`; do NOT repeat the WR-02 defect
  - **IN-04** (tolerance positionally passed to all providers, including GitHub/Shopify) — confirmed: GitHub's `validate(req, secret, _toleranceSeconds?)` and Shopify's `validate(req, secret, _toleranceSeconds?)` accept the 3rd positional arg with `_` prefix to silently ignore it. The Provider interface lock from D-16 means we cannot widen to an options object in v1.
  - WR-01 (NaN tolerance), WR-04 (default-tolerance literal), WR-05 (parseInt timestamp leniency) — Stripe-specific; NOT carried into Phase 5 (no tolerance, no timestamp parsing)
  - IN-01, IN-02, IN-03 — Stripe-specific style nits; NOT carried
- `.planning/phases/04-stripe-provider/04-VERIFICATION.md` — Phase 4 verified 4/4 SCs green; Phase 5 builds on a green Phase 4 baseline.

### Phase 5 Source File Constraints
- `src/providers/github.ts` — REPLACE the stub `validate()` body (currently throws `'GitHub provider not yet implemented (Phase 5)'`). The `GitHubWebhook` type export and the `registerProvider('github', githubProvider)` call at file bottom STAY. Top comment about "Phase 3 stub" gets updated to reflect the real implementation. The `parsed: unknown` field on `GitHubWebhook` is locked (Phase 3 WR-05).
- `src/providers/shopify.ts` — REPLACE the stub `validate()` body (currently throws `'Shopify provider not yet implemented (Phase 5)'`). The `ShopifyWebhook` type export and the `registerProvider('shopify', shopifyProvider)` call at file bottom STAY. Top comment updated similarly. The `parsed: unknown` field is locked.
- `src/providers/github.test.ts` — NEW. Co-located. Tests via `validate()` direct invocation (not through the middleware factory — that path is covered by Phase 3's fake-provider tests).
- `src/providers/shopify.test.ts` — NEW. Same shape.
- `src/errors.ts` — UNTOUCHED in Phase 5 (no reason widening per D-05 + D-08).
- `src/errors.test.ts` — UNTOUCHED.
- `src/index.ts`, `src/index.test.ts` — UNTOUCHED.
- `src/middleware.ts`, `src/middleware.test.ts` — UNTOUCHED.
- `src/providers/registry.ts`, `src/providers/registry.test.ts`, `src/providers/types.ts` — UNTOUCHED.
- `src/types.ts` — UNTOUCHED (already re-exports the three branch types).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/crypto/hmac.ts` (`computeHmac`) — Phase 5 calls this with `(rawBody: Buffer, secret: string, 'sha256')` and gets back a 32-byte `Buffer` digest. Encoding-neutral (P2 D-01) — each provider converts at its own boundary.
- `src/crypto/compare.ts` (`timingSafeCompare`) — Phase 5 calls this for `(headerDecodedBuffer, computedDigestBuffer)`. Returns `false` on length mismatch (P2 D-09) — Shopify's hex-as-base64 case (D-05) depends structurally on this.
- `src/errors.ts` (`WebhookValidationError`, `WebhookValidationReason`, `messageFor`) — Phase 5 throws these via `new WebhookValidationError({ reason, provider, statusCode })`. Reason union is the 6-member shape locked after Phase 4; Phase 5 adds nothing.
- `src/providers/github.ts` — currently a throwing stub plus the `GitHubWebhook` type and `registerProvider('github', githubProvider)` call. Phase 5 replaces ONLY the stub `validate()` body.
- `src/providers/shopify.ts` — same shape; Phase 5 replaces ONLY the stub `validate()` body.
- `src/providers/types.ts` (`Provider` interface) — `validate(req: Request, secret: string): WebhookMetadata`. Phase 5 satisfies this contract; no interface changes. (The 3rd `tolerance` positional arg is type-erased at the middleware-factory cast site per Phase 4 IN-02; Phase 5's validators accept it as an unused `_toleranceSeconds?: number`.)
- `src/providers/stripe.ts` — read for reference; do NOT modify. The structural patterns (3-way header check, step order, error throwing) are the template Phase 5 adapts.
- `src/providers/stripe.test.ts` — read for reference; do NOT modify. The fixture builder pattern (`makeReq({ body, signature })`) and the `expect(() => ...).toThrow(...)` outer-guard pattern are the template Phase 5 adapts.

### Established Patterns
- **Co-located unit tests** (Phase 1 D-04, Phase 2 D-12, Phase 3 D-20, Phase 4 D-11) — `src/providers/github.test.ts` lives next to `github.ts`; same for shopify. Phase 5 follows.
- **Three-way header distinction** (Phase 4 D-04): missing → `'missing_header'`; unparseable → `'invalid_signature_format'`; no-match → `'signature_mismatch'`. Phase 5 D-10 implements the corrected pattern (Phase 4's stripe.ts has the WR-03 defect to be fixed in Phase 6 audit).
- **Step order** (Phase 4 D-08): rawBody → header → parse → HMAC → compare → JSON.parse-after-success → build. Phase 5 D-13 mirrors with one addition: metadata header reads (D-08, D-09) happen between the byte-compare step and the JSON.parse step.
- **HMAC input convention**: Stripe uses `${t}.${rawBody.toString('utf8')}` (P4 D-10); GitHub & Shopify use `req.rawBody` Buffer directly (D-07). The provider is the convention-owner for the HMAC input shape.
- **`expect(() => ...).toThrow()` outer guard before `try/catch` introspection** — Phase 4 D-12 pattern; Phase 4 WR-02 flagged 4 tests that violated this. Phase 5 D-14 implements correctly from day one.
- **No `console.*` anywhere in `src/`** (Phase 3 D-16) — Phase 5's tests assert this remains true under failure paths for the new providers.
- **tsup `entry` glob excludes `**/*.test.ts`** (Phase 1 WR-04) — `src/providers/{github,shopify}.test.ts` automatically excluded from `dist/`.
- **Named re-exports only in `src/index.ts`** (Phase 2 03-03 pattern) — no `export *`. Phase 5 doesn't add public exports beyond what Phase 3 already shipped.

### Integration Points
- `src/providers/github.ts` ↔ `src/providers/registry.ts` — top-level `registerProvider('github', githubProvider)` (Phase 3 D-03) makes the new validator visible to the factory; no factory change needed.
- `src/providers/shopify.ts` ↔ `src/providers/registry.ts` — same.
- `src/middleware.ts` (Phase 3) reads `getProvider('github' | 'shopify')` and calls `provider.validate(req, secret, tolerance)` — Phase 5's real `validate()` plugs in transparently. The 3rd tolerance arg is silently ignored by both providers (Phase 4 IN-04 carry-over). No middleware change.
- `src/error-handler.ts` (Phase 3) reads `err.statusCode` and `err.reason` — Phase 5's failure paths all use existing reasons (`'missing_header'`, `'invalid_signature_format'`, `'signature_mismatch'`, `'malformed_payload'`); the existing handler emits the right status codes.
- `src/index.ts` (Phase 3) — already side-effect imports `./providers/github.js` and `./providers/shopify.js` so the registration calls fire (Phase 3 D-03 + D-19). Phase 5 inherits — no change.
- Phase 6 reads from: `src/providers/github.ts`, `src/providers/shopify.ts`, the test files Phase 5 ships. Phase 6 owns the cross-provider Supertest integration suite (QUAL-02), the >90% coverage gate (QUAL-03), and the negative-case audit (QUAL-04 — including the WR-03 fix for stripe.ts that Phase 5 explicitly defers).

</code_context>

<specifics>
## Specific Ideas

- **GitHub SHA-1 stance:** user explicitly chose 'missing_header' over widening with 'unsupported_algorithm' over 'invalid_signature_format'. Planner: validator looks ONLY at `x-hub-signature-256`; the deprecated `x-hub-signature` is invisible. Do NOT detect it; do NOT reject it actively. PITFALLS #9 'Always use X-Hub-Signature-256... Ignore X-Hub-Signature' applies verbatim.
- **GitHub dual-header stance:** user explicitly chose silent-use-SHA-256 over actively-reject. Planner: NEVER add code that detects the presence of `x-hub-signature` for any purpose. The validator's read on that header name should be zero in all phases.
- **GitHub parse-failure reason:** user explicitly chose 'invalid_signature_format' over 'signature_mismatch' over lenient-prefix-handling. Planner: bare hex (no `sha256=` prefix) is a parse-level fault → `'invalid_signature_format'`. Non-hex tail same.
- **GitHub byte-compare convention:** user explicitly chose Buffer-on-both-sides over UTF-8-byte string compare. Planner: `Buffer.from(headerHex, 'hex')` and `computed` Buffer; `timingSafeCompare`. Mirrors Stripe.
- **Shopify hex-as-base64 reason:** user explicitly chose 'signature_mismatch' (let bytes naturally fail) over widening with 'invalid_encoding' over 'invalid_signature_format'. Planner: NO union widening for Phase 5. The 04-CONTEXT line 206 anticipation of `'invalid_encoding'` is explicitly rejected. Trust P2 D-09 length-mismatch path.
- **Shopify base64 strictness:** user explicitly chose loose-decode over tight-pre-check. Planner: `Buffer.from(headerValue, 'base64')` directly; no length pre-check, no alphabet pre-check.
- **HMAC input convention:** user explicitly chose pass-Buffer-directly over `.toString('utf8')` round-trip. Planner: `computeHmac(req.rawBody, secret, 'sha256')` for GitHub & Shopify. Stripe stays on its prefixed-string variant.
- **Header casing:** user explicitly chose Express-lowercase-convention over multi-casing-defense. Planner: `req.headers['x-shopify-hmac-sha256']`, `req.headers['x-hub-signature-256']`, `req.headers['x-github-delivery']`, `req.headers['x-shopify-topic']`, `req.headers['x-shopify-webhook-id']`.
- **Metadata-missing stance:** user explicitly chose accept-and-empty over fail-with-missing-header over hybrid. Planner: validator's job is auth, not contract-policing. Set `''` and proceed. Mirrors P4 D-09 for body.id.
- **Metadata-array stance:** user explicitly chose take-first-or-empty over reject-whole-request over take-last. Planner: `Array.isArray(h) ? (h[0] || '') : (typeof h === 'string' ? h : '')`. Auth has already passed by this point; the duplicate-header attack is moot.
- **Auth-header WR-03 fix from day one:** user explicitly chose split-from-day-one over match-Phase-4-bug over fix-Phase-4-too. Planner: `header === undefined → 'missing_header'; typeof header !== 'string' → 'invalid_signature_format'`. Phase 4's stripe.ts stays defective; Phase 6 audit fixes it.
- **eventId mapping:** user explicitly chose deliveryId/webhookId over body.id-mirror over always-empty. Planner: GitHub eventId === deliveryId; Shopify eventId === webhookId; Stripe stays on body.id (locked).
- **Timestamp mapping:** user explicitly chose Math.floor(Date.now()/1000) at validation time over 0-sentinel over widening-the-type. Planner: receipt timestamp; honest about no provider-signed timestamp.
- **Body-parse stance:** user explicitly chose JSON.parse-after-signature (mirror Phase 4) over skip-parse over null-parsed. Planner: GitHub & Shopify parse rawBody after signature passes; populate `parsed`; parse failure → `'malformed_payload'`. Cross-provider consistency.

</specifics>

<deferred>
## Deferred Ideas

- **`'invalid_encoding'` reason for Shopify** — anticipated by 04-CONTEXT line 206; explicitly rejected in Phase 5 D-05. Revisit only if a real consumer reports the hex-as-base64 diagnostic gap (today they see `'signature_mismatch'`, which is technically correct but less specific). Would require widening the union, adding messageFor entry, same-commit test, index reachability test.
- **Active SHA-1 detection / reject** — Phase 5 D-02 explicitly rejected. Revisit only if GitHub deprecates the legacy header entirely AND the library wants to actively reject any SHA-1-bearing request. Today they ship both, so any active rejection breaks legitimate traffic.
- **Strict base64 alphabet pre-check on Shopify header** — Phase 5 D-06 explicitly rejected. Revisit only if a real consumer reports a misleading `'signature_mismatch'` on a malformed-base64 header that should be `'invalid_signature_format'`.
- **Phase 4 WR-03 fix for stripe.ts** — Phase 5 D-10 implements the corrected pattern for new providers but leaves Phase 4's stripe.ts as-is (folds array → `'missing_header'`). Phase 6 negative-case audit (QUAL-04) is the right place to fold the fix back into stripe.ts plus add the corresponding test fixture.
- **Phase 4 WR-01 (NaN tolerance silently disables replay)** — Stripe-specific; NOT a Phase 5 concern (GitHub/Shopify have no tolerance). Phase 6 audit territory.
- **Phase 4 WR-02 (vacuous-pass tests in stripe.test.ts)** — Phase 5 implements the corrected `expect(() => ...).toThrow()` outer-guard pattern from day one (D-14); the fix to stripe.test.ts itself is Phase 6 audit territory.
- **Phase 4 WR-04 (default-tolerance constant duplication)** — Stripe-specific. Phase 6 audit.
- **Phase 4 WR-05 (parseInt timestamp leniency)** — Stripe-specific (Phase 5 has no timestamp parser). Phase 6 audit.
- **Phase 4 IN-04 (tolerance positionally passed to all providers)** — confirmed and absorbed: GitHub & Shopify accept `_toleranceSeconds?: number` and silently ignore. The cleaner long-term shape (options-object on Provider.validate) requires widening the Provider interface, which v1 does not allow.
- **Provider interface widening to an options object** — DX-01/DX-02/DX-03 v2 territory. Phase 5 stays on the locked positional signature.
- **Async secret resolution / custom logging hook / per-route typed handlers** — REQUIREMENTS.md DX-01..DX-03; v2.
- **Slack / Twilio / generic HMAC providers** — REQUIREMENTS.md PROV-01..PROV-03; v2.
- **Coverage gate (>90% on core)** — REQUIREMENTS.md QUAL-03; Phase 6.
- **Cross-cutting Supertest integration suite** — REQUIREMENTS.md QUAL-02; Phase 6. Phase 5 does NOT preempt by adding GitHub/Shopify-end-to-end Supertest tests; the per-provider unit tests are the binding scope here.
- **Negative-case audit across phases** — REQUIREMENTS.md QUAL-04; Phase 6 owns the cross-cutting audit. Phase 5 ships its own negative cases (D-14) but does NOT audit Phase 4 (which has WR-01..WR-05 to clean up).
- **README per-provider quickstart, security notes, replay-protection caveats prose** — REQUIREMENTS.md DOCS-01, DOCS-02; Phase 7. Phase 5's planner can write inline JSDoc but defers user-facing prose.
- **Runnable example app demonstrating GitHub & Shopify webhooks** — REQUIREMENTS.md DOCS-03; Phase 7.
- **Cloudflare Workers / Edge Runtime support** — research/FEATURES.md notes this; v2.
- **npm publishing** — v2.

</deferred>

---

*Phase: 5-GitHub & Shopify Providers*
*Context gathered: 2026-05-08*
