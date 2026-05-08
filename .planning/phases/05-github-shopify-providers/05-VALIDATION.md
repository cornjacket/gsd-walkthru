---
phase: 5
slug: github-shopify-providers
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-08
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | vitest.config.ts (from Phase 1, no changes needed) |
| **Quick run command** | `npm test -- src/providers/github.test.ts src/providers/shopify.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~4 seconds |

---

## Sampling Rate

- **After every task commit:** Run the relevant per-provider test file (`npm test -- src/providers/github.test.ts` or `src/providers/shopify.test.ts`)
- **After every plan wave:** Run `npm test` (full suite, regression check across all 11 existing test files + 2 new)
- **Before `/gsd-verify-work`:** Full suite must be green; no `console.*` calls in `src/`; TypeScript strict mode clean; no new entries in `src/errors.ts` reason union
- **Max feedback latency:** ~4 seconds

---

## Per-Task Verification Map

> Filled by gsd-planner during PLAN.md creation. Each plan task should map to a row here with: Task ID, Plan, Wave, Requirement (GHUB-01..03 / SHOP-01..02), Threat Ref (from PLAN <threat_model>), Secure Behavior, Test Type, Automated Command, File Exists status, and ⬜ pending Status.

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> Filled by gsd-planner during PLAN.md creation. Phase 5 expects two NEW test files (`src/providers/github.test.ts`, `src/providers/shopify.test.ts`) co-located with their providers. Per the established co-located test pattern (Phase 1 D-04, Phase 4 D-11) and ROADMAP SC5 ("unit tests ship in the same commits as the code"), the test files are created alongside the implementation in their respective plans — not as separate Wave 0 scaffolding tasks.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify commands
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 4s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
