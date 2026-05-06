# Phase 3: Body Handling & Public API Surface - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning

<domain>
## Phase Boundary

The first user-facing slice of the library:

1. **`createWebhookMiddleware(provider, options)` factory** — the single primary export per REQUIREMENTS.md API-01. Returns an Express `RequestHandler` compatible with both Express 4.x and 5.x. Phase 3 ships the factory **before any provider runtime exists** — Stripe lands in Phase 4, GitHub/Shopify in Phase 5. The wire-up uses a Provider registry (see D-01) so Phase 4–5 plug in without touching the factory.

2. **Raw-body capture** — both standalone middleware (`rawBodyCapture()`) and a verify-callback helper (`captureRawBody`) for `express.json({ verify })`. Both surfaces store the raw bytes at `req.rawBody` as `Buffer`. SC2 mandates both integration patterns work.

3. **`req.webhook` discriminated union** — full per-provider branch types, co-located in each (still-unimplemented) provider module. Global declaration merging on `Express.Request`. SC3's compile-time-error guarantee for cross-branch field access is the binding criterion.

4. **Sanitized 401 failure surface** — middleware delegates via `next(err)` carrying a `WebhookValidationError`; library exports an opt-in `webhookErrorHandler()` that emits `{ error, reason }` JSON. SC4's no-leakage requirement is structural (Phase 2 D-11 already proved `WebhookValidationError` cannot serialize signature/secret/body bytes).

5. **One Phase-2 reason union widening:** `'malformed_payload'` is added in Phase 3 — the test that exercises it ships in the same commit (Phase 2 D-07 pattern).

This phase delivers ZERO Stripe/GitHub/Shopify validation logic. No header parsing, no HMAC computation against real provider payloads, no timestamp checks. Those land in Phases 4–5. The success bar is: a TypeScript consumer can mount `createWebhookMiddleware('stripe', { secret })`, see `req.webhook` narrow correctly in their handler, and get a structured 401 on failure — even though the actual signature check is still a stub.

</domain>

<decisions>
## Implementation Decisions

### Provider Plumbing

- **D-01: Provider registry pattern.** A `Provider` interface lives in `src/providers/types.ts`. A registry map lives in `src/providers/registry.ts` (e.g., `Map<string, Provider>` with `registerProvider(name, impl)` and `getProvider(name)`). The factory looks up by name. Phase 3 ships the interface and the empty registry; Phase 4–5 fill in providers without touching the factory or the registry's logic.

- **D-02: Factory throws synchronously at call time on unknown provider.** `createWebhookMiddleware('stripe', { secret })` fails IMMEDIATELY if `'stripe'` isn't in the registry — startup-time failure, not request-time. Misconfiguration surfaces in CI and at deploy, never under live traffic. Aligns with PITFALLS #11 (fail loudly on missing config).

- **D-03: Providers self-register on import.** Each provider module (`src/providers/stripe.ts`, `github.ts`, `shopify.ts`) calls `registerProvider('stripe', stripeProvider)` at top level. The public barrel (`src/index.ts`) imports all three provider modules so downstream consumers get registration transparently — `import { createWebhookMiddleware } from 'express-webhook-validator'` is enough; no separate `registerStripeProvider()` call. Phase 3 ships placeholder/stub provider modules whose objects throw on actual signature work, just enough to populate the registry. Phase 4–5 replaces the inner methods.

- **D-04: Unknown-provider error is a plain `Error`.** NOT `WebhookValidationError`. Phase 2 D-05 locked the `WebhookValidationError` constructor to `{ reason, provider, statusCode }` for **request-time HTTP validation failures with a meaningful HTTP status**. A factory-call-time misconfiguration is a different category (config error, not validation error) and fits the Node convention of `throw new Error('Unknown provider \\'stripe\\' — ...')`. Keeps `WebhookValidationError`'s surface clean. Do NOT introduce `WebhookConfigError` either — one extra public type is unjustified for a single use case.

### Raw-Body Capture

- **D-05: Ship both surfaces.** Phase 3 exports BOTH `rawBodyCapture()` (a standalone Express middleware living in `src/raw-body/middleware.ts`) AND `captureRawBody` (a verify-callback helper compatible with `express.json({ verify: captureRawBody })`). SC2 explicitly requires both integration patterns to work; both must end up storing the raw bytes the same way. The helper variant lives next to the middleware (e.g., `src/raw-body/verify.ts` or co-located in `src/raw-body/index.ts` — planner discretion).

- **D-06: Raw bytes land at `req.rawBody` as `Buffer`.** Standard Express convention; matches Stripe's docs and most webhook examples. Both surfaces (D-05) write to the same property. TypeScript declaration merging extends `Express.Request` with `rawBody?: Buffer`. **Do NOT** stash on `req.webhook.rawBody` — `req.webhook` is the consumer-facing discriminated union (D-09–D-11) and shouldn't carry raw byte buffers. **Do NOT** use a Symbol key — debuggability matters more than serialization-hygiene here, and the no-leakage guarantee comes from `WebhookValidationError`, not from hiding `req.rawBody`.

- **D-07: Missing `req.rawBody` at validation time → `WebhookValidationError({ reason: 'malformed_payload', statusCode: 400 })`.** Per Phase 2 D-07's anticipated pattern, Phase 3 widens `WebhookValidationReason` with exactly one new value: `'malformed_payload'`. The reason is added in the SAME commit as the test that exercises it (e.g., a test that mounts the validation middleware without first mounting `rawBodyCapture()`). The error class itself is unchanged — only the union widens.

- **D-08: Default body-size limit is 1mb, configurable via `{ limit }` option.** `rawBodyCapture({ limit: '1mb' })` by default. Bodies exceeding the limit are rejected with HTTP 413 (Payload Too Large) before any HMAC computation runs — mitigates pre-validation memory-DoS. Stripe/GitHub/Shopify v1 payloads all fit comfortably; consumers with larger workloads can override. Implementation can lean on `raw-body` (the npm package Express's `express.raw()` already uses) or roll a minimal stream consumer — planner discretion, but **no new external SDK dependencies** per PROJECT.md.

### `req.webhook` Discriminated Union

- **D-09: Full per-provider branches in Phase 3.** Each branch is the shape Phase 4–5 will populate:
  ```ts
  type StripeWebhook   = { provider: 'stripe';  eventId: string; timestamp: number; parsed: Record<string, unknown>; replayWindowMs: number }
  type GitHubWebhook   = { provider: 'github';  eventId: string; timestamp: number; parsed: Record<string, unknown>; deliveryId: string }
  type ShopifyWebhook  = { provider: 'shopify'; eventId: string; timestamp: number; parsed: Record<string, unknown>; topic: string; webhookId: string }
  type WebhookMetadata = StripeWebhook | GitHubWebhook | ShopifyWebhook
  ```
  Field set per ARCHITECTURE.md system overview + REQUIREMENTS.md GHUB-03 (`X-GitHub-Delivery` → `deliveryId`) + SHOP-02 (`X-Shopify-Topic` → `topic`, `X-Shopify-Webhook-Id` → `webhookId`). SC3's compile-time-error guarantee requires at least one provider-specific field per branch; this satisfies it cleanly. Phase 4–5 fills in runtime values without rewriting types.

- **D-10: Branch types co-located in each provider module.** `src/providers/stripe.ts` exports `type StripeWebhook`. Same for `github.ts` and `shopify.ts`. A central `src/types.ts` re-exports the union: `export type WebhookMetadata = StripeWebhook | GitHubWebhook | ShopifyWebhook`. Each provider owns its own branch — Phase 4–5 doesn't have to touch shared types when widening fields. Public barrel re-exports `WebhookMetadata` and the per-provider types.

- **D-11: Global declaration merging on `Express.Request`.** A type-only file (`src/express.d.ts` or a `declare global` block in `src/types.ts`) augments Express's `Request` interface with `webhook?: WebhookMetadata` and `rawBody?: Buffer`. Once any consumer imports anything from the library, every `req` in their app sees these typed fields. ARCHITECTURE.md endorses this; `req.session`/`req.user` are precedent. **Do NOT** use the typed-handler-wrapper pattern — REQUIREMENTS.md DX-03 explicitly defers that to v2. **Do NOT** require consumer-side casts — directly contradicts SC3's "narrows" phrasing.

- **D-12: `webhook` is optional on `Request`, narrows to required after the middleware.** Global declaration: `webhook?: WebhookMetadata`. The middleware's return type is a typed Express `RequestHandler` whose `next()` continuation narrows the request to `Request & { webhook: WebhookMetadata }`. Routes that DON'T use the middleware correctly see `undefined`; routes that DO see the populated shape with no `?.` chain. Matches the precedent of `express-session`'s typing.

### Failure Response Shape

- **D-13: Middleware delegates failures via `next(err)`.** On any validation failure (signature mismatch, missing header, malformed payload, unknown signature format), the middleware calls `next(new WebhookValidationError(...))` and stops. It does NOT write a response itself. Idiomatic Express; consumers retain full control of their error pipeline (Sentry, structured logging, custom envelope).

- **D-14: Library exports an opt-in `webhookErrorHandler()` factory.** Consumers mount it explicitly: `app.use(webhookErrorHandler())`. The handler is a 4-arg Express error middleware that:
  - Detects `err instanceof WebhookValidationError`
  - Sets `res.status(err.statusCode)` (e.g., 401 for `signature_mismatch`, 400 for `malformed_payload`)
  - Sends `res.json({ error: 'unauthorized', reason: err.reason })` (or equivalent generic phrase per status code)
  - Passes non-`WebhookValidationError` errors through to `next(err)` for the consumer's other error handlers
  - Calls NO logging methods.

  **Do NOT** auto-mount on the same Router as the validation middleware — auto-mount steals the error from consumers' own handlers. **Do NOT** ship "no default error handler at all" — quickstart needs to feel one-line.

- **D-15: Response body shape is `{ error: <generic>, reason: <discriminated> }`.** No provider name in the body (Stripe/GitHub/Shopify already know which endpoint they hit). No status code in the body (it's already in the HTTP status). The discriminated `reason` is the only programmatic signal; the generic `error` phrase is for human readability in dev tools.

- **D-16: Library NEVER logs.** No `console.log`, `console.error`, `console.warn`, `debug()`, or any other logging call from anywhere in `src/`. Phase 2 D-11 already structurally guarantees `JSON.stringify(err)` and `String(err)` leak no signature/secret/body bytes — so any consumer-side logger that serializes the error is automatically safe per SC4. Tests assert that no console method is called during validation failure paths. **Do NOT** introduce a `debug` package dependency. **Do NOT** add an `onError` callback option (REQUIREMENTS.md DX-01 defers that to v2).

### Reason Union Widening (Phase 2 carry-forward)

- **D-17: Phase 3 adds exactly ONE reason: `'malformed_payload'`.** Final shape after Phase 3:
  ```ts
  export type WebhookValidationReason =
    | 'signature_mismatch'
    | 'timestamp_too_old'
    | 'missing_header'
    | 'missing_secret'
    | 'malformed_payload'   // NEW in Phase 3
  ```
  Added in `src/errors.ts` in the same commit as the test that uses it (Phase 2 D-07 pattern). Phase 2's `messageFor` lookup table also gains an entry for `'malformed_payload'`. **Do NOT** preemptively add `invalid_signature_format` (Phase 4 territory) or `invalid_encoding` (Phase 5 territory).

### Module Layout

- **D-18: Match ARCHITECTURE.md "Recommended Project Structure" with adjustments for Phase-3 scope.** Phase 3 creates:
  ```
  src/
  ├── middleware.ts                  # createWebhookMiddleware factory (NEW)
  ├── error-handler.ts               # webhookErrorHandler() factory (NEW)
  ├── types.ts                       # WebhookMetadata union + global Request augmentation (NEW)
  ├── raw-body/
  │   ├── middleware.ts              # rawBodyCapture() standalone middleware (NEW)
  │   └── verify.ts                  # captureRawBody helper for express.json({ verify }) (NEW)
  ├── providers/
  │   ├── types.ts                   # Provider interface (NEW)
  │   ├── registry.ts                # registerProvider/getProvider (NEW)
  │   ├── stripe.ts                  # Provider stub + StripeWebhook type (NEW, fills in Phase 4)
  │   ├── github.ts                  # Provider stub + GitHubWebhook type (NEW, fills in Phase 5)
  │   └── shopify.ts                 # Provider stub + ShopifyWebhook type (NEW, fills in Phase 5)
  └── index.ts                       # Barrel — extends with new exports
  ```
  Each new `.ts` file gets a co-located `.test.ts` per Phase 1 D-04. The `src/__tests__/` directory in ARCHITECTURE.md is NOT created — Phase 1's co-located convention wins.

- **D-19: Public barrel exports.** `src/index.ts` after Phase 3:
  ```ts
  export const VERSION = '0.0.1'
  // Crypto (Phase 2)
  export { computeHmac } from './crypto/hmac.js'
  export { timingSafeCompare } from './crypto/compare.js'
  // Errors (Phase 2 + Phase 3 widened reason)
  export { WebhookValidationError, type WebhookValidationReason } from './errors.js'
  // Phase 3 additions
  export { createWebhookMiddleware } from './middleware.js'
  export { webhookErrorHandler } from './error-handler.js'
  export { rawBodyCapture, captureRawBody } from './raw-body/index.js'  // or per-file
  export type { WebhookMetadata, StripeWebhook, GitHubWebhook, ShopifyWebhook } from './types.js'
  // Side-effect import — registers all three providers
  import './providers/stripe.js'
  import './providers/github.js'
  import './providers/shopify.js'
  ```
  Reachability smoke tests (Phase 2 03-03 pattern) widen to cover the new exports.

### Test Strategy (Phase 3 unit tests)

- **D-20: Co-located unit tests** per Phase 1 D-04. Required test files:
  - `src/middleware.test.ts` — factory shape (returns RequestHandler), throws on unknown provider, calls next() on success path with a registered fake provider
  - `src/error-handler.test.ts` — sets correct status, emits `{ error, reason }` body, no logging side-effects, passes non-WebhookValidationError through to `next(err)`
  - `src/raw-body/middleware.test.ts` — captures raw bytes correctly mounted before `express.json()`; respects `{ limit }`; rejects oversize with 413
  - `src/raw-body/verify.test.ts` — captures raw bytes when used as `express.json({ verify: captureRawBody })`; same `req.rawBody` shape as the standalone middleware
  - `src/providers/registry.test.ts` — register/get round-trip, `register` with duplicate name (planner decides: replace vs throw), `get` for unknown returns undefined or throws
  - `src/types.test.ts` (or extending `src/index.test.ts`) — type-only test asserting that accessing a Shopify-only field on a Stripe-narrowed branch is a compile-time error (use `// @ts-expect-error` directive)
  - `src/errors.test.ts` (Phase 2 file) — extend with one new case for `'malformed_payload'`
  - `src/index.test.ts` (Phase 2 file) — extend reachability smoke tests for the new public exports

- **D-21: Use Supertest for the integration-shape tests in Phase 3 too.** Phase 3 has integration-shaped tests (mount middleware + raw-body capture against a real Express app, exercise both Express 4 and 5 versions). Phase 6 still owns the cross-cutting Supertest suite per the ROADMAP — Phase 3's Supertest usage is bounded to the factory/middleware-shape tests it ships and does NOT preempt Phase 6's coverage gate.

- **D-22: Tests register a fake provider.** Phase 3 has no real Stripe/GitHub/Shopify validators yet, so middleware tests `registerProvider('test-fake', fakeProvider)` at test-file scope where `fakeProvider` is a fixture that always passes / always fails / etc. Tests do NOT exercise the stub Stripe/GitHub/Shopify provider modules' future signature-check methods — those are covered in Phase 4–5.

### Claude's Discretion

- Exact file naming inside `src/raw-body/` — whether to split `middleware.ts`/`verify.ts` or co-locate in a single `index.ts`. Both fine; planner picks based on import ergonomics.
- Whether `Provider` interface lives in `src/providers/types.ts` or `src/types.ts`. Slight preference for `src/providers/types.ts` (groups with provider-related code), but planner discretion.
- Whether the registry uses `Map<string, Provider>` or a plain `Record<string, Provider>`. Either; Map gives a slightly cleaner API.
- Exact wording of `Error` messages thrown for unknown provider, missing rawBody (the latter only matters for human readability — the WebhookValidationError reason is the programmatic signal).
- Whether `WebhookMetadata`'s `parsed` field is `Record<string, unknown>` or `unknown`. ARCHITECTURE.md uses the former; either fine.
- Whether the error handler's "generic phrase" varies by status code (401 → "unauthorized", 400 → "bad request", 413 → "payload too large") or stays uniform ("webhook validation failed"). Planner discretion.
- Whether `rawBodyCapture()` accepts `{ contentTypes: ['application/json', ...] }` to filter which requests get captured, or captures unconditionally and lets the consumer mount it on a specific route. Defer to planner; not user-facing.
- Implementation choice for the body-size limit — use the `raw-body` npm package (already a transitive dep via `express`) vs roll a minimal stream consumer. Both fine; raw-body avoids reinventing edge cases (encoding, partial reads).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-Level
- `.planning/PROJECT.md` — Core value, "no vendor SDKs", "no built-in dedup store", constant-time comparison non-negotiable, "Express-first" positioning.
- `.planning/REQUIREMENTS.md` — Phase 3 owns BODY-01, BODY-02, API-01, API-03, API-04. DX-01 (logging hook), DX-02 (async secret), DX-03 (typed handler wrapper) are v2 — DO NOT add them in Phase 3.
- `.planning/ROADMAP.md` — **Phase 3 success criteria are the binding spec.** Read SC1–SC5 before designing the public API.

### Phase 3 Technical References
- `.planning/research/STACK.md` — Locked TypeScript 6.x, Vitest 4.x, tsup, Biome, Node 20/22/24, Express 4 || 5 peer. Phase 3 inherits all of this; no new stack decisions.
- `.planning/research/ARCHITECTURE.md` — **Use for system overview, "Recommended Project Structure", Provider interface preview (§Pattern: Provider Interface as Contract), `req.webhook` discriminated union shape (§Public API Design), and Express 4 vs 5 async handling (§Integration with Express Conventions).** ARCHITECTURE.md's `WebhookValidationError` shape contradicts Phase 2 D-05 (Phase 2 wins — locked options-object constructor, no `cause`, no `details`). ARCHITECTURE.md's UPPER_SNAKE reason naming contradicts ROADMAP.md (ROADMAP wins — `lowercase_underscore`).
- `.planning/research/PITFALLS.md` — **MANDATORY.** The phase-relevant pitfalls:
  - **#3** (raw body vs parsed body) — D-05/D-06 are the structural answer
  - **#4** (Express middleware ordering, `app.use(express.json())` before signature middleware) — D-05 ships BOTH integration patterns specifically to support either ordering
  - **#5** (leaking signatures/secrets/bodies in errors or logs) — D-13/D-14/D-15/D-16 are the structural answer
  - **#10** (missing signature header) — `'missing_header'` reason already locked in Phase 2 D-07; Phase 3 surfaces it via `next(err)` per D-13
  - **#11** (failing open on missing secret) — Phase 3 should validate `secret` is non-empty at factory call time and throw the same plain `Error` style as D-04
  - **#14** (no replay-protection documentation) — Phase 7 territory; not Phase 3
  - **#17** (Express in `peerDependencies`) — Phase 1 already locked this; Phase 3 must NOT add Express to `dependencies` even if a transitive dep wants it
  - **#18** (middleware breaking non-webhook routes) — D-13/D-14's "delegate via next(err)" + opt-in error handler structure prevents this; Phase 3 docs/tests must show per-route mounting only
- `.planning/research/FEATURES.md` — Background context on provider feature surfaces (Stripe timestamp, GitHub delivery ID, Shopify topic/webhookId). Read for the rationale behind D-09's per-branch field choices.

### Phase Decisions That Carry Forward
- `.planning/phases/01-foundation-tooling/01-CONTEXT.md` — Co-located tests (D-04), Express as peerDependency only (D-13), no vendor SDKs (D-14), strict TypeScript settings (D-15), tsup `entry` glob already excludes `**/*.test.ts`. Phase 3 inherits all of this.
- `.planning/phases/02-crypto-core-error-class/02-CONTEXT.md` — Specifically:
  - **D-05** `WebhookValidationError` constructor locked at `{ reason, provider, statusCode }` — Phase 3 cannot widen
  - **D-07** Reason union widens in the SAME commit as the test exercising the new reason — Phase 3 adds exactly `'malformed_payload'` (D-17 above)
  - **D-08** Reason naming is lowercase_underscore (NOT UPPER_SNAKE per ARCHITECTURE.md)
  - **D-11** Structural no-leakage on `WebhookValidationError` serialization — Phase 3's "library never logs" stance (D-16) builds on this
  - **D-13** Phase 2 unit tests are the model for Phase 3's co-located tests
- `.planning/phases/02-crypto-core-error-class/02-03-PUBLIC-BARREL-SUMMARY.md` — Reachability smoke-test pattern; Phase 3 widens `src/index.test.ts` with smokes for each new export per the same pattern.

### Phase 3 Source File Constraints
- `src/index.ts` — Phase 2 left it at 5 exports; Phase 3 grows it. Re-exports are alphabetized by source path (Biome `organizeImports` rule from Phase 1). The header comment must NOT match the speculative-export grep `Provider|createWebhookMiddleware|RawBodyOptions` — Phase 2 plan-defect lesson; Phase 3 can now use these literal tokens because they're real exports, not speculative.
- `src/errors.ts` — extend the `WebhookValidationReason` union with `'malformed_payload'`; extend the `messageFor` lookup table with the corresponding entry. NO other changes to this file.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/crypto/hmac.ts` (`computeHmac`) — Phase 4–5 providers will call this from inside their `Provider.computeSignature()` method. Phase 3 itself doesn't call it; the registry/factory is provider-agnostic.
- `src/crypto/compare.ts` (`timingSafeCompare`) — same as above; Phase 3 doesn't directly call it.
- `src/errors.ts` (`WebhookValidationError`, `WebhookValidationReason`, `messageFor`) — Phase 3 widens the reason union with `'malformed_payload'` (D-17) and extends `messageFor` with the corresponding entry. The class itself stays unchanged.
- `src/index.ts` — Phase 2 left a 5-export barrel; Phase 3 grows it with the factory, error handler, raw-body surfaces, types, and side-effect imports for the three providers (D-19).
- `src/index.test.ts` — Phase 2 left 5 reachability smoke tests; Phase 3 widens with smokes for each new export.

### Established Patterns
- **Co-located unit tests** (Phase 1 D-04, Phase 2 D-12) — every new `.ts` file gets a `<name>.test.ts` next to it. Phase 3 follows this for all new files.
- **Named re-exports only in `src/index.ts`** (Phase 2 03-03 pattern) — no `export *`. Adding a new internal symbol does not silently leak it.
- **Vitest config is implicit** (no `vitest.config.ts` yet) — defaults pick up `**/*.test.ts`. Phase 3 adds one only if a test needs a config knob.
- **Biome `organizeImports: "on"`** — re-exports in `src/index.ts` must stay alphabetized by source path. Inline `type` modifier on the same line as the value re-export when both are needed (Phase 2 03-03 pattern).
- **tsup `entry` glob `['src/**/*.ts', '!src/**/*.test.ts']`** (Phase 1 WR-04) — new test files in any subdirectory are excluded from `dist/` automatically. Phase 3 verifies post-build that `dist/` contains no `*.test.*` artifacts.
- **Reason union widening pattern** (Phase 2 D-07) — add the new reason value AND the test exercising it in the SAME commit. Phase 3 D-17 follows this for `'malformed_payload'`.

### Integration Points
- `src/index.ts` → public API surface; consumers `import { createWebhookMiddleware } from 'express-webhook-validator'`.
- `src/providers/registry.ts` → consumed by `src/middleware.ts` (factory looks up provider by name) and by each provider module (self-registration via top-level call).
- `src/types.ts` (or `src/express.d.ts`) → global declaration merging on `Express.Request`. Activates as soon as the consumer imports anything from the library; no separate type-only import needed.
- Phase 4 reads from: `src/providers/types.ts` (Provider interface), `src/providers/registry.ts` (registerProvider call), `src/crypto/hmac.ts`, `src/crypto/compare.ts`, `src/errors.ts`. Phase 4 widens `src/errors.ts` reason union with `'invalid_signature_format'` (per its own context).
- Phase 5 reads the same files; widens with `'invalid_encoding'`.

</code_context>

<specifics>
## Specific Ideas

- **Provider plumbing strategy preference:** user explicitly chose the registry pattern over hardcoded throwing stubs and over the "factory throws at request time" minimal variant. Planner: do NOT special-case provider names in `src/middleware.ts` (no `if (provider === 'stripe')` switch). The factory is provider-name-agnostic; it only knows how to look up a provider by string and call its interface methods.
- **Failure-timing preference:** user explicitly chose factory-call-time failure on unknown provider. Planner: do NOT defer the registration check to the first request. Throw synchronously inside `createWebhookMiddleware`, NOT inside the returned handler.
- **Registration-mechanism preference:** user explicitly chose self-registering side-effect imports over consumer-explicit `registerStripeProvider()` calls and over factory-time lazy-import. Planner: each provider module's top-level body calls `registerProvider(...)`; the public barrel imports all three. Do NOT add a `register*Provider()` to the public exports.
- **Error-type preference for unknown provider:** user explicitly chose plain `Error` over widening `WebhookValidationReason` and over a sibling `WebhookConfigError` class. Planner: keep `WebhookValidationError` exclusively for request-time validation failures with HTTP semantics.
- **Raw-body surface preference:** user explicitly chose to ship BOTH the standalone middleware AND the verify-callback helper. Planner: do NOT ship one and document the other; both must be exported, both must be tested.
- **Property-name preference for raw bytes:** user explicitly chose `req.rawBody` over `req.webhook.rawBody` and Symbol-keyed properties. Planner: do NOT stash raw bytes inside `req.webhook` (which is the consumer-facing discriminated union). Do NOT use Symbols.
- **Missing-rawBody preference:** user explicitly chose to widen the reason union with `'malformed_payload'` over throwing a plain `Error` and over silent 500s. Planner: this single addition to `WebhookValidationReason` is the ONLY widening Phase 3 makes.
- **Body-size-limit preference:** user explicitly chose default + configurable over no-limit and over hard-cap-not-configurable. Planner: ship `{ limit }` as an option on `rawBodyCapture` (and equivalently for the verify helper).
- **Branch-width preference:** user explicitly chose full per-provider branches over minimal-discriminator-only and over discriminator-with-no-fields. Planner: define every field Phase 4–5 will populate; do NOT defer fields to later phases.
- **Type-location preference:** user explicitly chose co-located in each provider module over centralized `src/types.ts` and over inline-in-middleware. Planner: each provider's branch type lives next to its (still-stub) module.
- **Express-augmentation preference:** user explicitly chose global declaration merging over typed handler wrappers (DX-03 v2) and over consumer-side casts. Planner: ship a `declare global { namespace Express { interface Request { webhook?: WebhookMetadata; rawBody?: Buffer } } }` somewhere — `src/types.ts` or a dedicated `src/express.d.ts`.
- **Optionality preference:** user explicitly chose optional-on-Request-with-narrowing-after-middleware over always-optional and over always-required. Planner: the global merge is `webhook?:`; the middleware's typed signature does the post-call narrowing.
- **Failure-delegation preference:** user explicitly chose `next(err)` over direct `res.status().json()` and over the hybrid opt-out option. Planner: middleware never writes to `res` on failure paths; always `next(err)`.
- **Response-shape preference:** user explicitly chose `{ error, reason }` JSON over plain text and over status-only. Planner: the default error handler writes both fields; the discriminated `reason` is the programmatic signal.
- **Logging preference:** user explicitly chose library-never-logs over a debug-package hook and over an `onError` callback (DX-01 v2). Planner: zero `console.*` or `debug()` calls anywhere in Phase 3 source.
- **Error-handler-mount preference:** user explicitly chose opt-in `app.use(webhookErrorHandler())` over auto-mounting on the same Router and over no-default-handler. Planner: ship the factory; the README quickstart shows mounting it; do NOT do it for the consumer.

</specifics>

<deferred>
## Deferred Ideas

- **Async secret resolution** — REQUIREMENTS.md DX-02; v2. Phase 3's `secret` option is `string` only.
- **Custom logging hook (`onError` callback)** — REQUIREMENTS.md DX-01; v2. Phase 3 ships zero observability surface.
- **Per-route TypeScript helpers** (e.g., `stripeWebhookHandler<T>`) — REQUIREMENTS.md DX-03; v2. Phase 3 ships only the global declaration merging path.
- **`onReplayWarning` callback** — ARCHITECTURE.md mentions this in the proposed API surface. Phase 3 doesn't ship it; replay protection is Stripe-only and lands in Phase 4. GitHub/Shopify replay-protection-gap documentation is Phase 7 (DOCS-02).
- **`signature` field on `req.webhook` for debugging/logging** — ARCHITECTURE.md mentions this; explicitly NOT in Phase 3 per SC4 no-leakage. If a future need emerges, revisit with a test that proves the signature value cannot leak through `req.webhook` serialization.
- **Additional reason values** (`invalid_signature_format`, `invalid_encoding`) — Phase 4 and Phase 5 territory. Per Phase 2 D-07 each reason lands with its test in the phase that introduces the failure mode.
- **Coverage gate (>90% on core)** — REQUIREMENTS.md QUAL-03; Phase 6.
- **Negative-case audit** — REQUIREMENTS.md QUAL-04; Phase 6 owns the cross-cutting audit. Phase 3 ships its own no-leakage test, but does not audit Phases 4–5 (they don't exist yet).
- **README quickstart and security notes** — REQUIREMENTS.md DOCS-01, DOCS-02; Phase 7. Phase 3's planner can write inline JSDoc/code comments but defers the user-facing prose.
- **Runnable example app** — REQUIREMENTS.md DOCS-03; Phase 7.

</deferred>

---

*Phase: 3-Body Handling & Public API Surface*
*Context gathered: 2026-05-06*
