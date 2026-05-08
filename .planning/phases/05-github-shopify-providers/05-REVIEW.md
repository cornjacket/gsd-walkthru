---
phase: 05-github-shopify-providers
reviewed: 2026-05-08T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/providers/github.ts
  - src/providers/github.test.ts
  - src/providers/shopify.ts
  - src/providers/shopify.test.ts
findings:
  blocker: 0
  warning: 3
  total: 3
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-05-08
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found (3 advisory warnings; no blockers)

## Summary

Phase 5 ships two real HMAC-SHA256 validators that replace the Phase 3 throwing
stubs. The implementations are tight: the locked decisions D-01..D-17 all hold
under verification, and several Phase 4 advisory warnings (WR-02, WR-03) were
fixed from day one as required by the context.

Concrete cross-checks performed against the locked decisions:

- D-01/D-02 (deprecated SHA-1 header invisible): `grep -cE 'x-hub-signature[^-]' src/providers/github.ts` returns **0**. The validator never reads `x-hub-signature` for any purpose. Test on github.test.ts:99-113 asserts that a SHA-1-only request throws `'missing_header'`.
- D-03 (`sha256=<hex>` parse failures → `'invalid_signature_format'`): three guards at github.ts:77-91 cover (a) missing `sha256=` prefix, (b) empty hex tail, (c) non-hex tail. Both negative paths are tested at github.test.ts:117-142.
- D-04/D-07 (HMAC input is `req.rawBody` Buffer DIRECTLY): github.ts:96 and shopify.ts:80 both call `computeHmac(req.rawBody, secret, 'sha256')` with no `.toString('utf8')` and no `${t}.` prefix. Verified divergence from stripe.ts:102-103 which prefixes with `${timestamp}.`.
- D-05/D-06 (Shopify hex-as-base64 → `'signature_mismatch'`, no `'invalid_encoding'`): shopify.ts:87-94 takes `Buffer.from(header, 'base64')` directly with no alphabet/length pre-check; length-mismatch in `timingSafeCompare` (P2 D-09) flips to false. Test at shopify.test.ts:90-118 asserts both the affirmative reason AND `not.toBe('invalid_encoding' as any)`.
- D-10 (auth-header three-way split, WR-03 fix from day one): github.ts:58-73 and shopify.ts:56-71 both split `header === undefined → 'missing_header'` from `typeof header !== 'string' → 'invalid_signature_format'`. This explicitly diverges from stripe.ts:82's `if (!header || typeof header !== 'string')` fold, which is the WR-03 defect being avoided. Tests at github.test.ts:159-174 and shopify.test.ts:139-158 both have an explicit `not.toBe('missing_header')` assertion to lock the divergence.
- D-11 (`eventId === deliveryId` for GitHub; `eventId === webhookId` for Shopify): github.ts:135 and shopify.ts:127. Both bindings are exercised at the happy-path test plus the missing-metadata tests.
- D-12 (timestamp = `Math.floor(Date.now()/1000)` at receipt time): github.ts:136, shopify.ts:128. Tests bracket `before`/`after` and use `toBeGreaterThanOrEqual` / `toBeLessThanOrEqual`.
- D-13 (step order rawBody → header → parse → HMAC → compare → metadata → JSON.parse → build): both files match the order verbatim.
- D-14 (every error-case test wraps the throw assertion in outer-guard `expect(() => ...).toThrow(...)`): hand-traced all 9 error-case `try { ... } catch` blocks in github.test.ts and 8 in shopify.test.ts — every one has the outer guard immediately above. WR-02 invariant holds.
- D-16 (`src/errors.ts` byte-for-byte unchanged): `git diff ed4b345..HEAD -- src/errors.ts` is empty. `WebhookValidationReason` union is identical (still 6 reasons; no `'invalid_encoding'`).
- D-17 (only the 4 listed files modified): `git diff --name-only ed4b345..HEAD` filtered to non-planning files yields exactly the 4 reviewed files.

Cross-cutting checks:
- No `console.*` anywhere in any of the 4 files.
- No `res.*` writes (providers throw, middleware wraps with `next(err)`).
- No `Buffer.compare`, no direct `crypto.timingSafeEqual`, no `===` on Buffer values, no early-return inside compare (P2's `timingSafeCompare` is the single chokepoint).
- No `JSON.stringify`/`String(err)` paths that include rawBody, signature, or secret in either provider; tests assert this on the error-leakage paths.
- `JSON.parse` runs only AFTER signature passes (parser-DoS defense).
- `GitHubWebhook` / `ShopifyWebhook` branch types (Phase 3 D-09) are populated only with runtime values; no union widening.
- The 3rd positional `_toleranceSeconds` argument is accepted-and-ignored on both providers (P4 IN-04 carry-over).

The findings below are **advisory warnings** with no behavior impact under any
locked-decision interpretation. None blocks shipping.

## Blockers

(none)

## Warnings

### WR-01: Empty-string `X-Hub-Signature-256` / `X-Shopify-Hmac-Sha256` is not directly tested

**Files:**
- `src/providers/github.test.ts` (no test exists)
- `src/providers/shopify.test.ts` (no test exists)

**Issue:** Both providers handle a literal empty-string auth header correctly:
- github.ts:77-83 — `''.startsWith('sha256=')` is false → `'invalid_signature_format'`.
- shopify.ts:87-94 — `Buffer.from('', 'base64')` is 0 bytes, computed is 32 bytes, `timingSafeCompare` returns false on length mismatch → `'signature_mismatch'`.

But neither is asserted by a test. An empty-string header is a realistic input
shape (header present but value blank, e.g., a misconfigured proxy or a buggy
sender), and the two providers classify it differently:
- GitHub: `'invalid_signature_format'` (no `sha256=` prefix → format failure)
- Shopify: `'signature_mismatch'` (length mismatch in compare)

That asymmetry is correct under the locked decisions (D-03 vs D-05/D-06), but
there is no test pinning either reason. A future refactor that introduces an
`if (!header)` short-circuit would silently re-classify the GitHub case as
`'missing_header'` — and no test would catch it.

**Fix:** Add one test per provider:

```ts
// src/providers/github.test.ts
it('empty-string X-Hub-Signature-256 throws invalid_signature_format (D-03)', () => {
  const req = makeReq({ signature: '', delivery: SAMPLE_DELIVERY });
  expect(() => githubProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
    WebhookValidationError
  );
  try {
    githubProvider.validate(req as any, SAMPLE_SECRET);
  } catch (err) {
    expect((err as WebhookValidationError).reason).toBe('invalid_signature_format');
    expect((err as WebhookValidationError).reason).not.toBe('missing_header');
  }
});

// src/providers/shopify.test.ts
it('empty-string X-Shopify-Hmac-Sha256 throws signature_mismatch (D-06 loose-decode)', () => {
  const req = makeReq({ signature: '', topic: SAMPLE_TOPIC, webhookId: SAMPLE_WEBHOOK_ID });
  expect(() => shopifyProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
    WebhookValidationError
  );
  try {
    shopifyProvider.validate(req as any, SAMPLE_SECRET);
  } catch (err) {
    expect((err as WebhookValidationError).reason).toBe('signature_mismatch');
    expect((err as WebhookValidationError).reason).not.toBe('missing_header');
  }
});
```

### WR-02: GitHub leakage test does not include `SAMPLE_BODY` in the rawBody under test (assertion is vacuous)

**File:** `src/providers/github.test.ts:230-251`

**Issue:** The leakage test at line 230 sets up the request like this:

```ts
const sig = makeSignature(SAMPLE_BODY, SAMPLE_SECRET);
const tampered = Buffer.from(SAMPLE_BODY.replace('opened', 'XXXXXX'));
const req = makeReq({ rawBody: tampered, signature: sig, delivery: SAMPLE_DELIVERY });
```

The `tampered` buffer contains `SAMPLE_BODY.replace('opened', 'XXXXXX')`, which
is **not equal** to `SAMPLE_BODY`. The subsequent `expect(json).not.toContain(SAMPLE_BODY)`
assertion (line 246) is therefore trivially true even if a future maintainer
introduced a leak — because the body that was actually sent is not the literal
the test asserts against. The assertion's intent is "no body bytes in the
serialization," but the implementation only checks for one specific (unsent)
substring.

This is the same vacuous-pass shape as Phase 4 WR-02 (the very defect D-14
exists to prevent), just applied to body-content leakage rather than
throw-vs-no-throw.

The shopify.test.ts:233-259 leakage test has the same shape, with the same
issue (`SAMPLE_BODY.replace('12345', 'XXXXX')` vs assertion against `SAMPLE_BODY`).

**Fix:** Either (a) assert against the actually-sent bytes, or (b) assert
against a substring guaranteed to appear in the rawBody. Option (b) is
stronger because it directly tests the threat:

```ts
// github.test.ts: assert against bytes actually present in the rawBody.
const tampered = Buffer.from(SAMPLE_BODY.replace('opened', 'XXXXXX'));
const req = makeReq({ rawBody: tampered, signature: sig, delivery: SAMPLE_DELIVERY });
// ...
const tamperedStr = tampered.toString('utf8');
expect(json).not.toContain(tamperedStr);  // bytes that were actually sent
expect(json).not.toContain('XXXXXX');     // unique substring of sent rawBody
expect(str).not.toContain(tamperedStr);
```

Apply the same fix to shopify.test.ts:233-259 (substitute `'XXXXX'` and the
`12345`-replaced body).

### WR-03: Tampered-body test assertion mixes signature_mismatch with statusCode but does not assert error.message contains no body content

**Files:**
- `src/providers/github.test.ts:82-95`
- `src/providers/shopify.test.ts:68-86`

**Issue:** The "tampered body" tests assert reason and statusCode but do not
assert that `error.message` contains no body or signature bytes. The leakage
test at the bottom of each file does cover this, but only on the
`signature_mismatch` path that runs through the same code; other error paths
(`invalid_signature_format`, `missing_header`, `malformed_payload`) get no
leakage assertion at all.

Given that `WebhookValidationError`'s `messageFor()` is deterministic and
input-independent (errors.ts:22-27), the structural guarantee from P2 D-11
already protects all paths. So this is a coverage observation, not a runtime
defect — but adding one targeted leakage assertion to the
`invalid_signature_format` test would catch the case where a future maintainer
adds a `details: { headerHex }` parameter and inadvertently widens the leakage
surface.

**Fix:** Optionally add a leakage assertion to the `'invalid_signature_format'`
test (the path most likely to gain a "helpful" error detail in a future
refactor):

```ts
// github.test.ts — add after line 128 inside the bare-hex test
expect(JSON.stringify(err)).not.toContain(bareHex);
```

This is purely defense-in-depth; the implementation provably does not leak
under any reachable path because no leakage-capable field exists on
`WebhookValidationError`.

---

_Reviewed: 2026-05-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
