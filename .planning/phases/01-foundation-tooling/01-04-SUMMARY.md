---
phase: 01-foundation-tooling
plan: "04"
subsystem: infra
tags: [github-actions, ci, matrix, node, express, biome, tsup, vitest]

# Dependency graph
requires:
  - phase: 01-foundation-tooling
    provides: "package.json scripts (lint, build, test) and lockfile from Plans 01-02 and 01-03"
provides:
  - "GitHub Actions CI workflow with full 3x2 Node/Express matrix (6 cells)"
  - "Per-cell sequence: npm ci -> install express version -> biome check -> tsup build -> vitest run"
  - "fail-fast: false matrix policy for full diagnostic signal"
  - "Push and pull_request triggers on all branches"
affects: [phase-02-crypto-errors, phase-03-public-api, phase-04-stripe, phase-05-github-shopify, phase-06-tests, all-future-phases]

# Tech tracking
tech-stack:
  added: ["GitHub Actions", "actions/checkout@v4", "actions/setup-node@v4"]
  patterns:
    - "Single-job matrix pattern (D-07) — one job 'test' with strategy.matrix cross-product, NOT split jobs"
    - "Per-cell Express version override after lockfile-validated npm ci (D-07)"
    - "Lint-first step ordering (D-08): biome check -> tsup build -> vitest run"

key-files:
  created:
    - ".github/workflows/test.yml"
  modified: []

key-decisions:
  - "Single matrix job with 3x2 cross-product (D-07) — rejected the STACK.md split-jobs template"
  - "npm ci for lockfile enforcement, then npm install express@<matrix-version> to override Express per cell"
  - "fail-fast: false so all 6 cells produce signal even when one fails"
  - "Lint runs before build/test so style failures abort early without wasting compute"
  - "Triggers: push and pull_request on all branches (broad coverage for solo project)"

patterns-established:
  - "CI matrix pattern: cross-product matrix in a single job, with per-cell variant install layered on top of npm ci"
  - "Step ordering pattern: lint -> build -> test (cheapest-fail-first)"

requirements-completed: [FOUND-02, FOUND-03]

# Metrics
duration: ~1min
completed: 2026-05-05
---

# Phase 01 Plan 04: CI Summary

**GitHub Actions workflow with single 3x2 matrix job (Node 20/22/24 x Express 4.21.x/5.x = 6 cells) running biome check, tsup build, and vitest run per cell.**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-05-05T21:35:03Z
- **Completed:** 2026-05-05T21:36:08Z
- **Tasks executed:** 1 of 2 (Task 2 is a `checkpoint:human-verify` that requires post-merge git push and GitHub UI inspection — see "Outstanding Checkpoint" below)
- **Files created:** 1
- **Files modified:** 0

## Accomplishments

- Created `.github/workflows/test.yml` with a single `test` job and a 3x2 strategy matrix (`node-version: [20.x, 22.x, 24.x]` x `express-version: ["4.21.x", "5.x"]`).
- Wired the per-cell pipeline exactly per CONTEXT.md D-08: `npm ci` -> `npm install express@<version>` -> `npm run lint` (Biome) -> `npm run build` (tsup) -> `npm test` (Vitest).
- Applied D-07 explicitly — one job with a matrix, not the two-job pattern from STACK.md.
- Configured `fail-fast: false` so all 6 cells run regardless of individual failures (full diagnostic signal).
- Configured `cache: "npm"` on setup-node for faster `npm ci` across runs.
- Used `actions/checkout@v4` and `actions/setup-node@v4` (latest stable as of 2026).
- Triggers on `push` and `pull_request` for all branches.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create .github/workflows/test.yml with 3x2 matrix** - `cc7aeb8` (feat)
2. **Task 2: Verify CI turns green on default branch** - PENDING (checkpoint:human-verify; cannot resolve from parallel-executor agent — see "Outstanding Checkpoint")

**Plan metadata:** to be added by orchestrator's final commit.

## Files Created/Modified

- `.github/workflows/test.yml` (created) — GitHub Actions CI workflow with the full 3x2 Node/Express matrix.

## Decisions Made

- **D-07 (Single matrix job):** Implemented as one `jobs.test` entry with `strategy.matrix` producing the 3x2 cross-product. The STACK.md research template's two-job pattern (`test` + `test-express-versions`) was explicitly rejected per CONTEXT.md.
- **D-08 (Per-cell step order):** `npm run lint` -> `npm run build` -> `npm test`. Biome runs first so a lint failure short-circuits the cell before tsup/vitest spend compute.
- **Express install strategy:** `npm ci` installs all devDependencies (lockfile-verified). Then `npm install express@<matrix-version>` overrides the Express version (Express is a peerDependency, so the override is scoped and clean).
- **fail-fast: false:** Selected to maximize diagnostic signal — when one cell fails, the other 5 still report so a regression's blast radius is visible.
- **Trigger scope:** `push` and `pull_request` on `["**"]` branches (broad coverage suitable for a solo portfolio project).

## Deviations from Plan

None - plan executed exactly as written.

The workflow YAML matches the plan's specified content verbatim. All 11 acceptance criteria verified:

- `.github/workflows/test.yml` exists ✓
- `node-version` matrix includes `20.x`, `22.x`, `24.x` ✓
- `express-version` matrix includes `"4.21.x"` and `"5.x"` ✓
- Workflow contains `npm ci` step ✓
- Workflow contains `npm install express@${{ matrix.express-version }}` step after `npm ci` ✓
- Workflow contains `npm run lint` step ✓
- Workflow contains `npm run build` step ✓
- Workflow contains `npm test` step ✓
- Exactly ONE job named `test` (no `test-express-versions` split job) ✓
- `fail-fast: false` set on the matrix strategy ✓
- `actions/checkout@v4` and `actions/setup-node@v4` are used ✓

**Total deviations:** 0
**Impact on plan:** None — clean execution.

## Issues Encountered

None.

## Outstanding Checkpoint

**Task 2 (`checkpoint:human-verify`)** is a post-merge gate that cannot be resolved from this parallel-executor agent. After the orchestrator merges Plan 01-04's worktree branch (and the rest of Phase 1's parallel branches) and the user pushes to GitHub, the user must:

1. Open GitHub repo → Actions tab.
2. Find the "Test" workflow run triggered by the push.
3. Confirm the matrix shows all 6 cells:
   - Node 20.x / Express 4.21.x
   - Node 20.x / Express 5.x
   - Node 22.x / Express 4.21.x
   - Node 22.x / Express 5.x
   - Node 24.x / Express 4.21.x
   - Node 24.x / Express 5.x
4. Confirm all 6 cells report green.
5. Spot-check one cell to confirm the three steps ran in order: "Lint (Biome check)" → "Build (tsup)" → "Test (Vitest)".

**Expected resume signal:** "CI green" once verified. If any cell fails, the failing step's output and the failing Node/Express combination should be reported so a follow-up plan can address the regression.

This gate cannot be automated from inside the agent because:
- The branch is a worktree branch and has not been pushed to a remote yet.
- GitHub Actions UI inspection is a human-driven step (D-07/D-08 want the visual confirmation that all 6 cells are green, not a synthetic check).
- Phase 1 plans 01–03 outputs are on sibling worktree branches and have not yet been merged in.

The orchestrator should preserve this checkpoint and surface it to the user after Phase 1 merge.

## User Setup Required

None for this plan's deliverable. The post-merge checkpoint described above is the only manual step needed.

## Next Phase Readiness

- The `.github/workflows/test.yml` file is in place and will run on the first push after Phase 1 merge.
- Once CI green is confirmed (Task 2 checkpoint), ROADMAP success criteria 2 (CI enforcement of Biome) and 3 (green 3x2 matrix on default branch) are satisfied.
- Phase 2 (crypto + errors) and onward inherit the CI matrix automatically — every subsequent commit will be validated across the 6 cells with no additional workflow changes needed.

## Self-Check: PASSED

- File `.github/workflows/test.yml` — FOUND
- Commit `cc7aeb8` — FOUND in `git log`
- All 11 plan acceptance criteria — verified via `node -e` script (see Performance section)
- No accidental deletions in the commit
- No modifications to STATE.md or ROADMAP.md (parallel-executor mode honored)

---
*Phase: 01-foundation-tooling*
*Plan: 04*
*Completed: 2026-05-05*
