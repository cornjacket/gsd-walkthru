---
phase: 03-body-handling-public-api-surface
plan: "01"
subsystem: infra
tags: [tsconfig, supertest, devdeps, typecheck, typescript, testing]

# Dependency graph
requires:
  - phase: 02-crypto-primitives-error-types
    provides: "Phase 2 baseline test suite (20 tests across 4 files) that must remain green"
provides:
  - "tsconfig.test.json — TypeScript test config including **/*.test.ts in compilation graph"
  - "npm run typecheck — tsc --noEmit -p tsconfig.test.json script for CI"
  - "supertest@^7.2.2 and @types/supertest@^7.2.0 devDependencies available to all Phase 3 plans"
affects:
  - 03-02
  - 03-03
  - 03-04
  - 03-05
  - 03-06
  - 03-07

# Tech tracking
tech-stack:
  added:
    - supertest@^7.2.2
    - "@types/supertest@^7.2.0"
  patterns:
    - "tsconfig.test.json extends base tsconfig and removes **/*.test.ts exclusion so tsc sees test files"
    - "npm run typecheck invokes tsc --noEmit -p tsconfig.test.json (not tsconfig.json)"

key-files:
  created:
    - tsconfig.test.json
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "typecheck script targets tsconfig.test.json (not tsconfig.json) — ensures @ts-expect-error directives in test files are actually enforced (D-20 / RESEARCH Pitfall 1)"
  - "supertest installed at latest stable (7.2.2 / types 7.2.0) with caret-major ranges matching repo convention"
  - "supertest placed in devDependencies only — not in dependencies or peerDependencies (per plan T-3-INFRA-02 mitigation)"

patterns-established:
  - "Test-visible typecheck: run `npm run typecheck` to compile-check test files including @ts-expect-error guards"
  - "Integration test prerequisite: import supertest from 'supertest' is now resolvable in all Phase 3 test files"

requirements-completed: [API-03]

# Metrics
duration: 4min
completed: "2026-05-07"
---

# Phase 03 Plan 01: Test Infrastructure — tsconfig.test.json + supertest

**TypeScript test config (tsconfig.test.json) and supertest devDependency installed to enable Phase 3 compile-time discriminated-union checks and integration-shape tests**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-07T04:22:21Z
- **Completed:** 2026-05-07T04:26:21Z
- **Tasks:** 2
- **Files modified:** 3 (tsconfig.test.json created, package.json modified, package-lock.json updated)

## Accomplishments

- Created `tsconfig.test.json` extending `./tsconfig.json` with `exclude: ["node_modules", "dist"]` — removes the `**/*.test.ts` exclusion so `tsc` includes test files in its compilation graph (fixes D-20 / RESEARCH.md Pitfall 1)
- Added `npm run typecheck` script (`tsc --noEmit -p tsconfig.test.json`) to `package.json` — 4 `.test.ts` files confirmed in the compilation graph
- Installed `supertest@^7.2.2` and `@types/supertest@^7.2.0` as devDependencies; all 20 Phase 2 baseline tests continue to pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Create tsconfig.test.json and add typecheck script** - `a24c5a0` (chore)
2. **Task 2: Install supertest and @types/supertest as devDependencies** - `c0b38c8` (chore)

**Plan metadata:** committed with SUMMARY.md (docs: complete plan)

## Files Created/Modified

- `tsconfig.test.json` — New TypeScript config for test compilation; extends `./tsconfig.json`, `include: ["src"]`, `exclude: ["node_modules", "dist"]` (no `**/*.test.ts` exclusion)
- `package.json` — Added `"typecheck": "tsc --noEmit -p tsconfig.test.json"` script; added `supertest@^7.2.2` and `@types/supertest@^7.2.0` to devDependencies
- `package-lock.json` — Updated by `npm install --save-dev supertest @types/supertest`

## Decisions Made

- Appended `typecheck` after existing scripts (build, test, lint, format) rather than re-alphabetizing — existing keys were not alphabetized so the plan directive was to append only, minimizing diff noise
- Supertest installed at npm's latest stable resolution (7.2.2 / 7.2.0) without manual version pinning — consistent with repo caret-major convention

## Deviations from Plan

None - plan executed exactly as written.

The plan mentioned "21 tests across 4 files" as the Phase 2 baseline but the actual baseline is 20 tests (4 files). This is a pre-existing documentation discrepancy in the plan — the baseline was 20 tests before this plan ran, and 20 tests continue to pass after. No action required.

## Issues Encountered

Initial file writes targeted the main repo directory (`gsd-walkthru/`) instead of the worktree working directory (`gsd-walkthru/.claude/worktrees/agent-a9a32c4e5d56a3732/`). Detected via `git status` showing no changes in the worktree. Resolved by:
1. Writing correct files to the worktree path
2. Reverting accidental `package.json` edit in the main repo via `git checkout -- package.json`
3. Removing the accidentally created `tsconfig.test.json` from the main repo

No commits were made to the main repo; all commits landed correctly on `worktree-agent-a9a32c4e5d56a3732`.

## Output-Specified Metrics (per plan `<output>` section)

- **supertest version pinned:** `^7.2.2`
- **@types/supertest version pinned:** `^7.2.0`
- **Test files in tsconfig.test.json compilation graph:** 4 (confirmed via `npx tsc --noEmit -p tsconfig.test.json --listFiles | grep -c '\.test\.ts$'`) — includes all Phase 2 baseline test files
- **Scripts ordering deviation:** `typecheck` appended after `format` (not alphabetized with existing keys); existing scripts were not in alphabetical order so plan directed append-only

## Self-Check

- [x] `tsconfig.test.json` exists in worktree — FOUND
- [x] `package.json` modified with typecheck script and supertest — FOUND
- [x] Commit `a24c5a0` exists — FOUND
- [x] Commit `c0b38c8` exists — FOUND
- [x] `npm run typecheck` exits 0 — PASS
- [x] `npm test` 20/20 tests pass — PASS

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `tsconfig.test.json` ready for Plan 05 (`src/types.test.ts` with `@ts-expect-error` discriminated-union compile-time checks)
- `supertest` available for Plans 03, 04, 06 integration-shape tests
- `npm run typecheck`, `npm test`, and `npm run lint` all exit 0

---
*Phase: 03-body-handling-public-api-surface*
*Completed: 2026-05-07*
