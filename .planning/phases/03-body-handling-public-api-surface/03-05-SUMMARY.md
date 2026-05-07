---
phase: 03-body-handling-public-api-surface
plan: 05
subsystem: api
tags: [types, discriminated-union, declaration-merging, express, typescript, compile-time-tests, ts-expect-error]

requires:
  - phase: 03-body-handling-public-api-surface
    plan: 02
    provides: "StripeWebhook, GitHubWebhook, ShopifyWebhook branch types in provider modules"
  - phase: 03-body-handling-public-api-surface
    plan: 01
    provides: "tsconfig.test.json infrastructure enabling @ts-expect-error enforcement; npm run typecheck script"

provides:
  - "src/types.ts: WebhookMetadata = StripeWebhook | GitHubWebhook | ShopifyWebhook union export"
  - "src/types.ts: global Express.Request augmentation with webhook?: WebhookMetadata and rawBody?: Buffer"
  - "src/types.test.ts: compile-time SC3 proof via 5 @ts-expect-error cross-branch directives"

affects: [03-06, 03-07, phase-04, phase-05, phase-06, phase-07]

tech-stack:
  added: []
  patterns:
    - "Module-file augmentation: use a .ts module with a named export (not a pure .d.ts) for global declaration merging so the augmentation participates in the module graph"
    - "@ts-expect-error as binding mechanism: each directive asserts a cross-branch field access is a compile-time error; TS2578 fails CI if the union weakens"
    - "Discriminated union re-export: src/types.ts re-exports only the union; branch definitions stay co-located in their provider modules (D-10)"

key-files:
  created:
    - src/types.ts
    - src/types.test.ts
  modified: []

key-decisions:
  - "Used module-file pattern (.ts with export) for augmentation rather than a pure-ambient src/express.d.ts — per RESEARCH anti-pattern documentation, pure .d.ts files are not reliably auto-loaded across consumer environments"
  - "webhook?:  kept optional on Express.Request (D-12) — consumer-side narrowing via control-flow is the documented pattern, not a required field"
  - "Did not add type guards (isStripe, isGitHub, isShopify) — DX-03 helper wrappers are explicitly deferred to v2"

patterns-established:
  - "SC3 binding pattern: @ts-expect-error + tsc --noEmit -p tsconfig.test.json; removing a directive or weakening the union causes TS2578 in npm run typecheck"
  - "Cross-branch field access forbidden: accessing topic (Shopify) on a Stripe-narrowed branch is a compile-time error, not a runtime check"

requirements-completed: [API-03]

duration: 2min
completed: 2026-05-07
---

# Phase 3 Plan 05: WebhookMetadata Discriminated Union + SC3 Compile-Time Proof Summary

**WebhookMetadata union and global Express.Request augmentation via TypeScript declaration merging, with @ts-expect-error directives proving SC3 (cross-branch field access is a compile-time error)**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-07T04:41:41Z
- **Completed:** 2026-05-07T04:44:00Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments

- Shipped `src/types.ts` as a module file (not pure .d.ts) that exports `WebhookMetadata = StripeWebhook | GitHubWebhook | ShopifyWebhook` and declares the global `Express.Request` augmentation with `webhook?: WebhookMetadata` and `rawBody?: Buffer`
- Shipped `src/types.test.ts` with 6 vitest blocks and 5 `@ts-expect-error` directives — each asserting a cross-branch field access is a compile-time error
- `npm run typecheck` exits 0 with the global declaration merge in place, proving SC3 structurally; `npm test` exits 0 with 49 passing tests

## Typecheck Confirmation

`npm run typecheck` exits 0 with the global declaration merge in place. The `@ts-expect-error` directives are checked by `tsconfig.test.json` (Plan 01 infrastructure) — removing any directive or weakening the union fails CI with TS2578.

## Redundant Cast Note

The `(req as typeof req & { rawBody?: Buffer })` casts in `src/raw-body/middleware.ts` (Plan 03) and `src/raw-body/middleware.test.ts` are NOW redundant — the global merge gives `req.rawBody?: Buffer` directly without any cast. This cleanup opportunity should be noted in Plan 06 or Plan 07 SUMMARY. It is intentionally NOT cleaned up here to keep this plan scoped to types only.

## Test Counts

`src/types.test.ts` adds 6 `it` blocks. Total project tests: 49 passing (up from 43 before this plan).

## Task Commits

Each task was committed atomically:

1. **Task 1: src/types.ts — WebhookMetadata union + global Express.Request augmentation** - `5c05255` (feat)
2. **Task 2: src/types.test.ts — compile-time discriminated-union narrowing test (SC3)** - `35edeb2` (test)

**Plan metadata:** `_pending_`

## Files Created/Modified

- `src/types.ts` - WebhookMetadata discriminated union export + global Express.Request declaration merging (webhook?: WebhookMetadata, rawBody?: Buffer)
- `src/types.test.ts` - 6 vitest it blocks, 5 @ts-expect-error cross-branch directives proving SC3; binding signal is tsc --noEmit -p tsconfig.test.json

## Decisions Made

- Module-file pattern (.ts with named export) used for augmentation — RESEARCH.md explicitly documents `src/express.d.ts` as an anti-pattern because pure-ambient files aren't reliably auto-loaded
- `webhook?:` kept optional (D-12) — consumer routes that don't mount the middleware see `undefined`; narrowing happens via control-flow
- No type guards (isStripe/isGitHub/isShopify) added — DX-03 is explicitly deferred to v2 per plan

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The `src/providers/types.ts` file already imported from `'../types.js'` and `src/providers/stripe.ts` imported from `'./types.js'`, confirming the expected dependency chain. The initial `tsc --noEmit` failure (TS2307: Cannot find module '../types.js') was the expected state before Task 1 — creating `src/types.ts` resolved it.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `WebhookMetadata` is available for Plan 06 (middleware) and Plan 07 (barrel) to re-export
- `req.webhook?: WebhookMetadata` and `req.rawBody?: Buffer` are globally typed on Express.Request — Plan 06 middleware can assign `req.webhook` without casts
- SC3 is structurally proven; adding a new provider branch (Phase 4/5) only requires extending the union in `src/types.ts` and extending the test file with the new branch's narrowing assertions
- Cleanup opportunity: remove redundant `(req as typeof req & { rawBody?: Buffer })` casts in `src/raw-body/middleware.ts` and its test (Plan 03 output) — this can be done in Plan 06 or 07

---
*Phase: 03-body-handling-public-api-surface*
*Completed: 2026-05-07*
