# Phase 6: Integration Tests, Coverage Gate & Negative-Case Audit - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 is the cross-cutting quality gate that closes out v1's testing story. By the time this phase runs, unit tests for crypto, the error class, raw-body capture, the public API surface, and each provider already exist (shipped co-located in Phases 2–5). Phase 6 owns three things and only three things:

1. **Supertest integration suite** at `tests/integration/{stripe,github,shopify}.test.ts` (location locked by P1 D-05) — exercises every provider end-to-end through a real Express app (mounting, raw-body capture, success path, failure path) under BOTH body-parser modes ("mounted before `express.json()`" AND "alongside `express.json({verify: captureRawBody})`"). Satisfies QUAL-02 + binds BODY-01 + BODY-02 at the integration tier.

2. **Coverage tooling + enforced >90% gate** in CI on `src/crypto/`, `src/providers/`, and `src/middleware.ts` (the strict ROADMAP SC2 scope). Provider is `@vitest/coverage-v8`; threshold mechanism is per-file via Vitest's `coverage.thresholds.perFile = true`; gate runs on a single canonical CI cell (Node 22 × Express 5.x). Other 5 matrix cells stay test-only. Satisfies QUAL-03.

3. **Negative-case audit pass** that closes the 8 advisory carry-overs surfaced in `04-REVIEW.md` (5 items) and `05-REVIEW.md` (3 items), plus a one-shot manual mutation experiment proving the suite "demonstrably fails when each guard is removed" (ROADMAP SC3). Five mutations, integration-tier verification, evidence in `06-VERIFICATION.md`. Satisfies QUAL-04.

Phase 6 explicitly does NOT:

- Widen `WebhookValidationReason` (P5 D-16 lock — still 6 reasons; no `'invalid_encoding'`, no `'unsupported_algorithm'`).
- Introduce npm publishing, README content, or the example app (Phase 7 territory).
- Refactor any locked Phase 1–5 decision (Provider interface, branch types, registry, error class shape, messageFor convention, raw-body Buffer convention, three-way header split).
- Touch `src/index.ts` or add new public exports.
- Change the existing 3×2 CI matrix shape (additions only — a coverage step on one cell).

The audit-fix scope DOES touch source: `src/middleware.ts` (WR-01 NaN guard, WR-04 default-tolerance dedupe), `src/providers/stripe.ts` (WR-03 array-header three-way split, WR-05 strict numeric `t=`), `src/providers/stripe.test.ts` (WR-02 outer toThrow guards), `src/providers/github.test.ts` and `src/providers/shopify.test.ts` (WR-01 empty-string tests, WR-02 vacuous body-leakage fix, WR-03 defense-in-depth leakage assert). All advisory; none widens any locked union or interface.

</domain>

<decisions>
## Implementation Decisions

### Coverage Tooling & Gate

- **D-01: Coverage provider = `@vitest/coverage-v8`.** Native V8 coverage — no instrumentation pass, ~zero overhead, no source-map mismatches with tsup output. Vitest's default recommendation. Add `@vitest/coverage-v8` to devDependencies. **Do NOT** install `@vitest/coverage-istanbul` — V8's branch-coverage gap vs Istanbul is irrelevant given the >90% gate has plenty of headroom on this codebase.

- **D-02: Coverage scope is the strict ROADMAP SC2 list.** `coverage.include` MUST be exactly `['src/crypto/**', 'src/providers/**', 'src/middleware.ts']`. Other `src/` files (`errors.ts`, `error-handler.ts`, `raw-body/**`, `types.ts`, `index.ts`) are still measured and reported in the text output, but are NOT gated. Mirrors ROADMAP SC2 verbatim. **Do NOT** expand to all of `src/` — would re-litigate SC scope. **Do NOT** drop to aggregate-only — per-file is the stronger contract.

- **D-03: Threshold mechanism = `coverage.thresholds.perFile = true` with `statements/branches/functions/lines: 90`.** Single source of truth in `vitest.config.ts`. Vitest fails the test run if ANY file in the `coverage.include` scope drops below 90% on any of the four metrics. **Do NOT** introduce an external `scripts/check-coverage.mjs` — adds a maintenance surface and obscures the contract.

- **D-04: Coverage gate runs on ONE canonical CI cell (Node 22 × Express 5.x).** Coverage is a code-shape gate, not a runtime-compat gate. Adds a "Coverage" step to the existing `.github/workflows/test.yml` job that runs only when `matrix.node-version == '22.x' && matrix.express-version == '5.x'`. Other 5 cells stay test-only. **Do NOT** run coverage on every cell (~6× collection overhead, no upside — V8 coverage is Node-version-agnostic for this codebase). **Do NOT** create a separate `coverage.yml` workflow (extra YAML to maintain; no need for the separation in v1).

- **D-05: V8 ignore-comment policy = DISALLOW.** No `/* v8 ignore next */` directives anywhere in `src/`. If the >90% gate trips, the fix is a real test or a refactor that removes the genuinely-unreachable code — not a comment that hides it. Stronger gate signal. The one suspect line today (`provider!` non-null assertion at `middleware.ts:113`, flagged as P4 IN-01) gets either (a) covered via a Phase 6 integration test that exercises the closure path, or (b) refactored to a runtime check that's coverable. **Do NOT** allow `/* v8 ignore */` as a "justification escape hatch" — bypasses the contract.

- **D-06: Vitest test `include` MUST expand for `tests/integration/`.** Current `vitest.config.ts:5` is `include: ['src/**/*.test.ts']`. Phase 6 adds `'tests/integration/**/*.test.ts'`. Phase 1 D-05 reserved this directory; Phase 6 is the first phase that actually uses it. The `tests/integration/` files will be auto-excluded from `coverage.include` (which is restricted by D-02) but are picked up as test files.

- **D-07: `npm run test:coverage` script alias.** Add `"test:coverage": "vitest run --coverage"` to `package.json` scripts. Mirrors the existing `test`/`lint`/`format`/`typecheck` style. Planner discretion on the exact name (`coverage` vs `test:coverage`); lean `test:coverage` for the namespacing consistency.

### Integration Suite Layout

- **D-08: File granularity = one file per provider.** `tests/integration/stripe.test.ts`, `tests/integration/github.test.ts`, `tests/integration/shopify.test.ts`. Each file mounts a real Express app with that one provider, exercises happy + failure paths against it via Supertest. Mirrors the unit-test file shape (one test file per source module). Coverage report cleanly attributes lines to the provider being exercised. **Do NOT** consolidate into one `all-providers.test.ts` (one file's failure obscures which provider broke). **Do NOT** add a separate `cross-provider.test.ts` until a real cross-provider scenario emerges (deferred).

- **D-09: Express app builder = per-test factory.** A `makeApp(provider, options)` helper at the top of each integration file (or in a tiny `tests/integration/_helpers.ts` if cross-file reuse is needed) returns a fresh Express instance per test. Maximum isolation — no leaked state between tests. Standard Supertest pattern; mirrors the Phase 3 `src/middleware.test.ts` shape. **Do NOT** build a shared module-level app (state leak risk). **Do NOT** stand up a `tests/integration/fixtures/` package (overkill for ~3-5 tests per provider).

- **D-10: BOTH body-parser modes per provider.** Each provider's integration file has TWO `describe()` groups: "mounted before `express.json()`" and "alongside `express.json({verify: captureRawBody})`". Confirms BODY-01 + BODY-02 hold across all three providers under real Supertest traffic. Captures the BODY-02 "documented integration pattern" as runnable code that ships in the repo (the README in Phase 7 references the integration tests as the canonical example). **Do NOT** test only the mounted-before mode — leaves the `verify` callback path uncovered at integration tier despite BODY-02 being a real public contract.

- **D-11: Signed-payload generation = inline duplicate per integration file.** Each `tests/integration/{provider}.test.ts` has its own ~5-line `makeSignature` helper. Mirrors the Phase 1 D-04 / Phase 4 D-12 / Phase 5 D-14 inline-duplication convention used in unit tests. Total ~15 duplicated lines across 3 files. **Do NOT** extract to `tests/integration/_signers.ts` until duplication exceeds ~30 lines or 4+ files. **Do NOT** refactor the unit-test helpers (Phase 5 just shipped them; touching them adds churn for marginal DRY gain).

### Carry-Over Audit Scope (in-scope for fix)

- **D-12: P4 WR-03 — Stripe array-header three-way split, FIX.** `src/providers/stripe.ts:81-88` currently folds `header === undefined` and `typeof header !== 'string'` into one `'missing_header'` throw. Split into the corrected pattern (mirrors Phase 5 D-10 verbatim):
  - `header === undefined` → `'missing_header'`
  - `typeof header !== 'string'` (array/duplicate header) → `'invalid_signature_format'`
  - parses-but-no-match → `'signature_mismatch'` (existing path)

  Add a corresponding test in `src/providers/stripe.test.ts` constructing `headers: { 'stripe-signature': ['t=1,v1=abc', 't=2,v1=def'] }` and asserting `'invalid_signature_format'` AND `not.toBe('missing_header')`. Phase 5 D-10 explicitly promised Phase 6 closes this asymmetry.

- **D-13: P4 WR-01 — `tolerance: NaN` factory-time guard, FIX.** In `src/middleware.ts` immediately after the secret check, add:
  ```typescript
  if (options.tolerance !== undefined) {
    if (typeof options.tolerance !== 'number' || !Number.isFinite(options.tolerance) || options.tolerance < 0) {
      throw new Error(
        `Webhook tolerance must be a non-negative finite number for provider '${providerName}' (got ${String(options.tolerance)})`
      );
    }
  }
  ```
  Mirrors Phase 3 WR-03 loud-fail-at-factory precedent (whitespace-only secret throws plain `Error` at factory call time). Add tests in `src/middleware.test.ts` covering: `tolerance: NaN` throws; `tolerance: -1` throws; `tolerance: Infinity` throws; `tolerance: 0` accepted (explicit safe-fail); `tolerance: undefined` defaults to 300. Closes the silent-replay-bypass risk.

- **D-14: P4 WR-05 — Strict numeric `t=` parser, FIX.** In `src/providers/stripe.ts`, gate `parseInt` on a strict-numeric regex check first:
  ```typescript
  if (key === 't') {
    if (/^-?\d+$/.test(value)) {
      const ts = parseInt(value, 10);
      if (!isNaN(ts)) timestamp = ts;
    }
  }
  ```
  Restores the D-04 three-way mapping symmetry (parse-level fault → `'invalid_signature_format'`, not a misleading `'signature_mismatch'`). Add a test fixture for `t=1700000000xyz,v1=<hex>` asserting `'invalid_signature_format'`.

- **D-15: Remaining advisory bundle, ALL FIX:**
  - **P4 WR-02:** Add outer `expect(() => ...).toThrow(WebhookValidationError)` guards to the 4 vacuous-pass tests at `src/providers/stripe.test.ts:152-165, 167-180, 198-210, 243-259`. Phase 5 D-14 explicitly required this from day one for new providers; this closes the gap on the legacy stripe.test.ts.
  - **P5 WR-01:** Add empty-string sig tests pinning the cross-provider asymmetry. GitHub: `signature: ''` → `'invalid_signature_format'` (no `sha256=` prefix). Shopify: `signature: ''` → `'signature_mismatch'` (length-mismatch in compare). ~20 lines total. Locks the locked-decision asymmetry against future-refactor regression.
  - **P5 WR-02:** Fix vacuous body-leakage assertions at `src/providers/github.test.ts:230` and `src/providers/shopify.test.ts:233`. Currently asserts `not.toContain(SAMPLE_BODY)` against a `tampered` buffer that doesn't equal `SAMPLE_BODY` — trivially true. Fix: assert against the bytes actually sent (`tampered.toString('utf8')`) AND a unique substring of the sent body (`'XXXXXX'` for GitHub, `'XXXXX'` for Shopify).
  - **P4 WR-04:** Deduplicate the default-tolerance literal `300`. Choose option (B) from the review: remove the default from `stripe.ts:70` validate signature (`toleranceSeconds: number` with no default), force the middleware to always pass it explicitly. Single source of truth lives in `src/middleware.ts`. Update the one direct caller in `stripe.test.ts` to pass `300` explicitly (makes the contract clearer). **Do NOT** create a `DEFAULT_STRIPE_TOLERANCE_SECONDS` constant export — would couple middleware to a stripe-specific name in v1.

- **D-16: P5 WR-03 — Defense-in-depth leakage assertions, ADD.** Add one extra `expect(JSON.stringify(err)).not.toContain(<bareHex>)` line per provider in the existing `'invalid_signature_format'` tests in `src/providers/github.test.ts` and `src/providers/shopify.test.ts`. ~4 lines total. Future-refactor insurance against someone adding a `details: { headerHex }` parameter to `WebhookValidationError` and inadvertently widening the leakage surface. Implementation provably can't leak today (P2 D-11 structural guarantee), but the assertion locks the contract.

### "Fails When Guard Removed" Verification

- **D-17: Manual mutation experiment, integration-tier verification, evidence in 06-VERIFICATION.md.** Satisfies ROADMAP SC3's "demonstrably fails when each guard is removed" clause. Five mutations (the exact ROADMAP-5 list), each verified against an INTEGRATION test (the new layer Phase 6 ships):
  1. Comment out the HMAC compare in `src/providers/stripe.ts` → tampered-body integration test fails
  2. Make `timingSafeCompare` always return `true` in `src/crypto/compare.ts` → wrong-secret integration test fails
  3. Remove the `header === undefined` guard in `src/providers/stripe.ts` → missing-header integration test fails
  4. Remove the `age > tolerance` check in `src/providers/stripe.ts` → Stripe-replay integration test fails
  5. Swap `Buffer.from(header, 'base64')` to `Buffer.from(header, 'hex')` in `src/providers/shopify.ts` → Shopify-encoding integration test fails

  Each mutation fails an integration test, not just a unit test — strongest evidence that the integration tier earns its keep. **Do NOT** install Stryker (overkill for portfolio v1; adds a real tool dependency and 5–15 minute mutation runs). **Do NOT** write a custom `scripts/test-guard-removal.mjs` (sed-based mutations are brittle to source drift).

- **D-18: Mutation experiment evidence lives in 06-VERIFICATION.md under a "Guard Removal Demonstrations" section.** Five-row markdown table: `guard | mutation (file:line + change) | failed test(s) | reverted (yes/no)`. Single source of truth alongside the SC1/SC2/SC4 evidence. Verifier writes the section after execution. **Do NOT** create a separate `06-MUTATION-EVIDENCE.md` (premature file split). **Do NOT** capture inline in commit messages (harder to find later).

- **D-19: Mutation discipline = sequential, no commits, verify clean tree.** For each of the 5 guards: edit (don't commit) → `npm test` → capture failing test name(s) → `git checkout -- <file>` to revert → next. After all 5: `git status` MUST report clean tree. The mutation evidence table goes into `06-VERIFICATION.md` in a normal commit. Zero noise in git history; the only artifact is the evidence table. **Do NOT** create a throwaway `phase-6-mutation-evidence` branch (overhead for no surviving artifact). **Do NOT** write `tests/mutation/` fixtures (re-implementing src/, brittle to drift).

### Claude's Discretion

- **Plan-decomposition shape.** Likely candidates: (P1) coverage tooling install + vitest config + CI step + script alias; (P2) integration suite (3 files, both body-parser modes per file); (P3) audit-fix bundle (D-12..D-16 — could split into stripe-source-fixes vs test-file-fixes); (P4) mutation experiment + 06-VERIFICATION.md "Guard Removal Demonstrations" section. Planner picks based on dependency graph and parallelism (P2 and P3 are largely independent; P1 is a prereq for the coverage CI step but not for the integration suite tests themselves; P4 can run last and depends on P2 + P3 being complete).
- **Order of mutation steps within D-17.** Any order is fine; lean alphabetical-by-guard or in the ROADMAP-listed order for VERIFICATION readability.
- **Whether to write `tests/integration/_helpers.ts`** for the `makeApp` factory if it's identical across all three integration files. Lean toward inline duplication first; extract only if the helper grows past ~10 lines per file.
- **Whether to refactor `provider!` at `middleware.ts:113` (P4 IN-01) as part of D-05.** If the integration tests cover the closure path and coverage stays >90% without the assertion, leave it. If the gate trips on that line, refactor to a runtime check inside the closure rather than allow `/* v8 ignore */`.
- **Naming of the empty-string test cases** (D-15 P5 WR-01 bullet). Either `'empty-string X-Hub-Signature-256 throws invalid_signature_format'` or shorter — planner judgment.
- **Test fixture naming inside integration files.** `SAMPLE_PAYLOAD` vs `STRIPE_FIXTURE` vs `EVENT` — planner judgment.
- **Whether the stripe.test.ts D-15 P4 WR-04 dedup change should also export a const for documentation purposes.** Lean against; the JSDoc on `CreateWebhookMiddlewareOptions.tolerance` already says `@default 300` and that's the consumer-facing source of truth.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-Level
- `.planning/PROJECT.md` — Core value, "no vendor SDKs" (do NOT pull in Codecov/Coveralls SDK; lcov upload deferred), constant-time comparison non-negotiable, library-never-logs (no `console.*` in `src/`), Express-first positioning. The active "Comprehensive test coverage (unit + integration against a real Express app)" line maps directly to this phase.
- `.planning/REQUIREMENTS.md` — Phase 6 owns **QUAL-01, QUAL-02, QUAL-03, QUAL-04**. DOCS-01..DOCS-03 are Phase 7 (do NOT preempt with README content during this phase). DX-01..DX-03 / PROV-01..PROV-03 / DIST-01 are v2.
- `.planning/ROADMAP.md` Phase 6 — **SC1–SC4 are the binding spec.** SC1 = Supertest end-to-end across all three providers. SC2 = >90% coverage gate on `src/crypto/`, `src/providers/`, `src/middleware.ts` enforced in CI. SC3 = "demonstrably fails when each guard is removed" — covering tampered body, wrong secret, missing header, Stripe replay, Shopify encoding (the ROADMAP-5 list D-17 mutates against). SC4 = QUAL-01 holistic review + close any gaps surfaced.

### Phase 6 Technical References
- `.planning/research/STACK.md` — Vitest 4.1.5 + Supertest 7.2.2 already devDeps; `@vitest/coverage-v8` NOT yet installed (D-01 adds it). Node 20/22/24 × Express 4.21.x/5.x matrix.
- `.planning/research/PITFALLS.md` — **MANDATORY.** Phase-6-relevant pitfalls:
  - **#1, #2** (timing attacks via `===` / mismatched buffer lengths) — D-17 mutation #2 (compare → always-true) directly tests this guard
  - **#3** (raw body vs parsed body) — D-10 BOTH body-parser modes per provider verify both integration paths preserve raw body
  - **#5** (leaking signatures/secrets/bodies) — D-15 P5 WR-02 fix corrects vacuous body-leakage assertions; D-16 adds defense-in-depth leakage assertions on the `'invalid_signature_format'` paths
  - **#11** (failing open on missing/empty secret) — D-13 P4 WR-01 fix adds the loud-fail factory guard for tolerance misconfig (mirrors the existing P3 WR-03 secret guard)
- `.planning/research/FEATURES.md` — Provider-specific signature schemes; the integration tests' fixtures must produce headers that match the documented shapes (`Stripe-Signature: t=...,v1=...`; `X-Hub-Signature-256: sha256=<hex>`; `X-Shopify-Hmac-Sha256: <base64>`).

### Phase Decisions That Carry Forward
- `.planning/phases/01-foundation-tooling/01-CONTEXT.md`:
  - **D-04** Co-located unit tests in `src/` — Phase 6 honors for the audit-fix changes to existing unit tests (they stay co-located).
  - **D-05** `tests/integration/` reserved for Phase 6 Supertest suite — **THIS PHASE EXECUTES THIS RESERVATION.** D-08 places the three new integration files exactly here.
  - **D-06** tsup must exclude `**/*.test.ts` from `dist/` — Phase 6 honors; integration tests under `tests/integration/` are also outside the tsup `entry` glob, so already excluded.
  - **D-07** Full Node × Express 3×2 CI matrix (6 jobs) — Phase 6 D-04 adds a coverage step that runs only on the canonical cell, no matrix changes.
  - **D-08** CI runs `biome check`, `tsup` build, `vitest run` per cell — Phase 6 adds a 4th step on the canonical cell only: `vitest run --coverage`.
- `.planning/phases/02-crypto-core-error-class/02-CONTEXT.md`:
  - **D-05** `WebhookValidationError` constructor locked at `{ reason, provider, statusCode }` — Phase 6 audit MUST NOT widen.
  - **D-08** Reason naming = `lowercase_underscore` — locked.
  - **D-09** `timingSafeCompare` returns false on length-mismatch (no throw) — D-17 mutation #2 directly tests this guard.
  - **D-11** Structural no-leakage on `WebhookValidationError` serialization — D-15 P5 WR-02 + D-16 add tests that lock this contract against future refactor.
- `.planning/phases/03-body-handling-public-api-surface/03-CONTEXT.md`:
  - **D-06** `req.rawBody` is a `Buffer` — D-10 both body-parser modes verify this.
  - **D-07** Missing `req.rawBody` → `'malformed_payload'` (400) — already covered by Phase 3/4/5 unit tests; integration suite re-verifies under real Supertest traffic.
  - **D-13** Failure delegation via `next(err)` — integration tests assert HTTP 401 status code (the response shape produced by `error-handler.ts` after `next(err)`).
  - **D-16** Library NEVER logs — D-15 audit fixes MUST NOT add `console.*`; integration tests assert this remains true.
  - **D-17** `'malformed_payload'` reason — Phase 6 audit doesn't add or remove reasons.
  - **D-21** Phase 3's Supertest usage was bounded to factory/middleware-shape tests; Phase 6 owns the cross-cutting Supertest coverage gate — **THIS PHASE.**
  - **WR-03** Whitespace-only secret loud-fails at factory call time — D-13 mirrors this precedent for the tolerance-misconfig guard.
- `.planning/phases/04-stripe-provider/04-CONTEXT.md`:
  - **D-04** Three-way header failure mapping (missing / unparseable / no-match) — D-12 implements the corrected mapping in stripe.ts (Phase 4's stripe.ts had the WR-03 defect; Phase 5 implemented the corrected pattern in github.ts/shopify.ts; Phase 6 closes the asymmetry).
  - **D-08** Step order — Phase 6 audit MUST NOT change.
  - **D-10** Stripe HMAC input = `${t}.${rawBody.toString('utf8')}` — locked.
  - **D-13** Per-provider unit-test scope — Phase 6 audit fixes specific WR items inside the existing tests, MUST NOT alter the scope shape.
- `.planning/phases/04-stripe-provider/04-REVIEW.md` — **MANDATORY.** All five WR items (WR-01, WR-02, WR-03, WR-04, WR-05) are in-scope for the Phase 6 audit per D-12/D-13/D-14/D-15. The 4 IN items: IN-01 may surface during D-05 V8-coverage work (the `provider!` line); IN-02/IN-03 are Phase 7+ style nits; IN-04 (tolerance positionally passed to all providers) is already absorbed by Phase 5's accept-and-ignore pattern.
- `.planning/phases/05-github-shopify-providers/05-CONTEXT.md`:
  - **D-10** Three-way auth-header split implemented from day one in github.ts/shopify.ts — Phase 6 D-12 closes the matching gap in stripe.ts.
  - **D-14** Outer-`toThrow` guard convention required from day one for new tests — Phase 6 D-15 P4 WR-02 closes the matching gap in stripe.test.ts.
  - **D-16** No `WebhookValidationReason` widening — Phase 6 audit MUST NOT widen (still 6 reasons).
- `.planning/phases/05-github-shopify-providers/05-REVIEW.md` — **MANDATORY.** All three WR items are in-scope for the Phase 6 audit per D-15 (P5 WR-01 empty-string tests, P5 WR-02 vacuous body-leakage fix) and D-16 (P5 WR-03 defense-in-depth leakage assertions).
- `.planning/phases/05-github-shopify-providers/05-VERIFICATION.md` — Phase 5 verified 5/5 SCs green; Phase 6 builds on a green Phase 5 baseline (110/110 tests across 13 files).

### Phase 6 Source File Constraints
- `tests/integration/stripe.test.ts` — **NEW.** Per D-08/D-09/D-10/D-11.
- `tests/integration/github.test.ts` — **NEW.** Per D-08/D-09/D-10/D-11.
- `tests/integration/shopify.test.ts` — **NEW.** Per D-08/D-09/D-10/D-11.
- `vitest.config.ts` — MODIFY: expand test `include` (D-06); add `coverage` block (D-01..D-05).
- `package.json` — MODIFY: add `@vitest/coverage-v8` to devDependencies; add `"test:coverage"` script (D-07).
- `.github/workflows/test.yml` — MODIFY: add a coverage step on the canonical (Node 22 × Express 5.x) cell only (D-04).
- `src/middleware.ts` — MODIFY: add tolerance loud-fail guard (D-13); accept the WR-04 dedupe by always passing `tolerance` explicitly to validate (D-15 P4 WR-04).
- `src/providers/stripe.ts` — MODIFY: split header guard into three-way (D-12); tighten `t=` parser to strict-numeric (D-14); remove the `toleranceSeconds = 300` default in the validate signature (D-15 P4 WR-04).
- `src/providers/stripe.test.ts` — MODIFY: add outer toThrow guards to 4 vacuous tests (D-15 P4 WR-02); add D-12 array-header test fixture; add D-14 strict-numeric `t=` test fixture; update happy-path test to pass `300` explicitly (D-15 P4 WR-04).
- `src/providers/github.test.ts` — MODIFY: add empty-string sig test (D-15 P5 WR-01); fix vacuous body-leakage assertion at line 230 (D-15 P5 WR-02); add defense-in-depth leakage assertion on invalid_signature_format path (D-16).
- `src/providers/shopify.test.ts` — MODIFY: add empty-string sig test (D-15 P5 WR-01); fix vacuous body-leakage assertion at line 233 (D-15 P5 WR-02); add defense-in-depth leakage assertion on invalid_signature_format path (D-16).
- `src/middleware.test.ts` — MODIFY: add tolerance loud-fail tests (D-13).
- `src/errors.ts`, `src/errors.test.ts` — UNTOUCHED. No reason widening.
- `src/index.ts`, `src/index.test.ts` — UNTOUCHED. No new public exports.
- `src/error-handler.ts`, `src/raw-body/**`, `src/types.ts`, `src/providers/types.ts`, `src/providers/registry.ts`, `src/providers/github.ts`, `src/providers/shopify.ts` — UNTOUCHED.
- `06-VERIFICATION.md` — verifier writes it (per gsd-verifier convention) with an additional "Guard Removal Demonstrations" section per D-18.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/middleware.ts` (`createWebhookMiddleware`) — Phase 6's integration tests construct apps via `createWebhookMiddleware('stripe' | 'github' | 'shopify', { secret })` exactly as a real consumer would. The tolerance loud-fail guard (D-13) lands in this file.
- `src/raw-body/captureRawBody` — Phase 6's "alongside `express.json({verify})`" mode (D-10) calls `app.use(express.json({ verify: captureRawBody }))`. Helper already exists from Phase 3.
- `src/raw-body/rawBodyCapture` standalone middleware — Phase 6's "mounted before `express.json()`" mode (D-10) calls `app.use(rawBodyCapture())` before the provider middleware.
- `src/error-handler.ts` (`webhookErrorHandler`) — Phase 6's integration tests can mount this OR rely on Express's default error handler (which surfaces `err.statusCode` to the response). Planner picks; lean toward mounting `webhookErrorHandler()` since it's the documented integration pattern.
- `src/providers/{stripe,github,shopify}.test.ts` — fixture-builder patterns (`makeReq`, `makeSignature`) and the outer-`toThrow` guard convention. Phase 6's integration tests adapt the fixture-builder shape to construct a real HTTP request via Supertest instead of a fake `req`.
- `vitest.config.ts` — single source of truth for test config; D-01..D-06 all land here.

### Established Patterns
- **Co-located unit tests in `src/`** (P1 D-04) — Phase 6's audit-fix changes to existing test files honor this. Integration tests at `tests/integration/` are the documented exception (P1 D-05).
- **Three-way header distinction** (P4 D-04) — Phase 5's github.ts/shopify.ts implement; Phase 6 D-12 closes the gap in stripe.ts.
- **Outer-`toThrow` guard convention** (P5 D-14) — Phase 5's github.test.ts/shopify.test.ts implement from day one; Phase 6 D-15 (P4 WR-02 bullet) closes the gap in stripe.test.ts.
- **Loud-fail at factory call time for misconfig** (P3 WR-03) — secret whitespace-only throws plain `Error` at factory call time. Phase 6 D-13 mirrors this precedent for tolerance NaN/non-finite/negative.
- **Library NEVER logs** (P3 D-16) — Phase 6 audit fixes MUST NOT add `console.*`; the integration tests assert no log emission on failure paths.
- **No `WebhookValidationReason` widening** (P5 D-16) — locked at 6 reasons through v1.
- **CI step shape** (P1 D-08) — `biome check` → `tsup` build → `vitest run`. Phase 6 D-04 adds `vitest run --coverage` as a 4th step on one canonical cell.
- **Supertest already a devDep** (P3 D-21) — no additional install needed for the integration suite; only `@vitest/coverage-v8` is new.

### Integration Points
- `tests/integration/{provider}.test.ts` ↔ `src/middleware.ts` ↔ `src/providers/{provider}.ts` — integration tests instantiate the same factory consumers do; coverage gate measures the closure path inside `middleware.ts:94-120` plus the entire provider validate body. D-05 (no v8-ignore) means any uncoverable line surfaces as a gate failure.
- `vitest.config.ts` ↔ `package.json` ↔ `.github/workflows/test.yml` — Phase 6 changes flow through all three: `vitest.config.ts` defines the gate; `package.json` adds the script and devDep; `test.yml` invokes the script on the canonical cell.
- `06-VERIFICATION.md` ↔ `tests/integration/*.test.ts` ↔ `src/{providers,crypto}/...` — D-17 mutation experiment edits source, runs tests, captures evidence in VERIFICATION; D-19 discipline ensures source is reverted.
- Phase 7 reads from: `tests/integration/{provider}.test.ts` (the integration tests serve as the canonical example for the README's per-provider quickstarts and BODY-02 verify-callback documentation). Phase 6 is the source of truth for the runnable integration patterns Phase 7 documents.

</code_context>

<specifics>
## Specific Ideas

- **Coverage provider:** user explicitly chose `@vitest/coverage-v8` over `@vitest/coverage-istanbul`. Planner: install `@vitest/coverage-v8` only; do NOT add Istanbul as an alternative or fallback.
- **Coverage scope:** user explicitly chose strict ROADMAP-named scope (`src/crypto/**, src/providers/**, src/middleware.ts`) over expand-to-all-of-src or aggregate-only. Planner: `coverage.include` MUST be exactly those three paths.
- **Threshold mechanism:** user explicitly chose per-file via `coverage.thresholds.perFile = true` over global aggregate or external script. Planner: single `vitest.config.ts` source of truth.
- **CI placement:** user explicitly chose one canonical cell (Node 22 × Express 5.x) over every-cell or separate-workflow. Planner: gate the coverage step with `if: matrix.node-version == '22.x' && matrix.express-version == '5.x'` or equivalent.
- **V8 ignore policy:** user explicitly chose disallow over allow-with-justification or planner-discretion. Planner: any `/* v8 ignore */` directive in `src/` is a verification failure; if the gate trips, write a real test or refactor the unreachable code.
- **Integration file granularity:** user explicitly chose one file per provider over consolidated or per-provider-plus-cross-cutting. Planner: exactly three files at `tests/integration/{stripe,github,shopify}.test.ts`.
- **App builder:** user explicitly chose per-test factory over shared-module-level or test-fixtures-package. Planner: `makeApp(provider, options)` returns a fresh Express instance per test.
- **Body-parser modes:** user explicitly chose BOTH modes per provider over mounted-before-only or one-provider-only. Planner: every integration file has TWO `describe()` groups exercising both BODY-01 (rawBodyCapture before json) and BODY-02 (express.json verify callback) patterns.
- **Signed-payload helpers:** user explicitly chose inline duplicate per integration file over shared-signers-module or refactored-shared-fixtures. Planner: ~5-line `makeSignature` per file; do NOT touch the existing unit-test helpers.
- **Audit scope (carry-overs):** user explicitly accepted ALL 8 carry-over advisories: P4 WR-01 (NaN tolerance), P4 WR-02 (vacuous tests), P4 WR-03 (array-header), P4 WR-04 (default literal dedupe), P4 WR-05 (parseInt leniency), P5 WR-01 (empty-string tests), P5 WR-02 (vacuous body-leakage), P5 WR-03 (defense-in-depth leakage assert). Planner: every one is a planning task; do NOT defer any individually without surfacing.
- **WR-04 dedupe shape:** user implicitly accepted the bundled fix; no specific direction. Planner: lean toward review-recommended option (B) — remove the default from `stripe.ts:70` validate signature and force middleware to always pass it explicitly. Single source of truth in middleware.
- **Mutation experiment:** user explicitly chose manual-experiment with 06-VERIFICATION.md evidence over Stryker or custom script or trust-structural-guarantee. Planner: do NOT install mutation-test tooling; do NOT write a sed-based script.
- **Mutation tier:** user explicitly chose integration-tier verification over unit-tier or both-tiers. Planner: each of the 5 mutations MUST fail an integration test (not a unit test) to count as evidence.
- **Mutation evidence location:** user explicitly chose 06-VERIFICATION.md "Guard Removal Demonstrations" section over separate file or commit-message-only. Planner: verifier writes the table.
- **Mutation discipline:** user explicitly chose sequential-no-commits-clean-tree over throwaway-branch or fixture-based. Planner: edit → test → revert → next; `git status` clean after all 5.

</specifics>

<deferred>
## Deferred Ideas

- **lcov upload to Codecov / Coveralls** — no `CODECOV_TOKEN` secret in CI; portfolio scope. Revisit if the project gains a coverage-trend story or external visibility need (e.g., npm publishing in v2).
- **Cross-provider integration file** mounting all three providers on different routes of one app — not yet justified by a real cross-provider scenario; defer until one surfaces.
- **Shared `tests/_fixtures/` helpers** for sigs / makeApp / SAMPLE_BODY — defer until inline duplication exceeds ~30 lines or 4+ files.
- **Stryker mutation-test tooling** — far more thorough than the manual 5-mutation experiment, but adds a real tool dependency, ~5–15 minute mutation runs, and a config surface to maintain. Revisit if Phase 6 produces evidence the manual experiment misses real defects.
- **`scripts/test-guard-removal.mjs`** — repeatable mutation script. Defer; brittle to source drift, and the manual experiment is a one-time SC3 demonstration not an ongoing CI gate.
- **Refactoring `provider!` non-null assertion at `middleware.ts:113` (P4 IN-01)** — only refactor if the D-05 disallow-v8-ignore policy makes it block coverage. If integration tests cover the closure path, leave the assertion.
- **`(provider!.validate as Function)` cast cleanup (P4 IN-02)** — Phase 7+ style nit; not in Phase 6 audit scope.
- **`req as any` proliferation in `stripe.test.ts` (P4 IN-03)** — Phase 7+ style nit; not in Phase 6 audit scope.
- **Express 4 vs Express 5 behavior divergence in integration tests** — trust the existing 3×2 CI matrix to catch any divergence; the integration tests themselves don't need to fork on Express version.
- **DOCS-01 (per-provider README quickstart)** — Phase 7. The integration tests serve as the canonical example Phase 7's README references, but the README content itself is Phase 7.
- **DOCS-02 (security notes covering replay-protection landscape)** — Phase 7.
- **DOCS-03 (runnable example app under `examples/`)** — Phase 7.
- **DX-01 / DX-02 / DX-03 (logging hook / async secret resolution / per-route typed handlers)** — v2.
- **PROV-01 / PROV-02 / PROV-03 (Slack / Twilio / generic HMAC)** — v2.
- **DIST-01 (npm publishing pipeline)** — v2.
- **Coverage report style choices** (text-summary vs html vs lcov-only in CI logs) — planner discretion within D-01..D-04 scope.
- **`coverage` vs `test:coverage` npm script naming** — planner discretion (D-07 leans toward `test:coverage` for namespacing consistency).

</deferred>

---

*Phase: 6-Integration Tests, Coverage Gate & Negative-Case Audit*
*Context gathered: 2026-05-09*
