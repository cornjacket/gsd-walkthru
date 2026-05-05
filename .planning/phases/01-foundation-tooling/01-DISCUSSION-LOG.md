# Phase 1: Foundation & Tooling - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 1-Foundation & Tooling
**Areas discussed:** Lint/format tooling, Test file layout, CI matrix shape, Repo shape & package name

---

## Lint/format tooling

| Option | Description | Selected |
|--------|-------------|----------|
| Biome | Single binary, single biome.json, ~10–25× faster than ESLint+Prettier. STACK.md's pick for greenfield 2026 projects. One CI step instead of two. | ✓ |
| ESLint flat + Prettier | Separate eslint.config.js and .prettierrc, plus eslint-config-prettier glue. Slower but huge plugin ecosystem if you need niche rules later. | |
| Let Claude decide | Default to Biome since this is a small library with no need for the ESLint plugin ecosystem. | |

**User's choice:** Biome
**Notes:** User accepted the recommendation directly. STACK.md's primary rationale (single tool, faster CI, no Prettier/ESLint conflict glue) drove the framing.

---

## Test file layout

| Option | Description | Selected |
|--------|-------------|----------|
| Co-located in src/ | src/crypto/hmac.ts + src/crypto/hmac.test.ts side by side. Tests are easy to find from the implementation; matches the roadmap's 'co-located testing' framing. | ✓ |
| Mirrored tests/ tree | All tests under tests/unit/ mirroring src/. Cleaner src/ tree; build-time excludes are simpler; less common in modern TS libraries. | |
| Hybrid: __tests__ folders | src/crypto/__tests__/hmac.test.ts pattern. Compromise between the two; common in Jest projects but uncommon in modern Vitest libraries. | |

**User's choice:** Co-located in src/
**Notes:** User selected with the side-by-side preview shown. This convention is set in Phase 1 and applies to every subsequent phase since Phases 2–5 ship tests alongside code. tsup and tsconfig must explicitly exclude `**/*.test.ts` from build emit.

---

## CI matrix shape

| Option | Description | Selected |
|--------|-------------|----------|
| Full cross-product | Node 20/22/24 × Express 4.21.x/5.x = 6 jobs. Highest signal: catches any Express-version-specific bug on any Node version. ROADMAP success criterion 3 reads as a cross-matrix. | ✓ |
| Split: 3-Node main + 2-Express compat | Main matrix: Node 20/22/24 on latest Express (3 jobs). Compat job: Node 20 × Express 4 vs 5 (2 jobs). Total 5 jobs, slightly less coverage. STACK.md's CI example uses this pattern. | |
| Minimal: 3 jobs | Just Node 20/22/24 against the latest Express. Skip Express 4 compat in CI; rely on tests passing locally. Cheapest but doesn't satisfy ROADMAP success criterion 3. | |

**User's choice:** Full cross-product (6 jobs)
**Notes:** User explicitly preferred coverage over CI minute optimization. Planner should NOT split into two GitHub Actions jobs the way STACK.md's example YAML demonstrates — one matrix block with both `node-version` and `express-version` axes.

---

## Repo shape

| Option | Description | Selected |
|--------|-------------|----------|
| Single package + examples/ | One package.json at root. Phase 7 example app at examples/example-app/ with file: dependency on the parent. Simpler tooling, simpler publish story. | ✓ |
| Monorepo with workspaces | npm workspaces with packages/middleware/ and examples/example-app/. More flexibility (could add a CLI later) but more tooling overhead and CI complexity for a v1 portfolio project. | |

**User's choice:** Single package + examples/
**Notes:** Confirms the simpler topology. Phase 1 still creates the empty `examples/example-app/` directory so the eventual `file:../..` dependency path resolves; Phase 7 fills in the server code.

---

## Package name

| Option | Description | Selected |
|--------|-------------|----------|
| express-webhook-validator | Direct, descriptive, matches PROJECT.md's title. Easy to grep; clear positioning. | ✓ |
| @cornjacket/webhook-validator | Scoped under your GitHub org/handle. Signals portfolio ownership; reserves the name if you ever publish. | |
| webhook-validator | Shortest. Reads cleanest in import statements but doesn't telegraph the Express-first positioning. | |

**User's choice:** express-webhook-validator
**Notes:** Even though v1 does not publish, the name appears prominently in package.json and serves the portfolio-shippable framing.

---

## Claude's Discretion

- Exact tsup config flags (sourcemap, minify, treeshake) — planner picks STACK.md defaults.
- Biome rule strictness preset — planner picks `recommended`, may opt into a few additional groups.
- Smoke test contents — trivial placeholder; the test exists to prove the runner works.
- README seed — minimal stub OK in Phase 1; polished README is owned by Phase 7.
- `.gitignore` / `.npmignore` content — standard Node patterns.
- Pre-commit hooks — not required; optional add if cheap.

## Deferred Ideas

- **npm publishing pipeline (release-please / changesets)** — Tracked as v2 (DIST-01); Phase 1 sets up the `package.json` shape so this is possible later but does not configure release workflow.
- **Pre-commit hooks (`simple-git-hooks` / `lefthook`)** — Optional polish; CI already enforces Biome.
- **Renovate / Dependabot config** — Useful for a published library; overkill for v1 portfolio scope.
- **README badges (CI status, npm version, license)** — Belongs in Phase 7 polish.
