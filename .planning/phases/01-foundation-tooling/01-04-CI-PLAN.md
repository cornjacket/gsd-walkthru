---
phase: "01-foundation-tooling"
plan: "04"
type: execute
wave: 3
depends_on:
  - "01-02"
  - "01-03"
files_modified:
  - .github/workflows/test.yml
autonomous: true
requirements:
  - FOUND-02
  - FOUND-03

must_haves:
  truths:
    - "CI uses a single matrix job covering Node 20/22/24 × Express 4.21.x/5.x = 6 jobs (D-07)"
    - "Each matrix cell runs biome check, tsup build, and vitest run — in that order (D-08)"
    - "CI uses npm ci (not npm install) to enforce lockfile (supply chain)"
    - "Express version is installed per-cell via 'npm install express@${{ matrix.express-version }}' after npm ci (D-07)"
    - "Workflow triggers on push and pull_request (standard CI)"
    - "There is one job named 'test' with a matrix — not two separate jobs (D-07 explicit: single matrix block, not split jobs)"
    - "ROADMAP success criterion 3: CI reports green on the default branch with the full 3x2 matrix"
    - "ROADMAP success criterion 2 (CI enforcement): biome check step runs in every matrix cell (D-08)"
  artifacts:
    - path: ".github/workflows/test.yml"
      provides: "GitHub Actions CI workflow — full 3x2 matrix"
      contains: "matrix"
  key_links:
    - from: ".github/workflows/test.yml matrix.node-version"
      to: "[20.x, 22.x, 24.x]"
      via: "strategy.matrix"
      pattern: "node-version.*20"
    - from: ".github/workflows/test.yml matrix.express-version"
      to: "[4.21.x, 5.x]"
      via: "strategy.matrix"
      pattern: "express-version.*4\\.21"
    - from: "CI step: install express version"
      to: "npm install express@${{ matrix.express-version }}"
      via: "run step after npm ci"
      pattern: "npm install express@"
---

<objective>
Create the GitHub Actions CI workflow with the full 3×2 Node/Express matrix — a single matrix job, not split jobs.

Purpose: ROADMAP success criterion 3 requires green CI across Node 20/22/24 × Express 4.21.x/5.x on the default branch. This plan delivers the workflow file; it works immediately because Plans 02 and 03 created the scripts it calls.

Output:
- `.github/workflows/test.yml` — single matrix job, 6 cells, steps: checkout → setup-node → npm ci → install express → biome check → tsup build → vitest run
</objective>

<execution_context>
@/home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru/.claude/get-shit-done/workflows/execute-plan.md
@/home/taylor_david_ray/src/github.com/cornjacket/ai-sandbox/gsd-walkthru/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-foundation-tooling/01-CONTEXT.md
@.planning/research/STACK.md
@.planning/phases/01-foundation-tooling/01-02-SUMMARY.md
@.planning/phases/01-foundation-tooling/01-03-SUMMARY.md
</context>

<interfaces>
<!-- Scripts from package.json that the CI workflow calls. Created in Plans 02 and 03. -->

```json
{
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "lint": "biome check ."
  }
}
```

The CI workflow calls `npm run lint`, `npm run build`, and `npm test` in sequence. All three scripts must exist before this workflow runs.
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Create .github/workflows/test.yml with 3×2 matrix</name>
  <files>.github/workflows/test.yml</files>
  <read_first>
    - .planning/phases/01-foundation-tooling/01-CONTEXT.md (D-07: full 3×2 matrix, NOT split jobs; D-08: biome check + tsup + vitest per cell)
    - .planning/research/STACK.md (GitHub Actions CI configuration section — use as reference but adapt to D-07 single-matrix requirement)
  </read_first>
  <action>
**IMPORTANT:** The STACK.md CI template shows TWO separate jobs (`test` + `test-express-versions`). The user explicitly rejected that pattern in CONTEXT.md D-07 and the `<specifics>` section. Create ONE job named `test` with a 3×2 cross-product matrix.

Create the `.github/` and `.github/workflows/` directories, then write `.github/workflows/test.yml`:

```yaml
name: Test

on:
  push:
    branches: ["**"]
  pull_request:
    branches: ["**"]

jobs:
  test:
    name: "Node ${{ matrix.node-version }} / Express ${{ matrix.express-version }}"
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node-version: [20.x, 22.x, 24.x]
        express-version: ["4.21.x", "5.x"]

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Install Express ${{ matrix.express-version }}
        run: npm install express@${{ matrix.express-version }}

      - name: Lint (Biome check)
        run: npm run lint

      - name: Build (tsup)
        run: npm run build

      - name: Test (Vitest)
        run: npm test
```

Key decisions implemented:
- **D-07: Single matrix job** — one `jobs.test` entry with `strategy.matrix`. The cross-product of `[20.x, 22.x, 24.x]` × `["4.21.x", "5.x"]` produces exactly 6 jobs. NOT two separate jobs.
- **D-08: Three steps per cell** — `npm run lint` (Biome), `npm run build` (tsup), `npm test` (Vitest) in that order. Biome runs first so a lint failure stops early without wasting build+test time.
- **Express install after npm ci** — `npm ci` installs devDependencies but not Express (it is a peerDependency). The `npm install express@${{ matrix.express-version }}` step adds the specific Express version for that matrix cell, overwriting any cached version.
- **`fail-fast: false`** — All 6 cells run even if one fails. This provides full signal across the matrix when investigating a failure.
- **`cache: "npm"`** — Caches the npm cache directory per Node version. Speeds up `npm ci`.
- **`actions/checkout@v4` and `actions/setup-node@v4`** — Latest stable versions as of 2026.
- **`on: push/pull_request` with `branches: ["**"]`** — CI runs on all branches and all PRs. Broad coverage for a solo project.

After creating the file, verify its YAML structure is valid:
```bash
mkdir -p .github/workflows
# (file creation above)
# Validate YAML is well-formed:
node -e "
const fs = require('fs');
const content = fs.readFileSync('.github/workflows/test.yml', 'utf8');
console.log('File size:', content.length, 'bytes');
console.log('Contains node-version matrix:', content.includes('[20.x, 22.x, 24.x]'));
console.log('Contains express-version matrix:', content.includes('4.21.x'));
console.log('Contains biome step:', content.includes('biome'));
console.log('Contains tsup step:', content.includes('npm run build'));
console.log('Contains vitest step:', content.includes('npm test'));
"
```
  </action>
  <verify>
    <automated>test -f .github/workflows/test.yml && node -e "const c=require('fs').readFileSync('.github/workflows/test.yml','utf8'); console.assert(c.includes('[20.x, 22.x, 24.x]'),'node matrix missing'); console.assert(c.includes('4.21.x'),'express 4.21.x missing'); console.assert(c.includes('5.x'),'express 5.x missing'); console.assert(c.includes('npm run lint'),'lint step missing'); console.assert(c.includes('npm run build'),'build step missing'); console.assert(c.includes('npm test'),'test step missing'); console.assert(c.includes('npm ci'),'npm ci missing'); console.assert(c.includes('npm install express@'),'express install step missing'); console.assert(!c.includes('test-express-versions'),'split job pattern found - must be single job'); console.log('workflow OK')"</automated>
  </verify>
  <acceptance_criteria>
    - `.github/workflows/test.yml` exists
    - `strategy.matrix.node-version` includes `20.x`, `22.x`, and `24.x`
    - `strategy.matrix.express-version` includes `"4.21.x"` and `"5.x"`
    - Workflow contains `npm ci` step (not `npm install`)
    - Workflow contains `npm install express@${{ matrix.express-version }}` step after `npm ci`
    - Workflow contains `npm run lint` step
    - Workflow contains `npm run build` step
    - Workflow contains `npm test` step
    - There is exactly ONE job named `test` — NOT two jobs named `test` and `test-express-versions`
    - `fail-fast: false` is set on the matrix strategy
    - `actions/checkout@v4` and `actions/setup-node@v4` are used
  </acceptance_criteria>
  <done>GitHub Actions workflow created with single 3×2 matrix job. All 6 cells run biome check, tsup build, and vitest run. Express version installed per-cell after npm ci.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Verify CI turns green on default branch</name>
  <what-built>
    The GitHub Actions workflow at `.github/workflows/test.yml` runs on push to any branch.
    Plans 01-03 established the scaffold, build, test runner, and Biome lint.
    After committing all Phase 1 files and pushing, CI should run all 6 matrix cells and report green.
  </what-built>
  <how-to-verify>
    1. Commit all Phase 1 files (Plans 01-03 outputs + this workflow file):
       ```bash
       git add package.json tsconfig.json .gitignore LICENSE src/ tests/ examples/ tsup.config.ts vitest.config.ts biome.json .github/ package-lock.json
       git commit -m "feat(phase-1): foundation & tooling scaffold"
       git push
       ```
    2. Navigate to your GitHub repository → Actions tab
    3. Find the "Test" workflow run triggered by the push
    4. Confirm the matrix shows 6 jobs:
       - Node 20.x / Express 4.21.x
       - Node 20.x / Express 5.x
       - Node 22.x / Express 4.21.x
       - Node 22.x / Express 5.x
       - Node 24.x / Express 4.21.x
       - Node 24.x / Express 5.x
    5. All 6 jobs should show green checkmarks
    6. Click into any cell and verify the three steps ran: "Lint (Biome check)", "Build (tsup)", "Test (Vitest)"
  </how-to-verify>
  <resume-signal>
    Type "CI green" when all 6 matrix cells pass.
    If any cell fails, paste the failing step's output and describe which Node/Express combination failed.
  </resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GitHub Actions runner → npm registry | CI calls `npm ci` (lockfile-validated) and `npm install express@version`. Both reach out to the registry on each run. |
| Workflow file → GitHub Actions environment | The `.yml` file defines the CI environment; a malformed or compromised workflow file could expose secrets or run arbitrary code. |
| CI environment → repo secrets | Phase 1 has no secrets (no publishing, no deployment). The workflow reads no `secrets.*` values. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-01 | Tampering | Supply chain — `npm install express@...` installs unvetted version | mitigate | Express version is explicitly pinned per matrix cell (`4.21.x` and `5.x`). `npm ci` is used for all other deps (lockfile-verified). The Express install is a known, scoped override — only the Express package changes. |
| T-04-02 | Information Disclosure | CI workflow accidentally exposes repo secrets | accept | Phase 1 workflow has no `secrets.*` references. No env vars with credentials. No deployment steps. Risk accepted: zero secrets in scope. |
| T-04-03 | Tampering | Lockfile drift — `npm install express@` modifies package-lock.json in CI | accept | The `package-lock.json` changes in the CI runner but is not committed back to the repo. Drift exists only within a single CI run and does not persist. Acceptable for a dev matrix scenario. |
| T-04-04 | Denial of Service | Flaky test in a single matrix cell blocks entire CI run | mitigate | `fail-fast: false` ensures all 6 cells complete even if one fails. This provides full diagnostic signal instead of early abort. |
| T-04-05 | Elevation of Privilege | Malicious PR modifying workflow to exfiltrate secrets | accept | This is a personal portfolio project with no external contributors. No org-level secret access to protect. Risk accepted for solo project context. |
</threat_model>

<verification>
After Task 1 completes, local verification before pushing:

```bash
# Confirm workflow file structure
test -f .github/workflows/test.yml && echo "file exists"

# Confirm matrix dimensions
node -e "
const c = require('fs').readFileSync('.github/workflows/test.yml', 'utf8');
const hasNode20 = c.includes('20.x');
const hasNode22 = c.includes('22.x');
const hasNode24 = c.includes('24.x');
const hasExpress4 = c.includes('4.21.x');
const hasExpress5 = c.includes(\"5.x\");
const hasBiome = c.includes('npm run lint');
const hasBuild = c.includes('npm run build');
const hasTest = c.includes('npm test');
const hasNpmCi = c.includes('npm ci');
const hasExpressInstall = c.includes('npm install express@');
const hasSplitJob = c.includes('test-express-versions');
console.log({hasNode20,hasNode22,hasNode24,hasExpress4,hasExpress5,hasBiome,hasBuild,hasTest,hasNpmCi,hasExpressInstall,noSplitJob:!hasSplitJob});
"

# Confirm all Phase 1 scripts still work locally before pushing
npm run lint && npm run build && npm test && echo "All local checks pass"
```
</verification>

<success_criteria>
ROADMAP success criterion 2 (CI enforcement): `npm run lint` runs in every CI matrix cell via the Biome check step.
ROADMAP success criterion 3: GitHub Actions CI runs across Node 20, 22, 24 × Express 4.21.x, 5.x (6 cells) and reports green on the default branch.
D-07: Single matrix job with full 3×2 cross-product — not two separate jobs.
D-08: Steps per cell are biome check → tsup build → vitest run.
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundation-tooling/01-04-SUMMARY.md` following the summary template.
</output>
