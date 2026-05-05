---
phase: "01-foundation-tooling"
plan: "03"
type: execute
wave: 2
depends_on:
  - "01-01"
files_modified:
  - biome.json
  - package.json
autonomous: true
requirements:
  - FOUND-03

must_haves:
  truths:
    - "biome.json exists and configures Biome 2.x recommended rules (D-01)"
    - "npm run lint runs 'biome check .' and exits 0 on a clean repo (ROADMAP success criterion 2)"
    - "npm run format runs 'biome format --write .' (D-01)"
    - "No eslint.config.js, .eslintrc, or .prettierrc files exist (D-01 — Biome replaces both)"
    - "Biome is installed as a devDependency (@biomejs/biome)"
    - "npm run lint fails on a deliberately malformed file (ROADMAP success criterion 2)"
  artifacts:
    - path: "biome.json"
      provides: "Biome lint + format configuration"
      contains: "recommended"
    - path: "package.json"
      provides: "Updated devDependencies with @biomejs/biome"
      contains: "@biomejs/biome"
  key_links:
    - from: "package.json scripts.lint"
      to: "biome check ."
      via: "npm run lint"
      pattern: "\"lint\".*biome check"
    - from: "package.json scripts.format"
      to: "biome format --write ."
      via: "npm run format"
      pattern: "\"format\".*biome format"
---

<objective>
Install Biome and configure lint/format so `npm run lint` and `npm run format` work on a clean checkout, and `npm run lint` fails on a deliberately malformed file.

Purpose: Phase 1 success criterion 2 requires both a passing lint and a demonstrable failure on bad code. This plan delivers both.

Output:
- `biome.json` — Biome configuration with `recommended` rules
- `@biomejs/biome` added to `package.json` devDependencies
- Verified: `npm run lint` exits 0 on clean repo AND exits non-zero on a malformed temp file
</objective>

<execution_context>
@/home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru/.claude/get-shit-done/workflows/execute-plan.md
@/home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-foundation-tooling/01-CONTEXT.md
@.planning/research/STACK.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install Biome and create biome.json</name>
  <files>biome.json, package.json</files>
  <read_first>
    - .planning/phases/01-foundation-tooling/01-CONTEXT.md (D-01 — Biome over ESLint+Prettier; deferred: no pre-commit hooks)
    - .planning/research/STACK.md (Biome 2.4.14+ section — "unified lint + format" variant)
  </read_first>
  <action>
**Step 1 — Install Biome:**
```bash
npm install -D @biomejs/biome
```

Version constraint: STACK.md specifies `@biomejs/biome 2.4.14+`. The unversioned `npm install -D @biomejs/biome` will install the latest 2.x which meets this constraint.

Do NOT install `eslint`, `prettier`, `@eslint/js`, `typescript-eslint`, or `eslint-config-prettier`. Biome is the single tool per D-01.

**Step 2 — Create `biome.json`:**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.14/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingCommas": "es5"
    }
  },
  "files": {
    "ignore": [
      "node_modules",
      "dist",
      "coverage",
      ".planning"
    ]
  }
}
```

Design rationale (per D-01 "Claude's Discretion" on rule strictness):
- `"recommended": true` — uses Biome's recommended ruleset; appropriate for a library project without custom organizational rules
- `indentStyle: "space"`, `indentWidth: 2` — standard TypeScript library convention
- `lineWidth: 100` — slightly wider than Prettier's 80 default; practical for TypeScript generic types
- `quoteStyle: "single"` — consistent with TypeScript community standard
- `trailingCommas: "es5"` — avoids trailing commas in function params (cleaner diffs)
- `files.ignore` includes `.planning` — planning docs are Markdown, not subject to JS/TS linting

**Step 3 — Verify biome.json is valid and lint passes:**
```bash
npx biome check .
```
Expected: exits 0 with no errors on the clean scaffold.

**Step 4 — Verify no ESLint or Prettier files exist:**
```bash
test ! -f eslint.config.js && test ! -f .eslintrc && test ! -f .eslintrc.json && test ! -f .prettierrc && test ! -f .prettierrc.json && echo "No ESLint/Prettier files — correct"
```
  </action>
  <verify>
    <automated>test -f biome.json && node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); console.assert(p.devDependencies['@biomejs/biome'],'@biomejs/biome missing from devDeps'); console.log('biome in devDeps OK')" && npx biome check . && echo "biome check passes"</automated>
  </verify>
  <acceptance_criteria>
    - `biome.json` exists
    - `biome.json` contains `"recommended": true` under `linter.rules`
    - `package.json devDependencies` contains `@biomejs/biome`
    - `eslint.config.js` does NOT exist
    - `.eslintrc` and `.eslintrc.json` do NOT exist
    - `.prettierrc` and `.prettierrc.json` do NOT exist
    - `npx biome check .` exits 0 on the clean scaffold
    - `npm run lint` exits 0 (same as above, via package.json script)
  </acceptance_criteria>
  <done>Biome installed. biome.json created with recommended rules, ignore patterns for dist/ and .planning/. npm run lint exits 0 on clean repo.</done>
</task>

<task type="auto">
  <name>Task 2: Verify lint failure on malformed file</name>
  <files>src/index.ts</files>
  <read_first>
    - .planning/ROADMAP.md (Phase 1 success criterion 2: "fail on a deliberately malformed file")
  </read_first>
  <action>
ROADMAP success criterion 2 requires that `npm run lint` demonstrably fails on a malformed file. This task creates a temporary malformed file, verifies lint catches it, then removes it.

**Step 1 — Create a temporary malformed TypeScript file:**

Create `src/_lint_test_malformed.ts` with a known Biome lint violation — an unused variable, which triggers Biome's `noUnusedVariables` rule from the recommended ruleset:

```typescript
// This file exists only to verify Biome lint catches violations.
// It will be deleted immediately after verification.
const unusedVar = 'this variable is declared but never used'
```

**Step 2 — Verify lint catches it (exits non-zero):**
```bash
npx biome check src/_lint_test_malformed.ts
```
Expected: exits non-zero with an error about `unusedVar` being unused.

If the `noUnusedVariables` rule is not triggering (Biome version difference), use this alternative that triggers a more fundamental formatter check — mismatched quote style:
```typescript
var unusedVar = "double quotes when single are configured"
var anotherUnused = "also unused"
```
Either `var` usage or `noUnusedVariables` will trigger Biome's recommended rules.

**Step 3 — Remove the malformed file immediately:**
```bash
rm src/_lint_test_malformed.ts
```

**Step 4 — Verify clean lint still passes after deletion:**
```bash
npm run lint
```
Expected: exits 0.

**Step 5 — Confirm scripts in package.json:**
```bash
node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); console.assert(p.scripts.lint==='biome check .','lint script wrong'); console.assert(p.scripts.format==='biome format --write .','format script wrong'); console.log('scripts OK')"
```

Note: The malformed file is created and destroyed within this task — it never persists to the repository. The acceptance criterion is the observed non-zero exit code from Step 2, documented in the task output/SUMMARY.
  </action>
  <verify>
    <automated>npm run lint && echo "lint passes on clean repo" && (node -e "const {execSync}=require('child_process'); require('fs').writeFileSync('src/_lint_test_malformed.ts','const x = 1\n'); try{execSync('npx biome check src/_lint_test_malformed.ts',{stdio:\"pipe\"});console.error('ERROR: lint should have failed');process.exit(1)}catch(e){console.log('lint correctly failed on malformed file')}finally{require('fs').unlinkSync('src/_lint_test_malformed.ts')}")</automated>
  </verify>
  <acceptance_criteria>
    - `npm run lint` exits 0 on the clean repo (no malformed files present)
    - `npm run format` is defined in package.json as `"biome format --write ."`
    - `npx biome check src/_lint_test_malformed.ts` exits non-zero when the malformed file exists (verified inline, file removed after)
    - `src/_lint_test_malformed.ts` does NOT exist in the repo after this task (it is created and removed inline)
    - `package.json scripts.lint` equals `"biome check ."`
    - `package.json scripts.format` equals `"biome format --write ."`
  </acceptance_criteria>
  <done>Lint failure on malformed file verified. Temp file removed. Clean lint passes. Both scripts confirmed in package.json.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| npm registry → @biomejs/biome | Biome binary downloaded from registry; controls static analysis of all source files |
| CI → biome check | Plan 04 runs `biome check` in every matrix cell; a misconfigured biome.json could silently skip files |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-01 | Tampering | biome.json `files.ignore` silently excluding too many paths | mitigate | Acceptance criteria verify `npx biome check .` actually runs (exits 0 AND catches the malformed file). If ignore is too broad, the malformed-file test would pass when it shouldn't — the test catches both over-ignoring and under-ignoring. |
| T-03-02 | Information Disclosure | ESLint/Prettier config files accidentally created | mitigate | Task 1 Step 4 explicitly asserts that `eslint.config.js`, `.eslintrc`, `.prettierrc` do not exist. Prevents accidental dual-config that could mask real lint errors. |
| T-03-03 | Tampering | CI secrets in lint output | accept | Biome lint does not execute code; it analyzes source statically. No secrets are exposed through lint output. Accepted: no action needed. |
| T-03-04 | Denial of Service | Biome crashing on a future .ts file with a syntax error | accept | Biome treats parse errors as lint errors and continues checking other files. Acceptable behavior — CI will catch it and block the merge. |
</threat_model>

<verification>
After both tasks complete:

```bash
# Full lint pass
npm run lint

# Verify scripts are correct
node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('lint:', p.scripts.lint, '| format:', p.scripts.format)"

# Verify Biome is installed
node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('@biomejs/biome:', p.devDependencies['@biomejs/biome'])"

# Verify no ESLint/Prettier artifacts
test ! -f eslint.config.js && test ! -f .prettierrc && echo "No ESLint/Prettier — correct"

# Verify biome.json ignores the right paths
node -e "const b=JSON.parse(require('fs').readFileSync('biome.json','utf8')); console.log('ignore:', b.files.ignore)"
```
</verification>

<success_criteria>
ROADMAP success criterion 2 (partial — CI enforcement is Plan 04):
- `npm run lint` exits 0 on a clean checkout
- `npm run lint` exits non-zero when a file with a known lint violation is present (verified inline)
- `npm run format` is wired and defined
- No ESLint or Prettier configuration files exist
- `@biomejs/biome` is in devDependencies
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundation-tooling/01-03-SUMMARY.md` following the summary template.
</output>
