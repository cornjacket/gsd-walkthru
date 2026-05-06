---
phase: 01-foundation-tooling
filed_at: 2026-05-06T19:58:00Z
source: CI run annotations on commit c852d0a (run 25457890945)
status: deferred
findings:
  warning: 1
  total: 1
---

# Phase 1: Follow-Up Tracker

Items discovered after Phase 1 closure that belong to its scope (CI / tooling
configuration). Filed here rather than reopening `01-REVIEW.md` so the original
review remains an immutable artifact of what was reviewed at the time.

## Warnings

### WR-06: GitHub Actions deprecation — `actions/checkout@v4` and `actions/setup-node@v4` run on Node 20

**File:** `.github/workflows/test.yml:24, 27`
**Discovered:** 2026-05-06, on the first CI run after Phase 02 close-out (run `25457890945` on commit `c852d0a`). Each of the six matrix jobs emitted the same annotation.

**Issue:** GitHub announced the deprecation of Node 20 in Actions runners (see <https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/>):
> Actions will be forced to run with Node.js 24 by default starting June 2nd, 2026. Node.js 20 will be removed from the runner on September 16th, 2026.

The CI workflow currently pins:
- `actions/checkout@v4` (Node 20)
- `actions/setup-node@v4` (Node 20)

Both will continue to work until the forced upgrade in June 2026, but the warning will keep firing on every CI run until the actions are bumped to a Node 24 release line — noise that drowns out real signals over time.

**Fix:** Bump each action to its latest major release (likely `@v5` for both, but verify the released versions and their changelogs before pinning — particularly that `setup-node@v5` still respects the `cache: "npm"` input the workflow relies on). One-line change per action; no behavioral change to the matrix or its steps is expected.

**Scope:** CI-only — no source files touched, no tests affected.

**Why deferred:** Strictly noise reduction; existing CI is fully green and will remain so until at least June 2026. Bundling with another Phase 1 maintenance pass (or doing it standalone in a one-line PR) is fine.

**Suggested commit shape:** `fix(01): WR-06 bump actions/checkout and actions/setup-node off deprecated Node 20`
