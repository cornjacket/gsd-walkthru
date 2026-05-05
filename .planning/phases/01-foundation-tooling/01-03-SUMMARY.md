---
phase: 01-foundation-tooling
plan: "03"
subsystem: infra
tags: [biome, lint, format, tooling, devex]

# Dependency graph
requires:
  - phase: 01-foundation-tooling
    provides: src/index.ts placeholder, src/index.test.ts smoke test, tsup.config.ts, vitest.config.ts, package.json scripts (lint, format)
provides:
  - biome.json configured for Biome 2.4.14 (recommended linter, 2-space/lineWidth-100 formatter, single quotes, es5 trailing commas, organize imports)
  - "@biomejs/biome ^2.4.14 in devDependencies (alongside tsup, vitest, typescript, @types/express, @types/node from 01-02)"
  - npm run lint exits 0 on the clean scaffold
  - npm run lint exits non-zero on a deliberately malformed file (verified inline)
  - No ESLint or Prettier configuration files present
affects: [01-04 ci, 02-crypto, 03-public-api, 04-stripe, 05-github, 06-shopify, 07-tests, 08-docs]

# Tech tracking
tech-stack:
  added: ["@biomejs/biome ^2.4.14"]
  patterns:
    - "Single tool for lint + format (D-01: Biome over ESLint+Prettier)"
    - "biome.json at repo root; .planning/ and .claude/ ignored"
    - "Biome 2.x schema (assist.actions.source.organizeImports, files.includes negation)"

key-files:
  created:
    - biome.json
  modified:
    - package.json (added @biomejs/biome devDependency)
    - package-lock.json (160 transitive packages from biome install)
    - src/index.test.ts (Biome safe auto-fixes — semicolons + alphabetized imports)
    - tsup.config.ts (Biome safe auto-fixes — semicolons)
    - vitest.config.ts (Biome safe auto-fixes — semicolons)

key-decisions:
  - "Adopted Biome 2.x schema (assist.actions.source.organizeImports) instead of plan's 1.x-style organizeImports/files.ignore — required by installed Biome 2.4.14"
  - "Added .claude to ignore list — local Claude Code settings, not source"
  - "Applied Biome safe auto-fixes (biome check --write) to scaffold so lint exits 0; fixes were cosmetic only (semicolons, import ordering)"
  - "Task 2 verification was inline-only (malformed file created and removed within the task) — no commit needed for Task 2 since no files persisted; verification observation captured in this SUMMARY"

patterns-established:
  - "Biome ignore set: node_modules, dist, coverage, .planning, .claude (everything else included via ** + negations)"
  - "Code style: 2-space indent, lineWidth 100, single quotes, es5 trailing commas, semicolons (Biome default)"
  - "Import sorting on via assist.actions.source.organizeImports = 'on'"

requirements-completed: [FOUND-03]

# Metrics
duration: ~2min
completed: 2026-05-05
---

# Phase 01 Plan 03: Biome Lint + Format Summary

**Biome 2.4.14 wired as the single lint+format tool — `npm run lint` exits 0 on the clean scaffold and exits non-zero on a deliberately malformed file (FOUND-03 / ROADMAP success criterion 2 partial; CI enforcement deferred to 01-04).**

## Performance

- **Duration:** ~2 min (recorded between Task 1 file installation and SUMMARY write)
- **Started:** 2026-05-05T21:30:19Z
- **Completed:** 2026-05-05T21:31:44Z
- **Tasks:** 2 executed (1 committed; Task 2 was an inline verification, no file deltas)
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments

- Installed `@biomejs/biome` ^2.4.14 as a devDependency without disturbing tsup/vitest/typescript/@types/* from plan 01-02
- Created `biome.json` honouring D-01 (Biome over ESLint+Prettier) with recommended linter rules and project-style formatter (2-space indent, lineWidth 100, single quotes, es5 trailing commas)
- Confirmed `npm run lint` exits 0 on the clean scaffold (Phase 1 success criterion 2 — clean side)
- Confirmed `npm run lint` / `npx biome check src/_lint_test_malformed.ts` exits non-zero on a deliberately malformed file (Phase 1 success criterion 2 — failure side); malformed file removed inline, never persisted
- Verified absence of `eslint.config.js`, `.eslintrc(.json)`, `.prettierrc(.json)` per D-01
- Applied Biome safe auto-fixes to existing scaffold so lint exits 0 day-one (cosmetic only — semicolons + alphabetized imports)

## Task Commits

1. **Task 1: Install Biome and create biome.json** — `9653857` (feat)
2. **Task 2: Verify lint failure on malformed file** — *no commit* (inline verification, no file deltas; rationale below)

**Plan metadata commit:** to follow this SUMMARY (docs).

## Files Created/Modified

- `biome.json` — Biome 2.x configuration (recommended linter, formatter, organize imports, ignore set)
- `package.json` — Added `@biomejs/biome` ^2.4.14 to devDependencies (preserved tsup, vitest, typescript, @types/express, @types/node)
- `package-lock.json` — Transitive dependency tree for Biome (160 packages)
- `src/index.test.ts` — Biome auto-fix: semicolons added, named imports alphabetized
- `tsup.config.ts` — Biome auto-fix: semicolons added
- `vitest.config.ts` — Biome auto-fix: semicolons added

## Decisions Made

- **Biome 2.x schema migration (D-01 implementation detail):** The plan's `<action>` JSON used Biome 1.x keys (`organizeImports`, `files.ignore`). Biome 2.4.14 — the version locked by STACK.md — rejects both keys. The 2.x equivalents are `assist.actions.source.organizeImports = "on"` and `files.includes` with negation patterns. Both intent (organize imports on; ignore node_modules/dist/coverage/.planning) was preserved; only the schema shape changed.
- **Added `.claude` to the ignore list:** Local Claude Code settings (`.claude/settings.local.json`) are tooling config, not source. Not in the plan's ignore list but consistent with `.planning` being ignored.
- **Applied `biome check --write` once to the scaffold:** Plan 01-02 produced files without semicolons, but Biome's recommended formatter inserts semicolons. To honour the acceptance criterion "`npm run lint` exits 0 on the clean scaffold", I applied the safe auto-fixes once. All changes were cosmetic (semicolons, alphabetized imports inside one test file's named-import list). No logic touched.
- **Task 2 had no commit:** The plan's Task 2 explicitly creates and removes a file inline within a single task. With no file deltas, an empty commit would be misleading; the verification observation (lint exited 1, then file removed, then lint exits 0 again) is captured here in SUMMARY for reviewer traceability.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug / Rule 3 - Blocking] biome.json schema for Biome 2.x**
- **Found during:** Task 1 (running `npx biome check .` after writing the plan-supplied JSON)
- **Issue:** The plan's biome.json used Biome 1.x keys (`organizeImports` at root, `files.ignore`). Biome 2.4.14 (locked by STACK.md and installed by `npm install -D @biomejs/biome`) rejects both keys outright with "Found an unknown key" errors and exits non-zero, blocking the acceptance criterion "exits 0 on the clean scaffold".
- **Fix:** Rewrote the JSON to Biome 2.x shape: moved import organization into `assist.actions.source.organizeImports: "on"`; replaced `files.ignore` with `files.includes` using negation patterns (`["**", "!node_modules", "!dist", "!coverage", "!.planning", "!.claude"]`); added the canonical `vcs` block from `biome init`. Design intent — recommended linter, 2-space indent, lineWidth 100, single quotes, es5 trailing commas, ignore the same set of paths — was preserved.
- **Files modified:** biome.json
- **Verification:** `npx biome check .` exits 0; `npx biome init` output cross-checked to confirm the 2.x key shape; biome.json validated by Biome itself when running `biome check`.
- **Committed in:** 9653857 (Task 1 commit)

**2. [Rule 2 - Missing critical] Added `.claude` to the ignore list**
- **Found during:** Task 1 (first run of `npx biome check .` complained about `.claude/settings.local.json` formatting)
- **Issue:** The plan's ignore list excluded `.planning` but not `.claude`. Linting Claude Code's local settings file would (a) flag formatting on a tool config the project doesn't own, and (b) produce friction every time a user adjusts Claude permissions.
- **Fix:** Added `!.claude` to `files.includes`.
- **Files modified:** biome.json
- **Verification:** `.claude/settings.local.json` no longer surfaces in `biome check` output.
- **Committed in:** 9653857 (Task 1 commit)

**3. [Rule 1 - Bug] Applied Biome safe auto-fixes to scaffold so `npm run lint` exits 0**
- **Found during:** Task 1 (after fixing biome.json schema, `biome check .` still exited 1 because `src/index.test.ts`, `tsup.config.ts`, `vitest.config.ts` from plan 01-02 lacked the semicolons Biome's default formatter expects, and `src/index.test.ts` had a non-alphabetised named-import list)
- **Issue:** Plan 01-02 wrote files in a no-semicolon style. Biome's recommended formatter inserts semicolons. Acceptance criterion "exits 0 on the clean scaffold" cannot hold without either (a) reformatting the scaffold or (b) disabling Biome's semicolon rule. Option (a) is correct because the plan's stated formatter style does not opt out of semicolons and the larger phase has chosen Biome defaults (per D-01's "Claude's Discretion" on rule strictness — recommended preset).
- **Fix:** Ran `npx biome check --write .` once. Biome applied 4 safe fixes: added trailing semicolons to 3 files; alphabetized the `{ describe, it, expect }` named-import list to `{ describe, expect, it }` in `src/index.test.ts`. No logic was changed; the test still asserts the same things.
- **Files modified:** src/index.test.ts, tsup.config.ts, vitest.config.ts
- **Verification:** `npx biome check .` re-run, exited 0 with "Checked 7 files in 9ms. No fixes applied." Vitest test still asserts `typeof VERSION === 'string'` and `VERSION.length > 0`; tsup and vitest configs are functionally unchanged.
- **Committed in:** 9653857 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (1 schema bug, 1 missing critical, 1 cosmetic-but-blocking)
**Impact on plan:** All three auto-fixes were necessary for the acceptance criterion "`npm run lint` exits 0 on the clean scaffold" to hold against the actual installed Biome version. No scope creep — same intent (Biome configured per D-01, lint passes on clean repo, fails on malformed file), same files, same design choices.

## Issues Encountered

- Plan-supplied `biome.json` was written for Biome 1.x; installed Biome is 2.4.14. Resolved via Rule 1/3 schema rewrite (see deviation 1). This is the only friction; the rest of the plan executed as written.

## User Setup Required

None — Biome is a pure devDependency. No external service configuration.

## Next Phase Readiness

- Plan 01-04 (CI matrix) can now wire `npm run lint` into every matrix cell — it will exit 0 on the clean repo and is known to flag violations correctly.
- Phases 02 and onward can rely on `npm run format` and `npm run lint` as standard guardrails. Future code added in those phases will be expected to pass `biome check` (semicolons, single quotes, lineWidth 100, organized imports).
- One subtle expectation set: any future `.test.ts` files should be written with semicolons and alphabetised named imports from the start, or run through `npm run format` before commit, to avoid friction in the CI lint step that 01-04 will introduce.

## Self-Check

Verified before returning:

- File presence:
  - FOUND: biome.json
  - FOUND: package.json (modified)
  - FOUND: src/index.test.ts (formatted)
  - FOUND: tsup.config.ts (formatted)
  - FOUND: vitest.config.ts (formatted)
  - NOT_FOUND: eslint.config.js, .eslintrc, .eslintrc.json, .prettierrc, .prettierrc.json (correct)
  - NOT_FOUND: src/_lint_test_malformed.ts (correctly removed after inline verification)
- Commit presence:
  - FOUND: 9653857 (Task 1)
- Behavioural:
  - `npm run lint` exits 0
  - `npx biome check src/_lint_test_malformed.ts` (with malformed content) exits 1, then file removed
- devDeps preserved from 01-02:
  - tsup => ^8.5.1
  - vitest => ^4.1.5
  - typescript => ^6.0.3
  - @types/express => ^5.0.6
  - @types/node => ^25.6.0
  - @biomejs/biome => ^2.4.14 (added by this plan)

## Self-Check: PASSED

---
*Phase: 01-foundation-tooling*
*Completed: 2026-05-05*
