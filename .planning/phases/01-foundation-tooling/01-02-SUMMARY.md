---
phase: 01-foundation-tooling
plan: "02"
subsystem: infra
tags: [tsup, vitest, typescript, esm, cjs, dts, build-pipeline, test-runner]

requires:
  - phase: 01-01
    provides: "package.json (scripts.build='tsup', scripts.test='vitest run', exports map pointing at dist/index.{js,cjs,d.ts}); tsconfig.json with **/*.test.ts in exclude (D-06 layer 1); src/index.ts barrel exporting VERSION"
provides:
  - "tsup.config.ts — dual cjs/esm build with dts, sourcemap, clean; explicit entry: ['src/index.ts'] is D-06 layer 2"
  - "vitest.config.ts — Vitest config with include: ['src/**/*.test.ts'] and environment: 'node' (D-04)"
  - "src/index.test.ts — placeholder smoke test asserting VERSION is a non-empty string (proves runner works end-to-end)"
  - "Dev dependencies installed and locked: typescript@^6, tsup, vitest, @types/node, @types/express; package-lock.json committed (T-02-01)"
  - "Working dual-format build emitting dist/index.js (ESM), dist/index.cjs (CJS), dist/index.d.ts + .d.cts (types)"
  - "tsconfig.json now sets ignoreDeprecations: '6.0' so TypeScript 6.x dts emit succeeds under tsup"
affects: [01-03-biome, 01-04-ci-matrix, phase-02-crypto, phase-03-error-types, phase-04-stripe, phase-05-github, phase-05-shopify, phase-06-integration-tests]

tech-stack:
  added: [tsup@8.5.1, vitest@4.1.5, typescript@6.0.3, "@types/node@25.6.0", "@types/express@5.0.6"]
  patterns:
    - "Dual ESM/CJS publish via tsup — D-03 / FOUND-01 / ROADMAP success criterion 1"
    - "Co-located unit tests at src/**/*.test.ts — D-04"
    - "Two-layer test exclusion from dist: tsconfig.exclude (layer 1, set in Plan 01) + tsup explicit entry (layer 2, set here) — D-06"
    - "Explicit Vitest imports (no globals) — improves IDE clarity and avoids ambient type pollution"
    - "TS6 deprecation handled via ignoreDeprecations: '6.0' (forward-compatible until TS7)"

key-files:
  created:
    - "tsup.config.ts — Build config: dual cjs+esm, dts, sourcemap, clean, explicit entry"
    - "vitest.config.ts — Test config: src/**/*.test.ts include, node environment"
    - "src/index.test.ts — Smoke test asserting VERSION export is a non-empty string"
    - "package-lock.json — Locked dependency tree (supply-chain integrity)"
  modified:
    - "package.json — devDependencies populated (typescript, tsup, vitest, @types/node, @types/express)"
    - "tsconfig.json — Added ignoreDeprecations: '6.0' so dts emit works under tsup with TypeScript 6.x"

key-decisions:
  - "Picked Vitest's no-globals form (explicit imports of describe/it/expect) for clearer IDE support; CONTEXT.md left this to Claude's discretion"
  - "Set ignoreDeprecations: '6.0' rather than removing baseUrl (which is set internally by tsup's dts worker, not by our tsconfig); future-proof until TS 7.0 actually removes the option"
  - "Imported './index.js' (not './index.ts') from the test file — required for ESM with moduleResolution: 'bundler' and TypeScript 6.x; Vitest resolves .js → .ts automatically"

patterns-established:
  - "Test file extension and location pattern: src/<module>.ts + src/<module>.test.ts as siblings; will repeat in Phases 2–5"
  - "Build-time test exclusion pattern: tsup explicit entry list, NOT a glob; one entry per public surface"
  - "TS 6.x compatibility shim: ignoreDeprecations: '6.0' until TS 7.0 forces a real fix"

requirements-completed:
  - FOUND-01

duration: ~3min
completed: 2026-05-05
---

# Phase 1 Plan 02: Build Pipeline & Test Runner Summary

**tsup dual ESM/CJS+dts build wired with explicit single entry, Vitest configured for co-located src/**/*.test.ts, smoke test green, and TypeScript 6.x dts emit unblocked.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-05T21:22:31Z
- **Completed:** 2026-05-05T21:25:04Z
- **Tasks:** 2
- **Files modified:** 4 created, 2 modified

## Accomplishments

- `tsup.config.ts` produces all three artifacts the project's exports map points at: `dist/index.js` (ESM), `dist/index.cjs` (CJS), `dist/index.d.ts` (+ `.d.cts`). ROADMAP success criterion 1 (FOUND-01) is now demonstrably met by `npm run build`.
- `vitest.config.ts` + `src/index.test.ts` give the repo a working test runner with one passing smoke test on `npm test` (exit 0). ROADMAP success criterion 5 met.
- The two-layer test-exclusion strategy (D-06) is now fully in place: tsconfig `exclude: ["**/*.test.ts"]` from Plan 01 plus tsup's explicit `entry: ['src/index.ts']` here. Verified: `find dist/ -name '*.test.*'` returns 0.
- `package-lock.json` is generated and committed alongside the devDependencies, satisfying the supply-chain integrity mitigation T-02-01 and pre-conditioning Plan 04 (CI) to use `npm ci`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dev dependencies and create tsup.config.ts** — `12794d7` (feat)
2. **Task 2: Create vitest.config.ts, smoke test, and unblock TS6 dts emit** — `10d3fcf` (feat)

_Plan metadata commit (this SUMMARY.md) is created next; orchestrator handles STATE.md / ROADMAP.md after the wave._

## Files Created/Modified

- `tsup.config.ts` — Dual cjs/esm build with dts, sourcemap, clean, explicit entry (D-06 layer 2)
- `vitest.config.ts` — Vitest with `include: ['src/**/*.test.ts']` and `environment: 'node'` (D-04)
- `src/index.test.ts` — Smoke test importing VERSION from `./index.js` and asserting non-empty string
- `package-lock.json` — npm-generated lockfile (T-02-01 mitigation)
- `package.json` — devDependencies populated; no other fields changed
- `tsconfig.json` — Added `"ignoreDeprecations": "6.0"` (deviation, see below)

## Decisions Made

- **Vitest no-globals form.** Used `import { describe, it, expect } from 'vitest'` rather than enabling `globals: true`. CONTEXT.md left smoke-test shape to Claude's discretion; explicit imports give better IDE go-to-definition and avoid global type pollution that later test files would inherit.
- **`./index.js` import in test.** Required by `moduleResolution: 'bundler'` + TS6 + ESM. Vitest's resolver handles the `.js` → `.ts` mapping automatically. Pattern will repeat in every co-located test file in Phases 2–5.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `ignoreDeprecations: "6.0"` to tsconfig.json**
- **Found during:** Task 2, Step 4 (`npm run build` verification)
- **Issue:** TypeScript 6.0.3's strict deprecation enforcement raises `error TS5101: Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7.0` during tsup's dts build worker. Our tsconfig.json does not set `baseUrl` — tsup's dts worker sets it internally before invoking `tsc` for declaration emit. Without the suppression, ESM and CJS builds succeed but dts fails, so `dist/index.d.ts` is not produced and ROADMAP success criterion 1 fails.
- **Fix:** Added `"ignoreDeprecations": "6.0"` to `tsconfig.json` `compilerOptions`. This is the migration-path option Microsoft documents specifically for this error (verified via Context7 `/microsoft/typescript`). The deprecation is forward-flagged for TS 7.0; the suppression is valid until then and tsup will likely ship a fix before TS 7 is released.
- **Files modified:** `tsconfig.json`
- **Verification:** `npm run build` now emits `dist/index.d.ts`, `dist/index.d.cts`, plus the existing `dist/index.js` and `dist/index.cjs`. `npm test` still exits 0.
- **Committed in:** `10d3fcf` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The fix was strictly necessary to satisfy the plan's own acceptance criterion (`dist/index.d.ts` exists after build) and ROADMAP success criterion 1 (all three build artifacts). No scope creep — the change is one config field, scoped to TypeScript 6→7 forward compatibility.

## Issues Encountered

- **TS5101 on first `npm run build`.** Resolved as the deviation above. Root cause is a tsup × TypeScript-6.x compatibility seam, not anything in our source. No alternative fix considered — the documented migration option is correct for TS 6.x and is forward-flagged for TS 7.

## TDD Gate Compliance

The plan marks Task 2 as `tdd="true"`, but the gate sequence is collapsed by design:

- The "implementation" the smoke test verifies (`VERSION` export from `src/index.ts`) was created in Plan 01 specifically to give Plan 02 a target for the smoke test.
- Per the TDD fail-fast guidance, a passing test on first run usually means "the feature already exists." In this case it exists *intentionally* — the smoke test's purpose is to prove the runner works end-to-end, not to test new logic.
- A real RED → GREEN → REFACTOR cycle starts in Phase 2 with `computeHmac` and `WebhookValidationError`, where the source does not yet exist. Phase 1 Plan 2 is correctly committed as a single `feat` because the change is the runner config, not new product code.

This deviation from a strict TDD-three-commit gate is intentional and aligns with CONTEXT.md's "smoke test contents — placeholder shape … the test exists to prove the runner works, not to test logic" guidance.

## Threat Register Compliance

| Threat ID | Disposition | Status | Evidence |
|---|---|---|---|
| T-02-01 (Tampering — supply chain lockfile drift) | mitigate | done | `package-lock.json` committed in `12794d7` (3667 insertions) |
| T-02-02 (Information Disclosure — tests leaking into dist) | mitigate | done | `find dist/ -name '*.test.*'` returns 0 after `npm run build`; tsup explicit entry list (not a glob) is layer 2 of the D-06 strategy |
| T-02-03 (DoS — broken build blocks subsequent phases) | mitigate | done | Task 2 ran `npm run build` and verified all three artifacts before commit; the TS5101 blocker was fixed before the task closed |
| T-02-04 (Tampering — CJS-only or ESM-only output) | mitigate | done | Both `dist/index.js` and `dist/index.cjs` exist after build; tsup config explicitly sets `format: ['cjs', 'esm']` |

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 01-03 (Biome)** can proceed immediately. The build and test runner are green; Biome is additive and won't break either.
- **Plan 01-04 (CI matrix)** is unblocked: `npm ci`, `npm run build`, and `npm test` all work locally with the committed `package-lock.json`.
- **Phase 2 (crypto)** can begin once Phase 1 closes: the co-located `*.test.ts` pattern is wired, dual-format publish is wired, and `src/index.ts` is ready to start exporting real symbols (`computeHmac`, `WebhookValidationError`).
- No blockers, no concerns.

## Self-Check: PASSED

All claimed artifacts and commits verified to exist:

- `tsup.config.ts` — FOUND
- `vitest.config.ts` — FOUND
- `src/index.test.ts` — FOUND
- `package-lock.json` — FOUND
- `package.json` (modified) — FOUND
- `tsconfig.json` (modified) — FOUND
- `dist/index.js` (ESM) — FOUND
- `dist/index.cjs` (CJS) — FOUND
- `dist/index.d.ts` (types) — FOUND
- Commit `12794d7` (Task 1) — FOUND
- Commit `10d3fcf` (Task 2) — FOUND

Verification commands re-run from a clean state would: `npm ci && npm run build && npm test` — all three exit 0 and produce the documented artifacts.

---
*Phase: 01-foundation-tooling*
*Completed: 2026-05-05*
