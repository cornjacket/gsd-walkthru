# Phase 7: Documentation & Example App - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the library *look and feel shippable* to a portfolio reviewer. Two deliverables:

1. **README** reshaped to the standard OSS onboarding shape — installation, per-provider quickstarts (Stripe/GitHub/Shopify), a complete configuration reference, and a security-notes section (DOCS-01, DOCS-02).
2. A **runnable example Express app** under `examples/` that boots locally, accepts mock signed payloads for all three providers, and prints the validated `req.webhook` to stdout (DOCS-03).

Goal (ROADMAP): *"A portfolio reviewer landing on the GitHub README believes this library is shippable within thirty seconds and can clone the example app to see all three providers running locally."*

**In scope:** README rewrite/restructure; runnable example app. **Not in scope:** new library capabilities, npm publishing, additional providers — these stay out per PROJECT.md boundaries.

</domain>

<decisions>
## Implementation Decisions

### README structure & status
- **D-01:** Rebuild the README into the canonical OSS shape — order is **installation → per-provider quickstarts → configuration reference → security notes** up top. The existing strong prose (two data-flow diagrams, the "Provider notes" section, the "Webhooks, briefly" explainer) is **preserved but demoted** to deeper "how it works" sections below the fold. Resequence, don't discard.
- **D-02:** Replace the current stale status banner (`v0.0.1 … Phase 3 of 7 … validators stubbed` — false since Phases 4–6 shipped real validators) with a **shippable-v1.0 framing**. Present all three providers as working.

### Per-provider quickstarts
- **D-03:** **Three self-contained, copy-pasteable blocks** — one complete block per provider (Stripe, GitHub, Shopify). Accept the repetition; a reviewer should be able to grab exactly the provider they need without assembling pieces.

### Installation line
- **D-04:** Headline `npm install express-webhook-validator` (matches the package name, reads as shippable) followed by a **one-line honest note** that the package is not yet published to npm and an npm release is a future step. Do not show a command that silently 404s without the caveat.

### Configuration reference
- **D-05:** Present the config surface as an **options table per export** (columns: option / type / default / description). Covers `createWebhookMiddleware(provider, { secret, tolerance? })`, `rawBodyCapture()`, the `captureRawBody` verify-callback helper, and `webhookErrorHandler()`. Scannable over prose.

### Security notes (locked project value)
- **D-06:** The security-notes section MUST explicitly cover the three pillars: **raw-body handling** (capture before `express.json()`), **constant-time comparison**, and the **per-provider replay-protection landscape** — Stripe's signed-timestamp window (on by default) vs. GitHub/Shopify having no signed timestamp, where replay defense requires consumer-side delivery-ID dedup (documented honestly, not bundled). This "documented honesty about where it doesn't protect" is a locked PROJECT.md Key Decision, not a discussion choice.

### Example app — demo flow
- **D-07:** **One-shot, self-firing demo.** `npm start` boots the Express server, auto-fires three correctly-signed mock requests (one per provider), prints each validated `req.webhook` to stdout, and exits 0. Clone-and-see-it-run in a single command — no manual curl, no second terminal.
- **D-08:** The example app **consumes the library by package name** (`express-webhook-validator`) via a local `file:`/workspace dependency, so the integration code reads exactly like a real consumer's — not a relative `../../src` import and not from `dist`.
- **D-09:** The **mock sender signs with independent Node `crypto`** — it builds each provider's signing string itself (Stripe's `t.body`, raw body for GitHub, base64 digest for Shopify) and signs independently, rather than importing the library's own `computeHmac`. This makes the demo an independent check that the validator agrees, and illustrates the real sender side. (Avoids the circularity where a shared HMAC bug would still "pass.")

### Claude's Discretion
- **Version bump (flagged, not decided):** `package.json` is currently `0.0.1` while the README will present as v1.0. The planner should decide whether to bump `package.json` to `1.0.0` for consistency, or keep the README framing decoupled from the published version. Either is acceptable; surface it explicitly in the plan.
- Exact prose, diagram placement, table column wording, and file/script layout within `examples/` are left to planning/implementation, provided the decisions above hold.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` — Phase 7 goal + the three success criteria (README install/quickstarts/config; security notes; runnable example app).
- `.planning/REQUIREMENTS.md` — DOCS-01 (install + per-provider quickstarts + config reference), DOCS-02 (security notes: raw-body, timing attacks, per-provider replay caveats), DOCS-03 (runnable example app with mock signed payloads).
- `.planning/PROJECT.md` — Core value, "documented honesty" replay-protection stance, Out-of-Scope boundaries (no npm publish, no new providers, no dedup store), and the Key Decisions table.

### Existing assets to reshape / build on
- `README.md` — current README (206 lines). Strong reusable prose to preserve-and-demote: "Webhooks, briefly", "Provider notes" (Stripe/GitHub/Shopify mechanics), "System-level data flow" + "Internal data flow" diagrams, "Quick example". Carries the stale banner to replace (D-02) and lacks the install/quickstart/config/security top sections (D-01).
- `examples/example-app/` — currently only `.gitkeep`; the example app is greenfield (D-07..D-09).
- `src/index.ts` — public barrel; the authoritative list of exports the config reference (D-05) and quickstarts (D-03) must match. Verify option names/defaults against the real signatures (e.g. Stripe `tolerance` default 300s).
- `package.json` — `name: express-webhook-validator`, `version: 0.0.1`, no `repository` field, dual CJS/ESM `exports`. Relevant to the install line (D-04) and the version-bump flag.

### NOT a canonical ref for this phase (disambiguation)
- `SECURITY.md` — this is a **Phase-6 audit artifact** (gsd-secure-phase output: threat verification, open threats, accepted risks). It is **not** the README's user-facing security-notes section (D-06) and should not be confused with it or copied verbatim.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Existing README prose** — the provider-mechanics notes and the two ASCII data-flow diagrams are accurate and high quality; reuse as deeper sections rather than rewriting.
- **Public exports in `src/index.ts`** — `createWebhookMiddleware`, `rawBodyCapture`, `captureRawBody`, `webhookErrorHandler`, `computeHmac`, `timingSafeCompare`, `WebhookValidationError`, `WebhookValidationReason`. Quickstarts and config table draw directly from these.
- **Provider header/encoding facts** (already documented and test-verified in Phases 4–5): Stripe `Stripe-Signature: t=,v1=` over `t.body` (hex, 300s default tolerance, multi-`v1=` rotation); GitHub `X-Hub-Signature-256: sha256=<hex>` over raw body (`deliveryId` from `X-GitHub-Delivery`); Shopify `X-Shopify-Hmac-Sha256: <base64>` over raw body (`topic` + `webhookId`). The example sender (D-09) must reproduce these signing rules exactly.

### Established Patterns
- **Library never writes to `res` and never logs** — example app must supply its own handler/`console.log` to print `req.webhook`, and (optionally) mount `webhookErrorHandler()` for the failure path.
- **Discriminated `req.webhook` union narrows on `req.webhook.provider`** — quickstarts and the example handler should show the `if (req.webhook?.provider === 'stripe')` narrowing idiom.
- **Both body-parser mount modes supported** — `rawBodyCapture()` standalone or `express.json({ verify: captureRawBody })`. Quickstarts should pick one canonical mount per provider for clarity.

### Integration Points
- Example app → library via local `file:`/workspace dependency (D-08); needs the package build (`dist`) available, or a workspace link, before the demo runs.
- README config table and quickstarts → must stay in sync with `src/index.ts` signatures and the Phase 4–5 provider behavior.

</code_context>

<specifics>
## Specific Ideas

- Reviewer experience is the north star: "shippable within thirty seconds" — install + one quickstart visible above the fold; "clone the example app to see all three providers running locally" — one `npm start` does it all.
- Keep the demonstrated replay-protection story honest and explicit per provider (Stripe protected by default; GitHub/Shopify need consumer dedup).

</specifics>

<deferred>
## Deferred Ideas

- **npm publishing** — explicitly out of scope per PROJECT.md; the install note (D-04) acknowledges it as a future step but this phase does not publish.
- **Built-in delivery-ID dedup store** — out of scope (stateful, belongs in the consumer's app); documented as guidance in the security notes, not built.

*Otherwise: None — discussion stayed within phase scope.*

</deferred>

---

*Phase: 7-documentation-example-app*
*Context gathered: 2026-06-02*
