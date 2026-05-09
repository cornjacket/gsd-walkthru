# Phase 6: Integration Tests, Coverage Gate & Negative-Case Audit - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 6-Integration Tests, Coverage Gate & Negative-Case Audit
**Areas discussed:** Coverage tooling & gate, Integration suite layout, Carry-over audit scope, 'Fails when guard removed' verification

---

## Coverage tooling & gate

### Q1: Coverage provider

| Option | Description | Selected |
|--------|-------------|----------|
| @vitest/coverage-v8 (Recommended) | Native V8 coverage — no instrumentation pass, ~zero overhead, no source-map mismatches with tsup output. Vitest's default. | ✓ |
| @vitest/coverage-istanbul | Babel instrumentation; stricter branch coverage than V8 but slower test runs. | |

**User's choice:** @vitest/coverage-v8

### Q2: File scope for >90% gate

| Option | Description | Selected |
|--------|-------------|----------|
| Strict ROADMAP scope (Recommended) | Gate exactly src/crypto/**, src/providers/**, src/middleware.ts. Other src/ files measured but not gated. | ✓ |
| Expand to all of src/ that ships | Gate every shipping file (errors.ts, error-handler.ts, raw-body/, etc.). Stronger but goes beyond SC2. | |
| Aggregate-only (no per-file) | Single global >90% threshold; weaker signal because well-tested files mask poorly-tested ones. | |

**User's choice:** Strict ROADMAP scope

### Q3: Threshold mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Per-file via include + thresholds.perFile (Recommended) | vitest.config.ts: coverage.include scoped to the three core paths + thresholds.perFile=true at 90 across all four metrics. Single source of truth. | ✓ |
| Global aggregate only | thresholds.lines: 90, perFile: false. Easier to keep green; weaker signal. | |
| External post-test script reading lcov | scripts/check-coverage.mjs parses lcov and asserts per-file. More flexible, more maintenance. | |

**User's choice:** Per-file via include + thresholds.perFile

### Q4: Coverage in CI

| Option | Description | Selected |
|--------|-------------|----------|
| One canonical cell only (Node 22 × Express 5.x) (Recommended) | Coverage step on canonical cell only; 5 other cells stay test-only. Fast, deterministic. | ✓ |
| Every matrix cell | All 6 cells run coverage. ~6× collection overhead, no upside for V8 coverage on this codebase. | |
| Separate workflow (coverage.yml) | Cleaner separation; extra YAML to maintain. | |

**User's choice:** One canonical cell only

### Q5: V8 ignore-comment policy

| Option | Description | Selected |
|--------|-------------|----------|
| Disallow (Recommended) | No /* v8 ignore */ directives anywhere in src/. If gate trips, fix is a real test or refactor. | ✓ |
| Allow with mandatory justification comment | /* v8 ignore next -- <reason> */ permitted for genuinely unreachable code. | |
| Planner's discretion | Don't lock now; let planner decide if any uncoverable line surfaces. | |

**User's choice:** Disallow

**Notes:** User asked Claude to check the work log first for prior coverage decisions. Findings reported back: lcov upload had no prior decision (deferred); test:coverage script alias is planner discretion; vitest test `include` MUST expand for tests/integration/ per Phase 1 D-05; V8 ignore policy was the only real open question to lock.

---

## Integration suite layout

**Pre-decided (skipped re-asking):** File location is locked at `tests/integration/` by Phase 1 D-05 ("`tests/integration/` reserved for Phase 6 Supertest suite"). Did not re-ask.

### Q1: File granularity inside tests/integration/

| Option | Description | Selected |
|--------|-------------|----------|
| One file per provider (Recommended) | tests/integration/{stripe,github,shopify}.test.ts — mirrors unit-test file shape; coverage report cleanly attributes lines per provider. | ✓ |
| One consolidated cross-provider file | all-providers.test.ts; smaller surface but failures obscure which provider broke. | |
| Per-provider + a cross-cutting file | Adds cross-provider.test.ts for multi-provider scenarios. Defer until justified. | |

**User's choice:** One file per provider

### Q2: Express app builder pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Per-test factory (Recommended) | makeApp(provider, options) returns a fresh Express instance per test. Maximum isolation. Mirrors Phase 3 middleware.test.ts. | ✓ |
| Shared module-level app | Built once, reused; faster but state-leak risk. | |
| Test-fixtures package | tests/integration/fixtures/ folder with reusable signers + makeApp; overkill for ~3-5 tests per provider. | |

**User's choice:** Per-test factory

### Q3: Body-parser modes per provider

| Option | Description | Selected |
|--------|-------------|----------|
| Both modes per provider (Recommended) | Two describe() groups per file: 'mounted before express.json()' AND 'alongside express.json({verify})'. Pins down BODY-01 + BODY-02 across all three providers. | ✓ |
| Mounted-before mode only | Skip the verify-callback path at integration tier; trust Phase 3 unit tests. | |
| verify-callback mode only on one provider | Compromise: prove verify pattern on Stripe; other two only test mounted-before. | |

**User's choice:** Both modes per provider

### Q4: Signed-payload generation

| Option | Description | Selected |
|--------|-------------|----------|
| Duplicate inline per integration file (Recommended) | ~5-line makeSignature per file. Mirrors Phase 1 D-04 inline-duplication convention. | ✓ |
| Extract to tests/integration/_signers.ts | DRY-er; new module to maintain. | |
| Refactor to shared tests/_fixtures/ | Touches Phase 5 unit-test files; high churn for marginal gain. | |

**User's choice:** Duplicate inline per integration file

---

## Carry-over audit scope

### Q1: P4 WR-03 (Stripe array-header misclassification)

| Option | Description | Selected |
|--------|-------------|----------|
| Fix in this phase (Recommended) | Mirror Phase 5 D-10 split. Add test fixture asserting 'invalid_signature_format' and not.toBe('missing_header'). Phase 5 D-10 explicitly promised this. | ✓ |
| Defer | Carry asymmetry into v1; consumers debugging see misleading 'missing_header'. | |

**User's choice:** Fix in this phase

### Q2: P4 WR-01 (NaN tolerance silently disables replay)

| Option | Description | Selected |
|--------|-------------|----------|
| Fix — add factory guard (Recommended) | Loud-fail at factory call time on non-finite/negative tolerance. Mirrors P3 WR-03 precedent. Tests in middleware.test.ts. | ✓ |
| Defer | Documented gap; consumers responsible for not passing NaN. | |

**User's choice:** Fix — add factory guard

### Q3: P4 WR-05 (parseInt 't=' leniency)

| Option | Description | Selected |
|--------|-------------|----------|
| Fix — tighten parser to /^-?\d+$/ (Recommended) | Restores D-04 three-way mapping symmetry. Test fixture for 't=1700000000xyz,v1=<hex>'. | ✓ |
| Defer | Current behavior fail-closes with less-precise reason. | |

**User's choice:** Fix — tighten parser

### Q4: Remaining advisory bundle (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| P4 WR-02 — outer toThrow guards on 4 vacuous-pass stripe.test.ts tests (Recommended) | Closes the gap on legacy stripe.test.ts. | ✓ |
| P5 WR-01 — empty-string sig tests on github.test.ts and shopify.test.ts (Recommended) | Locks the cross-provider asymmetry against future-refactor regression. | ✓ |
| P5 WR-02 — fix vacuous body-leakage assertions in github.test.ts:230 and shopify.test.ts:233 (Recommended) | Same vacuous-pass shape as P4 WR-02. Assert against bytes actually sent. | ✓ |
| P4 WR-04 — deduplicate the default-tolerance literal 300 | Pure style/maintainability. Single source of truth in middleware. | ✓ |

**User's choice:** All four

### Q5: P5 WR-03 (defense-in-depth leakage on invalid_signature_format path)

| Option | Description | Selected |
|--------|-------------|----------|
| Add the assertions (Recommended) | One extra `expect(JSON.stringify(err)).not.toContain(<bareHex>)` per provider. Future-refactor insurance. | ✓ |
| Skip | Trust structural P2 D-11 guarantee; other leakage tests cover the realistic threat shape. | |

**User's choice:** Add the assertions

---

## 'Fails when guard removed' verification

### Q1: Verification mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Manual mutation experiment, evidence in 06-VERIFICATION.md (Recommended) | One-shot mutation per guard during execution; documented as a 5-row table in 06-VERIFICATION.md. Zero new tooling. | ✓ |
| One-shot Stryker mutation-test run | Far more thorough; adds tool dependency, ~5-15 min mutation runs. Probably overkill for portfolio v1. | |
| Custom script under scripts/test-guard-removal.mjs | Repeatable in CI; brittle to source drift. | |
| Trust structural guarantee (no mutation experiment) | Cheapest; ROADMAP SC3 'demonstrably' implies a one-time demo at minimum. | |

**User's choice:** Manual mutation experiment, evidence in 06-VERIFICATION.md

### Q2: Guard list and tier

| Option | Description | Selected |
|--------|-------------|----------|
| Exact ROADMAP-5, mutate at integration tier (Recommended) | Five mutations against the new integration suite. Each fails an integration test — strongest signal that the integration tier earns its keep. | ✓ |
| Exact ROADMAP-5, mutate at unit tier | Cheaper but doesn't validate the integration tier catches them. | |
| Both tiers (10 mutations) | Strongest evidence; ~20 min executor effort. | |

**User's choice:** Exact ROADMAP-5, mutate at integration tier

### Q3: Evidence location

| Option | Description | Selected |
|--------|-------------|----------|
| 06-VERIFICATION.md, dedicated 'Guard Removal Demonstrations' section (Recommended) | 5-row markdown table alongside SC1/SC2/SC4 evidence. Single source of truth. | ✓ |
| Separate 06-MUTATION-EVIDENCE.md document | Cleaner separation if table grows long; one more file. | |
| Inline in commit message + reference from 06-VERIFICATION.md | Kept close to code; harder to find later. | |

**User's choice:** 06-VERIFICATION.md, dedicated 'Guard Removal Demonstrations' section

### Q4: Mutation discipline

| Option | Description | Selected |
|--------|-------------|----------|
| Sequential, no commits, verify clean tree (Recommended) | edit → test → revert → next. After all 5: git status MUST be clean. Zero noise in git history. | ✓ |
| On a throwaway branch, then delete the branch | More auditable trail; branch hygiene overhead. | |
| Each mutation in tests/mutation/ fixtures | Re-implements src/; brittle to source drift. | |

**User's choice:** Sequential, no commits, verify clean tree

---

## Claude's Discretion

- **Plan-decomposition shape** — likely 4 plans (coverage tooling/CI; integration suite; audit-fix bundle; mutation experiment + VERIFICATION) but planner picks based on dependency graph and parallelism.
- **Mutation order within D-17** — alphabetical-by-guard or ROADMAP-listed order; both fine.
- **`tests/integration/_helpers.ts`** for the makeApp factory — extract only if it grows past ~10 lines per file.
- **Refactoring `provider!` at middleware.ts:113 (P4 IN-01)** — only if D-05 disallow-v8-ignore policy makes it block coverage.
- **Empty-string test naming, integration file fixture naming, WR-04 dedupe documentation** — planner judgment.
- **`coverage` vs `test:coverage` npm script naming** — D-07 leans `test:coverage` for namespacing consistency.

## Deferred Ideas

- lcov upload to Codecov / Coveralls (no CODECOV_TOKEN secret in CI; portfolio scope).
- Cross-provider integration file mounting all three on different routes (skip until a real cross-provider scenario surfaces).
- Shared tests/_fixtures/ helpers (defer; inline duplication is fine at this scale).
- Stryker mutation-test tooling (overkill for v1; revisit if manual experiment misses real defects).
- scripts/test-guard-removal.mjs (brittle to source drift).
- Refactoring `provider!` non-null at middleware.ts:113 (P4 IN-01) — conditional on D-05 outcome.
- (provider!.validate as Function) cast cleanup (P4 IN-02) — Phase 7+ style nit.
- req as any proliferation in stripe.test.ts (P4 IN-03) — Phase 7+ style nit.
- Express 4 vs 5 behavior fork in integration tests — trust the existing 3×2 CI matrix.
- DOCS-01/02/03 — Phase 7.
- DX-01/02/03 — v2.
- PROV-01/02/03 — v2.
- DIST-01 — v2.
