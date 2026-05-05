---
phase: 01-foundation-tooling
reviewed: 2026-05-05T21:45:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - .github/workflows/test.yml
  - biome.json
  - package.json
  - src/index.test.ts
  - src/index.ts
  - tsconfig.json
  - tsup.config.ts
  - vitest.config.ts
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-05-05T21:45:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 1 ships a working scaffold: `npm run lint`, `npm run build`, and `npm test` all succeed locally on the reviewed tree, the dual CJS/ESM build is emitted as specified, the placeholder smoke test passes, and the CI matrix shape matches D-07 (single 3x2 job, six cells, fail-fast disabled, no split jobs). No security-critical defects (no secrets, no dangerous APIs, no injection vectors in build/CI).

That said, several configuration choices weaken the guarantees the plan tried to lock in, and a few would silently bite later phases:

1. **`@types/node@^25.6.0` is a major-version mismatch with `engines.node = ">=20.0.0"`.** Library code will type-check against Node 25 APIs even though it is required to run on Node 20. This defeats the type-level half of the engines contract and can hide real Node-20 incompatibilities until they hit CI runtime — exactly the failure mode the matrix was meant to catch.
2. **`@types/express@^5.0.6` is pinned to v5 only**, but `peerDependencies.express = "4.x || 5.x"`. Phase 2+ will write middleware against Express 5 types while claiming Express 4 support; v4-only signature differences (e.g., `req.app.get('env')` semantics, `Router` typing changes) will not surface during local development.
3. **`tsconfig.json` adds `"ignoreDeprecations": "6.0"` that the plan never specified and the project does not need.** Removing it leaves `tsc --noEmit` clean on TS 6.0.3. It is silently suppressing future deprecation warnings — exactly the signal a downstream phase would want to see.
4. **D-06 explicitly required *both* tsconfig `exclude` and tsup `entry` to filter `**/*.test.ts`.** Only tsconfig enforces it. tsup currently relies on `entry: ['src/index.ts']` having no `*.test.ts` reachable through imports. The first time someone broadens `entry` to a glob (e.g., `src/**/*.ts` for multi-entry builds), tests will silently leak into `dist/`.
5. **The CI workflow has no `permissions:` block and no per-job `timeout-minutes`.** With default-permissive `GITHUB_TOKEN` settings, a future supply-chain compromise of any of the dev tools (tsup, biome, vitest, or any transitive dep) could push commits or open PRs from the runner. A 6-hour default timeout on a hung Vitest process burns matrix minutes for no signal.

The remainder are smaller defects and code-smell items called out below.

## Warnings

### WR-01: `@types/node` major version exceeds `engines.node` floor

**File:** `package.json:35`
**Issue:** `"@types/node": "^25.6.0"` provides type definitions for Node 25 APIs while `engines.node` declares `">=20.0.0"` and the CI matrix tests Node 20.x explicitly. TypeScript will accept code that calls Node 25-only APIs (or uses signatures that changed between v20 and v25), then those calls will fail at runtime on the Node 20 matrix cell. The compile-time contract no longer matches the runtime contract.
**Fix:** Pin `@types/node` to the lowest supported Node major, then upgrade only when `engines.node` is raised:
```json
"@types/node": "^20.0.0"
```
This is the standard practice for libraries publishing peer/engines ranges. It is also a one-line change with no impact on the placeholder code.

### WR-02: `@types/express` does not cover the declared peer range

**File:** `package.json:34`
**Issue:** `peerDependencies.express = "4.x || 5.x"` (D-13) advertises support for both Express 4 and 5, but `"@types/express": "^5.0.6"` ships only the v5 definitions. Phase 2 will start writing middleware against `Request`/`Response`/`NextFunction` from `@types/express@5`, which differs from `@types/express@4` (notably around `Router`, `req.body` typing under express v5's strict raw-body handling, and the v5 promise-rejection forwarding). Local type-checks will pass on signatures that are wrong on Express 4, and CI will only catch them at runtime — if at all, since Phase 1 has no Express-touching code yet.
**Fix:** Either type-test against the older types as well (preferred for a library claiming dual support) or document the gap. Practical approach: use `@types/express@^4` as a devDep and rely on Express 5's runtime compat, or add a typings-test step against both:
```json
"@types/express": "^4.17.21"
```
At minimum, raise this as a required action item in the Phase 2 plan so the choice is explicit rather than accidental.

### WR-03: `ignoreDeprecations: "6.0"` is unjustified and silently suppresses signal

**File:** `tsconfig.json:13`
**Issue:** The Phase 1 plan (`01-01-PACKAGE-SCAFFOLD-PLAN.md` D-15) does not list `ignoreDeprecations` and the executor added it without an entry in `01-01-SUMMARY.md`. Verified: removing the field leaves `tsc --noEmit` passing cleanly on TS 6.0.3. Its only effect is to hide deprecation warnings TypeScript would otherwise raise — exactly the kind of signal a tooling foundation phase wants to keep loud, especially since this option is itself flagged as deprecated in upstream TS docs.
**Fix:** Delete the line:
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
If a real deprecation warning *is* triggering (i.e., removal causes an error), update the offending option directly rather than suppress the warning — and document it in the summary.

### WR-04: tsup config does not enforce test-file exclusion (D-06 violation)

**File:** `tsup.config.ts:5`
**Issue:** D-06 in `01-CONTEXT.md` is explicit: "tsup must exclude `**/*.test.ts` from the `dist/` build. tsconfig `exclude` and tsup `entry` filters must both enforce this." Only the tsconfig side is implemented. The current `entry: ['src/index.ts']` works *only* because `src/index.ts` does not import a `.test.ts` file. The first time a future phase needs multi-entry output (e.g., `entry: ['src/index.ts', 'src/cli.ts']` or a glob), the second guard rail is missing and test code can ship to consumers — the exact threat T-01-03 in the plan's STRIDE register.
**Fix:** Use a glob with a negation, which tsup supports via tinyglobby:
```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/**/*.ts', '!src/**/*.test.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
});
```
Or, if Phase 1 wants to keep the explicit single-entry shape, add a comment plus an explicit safeguard in CI (e.g., `! ls dist/*.test.* 2>/dev/null`) so the invariant is enforced somewhere.

### WR-05: CI workflow has no `permissions:` block and no `timeout-minutes`

**File:** `.github/workflows/test.yml:9-12`
**Issue:** Two related hardening gaps:
1. No top-level or job-level `permissions:` block. The `GITHUB_TOKEN` falls back to the repo/org default, which on most accounts is `contents: write` (or worse, `write-all`). For a workflow that only needs to read source and run `npm`, this is more authority than required — and any compromised dev dep (tsup, biome, vitest, or transitive) executed during `npm run build`/`npm test` runs with that token.
2. No `timeout-minutes` on the job. A hung Vitest run consumes the GitHub default of 360 minutes (6 hours) per matrix cell, which on the 6-cell matrix is up to 36 hours of compute before failure.
**Fix:** Add both:
```yaml
jobs:
  test:
    name: "Node ${{ matrix.node-version }} / Express ${{ matrix.express-version }}"
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    strategy:
      fail-fast: false
      matrix:
        ...
```
`contents: read` is the minimum to checkout. `10` minutes is generous for a placeholder smoke test and tightens as the suite grows.

## Info

### IN-01: `branches: ["**"]` on both `push` and `pull_request` doubles CI runs on PRs

**File:** `.github/workflows/test.yml:3-7`
**Issue:** When a contributor pushes to a feature branch and then opens a PR for that branch, both the `push` event and the `pull_request` event fire, running the full 6-cell matrix twice for the same commit. For a solo project this is just wasted compute; for any external contributor scenario it doubles queue time.
**Fix:** Either restrict `push` to specific branches (`main`) so feature branches only run via PR:
```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: ["**"]
```
…or add a concurrency guard to cancel in-flight runs when a new commit lands:
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```
The concurrency form is the safer change since it preserves the "test every push" policy the plan implied.

### IN-02: `npm install express@<version>` mutates the lockfile mid-build

**File:** `.github/workflows/test.yml:32-33`
**Issue:** Running `npm install express@${{ matrix.express-version }}` after `npm ci` rewrites `package-lock.json` inside the runner. Today nothing else reads the lockfile, so it is benign (acknowledged as T-04-03 with disposition "accept"). The footgun is for future phases: any new step that runs `npm ci` *after* this point (e.g., to verify integrity, install fresh deps in a sub-project, or re-prime cache for a release step) will hard-fail with `EUSAGE` because the lockfile no longer matches `package.json`. This is the kind of trap that surfaces months later in an unrelated PR.
**Fix:** Use `--no-save` so the lockfile is untouched:
```yaml
- name: Install Express ${{ matrix.express-version }}
  run: npm install --no-save express@${{ matrix.express-version }}
```
This still installs the requested Express into `node_modules` but does not modify `package-lock.json`, eliminating the trap.

### IN-03: `biome.json` `useIgnoreFile: true` lets biome traverse non-source files

**File:** `biome.json:6,9-10`
**Issue:** With `useIgnoreFile: true`, Biome respects `.gitignore` (good) but `.gitignore` does not list `.github/`, `LICENSE`, `*.gitkeep`, or `*.sh`. Combined with `"ignoreUnknown": false`, running `biome check --verbose .` produces five warnings about files Biome cannot classify (`LICENSE`, `.gitkeep` x2, `.sh`, `.yml`). They are hidden at the default diagnostic level (so `npm run lint` exits 0), but the noise will return any time someone debugs a lint failure with `--verbose`. Verified locally: `Found 5 warnings. Found 1 info.` reported with verbose flag.
**Fix:** Flip `ignoreUnknown` to `true` so Biome silently skips files it has no handler for:
```json
"files": {
  "ignoreUnknown": true,
  "includes": ["**", "!node_modules", "!dist", "!coverage", "!.planning", "!.claude"]
}
```
This is the documented Biome 2.x recommendation for mixed-language repos.

### IN-04: Redundant top-level `main`/`module` plus `sourceMap` in tsconfig that tsup overrides

**File:** `package.json:6-7`, `tsconfig.json:11`
**Issue:** Two minor redundancies that future maintainers will trip over:
1. `package.json` carries both legacy `main`/`module` *and* a modern `exports` map. With `exports` present, Node ignores `main`/`module`. Some bundlers still read them, so this is a deliberate compatibility pattern, but the duplication means every future change to the dist layout has to be made in three places (`main`, `module`, `exports`). Worth a comment so it is not "fixed" by deletion later.
2. `tsconfig.json` sets `"sourceMap": true` but the only consumer of the build is `tsup`, which produces source maps via esbuild based on its own `sourcemap: true` setting. The tsconfig flag is unused. Harmless, but it implies `tsc` is part of the toolchain when only `tsup` is.
**Fix:** Either add a one-line comment near `main`/`module` (`// kept for older bundlers; exports map is authoritative`) or remove them if the project commits to Node 12.7+ resolution only. For `sourceMap`, leaving it in is fine as defensive config in case `tsc` is added later — but worth a comment.

---

_Reviewed: 2026-05-05T21:45:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
