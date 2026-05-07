# Phase 4: Stripe Provider - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 04-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-07
**Phase:** 4-Stripe Provider
**Areas discussed:** Tolerance window direction, Reason for malformed Stripe-Signature header, JSON parse inside the Stripe provider, Unknown signature schemes (v0/v2+)

---

## Tolerance window direction

| Option | Description | Selected |
|--------|-------------|----------|
| Past-only (Stripe's official approach) | Reject only when (now - t) > tolerance. Future timestamps pass. Matches stripe-node's constructEvent behavior. | ✓ |
| Symmetric (\|now - t\| > tolerance) | Reject if t is more than tolerance seconds in either direction. Stricter; defends against attacker-controlled future timestamps; deviates from Stripe's reference. | |
| Past-only + small future cap (e.g., 60s) | Past asymmetric (300s default) but cap forward skew at 60s. Compromise; more code, more edge cases. | |

**User's choice:** Past-only (Stripe's official approach)
**Notes:** Stripe is the time source of truth here; future-skew is benign drift. Aligns Phase 4 with stripe-node's reference implementation. Captured as D-01.

---

## Tolerance window — replayWindowMs population

| Option | Description | Selected |
|--------|-------------|----------|
| Populate replayWindowMs from the resolved tolerance | On success, replayWindowMs = tolerance * 1000. Field already exists on the StripeWebhook branch type from Phase 3 D-09. | ✓ |
| Leave replayWindowMs always 0 / undefined | Tolerance is internal; req.webhook only carries identity-shaped metadata. Field becomes vestigial. | |
| You decide | Builder judgment. | |

**User's choice:** Populate replayWindowMs from the resolved tolerance
**Notes:** Captured as D-03. Useful for consumer-side logging/auditing without exposing secrets.

---

## Reason for malformed Stripe-Signature header

| Option | Description | Selected |
|--------|-------------|----------|
| Three reasons, distinct | (a) missing_header, (b) NEW invalid_signature_format, (c) signature_mismatch. Phase 3 D-17 foreshadowed invalid_signature_format. Most diagnosable. | ✓ |
| Two reasons, fold (b) into (c) | (a) missing_header, (b)+(c) signature_mismatch. Simpler union but loses signal between malformed and tampered. | |
| Two reasons, fold (b) into (a) | (a)+(b) missing_header, (c) signature_mismatch. Misuses missing_header semantically. | |

**User's choice:** Three reasons, distinct
**Notes:** Captured as D-04 + D-05. Phase 4 widens WebhookValidationReason with exactly one new value: `'invalid_signature_format'`. Same-commit-as-test pattern per Phase 2 D-07.

---

## Reason for malformed header — HTTP status code

| Option | Description | Selected |
|--------|-------------|----------|
| 401 Unauthorized | Auth-failure semantics; matches missing_header and signature_mismatch (also 401). | ✓ |
| 400 Bad Request | The request is malformed at the HTTP level. Matches malformed_payload (400). | |
| You decide | Builder judgment. | |

**User's choice:** 401 Unauthorized
**Notes:** Captured as D-06. Keeps the auth-failure family aligned at 401; 400 stays exclusive to malformed_payload (body-parse failures).

---

## JSON parse inside the Stripe provider

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — parse, populate both | Provider JSON.parses rawBody AFTER signature passes. eventId from body.id; parsed: unknown is the parse output. JSON.parse failure → malformed_payload. | ✓ |
| No — leave parsed as raw Buffer, eventId empty | Provider only does signature work. Consumers parse themselves. Cleanest separation but req.webhook.eventId always '' is ugly. | |
| Half — parse just enough to extract eventId | Surgical: parse, grab id, discard. Wasteful (parses twice) and weird. | |

**User's choice:** Yes — parse, populate both
**Notes:** Captured as D-08. Order of operations strictly defined: signature first, then JSON.parse — only authenticated bytes get parsed. Defense against parser-level DoS on attacker-controlled input.

---

## JSON parse — missing body.id edge case

| Option | Description | Selected |
|--------|-------------|----------|
| Set eventId = '' and continue | Library doesn't fail validation over a missing optional field. Empty string signals 'no id surfaced'. | ✓ |
| Throw WebhookValidationError({ reason: 'malformed_payload' }) | Strict: a Stripe webhook must have body.id. Couples provider to Stripe's body schema. | |
| Use String(parsed.id) (coerce non-string) | Tolerant but loses type fidelity. | |

**User's choice:** Set eventId = '' and continue
**Notes:** Captured as D-09. Validator's job is auth, not body-shape policing. Stripe always sends id in practice; missing-id is a degenerate edge case that shouldn't reject auth-valid traffic.

---

## Unknown signature schemes (v0/v2+)

| Option | Description | Selected |
|--------|-------------|----------|
| Lenient — ignore non-v1, validate v1= only | Skip v0/v2/anything-else; require at least one v1= to validate. Matches stripe-node; supports Connect webhooks; future-proof. | ✓ |
| Strict — reject if any non-v1 segment present | Treat unknown schemes as 'this request expects something we don't speak.' Defensive but breaks Connect traffic and any future Stripe scheme rollout. | |
| Strict on v2+, lenient on v0 | v0 = known-legacy = ignore; anything else = reject. Captures intent more precisely but adds an explicit allowlist. | |

**User's choice:** Lenient — ignore non-v1, validate v1= only
**Notes:** Captured as D-07. Parser keeps only v1= segments after filtering; if zero v1= segments, fail with `'invalid_signature_format'`.

---

## Claude's Discretion

- Internal file split inside `src/providers/`: single `stripe.ts` vs sibling `stripe-parse.ts`. Planner picks based on `stripe.ts` size after implementation.
- Factory option name for tolerance: `tolerance` vs `toleranceSeconds` (lean toward `tolerance`).
- Signature parser implementation: regex vs split-pipeline vs hand-rolled. Test suite (D-13) is the contract.
- Exact `messageFor('invalid_signature_format', 'stripe')` wording — likely `"stripe webhook invalid signature format"` per Phase 2 convention.
- Whether `t=non-numeric` or `v1=non-hex` maps to `invalid_signature_format` (parse-level) or `signature_mismatch` (parsed-but-no-match). Lean toward `'invalid_signature_format'` for non-hex `v1=`.
- HMAC-only-after-`t=`-parses lazy evaluation vs always-compute — both fine.
- Whether to expose `parseStripeSignature(header)` as a directly-tested helper or only test through `validate()`. Lean toward black-box through `validate()`.
- Bound on max number of `v1=` segments — practically unbounded is fine (rawBody is already capped at 1mb in Phase 3 D-08; per-segment compare cost is trivial).

## Deferred Ideas

- Multi-secret support on the consumer side (`secret: string | string[]` for client-side rotation) — not in scope; Stripe-side multi-`v1=` rotation suffices for v1.
- Symmetric tolerance / forward-skew cap — explicitly rejected (D-01).
- `onReplayWarning` callback — Phase 7 / v2.
- `signature` field on `req.webhook` for debugging — explicitly NOT shipped per Phase 3 stance.
- Async secret resolution (DX-02) — v2.
- Custom logging hooks (DX-01) — v2.
- Per-route TypeScript helpers (DX-03) — v2.
- Coverage gate (>90% on core) — Phase 6 (QUAL-03).
- Cross-cutting Supertest integration suite — Phase 6 (QUAL-02). Phase 4 stays at unit-test scope per ROADMAP.
- Negative-case audit across phases — Phase 6 (QUAL-04).
- README quickstart, security notes, runnable example — Phase 7 (DOCS-01..03).
