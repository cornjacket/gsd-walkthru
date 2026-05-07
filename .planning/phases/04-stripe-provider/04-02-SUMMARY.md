---
phase: 04-stripe-provider
plan: 02
subsystem: api
tags: [typescript, express, webhook, stripe, middleware, tolerance]

# Dependency graph
requires:
  - phase: 03-body-handling-public-api
    provides: createWebhookMiddleware factory, CreateWebhookMiddlewareOptions interface, Provider interface (types.ts)
provides:
  - tolerance?: number option on CreateWebhookMiddlewareOptions (default 300 s)
  - const tolerance resolved in factory closure for provider consumption
  - provider.validate called with tolerance as optional 3rd argument
affects:
  - 04-03-stripe-provider (reads tolerance from factory closure via validate 3rd arg)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Factory-time constant resolution: provider-specific config (tolerance) resolved once in factory scope, passed to validate at request time, keeping the Provider interface stable (D-16)
    - Intentional narrow Function cast: avoids widening the shared Provider interface while still passing extra args to providers that accept them

key-files:
  created: []
  modified:
    - src/middleware.ts

key-decisions:
  - "Pass tolerance as 3rd arg via Function cast rather than widening Provider interface (D-16) — keeps the shared contract stable while letting Stripe-specific validate() accept the window"
  - "Resolve tolerance once in factory scope (not per-request) — const tolerance = options.tolerance ?? 300"
  - "Import WebhookMetadata type for explicit return-type cast on the Function.call, avoiding any leaking into public surface"

patterns-established:
  - "Factory-time option resolution: all per-provider config resolved as consts in factory scope before returning RequestHandler"
  - "Localized Function cast with eslint-disable comment: preferred over widening shared interfaces"

requirements-completed:
  - STRP-02

# Metrics
duration: 5min
completed: 2026-05-07
---

# Phase 04 Plan 02: Middleware Tolerance Option Summary

**`tolerance?: number` added to `CreateWebhookMiddlewareOptions` with 300-second default resolved in factory closure and passed to `provider.validate` as an optional 3rd argument via intentional Function cast (D-16 preserved)**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-07T22:10:00Z
- **Completed:** 2026-05-07T22:11:26Z
- **Tasks:** 1 of 1
- **Files modified:** 1

## Accomplishments

- Added `tolerance?: number` to `CreateWebhookMiddlewareOptions` with full JSDoc (`@default 300`, replay-window description)
- Resolved `const tolerance = options.tolerance ?? 300` in factory body immediately after `const secret`
- Passed tolerance to `provider.validate` via a narrow `Function` cast, keeping `Provider` interface at 2 params (D-16)
- Imported `WebhookMetadata` type to anchor the Function.call return type without leaking `any`
- 68 tests green (no regression); `npm run build` DTS build clean after fixing a self-referential `typeof req` cast and a `provider` possibly-undefined DTS error

## Task Commits

1. **Task 1: Add tolerance option to CreateWebhookMiddlewareOptions and factory** - `65e47e9` (feat)

**Plan metadata:** `_pending_` (docs: complete plan — rides into final commit)

## Files Created/Modified

- `src/middleware.ts` — Added `tolerance?: number` to interface + JSDoc, `const tolerance = options.tolerance ?? 300` in factory, Function cast on `provider.validate` call, `WebhookMetadata` import

## Decisions Made

- Used `(provider!.validate as Function).call(provider, req, secret, tolerance)` cast pattern instead of `(provider.validate as (req: typeof req, ...) => ...)` because the `typeof req` form creates a circular reference in the DTS build (TypeScript error TS2502). The `Function` cast is simpler and equally localized.
- Added `provider!` non-null assertion because TypeScript's DTS generator doesn't narrow the provider through the earlier `if (!provider)` guard into the returned closure. The assertion is safe: the guard throws synchronously if provider is null.
- Imported `WebhookMetadata` from `./types.js` for the return-type cast so the `metadata` local is correctly typed without `any` leaking into the public API.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed self-referential `typeof req` cast causing DTS TS2502 error**
- **Found during:** Task 1 (tolerance option implementation)
- **Issue:** The plan's suggested cast `(provider.validate as (req: typeof req, secret: string, tolerance: number) => ReturnType<typeof provider.validate>)` causes TypeScript error `TS2502: 'req' is referenced directly or indirectly in its own type annotation` in the DTS build
- **Fix:** Replaced with `(provider!.validate as Function).call(provider, req, secret, tolerance) as WebhookMetadata` — simpler, avoids the circular reference, and the plan explicitly listed this as an equivalent alternative
- **Files modified:** `src/middleware.ts`
- **Verification:** `npm run build` DTS pass, `npm test` 68/68
- **Committed in:** `65e47e9` (task commit)

**2. [Rule 1 - Bug] Added `WebhookMetadata` import to anchor Function.call return type**
- **Found during:** Task 1 (tolerance option implementation, same fix pass)
- **Issue:** The `Function.call` pattern returns `any` without an explicit cast; importing and casting to `WebhookMetadata` eliminates the implicit `any` from the public interface
- **Fix:** Added `import type { WebhookMetadata } from './types.js'` and cast the return value
- **Files modified:** `src/middleware.ts`
- **Verification:** `npm run build` DTS clean, no `any` in `dist/middleware.d.ts`
- **Committed in:** `65e47e9` (same task commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs in the plan's suggested cast pattern; plan explicitly noted `Function.call` as a valid alternative)
**Impact on plan:** Both fixes are in the same commit as the task and produce an equivalent result to the plan's intent. No scope creep.

## Issues Encountered

- First build attempt failed DTS with `TS2502` (self-referential type) and `TS18048` (provider possibly undefined). Fixed both in one iteration by switching to the `Function.call` cast pattern, adding `provider!` non-null assertion, and importing `WebhookMetadata`. Total fix attempts: 1.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `tolerance` is fully wired into the factory closure and passed to every `provider.validate` call
- Plan 04-03 (Stripe implementation) can read tolerance as the optional 3rd parameter of its `validate(req, secret, tolerance)` method without any further changes to the factory
- All 68 existing tests green; no regression in middleware, errors, crypto, raw-body, providers, or index

---
*Phase: 04-stripe-provider*
*Completed: 2026-05-07*

## Self-Check: PASSED

- FOUND: `src/middleware.ts`
- FOUND: `.planning/phases/04-stripe-provider/04-02-SUMMARY.md`
- FOUND: commit `65e47e9` (feat task)
- FOUND: commit `77135bb` (docs/metadata)
