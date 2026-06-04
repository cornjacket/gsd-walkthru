---
phase: 07-documentation-example-app
reviewed: 2026-06-04T05:41:51Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/index.ts
  - examples/example-app/src/index.ts
  - examples/example-app/src/stripe.ts
  - examples/example-app/src/github.ts
  - examples/example-app/src/shopify.ts
  - examples/example-app/package.json
  - examples/example-app/tsconfig.json
  - README.md
  - package.json
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-06-04T05:41:51Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 7 restructured `README.md`, bumped both `package.json` files to `1.0.0`, and
added a runnable example Express app under `examples/example-app/`. I built the
example with `tsc` (exit 0) and ran the compiled output end-to-end: all three mock
webhooks (Stripe/GitHub/Shopify) signed independently with Node `crypto.createHmac`
validated against the library and the process exited 0. The runnable claim holds and
the example code is correct — field accesses on `req.webhook` all match the
discriminated-union branch types, the `rawBodyCapture()`-before-middleware ordering is
right, and the intentional base64-not-hex Shopify signing is correct.

No critical (security / data-loss / crash) issues were found. The defects are all
**documentation-accuracy** problems in `README.md`, plus a couple of example-app quality
nits. Because this phase's headline artifact is the README and it carries a
"production-ready / v1.0" badge, factual drift between the README and the shipped code
is the highest-value class of finding here: three statements in the README are
verifiably wrong against the current source, and a reader trusting them would be
misled.

## Warnings

### WR-01: README advertises a test count that does not match the repo

**File:** `README.md:3`
**Issue:** The status badge states "**139 tests across 16 files**". The actual repo
contains **13** `*.test.ts` files under `src/` with **111** `it()`/`test()` cases
(verified: `find src -name '*.test.ts' | wc -l` = 13; `grep -rhE '^\s*(it|test)\('
src --include='*.test.ts' | wc -l` = 111). A concrete, falsifiable number on a
"production-ready" badge that is off by 25 tests / 3 files erodes trust in the rest of
the document and will keep drifting every time a test file is added or removed.
**Fix:** Either update the numbers to the real counts, or — better, to avoid future
drift — drop the hard numbers and describe coverage qualitatively, e.g.:

```markdown
> **Status — v1.0 / Ready to use.** All three providers (Stripe, GitHub, Shopify)
> ship real HMAC-SHA256 validators with a comprehensive unit + integration test suite.
> Production-ready.
```

If you keep a number, derive it in CI rather than hand-maintaining it.

### WR-02: README internal data-flow diagram lists a stale/incorrect set of validation reasons

**File:** `README.md:278-284`
**Issue:** The "Internal data flow" diagram enumerates the `reason` union as
`{ signature_mismatch, timestamp_too_old, missing_header, missing_secret,
malformed_payload }`. This is wrong in two directions against `src/errors.ts:6-12`:
1. It **omits** `invalid_signature_format`, which is a real member of
   `WebhookValidationReason` and is thrown by all three providers
   (`stripe.ts:101/110`, `github.ts:79/87`, `shopify.ts:67`). The string
   `invalid_signature_format` does not appear anywhere in `README.md`.
2. It **includes** `missing_secret`, which is declared in the union but is **never
   thrown** anywhere in the source (verified: `grep -rn 'missing_secret' src
   --include='*.ts'` matches only the type declaration at `errors.ts:10`). Configuration
   errors throw a plain `Error` (`middleware.ts:72,84,96`), not a
   `WebhookValidationError` with `reason: 'missing_secret'`. Documenting a reason a
   consumer can never observe, while hiding one they will, is actively misleading for
   anyone writing a `switch (err.reason)` handler.
**Fix:** Make the diagram's reason set match the code. List the five reasons that are
actually emitted:

```
reason ∈ {
  signature_mismatch,
  timestamp_too_old,
  missing_header,
  malformed_payload,
  invalid_signature_format }
```

Separately, decide what to do about the unused `missing_secret` union member in
`errors.ts:10` (out of this phase's file scope, but it is the root cause of the
documentation confusion — it is dead code in the reason union).

### WR-03: README claims a runnable example but gives no instructions to run it

**File:** `README.md:11, 145-156`
**Issue:** The Installation note and the What-this-is section both point the reader at
`./examples/example-app/`, and the badge implies it is runnable, but the README never
states how to actually run it. The only run instructions live inside the example's own
source header (`examples/example-app/src/index.ts:5` — "Run: npm start"), which a
reader browsing the README will not see. A "production-ready, ready-to-use" README whose
single concrete proof-of-life is an example app should tell the reader the three
commands to see it work.
**Fix:** Add a short "Try the example" section to the README:

````markdown
## Run the example

```bash
cd examples/example-app
npm install
npm start   # builds TypeScript, fires three mock-signed webhooks, exits 0
```

The example signs each provider's payload with Node's own `crypto.createHmac`
(independently of the library) and validates all three through the middleware.
````

## Info

### IN-01: `Content-Length` header set as a number rather than a string in all three senders

**File:** `examples/example-app/src/stripe.ts:36`, `examples/example-app/src/github.ts:34`, `examples/example-app/src/shopify.ts:38`
**Issue:** `'Content-Length': bodyBytes.length` passes a `number`. Node's
`OutgoingHttpHeaders` tolerates numeric header values and the app runs fine, but HTTP
header values are conceptually strings and most reference code uses
`String(bodyBytes.length)`. As example code that developers copy, the string form is the
cleaner pattern to model.
**Fix:** `'Content-Length': String(bodyBytes.length)` in all three senders. (Also note
that for a single fixed-size `req.write` + `req.end`, Node will set `Content-Length`
automatically, so the header could simply be omitted — but keeping it explicit is fine
for a teaching example.)

### IN-02: GitHub/Shopify delivery IDs are hardcoded constants, undercutting the replay-dedup lesson

**File:** `examples/example-app/src/github.ts:13`, `examples/example-app/src/shopify.ts:17`
**Issue:** `deliveryId` and `webhookId` are fixed string literals reused on every run.
The README and the route comments (`index.ts:55,79`) emphasize that GitHub/Shopify
replay defense relies on a consumer dedup store keyed on these IDs. An example that
hardcodes a constant ID models exactly the value that a real dedup store would treat as
a duplicate on the second run. Using a freshly generated UUID per fire would better
reinforce the "unique per delivery" lesson the docs stress.
**Fix:** Generate per-call, e.g. `import { randomUUID } from 'node:crypto';` then
`const deliveryId = randomUUID();` / `const webhookId = randomUUID();`.

### IN-03: README links to the `bytes` package as the parser for `rawBodyCapture({ limit })`, but `bytes` is only a transitive dependency

**File:** `README.md:119`
**Issue:** The Configuration Reference says the `limit` option is "Parsed by the
[`bytes`](https://www.npmjs.com/package/bytes) package". `bytes` is not a direct
dependency of this library — it arrives transitively via `raw-body` (the only declared
runtime dep, `package.json:32`; `bytes` appears at `node_modules/raw-body/package.json`).
The behavior is accurate (the limit string is ultimately parsed by `bytes`), but pinning
a public doc to a transitive dependency's name is fragile: if `raw-body` ever swaps its
size parser, this README line becomes wrong with no signal. Minor, since the syntax it
documents (`'512kb'`, `2097152`) is stable regardless.
**Fix:** Soften to behavior rather than implementation, e.g. "Accepts a byte count or a
human-readable size string (`'512kb'`, `'2mb'`, `2097152`)", and drop the direct link to
the transitive package.

### IN-04: Example `tsconfig.json` inherits `moduleResolution: "bundler"` from the root config while emitting with plain `tsc`

**File:** `examples/example-app/tsconfig.json:1-2`
**Issue:** The example extends the root `tsconfig.json` (`tsconfig.json:7`,
`moduleResolution: "bundler"`) but builds with `tsc` directly (`package.json:7`,
`"build": "tsc"`) rather than a bundler. The build currently succeeds (verified: `npx
tsc` exits 0 and emits `build/*.js`) because the source already uses explicit `.js`
import specifiers, so this is not a live bug. It is, however, a latent mismatch: `bundler`
resolution is intended for toolchains that do their own resolution, and pairing it with
`tsc`-emit can surprise a contributor who later adds an extensionless or `paths`-based
import. For a copy-me example, `"moduleResolution": "nodenext"` (or `"node16"`) more
honestly matches the "compile with tsc, run on Node" workflow.
**Fix:** Add an explicit override in `examples/example-app/tsconfig.json`:

```jsonc
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "moduleResolution": "nodenext",
    "module": "nodenext",
    "outDir": "./build",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"]
}
```

---

_Reviewed: 2026-06-04T05:41:51Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
