# Phase 2: Crypto Core & Error Class - Pattern Map

**Mapped:** 2026-05-06
**Files analyzed:** 7 (6 new + 1 modified)
**Analogs found:** 7 / 7 (every new file has a Phase-1-or-PITFALLS analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/crypto/hmac.ts` | utility (pure function) | transform (bytes→bytes) | `src/index.ts` (export style only — no functional analog exists yet) + ARCHITECTURE.md §"Constant-Time Comparison" snippet (`crypto.createHmac` shape) | role-match (export style) + research-snippet (function shape) |
| `src/crypto/hmac.test.ts` | test | request-response (input vector → expected digest) | `src/index.test.ts` | exact (Vitest co-located idiom) |
| `src/crypto/compare.ts` | utility (pure function) | transform (Buffer×Buffer → boolean) | PITFALLS.md Pitfall #2 "RIGHT" snippet | research-snippet (canonical length-guard pattern) |
| `src/crypto/compare.test.ts` | test | request-response (Buffer pair → boolean) | `src/index.test.ts` | exact (Vitest co-located idiom) |
| `src/errors.ts` | model (error class) | construct-and-serialize | ARCHITECTURE.md §"Error Model" `class WebhookValidationError extends Error` block (shape only — naming/constructor/statusCode rules **overridden** by CONTEXT.md D-05..D-11) | role-match (class skeleton); CONTEXT.md is the authoritative spec |
| `src/errors.test.ts` | test | request-response (constructor args → instance + serialization) | `src/index.test.ts` | exact (Vitest co-located idiom) |
| `src/index.ts` (modified) | config (barrel export) | n/a | `src/index.ts` (current state) | exact (preserve `VERSION`, add named exports) |

**Analog scarcity note:** This is the second phase on a 2-file repo. The only first-party analogs that exist are `src/index.ts` and `src/index.test.ts`. For functional patterns (HMAC computation, length-guarded comparison, error-class shape), the closest patterns live in `.planning/research/ARCHITECTURE.md` and `.planning/research/PITFALLS.md`. Both are quoted verbatim below where they apply.

---

## Pattern Assignments

### `src/crypto/hmac.ts` (utility, transform)

**Analog (export style):** `src/index.ts` — current Phase 1 state.

**Analog (function shape):** ARCHITECTURE.md "Constant-Time Comparison" code block (line 548): `crypto.createHmac('sha256', secret).update(body).digest()`. Note: ARCHITECTURE shows `.digest()` with no encoding argument, which returns a `Buffer` — exactly matching CONTEXT.md D-01.

**Imports pattern** — modern Node convention per CONTEXT.md D-12 ("prefer `node:` prefix"):
```typescript
import { createHmac } from 'node:crypto';
```
No project-internal imports needed; this module has zero dependencies on the rest of `src/`.

**Core pattern** (synthesized from ARCHITECTURE.md line 548 + CONTEXT.md D-01..D-02):
```typescript
// Returns Buffer (raw digest). Encoding-neutral by design — providers
// (Stripe→hex, GitHub→hex, Shopify→base64) convert at their own boundary.
export function computeHmac(
  rawBody: Buffer | string,
  secret: string,
  algorithm: 'sha256'
): Buffer {
  return createHmac(algorithm, secret).update(rawBody).digest();
}
```
**Key constraints from CONTEXT.md (do NOT violate):**
- `algorithm` is the literal `'sha256'`, not `string` (D-02).
- Return type is `Buffer`, not hex string (D-01).
- No encoding parameter on `.digest()` — bare `.digest()` returns `Buffer` (D-01, "specifics" section).
- `secret: string` is the locked input; widening to `string | Buffer` is Claude's-discretion (D-12 "Whether `computeHmac` accepts `secret: string | Buffer`").

**Error handling pattern:** None. This is a thin pure wrapper over `node:crypto`. `createHmac` throws synchronously for invalid algorithm names — let it propagate; no try/catch.

**Export pattern (mirrors `src/index.ts:4` style):**
```typescript
// src/index.ts line 4 (Phase 1):
export const VERSION = '0.0.1';
```
Use the same flat `export function ...` form — no default exports, no namespaces.

---

### `src/crypto/hmac.test.ts` (test)

**Analog:** `src/index.test.ts` (exact idiom).

**Full file content of analog** (`src/index.test.ts`, lines 1–9):
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

**Patterns to copy verbatim:**
1. **Import order:** Vitest functions first, alphabetized (`describe, expect, it`), then SUT.
2. **Import path uses `.js` extension** even though the source is `.ts` — required by `moduleResolution: "bundler"` + ESM (`tsconfig.json:7`, `package.json:4`). For sibling imports in `src/crypto/`, this becomes `import { computeHmac } from './hmac.js';`.
3. **`describe` label = subject name**, kebab/lowercase.
4. **`it` label = behavioral assertion**, present tense ("exports a VERSION string", not "should export...").
5. **No `vi.mock()`, no setup/teardown** — Phase 2 tests are pure functions; mocking is explicitly out of scope.

**Test content per CONTEXT.md D-13 + D-14:**
- One `it` for the RFC-style vector check (known body + known secret → known digest hex). Vector defined inline; no `tests/fixtures/` (D-14).
- One `it` asserting `Buffer.isBuffer(result)` to lock the return type (D-13 "verifies `Buffer` return type").

**Skeleton (mirroring `src/index.test.ts` shape):**
```typescript
import { describe, expect, it } from 'vitest';
import { computeHmac } from './hmac.js';

describe('computeHmac', () => {
  it('produces the known SHA-256 digest for a fixed body and secret', () => {
    const body = '...';     // inline vector
    const secret = '...';   // inline vector
    const expectedHex = '...'; // pre-computed reference
    expect(computeHmac(body, secret, 'sha256').toString('hex')).toBe(expectedHex);
  });

  it('returns a Buffer', () => {
    expect(Buffer.isBuffer(computeHmac('x', 'k', 'sha256'))).toBe(true);
  });
});
```

---

### `src/crypto/compare.ts` (utility, transform)

**Analog:** PITFALLS.md Pitfall #2, "RIGHT" snippet (lines 58–63):
```javascript
// RIGHT - length check first, no early return
if (computed.length !== header.length) {
  return false; // Don't throw; safe timing
}
crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(header));
```

This is the **canonical length-guard pattern** Phase 2 must implement. Pitfall #1 (PITFALLS.md lines 13–43) establishes *why* `===` is forbidden; Pitfall #2 establishes *how* the length guard wraps `crypto.timingSafeEqual`. CONTEXT.md D-03 binds the function signature to `Buffer`-only inputs (no string normalization).

**Imports pattern:**
```typescript
import { timingSafeEqual } from 'node:crypto';
```

**Core pattern** (PITFALLS.md #2 "RIGHT" snippet, adapted to CONTEXT.md D-03's Buffer-only signature):
```typescript
// Length-guarded constant-time comparison. Length mismatch returns false
// without throwing — see PITFALLS.md Pitfall #2 for the rationale.
export function timingSafeCompare(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    return false; // top-level guard; not a try/catch around timingSafeEqual
  }
  return timingSafeEqual(a, b);
}
```

**Critical constraints (do NOT violate):**
- **No `try/catch` around `timingSafeEqual`.** CONTEXT.md D-03: "a top-level guard, not a try/catch around `crypto.timingSafeEqual`." The ARCHITECTURE.md `try/catch` snippet (lines 538–545) is **rejected** in favor of the PITFALLS.md length-guard form.
- **Buffer-only inputs.** CONTEXT.md D-03 + "specifics" section: do NOT accept strings; do NOT ship a `timingSafeCompareHex` sibling.
- **Returns `boolean`.** Never `Promise<boolean>`, never throws.

**Error handling pattern:** None. Length mismatch is an in-band `false` return, not an exception.

---

### `src/crypto/compare.test.ts` (test)

**Analog:** `src/index.test.ts` (exact Vitest idiom — see full quote under hmac.test.ts above).

**Required test cases per CONTEXT.md D-13:**
1. Equal-length match → `true`.
2. Equal-length mismatch → `false`.
3. Length mismatch → `false` AND no exception thrown.

**Skeleton:**
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

**Import path note:** `./compare.js` — `.js` extension is mandatory (see hmac.test.ts notes; same `moduleResolution: "bundler"` + ESM rule).

---

### `src/errors.ts` (model, construct-and-serialize)

**Analog (skeleton only):** ARCHITECTURE.md §"Error Model" lines 290–316 — `class WebhookValidationError extends Error` outline.

**CRITICAL: ARCHITECTURE.md is overridden in three places by CONTEXT.md.** Quote the analog only for the class-extends-Error skeleton; for everything else CONTEXT.md wins:

| Aspect | ARCHITECTURE.md says | CONTEXT.md says | Winner |
|--------|----------------------|------------------|--------|
| Reason naming | `'SIGNATURE_MISMATCH'` (UPPER_SNAKE) | `'signature_mismatch'` (lowercase_underscore) | CONTEXT.md D-08 (ROADMAP wins) |
| Constructor | `(reason, provider, message)` positional | `({ reason, provider, statusCode })` options-object | CONTEXT.md D-05 |
| `message` | caller-supplied | auto-derived from `reason`+`provider` via internal `messageFor()` | CONTEXT.md D-06 |
| `statusCode` | `private computeStatusCode(reason)` auto-derived | required from caller, no auto-derivation | CONTEXT.md D-09 |
| `cause` / `details` | (silent) | structurally absent — no field, no parameter | CONTEXT.md D-11 |

**Imports pattern:** None required from `node:` or other modules. `Error` is global. Pure-TypeScript file with no external deps.

**Reason union (CONTEXT.md D-07, lines 39–45 — quoted verbatim):**
```typescript
export type WebhookValidationReason =
  | 'signature_mismatch'
  | 'timestamp_too_old'
  | 'missing_header'
  | 'missing_secret'
```
**Do NOT pre-add** `malformed_payload`, `invalid_encoding`, `invalid_signature_format`, `replay_suspected`, `body_missing` — each lands in its own future phase (CONTEXT.md D-07, "deferred" section).

**Class skeleton** (CONTEXT.md D-05, D-06, D-09, D-10, D-11):
```typescript
// Lookup table: deterministic, no inputs beyond reason/provider.
// Locking message construction here closes the historical leak vector
// where developers inadvertently put secrets into a `message` string (D-06).
function messageFor(reason: WebhookValidationReason, provider: string): string {
  // Implementation is Claude's-discretion (CONTEXT.md "Claude's Discretion" §1).
  // Must be deterministic; must not include any input outside reason/provider.
  // Must contain the provider name (D-13 test requirement).
  // Example shape: `${provider} webhook ${reason.replace(/_/g, ' ')}`.
}

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

  // Whitelist serialization. Because no sensitive field exists on the
  // instance (D-11), this is a defense-in-depth re-statement of the
  // structural guarantee, not a leakage filter.
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

**Constructor signature is locked** (CONTEXT.md D-05 — "no `message` parameter, no `cause`, no `details`. … Locked."). Do NOT add a `cause` parameter. Do NOT add a `details` field.

**Field visibility** (CONTEXT.md D-10): `reason`, `provider`, `statusCode` are all `readonly` and `public`. `name` is `'WebhookValidationError'`.

**`toString()`** (CONTEXT.md D-11): "falls through to the default `Error.prototype.toString`" — do NOT override. Default produces `"WebhookValidationError: <safe message>"`.

---

### `src/errors.test.ts` (test)

**Analog:** `src/index.test.ts` (Vitest co-located idiom — full quote above under hmac.test.ts).

**Required test cases per CONTEXT.md D-13:**
1. Constructor stores `reason`, `provider`, `statusCode` on the instance.
2. Instance is `instanceof Error`.
3. `message` is non-empty and **contains the provider name**.
4. Each of the 4 reasons round-trips via `instance.reason` (one `it` per reason or a `it.each` loop).
5. `JSON.stringify(err)` does NOT contain a sample signature, secret, or body string.
6. `String(err)` does NOT contain a sample signature, secret, or body string.

**Skeleton:**
```typescript
import { describe, expect, it } from 'vitest';
import { WebhookValidationError, type WebhookValidationReason } from './errors.js';

const SAMPLE_SIGNATURE = 't=1700000000,v1=deadbeefcafe1234567890';
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

  it('is an instance of Error', () => {
    const err = new WebhookValidationError({
      reason: 'signature_mismatch', provider: 'stripe', statusCode: 401,
    });
    expect(err).toBeInstanceOf(Error);
  });

  it('auto-derives a non-empty message containing the provider', () => {
    const err = new WebhookValidationError({
      reason: 'signature_mismatch', provider: 'stripe', statusCode: 401,
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
    const err = new WebhookValidationError({ reason, provider: 'stripe', statusCode: 401 });
    expect(err.reason).toBe(reason);
  });

  it('does not leak sensitive material via JSON.stringify or String()', () => {
    // Instance has no field carrying these — this test locks the
    // structural guarantee against future regressions (CONTEXT.md D-11).
    const err = new WebhookValidationError({
      reason: 'signature_mismatch', provider: 'stripe', statusCode: 401,
    });
    const json = JSON.stringify(err);
    const str = String(err);
    for (const leak of [SAMPLE_SIGNATURE, SAMPLE_SECRET, SAMPLE_BODY]) {
      expect(json).not.toContain(leak);
      expect(str).not.toContain(leak);
    }
  });
});
```

**Test isolation note:** Sample sig/secret/body strings exist only as in-test constants — they are never passed to the constructor (the constructor has no field for them, by design). The assertion is positively stated: these strings could not appear because no path exists for them to enter the instance.

---

### `src/index.ts` (modified — barrel export)

**Analog:** `src/index.ts` itself, current Phase 1 state (`src/index.ts` lines 1–4).

**Current content** (must be preserved):
```typescript
// express-webhook-validator
// Phase 1 placeholder — Phase 2 will export createWebhookMiddleware, WebhookValidationError, etc.

export const VERSION = '0.0.1';
```

**Phase 2 transformation** — preserve `VERSION`, add 4 named exports:
```typescript
// express-webhook-validator
// Phase 2: crypto primitives + error class. Provider middleware lands in Phases 3–5.

export const VERSION = '0.0.1';

export { computeHmac } from './crypto/hmac.js';
export { timingSafeCompare } from './crypto/compare.js';
export { WebhookValidationError, type WebhookValidationReason } from './errors.js';
```

**Pattern notes:**
- `.js` extensions on every relative import (project ESM + `moduleResolution: "bundler"` rule, established in `src/index.test.ts:2`).
- Use `export { ... } from '...'` re-exports, not `export *` — the public surface should be enumerable from a single grep.
- `WebhookValidationReason` is a type-only re-export (`type` keyword inside the brace). Without it, Biome / `verbatimModuleSyntax`-style configs will warn.
- The Phase 1 comment on line 2 ("Phase 2 will export createWebhookMiddleware…") is **outdated** for Phase 2 — this phase ships crypto+error, not the factory. Rewrite the comment to reflect the actual Phase 2 surface.
- `src/index.test.ts` (the existing Phase 1 smoke test for `VERSION`) MUST continue to pass after this change. Do not delete or move it.

---

## Shared Patterns

These cross-cutting conventions apply to every Phase 2 file. They derive from Phase 1 decisions (CONTEXT.md "Canonical References" → "Phase 1 Decisions That Carry Forward") and Phase 1's actual on-disk files.

### Pattern: ESM `.js` extension on relative imports

**Source:** `src/index.test.ts:2` (`import { VERSION } from './index.js';`) and `tsconfig.json:7` (`"moduleResolution": "bundler"`).

**Apply to:** All Phase 2 files (`hmac.test.ts`, `compare.test.ts`, `errors.test.ts`, modified `index.ts`).

**Excerpt** (`src/index.test.ts:2`):
```typescript
import { VERSION } from './index.js';
```

The `.js` extension is required even though the source file is `.ts`. Omitting it breaks both the dev-time `vitest` run and the published `dist/` ESM artifact.

---

### Pattern: Vitest co-located test idiom

**Source:** `src/index.test.ts` (lines 1–9, full file).

**Apply to:** `src/crypto/hmac.test.ts`, `src/crypto/compare.test.ts`, `src/errors.test.ts`.

**Excerpt** (`src/index.test.ts`, full file):
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

Conventions to copy:
- Vitest imports alphabetized: `describe, expect, it`.
- One top-level `describe` per test file, named after the subject.
- One `it` per behavioral assertion (D-13 lists multiple — split into separate `it`s for readability, or use `it.each` for the 4-reason round-trip).
- No `beforeEach`/`afterEach` setup (Phase 2 tests are pure-function unit tests).
- No `vi.mock()` (Phase 2 has no I/O to mock).

---

### Pattern: `node:` prefix for built-in modules

**Source:** CONTEXT.md D-12 ("Whether to declare `crypto` as `import { createHmac, timingSafeEqual } from 'node:crypto'` or `from 'crypto'`. Prefer `node:` prefix per modern Node convention.").

**Apply to:** `src/crypto/hmac.ts`, `src/crypto/compare.ts`.

**Excerpt:**
```typescript
import { createHmac } from 'node:crypto';
import { timingSafeEqual } from 'node:crypto';
```
The `node:` prefix is unambiguous (cannot be shadowed by a same-named npm package) and aligns with current Node.js documentation.

---

### Pattern: Strict TypeScript — no implicit `any`, no positional unions

**Source:** `tsconfig.json:9` (`"strict": true`) + Phase 1 D-15.

**Apply to:** All Phase 2 source files.

Implications for Phase 2:
- `algorithm: 'sha256'` literal type (not widened to `string`) — CONTEXT.md D-02.
- `WebhookValidationReason` is a string-literal union (not `string`) — CONTEXT.md D-07.
- `computeHmac`'s `rawBody` parameter is explicitly `Buffer | string` (not implicit `any`).
- `WebhookValidationError`'s constructor takes a typed options object, never `any`.

---

### Pattern: tsup excludes `**/*.test.ts` automatically

**Source:** `tsup.config.ts:5` (`entry: ['src/**/*.ts', '!src/**/*.test.ts']`) + `tsconfig.json:17` (`"exclude": ["node_modules", "dist", "**/*.test.ts"]`).

**Apply to:** All new Phase 2 test files (`hmac.test.ts`, `compare.test.ts`, `errors.test.ts`).

**Excerpt** (`tsup.config.ts:1–10`):
```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/**/*.ts', '!src/**/*.test.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
});
```
Phase 2 inherits this — no config changes needed. Co-located tests in `src/crypto/` are excluded from `dist/` automatically. Verification step: run `npm run build` after Phase 2 lands and confirm `dist/crypto/` contains `hmac.js`, `hmac.cjs`, `hmac.d.ts`, `compare.js`, `compare.cjs`, `compare.d.ts` and **no** `*.test.*` files.

---

### Pattern: Vitest picks up `**/*.test.ts` automatically

**Source:** `vitest.config.ts:5` (`include: ['src/**/*.test.ts']`).

**Apply to:** All new Phase 2 test files.

**Excerpt** (`vitest.config.ts:1–8`):
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
```
Phase 2 needs no `vitest.config.ts` change. New tests in `src/crypto/` are discovered automatically. CONTEXT.md establishes this in §"Established Patterns" line 107: "only add a `vitest.config.ts` if a Phase 2 test needs a config knob; otherwise leave it implicit" — the file already exists with the minimal config, so leave it as-is.

---

### Pattern: Biome formatter — 2-space indent, single quotes, trailing commas (es5), 100-col line width

**Source:** `biome.json:18–28`.

**Apply to:** All Phase 2 source files.

**Excerpt** (`biome.json:18–28`):
```json
"formatter": {
  "enabled": true,
  "indentStyle": "space",
  "indentWidth": 2,
  "lineWidth": 100
},
"javascript": {
  "formatter": {
    "quoteStyle": "single",
    "trailingCommas": "es5"
  }
}
```
All Phase 2 files must `npm run lint` clean. The `biome check` step in CI will fail otherwise. Apply: 2-space indent, `'single quotes'`, trailing commas on multi-line arrays/objects but not on function-call arg lists, max 100 chars per line.

---

### Pattern: Import organization — Biome `organizeImports` is on

**Source:** `biome.json:29–37`.

**Apply to:** All Phase 2 files.

**Excerpt** (`biome.json:29–37`):
```json
"assist": {
  "enabled": true,
  "actions": {
    "source": {
      "organizeImports": "on"
    }
  }
}
```
Order convention (matches `src/index.test.ts`): external packages (alphabetized) → `node:` built-ins → relative imports. Biome will reorder on `npm run format` if you get it wrong.

---

## No Analog Found

None. Every Phase 2 file has a strong pattern source — either an existing Phase 1 file (`src/index.ts`, `src/index.test.ts`) or a CONTEXT.md-quoted research snippet (PITFALLS.md #2 for `compare.ts`, ARCHITECTURE.md §"Constant-Time Comparison" for `hmac.ts`, ARCHITECTURE.md §"Error Model" skeleton for `errors.ts`).

The only "research-snippet" matches (vs. first-party-code matches) are the three functional patterns. They are unavoidable: Phase 2 introduces the first crypto code in the repo, so no functional analog from `src/` can exist yet. Phase 3+ will be able to use Phase 2's files (`src/errors.ts`, `src/crypto/compare.ts`) as first-party analogs for their own work.

---

## Metadata

**Analog search scope:**
- `/home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru/src/` (2 files: `index.ts`, `index.test.ts`)
- `/home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru/.planning/research/ARCHITECTURE.md` (§"Recommended Project Structure", §"Error Model", §"Constant-Time Comparison for Crypto")
- `/home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru/.planning/research/PITFALLS.md` (Pitfalls #1, #2, #5)
- `/home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru/.planning/phases/01-foundation-tooling/01-CONTEXT.md` (D-04, D-06, D-15)
- Project config: `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `biome.json`

**Files scanned:** 10 (2 source, 5 config, 3 planning docs).

**Pattern extraction date:** 2026-05-06.

**Authoritative spec:** When ARCHITECTURE.md and CONTEXT.md disagree, **CONTEXT.md wins** (per CONTEXT.md D-08 and §"Canonical References" line 90: "DO NOT import the UPPER_SNAKE error reason naming or the positional constructor signature — both contradict ROADMAP.md and ROADMAP wins"). The mismatches are catalogued in the override table under `src/errors.ts` above so the planner can resolve them at planning time without re-reading both documents.
