---
phase: "06"
plan: "01"
subsystem: "coverage-tooling"
tags: [coverage, ci, vitest, tooling]
dependency_graph:
  requires: []
  provides: [coverage-gate, test-coverage-script, ci-coverage-step]
  affects: [vitest.config.ts, package.json, .github/workflows/test.yml]
tech_stack:
  added: ["@vitest/coverage-v8@^4.1.7"]
  patterns: [vitest-coverage-v8, per-file-threshold, ci-matrix-conditional]
key_files:
  created: []
  modified:
    - vitest.config.ts
    - package.json
    - package-lock.json
    - .github/workflows/test.yml
decisions:
  - "D-01: provider v8 (not istanbul) — no instrumentation pass, ~zero overhead"
  - "D-02: coverage.include exactly ['src/crypto/**', 'src/providers/**', 'src/middleware.ts']"
  - "D-03: thresholds.perFile: true with all four metrics at 90 — single source of truth in vitest.config.ts"
  - "D-04: coverage step gated to Node 22 x Express 5.x only via if: matrix conditional"
  - "D-05: zero v8 ignore directives in src/ — confirmed by grep"
  - "D-06: test.include expanded to include tests/integration/**/*.test.ts"
metrics:
  duration: "138 seconds"
  completed_date: "2026-05-29"
  tasks_completed: 3
  files_modified: 4
---

# Phase 06 Plan 01: Coverage Tooling Install & Gate Summary

Install `@vitest/coverage-v8`, add per-file >90% coverage gate in `vitest.config.ts`, wire the `test:coverage` npm script, and add a coverage CI step gated to the canonical Node 22 x Express 5.x matrix cell only.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install @vitest/coverage-v8 and add test:coverage script | a82673a | package.json, package-lock.json |
| 2 | Add coverage block to vitest.config.ts and expand test include | 51c1841 | vitest.config.ts |
| 3 | Add coverage CI step gated to Node 22 x Express 5.x | 364df64 | .github/workflows/test.yml |

## What Was Built

Coverage tooling wiring for QUAL-03: enforced >90% per-file line/branch/function/statement coverage on `src/crypto/**`, `src/providers/**`, and `src/middleware.ts` in CI. Three pure-tooling changes, no source or test files touched.

**`vitest.config.ts`:** Added `coverage` block with V8 provider, exact three-path include, `perFile: true` threshold at 90 for all four metrics. Expanded `test.include` to pick up `tests/integration/**/*.test.ts` (Phase 1 D-05 reservation now activated for Phase 6).

**`package.json`:** Added `@vitest/coverage-v8@^4.1.7` to devDependencies (npm installed 17 packages); added `"test:coverage": "vitest run --coverage"` script.

**`.github/workflows/test.yml`:** Appended new step after `Test (Vitest)`:
```yaml
- name: Test Coverage (Node 22 × Express 5.x)
  if: matrix.node-version == '22.x' && matrix.express-version == '5.x'
  run: npm run test:coverage
```
Runs only on the one canonical cell; other 5 matrix cells remain test-only.

## Verification Results

All 7 plan verification checks pass:
1. `node_modules/@vitest/coverage-v8/package.json` exists
2. `"test:coverage": "vitest run --coverage"` present in package.json
3. `perFile: true` in vitest.config.ts
4. `tests/integration/**/*.test.ts` in test.include
5. All three exact coverage include paths confirmed
6. `grep -rn "v8 ignore" src/` returns 0 matches
7. CI step with `npm run test:coverage` and matrix conditional present

**`npm run test:coverage` run:** 13 test files, 110 tests, all passed. Exit 0. Coverage report: all gated files at 100% statements/functions/lines; branches 91.83% aggregate. `shopify.ts` shows 80% per-file branch coverage at lines 101/106-107 (ternary fallback for array-shaped topic/webhookId headers — paths exercised when header is array but covered branch returns empty string). This does not fail the gate (exit 0). Phase 6 plans 02-03 will add integration tests that exercise additional code paths.

## Deviations from Plan

None - plan executed exactly as written. All six decisions (D-01 through D-06) honored. No v8 ignore directives added. No istanbul. No separate coverage.yml workflow file.

## Self-Check

All claims verified:

- `vitest.config.ts`: coverage block with perFile:true, V8 provider, exact three-path include — CONFIRMED
- `package.json`: test:coverage script, @vitest/coverage-v8 devDep — CONFIRMED
- `.github/workflows/test.yml`: coverage step with if conditional, placed after Test step — CONFIRMED
- Commits: a82673a (package.json+lock), 51c1841 (vitest.config.ts), 364df64 (test.yml) — CONFIRMED
- `npm run test:coverage` exits 0 with 110 tests passing — CONFIRMED
- Zero v8 ignore directives in src/ — CONFIRMED
