---
phase: 02-crypto-core-error-class
plan: 03
subsystem: api
tags: [public-surface, barrel, esm, vitest]

requires:
  - phase: 02-crypto-core-error-class (Plan 01)
    provides: computeHmac, timingSafeCompare in src/crypto/
  - phase: 02-crypto-core-error-class (Plan 02)
    provides: WebhookValidationError class + WebhookValidationReason type in src/errors.ts
provides:
  - "Public barrel: VERSION + computeHmac + timingSafeCompare + WebhookValidationError + type WebhookValidationReason via src/index.ts"
  - "Reachability smoke tests in src/index.test.ts that fail loudly on any barrel-typo regression"
affects: [phase-03, phase-04, phase-05, providers, middleware-factory]

tech-stack:
  added: []
  patterns:
    - "named re-exports (export { X } from '...') — public surface enumerable from a single grep, not export *"
    - "inline 'type' modifier on type-only re-exports (verbatimModuleSyntax friendly, single line)"

key-files:
  created: []
  modified:
    - src/index.ts
    - src/index.test.ts

key-decisions:
  - "Re-exports alphabetized by source path (compare.js → hmac.js → errors.js) per Biome organizeImports — overrides plan's stated grouping order"
  - "Header comment trimmed to omit literal strings 'createWebhookMiddleware' and 'Provider' to satisfy plan's own speculative-export grep gate (plan defect: gate regex matched plan-supplied comment text)"

patterns-established:
  - "Public-surface barrel uses named re-exports only — adding a new internal symbol does NOT silently leak it"
  - "Reachability smoke tests live in src/index.test.ts; behavioral tests stay co-located in src/<module>/<name>.test.ts"

requirements-completed: [CRYP-01, CRYP-02, API-02]

duration: ~3min
completed: 2026-05-06
---

# Phase 02 Plan 03: Public Barrel Summary

**Phase 2 primitives wired into the public package surface — `src/index.ts` grows from 1 to 5 named exports, with reachability smoke tests in `src/index.test.ts` that catch barrel-typo regressions before they hit downstream phases.**

## Performance

- **Duration:** ~3 min (executed inline by orchestrator after the spawned executor failed to acquire Bash permission)
- **Completed:** 2026-05-06
- **Tasks:** 2
- **Files modified:** 2 (`src/index.ts`, `src/index.test.ts`)
- **Files created:** 0
- **`package.json`:** unchanged (the existing `exports` map already points at `./dist/index.{js,cjs,d.ts}`)

## Accomplishments
- `src/index.ts` now exports `VERSION` (preserved), `computeHmac`, `timingSafeCompare`, `WebhookValidationError`, and `type WebhookValidationReason` — all five public symbols enumerable from a single `grep '^export' src/index.ts`.
- `src/index.test.ts` preserves the Phase 1 `VERSION` smoke test verbatim and adds 4 reachability smoke tests, one per new export, each invoking the symbol through `./index.js` (constructing, calling, or type-annotating it).
- Full suite green: 21 `it` blocks across 4 test files (Phase 1 baseline + Plan 01 crypto + Plan 02 errors + Plan 03 barrel) — `npx vitest run` exits 0.
- `npx tsc --noEmit -p tsconfig.json` clean; `npx biome check src/index.ts src/index.test.ts` clean; `npm run build` produces `dist/index.{js,cjs,d.ts}` declaring all 5 public symbols.

## Task Commits

1. **Task 1: Extend `src/index.ts` barrel** — `9fd04b0` (feat)
2. **Task 2: Reachability smoke tests in `src/index.test.ts`** — `ebc76ff` (test)

## Files Created/Modified
- `src/index.ts` — Phase 1's single `VERSION` export grew to five named exports plus a 3-line header comment. Re-exports use `export { ... } from '...'` form (no `export *`); the `WebhookValidationReason` re-export uses inline `type` modifier on the same line as `WebhookValidationError`.
- `src/index.test.ts` — grew from 1 `it` to 5 `it` blocks. Existing Phase 1 `it('exports a VERSION string', ...)` block preserved byte-for-byte. New blocks invoke each Phase 2 symbol through the public barrel as a regression guard.

## Decisions Made
- **Export order is alphabetized by source path**, not the order the plan listed (`compare.js` → `hmac.js` → `errors.js`). Biome's `organizeImports: "on"` rule rewrites any other order on `npm run format`, so writing it correctly the first time matches the formatter's enforced state.
- **Header comment trimmed.** The plan supplied an exact comment string that included the literal tokens `createWebhookMiddleware` and `Provider`. The plan's own acceptance-criteria grep — `grep -E "createWebhookMiddleware|Provider|RawBodyOptions" src/index.ts` returns NO matches — also fired against those tokens in the comment. Comment intent (signal that these are coming in later phases) is preserved with rephrased wording: "Phases 3-5 will add the middleware factory and per-provider modules."
- **`Buffer.from([1, 2, 3])` for the `timingSafeCompare` smoke** rather than `Buffer.from('abcdef', 'hex')` — keeps the smoke minimal; the deep length-mismatch / no-throw coverage stays in `src/crypto/compare.test.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan-supplied export order conflicted with Biome `organizeImports`**
- **Found during:** Task 1 (`npx biome check src/index.ts`)
- **Issue:** Plan specified the re-exports in source-order (`computeHmac` → `timingSafeCompare` → `WebhookValidationError`), but Biome's `organizeImports` rule (enabled in Phase 1 `biome.json`) requires alphabetical-by-source-path order. `npx biome check` failed with a `FIXABLE` reorder diagnostic.
- **Fix:** Reordered the three re-export statements to `compare.js` → `hmac.js` → `errors.js` (alphabetical by relative path). Each line still has the same form (`export { ... } from '...'`); only the line order changed.
- **Files modified:** `src/index.ts`
- **Verification:** `npx biome check src/index.ts` exits 0. All four exact-string `grep -q` acceptance checks still pass (they don't constrain order, only presence per line).
- **Committed in:** `9fd04b0` (Task 1 commit)

**2. [Rule 3 - Blocking] Plan-supplied comment text triggered plan's own speculative-export grep gate**
- **Found during:** Task 1 verification (`! grep -E "createWebhookMiddleware|Provider|RawBodyOptions" src/index.ts`)
- **Issue:** Plan instructed using exact comment "`Provider middleware (createWebhookMiddleware, raw-body capture) lands in Phases 3-5.`" The plan also asserted (acceptance_criteria) that `grep -E "createWebhookMiddleware|Provider|RawBodyOptions"` returns NO matches anywhere in the file. The comment shadowed the gate — both can't simultaneously be true. The intent of the gate is to prevent speculative `export` statements for those names, not to forbid them in comments, but the regex doesn't distinguish.
- **Fix:** Rephrased the third comment line to "`// Phases 3-5 will add the middleware factory and per-provider modules.`" Lower-case "provider" doesn't match the case-sensitive `Provider` token; "middleware factory" replaces `createWebhookMiddleware`. Reader meaning is preserved.
- **Files modified:** `src/index.ts`
- **Verification:** `grep -E "createWebhookMiddleware|Provider|RawBodyOptions" src/index.ts` returns no matches. Comment still signals "more is coming in later phases."
- **Committed in:** `9fd04b0` (Task 1 commit)

**3. [Process] Spawned executor agent had no Bash permission; orchestrator executed plan inline**
- **Found during:** Wave 2 dispatch
- **Issue:** The `gsd-executor` subagent invoked with `run_in_background: true` reported it lacked Bash access on its first action and exited without making any progress. The earlier two parallel agents (Plans 01 and 02) had Bash access, so this appears to be either a per-spawn permission flake or a background-mode permission limitation.
- **Fix:** Orchestrator executed the plan inline (sequential mode without worktree isolation). Tasks 1 and 2 committed atomically against `main` directly.
- **Files modified:** none beyond what the plan called for.
- **Verification:** Both atomic commits land in `git log --oneline`; full suite green; build green.
- **Committed in:** N/A (process change, not a code change).

---

**Total deviations:** 3 (2 Rule 3 plan defects auto-fixed; 1 process deviation around how the plan was executed)
**Impact on plan:** No scope creep. No public-surface changes beyond what the plan called for. The two code-level deviations are both forced corrections to internal contradictions in the plan's own gates; the process deviation produced the same artifacts the worktree path would have.

## Issues Encountered
- The first spawned executor agent for this plan never made any commits — the `worktree-agent-a39071404480eb7fb` worktree was auto-cleaned by the harness when the agent exited, and the orchestrator then executed the plan inline against `main`.

## Self-Check: PASSED
- `npx vitest run` exits 0 (5/5 in `index.test.ts`; 21 total across 4 test files).
- `npx tsc --noEmit -p tsconfig.json` clean.
- `npx biome check src/index.ts src/index.test.ts` clean.
- `npm run build` produces `dist/index.{js,cjs,d.ts}` declaring `VERSION`, `computeHmac`, `timingSafeCompare`, `WebhookValidationError`, `WebhookValidationReason`.
- `find dist -name '*.test.*' | wc -l` returns 0.
- `package.json` `dependencies` empty; `peerDependencies` unchanged.

## Threats Mitigated
- T-02-14 (silent public-surface drift) — named re-exports only; no `export *`.
- T-02-15 (broken re-export discovered late) — reachability smoke tests catch typos at unit-test time.
- T-02-16 (speculative pre-export of Phase 3+ symbols) — grep gate confirmed absent.
- T-02-17 (broken `WebhookValidationError` prototype chain after CJS+ESM dual build) — smoke test asserts both `instanceof Error` and `instanceof WebhookValidationError`.
- T-02-18 (compile-time type-export break) — `WebhookValidationReason` smoke test types a `const`; tsc surfaces any type-only re-export break.

## Next Phase Readiness
- Phase 2 closes out: all three plans (01, 02, 03) shipped; full suite green; public surface is `VERSION + computeHmac + timingSafeCompare + WebhookValidationError + type WebhookValidationReason`.
- Phase 3 (middleware factory) can now `import { WebhookValidationError } from 'express-webhook-validator'` and start consuming the discriminated error type.
- Phases 4-5 (per-provider modules — Stripe, GitHub, Shopify) can `import { computeHmac, timingSafeCompare } from 'express-webhook-validator'` and convert hex/base64 at their own boundaries.

---
*Phase: 02-crypto-core-error-class*
*Completed: 2026-05-06*
