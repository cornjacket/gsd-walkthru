---
phase: 02-crypto-core-error-class
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/crypto/hmac.ts
  - src/crypto/compare.ts
  - src/crypto/hmac.test.ts
  - src/crypto/compare.test.ts
autonomous: true
requirements_addressed: [CRYP-01, CRYP-02]
requirements: [CRYP-01, CRYP-02]

must_haves:
  truths:
    - "computeHmac(rawBody, secret, 'sha256') returns a Buffer (raw digest bytes), not a hex string — D-01"
    - "computeHmac uses Node built-in crypto only; no external crypto dependency added — ROADMAP SC1 + D-14"
    - "computeHmac's algorithm parameter is the literal type 'sha256', not string or wider union — D-02"
    - "timingSafeCompare(a: Buffer, b: Buffer): boolean — Buffer-only, returns boolean (never throws, never Promise) — D-03"
    - "timingSafeCompare returns false WITHOUT THROWING when a.length !== b.length (top-level guard, not try/catch) — D-03 + PITFALLS #2"
    - "timingSafeCompare uses crypto.timingSafeEqual for equal-length inputs — ROADMAP SC2 + PITFALLS #2"
    - "Unit tests for computeHmac and timingSafeCompare are co-located in src/crypto/ next to their sources — D-04, D-12, Phase 1 D-04"
    - "All four files lint clean under biome check, build clean under tsup (test files excluded from dist), and run green under vitest"
  artifacts:
    - path: "src/crypto/hmac.ts"
      provides: "computeHmac(rawBody: Buffer | string, secret: string, algorithm: 'sha256') => Buffer"
      exports: ["computeHmac"]
      contains: "createHmac"
    - path: "src/crypto/compare.ts"
      provides: "timingSafeCompare(a: Buffer, b: Buffer) => boolean with length-guard before crypto.timingSafeEqual"
      exports: ["timingSafeCompare"]
      contains: "timingSafeEqual"
    - path: "src/crypto/hmac.test.ts"
      provides: "Vitest co-located unit tests for computeHmac (known-vector digest + Buffer return type)"
      contains: "describe('computeHmac'"
    - path: "src/crypto/compare.test.ts"
      provides: "Vitest co-located unit tests for timingSafeCompare (equal-length match, equal-length mismatch, length mismatch no-throw)"
      contains: "describe('timingSafeCompare'"
  key_links:
    - from: "src/crypto/hmac.ts"
      to: "node:crypto"
      via: "import { createHmac } from 'node:crypto'"
      pattern: "from 'node:crypto'"
    - from: "src/crypto/compare.ts"
      to: "node:crypto"
      via: "import { timingSafeEqual } from 'node:crypto'"
      pattern: "from 'node:crypto'"
    - from: "src/crypto/hmac.test.ts"
      to: "src/crypto/hmac.ts"
      via: "import { computeHmac } from './hmac.js'"
      pattern: "from './hmac.js'"
    - from: "src/crypto/compare.test.ts"
      to: "src/crypto/compare.ts"
      via: "import { timingSafeCompare } from './compare.js'"
      pattern: "from './compare.js'"
---

<objective>
Ship the two security primitives every later provider phase depends on: a Node-`crypto`-backed HMAC computation that returns raw digest bytes (no encoding baked in), and a length-guarded constant-time byte comparison. Co-located Vitest unit tests for each primitive ship in the same plan, exactly per the Phase 2 ROADMAP "tests in the same commits" tradeoff.

**Purpose:** These primitives are internal building blocks. They have ZERO Express knowledge, ZERO provider knowledge, ZERO HTTP knowledge. By keeping them encoding-neutral (`Buffer` return) and Buffer-only (no string normalization), every later provider — Stripe (hex), GitHub (hex), Shopify (base64) — converts at its own boundary instead of forcing the crypto module to bake in provider assumptions.

**Output:** Four files under `src/crypto/`. No `src/crypto/index.ts` barrel — D-04 explicitly says no barrel is required (planner discretion); we don't add one because the public surface re-exports go through `src/index.ts` (Plan 03).
</objective>

<execution_context>
@/home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru/.claude/get-shit-done/workflows/execute-plan.md
@/home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/02-crypto-core-error-class/02-CONTEXT.md
@.planning/phases/02-crypto-core-error-class/02-PATTERNS.md
@.planning/research/PITFALLS.md
@.planning/phases/01-foundation-tooling/01-CONTEXT.md
@src/index.test.ts
@tsconfig.json
@tsup.config.ts
@biome.json
@package.json

<interfaces>
<!-- Contracts the executor MUST implement. These are LOCKED by CONTEXT.md D-01..D-04 and D-12. -->
<!-- Executor: implement against these signatures. Do NOT widen, narrow, or add parameters. -->

Public surface this plan creates (re-exported by Plan 03 from src/index.ts):

```typescript
// src/crypto/hmac.ts
import { createHmac } from 'node:crypto';

export function computeHmac(
  rawBody: Buffer | string,
  secret: string,
  algorithm: 'sha256'
): Buffer;
```

```typescript
// src/crypto/compare.ts
import { timingSafeEqual } from 'node:crypto';

export function timingSafeCompare(a: Buffer, b: Buffer): boolean;
```

Existing analog (Vitest co-located test idiom — `src/index.test.ts`, the only first-party analog):

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

Phase 1 conventions inherited (DO NOT alter):
- ESM with `.js` extension on every relative import (tsconfig `moduleResolution: "bundler"` + `package.json` `type: "module"`).
- Strict TypeScript (`strict: true`); no implicit `any`; literal types where CONTEXT.md says literal types.
- tsup `entry: ['src/**/*.ts', '!src/**/*.test.ts']` and tsconfig `exclude: ["**/*.test.ts"]` already exclude tests from dist — new test files inherit this.
- Vitest `include: ['src/**/*.test.ts']` already picks up new tests automatically.
- Biome formatter: 2-space indent, single quotes, trailing commas (es5), 100-col line width.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement computeHmac + co-located unit test</name>
  <files>src/crypto/hmac.ts, src/crypto/hmac.test.ts</files>

  <read_first>
    - .planning/phases/02-crypto-core-error-class/02-CONTEXT.md (D-01, D-02, D-04, D-12, D-13, D-14, "Specifics" section)
    - .planning/phases/02-crypto-core-error-class/02-PATTERNS.md (sections "src/crypto/hmac.ts", "src/crypto/hmac.test.ts", "Shared Patterns")
    - .planning/research/ARCHITECTURE.md lines 538-553 (the `crypto.createHmac('sha256', secret).update(body).digest()` shape — note `.digest()` with no encoding returns a Buffer; that matches D-01 exactly)
    - .planning/research/PITFALLS.md Pitfall #5 (no signature/secret material in error messages — applies as a constraint: this file emits no logs, no errors with sensitive content)
    - src/index.test.ts (Vitest co-located idiom — only first-party analog)
    - tsconfig.json, tsup.config.ts, biome.json (Phase 1 conventions; do not modify)
  </read_first>

  <behavior>
    <!-- TDD: define expected observable behavior BEFORE implementation. -->
    - computeHmac returns a Buffer for any valid input (positive: Buffer.isBuffer(result) === true).
    - For a fixed (body, secret) pair, computeHmac(body, secret, 'sha256') produces a deterministic, known SHA-256 HMAC digest. Vector check (any of these is acceptable; pick ONE and pin it in the test):
      * RFC 4231 Test Case 1: key = 0x0b * 20 (Buffer.alloc(20, 0x0b)), data = 'Hi There'.
        Expected hex digest = 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'.
        Use this if widening `secret` to `Buffer` (Claude's discretion per D-12). Otherwise use:
      * Hand-computed reference with `secret: string` — e.g., body='hello', secret='shh', algorithm='sha256';
        expected hex = '34973f4c8b3a17a73fb95c1d8caa9aceea4f57d27b62e2c2061efb22a89f04ec'.
        Confirm by `node -e "console.log(require('crypto').createHmac('sha256','shh').update('hello').digest('hex'))"` if uncertain.
    - computeHmac with `rawBody: string` and `rawBody: Buffer` MUST produce the same digest for byte-equivalent inputs (this is implicit in createHmac's API; do not add a separate test for it — the vector check covers the string path).
    - Type-level: `algorithm` parameter is the literal `'sha256'`; passing `'sha512'` or `string` MUST be a TypeScript compile error. (No runtime test for this — the type system enforces it.)
  </behavior>

  <action>
    Create the directory `src/crypto/` and two files inside it.

    **File: `src/crypto/hmac.ts`** — exact content shape (CONTEXT.md D-01, D-02; PATTERNS.md "src/crypto/hmac.ts"):

    ```typescript
    import { createHmac } from 'node:crypto';

    /**
     * Compute an HMAC digest for a webhook body. Returns raw digest bytes (Buffer).
     * Encoding-neutral by design: each provider converts at its own boundary
     * (Stripe→hex, GitHub→hex, Shopify→base64). Phase 2 D-01.
     *
     * @param rawBody - Raw request bytes. Buffer is preferred (matches what arrives
     *                  on the wire); string is accepted for ergonomics in tests and
     *                  callers that already have UTF-8 text.
     * @param secret  - The webhook signing secret.
     * @param algorithm - Locked to 'sha256' for v1 (D-02). All three v1 providers
     *                    use SHA-256; widen the literal only when a future provider
     *                    needs SHA-512.
     */
    export function computeHmac(
      rawBody: Buffer | string,
      secret: string,
      algorithm: 'sha256'
    ): Buffer {
      return createHmac(algorithm, secret).update(rawBody).digest();
    }
    ```

    Constraints (do NOT violate):
    - NO encoding parameter on `.digest()`. Bare `.digest()` returns `Buffer` (D-01).
    - NO default value for `algorithm`. Caller passes `'sha256'` explicitly (D-02).
    - NO try/catch. `createHmac` throws synchronously for invalid algorithm names — let it propagate. (D-12 "Error handling pattern: None.")
    - NO logging, NO console output, NO error messages constructed from `secret` or `rawBody` (PITFALLS #5).
    - `secret` parameter type is `string` only. Widening to `string | Buffer` is Claude's discretion per D-12 — DO NOT widen unless you also widen the JSDoc and accept that the test suite still tests `string` only. Recommendation: keep `string` only.

    **File: `src/crypto/hmac.test.ts`** — Vitest idiom mirroring `src/index.test.ts`:

    ```typescript
    import { describe, expect, it } from 'vitest';
    import { computeHmac } from './hmac.js';

    describe('computeHmac', () => {
      it('produces the known SHA-256 HMAC digest for a fixed body and secret', () => {
        // Hand-computed reference vector. Verify with:
        //   node -e "console.log(require('crypto').createHmac('sha256','shh').update('hello').digest('hex'))"
        const body = 'hello';
        const secret = 'shh';
        const expectedHex = '34973f4c8b3a17a73fb95c1d8caa9aceea4f57d27b62e2c2061efb22a89f04ec';

        const digest = computeHmac(body, secret, 'sha256');

        expect(digest.toString('hex')).toBe(expectedHex);
      });

      it('returns a Buffer (not a string, not a Uint8Array view)', () => {
        const digest = computeHmac('x', 'k', 'sha256');
        expect(Buffer.isBuffer(digest)).toBe(true);
      });
    });
    ```

    Constraints on the test file:
    - Inline test vectors only (D-14). Do NOT create `tests/fixtures/`.
    - `import` path uses `.js` extension (`./hmac.js`), required by `moduleResolution: "bundler"` + ESM.
    - Vitest imports alphabetized: `describe, expect, it`.
    - One top-level `describe('computeHmac', ...)`. One `it` per behavioral assertion.
    - Do NOT add a third test that re-validates string/Buffer equivalence — the vector check is sufficient. Smaller test surface = faster feedback.
    - Do NOT mock `node:crypto`. Phase 2 tests are pure-function unit tests with no I/O to mock.

    Run order: write `hmac.ts`, then write `hmac.test.ts`, then run `npx vitest run src/crypto/hmac.test.ts` and confirm both `it` blocks pass before moving to Task 2.
  </action>

  <verify>
    <automated>
      cd /home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru &amp;&amp; \
      npx vitest run src/crypto/hmac.test.ts &amp;&amp; \
      npx biome check src/crypto/hmac.ts src/crypto/hmac.test.ts &amp;&amp; \
      grep -q "from 'node:crypto'" src/crypto/hmac.ts &amp;&amp; \
      grep -q "algorithm: 'sha256'" src/crypto/hmac.ts &amp;&amp; \
      grep -q "): Buffer" src/crypto/hmac.ts &amp;&amp; \
      ! grep -E "\.digest\(['\"]" src/crypto/hmac.ts
    </automated>
  </verify>

  <acceptance_criteria>
    - File `src/crypto/hmac.ts` exists.
    - File `src/crypto/hmac.test.ts` exists.
    - `grep -c "^export function computeHmac" src/crypto/hmac.ts` returns 1.
    - `grep -q "from 'node:crypto'" src/crypto/hmac.ts` succeeds (node: prefix per D-12).
    - `grep -q "algorithm: 'sha256'" src/crypto/hmac.ts` succeeds (literal type per D-02).
    - `grep -q "): Buffer" src/crypto/hmac.ts` succeeds (return type Buffer per D-01).
    - `grep -E "\.digest\(['\"]" src/crypto/hmac.ts` returns NO matches (no encoding argument on `.digest()` per D-01).
    - `grep -c "describe('computeHmac'" src/crypto/hmac.test.ts` returns 1.
    - Test file contains `it('produces the known SHA-256 HMAC digest` and `it('returns a Buffer`.
    - Test file contains `from './hmac.js'` (ESM `.js` extension).
    - `npx vitest run src/crypto/hmac.test.ts` exits 0 with both `it`s passing.
    - `npx biome check src/crypto/hmac.ts src/crypto/hmac.test.ts` exits 0.
    - `src/index.test.ts` (Phase 1 smoke test) still passes — `npx vitest run src/index.test.ts` exits 0.
  </acceptance_criteria>

  <done>
    `computeHmac` is implemented in `src/crypto/hmac.ts` with the exact signature `(rawBody: Buffer | string, secret: string, algorithm: 'sha256') => Buffer`. The co-located test file `src/crypto/hmac.test.ts` pins down a known-good digest with an inline vector AND asserts `Buffer.isBuffer(result) === true`. Both tests pass under Vitest. Biome lint passes. The Phase 1 smoke test for `VERSION` still passes. No external crypto dependency was added to `package.json`.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement timingSafeCompare + co-located unit test (length-guard pattern from PITFALLS #2)</name>
  <files>src/crypto/compare.ts, src/crypto/compare.test.ts</files>

  <read_first>
    - .planning/phases/02-crypto-core-error-class/02-CONTEXT.md (D-03, D-04, D-12, D-13, "Specifics" section — "user explicitly chose Buffer-only", "do NOT accept strings")
    - .planning/phases/02-crypto-core-error-class/02-PATTERNS.md (sections "src/crypto/compare.ts", "src/crypto/compare.test.ts", "Shared Patterns")
    - .planning/research/PITFALLS.md Pitfall #1 lines 13-43 (why `===` is forbidden — CONTEXT for the chosen pattern)
    - .planning/research/PITFALLS.md Pitfall #2 lines 47-83 (the canonical length-guard "RIGHT" snippet — copy this pattern exactly)
    - .planning/research/ARCHITECTURE.md lines 538-545 (the `try/catch` form — REJECTED in favor of PITFALLS #2 length-guard. Read so you understand why we are NOT using it.)
    - src/index.test.ts (Vitest co-located idiom)
    - src/crypto/hmac.test.ts (the file you just wrote in Task 1 — same idiom)
  </read_first>

  <behavior>
    <!-- TDD: required test cases per CONTEXT.md D-13. Copy these verbatim into the test file. -->
    - Equal-length matching buffers → true.
      * a = Buffer.from('abcdef', 'hex'), b = Buffer.from('abcdef', 'hex'); expect(timingSafeCompare(a, b)).toBe(true).
    - Equal-length differing buffers → false.
      * a = Buffer.from('abcdef', 'hex'), b = Buffer.from('abcd00', 'hex'); expect(timingSafeCompare(a, b)).toBe(false).
    - Length mismatch → false AND no exception thrown.
      * a = Buffer.from('abcdef', 'hex'), b = Buffer.from('ab', 'hex');
        expect(() => timingSafeCompare(a, b)).not.toThrow();
        expect(timingSafeCompare(a, b)).toBe(false).
    - Edge case (recommended, not strictly required by D-13): two empty buffers → true (Buffer.alloc(0) === Buffer.alloc(0) under timingSafeEqual, since lengths match and there's nothing to compare). Add this only if it costs nothing.
  </behavior>

  <action>
    Create two files inside the existing `src/crypto/` directory.

    **File: `src/crypto/compare.ts`** — exact content shape (CONTEXT.md D-03; PATTERNS.md "src/crypto/compare.ts"; PITFALLS.md #2 "RIGHT" snippet):

    ```typescript
    import { timingSafeEqual } from 'node:crypto';

    /**
     * Length-guarded constant-time byte comparison.
     *
     * Length mismatch returns `false` WITHOUT throwing — a top-level guard, not a
     * try/catch around `crypto.timingSafeEqual`. See PITFALLS.md Pitfall #2 for
     * the rationale: a thrown exception (or a caught-and-rethrown one) leaks
     * timing information about whether the lengths differed, which can leak
     * information about the secret's length over many requests.
     *
     * Buffer-only by design (Phase 2 D-03). Providers convert hex/base64 header
     * strings to Buffer at their own call site — no string normalization here.
     */
    export function timingSafeCompare(a: Buffer, b: Buffer): boolean {
      if (a.length !== b.length) {
        return false;
      }
      return timingSafeEqual(a, b);
    }
    ```

    Constraints (do NOT violate):
    - NO `try/catch` anywhere in this file. CONTEXT.md D-03 explicitly says "a top-level guard, not a try/catch around `crypto.timingSafeEqual`." The ARCHITECTURE.md try/catch form is REJECTED.
    - NO string acceptance. Parameters are `Buffer, Buffer` only. Do NOT widen to `Buffer | string`. Do NOT ship a `timingSafeCompareHex` sibling.
    - Return type is `boolean`. Never `Promise<boolean>`. Never throws (the length guard makes the only throw-path of `timingSafeEqual` unreachable).
    - NO logging, NO console output (PITFALLS #5).
    - NO default exports.

    **File: `src/crypto/compare.test.ts`** — Vitest idiom mirroring `src/index.test.ts` and `src/crypto/hmac.test.ts`:

    ```typescript
    import { describe, expect, it } from 'vitest';
    import { timingSafeCompare } from './compare.js';

    describe('timingSafeCompare', () => {
      it('returns true for equal-length matching buffers', () => {
        const a = Buffer.from('abcdef', 'hex');
        const b = Buffer.from('abcdef', 'hex');
        expect(timingSafeCompare(a, b)).toBe(true);
      });

      it('returns false for equal-length differing buffers', () => {
        const a = Buffer.from('abcdef', 'hex');
        const b = Buffer.from('abcd00', 'hex');
        expect(timingSafeCompare(a, b)).toBe(false);
      });

      it('returns false (without throwing) when buffer lengths differ', () => {
        const a = Buffer.from('abcdef', 'hex');
        const b = Buffer.from('ab', 'hex');
        expect(() => timingSafeCompare(a, b)).not.toThrow();
        expect(timingSafeCompare(a, b)).toBe(false);
      });
    });
    ```

    Constraints on the test file:
    - Inline test vectors (D-14).
    - `.js` extension on the relative import (`./compare.js`).
    - Three `it` blocks, one per D-13 case. Do NOT collapse them into a `it.each` — readability matters and there are only three.
    - The length-mismatch test uses BOTH `not.toThrow()` and a value assertion. Both are required by D-13's "returns false WITHOUT THROWING" wording — if you only test the value, a future regression that swaps the implementation for `try { timingSafeEqual(...) } catch { return false; }` would pass the value check but violate the contract.
    - Do NOT mock `node:crypto`.

    Run order: write `compare.ts`, then write `compare.test.ts`, then run `npx vitest run src/crypto/compare.test.ts` and confirm all three `it` blocks pass.
  </action>

  <verify>
    <automated>
      cd /home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru &amp;&amp; \
      npx vitest run src/crypto/compare.test.ts &amp;&amp; \
      npx biome check src/crypto/compare.ts src/crypto/compare.test.ts &amp;&amp; \
      grep -q "from 'node:crypto'" src/crypto/compare.ts &amp;&amp; \
      grep -q "a: Buffer, b: Buffer" src/crypto/compare.ts &amp;&amp; \
      grep -q "): boolean" src/crypto/compare.ts &amp;&amp; \
      grep -q "if (a.length !== b.length)" src/crypto/compare.ts &amp;&amp; \
      ! grep -E "try\s*\{|catch\s*\(" src/crypto/compare.ts &amp;&amp; \
      grep -q "not.toThrow" src/crypto/compare.test.ts
    </automated>
  </verify>

  <acceptance_criteria>
    - File `src/crypto/compare.ts` exists.
    - File `src/crypto/compare.test.ts` exists.
    - `grep -c "^export function timingSafeCompare" src/crypto/compare.ts` returns 1.
    - `grep -q "from 'node:crypto'" src/crypto/compare.ts` succeeds (node: prefix).
    - `grep -q "a: Buffer, b: Buffer" src/crypto/compare.ts` succeeds (Buffer-only signature per D-03).
    - `grep -q "): boolean" src/crypto/compare.ts` succeeds (synchronous boolean return per D-03).
    - `grep -q "if (a.length !== b.length)" src/crypto/compare.ts` succeeds (length guard PRESENT per PITFALLS #2).
    - `grep -E "try\s*\{|catch\s*\(" src/crypto/compare.ts` returns NO matches (NO try/catch — top-level guard only per D-03).
    - `grep -c "describe('timingSafeCompare'" src/crypto/compare.test.ts` returns 1.
    - Test file contains all three required `it` blocks: `it('returns true for equal-length matching buffers'`, `it('returns false for equal-length differing buffers'`, `it('returns false (without throwing) when buffer lengths differ'`.
    - Test file contains `expect(() => timingSafeCompare(a, b)).not.toThrow()` AND `expect(timingSafeCompare(a, b)).toBe(false)` for the length-mismatch case (D-13 mandates both).
    - Test file contains `from './compare.js'` (ESM `.js` extension).
    - `npx vitest run src/crypto/compare.test.ts` exits 0 with all three `it`s passing.
    - `npx biome check src/crypto/compare.ts src/crypto/compare.test.ts` exits 0.
    - All previously-passing tests still pass: `npx vitest run` exits 0 (this includes Task 1's `hmac.test.ts` and the Phase 1 `index.test.ts`).
  </acceptance_criteria>

  <done>
    `timingSafeCompare` is implemented in `src/crypto/compare.ts` with the exact signature `(a: Buffer, b: Buffer) => boolean`, using the PITFALLS.md #2 "RIGHT" length-guard pattern (top-level `if` guard, no try/catch). The co-located test file `src/crypto/compare.test.ts` covers all three D-13 cases (equal-length match → true; equal-length mismatch → false; length mismatch → false AND no throw). Full Vitest suite passes (4 tests total: 1 from Phase 1, 2 from Task 1, 3 from Task 2 = 6 `it`s). Biome lint passes. No external dependency added.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Webhook payload bytes → HMAC computation | Untrusted bytes (the request body sent by the provider, possibly attacker-controlled if signature is forged) cross into `computeHmac`. The function MUST NOT execute, parse, or interpret the bytes — only feed them to `node:crypto`'s `update()`. |
| Provider-supplied signature buffer → constant-time comparison | An attacker controls the signature bytes they send. `timingSafeCompare` MUST NOT branch on byte content (only on length, before the comparison runs). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-01 | Information disclosure (timing attack) | `src/crypto/compare.ts` | mitigate | Use `crypto.timingSafeEqual` for the equal-length path. Length guard returns `false` without invoking `timingSafeEqual` and without throwing. PITFALLS.md Pitfall #1 is the threat; PITFALLS.md Pitfall #2 is the implementation pattern. Test in `compare.test.ts` asserts `not.toThrow()` on length mismatch — locks the behavior against a future "fix" that introduces try/catch and reintroduces the timing leak. |
| T-02-02 | Information disclosure (length leak via thrown exception) | `src/crypto/compare.ts` | mitigate | Top-level `if (a.length !== b.length) return false` guard precedes any call to `crypto.timingSafeEqual`. NO try/catch anywhere in the file (verified by grep gate in acceptance_criteria). PITFALLS.md Pitfall #2: a try/catch around `timingSafeEqual` would let the thrown-on-length-mismatch error propagate timing information about relative lengths back to the attacker. |
| T-02-03 | Information disclosure (secret leakage via error message) | `src/crypto/hmac.ts` | mitigate | Function constructs zero error messages, performs zero logging, and re-throws no caught exceptions. The only throw path is `createHmac`'s built-in throw on invalid algorithm — propagated unmodified. PITFALLS.md Pitfall #5 is the threat. The `algorithm: 'sha256'` literal type means TypeScript compile-time errors out for any other algorithm value, so the runtime throw is effectively unreachable from typed call sites. |
| T-02-04 | Tampering (silent algorithm widening) | `src/crypto/hmac.ts` | mitigate | `algorithm` parameter is the literal `'sha256'`, not `string` and not `'sha256' \| 'sha512'`. A future maintainer who tries to pass `'sha1'` (the deprecated GitHub header — PITFALLS.md Pitfall #9) gets a compile error. Widening MUST be a deliberate, reviewed change. |
| T-02-05 | Repudiation (silent crypto dependency injection) | `src/crypto/hmac.ts`, `src/crypto/compare.ts` | mitigate | Both files import EXCLUSIVELY from `node:crypto`. No `package.json` changes in this plan. CRYP-01 binds us to "Node's `crypto` module"; verifying via grep that no other crypto-package import exists is part of acceptance_criteria. |
| T-02-06 | Denial of service (exception thrown for malformed input) | `src/crypto/compare.ts` | accept | The only call sites for `timingSafeCompare` are future provider modules (Phases 4-5), which will pass `Buffer` arguments derived from controlled conversions (`Buffer.from(headerString, 'hex')` etc.). Phase 2 has no untrusted-string entry point into this function. The `Buffer, Buffer` typed signature (D-03) prevents callers from passing non-Buffers. Risk is structural, not runtime. |
</threat_model>

<verification>
After both tasks land:
- `npx vitest run` exits 0 (all unit tests across `src/` pass — Phase 1 + Phase 2 Plan 01).
- `npx biome check .` exits 0.
- `npx tsc --noEmit -p tsconfig.json` exits 0 (strict TypeScript compiles cleanly).
- `npm run build` exits 0; `dist/crypto/hmac.js`, `dist/crypto/hmac.cjs`, `dist/crypto/hmac.d.ts`, `dist/crypto/compare.js`, `dist/crypto/compare.cjs`, `dist/crypto/compare.d.ts` exist; `dist/crypto/` contains NO `*.test.*` artifacts (`ls dist/crypto/ | grep -E '\.test\.' | wc -l` returns 0).
- `package.json` `dependencies` still contains zero entries (CRYP-01: built on Node's `crypto` module; D-14 no vendor SDKs).
- `git diff --stat` shows exactly four new files (`src/crypto/hmac.ts`, `src/crypto/hmac.test.ts`, `src/crypto/compare.ts`, `src/crypto/compare.test.ts`); no other files modified by this plan.
</verification>

<success_criteria>
1. `computeHmac` and `timingSafeCompare` exported from their respective files with the exact signatures specified in `<interfaces>`.
2. All co-located unit tests pass and cover every D-13 case for these two primitives.
3. Biome lint and TypeScript strict compilation both clean.
4. tsup build produces type declarations and dist artifacts; test files excluded from dist.
5. No external crypto dependency added; only `node:crypto` imported.
6. `src/index.ts` is NOT modified by this plan (Plan 03 owns that).
</success_criteria>

<output>
After completion, create `.planning/phases/02-crypto-core-error-class/02-01-SUMMARY.md` per the standard summary template, including:
- Files created (4: hmac.ts, hmac.test.ts, compare.ts, compare.test.ts)
- Test counts (5 new `it` blocks: 2 in hmac.test.ts, 3 in compare.test.ts)
- Confirmation that no `package.json` changes were required
- Confirmation that the chosen `computeHmac` test vector was verified against `node -e ...` output
- Decision IDs honored: D-01, D-02, D-03, D-04, D-12, D-13, D-14
- Threats mitigated: T-02-01..T-02-05 (T-02-06 accepted)
</output>
</content>
</invoke>