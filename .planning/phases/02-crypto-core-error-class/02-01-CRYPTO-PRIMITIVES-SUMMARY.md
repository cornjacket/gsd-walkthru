---
phase: 02-crypto-core-error-class
plan: 01
subsystem: crypto
tags: [hmac, sha256, timing-safe-compare, node-crypto, vitest]

requires:
  - phase: 01-foundation-tooling
    provides: tsup ESM/CJS dual-format build, Vitest co-located test idiom, biome lint + tsc strict, package.json zero-runtime-deps baseline
provides:
  - computeHmac(rawBody, secret, 'sha256') returning raw Buffer digest
  - timingSafeCompare(a, b) constant-time Buffer comparison with length-guard (no try/catch)
  - Phase 1 src/index.ts public surface unchanged (Plan 03 owns barrel re-exports)
affects: [02-public-barrel, stripe, github, shopify, providers]

tech-stack:
  added: []
  patterns:
    - "src/crypto/ subdir for encoding-neutral primitives"
    - "PITFALLS #2 length-guard pattern (top-level if, not try/catch around timingSafeEqual)"
    - "co-located *.test.ts files alongside source under src/"

key-files:
  created:
    - src/crypto/hmac.ts
    - src/crypto/hmac.test.ts
    - src/crypto/compare.ts
    - src/crypto/compare.test.ts
  modified:
    - tsconfig.json

key-decisions:
  - computeHmac returns raw Buffer (no encoding baked in) — providers convert at their own boundary
  - algorithm parameter typed as literal 'sha256' (not 'string', not union) — D-02 guard against silent algorithm widening
  - timingSafeCompare is Buffer-only (no string overload) — D-03 callers convert hex/base64 at their boundary
  - Length mismatch returns false via top-level guard, NOT try/catch around timingSafeEqual — PITFALLS #2 prevents timing leak via thrown exception

patterns-established:
  - "encoding-neutral primitive: return raw Buffer, let provider modules convert"
  - "literal-type algorithm parameter prevents accidental SHA-1 / SHA-512 use without deliberate widening"

requirements-completed: [CRYP-01, CRYP-02]

duration: ~4min
completed: 2026-05-06
---

# Phase 02 Plan 01: Crypto Primitives Summary

**Node-crypto-backed `computeHmac` returning raw Buffer digest plus length-guarded `timingSafeCompare` — the two security primitives every later provider phase depends on, with co-located Vitest unit tests.**

## Performance

- **Duration:** ~4 min
- **Completed:** 2026-05-06
- **Tasks:** 2
- **Files created:** 4 (`src/crypto/hmac.ts`, `src/crypto/hmac.test.ts`, `src/crypto/compare.ts`, `src/crypto/compare.test.ts`)
- **Files modified:** 1 (`tsconfig.json` — auto-fix to add `types:["node"]`)

## Accomplishments
- `computeHmac(rawBody, secret, 'sha256')` returns raw `Buffer` — no encoding baked in, no try/catch, literal-type algorithm parameter
- `timingSafeCompare(a: Buffer, b: Buffer): boolean` with PITFALLS #2 length-guard pattern — no try/catch anywhere
- 5 new Vitest `it` blocks (2 in `hmac.test.ts`, 3 in `compare.test.ts`); full test suite green (Phase 1 `index.test.ts` still passes)
- Biome lint clean, `tsc --noEmit` strict-mode clean, `tsup` build produces `dist/crypto/{hmac,compare}.{js,cjs,d.ts}` with no `*.test.*` artifacts in dist
- Zero runtime dependencies added (CRYP-01 + D-14 honored)

## Task Commits

1. **Task 1: Implement computeHmac + co-located unit test** — `d512eea` (feat)
2. **Task 2: Implement timingSafeCompare + co-located unit test** — `291c448` (feat)
3. **Auto-fix: tsconfig types:node** — `95b1778` (fix, deviation rule 3)

## Files Created/Modified
- `src/crypto/hmac.ts` — `computeHmac(rawBody: Buffer | string, secret: string, algorithm: 'sha256') => Buffer`
- `src/crypto/hmac.test.ts` — 2 `it` blocks: known-vector hex digest + `Buffer.isBuffer` assertion
- `src/crypto/compare.ts` — `timingSafeCompare(a: Buffer, b: Buffer) => boolean`, top-level length guard, no try/catch
- `src/crypto/compare.test.ts` — 3 `it` blocks: equal-length match, equal-length mismatch, length-mismatch no-throw
- `tsconfig.json` — added `"types": ["node"]` so `Buffer` and `node:crypto` types resolve under strict mode

## Decisions Made
- Followed plan as written: `secret: string` (not widened to `string | Buffer`), Buffer-only `timingSafeCompare`, literal `'sha256'`, no `try/catch` in either file.
- Used hand-computed test vector path (body='hello', secret='shh') rather than RFC 4231 vector — `secret` stays `string`-typed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan-supplied test vector was incorrect**
- **Found during:** Task 1 (computeHmac unit test)
- **Issue:** Plan listed `expectedHex = '34973f4c8b3a17a73fb95c1d8caa9aceea4f57d27b62e2c2061efb22a89f04ec'` for `(body='hello', secret='shh', algorithm='sha256')`. That value did not match Node's `crypto.createHmac('sha256','shh').update('hello').digest('hex')` output.
- **Fix:** Computed the actual digest via `node -e "console.log(require('crypto').createHmac('sha256','shh').update('hello').digest('hex'))"` → `0e396369ee043c5b6b922743631745b2249cf7cb2c4722e61e802447d5d14c70`. Used the verified value in the test.
- **Files modified:** `src/crypto/hmac.test.ts`
- **Verification:** Re-confirmed by orchestrator post-completion: `node -e "..."` returns the same `0e396369...` hex. Test passes.
- **Committed in:** `d512eea` (Task 1 commit)

**2. [Rule 3 - Blocking] tsconfig.json missing `types:["node"]`**
- **Found during:** Task 1 verification (`tsc --noEmit` and `tsup` DTS build)
- **Issue:** `@types/node` was installed in Phase 1 devDeps, but `tsconfig.json` had `"lib": ["ES2020"]` with no `types` array, so `Buffer` and `node:crypto` types failed to resolve under strict mode. DTS build failed.
- **Fix:** Added `"types": ["node"]` to `compilerOptions`.
- **Files modified:** `tsconfig.json`
- **Verification:** `tsc --noEmit` exits 0; `npm run build` produces `dist/crypto/{hmac,compare}.d.ts`; full test suite passes.
- **Committed in:** `95b1778` (separate auto-fix commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug fix, 1 Rule 3 blocking fix)
**Impact on plan:** Both fixes were necessary for correctness. The vector correction is a plan defect (wrong reference value), not scope creep. The tsconfig change is a Phase 1 follow-up that this plan happened to expose first; it is a one-line auto-fix scoped to making the new files compile under strict mode. No widening of public surface, no new dependencies.

## Issues Encountered
- None beyond the two auto-fixed deviations above.

## Self-Check: PASSED
- `npx vitest run` passes (5 new `it` blocks + Phase 1 baseline).
- `npx biome check src/crypto/` clean.
- `npx tsc --noEmit` clean.
- `npm run build` produces dist artifacts with no `*.test.*` files.
- `package.json` `dependencies` empty.

## Threats Mitigated
- T-02-01 (timing leak via byte-content branch) — mitigated by `crypto.timingSafeEqual` for equal-length path
- T-02-02 (length leak via thrown exception) — mitigated by top-level length guard, no try/catch
- T-02-03 (secret leakage via error message) — mitigated by zero log/error construction in either file
- T-02-04 (silent algorithm widening) — mitigated by literal `'sha256'` type
- T-02-05 (silent crypto dependency injection) — mitigated by `node:crypto`-only imports, no `package.json` runtime-deps changes
- T-02-06 (DoS via malformed input) — accepted (structural; only future provider modules call this with `Buffer` arguments derived from controlled conversions)

## Next Phase Readiness
- Plan 02 (`WebhookValidationError` class) ran in parallel and is complete.
- Plan 03 (public barrel) can now import `computeHmac` from `./crypto/hmac.js` and `timingSafeCompare` from `./crypto/compare.js`.

---
*Phase: 02-crypto-core-error-class*
*Completed: 2026-05-06*
