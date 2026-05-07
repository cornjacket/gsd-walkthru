---
phase: 04
depth: standard
status: warnings
findings_critical: 0
findings_warning: 5
findings_info: 4
created: 2026-05-07T22:30:00Z
files_reviewed:
  - src/errors.ts
  - src/errors.test.ts
  - src/middleware.ts
  - src/providers/stripe.ts
  - src/providers/stripe.test.ts
  - src/index.test.ts
---

# Phase 04: Code Review Report

**Reviewed:** 2026-05-07T22:30:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** warnings (no blockers; five quality / robustness defects worth fixing)

## Summary

The Stripe HMAC-SHA256 validator implementation is **structurally sound on every domain-critical security axis**: constant-time comparison is used for every signature segment, the multi-`v1=` loop has no early break (no rotation timing leak), JSON.parse correctly runs only after HMAC verification (no parser-DoS surface on attacker-controlled bytes), the tolerance window is past-only as specified by D-01 (future timestamps pass; this is verified by Test 14), error messages cannot include secrets, signatures, or body bytes (the constructor has no field for them — Phase 2 D-11 structural guarantee inherited), no `console.*` calls, no `res.*` writes, and the order of operations matches D-08 exactly.

What this review surfaces are **secondary defects**: (a) a tolerance-misconfiguration path (`NaN`) that silently disables replay protection rather than failing loudly like the secret-validation precedent (Phase 3 WR-03), (b) several tests that lack an outer `expect(...).toThrow(...)` guard and would silently pass if a regression made `validate()` succeed where it should throw, (c) a duplicated default-tolerance literal across two files, (d) a header-array case that gets mis-classified as `missing_header` instead of `invalid_signature_format` (D-04 calls for three-way distinction), and (e) lenient `parseInt` accepting `t=123abc` as `123`.

None of these block shipping. All five warnings are reachable, demonstrable defects against either the locked decisions or the project's explicit "fail loudly on misconfig" precedent.

### Domain-Specific Focus Areas — Verification

| Focus | File:Line | Disposition |
|---|---|---|
| Constant-time compare for ALL `v1=` segments | `src/providers/stripe.ts:107-113` | PASS — uses `timingSafeCompare`, no early `break`, mark-flag-and-continue pattern as required by Pitfall 2 |
| JSON.parse AFTER HMAC succeeds (D-08 step order) | `src/providers/stripe.ts:71-144` | PASS — strict 9-step order matches D-08 verbatim |
| Tolerance window past-only (`now - t > tolerance`, not `\|now - t\|`) | `src/providers/stripe.ts:123-131` | PASS — verified by Test 14 (future timestamp passes) |
| Header parsing — D-13 five case classes throw `'invalid_signature_format'` | `src/providers/stripe.ts:45-66` | MOSTLY PASS — see WR-04 for one mis-classification edge |
| No information leakage in error `message` / `cause` | `src/errors.ts:22-27, 45-80` | PASS — constructor has no field for sensitive data; `toJSON` whitelists; `messageFor` consumes only `(reason, provider)` |
| Library-never-logs (zero `console.*` in src/) | all files | PASS — `grep -n "console\\." src/{errors,middleware}.ts src/providers/stripe.ts` returns only the comment at `middleware.ts:25` |
| No `res.*` writes from middleware (D-13) | `src/middleware.ts:94-120` | PASS — middleware only calls `next()` / `next(err)` |
| Function cast preserves type safety | `src/middleware.ts:112-113` | PASS — narrow cast localized; result re-typed as `WebhookMetadata`; eslint-disable scoped to one line |
| Test isolation (`_clearRegistryForTesting`) | `src/providers/stripe.test.ts` | PASS — tests bypass the registry by importing `stripeProvider` directly; no registry mutation, no clear needed |
| `rawBody.toString('utf8')` consistently | `src/providers/stripe.ts:102, 137` | PASS — both call sites use `'utf8'` explicitly; matches D-10 |

## Warnings

### WR-01: `tolerance: NaN` silently disables replay protection

**File:** `src/middleware.ts:92`, `src/providers/stripe.ts:125`
**Category:** security / correctness
**Severity:** WARNING

**Issue:** The factory resolves `const tolerance = options.tolerance ?? 300`. The nullish-coalescing operator only substitutes for `null` and `undefined`, NOT for `NaN`. A consumer call like `createWebhookMiddleware('stripe', { secret, tolerance: parseInt(process.env.STRIPE_TOLERANCE!, 10) })` where the env var is unset produces `tolerance = NaN`, the factory accepts it, and inside `validate()` the comparison `age > NaN` is **always `false`** — so the timestamp tolerance check is silently bypassed for every request. STRP-02 (replay-window enforcement) is silently disabled. The signature check still runs, so this is not a complete auth bypass, but it removes the explicit replay-window guarantee the library promises.

The threat register in `04-02-PLAN.md` (T-4-03) explicitly enumerated `tolerance=0` (safe-fail) and `tolerance=very-large` (consumer's explicit choice). It did NOT enumerate `tolerance=NaN`, which is neither safe-fail nor an explicit choice — it's a misconfiguration that silently weakens the security posture.

This contradicts the **established Phase 3 WR-03 precedent** of failing loudly on misconfiguration (whitespace-only secret throws a plain `Error` at factory call time, not a `WebhookValidationError` at request time). The same loud-fail convention should apply to non-finite or non-positive tolerance.

**Fix:** Add a factory-time guard right after the secret check (`src/middleware.ts:85`):

```typescript
if (options.tolerance !== undefined) {
  if (typeof options.tolerance !== 'number' || !Number.isFinite(options.tolerance) || options.tolerance < 0) {
    throw new Error(
      `Webhook tolerance must be a non-negative finite number for provider '${providerName}' (got ${String(options.tolerance)})`
    );
  }
}
const tolerance = options.tolerance ?? 300;
```

---

### WR-02: Multiple tests vacuous-pass when `validate()` does not throw

**File:** `src/providers/stripe.test.ts:152-165, 167-180, 198-210, 243-259`
**Category:** correctness (test quality)
**Severity:** WARNING

**Issue:** Four tests assert thrown-error properties inside a `try/catch` block but lack the outer `expect(() => ...).toThrow(WebhookValidationError)` guard that the other tests have. If a future regression caused `validate()` to *succeed* in one of these scenarios, the `try` block would complete without entering `catch`, no `expect()` inside the `catch` would run, and the test would pass vacuously.

Specifically affected:
- Test "header with only v0= and no v1= throws invalid_signature_format" (lines 152-165) — no `toThrow` guard
- Test "header with only v2= throws invalid_signature_format" (lines 167-180) — no `toThrow` guard
- Test "valid signature but non-JSON rawBody throws malformed_payload" (lines 198-210) — no `toThrow` guard
- Test "error serializations do not contain signature, secret, or body bytes" (lines 243-259) — no `toThrow` guard; and this test specifically constructs a stale-timestamp signature to force a throw, so a regression that bypasses the timestamp check would silently skip the leakage assertion entirely

The pattern in the other tests (e.g., lines 56-72, 74-88, 90-104, 124-135, 137-150, 182-196) is correct: `expect(() => ...).toThrow(WebhookValidationError)` first, then a second invocation in `try/catch` to inspect `.reason`/`.statusCode`. The four flagged tests should follow that same pattern, OR use `expect.assertions(N)` to guarantee N assertions actually run.

**Fix:** Add the outer guard. Example for test at line 152-165:

```typescript
it('header with only v0= and no v1= throws invalid_signature_format', () => {
  const timestamp = Math.floor(Date.now() / 1000);
  const req = makeReq({ body: SAMPLE_BODY, signature: `t=${timestamp},v0=deadbeef` });
  expect(() => stripeProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
    WebhookValidationError
  );
  try {
    stripeProvider.validate(req as any, SAMPLE_SECRET);
  } catch (err) {
    expect((err as WebhookValidationError).reason).toBe('invalid_signature_format');
  }
});
```

Apply the same fix to lines 167-180, 198-210, and 243-259.

Alternative — add `expect.assertions(N)` at the top of each test body, where `N` matches the count of `expect()` calls inside the `catch`. That guarantees the test fails loudly if those assertions never run.

---

### WR-03: Multi-header `Stripe-Signature` array misclassified as `missing_header`

**File:** `src/providers/stripe.ts:81-88`
**Category:** correctness (diagnostic accuracy)
**Severity:** WARNING

**Issue:** Express types `req.headers['stripe-signature']` as `string | string[] | undefined`. When a request arrives with **multiple** `Stripe-Signature` headers (RFC 7230 permits this, and a misbehaving proxy or attacker-crafted request could produce it), Express delivers a `string[]`. The current guard:

```typescript
if (!header || typeof header !== 'string') {
  throw new WebhookValidationError({
    reason: 'missing_header',
    ...
  });
}
```

…throws `'missing_header'` for the array case. But CONTEXT D-04 explicitly mandates a three-way distinction:

> - Header MISSING entirely → `'missing_header'`
> - Header PRESENT but unparseable → `'invalid_signature_format'`
> - Header parses, signature bytes don't match → `'signature_mismatch'`

A duplicated header is "header present but not parseable as a single signature value" — that is squarely D-04's middle bucket (`'invalid_signature_format'`), not the missing-header bucket. A consumer debugging would see `missing_header` and look for proxy-stripping issues when the actual problem is duplicate emission.

This is not a security issue (the request still rejects), but it violates the explicit three-way mapping locked in D-04.

**Fix:** Split the guard into two distinct checks:

```typescript
const header = req.headers['stripe-signature'];
if (header === undefined) {
  throw new WebhookValidationError({
    reason: 'missing_header',
    provider: 'stripe',
    statusCode: 401,
  });
}
if (typeof header !== 'string') {
  // Array (duplicate headers) or unexpected shape — header is present but unparseable.
  throw new WebhookValidationError({
    reason: 'invalid_signature_format',
    provider: 'stripe',
    statusCode: 401,
  });
}
```

Add a corresponding test fixture in `stripe.test.ts` that constructs `headers: { 'stripe-signature': ['t=1,v1=abc', 't=2,v1=def'] }` and asserts the reason is `'invalid_signature_format'`.

---

### WR-04: Default tolerance literal `300` is duplicated across two files

**File:** `src/middleware.ts:92`, `src/providers/stripe.ts:70`
**Category:** style / maintainability
**Severity:** WARNING

**Issue:** The default tolerance value `300` (seconds) appears in two unrelated source files:

- `src/middleware.ts:92`: `const tolerance = options.tolerance ?? 300;`
- `src/providers/stripe.ts:70`: `validate(req: Request, secret: string, toleranceSeconds = 300): StripeWebhook`

If a future change updated one (e.g., in response to a Stripe-side default change documented in PROJECT.md) but not the other, the two would drift silently. There is no compile-time link between them; tests cover the happy-path 300 default but would not catch a silent drift to e.g. `350` in only one location.

The duplication also means a consumer who reads the JSDoc on `CreateWebhookMiddlewareOptions.tolerance` (`@default 300`) and a maintainer who reads the validate signature get the same number from two different sources of truth.

**Fix:** Define one named constant and import it where needed. Either:

(A) In `src/providers/stripe.ts`, export `DEFAULT_STRIPE_TOLERANCE_SECONDS = 300` and import it in middleware. (Couples middleware to a stripe-specific constant — fine for v1 since stripe is the only provider with a tolerance window.)

(B) In `src/middleware.ts`, remove the default from `validate`'s signature (force the middleware to always pass it explicitly):

```typescript
// stripe.ts
validate(req: Request, secret: string, toleranceSeconds: number): StripeWebhook { ... }

// middleware.ts unchanged — already passes tolerance via the cast.
```

(B) is cleaner because the factory is now the single source of truth for the default, and direct callers of `stripeProvider.validate(req, secret)` (i.e., the unit tests) would have a TypeScript error reminding them to pass tolerance explicitly. The current happy-path test relies on the stripe-side default; updating that test to pass `300` explicitly makes the contract clearer.

---

### WR-05: `parseInt` accepts trailing junk in `t=` segment

**File:** `src/providers/stripe.ts:55-57`
**Category:** correctness (parse leniency)
**Severity:** WARNING

**Issue:** The header parser uses `parseInt(value, 10)` and only checks `!isNaN(ts)`:

```typescript
if (key === 't') {
  const ts = parseInt(value, 10);
  if (!isNaN(ts)) timestamp = ts;
}
```

`parseInt` is **lenient on trailing non-numeric characters**: `parseInt("123abc", 10)` returns `123`, and `parseInt(" 123", 10)` returns `123`. So a header like `t=1700000000xyz,v1=<correct-hex>` would parse as `timestamp = 1700000000` and continue to HMAC computation. The HMAC input becomes `${timestamp}.${rawBody}` = `"1700000000.<body>"` — which doesn't match what Stripe (or any well-formed sender) would have signed (`"1700000000xyz.<body>"`), so the request rejects with `signature_mismatch` rather than `invalid_signature_format`. This is correct fail-closed behavior, but it again violates the D-04 three-way distinction: a parse-level malformity in the header is being reported as a byte-mismatch.

CONTEXT 04-CONTEXT.md "Claude's Discretion" explicitly anticipates this case:

> Whether `t=value` non-numeric or `v1=value` non-hex maps to `invalid_signature_format` (parser couldn't make sense of it) or `signature_mismatch` (parsed but won't match anything). **Lean toward `'invalid_signature_format'` for non-hex `v1=` (it's a parse-level issue)**...

The implementation correctly rejects non-hex `v1=` via the regex (good), but accepts `parseInt`-lenient `t=` values (less good). The asymmetry is detectable: a `v1=zzzz` header throws `invalid_signature_format`; a `t=123xyz,v1=<correct-for-123>` header throws `signature_mismatch`. Same class of fault, different reason emitted.

**Fix:** Tighten the timestamp parser to reject trailing junk:

```typescript
if (key === 't') {
  // Reject trailing junk: parseInt('123abc', 10) === 123, which is too lenient.
  // Require the entire value to be digit characters (allow optional leading minus
  // even though negative timestamps will fail the tolerance check anyway).
  if (/^-?\d+$/.test(value)) {
    const ts = parseInt(value, 10);
    if (!isNaN(ts)) timestamp = ts;
  }
}
```

Add a test fixture: `t=1700000000xyz,v1=<hex>` → expect `invalid_signature_format` (parser rejected `t=`, so no parseable `t=` remains, parser returns `null`).

---

## Info

### IN-01: `provider!` non-null assertion is redundant at runtime but may mask future drift

**File:** `src/middleware.ts:113`
**Category:** style
**Severity:** INFO

**Issue:** The line `(provider!.validate as Function).call(provider, req, secret, tolerance) as WebhookMetadata` uses the non-null assertion `provider!`. The earlier `if (!provider)` throw on lines 65-75 *should* narrow `provider` to `Provider` for the rest of the function — including inside the closure. The Phase 4 Plan 02 SUMMARY documents this assertion as needed because the DTS generator did not narrow through the closure boundary. That's a tooling work-around, not a logic concern.

If a future TypeScript or `tsup` upgrade fixes the DTS narrowing, this `!` becomes pure noise. If a future maintainer refactors the early-return shape of the factory and the narrowing genuinely fails, the `!` would suppress an actual bug.

**Fix (optional):** Replace `provider!` with a local-scope re-binding inside the closure that does a runtime check:

```typescript
return (req, _res, next) => {
  // provider was narrowed at factory-call time; re-bind for closure clarity.
  if (!provider) {
    // Should be unreachable; satisfies type narrowing in DTS output.
    return next(new Error('internal: provider missing in middleware closure'));
  }
  // ... rest unchanged ...
};
```

…or leave a comment in line explaining the DTS rationale to avoid future-maintainer "cleanup."

---

### IN-02: `as Function` cast plus `as WebhookMetadata` re-typing is structurally weak

**File:** `src/middleware.ts:113`
**Category:** style / type safety
**Severity:** INFO

**Issue:** The narrow Function cast in middleware erases the parameter and return types of `validate`, then the result is re-anchored to `WebhookMetadata` via a second cast. If a future buggy provider returned a non-`WebhookMetadata` value (say `null` or `undefined`), TypeScript would never catch it, and `req.webhook = metadata` would silently propagate the bad value. A consumer reading `req.webhook?.provider` would then trip on a runtime exception they can't debug from the type system.

The Provider interface is defined in `src/providers/types.ts` to enforce `WebhookMetadata` as the return. The cast bypasses that enforcement entirely.

**Fix (optional, defensive):** Add a runtime sanity check:

```typescript
const metadata = (provider!.validate as Function).call(provider, req, secret, tolerance);
if (typeof metadata !== 'object' || metadata === null || typeof (metadata as { provider?: unknown }).provider !== 'string') {
  return next(new Error(`Provider '${providerName}' returned non-WebhookMetadata value`));
}
req.webhook = metadata as WebhookMetadata;
```

This keeps the cast-based interface widening (D-16 compliant) but catches a misbehaving provider impl loudly. Not required for v1; flagged for future-proofing.

---

### IN-03: `req as any` proliferation in `stripe.test.ts`

**File:** `src/providers/stripe.test.ts` — every `validate()` call site
**Category:** style (test type safety)
**Severity:** INFO

**Issue:** Every test fixture call uses `stripeProvider.validate(req as any, secret)` because `makeReq` returns `unknown`. This is an idiomatic test pattern but makes the test file a regression risk: a future change to the `Provider` interface or `Request` shape would not surface here. Consider `req as Parameters<typeof stripeProvider.validate>[0]` or define a `MinimalRequest` test type that mirrors what the provider actually reads (`headers`, `rawBody`).

**Fix (optional):** Define a tiny test-only type:

```typescript
type StripeReqFixture = {
  rawBody: Buffer | undefined;
  headers: { 'stripe-signature'?: string };
};

function makeReq(opts: { body?: string; rawBody?: Buffer; signature?: string }): StripeReqFixture {
  // ... existing body ...
}

// Usage:
stripeProvider.validate(req as unknown as Request, secret);
```

---

### IN-04: Tolerance value flows to GitHub/Shopify providers (Phase 5) which will silently ignore it

**File:** `src/middleware.ts:113`
**Category:** style / cross-phase concern
**Severity:** INFO

**Issue:** The middleware passes `tolerance` as the 3rd positional arg to `provider.validate` for **every** provider, not just Stripe. The Phase 3 stub providers for GitHub and Shopify ignore the extra argument harmlessly today, but Phase 5 will replace those stubs. If a future Phase 5 implementer adds a 3rd parameter to (say) GitHub's `validate` for some unrelated reason (a per-provider option, e.g., `acceptedAlgorithms`), the middleware's positional pass would silently feed `tolerance` to the wrong slot.

Phase 5 is out of this review's scope, but the cross-phase coupling is worth flagging in 04-FOLLOWUP. The cleaner long-term shape is an options object: `provider.validate(req, secret, { tolerance })` — but that requires widening the `Provider` interface, which D-16 forbids. The current design is the v1 trade-off.

**Fix (optional, for Phase 5 awareness):** Add a comment in `middleware.ts` immediately above the cast:

```typescript
// NOTE: tolerance is positionally passed to every provider. Phase 5 providers
// MUST either accept (req, secret, _toleranceSeconds?) or ignore the extra
// argument. If a future per-provider option emerges, prefer adding a separate
// validate-args interface rather than bolting on positional arg #4.
```

---

_Reviewed: 2026-05-07T22:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
