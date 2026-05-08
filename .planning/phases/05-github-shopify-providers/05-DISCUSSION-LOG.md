# Phase 5: GitHub & Shopify Providers - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 5-GitHub & Shopify Providers
**Areas discussed:** GitHub SHA-1 rejection reason, Shopify hex-vs-base64 rejection reason, Metadata header robustness, eventId semantics across providers

---

## Gray-Area Selection

| Area | Description | Selected |
|------|-------------|----------|
| GitHub SHA-1 rejection reason | Reason taxonomy for deprecated X-Hub-Signature (SHA-1-only) requests | ✓ |
| Shopify hex-vs-base64 rejection reason | Reason taxonomy for hex-encoded digest in X-Shopify-Hmac-Sha256 | ✓ |
| Metadata header robustness | Behavior when X-GitHub-Delivery / X-Shopify-Topic / X-Shopify-Webhook-Id missing/empty/array post-auth-pass | ✓ |
| eventId semantics across providers | Per-provider source for the cross-branch eventId field | ✓ |

User selected all four areas — full discussion across the Phase 5 surface.

---

## GitHub SHA-1 Rejection Reason

### Q1: Reason for SHA-1-only requests

| Option | Description | Selected |
|--------|-------------|----------|
| `'missing_header'` (Recommended) | Validator only ever looks at x-hub-signature-256. If absent → header is missing. Mirrors P4 D-04 'header MISSING entirely' bucket exactly. PITFALLS #9 endorses ('Always use X-Hub-Signature-256... Ignore X-Hub-Signature'). Simplest implementation — no detection of the deprecated header needed. Reuses existing reason; no union widening. | ✓ |
| New `'unsupported_algorithm'` reason | Actively detect X-Hub-Signature presence; if it's there without a -256 sibling, throw a NEW discriminated reason. More diagnostic but widens the union, needs messageFor entry, same-commit test, index reachability test. | |
| `'invalid_signature_format'` | The SHA-256 header is there but invalid — stretches the meaning. Best fit when SHA-1 header *replaces* the SHA-256 header from the validator's perspective. | |

**User's choice:** `'missing_header'`
**Notes:** Locked as D-01.

### Q2: Behavior when both SHA-1 and SHA-256 headers present

| Option | Description | Selected |
|--------|-------------|----------|
| Silently use SHA-256, ignore SHA-1 (Recommended) | Mirrors P4 D-07 'lenient on non-v1 schemes' philosophy applied to algorithm version. Matches PITFALLS #9 default and GitHub's backward-compat intent. No detection of x-hub-signature needed in the validator at all. | ✓ |
| Actively reject if SHA-1 also present | Stricter — the validator detects x-hub-signature and throws an error even when the SHA-256 header is also present. Sends a stronger 'we never accept SHA-1' signal but contradicts GitHub's standard request shape. Could break legitimate traffic. | |
| Detect-and-warn (no reject) | Validator notices the SHA-1 header but only logs/comments — doesn't reject. Violates D-16 (library-never-logs). | |

**User's choice:** Silently use SHA-256, ignore SHA-1
**Notes:** Locked as D-02. Validator never reads x-hub-signature for any purpose.

### Q3: Reason for GitHub header parse failures (sha256= prefix / non-hex)

| Option | Description | Selected |
|--------|-------------|----------|
| `'invalid_signature_format'` (Recommended) | Mirrors P4 D-04/D-07 exactly — the header is present but the validator can't parse a usable hex digest from it. Same bucket as Stripe's 'no parseable v1= segment'. Phase 4 already widened the union with this reason in P4 D-05; Phase 5 reuses, no new widening. | ✓ |
| `'signature_mismatch'` | Skip the prefix check — if it's malformed the byte compare will naturally fail. Less diagnostic; violates the explicit three-way distinction. | |
| Lenient — accept either bare hex or `sha256=<hex>` | Strip 'sha256=' if present, otherwise treat the whole header as hex digest. More forgiving but masks misconfiguration. | |

**User's choice:** `'invalid_signature_format'`
**Notes:** Locked as D-03.

### Q4: GitHub byte-compare convention

| Option | Description | Selected |
|--------|-------------|----------|
| `Buffer.from(hex, 'hex')` vs Buffer digest (Recommended) | Mirrors Phase 4 D-13 stripe pattern verbatim. computeHmac returns Buffer; Buffer.from(headerHex, 'hex') decodes; timingSafeCompare. Length-mismatch returns false (P2 D-09). One uniform pattern across providers. | ✓ |
| Compare hex strings as UTF-8 bytes | Skip the hex → binary decode; timingSafeCompare on UTF-8 bytes of both sides. Avoids Buffer.from round-trip but introduces case-sensitivity asymmetry. | |
| You decide | Planner discretion — the test contract pins behavior either way. | |

**User's choice:** `Buffer.from(hex, 'hex')` vs Buffer digest
**Notes:** Locked as D-04.

---

## Shopify Hex-vs-Base64 Rejection Reason

### Q1: Reason for hex-encoded digest in X-Shopify-Hmac-Sha256

| Option | Description | Selected |
|--------|-------------|----------|
| `'signature_mismatch'` — let bytes naturally fail (Recommended) | Buffer.from(hexString, 'base64') decodes to nonsense bytes; timing-safe-compare against the computed base64 digest fails naturally. SC3's 'rejected' criterion is satisfied regardless of which reason. Simplest — no union widening. | ✓ |
| New `'invalid_encoding'` reason | Widen the union with 'invalid_encoding' specifically for hex-in-base64-header cases. More diagnostic but adds union complexity. 04-CONTEXT line 206 anticipated this. | |
| `'invalid_signature_format'` | Reuse Phase 4's reason. Defensible if we frame 'header isn't a valid base64 digest' as the same parse-level fault as 'header isn't a parseable v1= segment'. | |

**User's choice:** `'signature_mismatch'` — let bytes naturally fail
**Notes:** Locked as D-05. **No reason union widening for Phase 5** — final union stays at 6 reasons after Phase 4. The 04-CONTEXT line 206 anticipation of `'invalid_encoding'` is explicitly rejected.

### Q2: Strictness of base64 decode

| Option | Description | Selected |
|--------|-------------|----------|
| Loose: just decode and compare (Recommended) | Buffer.from(headerValue, 'base64') as-is; let timing-safe-compare's length check (P2 D-09) reject any wrong-length result. Simpler. Hex-as-base64 case still rejects via length mismatch. Mirrors P4 D-07 'lenient on non-v1 schemes' philosophy. | ✓ |
| Tight: pre-check length & alphabet | Pre-check headerValue.length === 44 && /^[A-Za-z0-9+/]+={0,2}$/.test(headerValue) before decoding. More diagnostic on truncated/malformed input. Costs an extra branch and a magic number. | |
| You decide | Planner discretion. | |

**User's choice:** Loose: just decode and compare
**Notes:** Locked as D-06.

### Q3: Shopify header casing

| Option | Description | Selected |
|--------|-------------|----------|
| `req.headers['x-shopify-hmac-sha256']` (Recommended) | Express lowercases all header keys (HTTP/1.1 convention). Matches every other header read in the codebase. PITFALLS reference uses this form. | ✓ |
| Try multiple casings | Defensive but unnecessary — Express normalizes; the second key path is unreachable. | |
| You decide | Planner discretion. | |

**User's choice:** `req.headers['x-shopify-hmac-sha256']`
**Notes:** Locked as D-15.

### Q4: HMAC input shape (Buffer vs string)

| Option | Description | Selected |
|--------|-------------|----------|
| Pass req.rawBody Buffer directly (Recommended) | computeHmac() accepts Buffer | string. Passing the Buffer avoids a UTF-8 round-trip and is byte-for-byte what Shopify signed. Phase 4 used .toString('utf8') for the timestamp prefix; GitHub & Shopify don't have a prefix, so they pass the raw Buffer directly. | ✓ |
| rawBody.toString('utf8') for symmetry with Stripe | Pattern-match Phase 4. Symmetric look-and-feel but introduces overhead. | |
| You decide | Planner discretion. | |

**User's choice:** Pass req.rawBody Buffer directly
**Notes:** Locked as D-07. Applies to both GitHub and Shopify.

---

## Metadata Header Robustness

### Q1: Missing/empty metadata header behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Accept-and-empty: populate `''` and proceed (Recommended) | Mirror P4 D-09 ('eventId = '' if body.id missing/non-string'). Validator's job is auth, not contract-policing of vendor metadata. Set the field to `''` and let consumers decide. PROJECT.md 'documented honesty' applies. | ✓ |
| Strict: fail with `'missing_header'` for required fields | deliveryId/webhookId/topic are part of the contract per GHUB-03/SHOP-02. Fail loudly. Costs: 'missing_header' overloaded; auth-passing requests now reject on metadata. | |
| Hybrid: dedup-IDs strict, topic optional | Three-way distinction by field role. More logic but more honest. | |

**User's choice:** Accept-and-empty
**Notes:** Locked as D-08.

### Q2: Array-shaped metadata header behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Take first value if array, else `''` (Recommended) | Most pragmatic. Mirrors the accept-and-empty stance. Avoids polluting the branch-typed string field with an array. Auth has already passed. | ✓ |
| Reject the whole request | Throw 'invalid_signature_format' on array. Stricter but contradicts D-08 'accept-and-empty' — inconsistent. | |
| Take last value if array | Defensible but same idea as option 1. | |

**User's choice:** Take first value if array, else `''`
**Notes:** Locked as D-09.

### Q3: WR-03 fix in Phase 5 auth headers

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — split missing vs duplicate from day one (Recommended) | Phase 5 implements the corrected pattern: `header === undefined → 'missing_header'; typeof header !== 'string' → 'invalid_signature_format'`. Aligns with locked P4 D-04. Phase 4 still has WR-03 defect; Phase 6 negative-case audit folds the fix back into stripe.ts. | ✓ |
| Match Phase 4's current shape (also WR-03-affected) | Phase 5 mirrors Phase 4's current code exactly — array → 'missing_header'. Defers fix to Phase 6 audit. Risk: 'we copied the bug' becomes a review finding. | |
| Fix Phase 4 in this same phase | Apply corrected split to ALL THREE providers + tests in Phase 5. Bigger surface; bleeds into Phase 4 territory. | |

**User's choice:** Yes — split missing vs duplicate from day one
**Notes:** Locked as D-10. Phase 4's stripe.ts retains WR-03 defect for Phase 6 audit.

---

## eventId Semantics Across Providers

### Q1: eventId source for GitHub and Shopify

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub: deliveryId; Shopify: webhookId (Recommended) | eventId becomes 'the dedup ID for this provider'. Stripe: body.id (already locked). Cross-provider semantic = 'the canonical per-event identifier consumers should dedup on'. Provider-specific fields stay populated too (no info loss). | ✓ |
| GitHub: body.id (mirror Stripe); Shopify: body.id (mirror Stripe) | Strict pattern-match with Stripe. Symmetric across providers but: GitHub bodies don't have a canonical 'id' field at the top level. Consistent shape, weak semantic. | |
| GitHub: `''`; Shopify: `''` (always empty) | Acknowledge the cross-branch eventId field is meaningless for non-Stripe providers. Weakest semantic. | |

**User's choice:** GitHub: deliveryId; Shopify: webhookId
**Notes:** Locked as D-11.

### Q2: timestamp source for GitHub and Shopify

| Option | Description | Selected |
|--------|-------------|----------|
| Math.floor(Date.now() / 1000) at validation time (Recommended) | Receipt timestamp — useful for downstream logging/auditing. Mirrors what most webhook frameworks do for non-signed-timestamp providers. Honest — it's not what the provider signed; PROJECT.md 'documented honesty' applies. | ✓ |
| 0 (sentinel for 'no provider-signed timestamp') | Consumers pattern-match on 0 to know 'replay defense via timestamp is N/A here'. Honest; slightly awkward (consumers may forget to handle 0). | |
| Not applicable — widen the branch type to `timestamp?: number` | CONTRADICTS Phase 3 D-09 lock. Out of scope unless we want to revisit P3. | |

**User's choice:** Math.floor(Date.now() / 1000) at validation time
**Notes:** Locked as D-12.

### Q3: parsed source for GitHub and Shopify

| Option | Description | Selected |
|--------|-------------|----------|
| JSON.parse after signature (mirror Phase 4) (Recommended) | Same step order as Stripe (P4 D-08): signature passes → JSON.parse rawBody → populate `parsed`. Parse failure → 'malformed_payload' (400). GitHub & Shopify webhooks ARE always JSON in practice. Cross-provider consistency. | ✓ |
| Skip parse — set parsed = undefined or `''` | Validator doesn't parse; consumers read raw body. Out of P3 D-09 contract. | |
| Skip parse — set parsed = null | Make it explicit: parsed = null for non-Stripe providers. Type-compatible but inconsistent. | |

**User's choice:** JSON.parse after signature (mirror Phase 4)
**Notes:** Locked as D-13.

---

## Continue-or-finish Decision

| Option | Description | Selected |
|--------|-------------|----------|
| I'm ready for context | Write CONTEXT.md + DISCUSSION-LOG.md, commit, hand off to plan-phase. The 13 decisions cover SC1–SC5 binding criteria + the two roadmap gotchas + the metadata contract + cross-provider semantic alignment with Stripe. | ✓ |
| Explore more gray areas | Surface 2-4 additional gray areas based on what was learned. | |

**User's choice:** I'm ready for context
**Notes:** Discussion concluded with 13 decisions captured (D-01 through D-17, with D-15 covering header casing and D-16/D-17 covering test scope and module layout).

---

## Claude's Discretion

The following are explicitly left to the planner (planner discretion items recorded in CONTEXT.md `<decisions>` → "Claude's Discretion" section):

- File split inside `src/providers/`: single `github.ts` vs `github.ts` + `github-parse.ts`; same for Shopify
- Helper function names (e.g., `parseGitHubSignature` vs `extractGitHubHexDigest`)
- Whether to define a shared `extractFirstValue(h)` helper for D-09 array-handling vs duplicate inline
- Whether to use `crypto.timingSafeEqual` directly vs `timingSafeCompare` for GitHub hex compare
- Test fixture style: straight `it` blocks vs `it.each` parameterized tables
- Whether to share `SAMPLE_BODY`/`SAMPLE_SECRET` between github.test.ts and shopify.test.ts via a sibling fixtures file vs duplicate inline

## Deferred Ideas

Captured during discussion and surfaced in CONTEXT.md `<deferred>`:

- `'invalid_encoding'` reason — explicitly rejected D-05
- Active SHA-1 detection / reject — explicitly rejected D-02
- Strict base64 alphabet pre-check — explicitly rejected D-06
- Phase 4 WR-03 fix for stripe.ts — Phase 6 audit territory
- Phase 4 WR-01/WR-02/WR-04/WR-05 — Phase 6 audit territory
- Phase 4 IN-04 (positional tolerance) — confirmed and absorbed; Provider interface widening is v2

(Full list in CONTEXT.md.)
