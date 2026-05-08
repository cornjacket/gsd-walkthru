# Daily plan — 2026-05-08

Run Phase 5 (GitHub & Shopify Providers) end-to-end in one sitting, mirroring
the Phase 4 arc: `/gsd-discuss-phase 5` → `/gsd-plan-phase 5` →
`/gsd-execute-phase 5`. Phase 5 lifts two providers onto the Phase 3/4 surface
— GitHub HMAC-SHA256 with `X-GitHub-Delivery` exposure and Shopify
base64-encoded HMAC with `X-Shopify-Topic` / `X-Shopify-Webhook-Id` exposure
— so the discuss step is where the SHA-1 rejection contract and the
hex-vs-base64 gotcha need to lock down before plans get drafted. Five 04-REVIEW
advisories ride into Phase 5 context (no blockers).

```
   Phase 4 ✓                                          Phase 5 closed
   pushed                                             (verifier green)
       │                                                    │
       ▼                                                    ▼
   ┌─────────┐    ┌────────────┐    ┌──────────┐    ┌─────────────┐
   │ discuss │ →  │   plan     │ →  │ execute  │ →  │  verify +   │
   │ phase 5 │    │  phase 5   │    │ phase 5  │    │  ROADMAP    │
   │ (GHUB+  │    │  (waves    │    │ (worktree│    │  Phase 5 [x]│
   │  SHOP)  │    │   drafted) │    │  agents) │    │  + STATE    │
   └─────────┘    └────────────┘    └──────────┘    └─────────────┘
      AM             AM-mid            midday              PM
```

Notes:
- **Discuss locks the gotchas**: SHA-1 deprecated-header explicit reject
  (GHUB-01) + Shopify base64 vs hex (SHOP-01) are the two failure modes the
  test suite has to pin down — surface them in discuss before they leak into
  plan revisions.
- **Metadata pass-through**: Phase 5 introduces per-provider metadata
  (`deliveryId`, `topic`, `webhookId`) on the discriminated `req.webhook`
  union — confirm against the Phase 3 D-11 contract during discuss.
- **04-REVIEW carry-over**: 5 advisory warnings tracked in
  `.planning/phases/04-stripe-provider/04-REVIEW.md`; fold any that touch
  Phase 5 surfaces (provider plumbing, error union) into Phase 5 context, defer
  the rest.
- **EOD signoff**: if Phase 5 closes cleanly, write Saturday's plan or skip to
  Monday — `daily-plan.md` aggregator tolerates the weekend.
