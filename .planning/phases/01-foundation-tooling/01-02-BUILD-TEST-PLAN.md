---
phase: "01-foundation-tooling"
plan: "02"
type: execute
wave: 2
depends_on:
  - "01-01"
files_modified:
  - tsup.config.ts
  - vitest.config.ts
  - src/index.test.ts
  - package.json
autonomous: true
requirements:
  - FOUND-01

must_haves:
  truths:
    - "npm run build emits dist/index.js (ESM), dist/index.cjs (CJS), dist/index.d.ts (types) — ROADMAP success criterion 1 (D-03)"
    - "tsup config excludes **/*.test.ts from the built entry so test files never appear in dist/ (D-06)"
    - "npm test runs Vitest and exits 0 on a placeholder smoke test (D-02, ROADMAP success criterion 5)"
    - "vitest.config.ts configures include pattern to pick up co-located *.test.ts files in src/ (D-04)"
    - "package.json devDependencies includes typescript, tsup, vitest, @types/node, @types/express (D-15, D-02, D-03)"
    - "package-lock.json is generated and committed (supply chain integrity)"
  artifacts:
    - path: "tsup.config.ts"
      provides: "Build configuration — CJS+ESM dual output, dts, clean, exclude tests"
      contains: "format"
    - path: "vitest.config.ts"
      provides: "Test runner configuration — picks up src/**/*.test.ts"
      contains: "include"
    - path: "src/index.test.ts"
      provides: "Placeholder smoke test proving Vitest is wired"
    - path: "dist/index.js"
      provides: "ESM build artifact"
    - path: "dist/index.cjs"
      provides: "CJS build artifact"
    - path: "dist/index.d.ts"
      provides: "TypeScript declarations"
  key_links:
    - from: "tsup.config.ts entry"
      to: "src/index.ts"
      via: "entry array"
      pattern: "entry.*src/index\\.ts"
    - from: "tsup.config.ts format"
      to: "cjs and esm"
      via: "format array"
      pattern: "format.*\\[.*cjs.*esm"
    - from: "vitest.config.ts include"
      to: "src/**/*.test.ts"
      via: "test.include"
      pattern: "include.*test\\.ts"
---

<objective>
Wire the build pipeline (tsup) and test runner (Vitest) so `npm run build` produces all three artifacts and `npm test` exits 0.

Purpose: Every subsequent phase (2-6) ships code + tests in the same commit on top of this scaffold. A broken test runner or broken build pipeline would block all future work.

Output:
- `tsup.config.ts` — dual CJS/ESM build with type declarations, sourcemaps, and test file exclusion
- `vitest.config.ts` — Vitest config that picks up co-located `*.test.ts` files in `src/`
- `src/index.test.ts` — placeholder smoke test (proves runner works, no logic tested)
- Dev dependencies installed: `typescript`, `tsup`, `vitest`, `@types/node`, `@types/express`
- `dist/` — populated by `npm run build`
</objective>

<execution_context>
@/home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru/.claude/get-shit-done/workflows/execute-plan.md
@/home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-foundation-tooling/01-CONTEXT.md
@.planning/research/STACK.md
@.planning/phases/01-foundation-tooling/01-01-SUMMARY.md
</context>

<interfaces>
<!-- Key exports from Plan 01 that this plan builds on. -->

From src/index.ts (created in Plan 01):
```typescript
export const VERSION = '0.0.1';
```

From package.json (created in Plan 01):
```json
{
  "scripts": {
    "build": "tsup",
    "test": "vitest run"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  }
}
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Install dev dependencies and create tsup.config.ts</name>
  <files>tsup.config.ts, package.json</files>
  <read_first>
    - .planning/phases/01-foundation-tooling/01-CONTEXT.md (D-03, D-06 — tsup, exclude test files)
    - .planning/research/STACK.md (tsup.config.ts template section)
  </read_first>
  <action>
**Step 1 — Install dev dependencies:**

Run the following install command. This adds the exact packages from STACK.md and CONTEXT.md:

```bash
npm install -D typescript@^6.0.0 tsup vitest @types/node @types/express
```

Why these and not others:
- `typescript@^6.0.0` — locked by D-15
- `tsup` — locked by D-03; handles dual CJS+ESM output automatically
- `vitest` — locked by D-02
- `@types/node` — required for TypeScript to resolve Node built-ins (crypto, Buffer, etc.)
- `@types/express` — required for TypeScript middleware type work in later phases
- Do NOT install `@biomejs/biome` here — that is Plan 03's job
- Do NOT install `express` as a regular dependency — it is peerDependency only (D-13)
- Do NOT install `supertest` or `@types/supertest` here — those are Phase 6

**Step 2 — Create `tsup.config.ts`:**

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
})
```

Why these settings (per D-06 and STACK.md):
- `entry: ['src/index.ts']` — explicit single entry; tsup will NOT pick up `*.test.ts` files from glob patterns when entry is explicit. This satisfies D-06's requirement to exclude tests from dist.
- `format: ['cjs', 'esm']` — produces `dist/index.cjs` and `dist/index.js` respectively
- `dts: true` — generates `dist/index.d.ts` (and `dist/index.d.cts` for CJS)
- `sourcemap: true` — per CONTEXT.md "Claude's Discretion" note on tsup flags
- `clean: true` — removes `dist/` before each build; prevents stale artifacts
- `outDir: 'dist'` — matches package.json exports paths

Note: tsup's explicit `entry` array (not a glob) is the primary mechanism satisfying D-06. The `tsconfig.json exclude` array (set in Plan 01) is the TypeScript-level safety net. Both layers are required.
  </action>
  <verify>
    <automated>test -f tsup.config.ts && grep -c "format.*\[" tsup.config.ts && grep -c "entry.*src/index" tsup.config.ts && node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); console.assert(p.devDependencies.typescript); console.assert(p.devDependencies.tsup); console.assert(p.devDependencies.vitest); console.log('dev deps OK')"</automated>
  </verify>
  <acceptance_criteria>
    - `tsup.config.ts` exists
    - `tsup.config.ts` contains `entry: ['src/index.ts']`
    - `tsup.config.ts` contains `format: ['cjs', 'esm']`
    - `tsup.config.ts` contains `dts: true`
    - `tsup.config.ts` contains `clean: true`
    - `package.json devDependencies` contains `typescript`, `tsup`, `vitest`, `@types/node`, `@types/express`
    - `express` is NOT in `devDependencies` or `dependencies`
    - `package-lock.json` exists (generated by npm install)
  </acceptance_criteria>
  <done>tsup.config.ts created with dual CJS/ESM output, dts, sourcemap, clean. Dev dependencies installed and package-lock.json generated.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create vitest.config.ts and placeholder smoke test</name>
  <files>vitest.config.ts, src/index.test.ts</files>
  <read_first>
    - .planning/phases/01-foundation-tooling/01-CONTEXT.md (D-02, D-04 — Vitest, co-located tests in src/)
    - .planning/research/STACK.md (Vitest section, ESM-native)
  </read_first>
  <behavior>
    - Smoke test imports VERSION from src/index.ts — proves the barrel is importable
    - Smoke test asserts VERSION is a non-empty string — proves Vitest can run assertions
    - Test file must be named `src/index.test.ts` (co-located pattern D-04)
    - vitest.config.ts must enable ESM (required for TypeScript ESM project)
  </behavior>
  <action>
**Step 1 — Create `vitest.config.ts`:**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
```

Why these settings:
- `include: ['src/**/*.test.ts']` — picks up all co-located unit tests (D-04 pattern). Does NOT include `tests/integration/` (that is Phase 6, D-05).
- `environment: 'node'` — explicit Node environment; avoids jsdom assumptions that would break crypto tests in later phases.
- No `globals: true` — use explicit `import { describe, it, expect } from 'vitest'` in test files for clarity and IDE support.

**Step 2 — Create `src/index.test.ts`** (smoke test):

```typescript
import { describe, it, expect } from 'vitest'
import { VERSION } from './index.js'

describe('express-webhook-validator', () => {
  it('exports a VERSION string', () => {
    expect(typeof VERSION).toBe('string')
    expect(VERSION.length).toBeGreaterThan(0)
  })
})
```

Notes:
- Import path uses `'./index.js'` (not `'./index.ts'`) — this is required for ESM with `moduleResolution: "bundler"` in TypeScript 6.x. Vitest resolves `.js` → `.ts` automatically.
- This test is a placeholder. Its purpose is to verify Vitest can discover, execute, and pass a test. It tests nothing about webhook validation.
- Do NOT add `expect(true).toBe(true)` style tests — a real import assertion is more valuable as a smoke test.

**Step 3 — Run the smoke test to confirm green:**
```bash
npm test
```
Expected output: 1 test passing, exit code 0.

**Step 4 — Run the build to confirm all three artifacts:**
```bash
npm run build
```
Expected output: `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts` all present.
  </action>
  <verify>
    <automated>npm test && test -f vitest.config.ts && grep -c "src/\*\*/\*\.test\.ts" vitest.config.ts && npm run build && test -f dist/index.js && test -f dist/index.cjs && test -f dist/index.d.ts && echo "build + test OK"</automated>
  </verify>
  <acceptance_criteria>
    - `vitest.config.ts` exists with `include: ['src/**/*.test.ts']` and `environment: 'node'`
    - `src/index.test.ts` exists and imports from `'./index.js'`
    - `npm test` exits 0 with at least 1 passing test
    - `npm run build` exits 0
    - `dist/index.js` exists after build
    - `dist/index.cjs` exists after build
    - `dist/index.d.ts` exists after build
    - `dist/` does NOT contain any `*.test.ts` or `*.test.js` files: `find dist/ -name '*.test.*' | wc -l` equals 0
  </acceptance_criteria>
  <done>Vitest configured for co-located src tests. Smoke test passes. Build produces all three artifacts. Test files absent from dist/.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| npm registry → node_modules | `npm install -D` fetches typescript, tsup, vitest, @types/* from registry |
| src/ → dist/ | tsup build pipeline transforms TypeScript source to CJS/ESM/types |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-01 | Tampering | Supply chain — lockfile drift | mitigate | `npm install` generates `package-lock.json`. Plan 04 (CI) uses `npm ci` which validates lockfile checksums. Commit `package-lock.json` alongside these files. |
| T-02-02 | Information Disclosure | Test files leaking into dist/ | mitigate | tsup explicit `entry: ['src/index.ts']` (not a glob) prevents test files from entering the build. Post-build acceptance criterion: `find dist/ -name '*.test.*' | wc -l` equals 0. |
| T-02-03 | Denial of Service | Broken build blocking all subsequent phases | mitigate | Task 2 Step 4 runs `npm run build` as part of the task and verifies the three artifacts. If build fails, executor must not proceed. |
| T-02-04 | Tampering | tsup producing CJS-only or ESM-only output | mitigate | Acceptance criteria verify both `dist/index.js` (ESM) and `dist/index.cjs` (CJS) exist after build. |
</threat_model>

<verification>
After both tasks complete, run full verification:

```bash
# Confirm all three build artifacts
npm run build
test -f dist/index.js && echo "ESM OK"
test -f dist/index.cjs && echo "CJS OK"
test -f dist/index.d.ts && echo "types OK"

# Confirm no test files in dist
find dist/ -name '*.test.*' | wc -l  # must be 0

# Confirm test runner is green
npm test  # must exit 0

# Confirm express not in regular deps
node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); const express=(p.dependencies||{}).express||(p.devDependencies||{}).express; if(express){console.error('EXPRESS IN DEPS!');process.exit(1)} console.log('express peerDep only OK')"
```
</verification>

<success_criteria>
ROADMAP success criterion 1: `npm run build` produces `dist/index.js` (ESM), `dist/index.cjs` (CJS), `dist/index.d.ts` — all three present.
ROADMAP success criterion 5: `npm test` exits 0 on the smoke test.
D-06: `find dist/ -name '*.test.*'` returns 0 matches.
D-04: `src/index.test.ts` co-located with `src/index.ts`.
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundation-tooling/01-02-SUMMARY.md` following the summary template.
</output>
