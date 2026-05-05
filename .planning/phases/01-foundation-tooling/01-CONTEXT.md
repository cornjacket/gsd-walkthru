# Phase 1: Foundation & Tooling - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Greenfield TypeScript project scaffold: dual CJS/ESM build via tsup, Vitest test runner wired up so a placeholder smoke test passes on `npm test`, Biome lint+format, GitHub Actions CI matrix covering Node 20/22/24 × Express 4.x/5.x, and `package.json` with `express` declared as a `peerDependency` only.

Goal: a reviewer cloning the repo gets a working TypeScript build, a working test runner, and green CI on day one. Every later phase ships code + tests in the same commit on top of this scaffold.

</domain>

<decisions>
## Implementation Decisions

### Tooling

- **D-01: Lint/format = Biome.** Single tool replacing ESLint+Prettier. One `biome.json`, one CI step. Locked because this is a small library with no need for the ESLint plugin ecosystem and CI minutes are worth optimizing.
- **D-02: Test runner = Vitest.** Locked upstream by ROADMAP.md success criterion 5 ("the test runner (Vitest, unless STACK.md says otherwise) is wired up") and STACK.md's recommendation. No re-decision needed.
- **D-03: Build = tsup.** Locked by STACK.md. Produces dual CJS/ESM with `.d.ts` from a single config; emits `dist/index.cjs`, `dist/index.js`, `dist/index.d.ts`.

### Test Layout

- **D-04: Co-located unit tests in `src/`.** Pattern is `src/crypto/hmac.ts` + `src/crypto/hmac.test.ts` side by side. This convention is set in Phase 1 and applies to every later phase since Phases 2–5 ship tests alongside the code they introduce.
- **D-05: `tests/integration/` reserved for Phase 6 Supertest suite.** Integration tests do not co-locate with `src/`; they sit in a top-level `tests/integration/` folder so the Phase 6 coverage gate and the Supertest harness have a clean home.
- **D-06: tsup must exclude `**/*.test.ts` from the `dist/` build.** Tests live next to source but never ship in published artifacts. tsconfig `exclude` and tsup `entry` filters must both enforce this.

### CI Matrix

- **D-07: Full Node × Express cross-product.** GitHub Actions runs the test job across Node 20.x, 22.x, 24.x × Express 4.21.x and 5.x = **6 jobs**. Highest signal: catches any Express-version-specific bug on any Node version. ROADMAP success criterion 3 reads as a cross-matrix and this delivers it directly.
- **D-08: CI runs `biome check`, `tsup` build, and `vitest run` per matrix cell.** Three sequential steps after `npm ci`. No separate "lint" job — keep the topology flat.

### Repo Shape & Identity

- **D-09: Single package at repo root.** No npm workspaces, no monorepo. The Phase 7 example app lives at `examples/example-app/` with its own `package.json` that declares `"express-webhook-validator": "file:../.."` as a dependency.
- **D-10: Package name = `express-webhook-validator`.** Matches PROJECT.md title; signals Express-first positioning without a scope. Even though v1 does not publish, this name appears on the first scroll of `package.json` and reads as portfolio-shippable.
- **D-11: License = MIT.** Standard for a portfolio TypeScript library; lowest-friction for reviewers.
- **D-12: `engines.node = ">=20.0.0"`.** Matches the lowest LTS in the CI matrix.

### Dependencies (locked from STACK.md)

- **D-13: `express` is a `peerDependency` only**, range `"4.x || 5.x"`. Not in `dependencies`, not in `devDependencies` for runtime use. (FOUND-04 directly.)
- **D-14: No vendor SDKs.** No `stripe`, no `@octokit/webhooks`, no Shopify SDK. Crypto comes from Node's built-in `crypto` module exclusively.
- **D-15: TypeScript 6.x; tsconfig uses `target: ES2020`, `module: ESNext`, `moduleResolution: "bundler"`, `strict: true`, `declaration: true`, `declarationMap: true`.** Per STACK.md.

### Claude's Discretion

- Exact tsup config flags (sourcemap, minify, treeshake) — planner picks STACK.md defaults unless they conflict with success criteria.
- Biome rule strictness preset (recommended vs all-strict) — planner picks `recommended` and may opt into a few additional groups; not worth a checkpoint.
- Smoke test contents — placeholder shape (`expect(true).toBe(true)` or one trivial import-from-`src/index.ts` assertion) is fine; the test exists to prove the runner works, not to test logic.
- README seed — Phase 1 may include a minimal stub README so the repo isn't naked, but the polished README is owned by Phase 7.
- `.gitignore` / `.npmignore` content — standard Node patterns.
- Pre-commit hooks — none required for Phase 1; optional for the planner to add `simple-git-hooks` or similar if it costs little.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-Level
- `.planning/PROJECT.md` — Core value, constraints, and key decisions for the whole project (Express-first, no vendor SDKs, no built-in dedup store).
- `.planning/REQUIREMENTS.md` — v1 requirements; Phase 1 owns FOUND-01..FOUND-04.
- `.planning/ROADMAP.md` — Phase 1 goal, success criteria, dependency chain. Note the "co-located testing" tradeoff statement in the Overview.

### Phase 1 Tooling Research
- `.planning/research/STACK.md` — **Primary technical reference.** Locks TypeScript 6.x, Vitest 4.x, tsup, Biome 2.x, Node 20/22/24 LTS. Includes tsconfig template, tsup config template, package.json `exports` map template, and the GitHub Actions CI YAML pattern. Planner should treat this as the source of truth for stack-level configuration values.

### Project-wide Pitfalls
- `.planning/research/PITFALLS.md` — General webhook-validation pitfalls; mostly relevant to later phases but worth scanning so Phase 1 scaffolding decisions don't preclude solutions to later problems (e.g., raw-body capture).
- `.planning/research/ARCHITECTURE.md` — Reference architecture for the middleware; informs the `src/` directory layout that Phase 1 establishes.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None. Greenfield repo — no existing source. Phase 1 creates the entire scaffold from scratch.

### Established Patterns
- `.planning/` directory is the only existing tree. The new `src/`, `tests/`, `examples/`, `dist/`, and `.github/` trees will be siblings to it.
- Repo root already has a `.git/` and `.claude/` (Claude Code session config); these stay untouched.

### Integration Points
- The `examples/example-app/` directory is created in Phase 1 (empty placeholder is fine) so its `package.json` `file:` dependency path is valid; Phase 7 fills in the actual server code.
- The `src/index.ts` barrel file is created in Phase 1 with a single placeholder export; Phase 2 starts populating it (`computeHmac`, `WebhookValidationError`).

</code_context>

<specifics>
## Specific Ideas

- **CI matrix shape preference:** user explicitly chose the full 3×2 cross-product over the split-jobs pattern STACK.md exemplifies. Planner: do NOT split into two GitHub Actions jobs; keep one matrix block.
- **Test layout preference:** user explicitly chose co-located over `tests/unit/` mirrored tree. Planner: do NOT create `tests/unit/`; only `tests/integration/` (Phase 6 will populate it).
- **Biome over ESLint+Prettier:** user explicitly accepted the Biome recommendation. Planner: do NOT scaffold `eslint.config.js` or `.prettierrc` — Biome only.

</specifics>

<deferred>
## Deferred Ideas

- **npm publishing pipeline (release-please / changesets).** Tracked as v2 requirement DIST-01 in REQUIREMENTS.md. Phase 1 sets up `package.json` so publishing is *possible* later (correct `exports`, `files`, `peerDependencies`), but does not configure a release workflow.
- **Pre-commit hooks (`simple-git-hooks` / `lefthook`).** Could enforce Biome on staged files locally; not blocking CI which already runs Biome. Consider adding in a future polish phase if the project picks up contributors.
- **Renovate / Dependabot config.** Useful for a long-lived published library; overkill for v1 portfolio scope.
- **README badges (CI status, npm version, license).** Belongs in Phase 7 with the polished README.

</deferred>

---

*Phase: 1-Foundation & Tooling*
*Context gathered: 2026-05-05*
