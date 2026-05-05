---
phase: "01-foundation-tooling"
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - tsconfig.json
  - .gitignore
  - LICENSE
  - src/index.ts
  - tests/integration/.gitkeep
  - examples/example-app/.gitkeep
autonomous: true
requirements:
  - FOUND-01
  - FOUND-04

must_haves:
  truths:
    - "package.json declares name = 'express-webhook-validator' (D-10)"
    - "package.json license = 'MIT' (D-11)"
    - "package.json engines.node = '>=20.0.0' (D-12)"
    - "express appears only in peerDependencies with range '4.x || 5.x', not in dependencies or devDependencies (D-13, FOUND-04)"
    - "package.json type = 'module' with exports map pointing at dist/index.js (ESM), dist/index.cjs (CJS), dist/index.d.ts (types) (D-03, FOUND-01)"
    - "tsconfig.json sets target ES2020, module ESNext, moduleResolution bundler, strict true, declaration true, declarationMap true, excludes **/*.test.ts (D-15)"
    - "src/index.ts exists with at least one placeholder export (sets up barrel for Phase 2)"
    - "tests/integration/.gitkeep exists (reserved for Phase 6, D-05)"
    - "examples/example-app/.gitkeep exists (placeholder for Phase 7 example, D-09)"
  artifacts:
    - path: "package.json"
      provides: "Package identity, exports map, engines, peerDependency"
      contains: "express-webhook-validator"
    - path: "tsconfig.json"
      provides: "TypeScript compiler configuration"
      contains: "ES2020"
    - path: "src/index.ts"
      provides: "Barrel entry point for dist build"
    - path: "tests/integration/.gitkeep"
      provides: "Integration test directory placeholder"
    - path: "examples/example-app/.gitkeep"
      provides: "Example app directory placeholder"
  key_links:
    - from: "package.json exports"
      to: "dist/index.js, dist/index.cjs, dist/index.d.ts"
      via: "tsup build (configured in Plan 02)"
      pattern: "\"exports\".*\"\\.\""
    - from: "tsconfig.json exclude"
      to: "**/*.test.ts"
      via: "exclude array"
      pattern: "\\*\\*\\/\\*\\.test\\.ts"
---

<objective>
Establish the repo-root package identity and TypeScript project foundation.

Purpose: Every subsequent plan builds on the package.json exports map, peerDependency declaration, and tsconfig. This plan sets those foundations once, correctly, with no ambiguity for downstream plans.

Output:
- `package.json` — package identity, exports map skeleton, engines, scripts placeholders, peerDependency
- `tsconfig.json` — strict TypeScript 6.x config per D-15, excludes test files
- `.gitignore` — standard Node patterns
- `LICENSE` — MIT text (D-11)
- `src/index.ts` — barrel with one placeholder export
- `tests/integration/.gitkeep` — reserves the Phase 6 integration test home (D-05)
- `examples/example-app/.gitkeep` — reserves Phase 7 example app slot (D-09)
</objective>

<execution_context>
@/home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru/.claude/get-shit-done/workflows/execute-plan.md
@/home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/01-foundation-tooling/01-CONTEXT.md
@.planning/research/STACK.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create package.json with identity, exports map, peerDependency, and scripts</name>
  <files>package.json</files>
  <read_first>
    - .planning/phases/01-foundation-tooling/01-CONTEXT.md (D-09 through D-13, peerDependency range, package name)
    - .planning/research/STACK.md (exports map template, peerDependencies pattern)
  </read_first>
  <action>
Create `package.json` at repo root with exactly these contents. Do not deviate from these values — every field is locked by decisions D-09 through D-14:

```json
{
  "name": "express-webhook-validator",
  "version": "0.0.1",
  "description": "Express middleware for unified HMAC webhook signature validation (Stripe, GitHub, Shopify)",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "lint": "biome check .",
    "format": "biome format --write ."
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "license": "MIT",
  "peerDependencies": {
    "express": "4.x || 5.x"
  },
  "devDependencies": {}
}
```

Notes:
- `devDependencies` is intentionally empty — Plans 02 and 03 will populate it via `npm install -D`.
- `"type": "module"` is required for tsup's ESM output to be recognized without `.mjs` extension.
- The `exports` field has `"types"` first (per Node.js resolution priority for TypeScript consumers).
- `"express": "4.x || 5.x"` is exactly as specified in D-13 — no caret, no tilde, just the range.
  </action>
  <verify>
    <automated>node -e "const p = JSON.parse(require('fs').readFileSync('package.json','utf8')); console.assert(p.name==='express-webhook-validator'); console.assert(p.license==='MIT'); console.assert(p.engines.node==='>=20.0.0'); console.assert(p.peerDependencies.express==='4.x || 5.x'); console.assert(!p.dependencies || !p.dependencies.express); console.assert(!p.devDependencies || !p.devDependencies.express); console.assert(p.exports['.'].import==='./dist/index.js'); console.assert(p.exports['.'].require==='./dist/index.cjs'); console.assert(p.exports['.'].types==='./dist/index.d.ts'); console.log('package.json OK')"</automated>
  </verify>
  <acceptance_criteria>
    - `package.json` contains `"name": "express-webhook-validator"`
    - `package.json` contains `"license": "MIT"`
    - `package.json` contains `"node": ">=20.0.0"` under `engines`
    - `package.json` `peerDependencies.express` equals `"4.x || 5.x"`
    - `express` does NOT appear in `dependencies` or `devDependencies`
    - `exports["."].import` equals `"./dist/index.js"`
    - `exports["."].require` equals `"./dist/index.cjs"`
    - `exports["."].types` equals `"./dist/index.d.ts"`
    - `scripts.build` equals `"tsup"`
    - `scripts.test` equals `"vitest run"`
    - `scripts.lint` equals `"biome check ."`
    - `scripts.format` equals `"biome format --write ."`
  </acceptance_criteria>
  <done>package.json exists at repo root with correct identity, exports map, peerDependency, and scripts. No express in dependencies/devDependencies.</done>
</task>

<task type="auto">
  <name>Task 2: Create tsconfig.json, .gitignore, LICENSE, src/index.ts, and directory placeholders</name>
  <files>tsconfig.json, .gitignore, LICENSE, src/index.ts, tests/integration/.gitkeep, examples/example-app/.gitkeep</files>
  <read_first>
    - .planning/phases/01-foundation-tooling/01-CONTEXT.md (D-04, D-05, D-06, D-09, D-15)
    - .planning/research/STACK.md (tsconfig template section — target ES2020, module ESNext, moduleResolution bundler)
  </read_first>
  <action>
Create each file as specified below. All tsconfig values are verbatim from D-15 and STACK.md.

**`tsconfig.json`** — TypeScript configuration locked by D-15:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020"],
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```
Note: `exclude` contains `"**/*.test.ts"` — this is mandatory per D-06 so test files never enter the compiled output.

**`.gitignore`** — Standard Node patterns:
```
node_modules/
dist/
*.log
npm-debug.log*
.DS_Store
.env
.env.local
coverage/
*.tgz
```

**`LICENSE`** — MIT license text. Use current year 2026. Owner: express-webhook-validator contributors.
Full MIT text:
```
MIT License

Copyright (c) 2026 express-webhook-validator contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**`src/index.ts`** — Barrel entry point. Phase 2 will add real exports. For now, a placeholder export that allows tsup to produce valid output:
```typescript
// express-webhook-validator
// Phase 1 placeholder — Phase 2 will export createWebhookMiddleware, WebhookValidationError, etc.

export const VERSION = '0.0.1';
```

**`tests/integration/.gitkeep`** — Empty file. This directory is reserved for Phase 6 (Supertest integration suite). Per D-05, do NOT put unit tests here.

**`examples/example-app/.gitkeep`** — Empty file. This directory is reserved for Phase 7 (runnable example app). Per D-09, the example app will declare `"express-webhook-validator": "file:../.."` as a dependency.
  </action>
  <verify>
    <automated>test -f tsconfig.json && test -f .gitignore && test -f LICENSE && test -f src/index.ts && test -f tests/integration/.gitkeep && test -f examples/example-app/.gitkeep && node -e "const t = JSON.parse(require('fs').readFileSync('tsconfig.json','utf8')); console.assert(t.compilerOptions.target==='ES2020'); console.assert(t.compilerOptions.module==='ESNext'); console.assert(t.compilerOptions.moduleResolution==='bundler'); console.assert(t.compilerOptions.strict===true); console.assert(t.compilerOptions.declaration===true); console.assert(t.compilerOptions.declarationMap===true); console.assert(t.exclude.includes('**/*.test.ts')); console.log('tsconfig.json OK')" && grep -c "MIT License" LICENSE && grep -c "VERSION" src/index.ts && echo "All files OK"</automated>
  </verify>
  <acceptance_criteria>
    - `tsconfig.json` exists with `"target": "ES2020"`, `"module": "ESNext"`, `"moduleResolution": "bundler"`, `"strict": true`, `"declaration": true`, `"declarationMap": true`
    - `tsconfig.json` `exclude` array contains `"**/*.test.ts"`
    - `tsconfig.json` `include` is `["src"]`
    - `.gitignore` exists and contains `node_modules/` and `dist/`
    - `LICENSE` exists and contains `"MIT License"`
    - `src/index.ts` exists with at least one export statement
    - `tests/integration/.gitkeep` exists (empty file, directory created)
    - `examples/example-app/.gitkeep` exists (empty file, directory created)
  </acceptance_criteria>
  <done>All scaffold files created. TypeScript config is strict, ES2020 target, bundler resolution, test files excluded. Repo has correct directory shape for all 7 phases.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Developer workstation → repo | package.json, tsconfig, and lockfile define what gets installed; misconfiguration here propagates to all CI runs and consumer installs |
| npm registry → node_modules | `npm install` fetches packages from the registry; Phase 1 installs dev tooling (TypeScript, tsup, Vitest, Biome) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-01 | Tampering | package.json `peerDependencies` | mitigate | Acceptance criteria enforce `express` appears ONLY in `peerDependencies`, not `dependencies`. Reviewers can `cat package.json \| grep -A5 dependencies` to verify no hidden Express pull. |
| T-01-02 | Tampering | Supply chain — dev dependency integrity | mitigate | `npm ci` (used in CI, Plan 04) respects `package-lock.json` checksums. `package-lock.json` must be committed. First `npm install` in Plan 02 generates the lockfile; commit it. |
| T-01-03 | Information Disclosure | `tsconfig.json` `exclude` omitting `*.test.ts` | mitigate | `tsup` config in Plan 02 also excludes test files from `entry`. Both layers are required (D-06). If `exclude` is missing, test files compile into `dist/` and could expose test secrets or fixture data in published artifacts. |
| T-01-04 | Elevation of Privilege | LICENSE missing or wrong license | accept | MIT license is cosmetic in Phase 1 with no publish pipeline. Risk accepted: no security impact. |
| T-01-05 | Denial of Service | Malformed `engines.node` field | accept | `engines` is advisory; npm warns but does not block install. Worst case: confusing warning to consumer. Low risk. |
</threat_model>

<verification>
After both tasks complete, verify the full scaffold:

```bash
# Confirm package identity
node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('name:', p.name, '| license:', p.license, '| node:', p.engines.node, '| peer express:', p.peerDependencies.express)"

# Confirm no express in non-peer deps
node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); const hasDep=(p.dependencies||{}).express; const hasDevDep=(p.devDependencies||{}).express; if(hasDep||hasDevDep){process.exit(1)} console.log('express is peerDependency only — OK')"

# Confirm tsconfig excludes tests
node -e "const t=JSON.parse(require('fs').readFileSync('tsconfig.json','utf8')); if(!t.exclude.includes('**/*.test.ts')){process.exit(1)} console.log('tsconfig excludes test files — OK')"

# Confirm all directories exist
test -d src && test -d tests/integration && test -d examples/example-app && echo "All directories present"
```
</verification>

<success_criteria>
- `package.json` passes all acceptance criteria from Task 1 (name, license, engines, peerDeps, exports, scripts)
- `tsconfig.json` matches D-15 spec exactly (ES2020, ESNext, bundler, strict, declaration, declarationMap, excludes test files)
- `src/index.ts` exists with at least one export
- `tests/integration/` directory exists with `.gitkeep`
- `examples/example-app/` directory exists with `.gitkeep`
- `LICENSE` contains MIT text with 2026 copyright
- `express` does not appear in `dependencies` or `devDependencies`
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundation-tooling/01-01-SUMMARY.md` following the summary template.
</output>
