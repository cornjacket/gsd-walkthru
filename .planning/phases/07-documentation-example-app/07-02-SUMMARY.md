---
phase: 07-documentation-example-app
plan: 02
subsystem: documentation
tags: [express, typescript, webhook, stripe, github, shopify, crypto, example-app]

# Dependency graph
requires:
  - phase: 07-documentation-example-app
    provides: "Library v1.0.0 with dist/ output; README with per-provider quickstarts that the example app must stay consistent with"
provides:
  - "Runnable example app under examples/example-app/ demonstrating all three providers end-to-end"
  - "Independent mock senders for Stripe, GitHub, Shopify using Node crypto.createHmac (D-09 independence contract)"
  - "One-shot demo: npm start fires three correctly-signed requests in parallel, prints validated req.webhook for each provider, exits 0"
  - "Shopify base64 encoding demonstrated and explicitly documented as the most common integration footgun"
affects: []

# Tech tracking
tech-stack:
  added:
    - "express (^4.18.0) — direct dep in example-app consumer app"
    - "typescript (^6.0.0) — matching library's TypeScript version to avoid tsconfig extend incompatibility"
  patterns:
    - "D-09 independence contract: mock senders use crypto.createHmac directly, never the library's computeHmac"
    - "Per-route rawBodyCapture() + createWebhookMiddleware() + handler mounting order"
    - "Discriminated union narrowing: if (req.webhook?.provider === 'stripe') for type-safe field access"
    - "Promise.all for parallel request firing with process.exit(0)/process.exit(1) for CI-friendliness"

key-files:
  created:
    - examples/example-app/package.json
    - examples/example-app/tsconfig.json
    - examples/example-app/src/index.ts
    - examples/example-app/src/stripe.ts
    - examples/example-app/src/github.ts
    - examples/example-app/src/shopify.ts
  modified: []

key-decisions:
  - "D-09 independence: mock senders use Node crypto.createHmac, not the library's computeHmac. Circular validation would let HMAC bugs pass silently — independent implementations prove the validator and sender agree on the signing rule."
  - "TypeScript version bumped to ^6.0.0 in example-app devDependencies to match the library root. The root tsconfig.json uses 'ignoreDeprecations: 6.0' which requires TypeScript 6.x; specifying ^5.0.0 caused a build error when extending the root tsconfig."
  - "Shopify base64 encoding: .digest('base64') explicitly chosen and documented. Using .digest('hex') is the most common Shopify integration mistake — the header must carry a bare base64 value with no sha256= prefix."

patterns-established:
  - "file: dependency pattern: 'express-webhook-validator': 'file:../../' makes example code read like a real consumer's import, not a relative src path"
  - "Build ordering requirement: npm run build at library root must precede npm install in the example app directory (resolves the file: dependency from a current dist/)"

requirements-completed: [DOCS-03]

# Metrics
duration: 12min
completed: 2026-06-03
---

# Phase 07 Plan 02: Example App Summary

**Runnable Express example app with three independent HMAC mock senders (Stripe hex, GitHub hex, Shopify base64) that validates all three providers end-to-end and exits 0 via npm start**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-03T22:23:00Z
- **Completed:** 2026-06-03T22:35:00Z
- **Tasks:** 3
- **Files modified:** 6 created

## Accomplishments

- Created examples/example-app with package.json (file: dependency on library) and tsconfig.json extending root — reads like a real consumer's project
- Built three independent mock webhook senders (stripe.ts, github.ts, shopify.ts), each using Node crypto.createHmac directly (D-09) with the correct per-provider signing rule: Stripe timestamp.body hex, GitHub raw body hex with sha256= prefix, Shopify raw body base64 (the most common integration footgun, explicitly documented)
- Built the Express server (index.ts) that mounts all three routes with rawBodyCapture + createWebhookMiddleware + discriminated union narrowing handlers; npm start fires all three requests in parallel via Promise.all, prints validated req.webhook for each provider, and exits 0; 139/139 library tests still pass

## Task Commits

1. **Task 1: Create example app package.json and tsconfig.json** - `7fa1692` (chore)
2. **Task 2: Create mock webhook senders (independent crypto, D-09)** - `3f10758` (feat)
3. **Task 3: Create example app server and run end-to-end verification** - `654bcad` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `examples/example-app/package.json` — Consumer-style package.json with `"express-webhook-validator": "file:../../"`, ESM type, build/start scripts, TypeScript 6.x devDependency
- `examples/example-app/tsconfig.json` — Minimal config extending root tsconfig.json, outDir ./build, rootDir ./src
- `examples/example-app/src/stripe.ts` — Independent Stripe mock sender: signs `${timestamp}.${body}` via HMAC-SHA256 → hex, header `Stripe-Signature: t=<ts>,v1=<hex>`
- `examples/example-app/src/github.ts` — Independent GitHub mock sender: signs raw body via HMAC-SHA256 → hex, header `X-Hub-Signature-256: sha256=<hex>`
- `examples/example-app/src/shopify.ts` — Independent Shopify mock sender: signs raw body via HMAC-SHA256 → base64 (not hex), header `X-Shopify-Hmac-Sha256: <base64>` (bare, no prefix)
- `examples/example-app/src/index.ts` — Express server with three provider routes, webhookErrorHandler, Promise.all orchestrator, process.exit(0) on success

## Decisions Made

**D-09 independence guarantee:** Mock senders use `crypto.createHmac` from `node:crypto` directly, never the library's `computeHmac`. If both validator and sender used the same function, they would succeed or fail together even if that function had a bug. Using separate implementations proves the validator and sender genuinely agree on the signing rule — this is the correctness check the example app is meant to provide.

**TypeScript version alignment:** The example app's devDependencies originally specified `^5.0.0` following the plan template. The root tsconfig.json uses `"ignoreDeprecations": "6.0"` which TypeScript 5.x does not accept, causing a build error when the example app's tsconfig.json extends root. Fixed by bumping to `^6.0.0` to match the library's own TypeScript version (Rule 3 auto-fix).

**Shopify base64 encoding:** Shopify is the only provider that uses base64 digest encoding (not hex). The mock sender calls `.digest('base64')` and the comment explicitly explains why using `.digest('hex')` would produce a signature_mismatch error despite generating a valid-length string.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TypeScript version mismatch — bumped ^5.0.0 to ^6.0.0 in devDependencies**
- **Found during:** Task 3 (end-to-end build attempt)
- **Issue:** The root tsconfig.json uses `"ignoreDeprecations": "6.0"` (valid only in TypeScript 6.x). The plan template specified `^5.0.0` for TypeScript in devDependencies. When the example app tsconfig.json extends the root, TypeScript 5.x rejected the `ignoreDeprecations` value with error TS5103.
- **Fix:** Updated `typescript` in devDependencies from `"^5.0.0"` to `"^6.0.0"` in examples/example-app/package.json; ran `npm install` to install 6.0.3.
- **Files modified:** examples/example-app/package.json (committed in 654bcad)
- **Verification:** `npm start` builds and runs successfully; all three providers print validated req.webhook; exit code 0.

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for the TypeScript build to succeed. No scope creep — the fix aligns the example app's TypeScript version with the library it depends on.

## Issues Encountered

None beyond the TypeScript version auto-fix documented above.

## User Setup Required

None — no external service configuration required. The example app uses test secrets (`test_stripe_secret`, `test_github_secret`, `test_shopify_secret`) against a local loopback server.

## Next Phase Readiness

- Phase 07 is now complete: README (Plan 01) and example app (Plan 02) are both done
- The v1.0 milestone is complete: 139/139 tests passing, all three providers implemented, README restructured, runnable example app working
- Portfolio reviewer can: clone repo, run `npm run build && cd examples/example-app && npm install && npm start`, and see all three providers validated end-to-end

## Known Stubs

None — example app wires real data from the library's validated output; no placeholder values in any rendered path.

## Threat Flags

None — no new network endpoints, auth paths, or security-relevant surface beyond the loopback test server documented in the plan's threat model (T-07-05 through T-07-08). All four threats mitigated as specified.

## Self-Check: PASSED

- FOUND: examples/example-app/package.json
- FOUND: examples/example-app/tsconfig.json
- FOUND: examples/example-app/src/index.ts
- FOUND: examples/example-app/src/stripe.ts
- FOUND: examples/example-app/src/github.ts
- FOUND: examples/example-app/src/shopify.ts
- FOUND: commit 7fa1692 (chore: package.json + tsconfig.json)
- FOUND: commit 3f10758 (feat: mock senders)
- FOUND: commit 654bcad (feat: server + end-to-end)

---
*Phase: 07-documentation-example-app*
*Completed: 2026-06-03*
