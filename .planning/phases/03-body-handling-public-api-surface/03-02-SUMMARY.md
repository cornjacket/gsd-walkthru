---
phase: 03-body-handling-public-api-surface
plan: 02
subsystem: api
tags: [providers, registry, discriminated-union, stubs, typescript, vitest, biome]

# Dependency graph
requires:
  - phase: 02-crypto-core-error-class
    provides: "WebhookValidationError + named-export conventions from Phase 2"
  - phase: 03-01
    provides: "Phase 3 context, WebhookMetadata type (forward ref, lands Plan 05)"
provides:
  - "Provider interface at src/providers/types.ts (D-01)"
  - "In-memory registry singleton at src/providers/registry.ts with registerProvider/getProvider/_clearRegistryForTesting"
  - "StripeWebhook branch type + self-registration stub at src/providers/stripe.ts"
  - "GitHubWebhook branch type (with deliveryId) + self-registration stub at src/providers/github.ts"
  - "ShopifyWebhook branch type (with topic/webhookId) + self-registration stub at src/providers/shopify.ts"
  - "Registry test: 3 cases, _clearRegistryForTesting in beforeEach, direct ./registry.js import (Pitfall 2)"
affects:
  - 03-05-types (consumes StripeWebhook/GitHubWebhook/ShopifyWebhook to build WebhookMetadata union)
  - 03-06-middleware (calls getProvider() to resolve providers by name)
  - 03-07-barrel (side-effect imports of stripe/github/shopify to trigger registration)
  - 04-stripe-provider (replaces stripe stub validate())
  - 05-github-shopify-providers (replaces github/shopify stub validate())

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Map<string, Provider> singleton registry with last-write-wins semantics"
    - "Leading-underscore _clearRegistryForTesting for test isolation (D-22)"
    - "Side-effect top-level registerProvider call for self-registration (D-03)"
    - "Discriminated union branch type co-located in provider module (D-09, D-10)"
    - "Direct module import in tests (not via barrel) to avoid side-effect import cascade (Pitfall 2)"

key-files:
  created:
    - src/providers/types.ts
    - src/providers/registry.ts
    - src/providers/registry.test.ts
    - src/providers/stripe.ts
    - src/providers/github.ts
    - src/providers/shopify.ts
  modified: []

key-decisions:
  - "Registry uses last-write-wins (Map.set semantics) instead of throw-on-duplicate — allows Phase 4/5 to substitute stubs without a clear-and-re-register dance (D-01 Claude's Discretion)"
  - "No per-provider .test.ts files for stripe/github/shopify in Phase 3 — per D-20, Phase 4/5 own those tests when they replace validate() implementations"
  - "Stub validate() throws plain Error (not WebhookValidationError) — D-04 locks WebhookValidationError to signature verification paths only"
  - "Provider interface references ../types.js (WebhookMetadata) which lands in Plan 05 — per-plan typecheck deferred to Plan 05's verify step; this plan's verify uses targeted vitest runs only"

patterns-established:
  - "Provider self-registration: each provider module calls registerProvider at top level on import"
  - "Test isolation: _clearRegistryForTesting() in beforeEach — every registry test starts with empty state"
  - "Biome import ordering: value imports before type imports (registry before types alphabetically)"

requirements-completed: [API-03]

# Metrics
duration: 5min
completed: 2026-05-07
---

# Phase 03 Plan 02: Provider Interface, Registry, and Stub Modules Summary

**Map-backed provider registry with last-write-wins semantics, Provider interface, 3 discriminated-union branch types co-located with self-registering stubs (StripeWebhook/GitHubWebhook/ShopifyWebhook)**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-07T04:22:39Z
- **Completed:** 2026-05-07T04:25:07Z
- **Tasks:** 2 (Task 1 TDD with RED + GREEN commits; Task 2 standard)
- **Files modified:** 6 created, 0 modified

## Accomplishments
- Provider interface (`src/providers/types.ts`) with `name: string` and `validate(req, secret): WebhookMetadata` shipped; the `WebhookMetadata` type reference to `../types.js` is intentionally forward — Plan 05 resolves it
- Registry singleton (`src/providers/registry.ts`) backed by `Map<string, Provider>` with `registerProvider`, `getProvider`, and `_clearRegistryForTesting` — last-write-wins semantics documented in JSDoc (D-01)
- Registry test suite (3 cases): register/get round-trip, undefined-for-unknown, last-write-wins; uses `_clearRegistryForTesting` in `beforeEach`; imports `./registry.js` directly NOT via barrel (Pitfall 2 isolation)
- Stripe stub (`src/providers/stripe.ts`): `StripeWebhook` type with `replayWindowMs` field, self-registration, throwing stub
- GitHub stub (`src/providers/github.ts`): `GitHubWebhook` type with `deliveryId` field (GHUB-03), self-registration, throwing stub
- Shopify stub (`src/providers/shopify.ts`): `ShopifyWebhook` type with `topic` + `webhookId` fields (SHOP-02), self-registration, throwing stub

## Task Commits

1. **test(03-02): failing registry tests (RED)** - `34ffbbb`
2. **feat(03-02): Provider interface, registry singleton, registry tests (GREEN)** - `fcf1b03`
3. **feat(03-02): per-provider stub modules with branch types and self-registration** - `81b0814`

**Plan metadata:** (pending final docs commit)

_Note: Task 1 is TDD — RED commit (`34ffbbb`) then GREEN commit (`fcf1b03`)_

## Files Created/Modified
- `src/providers/types.ts` - Provider interface (D-01); forward-references `WebhookMetadata` from Plan 05
- `src/providers/registry.ts` - Map singleton; `registerProvider`, `getProvider`, `_clearRegistryForTesting`
- `src/providers/registry.test.ts` - 3 passing tests; direct `./registry.js` import (Pitfall 2)
- `src/providers/stripe.ts` - `StripeWebhook` branch type + `registerProvider('stripe', ...)` top-level
- `src/providers/github.ts` - `GitHubWebhook` branch type + `registerProvider('github', ...)` top-level
- `src/providers/shopify.ts` - `ShopifyWebhook` branch type + `registerProvider('shopify', ...)` top-level

## Decisions Made
- **Last-write-wins registry**: chose `Map.set` semantics (replace on duplicate) over throw-on-duplicate. Rationale: consistent with JavaScript Map defaults; Phase 4/5 can substitute Phase 3 stubs without a clear-and-re-register dance. Documented in `src/providers/registry.ts` JSDoc and locked by the `last-write-wins on duplicate registration` test.
- **No per-provider tests in Phase 3**: D-20 explicitly defers `stripe.test.ts`, `github.test.ts`, `shopify.test.ts` to Phases 4/5 when real `validate()` implementations ship. The registry test provides sufficient coverage of the registration plumbing.
- **Plain Error in stubs** (not WebhookValidationError): D-04 locks `WebhookValidationError` to signature-verification failure paths. Stub `validate()` methods are placeholder code — plain `Error` is correct here.

## Test Counts
- Phase 2 baseline: 20 tests (4 files)
- This plan added: +3 tests (registry: round-trip, undefined-on-unknown, last-write-wins)
- New total: **23 tests (5 files)** — all passing

## Phase 4/5 Readiness Confirmation
Each provider stub file contains a clearly marked comment:
- `stripe.ts`: `// Phase 4 fills this in.`
- `github.ts`: `// Phase 5 fills this in.`
- `shopify.ts`: `// Phase 5 fills this in.`

Plan 07 (`src/index.ts` barrel) wires up the side-effect imports that trigger registration at runtime. The standalone import probe is gated on Plan 07 landing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Biome import ordering in registry.test.ts**
- **Found during:** Task 1 (GREEN phase, post-implementation Biome check)
- **Issue:** Biome `organizeImports` rule required the multi-line import block in `registry.test.ts` to be collapsed to a single line
- **Fix:** Collapsed 5-line import to single line: `import { _clearRegistryForTesting, getProvider, registerProvider } from './registry.js';`
- **Files modified:** `src/providers/registry.test.ts`
- **Verification:** `npx biome check` exits 0
- **Committed in:** `fcf1b03` (Task 1 GREEN commit)

**2. [Rule 1 - Bug] Fixed Biome import ordering in stripe/github/shopify stubs**
- **Found during:** Task 2 (post-creation Biome check)
- **Issue:** Biome `organizeImports` rule requires alphabetical import order; all three stubs had `import type { Provider }` before `import { registerProvider }` — reversed alphabetical order
- **Fix:** Swapped import order in all three files: `registry.js` first, then `types.js`
- **Files modified:** `src/providers/stripe.ts`, `src/providers/github.ts`, `src/providers/shopify.ts`
- **Verification:** `npx biome check src/providers/stripe.ts src/providers/github.ts src/providers/shopify.ts` exits 0
- **Committed in:** `81b0814` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - import formatting/ordering required by Biome)
**Impact on plan:** Both auto-fixes are formatting correctness only. No logic, API, or behavior changes. No scope creep.

## Issues Encountered
None beyond the two Biome import-ordering fixes documented above.

## Threat Surface Scan
No new network endpoints, auth paths, file access patterns, or schema changes introduced. All six files are pure TypeScript module definitions with no I/O. Threat model items T-3-04 and T-3-05 addressed as planned:
- T-3-04 (last-write-wins): locked by registry test + JSDoc documentation
- T-3-05 (no logging leakage): confirmed by `grep -c 'console\.'` returning 0 across all 6 files

## Next Phase Readiness
- Plan 05 (`src/types.ts`) can now import `StripeWebhook`, `GitHubWebhook`, `ShopifyWebhook` to build the `WebhookMetadata` discriminated union — this resolves the forward reference in `src/providers/types.ts`
- Plan 06 (`src/middleware.ts`) can call `getProvider(name)` to look up provider implementations
- Plan 07 (`src/index.ts` barrel) wires side-effect imports of `stripe.ts`/`github.ts`/`shopify.ts` to trigger self-registration

---
*Phase: 03-body-handling-public-api-surface*
*Completed: 2026-05-07*
