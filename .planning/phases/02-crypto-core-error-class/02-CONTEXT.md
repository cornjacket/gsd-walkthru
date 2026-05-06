# Phase 2: Crypto Core & Error Class - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Internal-only security primitives that every later provider phase depends on:

1. `computeHmac(rawBody, secret, 'sha256')` — Node `crypto`-backed HMAC computation, no external deps.
2. `timingSafeCompare(a, b)` — length-mismatch-safe constant-time byte comparison built on `crypto.timingSafeEqual`.
3. `WebhookValidationError` — discriminated error class with structurally-impossible leakage of signature/secret/body content.

This phase delivers ZERO Express, HTTP, or provider-specific code. No raw-body capture, no factory, no Stripe/GitHub/Shopify knowledge. Those land in Phases 3–5. The success bar is: a developer reading `src/crypto/` and `src/errors.ts` understands the security primitives without any provider context, and the unit tests proving each primitive's behavior ship in the same commits as the code.

</domain>

<decisions>
## Implementation Decisions

### Crypto API Surface

- **D-01: `computeHmac` returns `Buffer` (raw digest bytes).** Signature: `computeHmac(rawBody: Buffer | string, secret: string, algorithm: 'sha256') -> Buffer`. The core stays encoding-neutral; each provider converts at its own boundary (Stripe→hex, GitHub→hex, Shopify→base64). Locked because v1 has three providers with three encodings and pushing the conversion outward keeps the crypto module from baking in provider assumptions.

- **D-02: `algorithm` parameter typed as the literal `'sha256'`.** All three v1 providers use SHA-256. Widening the type to `string` or `'sha256' | 'sha512'` invites unused branches. If a future provider needs SHA-1 (deprecated GitHub `X-Hub-Signature`) or SHA-512, widen the literal then.

- **D-03: `timingSafeCompare(a: Buffer, b: Buffer) -> boolean`.** Buffer-only, strict types. Length mismatch returns `false` (no throw, no exception caught — a top-level guard, not a try/catch around `crypto.timingSafeEqual`). Equal-length inputs go through `crypto.timingSafeEqual`. Providers convert hex/base64 header strings to `Buffer` at their own call site.

- **D-04: Module layout per ARCHITECTURE.md §"Recommended Project Structure".** Phase 2 creates: `src/crypto/hmac.ts`, `src/crypto/compare.ts`, `src/crypto/hmac.test.ts`, `src/crypto/compare.test.ts`, `src/errors.ts`, `src/errors.test.ts`. The `src/crypto/` directory exists for grouping; no `index.ts` barrel inside `src/crypto/` is required (planner discretion if it helps imports).

### Error Class Shape

- **D-05: Constructor accepts ONLY `{ reason, provider, statusCode }`.** No `message` parameter, no `cause`, no `details`. The constructor signature exactly matches ROADMAP success criterion 3: `new WebhookValidationError({ reason: 'signature_mismatch', provider, statusCode: 401 })`. Locked.

- **D-06: Message auto-derived from `reason` and `provider`** via a static lookup table inside `errors.ts` (e.g., `messageFor('signature_mismatch', 'stripe') -> 'stripe webhook signature mismatch'`). Caller cannot override the message — that closes the historical leak vector where developers inadvertently put secrets into a `message` string.

- **D-07: Reason union ships at exactly the 4 reasons mandated by the success criteria.**
  ```ts
  export type WebhookValidationReason =
    | 'signature_mismatch'
    | 'timestamp_too_old'
    | 'missing_header'
    | 'missing_secret'
  ```
  Each later phase widens this union in the SAME commit that ships the test exercising the new reason. Phase 3 is expected to add `malformed_payload` (raw body unavailable). Phase 5 is expected to add `invalid_encoding` (Shopify hex-vs-base64 mismatch). Phase 4 may add `invalid_signature_format` (Stripe `Stripe-Signature` header missing `t=`/`v1=` segments). These additions are out of scope for Phase 2 — DO NOT pre-add them.

- **D-08: Naming convention is lowercase_underscore** (e.g., `signature_mismatch`), per ROADMAP success criterion 3. **This overrides ARCHITECTURE.md's UPPER_SNAKE convention** (e.g., `SIGNATURE_MISMATCH`). When ARCHITECTURE.md and ROADMAP.md disagree on naming, ROADMAP wins. Planner: do not import the UPPER_SNAKE list from ARCHITECTURE.md.

- **D-09: `statusCode` is required from caller, no auto-derivation.** Caller is one of the (yet-to-be-built) providers; they know the right code for each `reason`. The phase 2 test suite uses `401` throughout. Auto-deriving from `reason` is rejected because it bakes provider-specific HTTP semantics into the error class.

- **D-10: Class fields `reason`, `provider`, `statusCode` are `readonly` and public.** `name` is set to `'WebhookValidationError'`. Standard `Error.message` is set via `super(message)` to the auto-derived message.

- **D-11: Leakage prevention is structural, not filter-based.** Because the constructor has no field for sensitive data, there is no path for signature/secret/body content to enter the instance. The `toJSON()` method returns a whitelist `{ name, reason, provider, statusCode, message }`. `toString()` falls through to the default `Error.prototype.toString` (`"WebhookValidationError: <safe message>"`). The Phase 2 test suite must include a positive assertion that `JSON.stringify(err)` and `String(err)` contain none of: a sample signature hex string, a sample secret, a sample body string. The test exists not because leakage is possible by construction, but to lock the structural guarantee against future regressions.

### Test Strategy (Phase 2 unit tests)

- **D-12: Co-located unit tests** following Phase 1 D-04. `src/crypto/hmac.test.ts`, `src/crypto/compare.test.ts`, `src/errors.test.ts`.

- **D-13: Required test cases per ROADMAP success criterion 5:**
  - `computeHmac`: produces a known digest for a known body+secret (vector check); verifies `Buffer` return type.
  - `timingSafeCompare`: equal-length match path returns `true`; equal-length mismatch returns `false`; length-mismatch returns `false` without throwing.
  - `WebhookValidationError`: constructor stores `reason`, `provider`, `statusCode`; instance is `instanceof Error`; auto-derived `message` is non-empty and contains the provider name; each of the 4 reasons round-trips via `instance.reason`; `JSON.stringify(err)` and `String(err)` do not contain a sample signature, secret, or body string.

- **D-14: No external test fixtures.** Test vectors are defined inline in the test file (a known body string + known secret + RFC-style expected digest). No `tests/fixtures/` directory yet — Phase 6 owns integration fixtures.

### Claude's Discretion

- Implementation details of `messageFor(reason, provider)` — sentence shape, capitalization, ordering. Must be deterministic and not include any input outside `reason`/`provider`.
- Whether to put `messageFor` inline in `errors.ts` or in a `message-map.ts` sibling. Both fine.
- How to validate the test vector for `computeHmac` (RFC 4231 SHA-256 vector vs a hand-computed reference). Either acceptable as long as the test pins down a known-good digest.
- Whether to declare `crypto` as `import { createHmac, timingSafeEqual } from 'node:crypto'` or `from 'crypto'`. Prefer `node:` prefix per modern Node convention.
- Whether `computeHmac` accepts `secret: string | Buffer`. Locked input type was `string` only; Buffer for secret is a Claude's-discretion widening if it costs nothing. If widening: Buffer is documented but tests cover string only.
- Whether `Buffer.from(rawBody, 'utf8')` is called explicitly when `rawBody: string`, or relies on `crypto.createHmac().update(rawBody)` accepting strings. Either acceptable; prefer the simpler path.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-Level
- `.planning/PROJECT.md` — Core value, "no vendor SDKs", "no built-in dedup store", constant-time comparison non-negotiable.
- `.planning/REQUIREMENTS.md` — Phase 2 owns CRYP-01, CRYP-02, API-02. Read the API-02 acceptance criteria before designing the error class shape.
- `.planning/ROADMAP.md` — **Phase 2 success criteria are the binding spec.** When ARCHITECTURE.md disagrees on naming/casing/constructor shape, ROADMAP wins (e.g., reason naming is lowercase_underscore not UPPER_SNAKE; constructor is options-object).

### Phase 2 Technical References
- `.planning/research/STACK.md` — Locked TypeScript 6.x, Vitest 4.x, tsup, Biome, Node 20/22/24 LTS. Phase 2 inherits all of this from Phase 1; no new stack decisions.
- `.planning/research/ARCHITECTURE.md` — **Use for module layout (`src/crypto/hmac.ts`, `src/crypto/compare.ts`, `src/errors.ts`) and the Provider interface preview only.** DO NOT import the UPPER_SNAKE error reason naming or the positional constructor signature — both contradict ROADMAP.md and ROADMAP wins.
- `.planning/research/PITFALLS.md` — **MANDATORY.** Pitfalls #1 (naive string equality) and #2 (timingSafeEqual length mismatch) are the exact failure modes Phase 2's primitives must prevent. The `timingSafeCompare` implementation must implement the length-guard pattern shown in Pitfall #2.

### Phase 1 Decisions That Carry Forward
- `.planning/phases/01-foundation-tooling/01-CONTEXT.md` — Specifically: D-04 co-located tests, D-13 `express` is peerDependency only (irrelevant here — Phase 2 has zero Express imports), D-14 no vendor SDKs, D-15 strict TypeScript with `target: ES2020`, `module: ESNext`, `moduleResolution: 'bundler'`, `declaration: true`. tsup `entry` glob already excludes `**/*.test.ts` — new test files inherit this.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/index.ts` — currently exports a placeholder `VERSION` string. Phase 2 keeps `VERSION` and adds named exports for the public surface this phase introduces: `computeHmac`, `timingSafeCompare`, `WebhookValidationError`, `WebhookValidationReason`.
- `src/index.test.ts` — Phase 1 smoke test for `VERSION`. Keep as-is; it stays green when Phase 2 lands.

### Established Patterns
- Co-located unit tests pattern set in Phase 1: `src/crypto/hmac.ts` + `src/crypto/hmac.test.ts` side by side.
- Vitest config inherits the Phase 1 default (no separate `vitest.config.ts` file at time of writing — defaults pick up `**/*.test.ts`). Planner: only add a `vitest.config.ts` if a Phase 2 test needs a config knob; otherwise leave it implicit.
- Biome inherits Phase 1's `biome.json` (recommended rules). All new Phase 2 files must `npm run lint` clean.
- tsup's `entry` glob is `['src/**/*.ts', '!src/**/*.test.ts']` — new test files in `src/crypto/` are excluded from the dist build automatically. Verify by running `npm run build` after Phase 2 lands and checking `dist/crypto/` contains no `*.test.*` artifacts.

### Integration Points
- `src/index.ts` is the public barrel. Phase 2 grows it from one export (`VERSION`) to four. Phase 3 will start consuming `WebhookValidationError` from inside the factory; Phase 4–5 will start consuming `computeHmac` and `timingSafeCompare` from the provider modules.
- Node's built-in `crypto` is the only module Phase 2 imports outside its own files.

</code_context>

<specifics>
## Specific Ideas

- **HMAC return shape preference:** user explicitly chose `Buffer` over hex-string-default and over a caller-chosen-encoding param. Planner: do NOT default to hex; do NOT add an encoding parameter to `computeHmac`. The only return type is `Buffer`.
- **timingSafeCompare strictness preference:** user explicitly chose Buffer-only over `Buffer | string` normalization and over the two-overload (`timingSafeCompare` + `timingSafeCompareHex`) variant. Planner: do NOT accept strings; do NOT ship a hex-aware sibling.
- **Reason set scope preference:** user explicitly chose minimum-4 over proactively-wider and over the open-extension `(string & {})` form. Planner: ship EXACTLY the 4 reasons. Do NOT pre-add `malformed_payload`/`invalid_encoding`/`replay_suspected`/etc. — those land in their own phases with their own tests.
- **Leakage stance preference:** user explicitly chose structural impossibility over filter-on-serialize and over the structural+`cause` hybrid. Planner: do NOT add a `cause` parameter. Do NOT add a `details` field. The constructor signature is exactly `{ reason, provider, statusCode }`.

</specifics>

<deferred>
## Deferred Ideas

- **Additional reason values** (`malformed_payload`, `invalid_encoding`, `invalid_signature_format`, `replay_suspected`, `body_missing`) — explicitly NOT in Phase 2 per D-07. Each lands in the phase that introduces the failure mode and adds the test exercising it.
- **Async secret resolution** — REQUIREMENTS.md DX-02; v2. Phase 2's `computeHmac` accepts `secret: string` only.
- **Custom logging hook on validation success/failure** — REQUIREMENTS.md DX-01; v2. Phase 2 has no logging surface.
- **Allowing a caller-supplied `cause: Error`** — discussed and rejected for Phase 2. If a future need emerges (e.g., wrapping a `JSON.parse` failure in Phase 3), revisit then with a test that proves `cause` does NOT leak through `toJSON`.
- **Error reason → statusCode auto-derivation table** — discussed and rejected (D-09). If providers end up duplicating `statusCode: 401` everywhere, revisit in a later phase.
- **Wider algorithm support** (`sha512`, deprecated `sha1`) — locked to `'sha256'` literal in D-02. Widen if/when a provider phase needs it.

</deferred>

---

*Phase: 2-Crypto Core & Error Class*
*Context gathered: 2026-05-06*
