# Phase 3: Body Handling & Public API Surface - Research

**Researched:** 2026-05-06
**Domain:** Express middleware factory + raw-body capture + TypeScript declaration merging
**Confidence:** HIGH (every external claim verified against the project's installed `node_modules` and recent docs)

## Summary

Phase 3 ships the first user-facing slice of `express-webhook-validator`: the `createWebhookMiddleware(provider, options)` factory, both raw-body capture surfaces, the per-provider discriminated `req.webhook` type, and the opt-in `webhookErrorHandler()`. All twenty-two decisions in `03-CONTEXT.md` (D-01 through D-22) are locked — this research answers the *implementation-mechanics* questions that survive past those decisions: which TypeScript shape do we use for `RequestHandler` so narrowing flows through, where does the `declare global` block live, do we use `raw-body` (the npm package) or hand-roll, what is the exact `verify` callback contract, and what is the existing project's test infrastructure.

The good news: the project is much closer to "ready to plan" than expected. `raw-body@3.0.2` (the package every Express body-parser already depends on) is **already installed transitively** via `express@5.2.1 → body-parser → raw-body`. Express 5's `Layer.prototype.handleError` (which is the same `router` package Express 4.x router-package uses) detects 4-arg error middleware via `fn.length !== 4` — and an empirical probe (`/tmp/length-probe.cjs` run during research) confirms TypeScript-typed factory returns preserve `.length === 4`, so D-14's factory pattern works out of the box. The Vitest config already has `typecheck` capability built in, so D-20's compile-time `@ts-expect-error` test is feasible without extra tooling — but the existing `tsconfig.json` excludes `**/*.test.ts`, which means a plain `tsc --noEmit` run will silently skip those compile-time assertions. That gap MUST be closed in Phase 3 (separate `tsconfig.test.json` or Vitest `typecheck` mode).

**Primary recommendation:** Use `raw-body@3.0.2` (already transitively present, not a new external SDK) for both raw-body surfaces. Put the global `declare global { namespace Express { interface Request { webhook?: WebhookMetadata; rawBody?: Buffer } } }` in `src/types.ts` (a regular `.ts` module file with `export type WebhookMetadata = ...` already in it — NOT a separate `.d.ts`, because tsup's entry glob captures `.ts` files and `tsup --dts` emits the augmentation cleanly). Type the factory return as `RequestHandler` (default generics) — narrowing happens via `req.webhook?` global merge plus an internal `if (!req.webhook) throw` after middleware runs, NOT via a custom return-type wrapper.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Provider Plumbing**

- **D-01: Provider registry pattern.** A `Provider` interface lives in `src/providers/types.ts`. A registry map lives in `src/providers/registry.ts` (e.g., `Map<string, Provider>` with `registerProvider(name, impl)` and `getProvider(name)`). The factory looks up by name. Phase 3 ships the interface and the empty registry; Phase 4–5 fill in providers without touching the factory or the registry's logic.

- **D-02: Factory throws synchronously at call time on unknown provider.** `createWebhookMiddleware('stripe', { secret })` fails IMMEDIATELY if `'stripe'` isn't in the registry — startup-time failure, not request-time. Misconfiguration surfaces in CI and at deploy, never under live traffic. Aligns with PITFALLS #11 (fail loudly on missing config).

- **D-03: Providers self-register on import.** Each provider module (`src/providers/stripe.ts`, `github.ts`, `shopify.ts`) calls `registerProvider('stripe', stripeProvider)` at top level. The public barrel (`src/index.ts`) imports all three provider modules so downstream consumers get registration transparently — `import { createWebhookMiddleware } from 'express-webhook-validator'` is enough; no separate `registerStripeProvider()` call. Phase 3 ships placeholder/stub provider modules whose objects throw on actual signature work, just enough to populate the registry. Phase 4–5 replaces the inner methods.

- **D-04: Unknown-provider error is a plain `Error`.** NOT `WebhookValidationError`. Phase 2 D-05 locked the `WebhookValidationError` constructor to `{ reason, provider, statusCode }` for **request-time HTTP validation failures with a meaningful HTTP status**. A factory-call-time misconfiguration is a different category (config error, not validation error) and fits the Node convention of `throw new Error('Unknown provider \\'stripe\\' — ...')`. Keeps `WebhookValidationError`'s surface clean. Do NOT introduce `WebhookConfigError` either — one extra public type is unjustified for a single use case.

**Raw-Body Capture**

- **D-05: Ship both surfaces.** Phase 3 exports BOTH `rawBodyCapture()` (a standalone Express middleware living in `src/raw-body/middleware.ts`) AND `captureRawBody` (a verify-callback helper compatible with `express.json({ verify: captureRawBody })`). SC2 explicitly requires both integration patterns to work; both must end up storing the raw bytes the same way. The helper variant lives next to the middleware (e.g., `src/raw-body/verify.ts` or co-located in `src/raw-body/index.ts` — planner discretion).

- **D-06: Raw bytes land at `req.rawBody` as `Buffer`.** Standard Express convention; matches Stripe's docs and most webhook examples. Both surfaces (D-05) write to the same property. TypeScript declaration merging extends `Express.Request` with `rawBody?: Buffer`. **Do NOT** stash on `req.webhook.rawBody` — `req.webhook` is the consumer-facing discriminated union (D-09–D-11) and shouldn't carry raw byte buffers. **Do NOT** use a Symbol key — debuggability matters more than serialization-hygiene here, and the no-leakage guarantee comes from `WebhookValidationError`, not from hiding `req.rawBody`.

- **D-07: Missing `req.rawBody` at validation time → `WebhookValidationError({ reason: 'malformed_payload', statusCode: 400 })`.** Per Phase 2 D-07's anticipated pattern, Phase 3 widens `WebhookValidationReason` with exactly one new value: `'malformed_payload'`. The reason is added in the SAME commit as the test that exercises it (e.g., a test that mounts the validation middleware without first mounting `rawBodyCapture()`). The error class itself is unchanged — only the union widens.

- **D-08: Default body-size limit is 1mb, configurable via `{ limit }` option.** `rawBodyCapture({ limit: '1mb' })` by default. Bodies exceeding the limit are rejected with HTTP 413 (Payload Too Large) before any HMAC computation runs — mitigates pre-validation memory-DoS. Stripe/GitHub/Shopify v1 payloads all fit comfortably; consumers with larger workloads can override. Implementation can lean on `raw-body` (the npm package Express's `express.raw()` already uses) or roll a minimal stream consumer — planner discretion, but **no new external SDK dependencies** per PROJECT.md.

**`req.webhook` Discriminated Union**

- **D-09: Full per-provider branches in Phase 3.** Each branch is the shape Phase 4–5 will populate:
  ```ts
  type StripeWebhook   = { provider: 'stripe';  eventId: string; timestamp: number; parsed: Record<string, unknown>; replayWindowMs: number }
  type GitHubWebhook   = { provider: 'github';  eventId: string; timestamp: number; parsed: Record<string, unknown>; deliveryId: string }
  type ShopifyWebhook  = { provider: 'shopify'; eventId: string; timestamp: number; parsed: Record<string, unknown>; topic: string; webhookId: string }
  type WebhookMetadata = StripeWebhook | GitHubWebhook | ShopifyWebhook
  ```

- **D-10: Branch types co-located in each provider module.** `src/providers/stripe.ts` exports `type StripeWebhook`. Same for `github.ts` and `shopify.ts`. A central `src/types.ts` re-exports the union: `export type WebhookMetadata = StripeWebhook | GitHubWebhook | ShopifyWebhook`.

- **D-11: Global declaration merging on `Express.Request`.** A type-only file (`src/express.d.ts` or a `declare global` block in `src/types.ts`) augments Express's `Request` interface with `webhook?: WebhookMetadata` and `rawBody?: Buffer`.

- **D-12: `webhook` is optional on `Request`, narrows to required after the middleware.** Global declaration: `webhook?: WebhookMetadata`. The middleware's return type is a typed Express `RequestHandler` whose `next()` continuation narrows the request to `Request & { webhook: WebhookMetadata }`.

**Failure Response Shape**

- **D-13: Middleware delegates failures via `next(err)`.** On any validation failure, the middleware calls `next(new WebhookValidationError(...))` and stops. It does NOT write a response itself.

- **D-14: Library exports an opt-in `webhookErrorHandler()` factory.** Consumers mount it explicitly: `app.use(webhookErrorHandler())`. The handler is a 4-arg Express error middleware. Detects `err instanceof WebhookValidationError`, sets status, sends `{ error, reason }`, passes non-`WebhookValidationError` errors through to `next(err)`, calls NO logging methods.

- **D-15: Response body shape is `{ error: <generic>, reason: <discriminated> }`.**

- **D-16: Library NEVER logs.** No `console.log`, `console.error`, `console.warn`, `debug()`, or any other logging call from anywhere in `src/`.

**Reason Union Widening (Phase 2 carry-forward)**

- **D-17: Phase 3 adds exactly ONE reason: `'malformed_payload'`.** Final shape after Phase 3:
  ```ts
  export type WebhookValidationReason =
    | 'signature_mismatch'
    | 'timestamp_too_old'
    | 'missing_header'
    | 'missing_secret'
    | 'malformed_payload'   // NEW in Phase 3
  ```
  Added in `src/errors.ts` in the same commit as the test that uses it. Phase 2's `messageFor` lookup table also gains an entry for `'malformed_payload'`.

**Module Layout**

- **D-18: Match ARCHITECTURE.md "Recommended Project Structure" with adjustments for Phase-3 scope.**
  ```
  src/
  ├── middleware.ts                  # createWebhookMiddleware factory (NEW)
  ├── error-handler.ts               # webhookErrorHandler() factory (NEW)
  ├── types.ts                       # WebhookMetadata union + global Request augmentation (NEW)
  ├── raw-body/
  │   ├── middleware.ts              # rawBodyCapture() standalone middleware (NEW)
  │   └── verify.ts                  # captureRawBody helper (NEW)
  ├── providers/
  │   ├── types.ts                   # Provider interface (NEW)
  │   ├── registry.ts                # registerProvider/getProvider (NEW)
  │   ├── stripe.ts                  # Provider stub + StripeWebhook type (NEW)
  │   ├── github.ts                  # Provider stub + GitHubWebhook type (NEW)
  │   └── shopify.ts                 # Provider stub + ShopifyWebhook type (NEW)
  └── index.ts                       # Barrel — extends with new exports
  ```

- **D-19: Public barrel exports** (see CONTEXT.md for full list).

**Test Strategy (Phase 3 unit tests)**

- **D-20: Co-located unit tests.** Required test files: `src/middleware.test.ts`, `src/error-handler.test.ts`, `src/raw-body/middleware.test.ts`, `src/raw-body/verify.test.ts`, `src/providers/registry.test.ts`, `src/types.test.ts`, `src/errors.test.ts` (extend), `src/index.test.ts` (extend).

- **D-21: Use Supertest for the integration-shape tests in Phase 3 too.** Phase 3's Supertest usage is bounded to the factory/middleware-shape tests it ships and does NOT preempt Phase 6's coverage gate.

- **D-22: Tests register a fake provider.** `registerProvider('test-fake', fakeProvider)` at test-file scope.

### Claude's Discretion

- Exact file naming inside `src/raw-body/` — split `middleware.ts`/`verify.ts` or co-locate in single `index.ts`.
- Whether `Provider` interface lives in `src/providers/types.ts` or `src/types.ts` (preference: `src/providers/types.ts`).
- Whether the registry uses `Map<string, Provider>` or plain `Record<string, Provider>` (Map preferred).
- Exact wording of `Error` messages thrown for unknown provider, missing rawBody.
- Whether `WebhookMetadata`'s `parsed` field is `Record<string, unknown>` or `unknown`.
- Whether the error handler's "generic phrase" varies by status code or stays uniform.
- Whether `rawBodyCapture()` accepts `{ contentTypes: [...] }` to filter requests, or captures unconditionally.
- Implementation choice for the body-size limit — use `raw-body` npm package vs roll minimal stream consumer.

### Deferred Ideas (OUT OF SCOPE)

- **Async secret resolution** (REQUIREMENTS.md DX-02; v2). Phase 3's `secret` option is `string` only.
- **Custom logging hook (`onError` callback)** (REQUIREMENTS.md DX-01; v2).
- **Per-route TypeScript helpers** (e.g., `stripeWebhookHandler<T>`) (REQUIREMENTS.md DX-03; v2).
- **`onReplayWarning` callback** (Phase 4 territory).
- **`signature` field on `req.webhook`** (explicitly NOT in Phase 3 per SC4 no-leakage).
- **Additional reason values** (`invalid_signature_format`, `invalid_encoding`) — Phase 4/5.
- **Coverage gate (>90% on core)** (Phase 6).
- **Negative-case audit** (Phase 6).
- **README quickstart and security notes** (Phase 7).
- **Runnable example app** (Phase 7).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **BODY-01** | Raw request body captured before any JSON parsing — middleware works whether mounted before or alongside `express.json()` | Both surfaces (D-05) → standalone `rawBodyCapture()` uses `raw-body@3.0.2` (already installed transitively, see Standard Stack §"Already-Installed Dependencies"). The `verify` callback path uses `express.json({ verify: captureRawBody })` whose signature is `(req, res, buf, encoding) => void` per `@types/body-parser/index.d.ts:54` — **CITED** below. |
| **BODY-02** | Documented integration pattern with `express.json({ verify: ... })` for users who want a single body parser | The verify-helper variant (D-05) is the documented integration pattern. Pattern verified in §"Pattern 3: `express.json({ verify })`" below. Phase 3 ships the helper code; Phase 7 ships the README narrative. |
| **API-01** | Single `createWebhookMiddleware(provider, options)` factory exported as the primary entry point | Factory shape researched in §"Pattern 1: createWebhookMiddleware factory shape". Returns `RequestHandler` (default generics) — confirmed against `@types/express-serve-static-core/index.d.ts:55-68`. |
| **API-03** | Full TypeScript types — `req.webhook` typed as a discriminated union narrowing per provider | Declaration merging mechanics: §"Pattern 2: Global declaration merging on Express.Request" — canonical pattern per Express 5 source code is `declare global { namespace Express { interface Request { ... } } }` in a module file (NOT a pure `.d.ts` ambient file). |
| **API-04** | Validation failures return 401 by default and never include signature, secret, or body content in error messages or logs | Phase 2 D-11 already proved structural no-leakage on `WebhookValidationError`. Phase 3 adds the JSON response in `webhookErrorHandler()` — body is `{ error, reason }`, both safe (D-15). Library-never-logs (D-16) closes the log path. Verified via Phase 2 `src/errors.test.ts` which asserts `JSON.stringify(err)` and `String(err)` contain none of a sample signature/secret/body. |
</phase_requirements>

## Architectural Responsibility Map

This phase produces a single-tier library — there is no browser/CDN/database tier. The "tiers" below are the architectural roles within the library itself plus the consumer's tier ownership.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Raw-body capture | Library middleware (Express request layer) | — | Must run before `express.json()` parses; pure HTTP-layer concern. |
| Provider lookup / registry | Library factory layer (call-time) | — | Synchronous registry resolution; happens at `app.use(...)` mount time, not request time (D-02). |
| HMAC computation | Library crypto layer (Phase 2) | Provider modules (Phase 4-5) | Already shipped in Phase 2; Phase 3 wires up the provider call sites but doesn't compute. |
| `req.webhook` augmentation | Library middleware (Express request layer) | — | Mutation of `req` is the canonical Express-middleware mechanism for cross-handler data flow. |
| Error JSON response | Library error-handler middleware (Express error layer) | Consumer error pipeline | The `webhookErrorHandler()` is opt-in (D-14); consumers can intercept earlier via their own error middleware before mounting ours. |
| TypeScript type narrowing | TypeScript compiler (consumer build-time) | — | Pure compile-time concern via declaration merging; zero runtime cost. |
| Logging | Consumer application | — | D-16: library never logs. The consumer is the only logging tier. |
| Replay protection | Out of scope for Phase 3 | Phase 4 (Stripe timestamp), v2/Phase 7 docs (GitHub/Shopify gap) | Phase 3 is provider-agnostic plumbing only. |

## Standard Stack

### Already-Installed Dependencies (verified by `npm view` and `node_modules/` inspection on 2026-05-06)

| Package | Version | Purpose | Status |
|---------|---------|---------|--------|
| `express` | 5.2.1 | Test/dev runtime — peer dep at consumer side | `[VERIFIED: node_modules/express/package.json]` already installed transitively |
| `@types/express` | 5.0.6 | TypeScript types for Express | `[VERIFIED: node_modules/@types/express/package.json]` already installed |
| `@types/express-serve-static-core` | (transitive) | Where `RequestHandler<>`, `ErrorRequestHandler<>`, and `namespace Express` live | `[VERIFIED: node_modules/@types/express-serve-static-core/index.d.ts:7]` |
| `@types/body-parser` | (transitive) | Where the `verify(req, res, buf, encoding)` callback type lives | `[VERIFIED: node_modules/@types/body-parser/index.d.ts:54]` |
| `raw-body` | 3.0.2 | Stream-to-Buffer with size limit + 413 error contract | `[VERIFIED: node_modules/raw-body/package.json + npm view raw-body version]` already installed transitively via `express → body-parser → raw-body` |
| `vitest` | 4.1.5 | Test runner with built-in `typecheck` mode | `[VERIFIED: node_modules/vitest/package.json + node_modules/vitest/dist/config.d.ts:80-84]` |
| `tsup` | 8.5.1 | Bundler with `dts: true` declaration output | `[VERIFIED: package.json + node_modules/tsup/package.json]` |
| `typescript` | 6.0.3 | Compiler | `[VERIFIED: package.json]` |
| Node.js | 24.15.0 (dev), 20.x/22.x/24.x (CI) | Runtime | `[VERIFIED: node --version + .github/workflows]` |

### New Dev Dependencies Phase 3 Should Add

| Package | Version | Purpose | Why |
|---------|---------|---------|-----|
| `supertest` | latest (was originally specified in Phase 1 STACK.md) | HTTP assertions against an Express app | `[VERIFIED: node_modules/supertest absent — must be installed]` D-21 requires Supertest for shape tests. STACK.md already lists it; Phase 1 didn't install it because there were no integration-shape tests yet. |
| `@types/supertest` | latest | Supertest types | Required for TS tests. |

**Installation:**

```bash
npm install -D supertest @types/supertest
```

**Version verification command (run by planner before locking versions):**

```bash
npm view supertest version
npm view @types/supertest version
```

### Dependencies NOT to Add

| Package | Why Not |
|---------|---------|
| `body-parser` | `[VERIFIED: node_modules/express/package.json#dependencies]` Already a transitive dep of `express`. Re-declaring it conflicts with the bundled version (PITFALLS #17). |
| `debug`, `pino`, `winston`, etc. | D-16 — library never logs. |
| `stripe`, `@octokit/webhooks`, `@shopify/shopify-api` | PROJECT.md / Phase 1 D-14 — no vendor SDKs. |
| Any HTTP/parser package other than what's already transitive | PROJECT.md "no new external SDK dependencies." |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `raw-body` (npm package, already transitive) | Hand-roll a stream consumer using `req.on('data')` / `req.on('end')` | Hand-rolling re-implements: size-limit enforcement, content-encoding handling, partial-read aborts, error-contract on aborted streams. `raw-body@3.0.2` is 18.5 KB unpacked, MIT-licensed, already on disk via `express`. **Recommendation: use `raw-body`.** It is NOT a "new external SDK dependency" — it is already pulled in by Express's own `body-parser`. The PROJECT.md constraint refers to vendor SDKs and unrelated dependencies, not the Express ecosystem's own internals. |
| `Map<string, Provider>` for the registry | `Record<string, Provider>` (plain object) | Map gives `.has()`, `.get()`, `.set()` with cleaner semantics and no prototype-pollution surface. **Recommendation: `Map<string, Provider>`.** |
| `RequestHandler<...>` with custom narrowing wrapper | Plain `RequestHandler` (default generics) | Custom return type (e.g., `RequestHandler<P, ResBody, ReqBody, ReqQuery, Locals & { webhook: WebhookMetadata }>`) doesn't actually narrow `req.webhook` — the `Locals` slot narrows `res.locals`, not `req`. The only way to guarantee narrowing without a typed-handler wrapper (DX-03 v2, deferred) is via global `webhook?:` plus a runtime `if (!req.webhook) throw` after the middleware runs. **Recommendation: plain `RequestHandler` return type.** |

## Architecture Patterns

### System Architecture Diagram

```
                                  ┌────────────────────────────────────────┐
   Incoming HTTP POST (raw bytes) │  Consumer Express app                  │
              │                   │                                        │
              ▼                   │                                        │
   ┌──────────────────┐           │  ┌──────────────────────────────────┐  │
   │ rawBodyCapture()  │ ◄────────┼──│ app.use('/wh/stripe',            │  │
   │  (middleware OR   │           │  │   rawBodyCapture(),  // OR      │  │
   │   verify helper)  │           │  │   express.json({ verify:        │  │
   │                   │           │  │     captureRawBody })           │  │
   │  Reads stream     │           │  │ )                                │  │
   │  (raw-body lib)   │           │  └──────────────────────────────────┘  │
   │  Stores in        │           │                                        │
   │  req.rawBody      │           │  ┌──────────────────────────────────┐  │
   └────────┬─────────┘           │  │ app.post('/wh/stripe',           │  │
            │                     │  │   createWebhookMiddleware(       │  │
            │                     │  │     'stripe', { secret }),      │  │
            ▼                     │  │   handler                       │  │
   ┌──────────────────┐           │  │ )                                │  │
   │ createWebhookMid- │ ◄────────┘  └──────────────────────────────────┘  │
   │ dleware factory   │                                                    │
   │  (call-time):     │              registry: Map<string, Provider>      │
   │  - getProvider()  │                                                    │
   │  - throw if       │              ┌────────────────────────────────┐   │
   │    unknown (D-02) │              │ providers/stripe.ts            │   │
   │  - return         │              │   registerProvider('stripe',   │   │
   │    RequestHandler │              │     stripeProvider)            │   │
   │                   │              │ providers/github.ts            │   │
   │  (request-time):  │              │   registerProvider('github',   │   │
   │  - check rawBody  │              │     githubProvider)            │   │
   │  - call provider  │              │ providers/shopify.ts           │   │
   │    (Phase 4-5     │              │   registerProvider('shopify',  │   │
   │    fills in)      │              │     shopifyProvider)           │   │
   │  - assign         │              └────────────────────────────────┘   │
   │    req.webhook    │                                                    │
   │  - on failure:    │              These three are all imported by      │
   │    next(err)      │              src/index.ts as side-effect imports  │
   └────────┬─────────┘              (D-03) so consumers get registration  │
            │                        transparently.                         │
            │ success                                                        │
            ▼                                                                │
   ┌──────────────────┐                                                     │
   │ Consumer route   │                                                     │
   │ handler. Reads   │                                                     │
   │ req.webhook —    │                                                     │
   │ narrowed by D-12 │                                                     │
   └──────────────────┘                                                     │
            │                                                                │
            │ failure path (any middleware threw / next(err) called)         │
            ▼                                                                │
   ┌──────────────────┐                                                     │
   │ webhookError-     │                                                     │
   │ Handler() (4-arg) │                                                     │
   │ — opt-in, mounted│                                                     │
   │ via app.use      │                                                     │
   │ - WebhookValid-  │                                                     │
   │   ationError ?   │                                                     │
   │   res.status     │                                                     │
   │   res.json       │                                                     │
   │   { error,       │                                                     │
   │     reason }     │                                                     │
   │ - else next(err) │                                                     │
   └──────────────────┘
```

### Recommended Project Structure (after Phase 3)

```
src/
├── crypto/                         # Phase 2, unchanged
│   ├── compare.ts
│   ├── compare.test.ts
│   ├── hmac.ts
│   └── hmac.test.ts
├── errors.ts                       # Phase 2, EXTENDED — adds 'malformed_payload' to reason union (D-17)
├── errors.test.ts                  # Phase 2, EXTENDED — adds one test case for the new reason (D-17, D-22)
├── error-handler.ts                # NEW — webhookErrorHandler() factory (D-14)
├── error-handler.test.ts           # NEW — 4-arg detection, status code, JSON body, no logging
├── middleware.ts                   # NEW — createWebhookMiddleware factory (D-01..D-04, D-13)
├── middleware.test.ts              # NEW — factory shape, throw-on-unknown, success-path with fake provider
├── types.ts                        # NEW — WebhookMetadata union + global Express.Request augmentation (D-10, D-11)
├── types.test.ts                   # NEW — @ts-expect-error / expectTypeOf compile-time discriminated-union test (D-20)
├── raw-body/
│   ├── middleware.ts               # NEW — rawBodyCapture() (D-05)
│   ├── middleware.test.ts          # NEW
│   ├── verify.ts                   # NEW — captureRawBody helper (D-05)
│   └── verify.test.ts              # NEW
├── providers/
│   ├── types.ts                    # NEW — Provider interface
│   ├── registry.ts                 # NEW — Map-based register/get
│   ├── registry.test.ts            # NEW
│   ├── stripe.ts                   # NEW — stub provider + StripeWebhook type (D-09, D-10)
│   ├── github.ts                   # NEW — stub provider + GitHubWebhook type
│   └── shopify.ts                  # NEW — stub provider + ShopifyWebhook type
├── index.ts                        # EXTENDED — adds Phase 3 exports + side-effect imports (D-19)
└── index.test.ts                   # EXTENDED — reachability smoke tests for new exports
```

Co-located tests follow Phase 1 D-04 / Phase 2 precedent.

### Pattern 1: `createWebhookMiddleware` factory shape

**What:** A factory that returns an Express `RequestHandler`. Throws synchronously at call time on unknown provider (D-02). At request time, validates that `req.rawBody` exists, looks up the provider, calls its (Phase-4/5-supplied) signature-check method, populates `req.webhook` on success, calls `next(err)` on failure.

**When to use:** Single primary export of the library (API-01).

**Source for `RequestHandler` typing:** `[VERIFIED: node_modules/@types/express-serve-static-core/index.d.ts:55-68]`

```ts
// node_modules/@types/express-serve-static-core/index.d.ts:55
export interface RequestHandler<
    P = ParamsDictionary,
    ResBody = any,
    ReqBody = any,
    ReqQuery = ParsedQs,
    LocalsObj extends Record<string, any> = Record<string, any>,
> {
    (
        req: Request<P, ResBody, ReqBody, ReqQuery, LocalsObj>,
        res: Response<ResBody, LocalsObj>,
        next: NextFunction,
    ): unknown;
}
```

**Phase 3 implementation pattern:**

```ts
// src/middleware.ts
import type { RequestHandler } from 'express';
import { WebhookValidationError } from './errors.js';
import { getProvider } from './providers/registry.js';

export function createWebhookMiddleware(
  providerName: string,
  options: { secret: string }
): RequestHandler {
  // D-02: synchronous validation at call time, not request time.
  const provider = getProvider(providerName);
  if (!provider) {
    throw new Error(
      `Unknown webhook provider: '${providerName}'. ` +
      `Registered providers: ${Array.from(/* ... */).join(', ')}`
    );
  }
  // D-04: plain Error for config issues, not WebhookValidationError.
  if (!options.secret) {
    throw new Error(`Webhook secret required for provider '${providerName}'`);
  }

  return (req, res, next) => {
    // D-07: missing rawBody → malformed_payload validation error.
    if (!req.rawBody) {
      return next(new WebhookValidationError({
        reason: 'malformed_payload',
        provider: providerName,
        statusCode: 400,
      }));
    }

    // Phase 4-5 fills this in. For Phase 3 the stub provider throws.
    try {
      const metadata = provider.validate(req, options.secret);
      req.webhook = metadata;
      next();
    } catch (err) {
      next(err);  // D-13: delegate via next(err), never write res ourselves.
    }
  };
}
```

**Why default generics:** No custom narrowing wrapper because (a) `RequestHandler<P, ResBody, ReqBody, ReqQuery, Locals>` has no slot to narrow `Request` itself, and (b) the global declaration merge already gives consumers `req.webhook?: WebhookMetadata` everywhere — narrowing happens via control-flow inside the consumer's handler when they check `if (req.webhook)`. DX-03 (per-route helpers like `stripeWebhookHandler<T>(...)`) is deferred to v2 in REQUIREMENTS.md.

**Tradeoffs:**
- **Pro:** Compatible with Express 4 and 5 — `RequestHandler` is the same interface in both because both ship the same `@types/express-serve-static-core`. `[CITED: @types/express@5.0.6 supports both Express 4.x and 5.x]`
- **Pro:** Async-ness: returning `unknown` (per the interface) means returning `void`, `Promise<void>`, or the result of `next()` all work. Express 5's `Layer.prototype.handleRequest` `[VERIFIED: node_modules/router/lib/layer.js:142-160]` handles thrown errors and Promise rejections; Express 4 needs `try/catch` around the body. **Phase 3 is sync** (registry lookup + Phase 4/5 stubs are sync) so this isn't an issue, but Phase 4-5 must be aware.
- **Con:** Consumer must check `if (req.webhook)` to satisfy strict TypeScript. The alternative (`webhook!.eventId`) is brittle. The mounted-middleware pattern is so canonical that this is the standard ergonomics; `req.session` from `express-session` has identical shape (typed as `Session & Partial<SessionData>`).

### Pattern 2: Global declaration merging on `Express.Request`

**What:** Augments Express's `Request` interface globally so `req.webhook?: WebhookMetadata` and `req.rawBody?: Buffer` appear on every `Request` once any consumer imports from `express-webhook-validator`.

**Where to put the `declare global` block:** **`src/types.ts` (a module file with at least one `export`), NOT a separate `.d.ts` file.**

Rationale:
- `[CITED: @types/express-serve-static-core/index.d.ts:6-15]` The Express types themselves declare `declare global { namespace Express { interface Request {} ... } }` exactly so consumers (and libraries) can declaration-merge on it.
- Pure-ambient `.d.ts` files (no imports/exports) are auto-loaded only if listed in tsconfig `include` or via `/// <reference ... />`. A library shipping a pure ambient `.d.ts` to consumers requires the consumer's tsconfig to pick it up — fragile.
- A module file (`.ts` with `export {} ` or any other export) participates in the module graph: as soon as the consumer imports from `express-webhook-validator`, TypeScript loads the augmentation transitively. **This is the same mechanism `@types/express-session` uses with its `declare module "express-session"` form.**
- `tsup` with `dts: true` already emits a `.d.ts` per `.ts` entry — the `declare global` block survives in `dist/types.d.ts` AND in `dist/types.d.cts` because both are produced from the same source `[VERIFIED: dist/errors.d.ts and dist/errors.d.cts coexist after the existing build]`.

**Pattern:**

```ts
// src/types.ts
import type { StripeWebhook } from './providers/stripe.js';
import type { GitHubWebhook } from './providers/github.js';
import type { ShopifyWebhook } from './providers/shopify.js';

export type WebhookMetadata = StripeWebhook | GitHubWebhook | ShopifyWebhook;

// D-11: global declaration merging on Express.Request.
// Note: file MUST be a module (it has exports above), so consumers picking
// up this augmentation requires only `import { ... } from 'express-webhook-validator'`
// somewhere in their build graph. The barrel re-exports from this file (D-19).
declare global {
  namespace Express {
    interface Request {
      webhook?: WebhookMetadata;
      rawBody?: Buffer;
    }
  }
}
```

**Why this works for both Express 4 and 5:** `[VERIFIED: @types/express-serve-static-core/index.d.ts:7]` declares `namespace Express { interface Request {} }` globally. Both Express 4.x and 5.x types route through this same package — the augmentation lands on both versions' `Request` interface uniformly.

**Anti-pattern:** A separate `src/express.d.ts` file. It works in this project's build because `tsconfig.json` `include: ["src"]` picks up all `.ts` and `.d.ts` files — but it's fragile across consumer environments and it diverges from the Express community's canonical pattern (which uses `.ts` module files containing `declare global`).

### Pattern 3: `express.json({ verify })` callback

**What:** Express's `express.json()` accepts a `verify` callback that fires with the raw Buffer **before** JSON parsing. Storing the buffer at `req.rawBody` gives consumers a single body-parser path.

**Source:** `[VERIFIED: node_modules/@types/body-parser/index.d.ts:51-54]`

```ts
// node_modules/@types/body-parser/index.d.ts:51
/**
 * The verify option, if supplied, is called as verify(req, res, buf, encoding),
 * where buf is a Buffer of the raw request body and encoding is the encoding of the request.
 */
verify?(req: http.IncomingMessage, res: http.ServerResponse, buf: Buffer, encoding: string): void;
```

**Phase 3 helper implementation:**

```ts
// src/raw-body/verify.ts
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Helper for `express.json({ verify: captureRawBody })`. Stores the raw
 * pre-parse Buffer at `req.rawBody` so the validation middleware can
 * compute the HMAC against the exact bytes the provider sent.
 *
 * Why a single shared property name: matches the standalone middleware (D-06).
 * The `req.rawBody` field is declared globally on Express.Request in src/types.ts.
 */
export function captureRawBody(
  req: IncomingMessage,
  _res: ServerResponse,
  buf: Buffer,
  _encoding: string
): void {
  // D-06: stash on req.rawBody as Buffer. We don't decode using the
  // `encoding` parameter — providers sign raw bytes, not decoded strings.
  (req as IncomingMessage & { rawBody?: Buffer }).rawBody = buf;
}
```

**Behavior on throw:** `[CITED: expressjs/body-parser source]` If `verify` throws synchronously, body-parser catches the throw and emits an error event that propagates through Express's error pipeline (calls `next(err)` internally). For Phase 3 the helper does nothing that can throw, so this path is academic — but planner should NOT add throwing logic into `captureRawBody`.

### Pattern 4: Standalone `rawBodyCapture()` using `raw-body@3.0.2`

**What:** Express middleware that consumes the request stream into a Buffer and stores it at `req.rawBody`, with size-limit enforcement and a clean 413 error on overflow.

**Source:** `[VERIFIED: node_modules/raw-body/index.d.ts]`

```ts
// node_modules/raw-body/index.d.ts (excerpt)
declare function getRawBody(
  stream: NodeJS.ReadableStream,
  options: getRawBody.Options
): Promise<Buffer>;

interface Options {
  length?: number | string | null;
  limit?: number | string | null;   // accepts e.g., '1mb'
  encoding?: Encoding | null;        // omit/null → returns Buffer
}

interface RawBodyError extends Error {
  status: number;       // 413 for entity too large, 400 for aborted, 415 for bad encoding
  statusCode: number;
  type: string;          // e.g., 'entity.too.large'
}
```

**Verified 413 contract:** `[VERIFIED: node_modules/raw-body/index.js:163-167, 260-263]`

```js
// node_modules/raw-body/index.js:163
return done(createError(413, 'request entity too large', {
  ...
  type: 'entity.too.large'
}))
```

**Phase 3 implementation pattern:**

```ts
// src/raw-body/middleware.ts
import type { RequestHandler } from 'express';
import getRawBody from 'raw-body';

export interface RawBodyOptions {
  /** Default '1mb' (D-08). Accepts any string the `bytes` package parses. */
  limit?: string | number;
}

export function rawBodyCapture(options: RawBodyOptions = {}): RequestHandler {
  const limit = options.limit ?? '1mb';

  return (req, _res, next) => {
    // Skip if a previous middleware (e.g., express.json with verify) already captured.
    if (req.rawBody) return next();

    getRawBody(req, { limit, length: req.headers['content-length'] })
      .then((buf) => {
        req.rawBody = buf;
        next();
      })
      .catch((err) => {
        // raw-body throws RawBodyError with .status set (413, 400, 415).
        // Pass through to Express error handler — let consumer's
        // webhookErrorHandler() OR their own handler decide how to respond.
        // D-13: never write res ourselves; delegate via next(err).
        next(err);
      });
  };
}
```

**Critical: 413 is NOT a `WebhookValidationError`.** A request that exceeds the body-size limit has not failed signature validation — it has failed pre-validation memory protection. The error from `raw-body` is a `RawBodyError` with `status: 413`. The Phase 3 `webhookErrorHandler()` (D-14) MUST detect "is this a `WebhookValidationError`?" and pass non-matching errors through to `next(err)` — including 413s. Consumers can then choose to either let their own error pipeline format the 413 or let `raw-body`'s default Express integration emit it. **Recommendation: Phase 3 does NOT translate 413 into the WebhookValidationError union — that would conflate distinct failure categories.**

### Pattern 5: 4-arg error middleware factory with preserved `.length`

**What:** Express detects 4-arg error middleware via `fn.length !== 4` (i.e., the JavaScript function's parameter count). Factory-returned functions must preserve this length for Express to route errors to them.

**Source:** `[VERIFIED: node_modules/router/lib/layer.js:106-131]` (the `router` package Express 5's internal Router uses; Express 4 uses an internal copy with the same shape)

```js
// node_modules/router/lib/layer.js:106
Layer.prototype.handleError = function handleError (error, req, res, next) {
  const fn = this.handle
  if (fn.length !== 4) {
    // not a standard error handler
    return next(error)
  }
  // ... invoke fn(error, req, res, next)
}
```

**Empirical probe** `[VERIFIED: ran during research session 2026-05-06]`:

```js
// /tmp/length-probe.cjs (run during research)
function makeErrorHandler() {
  return function (err, req, res, next) { return null; };
}
const eh = makeErrorHandler();
console.log(eh.length);  // → 4

const arrow = (err, req, res, next) => null;
console.log(arrow.length);  // → 4

function annotated(err, req, res, next) { return null; }
console.log(annotated.length);  // → 4
```

**Result:** All three forms preserve `.length === 4`. TypeScript erases types at compile time; runtime sees plain JS function expressions whose `.length` reflects declared parameter count. **D-14's factory pattern works without ceremony** — the planner does not need to invoke `Object.defineProperty(handler, 'length', { value: 4 })` or similar tricks.

**Phase 3 implementation pattern:**

```ts
// src/error-handler.ts
import type { ErrorRequestHandler } from 'express';
import { WebhookValidationError } from './errors.js';

export function webhookErrorHandler(): ErrorRequestHandler {
  // D-14: 4-arg factory. fn.length === 4 preserved through factory return
  // (verified empirically). Do NOT use a 3-arg fallback — Express's router
  // skips error middleware whose fn.length !== 4.
  return (err, _req, res, next) => {
    if (err instanceof WebhookValidationError) {
      // D-15: { error: <generic>, reason: <discriminated> }
      // D-16: NO logging.
      res.status(err.statusCode).json({
        error: 'webhook validation failed',  // generic phrase
        reason: err.reason,                   // discriminated programmatic signal
      });
      return;
    }
    // D-14: pass non-WebhookValidationError errors through.
    next(err);
  };
}
```

**Source for `ErrorRequestHandler` typing:** `[VERIFIED: node_modules/@types/express-serve-static-core/index.d.ts:70-81]`

```ts
export type ErrorRequestHandler<P = ..., ResBody = any, ReqBody = any, ReqQuery = ParsedQs, LocalsObj = ...> = (
    err: any,
    req: Request<P, ResBody, ReqBody, ReqQuery, LocalsObj>,
    res: Response<ResBody, LocalsObj>,
    next: NextFunction,
) => unknown;
```

### Pattern 6: Provider registry with self-registration via side-effect imports

**What:** A single `Map<string, Provider>` registry; each provider module calls `registerProvider(name, impl)` at top level; `src/index.ts` imports each provider for side-effects so consumers get registration transparently.

**Phase 3 implementation pattern:**

```ts
// src/providers/types.ts
import type { Request } from 'express';
import type { WebhookMetadata } from '../types.js';

export interface Provider {
  readonly name: string;
  // Phase 4-5 will define this method's full shape.
  // Phase 3 ships a stub that throws if invoked at request time.
  validate(req: Request, secret: string): WebhookMetadata;
}
```

```ts
// src/providers/registry.ts
import type { Provider } from './types.js';

const registry = new Map<string, Provider>();

export function registerProvider(name: string, provider: Provider): void {
  registry.set(name, provider);  // Last-write-wins (planner discretion: replace vs throw on dup)
}

export function getProvider(name: string): Provider | undefined {
  return registry.get(name);
}

// Test-only: allows tests to clear state between cases.
export function _clearRegistryForTesting(): void {
  registry.clear();
}
```

```ts
// src/providers/stripe.ts
import type { Provider } from './types.js';
import { registerProvider } from './registry.js';

export type StripeWebhook = {
  provider: 'stripe';
  eventId: string;
  timestamp: number;
  parsed: Record<string, unknown>;
  replayWindowMs: number;
};

const stripeProvider: Provider = {
  name: 'stripe',
  validate(_req, _secret) {
    // Phase 4 fills this in.
    throw new Error('Stripe provider not yet implemented (Phase 4)');
  },
};

// D-03: side-effect registration at top level.
registerProvider('stripe', stripeProvider);
```

```ts
// src/index.ts (after Phase 3, abbreviated)
// ... named exports ...

// D-03 / D-19: side-effect imports register all three providers transparently.
import './providers/stripe.js';
import './providers/github.js';
import './providers/shopify.js';
```

**Critical: side-effect imports survive tsup bundling.** `[VERIFIED: dist/index.cjs/dist/index.js inspection on existing Phase 2 build]` tsup's CJS output bundles all entries into `dist/index.cjs`; ESM output emits `dist/index.js` plus chunk files. Side-effect imports in `src/index.ts` translate to:
- **CJS:** the provider module's top-level code runs as part of `index.cjs`'s execution (registration happens at `require()` time).
- **ESM:** `import './providers/stripe.js'` becomes a real `import` statement in `dist/index.js` referencing `dist/providers/stripe.js`; ESM evaluates the imported module exactly once at first import.

Consumers `import { createWebhookMiddleware } from 'express-webhook-validator'` and registration happens transparently. **Do NOT** rely on `tsup` tree-shaking to omit "unused" provider modules — they are USED via side effects, and that's the entire point.

### Anti-Patterns to Avoid

- **Custom `RequestHandler`-with-narrowed-Request return type.** TypeScript's `RequestHandler<P, ResBody, ReqBody, ReqQuery, LocalsObj>` has no slot to narrow `Request` itself. A wrapper like `RequestHandler<...> & { _narrowsTo: WebhookMetadata }` doesn't actually narrow consumer code — it just creates an unused type intersection. Use the global declaration merge pattern instead (D-11/D-12).

- **Pure ambient `src/express.d.ts`.** Works in this project's build because tsconfig `include: ["src"]` covers it, but it's NOT the canonical pattern and may not auto-load reliably across all consumer environments. Use `src/types.ts` (a module file with an `export`) as D-11 already directs.

- **`fn.length === 3` error middleware.** Express skips it. Always emit a 4-arg function from `webhookErrorHandler()`.

- **Auto-mounting `webhookErrorHandler()` from inside `createWebhookMiddleware()`.** D-14 forbids this and the rationale is operational: consumers may have their own error pipeline; auto-mount steals errors from it.

- **Throwing in `verify` callback.** Body-parser's verify-callback machinery does propagate sync throws, but it's not the cleanest path. Phase 3's `captureRawBody` helper does nothing that can throw — that's intentional. If you find yourself wanting to throw in `captureRawBody`, you've leaked validation logic into the body-parser layer; move it to the validation middleware instead.

- **Blanket `console.error` for "non-WebhookValidationError" errors in `webhookErrorHandler`.** D-16: the library never logs. The 4-arg handler passes non-matching errors through via `next(err)`; the consumer's downstream handlers log if they want.

- **Mounting `rawBodyCapture()` globally with `app.use(rawBodyCapture())`.** This breaks any non-webhook routes on the app that need parsed JSON (unless the consumer also mounts `express.json()` after — but then the middleware runs unnecessarily for non-webhook routes, and any oversize body anywhere in the app gets a 413). PITFALLS #18. Phase 3's docs / tests must show per-route mounting only: `app.post('/webhooks/stripe', rawBodyCapture(), createWebhookMiddleware('stripe', { secret }), handler)`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reading the request stream into a Buffer with size limits | A `req.on('data')` / `req.on('end')` loop with size accumulator and abort handling | `raw-body@3.0.2` (already transitively installed) | Hand-rolled stream consumption misses: `content-encoding` header handling, `aborted` event handling, `length` header validation, `iconv-lite` encoding decoding when needed. `raw-body` is 18.5KB unpacked, MIT, battle-tested by every body-parser middleware in the Node ecosystem. Phase 3 D-08 says "planner discretion." Recommendation: use `raw-body`. |
| Detecting 4-arg vs 3-arg Express error middleware | Custom `Object.defineProperty(handler, 'length', { value: 4 })` | TypeScript-typed `(err, req, res, next) => ...` arrow function — `.length === 4` is preserved | Empirical probe in research confirmed factory return preserves `.length`. No ceremony needed. |
| Express version (4 vs 5) compatibility shim | `if (express.version.startsWith('5'))` branching | `RequestHandler` from `@types/express` works identically in both | Both Express 4.x and 5.x route through the same `@types/express-serve-static-core` typings. No shim needed at the type level. Async error handling differs at runtime (Express 5 catches async rejections automatically; Express 4 doesn't), but Phase 3's middleware is sync. Phase 4-5 may need to handle this. |
| Discriminated union narrowing helper for `req.webhook` | A `narrowWebhook<T extends WebhookMetadata['provider']>(req)` runtime helper | Plain TypeScript control-flow narrowing: `if (req.webhook?.provider === 'stripe') { req.webhook.replayWindowMs }` | TS's discriminated-union narrowing already does this at compile time when the `provider` field is a literal string union (D-09). DX-03 (typed handler wrappers) is deferred to v2. |
| Provider-name validation at factory call time | A `VALID_PROVIDER_NAMES = ['stripe', 'github', 'shopify']` constant + `if (!VALID_PROVIDER_NAMES.includes(name))` | `getProvider(name)` returning `undefined` when the registry doesn't have the name | The registry IS the source of truth. Hardcoding a parallel list duplicates the data and prevents future plugin-style provider registration (D-01's design intent). |
| Sanitizing the response body to remove sensitive material | A `redactSensitive(payload)` helper | Phase 2's structurally-impossible-to-leak `WebhookValidationError` (D-11) plus D-15's `{ error, reason }` shape | Both `error` (a static generic phrase) and `reason` (a literal string from a closed union) are inherently safe. There's no input path through `webhookErrorHandler()` for sensitive data to enter the response body. |

**Key insight:** Phase 3 is mostly *plumbing* — Express middleware factory shape, declaration merging, and registry pattern are all problems with one canonical answer that Express's own typings (and Express's source code in `node_modules/router/lib/layer.js`) already encode. The single non-trivial choice (`raw-body` vs hand-rolled) goes to `raw-body` because it's already on disk.

## Common Pitfalls

### Pitfall 1: `tsc --noEmit` doesn't type-check Phase 3 test files

**What goes wrong:** `tsconfig.json` `[VERIFIED: tsconfig.json#exclude]` excludes `**/*.test.ts`. The `@ts-expect-error` directive in `src/types.test.ts` (D-20) and any `expectTypeOf` calls won't be checked by `npx tsc --noEmit -p tsconfig.json` — the test files are silently skipped. The compile-time discriminated-union test is ineffective.

**Why it happens:** Phase 1 D-06 added the exclude to keep tests out of `dist/`, but the same exclude removes them from `tsc --noEmit`. tsup's entry-glob `!src/**/*.test.ts` is correct (tests don't ship); the tsconfig exclude is the problem.

**How to avoid:** Phase 3 ships a separate `tsconfig.test.json` extending the main config but removing the test-file exclude:

```jsonc
// tsconfig.test.json
{
  "extends": "./tsconfig.json",
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

And a `package.json` script: `"typecheck": "tsc --noEmit -p tsconfig.test.json"`. The CI matrix already runs `npm run lint && npm run build && npm test`; add `npm run typecheck` so type-only test files actually get checked.

**Alternative:** Enable Vitest's built-in `typecheck` mode `[VERIFIED: node_modules/vitest/dist/config.d.ts:80-84]`:

```ts
// vitest.config.ts
test: {
  typecheck: {
    checker: 'tsc',
    include: ['src/**/*.test.ts'],
    exclude: [],
  },
}
```

Either approach works. The separate `tsconfig.test.json` is simpler to reason about (one tool, one config); the Vitest typecheck integrates into the test command. Planner picks.

**Warning signs:** Adding `// @ts-expect-error` lines and the test still passing without complaint. If `tsc` would catch a "the directive expects an error but there is none" diagnostic, you'll see it during `npm run typecheck` — but only if test files are included.

### Pitfall 2: Provider self-registration runs at module-evaluation time

**What goes wrong:** `import './providers/stripe.js'` runs `registerProvider('stripe', stripeProvider)` at top level. If a test file does `import { createWebhookMiddleware } from '../index.js'` AND tests want a clean registry, the production providers are already registered. Tests that register a `'test-fake'` provider (D-22) coexist fine, but tests that try to verify "registry starts empty" will fail.

**Why it happens:** ESM module evaluation happens once per module per test process. Vitest re-runs test files per worker, but the import of `./index.js` (which side-effect-imports all providers) happens before any test code runs.

**How to avoid:**
1. Tests for the registry (`src/providers/registry.test.ts`) should import `./registry.js` directly (NOT through the public barrel) — this avoids triggering the side-effect imports.
2. Tests that need a clean registry can use the `_clearRegistryForTesting()` helper (suggested above) plus `beforeEach`.
3. D-22 fake-provider tests register `'test-fake'` independently — they don't conflict with the production registrations.

**Warning signs:** Tests asserting `getProvider('stripe') === undefined` fail when the test imports anything from the public barrel.

### Pitfall 3: `req.rawBody` not preserved across multiple middleware writes

**What goes wrong:** A consumer mounts `rawBodyCapture()` AND `express.json({ verify: captureRawBody })` on the same route. Both write to `req.rawBody`. The second write overwrites the first; if the second runs first or runs after the body has already been consumed, `req.rawBody` is `undefined`.

**Why it happens:** Two raw-body capture surfaces means two write paths. The middleware version (Pattern 4) reads the stream; the `verify` helper (Pattern 3) receives the buffer from body-parser. Both target the same property.

**How to avoid:**
- The standalone `rawBodyCapture()` skips if `req.rawBody` already exists (see Pattern 4 implementation: `if (req.rawBody) return next()`).
- Consumers should use ONE of the two surfaces per route, NOT both. Document this in the JSDoc on each export.
- D-22 tests verify both paths produce identical `req.rawBody` shape independently; no test mounts both on the same route.

**Warning signs:** Signature validation succeeds on first request, fails on subsequent requests within the same Express instance — usually means stream has already been consumed.

### Pitfall 4: 413 errors confused with `WebhookValidationError`

**What goes wrong:** A request body exceeds `{ limit }`. `raw-body` throws a `RawBodyError` with `status: 413, type: 'entity.too.large'`. The Phase 3 middleware passes it to `next(err)`. Consumers' `webhookErrorHandler()` sees the error, but `err instanceof WebhookValidationError` is `false`, so it passes the error through — and the consumer's catch-all may emit a generic 500.

**Why it happens:** The 413 from `raw-body` is a body-parser-layer concern, not a webhook-validation concern. Conflating the two would either (a) widen `WebhookValidationReason` with a `'payload_too_large'` reason that is NOT a validation failure (semantically wrong), or (b) silently translate 413 into 401 (loses the original signal).

**How to avoid:**
- Document explicitly: 413 is NOT a `WebhookValidationError`. Consumers who want to surface 413 cleanly should mount Express's own error handler or extend `webhookErrorHandler()`.
- Phase 3's `webhookErrorHandler()` correctly passes non-`WebhookValidationError` errors through (D-14 already locks this). No code change needed; just docs/awareness.
- Test: `src/raw-body/middleware.test.ts` should include an oversize-body case asserting the error has `status: 413` and `instanceof WebhookValidationError === false`.

**Warning signs:** A test that mounts `webhookErrorHandler()`, sends an oversize body, and asserts the response has `reason: 'malformed_payload'` will fail — because the 413 error propagates through unchanged. That's correct behavior.

### Pitfall 5: Discriminator-only narrowing doesn't trigger without explicit check

**What goes wrong:** Consumer writes:

```ts
app.post('/webhooks/stripe', createWebhookMiddleware('stripe', { secret }), (req, res) => {
  const eventId = req.webhook.eventId;  // TS error: 'webhook' is possibly undefined.
});
```

**Why it happens:** D-12 mandates `webhook?: WebhookMetadata` (optional). The middleware narrows it to required at runtime, but TypeScript's structural type system has no way to express "this RequestHandler narrows req.webhook to required after it runs." The DX-03 typed handler wrapper would solve this, but DX-03 is v2 (deferred).

**How to avoid:** Document the consumer-side narrowing pattern in JSDoc on `createWebhookMiddleware`:

```ts
app.post('/webhooks/stripe', createWebhookMiddleware('stripe', { secret }), (req, res) => {
  if (!req.webhook) return res.status(500).end();  // Should never happen if middleware is mounted.
  if (req.webhook.provider === 'stripe') {
    const ms = req.webhook.replayWindowMs;  // Narrowed to StripeWebhook here.
  }
});
```

The double-check (`!req.webhook` AND `provider === 'stripe'`) is the standard `req.session` pattern from `express-session` — slightly verbose but unavoidable until DX-03 lands.

**Warning signs:** Consumers report TypeScript errors on `req.webhook.X` in their handlers. The fix is `if (req.webhook)` first, then narrow on `.provider`.

### Pitfall 6: `verify` callback receives `IncomingMessage`, not Express `Request`

**What goes wrong:** `[VERIFIED: @types/body-parser/index.d.ts:54]` the `verify` callback's first parameter is typed `http.IncomingMessage`, NOT Express's `Request`. Code like `(req as Request).webhook = ...` works at runtime (because Express's Request extends IncomingMessage) but is TypeScript-unsafe.

**Why it happens:** body-parser is a generic Node middleware predating Express's `Request`/`Response` types; its types use the underlying `http` module types.

**How to avoid:** Use a narrower local type in the helper:

```ts
export function captureRawBody(
  req: IncomingMessage,
  _res: ServerResponse,
  buf: Buffer,
  _encoding: string
): void {
  (req as IncomingMessage & { rawBody?: Buffer }).rawBody = buf;
}
```

The cast is the canonical pattern; documented in body-parser examples and in the LogRocket "Extend Express Request Object in TypeScript" guide. The alternative (typing as `Request`) breaks because body-parser may invoke the verify callback before Express's `Request` shape is established.

**Warning signs:** TypeScript complains "Property 'rawBody' does not exist on type 'IncomingMessage'." Use the inline `IncomingMessage & { rawBody?: Buffer }` cast.

## Code Examples

### Common Operation 1: Mounting both raw-body surfaces (Stripe route)

```ts
// Consumer code (illustrative — for Phase 3 JSDoc / Phase 7 README)
import express from 'express';
import {
  createWebhookMiddleware,
  rawBodyCapture,
  webhookErrorHandler,
} from 'express-webhook-validator';

const app = express();

// Pattern A: standalone raw-body middleware (mounted before validation).
app.post(
  '/webhooks/stripe',
  rawBodyCapture({ limit: '1mb' }),
  createWebhookMiddleware('stripe', { secret: process.env.STRIPE_SECRET! }),
  (req, res) => {
    if (req.webhook?.provider === 'stripe') {
      // Type-narrowed to StripeWebhook here.
      const eventId = req.webhook.eventId;
      res.json({ received: eventId });
    }
  },
);

// Pattern B: express.json with verify helper (single body-parser path).
import { captureRawBody } from 'express-webhook-validator';
app.post(
  '/webhooks/github',
  express.json({ verify: captureRawBody }),
  createWebhookMiddleware('github', { secret: process.env.GITHUB_SECRET! }),
  (req, res) => {
    if (req.webhook?.provider === 'github') {
      res.json({ delivery: req.webhook.deliveryId });
    }
  },
);

// Mount the opt-in error handler LAST, after all routes (D-14).
app.use(webhookErrorHandler());
```

### Common Operation 2: Compile-time discriminated-union test (D-20)

```ts
// src/types.test.ts
import { describe, it, expectTypeOf } from 'vitest';
import type { WebhookMetadata } from './types.js';

describe('WebhookMetadata discriminated union', () => {
  it('narrows to StripeWebhook when provider === "stripe"', () => {
    const meta = {} as WebhookMetadata;
    if (meta.provider === 'stripe') {
      // Stripe-only field is accessible.
      expectTypeOf(meta.replayWindowMs).toEqualTypeOf<number>();
    }
  });

  it('forbids accessing Shopify-only fields on a Stripe-narrowed branch', () => {
    const meta = {} as WebhookMetadata;
    if (meta.provider === 'stripe') {
      // @ts-expect-error — `topic` is a Shopify-only field; not on Stripe branch.
      const _topic = meta.topic;
    }
  });

  it('forbids accessing GitHub-only fields on a Stripe-narrowed branch', () => {
    const meta = {} as WebhookMetadata;
    if (meta.provider === 'stripe') {
      // @ts-expect-error — `deliveryId` is a GitHub-only field; not on Stripe branch.
      const _deliveryId = meta.deliveryId;
    }
  });
});
```

This file MUST be type-checked (Pitfall 1). With `tsconfig.test.json` or Vitest typecheck mode, removing one of the `@ts-expect-error` directives will cause a "Unused '@ts-expect-error' directive" diagnostic — which means the union actually does what we claim.

### Common Operation 3: Fake-provider registration in tests (D-22)

```ts
// src/middleware.test.ts (excerpt)
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createWebhookMiddleware } from './middleware.js';
import { rawBodyCapture } from './raw-body/middleware.js';
import {
  registerProvider,
  _clearRegistryForTesting,
} from './providers/registry.js';
import type { Provider } from './providers/types.js';

describe('createWebhookMiddleware', () => {
  beforeEach(() => {
    _clearRegistryForTesting();
    // Re-register the production providers (side effect of importing the barrel).
    // Or: don't, if this test is registry-isolated.
    const fake: Provider = {
      name: 'test-fake',
      validate: (_req, _secret) => ({
        provider: 'stripe',  // Pretend the fake is a Stripe provider for type purposes.
        eventId: 'evt_test',
        timestamp: Date.now(),
        parsed: {},
        replayWindowMs: 300_000,
      }),
    };
    registerProvider('test-fake', fake);
  });

  it('throws synchronously on unknown provider (D-02)', () => {
    expect(() =>
      createWebhookMiddleware('not-registered', { secret: 's' })
    ).toThrow(/unknown.*provider/i);
  });

  it('returns a RequestHandler that calls next() on the success path', async () => {
    const app = express();
    app.post(
      '/wh',
      rawBodyCapture(),
      createWebhookMiddleware('test-fake', { secret: 's' }),
      (req, res) => res.json({ webhook: req.webhook }),
    );

    const res = await request(app)
      .post('/wh')
      .set('content-type', 'application/json')
      .send({ id: 'evt_test' });

    expect(res.status).toBe(200);
    expect(res.body.webhook?.eventId).toBe('evt_test');
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `(req: any).rawBody = buf` casts in middleware | Global declaration merge: `declare global { namespace Express { interface Request { rawBody?: Buffer } } }` | Standard since `@types/express-serve-static-core` first shipped global-Express namespace | Phase 3 doesn't need to use `(req: any)` casts anywhere except inside the body-parser `verify` helper (where `req` is `IncomingMessage`, not Express `Request`). |
| `module.exports = function (req, res, next, err) { ... }` (Express 3 style) | `(err, req, res, next) => unknown` typed via `ErrorRequestHandler` | Express 4.x | Phase 3 uses arrow functions returned from a factory; `.length === 4` preserved. |
| ESLint flat config + Prettier separately | Biome 2.x (Phase 1 D-01) | 2024-2025 across the Node ecosystem | Phase 3 inherits Biome — no Prettier integration needed. |
| `tsc` for libraries (separate `.d.ts` and `.js` invocations) | tsup with `dts: true` (Phase 1 D-03) | 2023+ for modern TypeScript libraries | Phase 3's declaration merging works through tsup's dts pipeline because it emits per-source `.d.ts` files. |

**Deprecated/outdated:**
- `req.body` for HMAC computation (PITFALLS #3) — use raw bytes only. Phase 3 enforces this structurally via D-06.
- `===` for signature comparison (PITFALLS #1) — Phase 2's `timingSafeCompare` enforces structurally.
- `X-Hub-Signature` (SHA-1) header for GitHub (PITFALLS #9) — Phase 5 territory, not Phase 3.

## Project Constraints (from CLAUDE.md)

`./CLAUDE.md` directs:

1. **Maintain `log.md` at task granularity.** This is the orchestrator's responsibility; **Phase 3 plans MUST NOT have the executor agent write to `log.md`** (CONTEXT.md "Project instructions" line confirms this). Tasks may create planning artifacts and source files, but `log.md` updates land in the orchestrator's commit boundary.

2. **Announce every `log.md` edit** with the literal `📝 log.md updated` line. (Orchestrator concern, not Phase 3 plan concern.)

3. **Announce every commit** with the literal `✅ commit <short-hash>` line. (Executor concern. Phase 3 plans should ensure each task's commit is announced.)

These directives don't conflict with any of D-01..D-22 — they're orthogonal logging hygiene applied to all work.

## Assumptions Log

> All factual claims in this research are tagged `[VERIFIED]` or `[CITED]`. The few `[ASSUMED]` items below need user confirmation before becoming locked decisions.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Adding `tsconfig.test.json` (extending main config without the test-file exclude) is the planner's preferred approach to closing Pitfall 1, vs Vitest's built-in `typecheck` mode | Pitfall 1 / Validation Architecture | Low — both options work; planner can pick based on ergonomics. The DECISION needs to be made (currently neither approach is guaranteed). |
| A2 | The `_clearRegistryForTesting()` helper is acceptable in production code (test-only escape hatch with leading-underscore name) | Pattern 6, Code Example 3 | Low — alternative is per-test setup using Vitest's `vi.resetModules()` to re-evaluate the registry module, which is more complex. Consider naming/access conventions before locking. |
| A3 | The Phase 3 stub Provider modules can `throw` from `validate()` rather than returning a sentinel, because Phase 3 tests register a fake provider (D-22) and never invoke the production providers' `validate()` | Pattern 6 | Low — matches D-22's intent. If a test accidentally imports the production provider and invokes `validate()`, it will throw with a clear message; that's the desired loud-fail. |
| A4 | `webhookErrorHandler()` passes 413 errors through unchanged (does NOT wrap them) and that is the intended behavior | Pattern 4, Pitfall 4 | Low — locked structurally by D-14 (only wraps `WebhookValidationError`). But the planner / discuss-phase may want to surface this as an explicit non-decision in the docs. |
| A5 | The "generic phrase" in `{ error: <generic>, reason: ... }` (D-15) is `"webhook validation failed"` regardless of status code, vs varying by status (e.g., "unauthorized" / "bad request" / "payload too large") | Pattern 5 | Low — CONTEXT.md `Claude's Discretion` explicitly leaves this open. Recommendation: uniform `"webhook validation failed"` for simplicity; consumers parse `reason` for the discriminated signal. |

## Open Questions (RESOLVED)

1. **Where exactly does the global `declare global { namespace Express { interface Request { ... } } }` block go?**
   - What we know: Pattern 2 above strongly recommends `src/types.ts` (a module file).
   - What's unclear: D-11 leaves it open between `src/express.d.ts` (ambient) and `src/types.ts` (`declare global` in a module).
   - **RESOLVED:** `src/types.ts` (module file with `declare global`). Reasons: (a) module-file augmentation is the canonical Express community pattern; (b) tsup's existing entry glob (`src/**/*.ts`, `!src/**/*.test.ts`) already captures `.ts` but not `.d.ts` — using `.ts` keeps the entry glob consistent; (c) the augmentation activates transitively when consumers import any value from the library, so no `/// <reference types="..." />` ceremony is needed in their tsconfig.

2. **`rawBodyCapture({ limit })` — does it accept `string` only, `number` only, or both?**
   - What we know: `raw-body`'s `Options.limit` accepts `number | string | null` `[VERIFIED: node_modules/raw-body/index.d.ts:Options]`. CONTEXT.md D-08 says default `'1mb'` (string).
   - What's unclear: D-08 says "configurable via `{ limit }` option" but doesn't pin the type.
   - **RESOLVED:** `string | number` (delegate to raw-body's parsing). Document `'1mb'` / `'500kb'` examples in JSDoc.

3. **Should `rawBodyCapture()` filter by content-type?**
   - What we know: CONTEXT.md `Claude's Discretion` lists this as planner-discretion. `express.raw({ type: 'application/json' })` filters; the bare middleware does not.
   - What's unclear: Webhook providers all send JSON, but other content types (e.g., a misconfigured webhook) could trip the size limit too.
   - **RESOLVED:** Capture unconditionally on the route it's mounted on. Per-route mounting (PITFALLS #18) means consumers control what content types reach the middleware. No filter option in v1; revisit if a consumer reports a need.

4. **Does `webhookErrorHandler()` accept any options at all in Phase 3?**
   - What we know: D-14 locks the response shape `{ error, reason }`. CONTEXT.md `Claude's Discretion` mentions varying the generic phrase by status code.
   - What's unclear: Should `webhookErrorHandler({ statusOverride?: number })` exist? Should the generic phrase be customizable?
   - **RESOLVED:** Zero options in Phase 3. Pure factory `webhookErrorHandler()`. If a future need emerges (e.g., "I want my 401s to say 'Forbidden' for branding reasons"), revisit then. Aligns with D-16's minimalist stance.

## Threat Catalog

> Canonical Phase 3 threat IDs. Plan-level `<threat_model>` blocks should cite these by ID rather than redefining; future phases (4–5) introduce their own `T-4-*` / `T-5-*` IDs without reusing these.

| ID | Threat | Component | Mitigation Locus | Severity |
|----|--------|-----------|------------------|----------|
| T-3-01 | Secret/signature/raw-body-byte leakage in error responses or logs | `src/errors.ts`, `src/error-handler.ts`, `src/middleware.ts` | Phase 2 D-11 structural no-leakage on `WebhookValidationError` serialization; Phase 3 D-13/D-14/D-15/D-16 (next(err) delegation, opt-in `webhookErrorHandler`, `{ error, reason }` body shape, library-never-logs) | High |
| T-3-02 | Pre-validation memory-DoS via oversize request bodies | `src/raw-body/middleware.ts`, `src/raw-body/verify.ts` | D-08 default 1mb `{ limit }` option; `raw-body` returns 413 BEFORE any HMAC computation runs | High |
| T-3-03 | Fail-open on missing/empty secret at factory call time (PITFALLS #11) | `src/middleware.ts` | Factory throws synchronously inside `createWebhookMiddleware(...)` when `secret` is missing/empty (D-02 pattern, plain `Error` per D-04) | High |
| T-3-04 | Provider self-registration race or silent double-registration (D-03 side-effect imports) | `src/providers/registry.ts`, `src/providers/{stripe,github,shopify}.ts`, `src/index.ts` | Last-write-wins via `Map.set` semantics; barrel imports each provider exactly once; reachability smokes in `src/index.test.ts` confirm all three names register | Medium |
| T-3-05 | Library-side observability leakage (any `console.*` / `debug()` call) | All `src/**/*.ts` | D-16 zero-logging stance; per-test `vi.spyOn(console, ...)` assertions on failure paths; structural — no `debug` package dependency | Medium |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | 24.15.0 (dev), 20.x/22.x/24.x (CI) | — |
| npm | Package install | ✓ | 11.13.0 | — |
| TypeScript | Build | ✓ | 6.0.3 | — |
| tsup | Build (dual ESM/CJS + dts) | ✓ | 8.5.1 | — |
| Vitest | Test runner | ✓ | 4.1.5 | — |
| `express` | Peer dep + dev runtime for tests | ✓ | 5.2.1 | — |
| `@types/express` | Type definitions | ✓ | 5.0.6 | — |
| `raw-body` | Standalone middleware (Pattern 4) | ✓ (transitive via `express → body-parser`) | 3.0.2 | Hand-roll a `req.on('data')` consumer (NOT recommended; see Don't Hand-Roll table) |
| Biome | Lint + format | ✓ | 2.4.14 | — |
| `supertest` | Integration-shape tests in `src/middleware.test.ts` | ✗ | — | Install via `npm install -D supertest @types/supertest` (D-21 requires it) |
| `@types/supertest` | TypeScript types for Supertest | ✗ | — | Install alongside `supertest` |

**Missing dependencies with no fallback:**
- None.

**Missing dependencies with fallback:**
- `supertest` / `@types/supertest` — install in Phase 3 Plan 01 (or whichever plan introduces the first integration-shape test). Standard Node dev dep; STACK.md already approved them.

## Validation Architecture

> `workflow.nyquist_validation` in `.planning/config.json` is `true` (verified). This section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `vitest.config.ts` (root) — currently `{ test: { include: ['src/**/*.test.ts'], environment: 'node' } }` |
| Quick run command | `npx vitest run <path-pattern>` (e.g., `npx vitest run src/middleware.test.ts`) |
| Full suite command | `npm test` (runs `vitest run` per `package.json#scripts.test`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BODY-01 | `req.rawBody` populated by standalone middleware before signature check | unit + supertest | `npx vitest run src/raw-body/middleware.test.ts` | ❌ Wave 0 (`src/raw-body/middleware.test.ts`) |
| BODY-01 | `req.rawBody` populated by `express.json({ verify })` helper before signature check | unit + supertest | `npx vitest run src/raw-body/verify.test.ts` | ❌ Wave 0 (`src/raw-body/verify.test.ts`) |
| BODY-01 | `req.rawBody` shape (Buffer) is identical across both surfaces | unit | `npx vitest run src/raw-body/` | ❌ Wave 0 (asserted within both verify/middleware test files) |
| BODY-02 | `express.json({ verify: captureRawBody })` integration pattern works in a real Express app | supertest | `npx vitest run src/raw-body/verify.test.ts` | ❌ Wave 0 (covered by verify.test.ts) |
| API-01 | `createWebhookMiddleware(provider, options)` is the primary export | unit (reachability smoke) | `npx vitest run src/index.test.ts` | ✓ (will be extended) |
| API-01 | Factory throws synchronously on unknown provider (D-02) | unit | `npx vitest run src/middleware.test.ts -t 'unknown provider'` | ❌ Wave 0 (`src/middleware.test.ts`) |
| API-01 | Factory throws synchronously on missing/empty secret (PITFALLS #11) | unit | `npx vitest run src/middleware.test.ts -t 'missing secret'` | ❌ Wave 0 (`src/middleware.test.ts`) |
| API-01 | Returned RequestHandler is compatible with both Express 4 and 5 | unit + CI matrix | CI job runs `npx vitest run` against both Express versions (already configured per Phase 1 D-07) | ✓ (CI matrix), ❌ (the test itself — `src/middleware.test.ts`) |
| API-03 | `req.webhook` discriminated union narrows correctly | type-only test | `npx tsc --noEmit -p tsconfig.test.json` (Wave 0 must add this config) | ❌ Wave 0 (`src/types.test.ts` + `tsconfig.test.json`) |
| API-03 | Cross-branch field access is a compile-time error | type-only | same as above | ❌ Wave 0 |
| API-04 | Validation failures yield 401 by default | unit + supertest | `npx vitest run src/error-handler.test.ts` | ❌ Wave 0 (`src/error-handler.test.ts`) |
| API-04 | Response body contains no signature/secret/body bytes | unit | inherited from Phase 2 D-11 (already passing); extended to cover the `'malformed_payload'` reason in `src/errors.test.ts` | ✓ (extension only) |
| API-04 | Library never logs (D-16) | unit | `npx vitest run src/middleware.test.ts -t 'no logging'` (uses `vi.spyOn(console, ...)` to assert no calls) | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run <files-this-task-touched>` — sub-30s for any single test file.
- **Per wave merge:** `npm test` — full suite, expected ~10s after Phase 3 lands (currently 21 tests across 4 files; Phase 3 adds ~30 more across 8 files).
- **Phase gate (before `/gsd-verify-work`):** `npm run lint && npm run typecheck && npm run build && npm test` all green.
- **Compile-time type-test gate:** `npx tsc --noEmit -p tsconfig.test.json` exits 0. If it doesn't exit 0, the `@ts-expect-error` directives are either correctly catching type errors (good) or are now invalid (bad — discriminated union has been weakened).

### Wave 0 Gaps

- [ ] **`tsconfig.test.json`** — extends main config, removes `**/*.test.ts` from exclude. Required for D-20 compile-time tests to actually run. (Pitfall 1.)
- [ ] **`package.json#scripts.typecheck`** — `tsc --noEmit -p tsconfig.test.json`. CI matrix should run this.
- [ ] **`supertest` + `@types/supertest`** install via `npm install -D supertest @types/supertest`.
- [ ] **`src/raw-body/middleware.test.ts`** — covers BODY-01 (standalone middleware path).
- [ ] **`src/raw-body/verify.test.ts`** — covers BODY-01 + BODY-02 (verify-helper path).
- [ ] **`src/middleware.test.ts`** — covers API-01 (factory shape, throw-on-unknown, secret validation, no logging, fake-provider success path).
- [ ] **`src/error-handler.test.ts`** — covers API-04 (status code, JSON body shape, 4-arg detection via Express integration test, no logging).
- [ ] **`src/providers/registry.test.ts`** — covers D-01 (register/get round-trip).
- [ ] **`src/types.test.ts`** — covers API-03 (compile-time discriminated-union narrowing).

*All 8 test files are Phase 3 Wave 0 work — they ship in the same commits as the source files they exercise per Phase 1 D-04 / Phase 2 D-12.*

## Sources

### Primary (HIGH confidence — verified in this session)

- `node_modules/@types/express-serve-static-core/index.d.ts` (lines 6-15, 55-81) — `RequestHandler<>`, `ErrorRequestHandler<>`, and the global `namespace Express { interface Request {} }` declaration that supports declaration merging.
- `node_modules/@types/body-parser/index.d.ts` (lines 51-54) — exact `verify(req, res, buf, encoding)` callback signature.
- `node_modules/raw-body/index.d.ts` — full `getRawBody` API and `RawBodyError` shape (`status`, `statusCode`, `type` fields).
- `node_modules/raw-body/index.js` (lines 163, 260) — empirical 413 contract (`createError(413, 'request entity too large', { type: 'entity.too.large' })`).
- `node_modules/router/lib/layer.js` (lines 106-131, 142-160) — Express 5's 4-arg error-middleware detection (`fn.length !== 4`).
- `/tmp/length-probe.cjs` (executed during research) — empirical confirmation that factory-returned typed functions preserve `.length === 4`.
- `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `biome.json` — current project state.
- `src/index.ts`, `src/index.test.ts`, `src/errors.ts`, `src/errors.test.ts`, `src/crypto/hmac.ts`, `src/crypto/compare.ts` — Phase 2 outputs.
- `npm view raw-body version` → `3.0.2`; `npm view express version` → `5.2.1`; `npm view @types/express version` → `5.0.6`.
- `node_modules/vitest/dist/config.d.ts` (lines 80-84) — Vitest's built-in `typecheck` mode.

### Secondary (MEDIUM confidence — verified docs/web)

- [How to use express-session with custom SessionData and TypeScript - Akos Komuves](https://akoskm.com/how-to-use-express-session-with-custom-sessiondata-typescript/) — declaration-merging precedent for `req.session`.
- [Extending Express' Types with TypeScript Declaration Merging - DEV Community](https://dev.to/chris927/extending-express-types-with-typescript-declaration-merging-typescript-4-3jh) — declaration-merging mechanics.
- [TypeScript Declaration Merging & Module Augmentation - Rishi Kumar Chawda](https://rishikc.com/articles/typescript-declaration-merging-module-augmentation/) — `declare global` vs `declare module "express-serve-static-core"` comparison.
- [DefinitelyTyped - express-session/index.d.ts](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/express-session/index.d.ts) — canonical type-augmentation pattern.
- [How to Extend the Express Request Object in TypeScript - LogRocket Blog](https://blog.logrocket.com/extend-express-request-object-typescript/) — declaration-merging tutorial (referenced in ARCHITECTURE.md too).
- [tsup documentation](https://tsup.egoist.dev/) — `dts: true` declaration emission behavior.
- Phase 2 outputs: `02-CONTEXT.md`, `02-03-PUBLIC-BARREL-SUMMARY.md` — locked decisions Phase 3 inherits.
- Phase 1 outputs: `01-CONTEXT.md` — locked tooling decisions.
- ARCHITECTURE.md, STACK.md, PITFALLS.md, FEATURES.md, REQUIREMENTS.md, ROADMAP.md — project research baselines.

### Tertiary (LOW confidence — none in this report)

- All factual claims in this research are either `[VERIFIED]` against the project's installed packages OR `[CITED]` from authoritative sources. No `[ASSUMED]` claims exist outside the explicit Assumptions Log section above (which lists planner-discretion items, not assumed facts).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified via `npm view` and `node_modules/` inspection.
- Architecture: HIGH — `RequestHandler`/`ErrorRequestHandler` types and Express 5 router internals verified by reading installed source. Declaration merging pattern verified against canonical `@types/express-serve-static-core` source.
- Pitfalls: HIGH — `fn.length === 4` empirically tested; `tsc --noEmit` exclude gap verified by reading the project's `tsconfig.json` and noting it excludes `**/*.test.ts`.
- Validation Architecture: HIGH — Vitest config verified; existing test infrastructure inspected; missing files enumerated against D-20.

**Research date:** 2026-05-06
**Valid until:** 2026-06-05 (30 days — stable Express 4/5 + TypeScript 6 ecosystem; key dependencies are mature). Rerun if `@types/express` or `raw-body` releases a major version, or if the project upgrades Express to v6+.
