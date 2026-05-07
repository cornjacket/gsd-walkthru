# Phase 4: Stripe Provider - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the Phase 3 stub at `src/providers/stripe.ts` with a real Stripe webhook signature validator. The factory, registry, raw-body capture, error class, error-handler, branch-type plumbing, and test conventions are LOCKED from Phases 1–3 — Phase 4 only fills in `stripeProvider.validate()`, widens the reason union with one new value, and ships the unit tests that pin down the behavior.

Concretely, Phase 4 delivers:

1. **Real `stripeProvider.validate(req, secret)`** that:
   - Parses `Stripe-Signature: t=<timestamp>,v1=<hex>[,v0=...,v1=<hex>...]`
   - Computes HMAC-SHA256 over `${timestamp}.${rawBody}` via `computeHmac()` (Phase 2)
   - Compares each `v1=` segment against the digest via `timingSafeCompare()` (Phase 2); accepts if **any** segment matches (rotation per ROADMAP SC3)
   - Enforces `now - t > tolerance` rejection with default 300s (ROADMAP SC2)
   - JSON-parses `rawBody` AFTER signature passes; populates `eventId` and `parsed` on the returned `StripeWebhook`
   - Throws `WebhookValidationError` on any failure path with the right discriminated `reason`

2. **One new reason added to the union:** `'invalid_signature_format'` (lands in the SAME commit as the test that exercises it — Phase 2 D-07 pattern).

3. **Unit tests** covering ROADMAP SC1–SC4 binding criteria plus the negative cases each new failure mode opens.

This phase delivers ZERO GitHub or Shopify validation — those land in Phase 5. No middleware/factory changes; no registry changes; no error-handler changes; no `req.webhook` type changes (the `StripeWebhook` shape was finalized in Phase 3 D-09 and Phase 4 only populates runtime values).

</domain>

<decisions>
## Implementation Decisions

### Tolerance Window

- **D-01: Past-only direction.** Reject when `now - t > tolerance` (in seconds). Future-skewed timestamps (t > now + tolerance) PASS — clock skew on Stripe's side is benign drift, and Stripe is the time source of truth here. Matches `stripe-node`'s `constructEvent`. **Do NOT** use symmetric `|now - t| > tolerance`. **Do NOT** add a forward-skew cap.

- **D-02: Default tolerance is 300 seconds, configurable.** ROADMAP SC2 binds the default. The `createWebhookMiddleware('stripe', options)` factory accepts `tolerance?: number` (seconds; planner discretion on naming — `tolerance` vs `toleranceSeconds`). When unset, defaults to `300`.

- **D-03: Populate `replayWindowMs` from the resolved tolerance.** On successful validation, the returned `StripeWebhook` carries `replayWindowMs = resolvedTolerance * 1000`. The field already exists on the branch type (Phase 3 D-09) — Phase 4 fills it. Useful for consumer-side logging/auditing without exposing secrets. **Do NOT** leave it 0/undefined.

### Stripe-Signature Header Parsing

- **D-04: Three-way failure mapping for signature errors.** Phase 4 distinguishes:
  - `Stripe-Signature` header MISSING entirely → `reason: 'missing_header'` (Phase 2 reason; Phase 4 reuses)
  - Header PRESENT but unparseable / no usable `v1=` segment → `reason: 'invalid_signature_format'` (NEW in Phase 4 — D-05)
  - Header parses fine, signature bytes don't match the computed digest → `reason: 'signature_mismatch'` (Phase 2 reason; Phase 4 reuses)
  - Header parses, signatures match, but `t=` timestamp older than tolerance → `reason: 'timestamp_too_old'` (Phase 2 reason; Phase 4 reuses)

- **D-05: Phase 4 adds exactly ONE reason: `'invalid_signature_format'`.** Final union after Phase 4:
  ```ts
  export type WebhookValidationReason =
    | 'signature_mismatch'
    | 'timestamp_too_old'
    | 'missing_header'
    | 'missing_secret'
    | 'malformed_payload'
    | 'invalid_signature_format'   // NEW in Phase 4
  ```
  Added in `src/errors.ts` in the SAME commit as the test that exercises it (Phase 2 D-07 pattern). Phase 2's `messageFor` lookup table also gains an entry for `'invalid_signature_format'`. **Do NOT** preemptively add `invalid_encoding` (Phase 5 territory).

- **D-06: `invalid_signature_format` returns HTTP 401.** Auth-failure semantics match `signature_mismatch`/`missing_header`/`timestamp_too_old` (all 401). The body is fine; the AUTH credential is malformed → unauthorized. **Do NOT** use 400 — `malformed_payload` already owns 400 for body-parse failures, which is a different category.

- **D-07: Lenient on non-v1 schemes.** The parser ignores `v0=`, `v2=`, and any other non-`v1=` segments. Validation requires **at least one parseable `v1=` segment**; if none, fail with `'invalid_signature_format'`. Matches `stripe-node`; supports Stripe Connect webhooks (which include legacy `v0=` alongside `v1=`); future-proofs against new Stripe schemes (we keep validating `v1=` until we explicitly add support for newer schemes). **Do NOT** strict-reject when non-v1 segments are present.

### Body / JSON Parsing

- **D-08: Provider JSON-parses `rawBody` AFTER signature validation passes.** Order of operations is strict:
  1. Read `req.rawBody` (Phase 3 D-06 already captured it as `Buffer`)
  2. If `rawBody` missing → throw `WebhookValidationError({ reason: 'malformed_payload', statusCode: 400 })` (Phase 3 D-07)
  3. Parse `Stripe-Signature` header. If missing/unparseable → throw with `'missing_header'` or `'invalid_signature_format'` per D-04
  4. Compute HMAC over `${t}.${rawBody.toString('utf8')}` and timing-safe-compare against each `v1=` segment
  5. If no match → throw `'signature_mismatch'`
  6. If `t` older than tolerance → throw `'timestamp_too_old'` (D-01/D-02)
  7. **Now** JSON.parse `rawBody.toString('utf8')`. If parse fails → throw `'malformed_payload'` (Phase 3 D-17 reuses cleanly)
  8. Build and return the populated `StripeWebhook`

  Parsing AFTER signature pass means JSON.parse only runs on authenticated bytes — small but real defense against parser-level DoS on attacker-controlled input.

- **D-09: Missing `body.id` does NOT fail validation; `eventId = ''`.** If the parsed object has no `id` field, or `id` isn't a string, the provider sets `eventId = ''` and proceeds. Stripe always sends `id` in practice, but the library does NOT police body schema — that's Stripe's contract with the consumer, not the validator's concern. **Do NOT** throw `'malformed_payload'` on missing `id`. **Do NOT** coerce non-string `id` via `String(...)` (loses type fidelity; surprising behavior).

- **D-10: HMAC input is exactly `${t}.${rawBody.toString('utf8')}`.** Literal period separator; timestamp first; raw-body bytes interpreted as UTF-8 (Stripe sends JSON in UTF-8). **Do NOT** use `JSON.stringify(parsed)` — that re-serializes with key-reordering risk. The whole point of `req.rawBody` is to avoid that.

### Test Strategy

- **D-11: Co-located unit tests at `src/providers/stripe.test.ts`.** Per Phase 1 D-04 / Phase 3 D-20. Phase 4 replaces the contents of the existing throwing-stub `src/providers/stripe.ts` with the real implementation; the test file is NEW.

- **D-12: ROADMAP SC4-binding test cases (REQUIRED).** All four must ship with the same commits as the implementation:
  - **Happy path** — valid `t=<recent>,v1=<correct-hex>` + matching raw body → `validate()` returns populated `StripeWebhook`
  - **Tampered body** — same valid signature, but raw body byte flipped → throws `'signature_mismatch'`
  - **Replay outside window** — `t` older than tolerance (e.g., 301s ago with default 300s) → throws `'timestamp_too_old'`; also assert tolerance is configurable (e.g., set tolerance to 60s, t at 90s ago, expect rejection)
  - **Multi-`v1=` rotation** — header has two `v1=` segments, only the second matches → returns `StripeWebhook` (rotation works)

- **D-13: Phase 4 negative-case tests (also REQUIRED for the new failure modes Phase 4 introduces).**
  - Missing `Stripe-Signature` header → `'missing_header'`
  - Garbled header (e.g., `Stripe-Signature: garbage`, no parseable `t=`/`v1=`) → `'invalid_signature_format'`
  - Header has only `v0=` (no `v1=`) → `'invalid_signature_format'`
  - Header has only `v2=` or unknown scheme → `'invalid_signature_format'` (D-07 lenience requires ≥1 `v1=`)
  - Tampered raw body, valid header → `'signature_mismatch'` (already in D-12; reused as the parse-passes-but-bytes-don't-match canary)
  - Missing `req.rawBody` (provider invoked without raw-body capture mounted) → `'malformed_payload'` (Phase 3 D-07)
  - Empty `secret` (whitespace-only) → factory-call-time throw per Phase 3 (WR-03 already enforces this; Phase 4 just verifies no regression)
  - JSON.parse failure on signed-but-non-JSON body → `'malformed_payload'` (D-08 step 7)
  - Body has no `id` → `validate()` succeeds with `eventId = ''` (D-09)

- **D-14: Reachability smoke test for the new reason.** `src/index.test.ts` extends with one assertion that `'invalid_signature_format'` is reachable through the public `WebhookValidationReason` re-export.

- **D-15: Use Phase 3 D-22 fake-provider pattern for middleware tests.** Phase 4's `src/middleware.test.ts` does NOT need updates — it already exercises the factory against a fake. Phase 4's testing scope is exclusively `src/providers/stripe.test.ts` + the `errors.test.ts` extension for the new reason + the `index.test.ts` smoke extension.

### Module Layout

- **D-16: Phase 4 modifies / creates exactly these files:**
  ```
  src/
  ├── errors.ts                  # Widen WebhookValidationReason with 'invalid_signature_format'; extend messageFor
  ├── errors.test.ts             # Extend with one new case for 'invalid_signature_format'
  ├── index.test.ts              # Extend reachability smoke test
  └── providers/
      ├── stripe.ts              # REPLACE stub validate() with real implementation
      └── stripe.test.ts         # NEW — unit tests per D-12 + D-13
  ```
  No new directories. No new public exports beyond the widened reason union (which is already re-exported via `src/index.ts`). The internal helpers (header parser, HMAC computation orchestration) live inside `src/providers/stripe.ts` unless the planner judges a sibling helper file improves readability — see Claude's Discretion.

### Claude's Discretion

- Internal file split inside `src/providers/`: a single `stripe.ts` vs `stripe.ts` + `stripe-parse.ts` (or similar). Both fine; planner picks based on `stripe.ts` size after implementation.
- Exact factory option name for tolerance: `tolerance` vs `toleranceSeconds`. Lean toward `tolerance` (matches `stripe-node`); units in JSDoc.
- Signature parser implementation: a single regex, a `String.prototype.split(',').filter(...)` pipeline, or a hand-rolled parser. Either; the test suite (D-13) is the contract.
- Exact wording of `messageFor('invalid_signature_format', 'stripe')` — likely `"stripe webhook invalid signature format"` per Phase 2's `<provider> webhook <human-readable reason>` convention; planner discretion.
- Whether `t=value` non-numeric or `v1=value` non-hex maps to `invalid_signature_format` (parser couldn't make sense of it) or `signature_mismatch` (parsed but won't match anything). Lean toward `'invalid_signature_format'` for non-hex `v1=` (it's a parse-level issue), but `'signature_mismatch'` is also defensible. The test suite (D-13) should pin one way.
- Whether the implementation lazily evaluates HMAC only after `t=` parses successfully (skip work on hopelessly-malformed headers), or always computes HMAC up to the segment-compare loop. Both fine.
- How many `v1=` segments to bound — practically unbounded is fine because each compare is cheap and rawBody size is already capped at 1mb (Phase 3 D-08); no real DoS vector.
- Whether to expose a `parseStripeSignature(header)` internal helper test directly or only test through `validate()`. Lean toward testing through `validate()` (black-box) per Phase 3's pattern; a unit-level helper test is fine but not required.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-Level
- `.planning/PROJECT.md` — Core value, "no vendor SDKs" (do NOT pull in `stripe`), constant-time comparison non-negotiable, Express-first positioning, library-never-logs.
- `.planning/REQUIREMENTS.md` — Phase 4 owns **STRP-01, STRP-02, STRP-03**. API-02 (WebhookValidationError discriminated reason) widens here with `'invalid_signature_format'`. DX-01/DX-02/DX-03 are v2 — DO NOT implement async secret, custom logging hook, or per-route typed handlers.
- `.planning/ROADMAP.md` — **Phase 4 success criteria SC1–SC4 are the binding spec.** Read them before designing the validator. SC2 binds the 300s default tolerance; SC3 binds multi-`v1=` rotation; SC4 binds the test scope.

### Phase 4 Technical References
- `.planning/research/STACK.md` — TypeScript 6.x, Vitest 4.x, tsup, Biome, Node 20/22/24, Express 4 || 5 peer. Phase 4 inherits all of this; no new stack decisions.
- `.planning/research/ARCHITECTURE.md` — Provider Interface contract, `req.webhook` discriminated union shape, Express 4 vs 5 async handling. ARCHITECTURE.md's `WebhookValidationError` shape contradicts Phase 2 D-05 (Phase 2 wins). ARCHITECTURE.md's UPPER_SNAKE reason naming contradicts ROADMAP.md (ROADMAP wins — `lowercase_underscore`).
- `.planning/research/PITFALLS.md` — **MANDATORY.** Phase-4-relevant pitfalls:
  - **#1** (timing attacks via `===`) — `timingSafeCompare()` from Phase 2 is the structural answer
  - **#3** (raw body vs parsed body) — D-10 binds HMAC input as `rawBody.toString('utf8')`, not `JSON.stringify(parsed)`
  - **#5** (leaking signatures/secrets/bodies) — Phase 2 D-11 + Phase 3 D-16 already structurally guarantee this; Phase 4's negative-case tests assert no `console.*` calls
  - **#10** (missing signature header) — `'missing_header'` reason already locked; D-04 maps it
  - **#11** (failing open on missing/empty secret) — Phase 3 WR-03 already added whitespace-only rejection; Phase 4 must NOT regress
  - **#14** (no replay-protection documentation) — Phase 7 territory; not Phase 4
- `.planning/research/FEATURES.md` — Provider-Specific Signature Schemes → Stripe section confirms `t=<ts>,v1=<hex>[,v0=...]` format, "ignore non-v1" guidance (D-07), 5-minute default tolerance (D-02), HMAC input is `[timestamp].[body]` (D-10).

### Phase Decisions That Carry Forward
- `.planning/phases/01-foundation-tooling/01-CONTEXT.md` — Co-located tests (D-04), Express as peerDependency only (D-13), no vendor SDKs (D-14), strict TypeScript settings (D-15). Phase 4 inherits all.
- `.planning/phases/02-crypto-core-error-class/02-CONTEXT.md`:
  - **D-05** `WebhookValidationError` constructor locked at `{ reason, provider, statusCode }` — Phase 4 cannot widen
  - **D-06** `messageFor()` is the single source of error wording — Phase 4 extends, does NOT change shape
  - **D-07** Reason union widens in the SAME commit as the test exercising the new reason — Phase 4 follows for `'invalid_signature_format'`
  - **D-08** Reason naming is lowercase_underscore (NOT UPPER_SNAKE)
  - **D-11** Structural no-leakage on `WebhookValidationError` serialization — Phase 4's "library never logs" inheritance builds on this
- `.planning/phases/03-body-handling-public-api-surface/03-CONTEXT.md`:
  - **D-01** Provider registry pattern — Phase 4 substitutes the stub via `registerProvider('stripe', ...)`; the existing call at the bottom of `src/providers/stripe.ts` stays
  - **D-03** Self-registration via top-level call — Phase 4 keeps this; no separate `registerStripeProvider()` export
  - **D-06** `req.rawBody` is a `Buffer` — Phase 4 reads from this property, no other source
  - **D-07** Missing `req.rawBody` → `'malformed_payload'` — Phase 4 reuses (D-08 step 2)
  - **D-09** `StripeWebhook` branch shape locked: `{ provider: 'stripe', eventId: string, timestamp: number, parsed: unknown, replayWindowMs: number }` — Phase 4 populates runtime values, does NOT widen the type
  - **D-13** Failure delegation via `next(err)` — Phase 4 throws `WebhookValidationError`; the middleware (Phase 3) wraps with `next(err)`; the provider does NOT call `next` directly
  - **D-16** Library NEVER logs — Phase 4 has zero `console.*` calls
  - **D-17** `'malformed_payload'` reason already added in Phase 3 — Phase 4 reuses for JSON.parse failures
  - **D-22** Fake-provider testing pattern — Phase 4's middleware-level integration with the real `stripeProvider` happens via the existing `src/middleware.test.ts` (no changes there); `src/providers/stripe.test.ts` tests `validate()` directly with constructed `req` fixtures
- `.planning/phases/03-body-handling-public-api-surface/03-FOLLOWUP.md` (if it exists) — review-pass deferrals; check before coding for any Phase-4-relevant items

### Phase 4 Source File Constraints
- `src/providers/stripe.ts` — REPLACE the stub `validate()` body. The `StripeWebhook` type export and the `registerProvider('stripe', stripeProvider)` call at file bottom STAY. Top comment about "Phase 3 stub" gets updated to reflect the real implementation. The `parsed: unknown` field in `StripeWebhook` is locked (WR-05 from Phase 3 review).
- `src/errors.ts` — extend the `WebhookValidationReason` union with `'invalid_signature_format'`; extend the `messageFor` lookup with the corresponding entry. NO other changes.
- `src/errors.test.ts` — extend with one new case for `'invalid_signature_format'`.
- `src/index.test.ts` — extend reachability smoke for the widened reason union.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/crypto/hmac.ts` (`computeHmac`) — Phase 4's Stripe `validate()` calls this with `(secret, '${t}.${body}', 'sha256')` (or whatever the Phase 2 signature is) and gets back the hex digest.
- `src/crypto/compare.ts` (`timingSafeCompare`) — Phase 4 calls this for each `v1=` segment vs computed digest. Returns false on length mismatch (handles unparseable hex without throwing — Phase 2 D-09).
- `src/errors.ts` (`WebhookValidationError`, `WebhookValidationReason`, `messageFor`) — Phase 4 widens the reason union with `'invalid_signature_format'` (D-05) and extends `messageFor`. Class itself unchanged.
- `src/providers/stripe.ts` — currently a throwing stub plus the `StripeWebhook` type and the `registerProvider('stripe', stripeProvider)` call. Phase 4 replaces ONLY the stub `validate()` body; type export and registration call stay.
- `src/providers/types.ts` (`Provider` interface) — `validate(req: Request, secret: string): WebhookMetadata`. Phase 4 satisfies this contract; no interface changes.
- `src/types.ts` — `StripeWebhook` is re-exported here. Phase 4 doesn't touch this file.

### Established Patterns
- **Co-located unit tests** (Phase 1 D-04, Phase 2 D-12, Phase 3 D-20) — `src/providers/stripe.test.ts` lives next to `src/providers/stripe.ts`. Phase 4 follows.
- **Reason union widening + same-commit test** (Phase 2 D-07) — Phase 4 D-05 follows for `'invalid_signature_format'`.
- **Named re-exports only in `src/index.ts`** (Phase 2 03-03 pattern) — no `export *`. Phase 4 doesn't add public exports beyond the widened reason union.
- **No `console.*` anywhere in `src/`** (Phase 3 D-16) — Phase 4's tests assert this remains true under failure paths.
- **tsup `entry` glob excludes `**/*.test.ts`** (Phase 1 WR-04) — `src/providers/stripe.test.ts` automatically excluded from `dist/`.

### Integration Points
- `src/providers/stripe.ts` ↔ `src/providers/registry.ts` — top-level `registerProvider('stripe', stripeProvider)` (Phase 3 D-03) makes the new validator visible to the factory; no factory change needed.
- `src/middleware.ts` (Phase 3) reads `getProvider('stripe')` and calls `provider.validate(req, secret)` — Phase 4's real `validate()` plugs in transparently. No middleware change.
- `src/error-handler.ts` (Phase 3) reads `err.statusCode` and `err.reason` — Phase 4's new `'invalid_signature_format'` reason needs `statusCode: 401` (D-06) so the existing handler emits the right status.
- Phase 5 reads from: `src/providers/types.ts` (interface), `src/providers/registry.ts` (registerProvider), `src/crypto/hmac.ts`, `src/crypto/compare.ts`, `src/errors.ts`. Phase 5 will widen `WebhookValidationReason` with `'invalid_encoding'` for Shopify base64-vs-hex.

</code_context>

<specifics>
## Specific Ideas

- **Tolerance-direction preference:** user explicitly chose past-only over symmetric and over past-plus-forward-cap. Planner: `now - t > tolerance` is the ONLY rejection condition; do NOT add `t > now + X` checks.
- **Reason-mapping preference:** user explicitly chose three-way distinct reasons (missing/format-invalid/byte-mismatch) over folding format-invalid into either bucket. Planner: garbled header is its OWN reason; do NOT alias it to `signature_mismatch` or `missing_header`.
- **Status-code preference for `invalid_signature_format`:** user explicitly chose 401 over 400. Planner: keep the auth-failure family aligned at 401 (signature_mismatch, missing_header, missing_secret, timestamp_too_old, invalid_signature_format all = 401); 400 stays exclusive to `malformed_payload`.
- **Provider-parses-JSON preference:** user explicitly chose YES (provider JSON.parses after signature) over leaving raw or half-parsing. Planner: provider parses; `eventId` and `parsed` come from the same parse pass; parse failure → `'malformed_payload'`.
- **Missing-`body.id` preference:** user explicitly chose `eventId = ''` over throwing `'malformed_payload'` and over coercion. Planner: NEVER fail validation on missing/non-string `id`; the validator's job is auth, not body-shape policing.
- **Unknown-scheme preference:** user explicitly chose lenient (ignore `v0`, `v2`, anything not `v1`) over strict-reject. Planner: parser keeps only `v1=` segments; if zero `v1=` segments after filtering, fail with `'invalid_signature_format'`.
- **Replay-window-metadata preference:** user explicitly chose to populate `replayWindowMs` from the resolved tolerance. Planner: on success, build `StripeWebhook` with `replayWindowMs: resolvedToleranceSeconds * 1000`.

</specifics>

<deferred>
## Deferred Ideas

- **Multi-secret support on the consumer side** (e.g., `secret: string | string[]` for client-side rotation) — not in scope; Stripe-side rotation via multi-`v1=` is sufficient for v1. Revisit only if a real consumer reports the gap.
- **Symmetric tolerance / forward-skew cap** — explicitly rejected (D-01). If a future incident shows attacker-controlled future `t=` is exploitable, revisit; the structural answer would be a forward cap, not symmetric tolerance.
- **Parser-level helper test for `parseStripeSignature(header)`** — planner discretion; not required. If the helper grows non-trivial, a direct unit test is fine.
- **`onReplayWarning` callback** — ARCHITECTURE.md mentions; v2 / Phase 7 docs territory.
- **`signature` field on `req.webhook` for debugging** — explicitly NOT shipped (Phase 3 deferred). Phase 4 maintains.
- **Async secret resolution** — REQUIREMENTS.md DX-02; v2.
- **Custom logging hook (`onError` / `onSuccess`)** — REQUIREMENTS.md DX-01; v2. Phase 4 ships zero observability surface.
- **Per-route TypeScript helpers** — REQUIREMENTS.md DX-03; v2.
- **Coverage gate (>90% on core)** — REQUIREMENTS.md QUAL-03; Phase 6.
- **Cross-cutting Supertest integration suite** — REQUIREMENTS.md QUAL-02; Phase 6. Phase 4 does NOT preempt by adding Stripe-end-to-end Supertest tests; the per-provider unit tests are the binding scope here.
- **Negative-case audit across phases** — REQUIREMENTS.md QUAL-04; Phase 6 owns the cross-cutting audit. Phase 4 ships its own negative cases (D-13) but does NOT audit Phases 5 (which doesn't exist yet).
- **README quickstart and security notes** — REQUIREMENTS.md DOCS-01, DOCS-02; Phase 7. Phase 4's planner can write inline JSDoc but defers user-facing prose.
- **Runnable example app** — REQUIREMENTS.md DOCS-03; Phase 7.

</deferred>

---

*Phase: 4-Stripe Provider*
*Context gathered: 2026-05-07*
