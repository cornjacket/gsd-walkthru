---
phase: 01-foundation-tooling
verified: 2026-05-05T22:05:00Z
status: human_needed
score: 4/5 must-haves verified (SC#3 awaits human GitHub Actions confirmation)
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Push branch to GitHub and confirm the 'Test' workflow runs and reports green for all 6 matrix cells"
    expected: "Actions tab shows 6 successful jobs: Node 20.x|22.x|24.x x Express 4.21.x|5.x. Each cell ran 'Lint (Biome check)' -> 'Build (tsup)' -> 'Test (Vitest)' steps in order."
    why_human: "GitHub Actions UI inspection is human-driven; the workflow file exists and is structurally correct locally, but matrix execution can only be observed after a push to a remote repo. SC#3 explicitly requires green CI on the default branch — confirmation cannot be automated from inside this checkout."
requirements_coverage:
  - id: FOUND-01
    description: "Project scaffolded with TypeScript, builds dual CJS/ESM output via tsup, package.json exports map configured"
    status: SATISFIED
    evidence: "package.json exports map points at dist/index.js (ESM), dist/index.cjs (CJS), dist/index.d.ts (types). npm run build emits all three artifacts plus index.d.cts. ESM and CJS consumer imports both succeed with VERSION=0.0.1. tsconfig has target=ES2020 / module=ESNext / moduleResolution=bundler / strict=true / declaration=true / declarationMap=true."
  - id: FOUND-02
    description: "GitHub Actions CI matrix runs tests on Node 20/22/24 x Express 4.x/5.x"
    status: NEEDS HUMAN
    evidence: ".github/workflows/test.yml exists with single-job 3x2 matrix [20.x,22.x,24.x] x ['4.21.x','5.x'], fail-fast:false, steps: checkout v4 -> setup-node v4 -> npm ci -> npm install express@<v> -> npm run lint -> npm run build -> npm test. CI green status awaits human verification (SC#3)."
  - id: FOUND-03
    description: "Lint and format configured (Biome or ESLint flat config + Prettier) and enforced in CI"
    status: SATISFIED
    evidence: "biome.json exists (Biome 2.x schema, recommended linter, 2-space/lineWidth-100 formatter, single quotes, es5 trailing commas). @biomejs/biome ^2.4.14 in devDependencies. npm run lint exits 0 on clean repo, exits non-zero on a deliberately malformed file (verified inline). No eslint or prettier config files present. CI runs npm run lint as the first step in every matrix cell."
  - id: FOUND-04
    description: "express declared as peerDependency (4.x and 5.x), not a regular dependency"
    status: SATISFIED
    evidence: "package.json peerDependencies.express = '4.x || 5.x'. Express does NOT appear in dependencies or devDependencies. package-lock.json node_modules/express entry is marked peer:true (npm 7+ auto-installs peerDependency in the dev tree, but it is not transitively required for consumers since it is not declared as a regular dependency)."
---

# Phase 01: Foundation & Tooling Verification Report

**Phase Goal:** A reviewer cloning the repo gets a working TypeScript build, a working test runner, and green CI on day one.
**Verified:** 2026-05-05T22:05:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `npm run build` produces both CJS and ESM artifacts with type declarations and a correct `exports` map. | VERIFIED | `npm run build` ran cleanly: emitted `dist/index.js` (94B ESM), `dist/index.cjs` (1.07KB CJS), `dist/index.d.ts` (54B types), `dist/index.d.cts` (54B), plus sourcemaps. `package.json.exports["."]` declares `types -> ./dist/index.d.ts`, `import -> ./dist/index.js`, `require -> ./dist/index.cjs` (types-first per Node TS-aware resolution). ESM and CJS consumer imports both succeed with `VERSION='0.0.1'`. |
| 2 | `npm run lint` and `npm run format` pass on a clean checkout and fail on a deliberately malformed file. | VERIFIED | `npm run lint` exits 0: "Checked 7 files in 10ms. No fixes applied." `npm run format` exits 0: "Formatted 7 files in 5ms. No fixes applied." Inline test of `src/_lint_test_malformed.ts` (with unused var + double quotes) caused `npx biome check` to exit non-zero; file removed afterwards (no persistence). `git status` shows no uncommitted changes from format run. |
| 3 | GitHub Actions CI runs the test job across Node 20, 22, and 24 against both Express 4.x and 5.x and reports green on the default branch. | UNCERTAIN (human-verify) | `.github/workflows/test.yml` is structurally correct: single `test` job, `strategy.matrix.node-version: [20.x, 22.x, 24.x]`, `express-version: ["4.21.x", "5.x"]`, `fail-fast: false`. Steps: checkout@v4 -> setup-node@v4 (cache: npm) -> `npm ci` -> `npm install express@${{ matrix.express-version }}` -> `npm run lint` -> `npm run build` -> `npm test`. Triggers: push and pull_request on `["**"]`. **No remote run observed yet** — workflow must be pushed and confirmed green on GitHub Actions UI (Plan 04 explicitly marked Task 2 as `checkpoint:human-verify`). |
| 4 | `npm install` in a fresh consumer project does not pull Express transitively — Express is declared only as a peerDependency for `4.x \|\| 5.x`. | VERIFIED | `package.json.peerDependencies.express = "4.x \|\| 5.x"`. Express absent from `dependencies` (none declared) and `devDependencies` (only @biomejs/biome, @types/express, @types/node, tsup, typescript, vitest). `package-lock.json` root package shows empty `dependencies`, devDeps without express; the `node_modules/express` entry exists only because npm 7+ auto-installs peer deps in the dev tree, marked `peer: true`. A consumer installing `express-webhook-validator` would not receive Express transitively because the package declares no Express in `dependencies`. |
| 5 | `npm test` runs and exits 0 on a placeholder smoke test from a fresh checkout, in CI and locally. | VERIFIED | `npm test` ran: "Test Files 1 passed (1) / Tests 1 passed (1) / Duration 285ms". The smoke test imports `VERSION` from `./index.js` (D-04 co-located pattern) and asserts non-empty string. `vitest.config.ts` includes `src/**/*.test.ts` with `environment: 'node'`. Test runner wired up so every subsequent phase can ship co-located tests. CI side awaits human SC#3 confirmation. |

**Score:** 4/5 truths VERIFIED, 1 human-verify (SC#3 — by design per Plan 04 Task 2 `checkpoint:human-verify`).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `package.json` | Name=express-webhook-validator, exports map, peerDep, scripts, engines>=20 | VERIFIED | All 14 field assertions pass (name, license=MIT, engines.node=">=20.0.0", type=module, peerDependencies.express="4.x \|\| 5.x", express NOT in deps/devDeps, exports.types/import/require correct, scripts.build/test/lint/format correct). |
| `tsconfig.json` | ES2020 / ESNext / bundler / strict / declaration+map / exclude **/*.test.ts | VERIFIED | All 7 field assertions pass. Includes intentional `ignoreDeprecations: "6.0"` (D-deviation captured in 01-02 SUMMARY — needed for tsup dts emit under TS6). |
| `tsup.config.ts` | entry=src/index.ts, format=[cjs,esm], dts=true, clean=true | VERIFIED | All 4 fields present. Explicit single entry (not glob) is D-06 layer 2 — verified `find dist -name '*.test.*'` returns 0. |
| `vitest.config.ts` | include=['src/**/*.test.ts'], environment=node | VERIFIED | Both fields present. |
| `biome.json` | linter.recommended=true, formatter, ignores | VERIFIED | Biome 2.x schema with `assist.actions.source.organizeImports: "on"`, `files.includes` with negation. linter recommended=true; formatter 2-space/100-width; quoteStyle=single; trailingCommas=es5. Ignores node_modules/dist/coverage/.planning/.claude. |
| `src/index.ts` | Barrel with placeholder export | VERIFIED | Exports `VERSION = '0.0.1'`. |
| `src/index.test.ts` | Smoke test importing from './index.js' | VERIFIED | Imports `{ VERSION }` from `./index.js` and asserts `typeof VERSION === 'string'` and `VERSION.length > 0`. |
| `tests/integration/.gitkeep` | Phase 6 placeholder | VERIFIED | Present and committed. |
| `examples/example-app/.gitkeep` | Phase 7 placeholder | VERIFIED | Present and committed. |
| `LICENSE` | MIT text | VERIFIED | Contains "MIT License" line. |
| `.gitignore` | Standard Node patterns | VERIFIED | Present and committed. |
| `package-lock.json` | Lockfile committed (T-02-01 mitigation) | VERIFIED | `git ls-files package-lock.json` confirms commit. |
| `.github/workflows/test.yml` | 3x2 matrix, npm ci + npm install express + lint + build + test | VERIFIED (file) / UNCERTAIN (run) | Structure correct (see Truth #3); execution awaits human SC#3 confirmation. |
| `dist/index.js` | ESM build artifact | VERIFIED | Emitted by `npm run build`; ESM consumer import returns VERSION=0.0.1. |
| `dist/index.cjs` | CJS build artifact | VERIFIED | Emitted by `npm run build`; CJS consumer require returns VERSION=0.0.1. |
| `dist/index.d.ts` | TypeScript declarations | VERIFIED | Emitted (54B): `declare const VERSION = "0.0.1"; export { VERSION };`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| package.json exports | dist/index.js, dist/index.cjs, dist/index.d.ts | tsup build | WIRED | All three referenced artifacts exist after `npm run build` and consumers can resolve them. |
| tsconfig exclude | **/*.test.ts | exclude array | WIRED | `tsconfig.json.exclude` contains `**/*.test.ts` (D-06 layer 1). |
| tsup entry | src/index.ts | entry array | WIRED | `tsup.config.ts.entry = ['src/index.ts']` — explicit single entry, not glob (D-06 layer 2). `find dist -name '*.test.*'` returns 0. |
| tsup format | cjs and esm | format array | WIRED | `format: ['cjs', 'esm']`; both artifacts emitted. |
| vitest include | src/**/*.test.ts | test.include | WIRED | `include: ['src/**/*.test.ts']`; smoke test in `src/index.test.ts` is discovered (1 test passed). |
| package.json scripts.lint | biome check . | npm run lint | WIRED | Script equals `"biome check ."`; runs and exits 0 on clean repo, non-zero on malformed file. |
| package.json scripts.format | biome format --write . | npm run format | WIRED | Script equals `"biome format --write ."`; runs and exits 0 with no fixes on clean repo. |
| CI workflow node-version | [20.x, 22.x, 24.x] | strategy.matrix | WIRED (file) | Matrix array literal present in test.yml. |
| CI workflow express-version | ["4.21.x", "5.x"] | strategy.matrix | WIRED (file) | Matrix array literal present in test.yml. |
| CI workflow Express install | npm install express@<matrix-version> | run step after npm ci | WIRED (file) | Step present after `npm ci` and before lint/build/test. |

### Data-Flow Trace (Level 4)

Skipped — Phase 1 produces tooling/config and a placeholder smoke test, no dynamic data rendering. The smoke test asserts `VERSION` (a static string from `src/index.ts`) is correctly imported through the bundler/types resolution chain — the consumer-import spot-check (Step 7b) confirms this end-to-end.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Test runner exits 0 | `npm test` | "Test Files 1 passed (1) / Tests 1 passed (1)" | PASS |
| Lint passes on clean repo | `npm run lint` | "Checked 7 files in 10ms. No fixes applied." (exit 0) | PASS |
| Format passes on clean repo | `npm run format` | "Formatted 7 files in 5ms. No fixes applied." (exit 0) | PASS |
| Lint fails on malformed file | (inline write malformed.ts -> `npx biome check` -> rm) | non-zero exit observed | PASS |
| Build emits all three artifacts | `npm run build` | dist/index.js + dist/index.cjs + dist/index.d.ts (+ .d.cts + sourcemaps) | PASS |
| ESM consumer import resolves | `node --input-type=module -e "import {VERSION} from 'dist/index.js'..."` | "ESM_CONSUMES: 0.0.1" | PASS |
| CJS consumer require resolves | `node -e "const {VERSION} = require('dist/index.cjs')..."` | "CJS_CONSUMES: 0.0.1" | PASS |
| No test files in dist | `find dist -name '*.test.*' \| wc -l` | 0 | PASS |
| Express absent from regular deps | `node -e "p.dependencies.express \|\| p.devDependencies.express"` | undefined | PASS |
| CI matrix is single job (D-07) | grep `test-express-versions` in test.yml | not found | PASS |
| CI green on default branch | (push + GitHub Actions UI) | not yet observed | SKIP — human verify |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| FOUND-01 | 01-01, 01-02 | TypeScript scaffold + dual CJS/ESM via tsup + exports map | SATISFIED | exports map verified; build emits all three artifacts; ESM+CJS consumer imports work. |
| FOUND-02 | 01-04 | CI matrix Node 20/22/24 x Express 4.x/5.x | NEEDS HUMAN | Workflow file structurally correct; CI green status awaits push (intentional `checkpoint:human-verify`). |
| FOUND-03 | 01-03, 01-04 | Lint+format configured & enforced in CI | SATISFIED | Biome 2.x configured; lint+format scripts wired; CI step `npm run lint` runs in every matrix cell (file-level verified; CI execution part of human SC#3). |
| FOUND-04 | 01-01 | Express as peerDependency only | SATISFIED | peerDependencies.express = "4.x \|\| 5.x"; absent from deps/devDeps; lockfile marks node_modules/express as peer-only. |

**Orphan check:** REQUIREMENTS.md maps FOUND-01..04 to Phase 1. All four are claimed by at least one plan in `requirements:` frontmatter. No orphans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | All scaffold files are intentionally minimal (placeholder VERSION, smoke test). The "placeholder" comments in src/index.ts are accurate documentation that Phase 2 will replace, not stub indicators of an incomplete Phase 1 deliverable. |

Note: `src/index.ts` contains `// Phase 1 placeholder — Phase 2 will export ...` which matches the placeholder anti-pattern grep, but it is the correct deliverable for Phase 1 — the smoke test exists to prove the runner+build+exports map work end-to-end before Phase 2 introduces real exports. Categorized as `Info`, not Warning or Blocker.

### Human Verification Required

#### 1. CI green on the default branch (SC#3)

**Test:** Push the current branch to GitHub. Open the repo → Actions tab → find the "Test" workflow run.
**Expected:**
- Matrix shows exactly 6 cells: Node {20.x, 22.x, 24.x} x Express {4.21.x, 5.x}.
- All 6 cells report green.
- Spot-check one cell: the steps "Lint (Biome check)" → "Build (tsup)" → "Test (Vitest)" all pass in that order.
**Why human:** GitHub Actions execution requires a remote push and UI inspection. SC#3 explicitly says "reports green on the default branch" — this is observable only after push. Plan 04 Task 2 was correctly modeled as `checkpoint:human-verify gate="blocking"`.

### Gaps Summary

There are no codebase-level gaps. All Phase 1 deliverables that can be verified locally are present, structurally correct, and behaviorally green:

- Build pipeline produces all three artifacts (ESM + CJS + types) and consumers can import from both ESM and CJS bundles.
- Test runner wired and green (`npm test` → 1 passing).
- Lint and format wired, green on clean repo, and demonstrably catch a malformed file.
- Express is locked to peerDependency only (absent from dependencies and devDependencies).
- CI workflow file is structurally compliant with D-07 (single matrix job, not split) and D-08 (lint→build→test step order).
- All 4 requirements (FOUND-01..04) are claimed by plans and 3 of 4 are fully satisfied; FOUND-02 (CI matrix) is satisfied at file-level but its `green on default branch` clause is the SC#3 human checkpoint.

The single remaining open item is the SC#3 "CI green" human verification, which is by design — Plan 04 explicitly modeled it as a `checkpoint:human-verify` gate because GitHub Actions execution can only be observed post-push. This is not a defect of the phase implementation; it is the intended seam between automated phase execution and human-driven post-merge confirmation.

---

_Verified: 2026-05-05T22:05:00Z_
_Verifier: Claude (gsd-verifier)_
