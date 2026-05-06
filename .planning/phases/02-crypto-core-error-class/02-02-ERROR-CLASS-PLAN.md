---
phase: 02-crypto-core-error-class
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/errors.ts
  - src/errors.test.ts
autonomous: true
requirements_addressed: [API-02]
requirements: [API-02]

must_haves:
  truths:
    - "WebhookValidationError constructor accepts ONLY { reason, provider, statusCode } — no message, no cause, no details parameter — D-05"
    - "Reason union ships EXACTLY 4 reasons: 'signature_mismatch' | 'timestamp_too_old' | 'missing_header' | 'missing_secret' — D-07"
    - "Reason values use lowercase_underscore convention; UPPER_SNAKE from ARCHITECTURE.md is NOT imported — D-08"
    - "Message is auto-derived from reason+provider via internal messageFor(); caller cannot override it — D-06"
    - "Class fields reason, provider, statusCode are readonly and public; name = 'WebhookValidationError' — D-10"
    - "toJSON() returns ONLY { name, reason, provider, statusCode, message } — no cause, no details — D-11"
    - "toString() falls through to default Error.prototype.toString — NOT overridden — D-11"
    - "Instance is instanceof Error — D-13"
    - "Auto-derived message contains the provider name — D-13"
    - "JSON.stringify(err) does NOT contain a sample signature, secret, or body string — D-11, D-13"
    - "String(err) does NOT contain a sample signature, secret, or body string — D-11, D-13"
    - "Each of the 4 reasons round-trips via instance.reason — D-13"
    - "Co-located unit tests in src/errors.test.ts cover all D-13 cases — D-12, D-13"
  artifacts:
    - path: "src/errors.ts"
      provides: "WebhookValidationError class + WebhookValidationReason discriminated union type"
      exports: ["WebhookValidationError", "WebhookValidationReason"]
      contains: "class WebhookValidationError extends Error"
    - path: "src/errors.test.ts"
      provides: "Vitest co-located unit tests for WebhookValidationError covering all D-13 cases"
      contains: "describe('WebhookValidationError'"
  key_links:
    - from: "src/errors.test.ts"
      to: "src/errors.ts"
      via: "import { WebhookValidationError, type WebhookValidationReason } from './errors.js'"
      pattern: "from './errors.js'"
    - from: "WebhookValidationError constructor"
      to: "messageFor lookup"
      via: "super(messageFor(opts.reason, opts.provider))"
      pattern: "messageFor\\("
---

<objective>
Ship the discriminated `WebhookValidationError` class that every later provider phase will throw. The constructor shape is locked: `new WebhookValidationError({ reason, provider, statusCode })` — no `message` parameter, no `cause`, no `details`. Co-located Vitest unit tests covering every D-13 case ship in the same plan.

**Purpose:** The error class is THE leakage gate. It sits between provider validation logic (which has the secret, the signature, and the raw body in scope) and any caller code (logger, JSON response serializer, error tracker). By making the constructor structurally incapable of accepting sensitive material — no `message`, no `cause`, no `details` — we close the historical leak vector where developers inadvertently put secrets into a `message` string. This is "structural impossibility" per D-11, not "filter-on-serialize."

**Output:** Two files at the top of `src/`. `errors.ts` is a single small file (no `src/errors/` directory; D-04 specifies `src/errors.ts` flat).
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
@biome.json

<interfaces>
<!-- Contracts the executor MUST implement. LOCKED by CONTEXT.md D-05..D-11 and D-13. -->
<!-- WARNING: ARCHITECTURE.md (.planning/research/ARCHITECTURE.md lines 282-316) shows a DIFFERENT shape: -->
<!--   - UPPER_SNAKE reason names ('SIGNATURE_MISMATCH') -->
<!--   - Positional constructor (reason, provider, message) -->
<!--   - Auto-derived statusCode -->
<!--   - Caller-supplied message -->
<!-- ALL FOUR are OVERRIDDEN by CONTEXT.md (ROADMAP wins). DO NOT IMPORT THE ARCHITECTURE.md SHAPE. -->
<!-- The override table in PATTERNS.md (section "src/errors.ts") catalogues each disagreement. -->

```typescript
// src/errors.ts — public surface (re-exported by Plan 03 from src/index.ts)

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

Existing analog (Vitest co-located test idiom — `src/index.test.ts`):

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
- ESM with `.js` extension on every relative import.
- Strict TypeScript; literal-string unions for `reason`.
- tsup excludes `**/*.test.ts` from dist; Vitest auto-discovers `src/**/*.test.ts`.
- Biome formatter: 2-space indent, single quotes, trailing commas (es5), 100-col line width.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement WebhookValidationError class with messageFor lookup</name>
  <files>src/errors.ts</files>

  <read_first>
    - .planning/phases/02-crypto-core-error-class/02-CONTEXT.md (D-05 through D-11 — ALL of "Error Class Shape" section is binding; "Specifics" section "Leakage stance preference"; "Deferred Ideas" — confirm no `cause`, no `details`, no extra reasons)
    - .planning/phases/02-crypto-core-error-class/02-PATTERNS.md (section "src/errors.ts" — read the override table BEFORE the skeleton; PATTERNS.md is the override map)
    - .planning/research/ARCHITECTURE.md lines 282-316 (read ONLY to confirm the shape you must NOT use; the override table in PATTERNS.md tells you why each piece is overridden)
    - .planning/research/PITFALLS.md Pitfall #5 lines 178-225 (the leakage threat this class structurally prevents)
    - .planning/REQUIREMENTS.md API-02 (the requirement; reasons listed there end with "etc." — D-07 narrows "etc." to exactly the 4 listed reasons for Phase 2)
    - .planning/ROADMAP.md "Phase 2: Crypto Core & Error Class" success criteria 3 and 4 (the binding spec)
  </read_first>

  <behavior>
    <!-- TDD: define expected observable behavior BEFORE implementation. -->
    <!-- These behaviors are exercised by the test file in Task 2 — DO NOT skip Task 2. -->
    - Construction with `{ reason: 'signature_mismatch', provider: 'stripe', statusCode: 401 }` produces an instance where:
      * `err.reason === 'signature_mismatch'`
      * `err.provider === 'stripe'`
      * `err.statusCode === 401`
      * `err.name === 'WebhookValidationError'`
      * `err instanceof Error === true`
      * `err instanceof WebhookValidationError === true`
      * `err.message.length > 0`
      * `err.message.includes('stripe') === true` (D-13: "auto-derived message is non-empty and contains the provider name")
    - Each of the 4 reasons in `WebhookValidationReason` round-trips through the constructor and back via `instance.reason`.
    - `JSON.stringify(err)` returns a string containing exactly the keys `name`, `reason`, `provider`, `statusCode`, `message` (and no others — verify by parsing the JSON and comparing key sets).
    - `JSON.stringify(err)` and `String(err)` for any constructed instance contain none of: a sample signature hex string, a sample secret string, a sample body JSON string. (Structural guarantee — there's no path for these to enter the instance, but the test locks the guarantee against future regressions.)
    - TypeScript compile-time: `new WebhookValidationError({ reason: 'malformed_payload', provider: 'stripe', statusCode: 401 })` MUST be a type error (the reason is not in the union per D-07). No runtime test for this — the type system enforces it.
    - TypeScript compile-time: `new WebhookValidationError({ reason: 'signature_mismatch', provider: 'stripe', statusCode: 401, cause: new Error() })` MUST be a type error (no `cause` property in the constructor type per D-05). No runtime test.
  </behavior>

  <action>
    Create `src/errors.ts` containing the `WebhookValidationReason` type union, the `WebhookValidationError` class, and an internal `messageFor` helper.

    **CRITICAL OVERRIDES** — before writing, internalize this table from PATTERNS.md (CONTEXT.md wins on every row):

    | Aspect | ARCHITECTURE.md says | CONTEXT.md (use this) |
    |--------|----------------------|------------------------|
    | Reason naming | `'SIGNATURE_MISMATCH'` (UPPER_SNAKE) | `'signature_mismatch'` (lowercase_underscore) — D-08 |
    | Constructor | `(reason, provider, message)` positional | `({ reason, provider, statusCode })` options-object — D-05 |
    | `message` | caller-supplied | auto-derived via `messageFor(reason, provider)` — D-06 |
    | `statusCode` | `private computeStatusCode(reason)` auto-derived | required from caller — D-09 |
    | `cause` / `details` | (silent, possibly present) | structurally absent — no field, no parameter — D-11 |

    **File: `src/errors.ts`** — exact content shape:

    ```typescript
    // Discriminated reason union for webhook signature validation failures.
    // Phase 2 ships exactly the 4 reasons mandated by ROADMAP success criterion 3.
    // Each later phase widens this union in the SAME commit that ships the test
    // exercising the new reason. Phase 2 D-07 — DO NOT pre-add reasons.
    export type WebhookValidationReason =
      | 'signature_mismatch'
      | 'timestamp_too_old'
      | 'missing_header'
      | 'missing_secret';

    /**
     * Deterministic message lookup. Consumes only `reason` and `provider`;
     * never includes signature bytes, secret bytes, or body content.
     *
     * Phase 2 D-06: caller cannot override the message — that closes the
     * historical leak vector where developers inadvertently put secrets into
     * a `message` string. Phase 2 D-13: result must contain the provider name.
     */
    function messageFor(reason: WebhookValidationReason, provider: string): string {
      // Convention: `<provider> webhook <human-readable reason>`.
      // Deterministic, contains the provider name, no inputs beyond reason/provider.
      const humanReason = reason.replace(/_/g, ' ');
      return `${provider} webhook ${humanReason}`;
    }

    /**
     * Discriminated webhook validation error. Throw this from provider modules
     * when signature verification (or its preconditions) fails.
     *
     * Constructor signature is locked (Phase 2 D-05): only `{ reason, provider,
     * statusCode }`. NO `message` parameter (auto-derived per D-06). NO `cause`
     * parameter (D-11 structural leakage prevention). NO `details` parameter
     * (D-11). If a future need emerges for wrapping a downstream error,
     * revisit with a test that proves the wrapped error does not leak through
     * `toJSON`.
     *
     * Leakage stance is structural: because no field exists for sensitive
     * data, there is no path for signature/secret/body content to enter the
     * instance. `toJSON()` whitelists the safe fields; `toString()` falls
     * through to `Error.prototype.toString`.
     */
    export class WebhookValidationError extends Error {
      public readonly reason: WebhookValidationReason;
      public readonly provider: string;
      public readonly statusCode: number;

      constructor(opts: {
        reason: WebhookValidationReason;
        provider: string;
        statusCode: number;
      }) {
        super(messageFor(opts.reason, opts.provider));
        this.name = 'WebhookValidationError';
        this.reason = opts.reason;
        this.provider = opts.provider;
        this.statusCode = opts.statusCode;
      }

      // Whitelist serialization. Defense-in-depth re-statement of the
      // structural guarantee from D-11: even if a future maintainer adds a
      // private field, this method enumerates exactly what may be serialized.
      toJSON(): {
        name: string;
        reason: WebhookValidationReason;
        provider: string;
        statusCode: number;
        message: string;
      } {
        return {
          name: this.name,
          reason: this.reason,
          provider: this.provider,
          statusCode: this.statusCode,
          message: this.message,
        };
      }
    }
    ```

    Constraints (do NOT violate — every one of these has a specific D-XX backing):
    - Constructor parameter is exactly `opts: { reason, provider, statusCode }`. No second parameter. No `?` optional params. No `cause`. No `details`. No spread. (D-05, D-11.)
    - `WebhookValidationReason` type union has EXACTLY the 4 listed members. Do NOT add `malformed_payload`, `invalid_encoding`, `invalid_signature_format`, `replay_suspected`, `body_missing`, or `string` widening. (D-07.)
    - Reason values are lowercase_underscore. Do NOT import or copy ARCHITECTURE.md's UPPER_SNAKE list. (D-08.)
    - `name`, `reason`, `provider`, `statusCode` are exposed as `public readonly`. (D-10.)
    - `name` is set to the literal string `'WebhookValidationError'`. (D-10.)
    - `toJSON()` returns the 5-key whitelist exactly. Do NOT add `cause`, `stack`, or any other key. (D-11.)
    - `toString()` is NOT overridden. Default `Error.prototype.toString()` produces `"WebhookValidationError: <message>"`. (D-11.)
    - `messageFor` is module-private (no `export`). Its result MUST contain the provider name (D-13). It MUST be deterministic and consume only `reason` and `provider` (D-12 "Claude's Discretion §1": "Must be deterministic; must not include any input outside reason/provider").
    - File contains NO `console.log`/`console.error`/`logger.*` calls. NO `process.env.*` reads. NO `import` statements other than (none — `Error` is global). (PITFALLS.md #5.)
    - File MUST NOT modify `Error.captureStackTrace` or otherwise tamper with the prototype chain — strict TS + ES2020 + `extends Error` works correctly under tsup's CJS+ESM dual output without any V8-specific shims. If you find yourself reaching for `Object.setPrototypeOf(this, WebhookValidationError.prototype)`, STOP — current `target: "ES2020"` doesn't need it. If a test in Task 2 reveals `instanceof` is broken, add the line then; otherwise don't.
  </action>

  <verify>
    <automated>
      cd /home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru &amp;&amp; \
      npx tsc --noEmit -p tsconfig.json &amp;&amp; \
      npx biome check src/errors.ts &amp;&amp; \
      grep -q "^export type WebhookValidationReason" src/errors.ts &amp;&amp; \
      grep -q "^export class WebhookValidationError extends Error" src/errors.ts &amp;&amp; \
      grep -c "'signature_mismatch'\|'timestamp_too_old'\|'missing_header'\|'missing_secret'" src/errors.ts | grep -qE '^[4-9]$|^[1-9][0-9]+$' &amp;&amp; \
      ! grep -E "'SIGNATURE_MISMATCH'|'MISSING_HEADER'|'MALFORMED_PAYLOAD'|'TIMESTAMP_INVALID'|'REPLAY_SUSPECTED'" src/errors.ts &amp;&amp; \
      ! grep -E "'malformed_payload'|'invalid_encoding'|'invalid_signature_format'|'replay_suspected'|'body_missing'" src/errors.ts &amp;&amp; \
      ! grep -nE "(^|[^a-zA-Z_])cause(\s*:|\s*\?:|\s*=)" src/errors.ts &amp;&amp; \
      ! grep -nE "(^|[^a-zA-Z_])details(\s*:|\s*\?:|\s*=)" src/errors.ts &amp;&amp; \
      grep -q "messageFor(opts.reason, opts.provider)" src/errors.ts &amp;&amp; \
      grep -q "this.name = 'WebhookValidationError'" src/errors.ts &amp;&amp; \
      grep -q "toJSON()" src/errors.ts &amp;&amp; \
      ! grep -nE "toString\s*\(\s*\)\s*[:{]" src/errors.ts
    </automated>
  </verify>

  <acceptance_criteria>
    - File `src/errors.ts` exists.
    - `grep -c "^export type WebhookValidationReason" src/errors.ts` returns 1.
    - `grep -c "^export class WebhookValidationError extends Error" src/errors.ts` returns 1.
    - File contains literally these four reason strings, and ONLY these four, in the union: `'signature_mismatch'`, `'timestamp_too_old'`, `'missing_header'`, `'missing_secret'` (D-07).
    - File contains NONE of these UPPER_SNAKE strings: `'SIGNATURE_MISMATCH'`, `'MISSING_HEADER'`, `'MALFORMED_PAYLOAD'`, `'TIMESTAMP_INVALID'`, `'REPLAY_SUSPECTED'` (ARCHITECTURE.md form is overridden per D-08).
    - File contains NONE of these reason strings (deferred per D-07): `'malformed_payload'`, `'invalid_encoding'`, `'invalid_signature_format'`, `'replay_suspected'`, `'body_missing'`.
    - File contains NO field named `cause` (regex `(^|[^a-zA-Z_])cause(\s*:|\s*\?:|\s*=)` returns no matches — D-11 forbids `cause` parameter and field).
    - File contains NO field named `details` (regex `(^|[^a-zA-Z_])details(\s*:|\s*\?:|\s*=)` returns no matches — D-11 forbids `details`).
    - File contains `this.name = 'WebhookValidationError'` (D-10).
    - File contains `super(messageFor(opts.reason, opts.provider))` (D-06).
    - File defines `messageFor` as a non-exported function (no `export function messageFor`).
    - File defines `toJSON()` method on `WebhookValidationError` (D-11).
    - File does NOT define `toString()` override on `WebhookValidationError` (D-11 — falls through to default).
    - File contains NO `console.` calls, NO `process.env`, NO logging imports (PITFALLS #5).
    - `npx tsc --noEmit -p tsconfig.json` exits 0 (strict mode compiles cleanly).
    - `npx biome check src/errors.ts` exits 0.
  </acceptance_criteria>

  <done>
    `src/errors.ts` exports `WebhookValidationError` (class) and `WebhookValidationReason` (4-member literal union) with the exact constructor shape `{ reason, provider, statusCode }`. The internal `messageFor` lookup is deterministic, contains the provider name, and consumes nothing else. `toJSON()` whitelists the 5 safe keys. `toString()` is not overridden. No `cause`, no `details`, no logging, no env reads. Strict TS compiles. Biome lint passes.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Co-located unit tests for WebhookValidationError covering all D-13 cases</name>
  <files>src/errors.test.ts</files>

  <read_first>
    - .planning/phases/02-crypto-core-error-class/02-CONTEXT.md (D-12, D-13 — copy the test cases verbatim; D-14 — inline vectors only)
    - .planning/phases/02-crypto-core-error-class/02-PATTERNS.md (section "src/errors.test.ts" — full skeleton including the SAMPLE_SIGNATURE / SAMPLE_SECRET / SAMPLE_BODY constants)
    - src/errors.ts (the file you just wrote in Task 1 — confirm exports and behavior match what the tests expect)
    - src/index.test.ts (Vitest co-located idiom)
    - src/crypto/hmac.test.ts (analog from sibling Plan 01 if it has landed; identical idiom either way)
  </read_first>

  <behavior>
    <!-- These six `it` blocks come directly from CONTEXT.md D-13 — copy them verbatim. -->
    1. Constructor stores `reason`, `provider`, `statusCode` on the instance.
    2. Instance is `instanceof Error` AND `instanceof WebhookValidationError`.
    3. Auto-derived `message` is non-empty AND contains the provider name.
    4. Each of the 4 reasons (`'signature_mismatch'`, `'timestamp_too_old'`, `'missing_header'`, `'missing_secret'`) round-trips via `instance.reason`. Use `it.each` over the union.
    5. `JSON.stringify(err)` does NOT contain a sample signature, secret, or body string.
    6. `String(err)` does NOT contain a sample signature, secret, or body string.

    Optional but recommended additional coverage (cheap, locks the structural guarantees from D-11):
    7. `JSON.parse(JSON.stringify(err))` returns an object whose keys are exactly `{ name, reason, provider, statusCode, message }` — no `cause`, no `details`, no `stack`.
    8. `err.name === 'WebhookValidationError'`.
  </behavior>

  <action>
    Create `src/errors.test.ts` mirroring the Vitest co-located idiom and covering every D-13 case.

    **File: `src/errors.test.ts`** — exact content shape (PATTERNS.md "src/errors.test.ts" skeleton, with the optional extra coverage for `name` and the `toJSON` key whitelist):

    ```typescript
    import { describe, expect, it } from 'vitest';
    import { WebhookValidationError, type WebhookValidationReason } from './errors.js';

    // Sample sensitive material. These strings are NEVER passed to the
    // constructor — the constructor has no field for them by design (D-11).
    // The leakage tests assert that constructed instances cannot serialize
    // these values, locking the structural guarantee against regressions.
    const SAMPLE_SIGNATURE = 't=1700000000,v1=deadbeefcafe1234567890abcdef';
    const SAMPLE_SECRET = 'whsec_super_secret_value_do_not_leak';
    const SAMPLE_BODY = '{"id":"evt_test","type":"charge.succeeded"}';

    describe('WebhookValidationError', () => {
      it('stores reason, provider, and statusCode on the instance', () => {
        const err = new WebhookValidationError({
          reason: 'signature_mismatch',
          provider: 'stripe',
          statusCode: 401,
        });
        expect(err.reason).toBe('signature_mismatch');
        expect(err.provider).toBe('stripe');
        expect(err.statusCode).toBe(401);
      });

      it('is an instance of Error and WebhookValidationError', () => {
        const err = new WebhookValidationError({
          reason: 'signature_mismatch',
          provider: 'stripe',
          statusCode: 401,
        });
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(WebhookValidationError);
      });

      it("sets name to 'WebhookValidationError'", () => {
        const err = new WebhookValidationError({
          reason: 'signature_mismatch',
          provider: 'stripe',
          statusCode: 401,
        });
        expect(err.name).toBe('WebhookValidationError');
      });

      it('auto-derives a non-empty message that contains the provider name', () => {
        const err = new WebhookValidationError({
          reason: 'signature_mismatch',
          provider: 'stripe',
          statusCode: 401,
        });
        expect(err.message.length).toBeGreaterThan(0);
        expect(err.message).toContain('stripe');
      });

      it.each<WebhookValidationReason>([
        'signature_mismatch',
        'timestamp_too_old',
        'missing_header',
        'missing_secret',
      ])('round-trips reason %s via instance.reason', (reason) => {
        const err = new WebhookValidationError({
          reason,
          provider: 'stripe',
          statusCode: 401,
        });
        expect(err.reason).toBe(reason);
      });

      it('does not leak sample signature/secret/body via JSON.stringify or String()', () => {
        const err = new WebhookValidationError({
          reason: 'signature_mismatch',
          provider: 'stripe',
          statusCode: 401,
        });
        const json = JSON.stringify(err);
        const str = String(err);
        for (const leak of [SAMPLE_SIGNATURE, SAMPLE_SECRET, SAMPLE_BODY]) {
          expect(json).not.toContain(leak);
          expect(str).not.toContain(leak);
        }
      });

      it('toJSON whitelists exactly { name, reason, provider, statusCode, message }', () => {
        const err = new WebhookValidationError({
          reason: 'signature_mismatch',
          provider: 'stripe',
          statusCode: 401,
        });
        const serialized = JSON.parse(JSON.stringify(err)) as Record<string, unknown>;
        const keys = Object.keys(serialized).sort();
        expect(keys).toEqual(['message', 'name', 'provider', 'reason', 'statusCode']);
      });
    });
    ```

    Constraints on the test file:
    - Inline test data only (D-14). No `tests/fixtures/`, no shared helper file.
    - `import` path uses `.js` extension (`./errors.js`).
    - `WebhookValidationReason` imported with `type` keyword (`type WebhookValidationReason`) — required by Biome `organizeImports` and TypeScript `verbatimModuleSyntax`-aware configs.
    - SAMPLE constants are module-level (not inside `describe`) so the leakage assertion has access without re-declaration in each `it`.
    - SAMPLE strings MUST be distinctive enough that an accidental match would be a real bug — use the values shown (`whsec_super_secret_value_do_not_leak` etc.). Do NOT use generic strings like `"abc"` that could collide with stack-trace content.
    - Use `it.each<WebhookValidationReason>([...])` for the 4-reason round-trip — the typed array catches any future deviation from the D-07 union.
    - The leakage test asserts both `JSON.stringify(err)` AND `String(err)` (D-13 mandates both forms — they exercise different code paths: `toJSON` vs `Error.prototype.toString`).
    - The `toJSON` whitelist test sorts keys alphabetically before comparing — the order of `Object.keys` is implementation-defined for symbol/inherited concerns and `Object.keys(JSON.parse(...))` returns own-string-keys in insertion order, which we explicitly want to lock.
    - Do NOT mock anything. The error class is pure.

    Run order: ensure `src/errors.ts` from Task 1 is in place, then write `src/errors.test.ts`, then run `npx vitest run src/errors.test.ts` and confirm ALL `it` blocks pass (7 individual tests + 4 from `it.each` = 11 reported).
  </action>

  <verify>
    <automated>
      cd /home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru &amp;&amp; \
      npx vitest run src/errors.test.ts &amp;&amp; \
      npx biome check src/errors.test.ts &amp;&amp; \
      grep -q "describe('WebhookValidationError'" src/errors.test.ts &amp;&amp; \
      grep -q "from './errors.js'" src/errors.test.ts &amp;&amp; \
      grep -q "type WebhookValidationReason" src/errors.test.ts &amp;&amp; \
      grep -q "toBeInstanceOf(Error)" src/errors.test.ts &amp;&amp; \
      grep -q "toBeInstanceOf(WebhookValidationError)" src/errors.test.ts &amp;&amp; \
      grep -q "toContain('stripe')" src/errors.test.ts &amp;&amp; \
      grep -q "it.each<WebhookValidationReason>" src/errors.test.ts &amp;&amp; \
      grep -q "JSON.stringify(err)" src/errors.test.ts &amp;&amp; \
      grep -q "String(err)" src/errors.test.ts &amp;&amp; \
      grep -q "SAMPLE_SIGNATURE" src/errors.test.ts &amp;&amp; \
      grep -q "SAMPLE_SECRET" src/errors.test.ts &amp;&amp; \
      grep -q "SAMPLE_BODY" src/errors.test.ts
    </automated>
  </verify>

  <acceptance_criteria>
    - File `src/errors.test.ts` exists.
    - `grep -c "describe('WebhookValidationError'" src/errors.test.ts` returns 1.
    - File imports `WebhookValidationError` AND `type WebhookValidationReason` from `'./errors.js'` (exact import).
    - File contains all 7 D-13-derived `it` blocks (or equivalent — 6 mandatory + 1 optional `toJSON` whitelist):
      1. `it('stores reason, provider, and statusCode on the instance'`
      2. `it('is an instance of Error and WebhookValidationError'`
      3. `it("sets name to 'WebhookValidationError'"` (or single-quote variant)
      4. `it('auto-derives a non-empty message that contains the provider name'`
      5. `it.each<WebhookValidationReason>([` ... `])('round-trips reason %s via instance.reason'`
      6. `it('does not leak sample signature/secret/body via JSON.stringify or String()'`
      7. `it('toJSON whitelists exactly { name, reason, provider, statusCode, message }'`
    - File defines `SAMPLE_SIGNATURE`, `SAMPLE_SECRET`, `SAMPLE_BODY` as module-level `const`s.
    - The leakage test asserts BOTH `JSON.stringify(err).not.toContain(...)` AND `String(err).not.toContain(...)` for all three sample strings (D-13).
    - The `it.each` array is typed `<WebhookValidationReason>` (compile-time enforces the 4-reason union).
    - `npx vitest run src/errors.test.ts` exits 0 with at least 10 individual tests passing (7 `it`s, with `it.each` expanding to 4).
    - `npx biome check src/errors.test.ts` exits 0.
    - Full test suite still passes: `npx vitest run` exits 0 (Phase 1 `index.test.ts` + Plan 01 crypto tests + this file).
  </acceptance_criteria>

  <done>
    `src/errors.test.ts` covers every D-13 case with co-located Vitest tests using the established idiom. All four reason values round-trip via a typed `it.each` (compile-time enforces D-07). The leakage test asserts both `JSON.stringify(err)` and `String(err)` against three module-level sample strings (signature, secret, body). The `toJSON` whitelist test locks the 5-key serialization shape from D-11. Full test suite passes; Biome lint clean.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Provider validation logic → `WebhookValidationError` constructor | A future provider module (Phase 4-5) holds the secret, the raw body, and the signature in scope when it decides to throw. The constructor MUST NOT accept any of those values, even if the caller tries to pass them. |
| `WebhookValidationError` instance → caller's logger / response serializer / error tracker | Once an instance escapes the throw point, it may be JSON-serialized for an HTTP 401 response, logged with `console.error(err)`, sent to Sentry, etc. The instance MUST NOT carry signature/secret/body content into any of those sinks. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-07 | Information disclosure (secret/signature leakage via Error.message) | `src/errors.ts` constructor | mitigate | Constructor accepts only `{ reason, provider, statusCode }` (D-05) — no `message` parameter exists, so a careless caller cannot stuff `secret` or `signature` into the message. The `super(...)` call uses the auto-derived `messageFor(reason, provider)` (D-06), which consumes only `reason` and `provider`. Verified by acceptance_criteria grep gates: NO `cause`, NO `details`, presence of `messageFor(opts.reason, opts.provider)`. PITFALLS.md Pitfall #5 is the threat. |
| T-02-08 | Information disclosure (secret/signature leakage via JSON.stringify) | `src/errors.ts` toJSON | mitigate | `toJSON()` whitelists exactly `{ name, reason, provider, statusCode, message }` (D-11). Even if a future maintainer adds a private field carrying sensitive data, the whitelist prevents it from being serialized. The test `it('toJSON whitelists exactly...')` locks this against regression by asserting the exact 5-key set. |
| T-02-09 | Information disclosure (secret/signature leakage via String(err)) | `src/errors.ts` toString (default) | mitigate | `toString()` is NOT overridden — falls through to `Error.prototype.toString()`, which produces `"WebhookValidationError: <message>"`. Since `message` is auto-derived from `reason`+`provider` only (T-02-07 mitigation), `String(err)` is structurally safe. The test `it('does not leak...via JSON.stringify or String()')` asserts both forms against three sample strings (D-13). |
| T-02-10 | Tampering (silent reason union widening) | `src/errors.ts` WebhookValidationReason | mitigate | The `WebhookValidationReason` type union has exactly 4 members per D-07. Adding a 5th reason without updating the test (which uses `it.each<WebhookValidationReason>`) would fail to exercise the new reason — visible drift. Acceptance_criteria grep gates also explicitly forbid the deferred reason values (`'malformed_payload'`, `'invalid_encoding'`, etc.) from appearing in this file. |
| T-02-11 | Tampering (constructor shape drift toward ARCHITECTURE.md form) | `src/errors.ts` constructor | mitigate | Constructor accepts a single typed options object — no positional arguments, no optional `message` parameter, no `cause`, no `details`. Acceptance_criteria grep gates explicitly forbid `cause:` and `details:` field declarations. The override table in PATTERNS.md is referenced in `<read_first>` so the executor cannot accidentally implement the ARCHITECTURE.md shape. |
| T-02-12 | Repudiation (silent statusCode auto-derivation) | `src/errors.ts` constructor | mitigate | `statusCode` is required from the caller (D-09) — the type system enforces it. There is no `private computeStatusCode(reason)` method (PATTERNS.md override table). The provider that decides to throw also decides the status code; the error class does not bake provider-specific HTTP semantics. |
| T-02-13 | Denial of service (broken `instanceof Error` after transpilation) | `src/errors.ts` class extension | accept | tsconfig `target: "ES2020"` produces native `class extends Error`; `Object.setPrototypeOf` shim is unnecessary for ES2020+ targets. The test `it('is an instance of Error and WebhookValidationError')` will FAIL fast if a future tsconfig change breaks this; the maintainer is then forced to add the shim deliberately. Risk is bounded; cost is the one assertion. |
</threat_model>

<verification>
After both tasks land:
- `npx vitest run` exits 0 (Phase 1 `index.test.ts` + any landed Plan 01 tests + Plan 02 `errors.test.ts`).
- `npx biome check .` exits 0.
- `npx tsc --noEmit -p tsconfig.json` exits 0 (strict mode compiles cleanly across the whole src/ tree).
- `npm run build` exits 0; `dist/errors.js`, `dist/errors.cjs`, `dist/errors.d.ts` exist; `dist/` contains NO `errors.test.*`.
- `dist/errors.d.ts` exports both `WebhookValidationError` (class) and `WebhookValidationReason` (type).
- `package.json` `dependencies` still contains zero entries.
- `git diff --stat` shows exactly two new files (`src/errors.ts`, `src/errors.test.ts`) added by this plan; no other files modified.
</verification>

<success_criteria>
1. `WebhookValidationError` and `WebhookValidationReason` exported from `src/errors.ts` with the exact shape in `<interfaces>`.
2. Constructor signature is locked to `{ reason, provider, statusCode }` — no `message`, no `cause`, no `details`.
3. Reason union is exactly the 4 lowercase_underscore values from D-07.
4. `toJSON()` whitelist returns exactly `{ name, reason, provider, statusCode, message }`.
5. `toString()` is not overridden.
6. All D-13 test cases pass (constructor field storage, `instanceof Error`, message non-empty + contains provider, 4-reason round-trip, `JSON.stringify`/`String(err)` no-leak).
7. Biome lint and TypeScript strict compilation both clean.
8. tsup build produces type declarations and dist artifacts; test file excluded from dist.
9. `src/index.ts` is NOT modified by this plan (Plan 03 owns that).
</success_criteria>

<output>
After completion, create `.planning/phases/02-crypto-core-error-class/02-02-SUMMARY.md` per the standard summary template, including:
- Files created (2: `src/errors.ts`, `src/errors.test.ts`)
- Test counts (7 `describe`-level `it` blocks; `it.each` expands to 4 more = 10+ individual tests)
- Confirmation that ARCHITECTURE.md's UPPER_SNAKE / positional-constructor / auto-statusCode / caller-message form was NOT implemented (CONTEXT.md overrides applied)
- Confirmation that no `cause` or `details` parameter exists on the constructor or class
- Confirmation that `package.json` is unchanged
- Decision IDs honored: D-05, D-06, D-07, D-08, D-09, D-10, D-11, D-12, D-13, D-14
- Threats mitigated: T-02-07..T-02-12 (T-02-13 accepted)
</output>
</content>
</invoke>