---
phase: 01-foundation-tooling
fixed_at: 2026-05-06T05:08:00Z
review_path: .planning/phases/01-foundation-tooling/01-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 4
skipped: 1
status: partial
---

# Phase 1: Code Review Fix Report

**Fixed at:** 2026-05-06T05:08:00Z
**Source review:** `.planning/phases/01-foundation-tooling/01-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (WR-01 through WR-05; default `critical_warning` scope, info findings excluded)
- Fixed: 4
- Skipped: 1 (WR-03 — fix caused build failure under the post-WR-01/WR-02 dependency tree; reverted per the review's own escape clause)

**Integration check (run inside the worktree after all fixes):**
- `npm ci`: clean install, 162 packages, 0 vulnerabilities
- `npm run lint`: clean (Biome, 7 files, no fixes applied)
- `npm run build`: clean (CJS + ESM + DTS all green)
- `npm test`: clean (1 file, 1 test, passed)

## Fixed Issues

### WR-01: `@types/node` major version exceeds `engines.node` floor

**Files modified:** `package.json`
**Commit:** `d620da4`
**Applied fix:** Pinned `"@types/node": "^25.6.0"` -> `"^20.0.0"` to match the `engines.node = ">=20.0.0"` floor and the CI matrix's Node 20 cell, exactly as the review's Fix block specified.

### WR-02: `@types/express` does not cover the declared peer range

**Files modified:** `package.json`
**Commit:** `d34107d`
**Applied fix:** Pinned `"@types/express": "^5.0.6"` -> `"^4.17.21"` so dual peer-range support (`4.x || 5.x`) type-checks against the older signatures during local development, matching the review's preferred practical approach.

### WR-04: tsup config does not enforce test-file exclusion (D-06 violation)

**Files modified:** `tsup.config.ts`
**Commit:** `9d5ed60`
**Applied fix:** Replaced `entry: ['src/index.ts']` with `entry: ['src/**/*.ts', '!src/**/*.test.ts']`, applying the second guard rail required by D-06 in `01-CONTEXT.md`. Future multi-entry expansions will now never silently leak test files into `dist/`.

### WR-05: CI workflow has no `permissions:` block and no `timeout-minutes`

**Files modified:** `.github/workflows/test.yml`
**Commit:** `9e977c6`
**Applied fix:** Added `timeout-minutes: 10` and `permissions: { contents: read }` at the job level, exactly as the review specified. `contents: read` is the minimum needed to checkout; 10 minutes bounds a hung Vitest run from the default 6-hour ceiling.

## Lockfile sync (collateral, non-finding)

**Files modified:** `package-lock.json`
**Commit:** `58aacd2`
**Reason:** WR-01 and WR-02 changed devDep semver ranges. Without refreshing the lockfile, `npm ci` in CI would fail with `EUSAGE` because the lockfile would no longer match `package.json`. This is a mechanical follow-up to keep the two in sync; the integration check above ran `rm -rf node_modules && npm ci` to confirm the refreshed lockfile is consistent.

## Skipped Issues

### WR-03: `ignoreDeprecations: "6.0"` is unjustified and silently suppresses signal

**File:** `tsconfig.json:13`
**Reason:** The fix was applied (commit `6d00b96`, removing the `ignoreDeprecations` line) and Tier 2 verification passed (JSON parsed cleanly), but the end-of-run integration build failed in the DTS step with:

```
error TS5101: Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7.0.
Specify compilerOption '"ignoreDeprecations": "6.0"' to silence this error.
```

Investigation traced the deprecated `baseUrl` to `node_modules/es-errors/tsconfig.json` — a transitive dep pulled in (under the new dep tree) by `@types/express@^4.17.21` after the WR-02 downgrade. The review explicitly anticipated this: _"If a real deprecation warning **is** triggering (i.e., removal causes an error), update the offending option directly rather than suppress the warning"_. Since the offending `baseUrl` is in a third-party `tsconfig.json` we do not control, suppression remains the only viable action.

**Resolution:** Reverted in commit `913d587` with a clear `revert(01): WR-03 …` message recording the transitive `es-errors` cause. The original `ignoreDeprecations: "6.0"` line is restored.

**Important caveat about the review's premise:** The review claimed _"removing the field leaves `tsc --noEmit` passing cleanly on TS 6.0.3"_, which was true on the OLD dep tree (`@types/node@25` + `@types/express@5`). After the WR-01/WR-02 downgrades, the dep graph differs and the deprecation now triggers. The review's standalone WR-03 verification did not account for the interaction with WR-01/WR-02. The skip is consistent with the review's own escape clause and not a defect in the reviewer's reasoning — just an interaction the reviewer could not foresee without running the build with the WR-01/WR-02 fixes also applied.

**Original issue (preserved for follow-up):** the deprecation suppression is still hiding signal. A cleaner long-term fix is one of:
1. Add `"customConditions"` or otherwise prevent `tsc` from picking up `node_modules/es-errors/tsconfig.json` during DTS builds.
2. Wait for `es-errors` upstream to drop `baseUrl` from its shipped tsconfig.
3. Re-evaluate when TypeScript 7 ships and `ignoreDeprecations: "6.0"` stops being honored.

This should be tracked as a follow-up item in Phase 2 planning.

---

_Fixed: 2026-05-06T05:08:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
