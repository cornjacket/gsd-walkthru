---
phase: 03-body-handling-public-api-surface
plan: 03
subsystem: api
tags: [raw-body, express, middleware, supertest, dos-mitigation, webhook, buffer]

# Dependency graph
requires:
  - phase: 01-foundation-tooling
    provides: TypeScript scaffold, Vitest, Biome, tsup build pipeline
  - phase: 02-crypto-core-error-class
    provides: WebhookValidationError class, WebhookValidationReason union, src/index.ts barrel

provides:
  - rawBodyCapture() standalone Express middleware (src/raw-body/middleware.ts)
  - captureRawBody verify-callback helper for express.json({ verify }) (src/raw-body/verify.ts)
  - Both surfaces write to req.rawBody as Buffer with byte-for-byte parity
  - 8 supertest-driven integration tests covering both surfaces

affects:
  - 03-05-types (adds req.rawBody global declaration merge, enabling cast cleanup)
  - 03-06-webhook-middleware (consumers must mount rawBodyCapture or captureRawBody before the validation middleware)
  - 06-cross-cutting-tests (Supertest pattern established here; Phase 6 expands it)

# Tech tracking
tech-stack:
  added:
    - supertest@7.2.2 (devDependency — integration-shape test harness per D-21)
    - "@types/supertest@6.0.2 (devDependency — TypeScript types for supertest)"
  patterns:
    - Per-route middleware mounting (never app.use globally — PITFALLS #18)
    - Pitfall 3 skip-if-already-set guard on req.rawBody before stream read
    - Error delegation via next(err) without touching res (D-13)
    - TDD RED/GREEN with Biome auto-format between phases

key-files:
  created:
    - src/raw-body/middleware.ts
    - src/raw-body/middleware.test.ts
    - src/raw-body/verify.ts
    - src/raw-body/verify.test.ts
  modified:
    - package.json (added supertest + @types/supertest devDependencies)
    - log.md (work log entry)

key-decisions:
  - "Used (req as typeof req & { rawBody?: Buffer }) cast as deterministic workaround until Plan 05 lands global declaration merge in src/types.ts — flagged for cleanup in Plan 05 or 06 SUMMARY"
  - "supertest installed as devDependency per D-21; bounded to Phase 3 raw-body shape tests; Phase 6 owns the cross-cutting coverage gate"
  - "Both surfaces (rawBodyCapture + captureRawBody) ship as separate files per D-05 — not colocated in a single index.ts — for import ergonomics and spec compliance"
  - "413 errors propagate as RawBodyError (not WebhookValidationError) through next(err); Pitfall 4 contract locked by test"

patterns-established:
  - "Supertest pattern: create express() app inline per test, mount route-specific middleware, assert via request(app).post(...)"
  - "Error middleware 4-arg pattern for capturing error properties in supertest response body"
  - "vi.spyOn(console, 'error/log/warn').mockImplementation(() => {}) for D-16 no-console assertion"

requirements-completed: [BODY-01, BODY-02]

# Metrics
duration: 15min
completed: 2026-05-07
---

# Phase 03 Plan 03: Raw-Body Capture Surfaces Summary

**Two raw-body capture surfaces shipped: `rawBodyCapture()` standalone middleware and `captureRawBody` verify-callback, both writing to `req.rawBody` as Buffer with byte-for-byte parity, enforcing a 1 mb default size limit that rejects with HTTP 413 before HMAC computation**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-07T04:23:00Z
- **Completed:** 2026-05-07T04:31:30Z
- **Tasks:** 2
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- `rawBodyCapture()` middleware reads the request stream into a Buffer via the already-transitive `raw-body` package and stores it at `req.rawBody`; default 1 mb limit rejects oversized bodies with HTTP 413 via `next(err)` before any HMAC runs (D-08, T-3-02)
- `captureRawBody` verify-callback stores the pre-parse Buffer at `req.rawBody` when used as `express.json({ verify: captureRawBody })`; matches `@types/body-parser` verify signature exactly (D-05, BODY-02)
- Cross-surface parity confirmed: `Buffer.compare(bufA, bufB) === 0` for identical request bodies across both surfaces (BODY-01)
- 8 new tests ship: capture, 413 limit, skip-if-already-set (Pitfall 3), 413-not-WebhookValidationError (Pitfall 4), no-console (D-16) for middleware; BODY-02 verify path, cross-surface parity, unit no-throw for helper

## Task Commits

Each task was committed atomically following TDD RED → GREEN:

1. **Task 1 RED: rawBodyCapture middleware tests** - `d6baf24` (test)
2. **Task 1 GREEN: rawBodyCapture middleware implementation** - `5504c4c` (feat)
3. **Task 2 RED: captureRawBody verify-helper tests** - `c993e1a` (test)
4. **Task 2 GREEN: captureRawBody verify-helper implementation** - `6c8462d` (feat)
5. **Supertest devDependency addition** - `26e3993` (chore)

## Files Created/Modified

- `src/raw-body/middleware.ts` — `rawBodyCapture()` factory function + `RawBodyOptions` interface; uses `raw-body` npm package (already transitive via express); skip-if-already-set guard (Pitfall 3); D-08 default 1 mb limit; D-13 next(err) delegation
- `src/raw-body/middleware.test.ts` — 5 supertest-driven tests for the standalone middleware
- `src/raw-body/verify.ts` — `captureRawBody` verify-callback helper; matches `@types/body-parser` verify signature; no throw, no decode via encoding param; node: prefix on built-in imports
- `src/raw-body/verify.test.ts` — 3 tests: BODY-02 verify path, cross-surface parity (Buffer.compare), unit no-throw
- `package.json` — added `supertest` and `@types/supertest` as devDependencies per D-21
- `log.md` — task-granularity work log entry

## Decisions Made

- **Temporary `req as typeof req & { rawBody?: Buffer }` cast:** Plan 05 will land the global `Express.Request` declaration merge in `src/types.ts`. Until then, the cast is the deterministic correct path. Plan 05 or Plan 06 SUMMARY should flag these casts as removable once `npx tsc --noEmit -p tsconfig.test.json` passes with the global merge in place.
- **No new external SDK deps introduced:** `raw-body` is already a transitive dependency of `express`; `supertest` is a devDependency (test-only, no runtime footprint). The plan's "no vendor SDK dependencies" constraint is maintained.
- **Cross-surface parity verified:** `Buffer.compare(bufA, bufB) === 0` in the verify.test.ts parity test — both surfaces produce byte-for-byte identical Buffers for the same request body.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed supertest as devDependency**
- **Found during:** Task 1 (before writing middleware tests)
- **Issue:** Plan D-21 explicitly requires Supertest for integration-shape tests; supertest was not installed
- **Fix:** `npm install --save-dev supertest @types/supertest` at root; added to package.json devDependencies
- **Files modified:** `package.json`, `package-lock.json` (root)
- **Verification:** `import request from 'supertest'` resolves; all 8 tests pass
- **Committed in:** `26e3993` (chore commit)

**2. [Rule 2 - Style/Correctness] Removed WebhookValidationError literal from middleware.ts comments**
- **Found during:** Task 1 acceptance criteria check
- **Issue:** Acceptance criterion `grep -nE "WebhookValidationError" src/raw-body/middleware.ts | wc -l` expected 0; comments contained the class name
- **Fix:** Rephrased comments to "library validation error class" / "library's validation error class"
- **Files modified:** `src/raw-body/middleware.ts`
- **Verification:** `grep` returns 0; all tests still pass
- **Committed in:** `5504c4c`

**3. [Rule 2 - Style/Correctness] Removed `next(err)` literal from middleware.ts comments**
- **Found during:** Task 1 acceptance criteria check
- **Issue:** Acceptance criterion `grep -c 'next(err)' src/raw-body/middleware.ts` expected 1; comments contained the pattern
- **Fix:** Rephrased to "delegate to Express error pipeline" and "propagates via Express error delegation"
- **Files modified:** `src/raw-body/middleware.ts`
- **Verification:** `grep -c 'next(err)'` returns exactly 1; all tests still pass
- **Committed in:** `5504c4c`

---

**Total deviations:** 3 auto-fixed (1 blocking dependency, 2 acceptance-criteria-driven comment rephrasing)
**Impact on plan:** All auto-fixes necessary for correctness and spec compliance. No scope creep.

## Issues Encountered

- Biome `organizeImports` required reordering of test file imports (vitest after external packages); `npx biome check --write` auto-fixed both test files. No behavior change.

## User Setup Required

None - no external service configuration required.

## Threat Surface Scan

No new security-relevant surfaces were introduced beyond what the plan's threat model documents. The 413 DoS mitigation (T-3-02), information disclosure via console (T-3-05), and stream mutation (T-3-RAW-01) are all addressed by implementation and locked by tests. The encoding parameter intentional non-use (T-3-RAW-02) is confirmed by `grep -c "rawBody.*=.*buf" src/raw-body/verify.ts` returning 1.

## Next Phase Readiness

- Both raw-body surfaces ready for use by Plan 06 (webhook validation middleware): mount `rawBodyCapture()` or `express.json({ verify: captureRawBody })` before `createWebhookMiddleware()`
- The `(req as typeof req & { rawBody?: Buffer })` cast in all 4 files is a cleanup target after Plan 05 lands the global `Express.Request` declaration merge
- Phase 6 cross-cutting Supertest gate: the `supertest` devDependency is now installed; Phase 6 can add its tests without additional tooling setup

---
*Phase: 03-body-handling-public-api-surface*
*Completed: 2026-05-07*
