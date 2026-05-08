---
phase: 05-github-shopify-providers
plan: 01
subsystem: webhook-providers
tags: [github, hmac, sha256, webhook, provider, signature-validation, vitest]

# Dependency graph
requires:
  - phase: 02-crypto-core-error-class
    provides: computeHmac (Buffer-direct HMAC-SHA256), timingSafeCompare (length-mismatch returns false), WebhookValidationError (locked 6-member reason union)
  - phase: 03-body-handling-public-api-surface
    provides: req.rawBody Buffer (D-06), Provider interface (D-01), registerProvider self-registration (D-03), GitHubWebhook branch type (D-09), parsed:unknown lock (WR-05)
  - phase: 04-stripe-provider
    provides: 9-step validation pipeline template, three-way header distinction (D-04), co-located unit-test convention (D-11), expect(() => ...).toThrow() outer-guard pattern (D-12)
provides:
  - Real githubProvider.validate() implementation (8-step pipeline, D-13 step order)
  - GHUB-01: HMAC-SHA256 over rawBody Buffer; sha256=<hex> header parsing with hex-tail validation
  - GHUB-02: Deprecated SHA-1 X-Hub-Signature header invisible to validator (SHA-1-only → 'missing_header')
  - GHUB-03: req.webhook.deliveryId surfaced from X-GitHub-Delivery (missing → '', array → first value)
  - D-10 three-way auth-header split (WR-03 fix from day one — array → 'invalid_signature_format', not folded into 'missing_header')
  - D-14 outer-toThrow + try/catch test discipline (WR-02 fix from day one)
  - 13 co-located unit tests pinning ROADMAP SC1 / SC2 / SC5
affects: [phase-06-cross-provider-tests-coverage-audit, phase-07-readme-examples-replay-protection-docs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Provider validate() is body-only HMAC (no timestamp prefix) — divergence from Stripe"
    - "computeHmac(req.rawBody, secret, 'sha256') Buffer-direct (D-07) — no UTF-8 round-trip on the HMAC input"
    - "Three-way auth-header guard: undefined → 'missing_header'; non-string → 'invalid_signature_format'; parses-but-no-match → 'signature_mismatch' (D-10, fixes Phase 4 WR-03 from day one)"
    - "Metadata-header array-collapse helper inlined: Array.isArray(h) ? (h[0] || '') : (typeof h === 'string' ? h : '')"
    - "Test fixture builder uses node:crypto.createHmac directly (NOT the library's computeHmac) so tests are not tautological"
    - "Every error-case test: outer expect(() => provider.validate(...)).toThrow(WebhookValidationError) BEFORE try/catch reason/statusCode introspection (D-14, fixes Phase 4 WR-02 from day one)"

key-files:
  created:
    - src/providers/github.test.ts (13 tests, 252 lines)
  modified:
    - src/providers/github.ts (replaced stub validate body, added `export` keyword on the provider const)

key-decisions:
  - "Phase 4 WR-03 (array-shaped auth header folded into 'missing_header') is fixed from day one in github.ts — D-10 three-way split lands in the implementation; the corresponding test asserts reason !== 'missing_header'."
  - "Phase 4 WR-02 (vacuous-pass tests when validate() doesn't throw) is fixed from day one in github.test.ts — every error-case test has the mandatory outer-toThrow guard."
  - "GitHub HMAC input is the rawBody Buffer DIRECTLY (D-07): no .toString('utf8') round-trip, no timestamp prefix. Diverges from stripe.ts which prefixes with '${t}.'. Buffer-direct mirrors what GitHub signs byte-for-byte and avoids UTF-8 normalization issues on edge inputs."
  - "Validator NEVER reads the deprecated SHA-1 header (D-01/D-02). The acceptance grep `x-hub-signature[^-]` returns 0 — the deprecated header name does not appear in github.ts at all (not even in comments after rewording)."
  - "WebhookValidationReason union NOT widened (D-16). src/errors.ts is byte-for-byte unchanged. SHA-1-only request → 'missing_header'; hex-tail-malformed → 'invalid_signature_format'; tampered body → 'signature_mismatch'; non-JSON authenticated body → 'malformed_payload'. All four are pre-existing reasons."
  - "Metadata-missing semantics (D-08): missing/empty X-GitHub-Delivery → deliveryId === '' and eventId === ''; validation succeeds. The validator's job is auth, not metadata contract-policing — mirrors P4 D-09 for body.id."
  - "eventId === deliveryId (D-11): cross-provider canonical dedup field is populated from the delivery header. Consumer reading req.webhook?.eventId without narrowing always gets a meaningful token."

patterns-established:
  - "Buffer-direct HMAC for body-only providers: GitHub & Shopify pass req.rawBody to computeHmac with no string round-trip. Stripe's prefixed-string variant stays as-is. Pattern is per-provider — chosen by what the provider actually signs."
  - "Day-one corrected three-way header guard for new validators (D-10): replicate this exact shape in shopify.ts (Plan 05-02). Phase 4 stripe.ts retains the WR-03 fold defect as Phase 6 audit territory."
  - "Co-located test fixture builder pattern: makeReq({ body, rawBody, signature, delivery, extraHeaders }) returns a minimal Express Request shape. Inline duplication preferred over a shared test-fixtures.ts (Phase 1 D-04 spirit)."
  - "Outer-toThrow guard placement: the outer expect(() => validate(...)).toThrow() comes BEFORE the try/catch reason/statusCode introspection. Both halves are required for every error-case test."

requirements-completed: [GHUB-01, GHUB-02, GHUB-03]

# Metrics
duration: 7min
completed: 2026-05-08
---

# Phase 5 Plan 01: GitHub Provider Summary

**Real HMAC-SHA256 validator for GitHub webhooks with day-one WR-03 / WR-02 fixes (8-step pipeline, Buffer-direct HMAC, three-way auth-header split, outer-toThrow test discipline) — 13 unit tests pinning SC1/SC2/SC5.**

## Performance

- **Duration:** ~7 min (executor wall-clock; ~440s)
- **Started:** 2026-05-08T17:48:35Z
- **Completed:** 2026-05-08T17:55:55Z
- **Tasks:** 2 (both auto, both committed atomically)
- **Files modified:** 1 (src/providers/github.ts)
- **Files created:** 1 (src/providers/github.test.ts)
- **Tests added:** 13 (full suite: 99 across 12 files; was 86 across 11)

## Accomplishments

- Replaced the throwing Phase 3 stub at `src/providers/github.ts` with a real HMAC-SHA256 webhook signature validator implementing the D-13 8-step pipeline (rawBody guard → header three-way split → sha256= prefix + hex-tail parse → Buffer-direct HMAC → timingSafeCompare → metadata array-collapse → JSON.parse-after-success → build GitHubWebhook).
- Shipped 13 co-located unit tests in `src/providers/github.test.ts` pinning ROADMAP SC1 (valid X-Hub-Signature-256 passes; SHA-1-only rejected), SC2 (req.webhook.deliveryId from X-GitHub-Delivery), and the SC5 binding cases for GitHub.
- Fixed Phase 4 WR-03 (array-shaped header folded into 'missing_header') from day one — the github.ts implementation has the corrected three-way split, and the github.test.ts D-10 test explicitly asserts `reason !== 'missing_header'`.
- Fixed Phase 4 WR-02 (vacuous-pass tests) from day one — every error-case test in github.test.ts has the mandatory outer `expect(() => githubProvider.validate(...)).toThrow(WebhookValidationError)` guard before try/catch reason introspection.
- Honored "no vendor SDKs" — no `@octokit/webhooks` import; pure HMAC-SHA256 over the raw bytes via `node:crypto`-based `computeHmac`.
- `src/errors.ts` byte-for-byte unchanged: WebhookValidationReason stays at the 6-member shape locked after Phase 4. Phase 5 adds zero new reasons (D-16).

## Task Commits

Each task was committed atomically on the worktree branch:

1. **Task 1: Implement real githubProvider.validate() in src/providers/github.ts** — `d1b2d5c` (feat)
2. **Task 2: Create co-located unit test file src/providers/github.test.ts** — `a96ae16` (test)

**Plan metadata:** _to be added by the SUMMARY.md commit (this file)_.

_Note: Plan-level TDD ordering deviated from the canonical RED-then-GREEN sequence — see "Deviations from Plan" below for rationale._

## Files Created/Modified

- `src/providers/github.ts` — Replaced the stub validate() body with the 8-step real implementation. Changed `const githubProvider` → `export const githubProvider` so the co-located test file can import the provider directly. Kept the `GitHubWebhook` type export and the bottom-of-file `registerProvider('github', githubProvider)` self-registration call (Phase 3 D-03).
- `src/providers/github.test.ts` — NEW. 13 `it(...)` blocks under one `describe('githubProvider.validate()', ...)`: happy path (eventId === deliveryId, D-11/D-12 timestamp window), dual-header (D-02), tampered body (signature_mismatch), SHA-1-only (missing_header per D-01), bare hex / non-hex tail (invalid_signature_format per D-03), missing / array-shaped X-Hub-Signature-256 (D-10), missing rawBody / non-JSON body (malformed_payload per P3 D-07 / D-13 step 7), missing / array-shaped X-GitHub-Delivery (D-08 / D-09 / D-11), and a leakage assertion (no SAMPLE_SECRET / SAMPLE_BODY in serialized errors).
- `log.md` — Appended one task-granularity entry for the 05-01 plan with `Commit: \`_pending_\`` per CLAUDE.md rule 3. Will be back-filled by the orchestrator's next commit (CLAUDE.md "do not create a dedicated commit just to back-fill").

## Decisions Made

All key decisions were already locked in `05-CONTEXT.md` (D-01..D-17) before this plan ran. Plan-level decisions during execution:

- **Plan-level TDD ordering follows the plan's task sequence (impl-first, tests-second)** instead of the canonical RED-then-GREEN gate. The plan author chose impl-first explicitly via Task 1's `<action>` (replace validate body) and Task 2's `<action>` (create test file). Both tasks carry `tdd="true"`, but the per-task action sections override the gate sequence. Documented as a deviation below; impact is contained because both halves landed in the same plan and the plan-level verifier (full `npm test` after Task 2) gates regression.
- **Comment wording trimmed to satisfy the strict acceptance grep** `grep -cE "x-hub-signature[^-]" src/providers/github.ts` MUST return 0. The plan's prescribed paste-this-exactly code template included a comment line "The deprecated x-hub-signature (SHA-1) is invisible…" that contained the forbidden substring `x-hub-signature ` (space after, not hyphen). Reworded the comment to use "The deprecated SHA-1 header (the one without the -256 suffix)" so the file references the deprecated header conceptually without ever using the exact token. Acceptance grep now returns 0 cleanly. Rationale: the acceptance criterion is the verifiable contract; the prescribed code template is a starting point.
- **Leakage test (#13) given an explicit outer-toThrow guard** even though the plan's code-template did not show one. The plan's acceptance criterion requires "outer-guard count >= 9 (one for each error-case test — 9 of the 13 tests are error cases)". Without an outer guard on the leakage test, the count was 8. Added the guard so the leakage test also follows D-14 discipline strictly (the leakage assertion lives in a try/catch, so without an outer guard a vacuous return would silently pass it).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comment text in plan's code template violated its own acceptance grep**

- **Found during:** Task 1 acceptance verification
- **Issue:** The plan's `<action>` section prescribed pasting the code "exactly" — but a comment line in that prescribed code (`// The deprecated x-hub-signature (SHA-1) is invisible — never read for any purpose.`) contained the substring `x-hub-signature ` (space after the prefix, no `-256` continuation), which the acceptance criterion's grep `grep -cE "x-hub-signature[^-]" src/providers/github.ts` matches and requires to be `0`. The plan's `<verify><automated>` block also enforces `[ "$(grep -cE 'x-hub-signature[^-]' src/providers/github.ts)" = "0" ]`. The prescribed code therefore could not satisfy its own acceptance grep.
- **Fix:** Rewrote the comment block to convey the same intent without using the literal "x-hub-signature " token: "The deprecated SHA-1 header (the one without the -256 suffix) is invisible — never read for any purpose. SHA-1-only request → 'missing_header' (D-01)." The `D-01 / D-02 / GHUB-02: validator looks ONLY at x-hub-signature-256.` line is preserved verbatim (it has the `-256` continuation, so the grep doesn't match it).
- **Files modified:** src/providers/github.ts (lines 18-20)
- **Verification:** `grep -cE "x-hub-signature[^-]" src/providers/github.ts` returns 0; D-01/D-02 intent is still documented in the comment block.
- **Committed in:** d1b2d5c (Task 1 commit)

**2. [Rule 2 - Missing Critical] Outer-toThrow guard added to leakage test (D-14 strict compliance)**

- **Found during:** Task 2 acceptance verification (outer-toThrow count was 8, needed ≥9)
- **Issue:** The plan's prescribed leakage test (#13) had a try/catch around `githubProvider.validate(...)` to introspect the serialized error, but no outer `expect(() => ...).toThrow(WebhookValidationError)` guard. Without that guard, if `validate()` ever silently returned instead of throwing (e.g., a future regression where the tampered-body path falls through), the try/catch body would never execute and the leakage assertions would vacuously pass. This is exactly the WR-02 defect Phase 5 D-14 mandates fixing from day one — every error-case test gets the outer guard.
- **Fix:** Added `expect(() => githubProvider.validate(req as any, SAMPLE_SECRET)).toThrow(WebhookValidationError)` immediately before the try/catch in the leakage test, with an inline comment explaining why (D-14 / WR-02).
- **Files modified:** src/providers/github.test.ts (leakage test, ~5 added lines)
- **Verification:** outer-toThrow count is now 9 (matching the acceptance criterion); all 13 tests still pass; the leakage assertions are now structurally protected against the WR-02 vacuous-pass mode.
- **Committed in:** a96ae16 (Task 2 commit)

**3. [Rule 3 - Blocking] Plan-level TDD gate ordering inverted (impl-first, tests-second)**

- **Found during:** Plan execution start
- **Issue:** Both tasks carry `tdd="true"`. Canonical TDD gate sequence is RED (failing test) → GREEN (impl) → REFACTOR. The plan's Task 1 `<action>` ships the implementation; Task 2 `<action>` ships the tests. The actions are explicit and override the canonical gate sequence — but the plan-level frontmatter's `type: execute` and `tdd="true"` markers imply RED-first.
- **Fix:** Followed the plan's explicit task sequence (impl-first as written in the `<action>` blocks) rather than reversing to RED-first. Rationale: the plan's prescribed task order is part of the contract from the planner; reversing it would require fabricating a failing-test-first commit that the plan does not specify. After Task 2 the regression gate (full `npm test` green) acts as the plan-level GREEN-equivalent verification.
- **Files modified:** None (procedural decision, not a code change)
- **Verification:** Both tasks land green: Task 1 alone passes tsc strict; full `npm test` after Task 2 returns 99/99 across 12 files (was 86/11 pre-plan). The plan's success criteria (all 10 items in `<success_criteria>`) are met.
- **Documented in:** This SUMMARY (no commit — procedural).

---

**Total deviations:** 3 auto-fixed (1 bug in plan-prescribed text vs. own acceptance grep, 1 missing-critical D-14 enforcement on the leakage test, 1 procedural TDD-gate-ordering note)
**Impact on plan:** All three are necessary for satisfying the plan's own acceptance criteria and security/correctness intent (D-14 outer-guard discipline). No scope creep — the source of truth (acceptance criteria + locked decisions) drove every adjustment.

## TDD Gate Compliance

The plan-level TDD frontmatter (`type: execute` with both tasks `tdd="true"`) implies the RED → GREEN gate sequence, but the plan's per-task `<action>` blocks ship implementation first (`feat`) and tests second (`test`). The git log for this plan therefore reads:

- `d1b2d5c feat(05-01): replace github.ts stub with real HMAC-SHA256 validator` — Task 1, GREEN-equivalent (impl)
- `a96ae16 test(05-01): add co-located unit tests for githubProvider.validate()` — Task 2, RED-equivalent (tests, but landing AFTER impl)

This inverts the strict gate sequence. Documented as a deviation above. Mitigation: Task 2's full `npm test` green run (99/99) is the plan-level regression gate that acts as the cross-task verification. Phase 6 audit can revisit if strict TDD gate ordering becomes a project-wide policy.

## Issues Encountered

- **Worktree path confusion at executor start:** the Bash tool's per-call cwd reset surfaced as a `cd /home/.../gsd-walkthru` (parent repo) instead of `cd /home/.../worktrees/agent-...` (worktree). First Write call landed in the parent repo's `src/providers/github.ts`. Reverted the parent-repo file with `git checkout --` and re-Wrote to the worktree's absolute path. No dirty state escaped the worktree branch; the parent repo's tracked tree was returned to clean. All subsequent Read/Write/Bash calls use the worktree absolute path explicitly.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 05-02 (Shopify provider) can run in parallel** — it modifies a disjoint file set (`src/providers/shopify.{ts,test.ts}`) and depends on the same Phase 2 / Phase 3 / Phase 4 baseline. The day-one corrected patterns (D-10 three-way header split, D-14 outer-toThrow guards, D-07 Buffer-direct HMAC) established here are also the planner-prescribed patterns for shopify.ts — the implementation shape transfers nearly verbatim with the encoding swap (`Buffer.from(headerHex, 'hex')` → `Buffer.from(headerValue, 'base64')`) and metadata header swap (`X-GitHub-Delivery` → `X-Shopify-Topic` + `X-Shopify-Webhook-Id`).
- **Phase 6 audit territory remains open:** the Phase 4 stripe.ts WR-03 fold defect, WR-02 vacuous-pass tests, WR-01 NaN tolerance, WR-04 default-tolerance literal, WR-05 parseInt timestamp leniency. Phase 5 deliberately did NOT preempt these (D-17 module layout lock).
- **`req.webhook.deliveryId` surface is live for consumers:** the Phase 7 README replay-protection caveat (DOCS-02) can now point at a real validator that exposes the dedup token.

## Self-Check: PASSED

- File `src/providers/github.ts` exists with the real validate body and `export const githubProvider` — verified via grep.
- File `src/providers/github.test.ts` exists with 13 it() blocks — verified via grep.
- Commits `d1b2d5c` (Task 1) and `a96ae16` (Task 2) exist on the worktree branch — verified via `git log --oneline`.
- Full `npm test` returns 99/99 across 12 files — green.
- `npx tsc --noEmit -p tsconfig.json` exits 0 — green.
- `src/errors.ts`, `src/middleware.ts`, `src/index.ts`, `src/providers/types.ts`, `src/providers/registry.ts`, `src/providers/stripe.ts` byte-for-byte unchanged — verified via empty `git diff` output.
- `grep -cE "x-hub-signature[^-]" src/providers/github.ts` returns 0 — D-02 deprecated-header invisibility verified.
- `grep -cE "console\." src/providers/github.{ts,test.ts}` returns 0 — P3 D-16 library-never-logs verified.

---
*Phase: 05-github-shopify-providers*
*Completed: 2026-05-08*
