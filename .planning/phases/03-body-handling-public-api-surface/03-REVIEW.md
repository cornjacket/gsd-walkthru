---
phase: 03-body-handling-public-api-surface
reviewed: 2026-05-07T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - src/error-handler.test.ts
  - src/error-handler.ts
  - src/errors.test.ts
  - src/errors.ts
  - src/index.test.ts
  - src/index.ts
  - src/middleware.test.ts
  - src/middleware.ts
  - src/providers/github.ts
  - src/providers/registry.test.ts
  - src/providers/registry.ts
  - src/providers/shopify.ts
  - src/providers/stripe.ts
  - src/providers/types.ts
  - src/raw-body/middleware.test.ts
  - src/raw-body/middleware.ts
  - src/raw-body/verify.test.ts
  - src/raw-body/verify.ts
  - src/types.test.ts
  - src/types.ts
  - package.json
  - tsconfig.test.json
findings:
  blocker: 1
  warning: 6
  total: 7
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-05-07
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Phase 3 ships the body-handling surface (raw-body capture middleware + verify helper), the discriminated `WebhookValidationError` class with sanitized JSON envelope handler, the `createWebhookMiddleware` factory, the `WebhookMetadata` discriminated union with global Express request augmentation, the provider registry, and the public barrel.

The library design (structural leak prevention, library-never-logs, plain-Error vs. validation-error split, `next(err)` delegation, `as never` confined to tests) is sound and well-tested. Tests are thorough and security-minded (defense-in-depth assertions that sample signature/secret/body bytes never appear in serialized output).

The most consequential defect is a **packaging bug**: `raw-body` is imported by production code (`src/raw-body/middleware.ts`) but is not declared anywhere in `package.json`. It currently resolves only because it is a transitive dep of `express`, and `express` is a peer dep — the install will succeed under the current devDependencies tree but is fragile under strict resolvers (pnpm `--strict-peer-deps`, Yarn PnP, or any future express version that drops `raw-body`). Because the published package depends on `dist/`, a consumer install with strict resolution will fail at module load.

Several `WARNING`s relate to type/runtime drift, missing input hardening, and small maintainability hazards (unsafe-cast pattern, hard-coded provider list duplication, weak secret check, `Record<string, unknown>` reuse instead of nominal types).

## Blocker Issues

### BL-01: `raw-body` is imported but not declared in `package.json` dependencies

**File:** `package.json:30-42`, `src/raw-body/middleware.ts:26`

**Issue:** `src/raw-body/middleware.ts` does `import getRawBody from 'raw-body';` but `package.json` has no `dependencies` block — `raw-body` is not listed as a dep, peer dep, or optional dep. The module currently resolves because `express` (a peer dep, also installed via the dev tree at v5.2.1) ships `raw-body` as a transitive dep and the default Node ESM/CJS resolver walks up `node_modules`. This breaks in three real cases:

1. **Strict resolvers** — pnpm with default isolated `node_modules`, Yarn PnP, or npm with `--install-strategy=isolated` will not expose transitive deps to the dependent package. A consumer install will throw `ERR_MODULE_NOT_FOUND: Cannot find package 'raw-body'` the first time a request hits `rawBodyCapture()`.
2. **Future express drift** — Express 5.x currently uses `raw-body`, but a future release (or alternate body-parser fork) could drop that subdep, silently breaking the library.
3. **Consumer not using express at all** — though the peer dep makes this nominally invalid, peer deps are warnings, not errors; a consumer pulling only `WebhookValidationError`/`webhookErrorHandler` from the barrel would still import `src/raw-body/middleware.js` (the barrel re-exports from it unconditionally) and crash on first load.

This is a published-package hazard — the library tarball will not include `raw-body`, and `npm install express-webhook-validator` is not guaranteed to surface it.

**Fix:**

```jsonc
// package.json — add a dependencies block
{
  // ...
  "dependencies": {
    "raw-body": "^3.0.0"
  },
  "peerDependencies": {
    "express": "4.x || 5.x"
  },
  // ...
}
```

If the team prefers to keep the dependency surface minimal and rely on express's transitive copy, document it explicitly and add a regression test that installs the published tarball under `pnpm --strict-peer-deps` or equivalent. Either way, the current state — undeclared production import — is incorrect.

## Warnings

### WR-01: `@types/express` is locked to v4 but installed `express` is v5

**File:** `package.json:31, 35`

**Issue:** `peerDependencies.express` accepts `4.x || 5.x`, and `node_modules/express/package.json` resolves to v5.2.1, but `devDependencies["@types/express"]` is pinned to `^4.17.21`. The Express 5 runtime has request/response shape differences (e.g., async route handlers' error propagation, `req.query` becoming a plain object, removal of legacy methods) that the v4 types do not model. The library is shipping types that may misrepresent v5 runtime behavior.

In practice this matters most for the global `Express.Request` augmentation in `src/types.ts:30-37` — that augmentation merges into whichever `@types/express(-serve-static-core)` definition the consumer pulls in. If the library's own typecheck runs against v4 types but a consumer is on v5, the augmented `webhook?: WebhookMetadata` field still works (it's structural), but the library's *own* internal type assertions (e.g., `RequestHandler` parameter compatibility) are validated only against v4 semantics.

**Fix:** Either (a) bump dev `@types/express` to a v5-aware release and re-run `npm run typecheck`, or (b) explicitly document that the library is type-validated only against Express 4 and the v5 entry in `peerDependencies` is best-effort. (a) is preferable.

### WR-02: Hard-coded provider list in error message duplicates registry contents and will drift

**File:** `src/middleware.ts:58-64`

**Issue:** When an unknown provider name is passed, the error message hard-codes `['stripe', 'github', 'shopify']`. The comment acknowledges the choice but argues "Phase 4/5 REPLACE these entries (they don't add new names)." That's true today, but:

1. The registry's `_clearRegistryForTesting` plus test-only `registerProvider('test-fake', ...)` fully decouple registered names from this hard-coded list. In tests with a custom fake provider registered, throwing this message is misleading because `'test-fake'` is registered but not in the listed names.
2. Any future provider added in Phase 6+ requires a synchronized edit in two places (registry side-effect import in `index.ts` AND this error string), and there's no test that asserts they stay in sync.
3. The dynamic alternative is one line: expose `listProviders()` from `registry.ts` (`Array.from(registry.keys())`) and call it here.

**Fix:**

```ts
// registry.ts
export function listProviders(): string[] {
  return Array.from(registry.keys()).sort();
}

// middleware.ts
import { getProvider, listProviders } from './providers/registry.js';
// ...
if (!provider) {
  const known = listProviders().join(', ') || '(none registered)';
  throw new Error(
    `Unknown webhook provider: '${providerName}'. Registered providers: ${known}.`
  );
}
```

`listProviders` need not be re-exported from `index.ts` — it's an internal helper, same as `getProvider`.

### WR-03: Empty-string secret check accepts whitespace-only strings

**File:** `src/middleware.ts:69-71`

**Issue:** `if (!options.secret)` rejects only the empty string (and at type level can never see `null`/`undefined` because the field is typed `string`). A secret of `" "`, `"\n"`, or `"\t  \n"` will pass the check and be passed to `provider.validate(req, secret)`, where it will compute an HMAC with a whitespace-only key — almost certainly a misconfiguration (e.g., a `.env` line that the dev expected to be substituted, or a secret accidentally set to a placeholder).

The "fail loudly" intent (PITFALLS #11) is partially defeated: a typo'd secret of `" "` produces an opaque `signature_mismatch` at request time, not a config-time `Error`.

**Fix:**

```ts
if (!options.secret || options.secret.trim().length === 0) {
  throw new Error(`Webhook secret required for provider '${providerName}'`);
}
```

If trimming is undesirable for legitimate providers whose secrets contain leading/trailing whitespace (none of Stripe/GitHub/Shopify do), use `options.secret.length === 0` to be explicit about what's being checked, and document the choice.

### WR-04: `as never` cast in test fake provider hides a real type-design weakness

**File:** `src/middleware.test.ts:35-40`

**Issue:** The fake provider returns `{ provider: 'test-fake', ... } as never`. The comment justifies it: "WebhookMetadata is a closed union of Stripe/GitHub/Shopify; the fake shape doesn't satisfy any of those branches structurally — that's fine at runtime."

The cast is correct for now, but it signals a real design tension: the `Provider` interface's return type is `WebhookMetadata` (a closed union), so any test fake — and any future provider added by a downstream consumer — has to cast through `never`. That defeats the purpose of typing the return value at all. Options:

1. Make `Provider` generic on its metadata branch: `Provider<M extends WebhookMetadata = WebhookMetadata>` and have each provider declare its branch (e.g., `Provider<StripeWebhook>`). Tests then declare their own branch and the cast vanishes.
2. Widen `validate`'s return type to `WebhookMetadata | { provider: string; eventId: string; timestamp: number; parsed: Record<string, unknown> }` — strictly worse, listed for completeness.
3. Add a `defineProvider<M>(impl: Provider<M>): Provider<M>` factory that does the structural check at definition time and lock the registry to those.

**Fix:** Adopt (1) for Phase 4/5 onward. The current `as never` is a v1-acceptable workaround; flag in a code-quality TODO so the next phase does not propagate the cast.

### WR-05: `Record<string, unknown>` for the `parsed` field is structurally too permissive

**File:** `src/providers/stripe.ts:19`, `src/providers/github.ts:17`, `src/providers/shopify.ts:18`

**Issue:** All three branch types declare `parsed: Record<string, unknown>`. This means a consumer who narrows to, say, `req.webhook?.provider === 'stripe'` and accesses `req.webhook.parsed.foo` gets `unknown` — fine — but they also see `parsed.constructor`, `parsed.toString`, etc. as `unknown`, and any object literal (including an `Array<unknown>`) is assignable to `parsed` at construction time. The provider stub could theoretically write `parsed: []` and pass the type check.

More importantly, the tests at `src/index.test.ts:90, 105, 118` and `src/middleware.test.ts:38` set `parsed: {}` everywhere, which suggests the field is treated as opaque. If it's truly opaque to the library, type it as `unknown` (forces the consumer to validate before access — appropriate for "parsed JSON we did not ourselves produce"). If it's intended to be an object, use `Record<string, unknown> | unknown[]` only if arrays are expected; otherwise restrict to `{ readonly [k: string]: unknown }` and document.

**Fix:** Standardize to `parsed: unknown` (most accurate — the library does not own the parse and cannot guarantee shape) and let consumers narrow. Apply consistently across all three branches.

### WR-06: `tsconfig.test.json` does not actually remove the test-file exclude from the base

**File:** `tsconfig.test.json:1-5`, `tsconfig.json` (referenced)

**Issue:** The comment in `src/types.test.ts:14-17` says `tsconfig.test.json` "removes the exclude" for `**/*.test.ts` so that compile-time `@ts-expect-error` directives in test files are actually checked. But the on-disk content is:

```jsonc
{
  "extends": "./tsconfig.json",
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

This redefines `exclude` to drop `**/*.test.ts` (TypeScript replaces the parent `exclude` rather than merging — that's the intended mechanism, and it works). However:

1. The base `include` is also `["src"]`, so re-declaring it is a no-op that obscures intent.
2. There is no comment in `tsconfig.test.json` explaining *why* `exclude` is redefined. A future maintainer who tidies up "redundant" config will silently disable the SC3 binding.
3. There is no test that asserts the `@ts-expect-error` directives in `src/types.test.ts` are actually exercised — if a maintainer comments out the directives, only `npm run typecheck` (a separate script) catches it.

**Fix:**

```jsonc
// tsconfig.test.json
{
  "extends": "./tsconfig.json",
  // Override base `exclude` to INCLUDE test files in the typecheck.
  // src/**/*.test.ts contain `@ts-expect-error` directives that are the
  // binding signal for SC3 (discriminated-union narrowing). If this
  // exclude override is removed, the directives become inert and SC3
  // regresses silently. See src/types.test.ts header for the full rationale.
  "exclude": ["node_modules", "dist"]
}
```

Optionally drop the redundant `include` line (the base already provides `["src"]`).

---

_Reviewed: 2026-05-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
