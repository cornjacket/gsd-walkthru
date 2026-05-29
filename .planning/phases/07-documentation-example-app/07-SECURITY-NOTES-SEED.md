# Phase 7 — Security Notes Seed

Captured 2026-05-29. A note to fold into the DOCS-02 security-notes section
(ROADMAP Phase 7 SC2) when Phase 7 is discussed/planned. Not a requirement
change — an honesty addition the README's security section must cover.

## Test-oracle limitation: what the test suite does and does NOT prove

The Phase 6 integration suite (Supertest + a hand-rolled `node:crypto`
`makeSignature` per provider, decision 06 D-11) proves two things:

1. **Express wiring is correct** — raw-body capture, middleware ordering,
   `next(err)` → HTTP 401, both body-parser modes. Express itself is the
   oracle here, so this is genuinely validated.
2. **Internal consistency / regression safety** — once the signing scheme is
   confirmed correct, the suite pins that behavior against future refactors.

It does **NOT** prove **spec conformance against the real providers.** The
test's signature generator and the library's validator were written by the
same author from the same reading of the provider docs. Their errors are
therefore **correlated** (shared-oracle / common-mode failure): if the docs
were misread — wrong header, wrong signing-input string, hex vs base64 — the
test signs wrong *and* the validator verifies wrong in lockstep, and the test
passes green. Implementation independence (two different functions) does not
fix this; only an *independent source of truth* does.

The ROADMAP labels SC1 "Supertest end-to-end," but it is end-to-end across the
**library's** stack (HTTP in → validated/rejected out), not across the
distributed system including the providers' real servers.

## What the security notes should say to the reader

- State plainly that signature verification is only as correct as the
  implementation's reading of each provider's spec, and that the automated
  test suite cannot catch a shared misreading.
- Recommend the consumer validate against a real source at least once:
  - **Stripe** — Stripe CLI (`stripe trigger`, `stripe listen --forward-to`),
    or `stripe.webhooks.generateTestHeaderString()` from `stripe-node` as an
    independent signing oracle in their own tests.
  - **GitHub** — "Redeliver" a real webhook from repo settings and capture the
    payload + signature as a fixture.
  - **Shopify** — a sandbox-store test notification captured as a fixture.
- Note that the strongest validation is a **captured real request** replayed as
  a fixture (ground truth off the provider's own wire).

## Optional follow-up (out of scope for the note itself)

If desired, a future hardening pass could add one independent-oracle fixture
per provider to the test suite (captured real request, or Stripe's
`generateTestHeaderString`). This was considered for Phase 6 and deliberately
left out; Phase 6 ships the hand-rolled signer only. Tracking here so the gap
is visible, not silent.
