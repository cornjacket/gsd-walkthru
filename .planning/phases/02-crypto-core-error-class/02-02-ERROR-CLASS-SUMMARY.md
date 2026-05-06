---
phase: 02-crypto-core-error-class
plan: "02"
subsystem: error-class
tags: [error-class, typescript, security, leakage-prevention, tdd]
dependency_graph:
  requires: []
  provides: [WebhookValidationError, WebhookValidationReason]
  affects: [src/index.ts (Plan 03 will re-export from here)]
tech_stack:
  added: []
  patterns: [discriminated-union, options-object-constructor, whitelist-toJSON, structural-leakage-prevention]
key_files:
  created:
    - src/errors.ts
    - src/errors.test.ts
  modified: []
decisions:
  - "D-05: Constructor { reason, provider, statusCode } options-object only — no message, no cause, no details"
  - "D-06: Message auto-derived via messageFor(reason, provider) — caller cannot override"
  - "D-07: Exactly 4 reasons: signature_mismatch | timestamp_too_old | missing_header | missing_secret"
  - "D-08: lowercase_underscore naming — ARCHITECTURE.md UPPER_SNAKE overridden"
  - "D-09: statusCode required from caller — no auto-derivation"
  - "D-10: reason, provider, statusCode are public readonly; name = WebhookValidationError"
  - "D-11: Structural leakage prevention — toJSON whitelists 5 keys; toString not overridden"
  - "D-12: Co-located unit tests in src/errors.test.ts"
  - "D-13: All required test cases implemented"
  - "D-14: Inline test data only — no fixtures directory"
metrics:
  duration: "2 minutes"
  completed: "2026-05-06T18:54:24Z"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 2 Plan 02: WebhookValidationError Class Summary

WebhookValidationError class with structurally-impossible leakage of sensitive data, using options-object constructor `{ reason, provider, statusCode }` with auto-derived message, 4-reason lowercase_underscore union, and whitelist toJSON — all D-05..D-14 decisions honored.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| RED | Add failing tests for WebhookValidationError | 361b0b4 | src/errors.test.ts |
| GREEN | Implement WebhookValidationError with messageFor lookup | 4114389 | src/errors.ts |

## What Was Built

### `src/errors.ts`

The `WebhookValidationError` class that every later provider phase will throw. Key properties:

- **Constructor shape (locked D-05):** `new WebhookValidationError({ reason, provider, statusCode })` — single options object, no `message` parameter, no `cause`, no `details`
- **Auto-derived message (D-06):** Internal `messageFor(reason, provider)` produces `"<provider> webhook <human reason>"` — deterministic, contains provider name, consumes nothing outside reason/provider
- **Reason union (D-07):** Exactly 4 members: `'signature_mismatch' | 'timestamp_too_old' | 'missing_header' | 'missing_secret'`
- **Naming convention (D-08):** lowercase_underscore — ARCHITECTURE.md's UPPER_SNAKE form was NOT used
- **Field visibility (D-10):** `reason`, `provider`, `statusCode` are `public readonly`; `name` set to `'WebhookValidationError'`
- **Whitelist serialization (D-11):** `toJSON()` returns exactly `{ name, reason, provider, statusCode, message }` — no `cause`, no `stack`, no extras
- **No toString override (D-11):** Falls through to `Error.prototype.toString` producing `"WebhookValidationError: <safe message>"`
- **No logging, no env reads, no imports** beyond global `Error`

### `src/errors.test.ts`

Co-located Vitest unit tests covering all D-13 cases:

1. Constructor stores `reason`, `provider`, `statusCode` on instance
2. Instance is `instanceof Error` AND `instanceof WebhookValidationError`
3. `name` equals `'WebhookValidationError'`
4. Auto-derived message is non-empty and contains the provider name
5. All 4 reasons round-trip via `it.each<WebhookValidationReason>` (typed — compile-time enforces D-07)
6. `JSON.stringify(err)` and `String(err)` do not contain SAMPLE_SIGNATURE, SAMPLE_SECRET, or SAMPLE_BODY (structural leakage lock)
7. `toJSON` whitelist test: parsed keys are exactly `['message', 'name', 'provider', 'reason', 'statusCode']`

**Test count:** 10 tests pass (6 `it` blocks + 4 from `it.each` expansion)

## Verification Results

- `npx vitest run`: 11 tests pass (10 from errors.test.ts + 1 from index.test.ts)
- `npx biome check .`: 0 issues across all files
- `npx tsc --noEmit`: 0 errors
- `npm run build`: dist artifacts created; no test files in dist
- `dist/errors.d.ts`: exports both `WebhookValidationError` (class) and `WebhookValidationReason` (type)
- `package.json` dependencies: still empty (`{}`)
- `git diff --stat` (vs base): 2 new files added (`src/errors.ts`, `src/errors.test.ts`); no other files modified

## ARCHITECTURE.md Overrides Applied

The plan explicitly directed NOT to use ARCHITECTURE.md's error class shape. Applied CONTEXT.md overrides on all 5 disagreement points:

| Aspect | ARCHITECTURE.md (NOT used) | CONTEXT.md (used) | Decision |
|--------|---------------------------|-------------------|----------|
| Reason naming | `'SIGNATURE_MISMATCH'` UPPER_SNAKE | `'signature_mismatch'` lowercase_underscore | D-08 |
| Constructor | `(reason, provider, message)` positional | `({ reason, provider, statusCode })` options-object | D-05 |
| `message` param | caller-supplied | auto-derived via `messageFor()` | D-06 |
| `statusCode` | `private computeStatusCode(reason)` auto | required from caller | D-09 |
| `cause`/`details` | silent/possible | structurally absent | D-11 |

## Threats Mitigated

| Threat ID | Status | Mechanism |
|-----------|--------|-----------|
| T-02-07 | Mitigated | Constructor has no `message` parameter — `messageFor(reason, provider)` only |
| T-02-08 | Mitigated | `toJSON()` whitelists exactly 5 safe keys |
| T-02-09 | Mitigated | `toString()` not overridden — uses safe auto-derived message |
| T-02-10 | Mitigated | Union has exactly 4 members; `it.each<WebhookValidationReason>` typed check |
| T-02-11 | Mitigated | Options-object constructor; grep gates forbid `cause:` and `details:` |
| T-02-12 | Mitigated | `statusCode` required from caller; no `computeStatusCode` method |
| T-02-13 | Accepted | `target: ES2020` native class extension — no `Object.setPrototypeOf` shim needed; test will catch regression if tsconfig changes |

## Deviations from Plan

None — plan executed exactly as written.

## TDD Gate Compliance

- RED gate: `test(02-02)` commit `361b0b4` — failing test file written before any implementation
- GREEN gate: `feat(02-02)` commit `4114389` — implementation written after tests, all 10 tests pass
- REFACTOR gate: not needed — implementation was clean on first pass

## Known Stubs

None — both files are fully implemented with no placeholder data or hardcoded empty values.

## Self-Check: PASSED

- `src/errors.ts` exists: FOUND
- `src/errors.test.ts` exists: FOUND
- Commit `361b0b4` (test/RED): FOUND
- Commit `4114389` (feat/GREEN): FOUND
- All 10 tests pass
- Biome lint clean
- TypeScript strict compilation clean
- Build artifacts in dist/ verified
