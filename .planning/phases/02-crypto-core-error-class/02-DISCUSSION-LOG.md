# Phase 2: Crypto Core & Error Class - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-06
**Phase:** 2-crypto-core-error-class
**Areas discussed:** HMAC return shape, timingSafeCompare input types, Error reason set scope, No-leakage enforcement mechanism

---

## HMAC return shape

| Option | Description | Selected |
|--------|-------------|----------|
| Buffer (raw digest bytes) | Encoding-neutral. Each provider converts at its own boundary: Stripe→hex, GitHub→hex, Shopify→base64. Fewest assumptions baked into the core. | ✓ |
| Hex string by default | Optimizes for Stripe/GitHub (already hex). Shopify converts hex→Buffer→base64 at its boundary. Reads simpler in the common case but adds a conversion step on the Shopify path. | |
| Caller-chosen encoding param | Explicit at every call site. More verbose; widens the API surface for marginal benefit since v1 only has three providers. | |

**User's choice:** Buffer (raw digest bytes)
**Notes:** The recommended option, signature `(rawBody: Buffer | string, secret: string, algorithm: 'sha256') -> Buffer`. The crypto module stays encoding-agnostic; provider modules own the conversion to whatever encoding their target webhook uses. Drives D-01.

---

## timingSafeCompare input types

| Option | Description | Selected |
|--------|-------------|----------|
| Buffer-only — callers convert | Strict, narrow type. Forces provider code to convert header strings → Buffer at its own boundary. Easier to reason about; the comparison helper has one job: constant-time byte compare with length-mismatch safety. | ✓ |
| Buffer \| string — normalize internally | Convenient at call sites, but hides the encoding decision and risks silent false-negative if `a` is hex-encoded and `b` is base64-encoded of the same digest. | |
| Two overloads (timingSafeCompare + timingSafeCompareHex) | Most explicit; slightly more API surface for one helper module. | |

**User's choice:** Buffer-only — callers convert
**Notes:** Pairs with the HMAC choice — both `computeHmac` and `timingSafeCompare` traffic in `Buffer` only. Provider phases own header decoding. Length-mismatch returns `false` without throwing (a top-level guard before `crypto.timingSafeEqual`). Drives D-03.

---

## Error reason set scope

| Option | Description | Selected |
|--------|-------------|----------|
| Minimum 4, extend per phase | Phase 2 ships exactly the 4 reasons the success criteria require. Each later phase widens the union when it needs a new reason, in the same commit that ships the test exercising it. | ✓ |
| Proactively wider — ship full v1 set now | Bake every reason later phases will plausibly need into Phase 2's union. One cohesive reason set in errors.ts; risk of dead reasons. | |
| Minimum 4 + open extension type (`string & {}`) | Permits other strings while preserving autocomplete. Probably overkill for a closed-set library. | |

**User's choice:** Minimum 4, extend per phase
**Notes:** Reason set in Phase 2: `signature_mismatch | timestamp_too_old | missing_header | missing_secret`. New reasons land in the phase that introduces the failure mode, with the test exercising it. Drives D-07.

---

## No-leakage enforcement mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Structurally impossible | Constructor accepts ONLY `{reason, provider, statusCode}`. Message auto-derived. No path for sensitive data to enter the instance. | ✓ |
| Allow caller-supplied message, filter on serialize | Flexible; trusts caller not to put secrets into `message`, which is the historical leak vector. | |
| Structural + opt-in `cause` for non-sensitive errors | Like option 1 plus optional `cause: Error` (Node 16+). cause in stack but NOT in toJSON. Slight extension. | |

**User's choice:** Structurally impossible
**Notes:** Constructor surface is exactly `{ reason, provider, statusCode }`. Message is auto-derived from `reason`+`provider` via a static lookup. `toJSON()` returns a whitelist `{ name, reason, provider, statusCode, message }`. The Phase 2 test still asserts that `JSON.stringify(err)` and `String(err)` contain no signature/secret/body content — locks the structural guarantee against future regressions. Drives D-05, D-06, D-09, D-10, D-11.

## Claude's Discretion

- `messageFor(reason, provider)` implementation details — sentence shape, capitalization, ordering. Must be deterministic and not include any input outside `reason`/`provider`.
- Whether `messageFor` lives inline in `errors.ts` or in a `message-map.ts` sibling.
- Test vector source for `computeHmac` (RFC 4231 vector vs hand-computed reference) — either acceptable as long as the digest is pinned.
- `node:crypto` vs `crypto` import path — prefer `node:` prefix.
- Whether `computeHmac` widens `secret` to `string | Buffer` (locked input was string; Buffer is a no-cost widening).
- Whether to add a `vitest.config.ts` (only if needed; Phase 1 ran on defaults).

## Deferred Ideas

- Additional reason values (`malformed_payload`, `invalid_encoding`, `invalid_signature_format`, `replay_suspected`, `body_missing`) — added in their owning phases.
- Async secret resolution (REQUIREMENTS.md DX-02; v2).
- Custom logging hook (REQUIREMENTS.md DX-01; v2).
- Caller-supplied `cause: Error` — rejected for Phase 2; revisit only if a concrete need arises.
- Reason → statusCode auto-derivation — rejected (D-09); revisit if duplication becomes painful.
- Wider algorithm support (`sha512`, deprecated `sha1`) — locked to `'sha256'`; widen when a provider phase needs it.
