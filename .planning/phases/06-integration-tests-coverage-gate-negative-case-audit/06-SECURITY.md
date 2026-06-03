---
phase: 6
slug: integration-tests-coverage-gate-negative-case-audit
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-02
---

# Phase 6 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| CI → coverage report | Coverage thresholds enforce a pass/fail gate; threshold values in `vitest.config.ts` are the single source of truth | Pass/fail signal |
| Supertest HTTP client → Express app | Untrusted headers and body sent by test; provider must validate signature before trusting | Webhook payload + signature header |
| Integration test → `src/providers/` | Test exercises the real implementation through the full middleware stack — no crypto mocking | Raw body bytes, HMAC digest |
| Middleware factory → Stripe provider | `toleranceSeconds` flows from middleware options through the provider validate call; one source of the 300s default | Replay-tolerance config |
| Express header parsing → Stripe header guard | HTTP headers can arrive as `string[]` for duplicate headers; three-way split maps array case to `invalid_signature_format` | Signature header (string or string[]) |
| Mutation experiment → git history | Mutations are immediately reverted; only the VERIFICATION.md evidence table enters git | Source mutations (transient) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-06-01-01 | Tampering | `vitest.config.ts` coverage gate | mitigate | `perFile: true` threshold (all four metrics at 90) — no low-coverage file averaged away · `vitest.config.ts:11` | closed |
| T-06-01-02 | Repudiation | `v8 ignore` escape hatch | mitigate | Zero `v8 ignore` directives in `src/` (`grep -rn "v8 ignore" src/` → no matches) | closed |
| T-06-01-03 | Elevation of Privilege | Coverage step on all 6 CI cells | accept | By design (D-04): coverage runs on Node 22 × Express 5.x only; V8 coverage is Node-version-agnostic for this codebase | closed |
| T-06-01-04 | Denial of Service | Gate tripping on legitimate code | accept | 90% gate set with headroom; if it trips, fix is a real test (D-05), not an ignore comment | closed |
| T-06-02-01 | Tampering | Integration test fixtures | mitigate | Integration tests use `createHmac` directly (not the lib's `computeHmac`) — non-tautological; tampered-body tests fire the guard · `tests/integration/{stripe,github,shopify}.test.ts:57/57/59` | closed |
| T-06-02-02 | Information Disclosure | Test secrets in output | accept | Secrets prefixed `_integration_test_`; never logged by the library; runner does not emit on pass | closed |
| T-06-02-03 | Spoofing | Shopify hex-vs-base64 bypass | mitigate | Shopify integration test sends hex-encoded digest, asserts 401 + `signature_mismatch` · `tests/integration/shopify.test.ts:74-87` | closed |
| T-06-02-04 | Elevation of Privilege | Mode collapse (one body-parser mode) | mitigate | Two `describe()` groups per provider; both `rawBodyCapture` and `captureRawBody` exercised in each integration file | closed |
| T-06-03-01 | Spoofing | Stripe-Signature array bypass (WR-03) | mitigate | Two-guard split — `string[]` throws `invalid_signature_format` not `missing_header`; test asserts `.not.toBe('missing_header')` · `src/providers/stripe.ts:91-103`, `stripe.test.ts:149-165` | closed |
| T-06-03-02 | Tampering | NaN-tolerance silent replay (WR-01) | mitigate | Factory-time loud-fail via `Number.isFinite` guard ("Webhook tolerance must be a non-negative finite number") · `src/middleware.ts:87-100` | closed |
| T-06-03-03 | Tampering | Non-numeric `t=` coercion (WR-05) | mitigate | Regex gate `/^-?\d+$/` before `parseInt` — `t=1700000000xyz` throws `invalid_signature_format` · `src/providers/stripe.ts:54` | closed |
| T-06-03-04 | Information Disclosure | Vacuous body-leakage assertions (WR-02) | mitigate | Leakage assertions check actual tampered bytes; defense-in-depth assertions added · `github.test.ts:267`, `shopify.test.ts:300` | closed |
| T-06-03-05 | Tampering | Default-tolerance duplication (WR-04) | mitigate | `toleranceSeconds?: number` with no `= 300` default in stripe.ts; middleware `options.tolerance ?? 300` is sole source · `src/providers/stripe.ts:79`, `src/middleware.ts:107` | closed |
| T-06-04-01 | Repudiation | Mutation leaves source modified | mitigate | Each mutation reverted with `git checkout`; final `git status` clean (hard acceptance criterion) · `06-VERIFICATION.md` | closed |
| T-06-04-02 | Tampering | Mutation fails unit not integration | mitigate | All 5 mutations now fail an integration test; row 3 (missing-header) closed post-experiment via `tests/integration/stripe.test.ts:80` `res.body.reason === 'missing_header'` (WR-01) · `06-VERIFICATION.md` Guard Removal table | closed |
| T-06-04-03 | Denial of Service | `npm test` runtime during mutations | accept | ~50s total for 5 mutations; acceptable for one-shot verification | closed |
| T-06-04-04 | Repudiation | VERIFICATION.md evidence gaps | mitigate | All 5 table rows carry actual failing test names (zero placeholders) | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-06-01 | T-06-01-03 | Coverage runs on Node 22 × Express 5.x cell only by design (D-04); V8 coverage is Node-version-agnostic here, so the other 5 matrix cells stay test-only with no coverage overhead | David Taylor | 2026-06-02 |
| AR-06-02 | T-06-01-04 | 90% gate has headroom over Phases 2–5 co-located test coverage; a tripped gate is fixed with a real test (D-05), never an ignore comment | David Taylor | 2026-06-02 |
| AR-06-03 | T-06-02-02 | Test secrets prefixed `_integration_test_`, never logged by the library (D-16), not emitted by the runner on pass | David Taylor | 2026-06-02 |
| AR-06-04 | T-06-04-03 | Each `npm test` mutation run is ~5–10s; 5 mutations ≈ 50s total, acceptable for a one-shot verification pass | David Taylor | 2026-06-02 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-02 | 17 | 17 | 0 | gsd-security-auditor (verify) + David Taylor |

### Audit notes

- Auditor first pass: 16/17 closed, 1 open (T-06-04-02) — `06-VERIFICATION.md` row 3 recorded the missing-header mutation at `unit (integration gap noted)` tier, stale relative to the code which had already closed the gap (WR-01 reason assertion at `tests/integration/stripe.test.ts:80`).
- Resolution: updated `06-VERIFICATION.md` row 3 Tier to `integration (gap closed post-experiment)` and appended a closure note to the Mutation 3 Gap Assessment, preserving the historical finding. Documentation-only — no source change. T-06-04-02 closed.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-02
