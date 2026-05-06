---
phase: 02-crypto-core-error-class
plan: 03
type: execute
wave: 2
depends_on: [02-01-CRYPTO-PRIMITIVES, 02-02-ERROR-CLASS]
files_modified:
  - src/index.ts
  - src/index.test.ts
autonomous: true
requirements_addressed: [CRYP-01, CRYP-02, API-02]
requirements: [CRYP-01, CRYP-02, API-02]

must_haves:
  truths:
    - "src/index.ts grows from 1 export (VERSION) to 4 named exports plus the existing VERSION — phase context 'Integration Points'"
    - "computeHmac is reachable from the public package surface — CRYP-01"
    - "timingSafeCompare is reachable from the public package surface — CRYP-02"
    - "WebhookValidationError is reachable from the public package surface — API-02"
    - "WebhookValidationReason type is reachable from the public package surface — API-02"
    - "VERSION export is preserved from Phase 1 — Phase 1 D-15 carry-forward, Phase 1 smoke test must still pass"
    - "Re-exports use 'export { ... } from ...' form (not 'export *') so the public surface is enumerable from a single grep"
    - "WebhookValidationReason is re-exported with the 'type' keyword inside the brace so Biome / verbatimModuleSyntax does not warn"
    - "tsup build produces dist/index.{js,cjs,d.ts} containing all 4 new public symbols plus VERSION"
    - "Phase 1 smoke test for VERSION continues to pass; new smoke tests confirm the 4 new public exports are reachable from src/index.ts"
  artifacts:
    - path: "src/index.ts"
      provides: "Public package barrel: VERSION + computeHmac + timingSafeCompare + WebhookValidationError + WebhookValidationReason"
      exports: ["VERSION", "computeHmac", "timingSafeCompare", "WebhookValidationError", "WebhookValidationReason"]
      min_lines: 6
    - path: "src/index.test.ts"
      provides: "Phase 1 VERSION smoke test extended with smoke tests proving the 4 Phase 2 exports are reachable from the public barrel"
      contains: "describe('express-webhook-validator'"
  key_links:
    - from: "src/index.ts"
      to: "src/crypto/hmac.ts"
      via: "export { computeHmac } from './crypto/hmac.js'"
      pattern: "from './crypto/hmac.js'"
    - from: "src/index.ts"
      to: "src/crypto/compare.ts"
      via: "export { timingSafeCompare } from './crypto/compare.js'"
      pattern: "from './crypto/compare.js'"
    - from: "src/index.ts"
      to: "src/errors.ts"
      via: "export { WebhookValidationError, type WebhookValidationReason } from './errors.js'"
      pattern: "from './errors.js'"
---

<objective>
Wire the Phase 2 primitives (Plans 01 and 02) into the public package surface. Update `src/index.ts` from one export (`VERSION`) to five (preserving `VERSION`, adding `computeHmac`, `timingSafeCompare`, `WebhookValidationError`, `WebhookValidationReason`) so consumers of `express-webhook-validator` can reach the new symbols. Extend `src/index.test.ts` with smoke tests that prove each new export is reachable from the public barrel — this catches future barrel-typo regressions where a primitive ships but isn't re-exported.

**Purpose:** This plan is the seam between "implementation" (Plans 01 and 02) and "what consumers can actually import." Phase 3 will start consuming `WebhookValidationError` from inside the factory. Phases 4-5 will start consuming `computeHmac` and `timingSafeCompare` from provider modules. None of those consumers exist yet, but the public surface needs to be in place AND tested before they do — otherwise Phase 3+ executors waste time discovering that an import path doesn't resolve.

**Output:** Two modified files. No new files. No `package.json` changes (the existing `exports` map already points at `./dist/index.{js,cjs,d.ts}` and tsup auto-generates those from `src/index.ts`).
</objective>

<execution_context>
@/home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru/.claude/get-shit-done/workflows/execute-plan.md
@/home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/02-crypto-core-error-class/02-CONTEXT.md
@.planning/phases/02-crypto-core-error-class/02-PATTERNS.md
@.planning/phases/02-crypto-core-error-class/02-01-CRYPTO-PRIMITIVES-PLAN.md
@.planning/phases/02-crypto-core-error-class/02-02-ERROR-CLASS-PLAN.md
@src/index.ts
@src/index.test.ts
@package.json
@tsconfig.json
@tsup.config.ts

<interfaces>
<!-- This plan's job is to make the contracts that Plans 01 and 02 created reachable from the public barrel. -->

Symbols defined in upstream plans (already on disk by the time this plan runs):

```typescript
// from src/crypto/hmac.ts (Plan 01)
export function computeHmac(
  rawBody: Buffer | string,
  secret: string,
  algorithm: 'sha256'
): Buffer;

// from src/crypto/compare.ts (Plan 01)
export function timingSafeCompare(a: Buffer, b: Buffer): boolean;

// from src/errors.ts (Plan 02)
export type WebhookValidationReason =
  | 'signature_mismatch'
  | 'timestamp_too_old'
  | 'missing_header'
  | 'missing_secret';

export class WebhookValidationError extends Error {
  public readonly reason: WebhookValidationReason;
  public readonly provider: string;
  public readonly statusCode: number;
  constructor(opts: {
    reason: WebhookValidationReason;
    provider: string;
    statusCode: number;
  });
  toJSON(): {
    name: string;
    reason: WebhookValidationReason;
    provider: string;
    statusCode: number;
    message: string;
  };
}
```

Existing public surface (`src/index.ts`, current Phase 1 state — must be preserved):

```typescript
// express-webhook-validator
// Phase 1 placeholder — Phase 2 will export createWebhookMiddleware, WebhookValidationError, etc.

export const VERSION = '0.0.1';
```

Existing test (`src/index.test.ts`, current Phase 1 state — must continue to pass):

```typescript
import { describe, expect, it } from 'vitest';
import { VERSION } from './index.js';

describe('express-webhook-validator', () => {
  it('exports a VERSION string', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION.length).toBeGreaterThan(0);
  });
});
```

Phase 1 conventions inherited:
- ESM with `.js` extension on every relative import.
- `package.json` `"exports"` map points at `./dist/index.{js,cjs,d.ts}`. tsup auto-generates these from `src/**/*.ts` (entry: `['src/**/*.ts', '!src/**/*.test.ts']`).
- Vitest auto-discovers `src/**/*.test.ts`; running `npx vitest run` covers `index.test.ts` automatically.
- Biome `organizeImports: "on"` will reorder imports on `npm run format`; structure your re-exports correctly the first time so it doesn't reshuffle.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend src/index.ts barrel with the 4 new Phase 2 exports (preserve VERSION)</name>
  <files>src/index.ts</files>

  <read_first>
    - .planning/phases/02-crypto-core-error-class/02-CONTEXT.md ("Code Context" → "Integration Points": "Phase 2 grows it from one export (VERSION) to four")
    - .planning/phases/02-crypto-core-error-class/02-PATTERNS.md (section "src/index.ts (modified — barrel export)" — exact target shape provided)
    - src/index.ts (current Phase 1 state — confirm the comment to rewrite and the VERSION line to preserve)
    - src/crypto/hmac.ts (confirm `computeHmac` is exported under that exact name — Plan 01 prerequisite)
    - src/crypto/compare.ts (confirm `timingSafeCompare` is exported under that exact name — Plan 01 prerequisite)
    - src/errors.ts (confirm `WebhookValidationError` class and `WebhookValidationReason` type are both exported — Plan 02 prerequisite)
    - package.json (confirm `exports` map already points at `./dist/index.{js,cjs,d.ts}` — no change needed)
    - tsup.config.ts (confirm `entry` glob already includes `src/index.ts` — no change needed)
  </read_first>

  <action>
    Replace the entire content of `src/index.ts` with the following. The Phase 1 outdated comment ("Phase 2 will export createWebhookMiddleware...") is rewritten to reflect what this phase actually delivers; `VERSION` is preserved verbatim; the four new re-exports are added underneath.

    **File: `src/index.ts`** — exact target content (PATTERNS.md "src/index.ts (modified — barrel export)"):

    ```typescript
    // express-webhook-validator
    // Phase 2: crypto primitives + discriminated error class.
    // Provider middleware (createWebhookMiddleware, raw-body capture) lands in Phases 3-5.

    export const VERSION = '0.0.1';

    export { computeHmac } from './crypto/hmac.js';
    export { timingSafeCompare } from './crypto/compare.js';
    export { WebhookValidationError, type WebhookValidationReason } from './errors.js';
    ```

    Constraints (do NOT violate):
    - `VERSION` line MUST remain `export const VERSION = '0.0.1';` — exact same string. The Phase 1 smoke test asserts `typeof VERSION === 'string'` and `VERSION.length > 0`; do NOT change the value.
    - Use `export { ... } from '...'` for the three re-exports — NOT `export * from '...'`. Per PATTERNS.md "src/index.ts (modified)" rationale: "the public surface should be enumerable from a single grep."
    - The `WebhookValidationReason` re-export uses the inline `type` modifier inside the brace: `export { WebhookValidationError, type WebhookValidationReason } from './errors.js';`. This avoids splitting it into a separate `export type { ... }` line and keeps Biome `organizeImports` happy.
    - All three relative paths use the `.js` extension (`./crypto/hmac.js`, `./crypto/compare.js`, `./errors.js`) — required by `moduleResolution: "bundler"` + `package.json` `type: "module"`.
    - DO NOT pre-export anything from Phase 3+ (no `createWebhookMiddleware` placeholder, no `Provider` type, no `RawBodyOptions`). Anti-pattern: speculative public surface.
    - DO NOT export `messageFor` from `src/errors.ts` (it isn't exported by Plan 02 anyway — that's intentional).
    - DO NOT add a default export. The public surface is named-only.
    - The comment block at the top stays minimal — three lines max. Keep it factual; do NOT advertise features that don't ship in this phase.
  </action>

  <verify>
    <automated>
      cd /home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru &amp;&amp; \
      npx tsc --noEmit -p tsconfig.json &amp;&amp; \
      npx biome check src/index.ts &amp;&amp; \
      grep -q "^export const VERSION = '0.0.1';" src/index.ts &amp;&amp; \
      grep -q "^export { computeHmac } from './crypto/hmac.js';" src/index.ts &amp;&amp; \
      grep -q "^export { timingSafeCompare } from './crypto/compare.js';" src/index.ts &amp;&amp; \
      grep -q "^export { WebhookValidationError, type WebhookValidationReason } from './errors.js';" src/index.ts &amp;&amp; \
      ! grep -E "^export \*" src/index.ts &amp;&amp; \
      ! grep -E "createWebhookMiddleware|Provider|RawBodyOptions" src/index.ts
    </automated>
  </verify>

  <acceptance_criteria>
    - File `src/index.ts` exists.
    - `grep -c "^export const VERSION = '0.0.1';" src/index.ts` returns 1 (Phase 1 export preserved verbatim).
    - `grep -c "^export { computeHmac } from './crypto/hmac.js';" src/index.ts` returns 1.
    - `grep -c "^export { timingSafeCompare } from './crypto/compare.js';" src/index.ts` returns 1.
    - `grep -c "^export { WebhookValidationError, type WebhookValidationReason } from './errors.js';" src/index.ts` returns 1 (single line, inline `type` modifier).
    - `grep -E "^export \*" src/index.ts` returns NO matches (no `export *` re-exports).
    - `grep -E "createWebhookMiddleware|Provider|RawBodyOptions" src/index.ts` returns NO matches (no speculative Phase 3+ exports).
    - File contains NO default export (`grep -E "^export default" src/index.ts` returns no matches).
    - Total file length is short (under ~10 lines including the comment header).
    - `npx tsc --noEmit -p tsconfig.json` exits 0.
    - `npx biome check src/index.ts` exits 0.
    - `npm run build` exits 0; `dist/index.d.ts` declares all four new public symbols (verifiable: `grep -E "computeHmac|timingSafeCompare|WebhookValidationError|WebhookValidationReason" dist/index.d.ts` returns 4+ matches).
  </acceptance_criteria>

  <done>
    `src/index.ts` re-exports `computeHmac`, `timingSafeCompare`, `WebhookValidationError`, and `type WebhookValidationReason` from their respective Phase 2 source files, while preserving the Phase 1 `VERSION` constant. The outdated Phase 1 comment is rewritten to reflect the actual Phase 2 surface. Strict TypeScript compiles. Biome lint passes. `npm run build` produces a dist that declares all five public symbols.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Extend src/index.test.ts with reachability smoke tests for the 4 new Phase 2 exports</name>
  <files>src/index.test.ts</files>

  <read_first>
    - src/index.test.ts (current Phase 1 state — confirm the existing `VERSION` test and preserve it verbatim)
    - src/index.ts (the file you just modified in Task 1 — confirm the exact import names that this test will exercise)
    - .planning/phases/02-crypto-core-error-class/02-PATTERNS.md (sections "src/index.ts (modified)" and "Pattern: Vitest co-located test idiom" for the testing conventions)
    - src/crypto/hmac.test.ts and src/errors.test.ts (sibling test files from Plans 01 and 02 — confirm we're not duplicating their work; this file's job is reachability through the public barrel, not behavioral re-testing)
  </read_first>

  <behavior>
    <!-- Reachability smoke tests, not behavior tests. The behavior tests live in: -->
    <!--   src/crypto/hmac.test.ts (Plan 01)   -->
    <!--   src/crypto/compare.test.ts (Plan 01) -->
    <!--   src/errors.test.ts (Plan 02)        -->
    <!-- This file proves that consumers can `import { X } from 'express-webhook-validator'` -->
    <!-- and reach each Phase 2 symbol. If any re-export breaks (typo, missing line, etc.), -->
    <!-- one of these smoke tests fails. -->
    - The existing Phase 1 `VERSION` test passes unchanged.
    - `import { computeHmac } from './index.js'` resolves AND `computeHmac` is callable: `Buffer.isBuffer(computeHmac('x', 'k', 'sha256'))` is true.
    - `import { timingSafeCompare } from './index.js'` resolves AND is callable: `timingSafeCompare(Buffer.from([1]), Buffer.from([1])) === true`.
    - `import { WebhookValidationError } from './index.js'` resolves AND construction works: `new WebhookValidationError({ reason: 'signature_mismatch', provider: 'stripe', statusCode: 401 }) instanceof Error` is true.
    - `import { type WebhookValidationReason } from './index.js'` is type-only, exercised by typing a variable as `WebhookValidationReason`. (Compile-time check; if the type re-export breaks, `npx tsc --noEmit` fails — covered by acceptance_criteria.)
  </behavior>

  <action>
    Replace `src/index.test.ts` with an extended version that preserves the Phase 1 smoke test verbatim AND adds one `it` per new Phase 2 export proving reachability through the public barrel.

    **File: `src/index.test.ts`** — exact target content:

    ```typescript
    import { describe, expect, it } from 'vitest';
    import {
      computeHmac,
      timingSafeCompare,
      VERSION,
      WebhookValidationError,
      type WebhookValidationReason,
    } from './index.js';

    describe('express-webhook-validator', () => {
      it('exports a VERSION string', () => {
        expect(typeof VERSION).toBe('string');
        expect(VERSION.length).toBeGreaterThan(0);
      });

      it('re-exports computeHmac (callable from the public barrel)', () => {
        const digest = computeHmac('x', 'k', 'sha256');
        expect(Buffer.isBuffer(digest)).toBe(true);
      });

      it('re-exports timingSafeCompare (callable from the public barrel)', () => {
        const a = Buffer.from([1, 2, 3]);
        const b = Buffer.from([1, 2, 3]);
        expect(timingSafeCompare(a, b)).toBe(true);
      });

      it('re-exports WebhookValidationError (constructable from the public barrel)', () => {
        const err = new WebhookValidationError({
          reason: 'signature_mismatch',
          provider: 'stripe',
          statusCode: 401,
        });
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(WebhookValidationError);
        expect(err.reason).toBe('signature_mismatch');
      });

      it('re-exports the WebhookValidationReason type (compile-time check)', () => {
        // This `it` is a compile-time-only assertion: if the `type` re-export
        // from src/index.ts is removed or broken, `npx tsc --noEmit` fails.
        // The runtime body is intentionally trivial — the test exists for the
        // type annotation on `reason` above.
        const reason: WebhookValidationReason = 'signature_mismatch';
        expect(reason).toBe('signature_mismatch');
      });
    });
    ```

    Constraints:
    - The Phase 1 `it('exports a VERSION string', ...)` block is preserved BYTE-FOR-BYTE inside the `describe`. Do NOT rename it. Do NOT change its assertions.
    - The new imports are added to the existing single `import { ... } from './index.js'` line (or its multi-line equivalent), alphabetized so `organizeImports` doesn't reshuffle. Order: `computeHmac, timingSafeCompare, VERSION, WebhookValidationError, type WebhookValidationReason`. (`type` modifiers come last in mixed value+type braces; this is the convention Biome enforces.)
    - This test file MUST NOT duplicate the behavioral coverage that lives in Plans 01 and 02. The smoke tests here are intentionally minimal — `Buffer.isBuffer(...)`, `=== true`, `instanceof Error`. Leave the deep behavior coverage (vector check, length-mismatch no-throw, leakage assertion, 4-reason round-trip) to the co-located test files.
    - For the `WebhookValidationReason` reachability test, the type annotation `const reason: WebhookValidationReason = 'signature_mismatch'` is the actual assertion — the runtime `expect` call is just to satisfy Vitest's "an `it` should expect something" convention. Do NOT add an `expect.assertions(0)` or `it.skip` — this needs to RUN under Vitest so a future test-runner change that bypasses TS compilation still surfaces a failure.
    - Use `Buffer.from([1, 2, 3])` for the `timingSafeCompare` smoke (avoid hex-string parsing for the smoke — keep it minimal). Equal-length matching pair → `true`.
    - Do NOT mock anything.
  </action>

  <verify>
    <automated>
      cd /home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru &amp;&amp; \
      npx vitest run src/index.test.ts &amp;&amp; \
      npx tsc --noEmit -p tsconfig.json &amp;&amp; \
      npx biome check src/index.test.ts &amp;&amp; \
      grep -q "exports a VERSION string" src/index.test.ts &amp;&amp; \
      grep -q "re-exports computeHmac" src/index.test.ts &amp;&amp; \
      grep -q "re-exports timingSafeCompare" src/index.test.ts &amp;&amp; \
      grep -q "re-exports WebhookValidationError" src/index.test.ts &amp;&amp; \
      grep -q "re-exports the WebhookValidationReason type" src/index.test.ts &amp;&amp; \
      grep -q "type WebhookValidationReason" src/index.test.ts
    </automated>
  </verify>

  <acceptance_criteria>
    - File `src/index.test.ts` exists.
    - File contains the original Phase 1 `it('exports a VERSION string', ...)` block UNCHANGED (same assertions: `expect(typeof VERSION).toBe('string')` and `expect(VERSION.length).toBeGreaterThan(0)`).
    - File contains 4 new `it` blocks, one per Phase 2 export:
      1. `it('re-exports computeHmac (callable from the public barrel)'`
      2. `it('re-exports timingSafeCompare (callable from the public barrel)'`
      3. `it('re-exports WebhookValidationError (constructable from the public barrel)'`
      4. `it('re-exports the WebhookValidationReason type (compile-time check)'`
    - File imports all 5 symbols from `'./index.js'`: `computeHmac`, `timingSafeCompare`, `VERSION`, `WebhookValidationError`, `type WebhookValidationReason` (single import statement, `.js` extension, `type` modifier on the type-only symbol).
    - `WebhookValidationError` smoke test asserts both `toBeInstanceOf(Error)` and `toBeInstanceOf(WebhookValidationError)` (catches a broken-prototype-chain regression early).
    - `npx vitest run src/index.test.ts` exits 0 with all 5 `it` blocks passing.
    - `npx tsc --noEmit -p tsconfig.json` exits 0 (the type-reachability test is compile-time enforced).
    - `npx biome check src/index.test.ts` exits 0.
    - Full test suite passes: `npx vitest run` exits 0 (Phase 1 smoke + Plan 01 crypto tests + Plan 02 errors tests + this file's 5 smoke tests = 5 + 5 + 11 ≈ 16+ individual tests passing).
  </acceptance_criteria>

  <done>
    `src/index.test.ts` preserves the Phase 1 `VERSION` smoke test verbatim and adds four reachability smoke tests proving `computeHmac`, `timingSafeCompare`, `WebhookValidationError`, and `WebhookValidationReason` are all importable from the public barrel. The new tests do NOT duplicate behavioral coverage from Plans 01 and 02 — they exist solely to catch barrel-typo regressions. Strict TS compiles. Biome lint passes. Full test suite passes.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Internal module (`src/crypto/`, `src/errors.ts`) → public package surface (`src/index.ts` → `dist/index.{js,cjs,d.ts}`) | Anything re-exported from `src/index.ts` becomes part of the published API contract — consumers will import it and depend on its shape. The barrel must export ONLY symbols that are intended public surface AND must export them under the names downstream phases will reference. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-14 | Tampering (silent public-surface drift) | `src/index.ts` | mitigate | The barrel uses named `export { X } from '...'` re-exports, never `export *`. Acceptance_criteria grep gate forbids `^export \*`. Adding a new internal symbol does NOT silently leak it to the public surface — a maintainer must explicitly add a re-export line. PATTERNS.md "src/index.ts (modified)": "the public surface should be enumerable from a single grep." |
| T-02-15 | Repudiation (broken re-export caught only at consumption time) | `src/index.ts` | mitigate | Reachability smoke tests in `src/index.test.ts` exercise each new export by importing through `./index.js` and invoking it. A typo in any re-export line (e.g., `from './crypto/hmac'` missing the `.js`) fails the smoke test immediately under `npx vitest run`. Catches the regression at unit-test time, not at Phase 3+ executor time. |
| T-02-16 | Information disclosure (speculative pre-export of Phase 3+ symbols) | `src/index.ts` | mitigate | Acceptance_criteria grep gate forbids the strings `createWebhookMiddleware`, `Provider`, `RawBodyOptions` from appearing in `src/index.ts`. A future executor cannot accidentally pre-publish a half-built API surface; if Phase 3 wants to expose these, Phase 3's barrel-modification plan adds them. |
| T-02-17 | Tampering (broken WebhookValidationError prototype chain after CJS+ESM dual build) | `src/index.test.ts` | mitigate | Smoke test asserts `err instanceof WebhookValidationError` (in addition to `instanceof Error`). If tsup's CJS or ESM output ever produces a class that breaks `instanceof` (e.g., via interop wrappers), this assertion fails and forces investigation. Phase 2 D-13 also covers this in the deeper `errors.test.ts` — defense in depth. |
| T-02-18 | Denial of service (compile-time type-export break only surfaces in Phase 3+) | `src/index.ts`, `src/index.test.ts` | mitigate | The reachability smoke test for `WebhookValidationReason` types a `const` as that type. If the type-only re-export breaks (e.g., the `type` keyword is dropped, causing Biome to flag it; or the line is removed entirely), `npx tsc --noEmit` fails before any Phase 3+ work begins. |
</threat_model>

<verification>
After both tasks land:
- `npx vitest run` exits 0 (full suite — Phase 1 smoke + Plan 01 + Plan 02 + this plan's 5 smoke tests).
- `npx biome check .` exits 0.
- `npx tsc --noEmit -p tsconfig.json` exits 0.
- `npm run build` exits 0; `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts` exist.
- `dist/index.d.ts` declares (verifiable by grep): `VERSION`, `computeHmac`, `timingSafeCompare`, `WebhookValidationError`, `WebhookValidationReason`.
- `dist/` contains NO `*.test.*` artifacts: `find dist -name '*.test.*' | wc -l` returns 0.
- `package.json` `dependencies` still contains zero entries; no new external deps introduced anywhere in Phase 2.
- `git diff --stat` for this plan shows exactly two files modified (`src/index.ts`, `src/index.test.ts`); no other files touched.
- Commit graph: this plan's commit happens AFTER both Plan 01 and Plan 02 commits land (depends_on enforces this in execute-phase).
</verification>

<success_criteria>
1. `src/index.ts` re-exports `computeHmac`, `timingSafeCompare`, `WebhookValidationError`, and `type WebhookValidationReason` while preserving `VERSION`.
2. Re-exports use `export { ... } from '...'` form (not `export *`); the public surface is enumerable from a single grep.
3. The `WebhookValidationReason` re-export uses inline `type` modifier (`export { ..., type X } from '...'`) — single line, no separate `export type {}` statement.
4. `src/index.test.ts` preserves the Phase 1 `VERSION` smoke test unchanged AND adds 4 reachability smoke tests for the new Phase 2 exports.
5. The `WebhookValidationError` smoke test asserts both `instanceof Error` AND `instanceof WebhookValidationError`.
6. The `WebhookValidationReason` smoke test exercises the type at compile time via a `const` annotation.
7. Full test suite (`npx vitest run`) passes — Phase 1 + Plan 01 + Plan 02 + this plan's smoke tests.
8. Strict TypeScript compilation, Biome lint, and tsup build all clean.
9. No `package.json` change.
10. No speculative Phase 3+ exports introduced.
</success_criteria>

<output>
After completion, create `.planning/phases/02-crypto-core-error-class/02-03-SUMMARY.md` per the standard summary template, including:
- Files modified (2: `src/index.ts`, `src/index.test.ts`)
- Public surface delta: 1 export → 5 exports (VERSION + 4 new)
- Confirmation that `package.json` was NOT modified (the existing exports map already covers `dist/index.{js,cjs,d.ts}`)
- Confirmation that `npm run build` produces a `dist/index.d.ts` declaring all 5 public symbols
- Confirmation that the Phase 1 `VERSION` smoke test still passes byte-for-byte unchanged
- Test count delta: `src/index.test.ts` grew from 1 `it` to 5 `it` blocks
- Wave 2 readiness: this plan depended on Plans 01 and 02; both must have shipped successfully before this plan ran. Note any sequencing issues encountered.
- Threats mitigated: T-02-14..T-02-18
</output>
</content>
</invoke>