# Phase 7: Documentation & Example App - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-02
**Phase:** 7-documentation-example-app
**Areas discussed:** README structure & status, Example app demo mechanism, Config reference format, Quickstart layout

---

## README structure

| Option | Description | Selected |
|--------|-------------|----------|
| Rebuild canonical, keep prose | Reorder to install → quickstarts → config → security up top; demote existing diagrams + provider notes to deeper sections; reuse strong prose. | ✓ |
| Graft onto current | Keep existing order; insert install/quickstarts/config without resequencing. | |

**User's choice:** Rebuild canonical, keep prose
**Notes:** Existing README has genuinely strong prose (provider notes, two data-flow diagrams, security reasoning) but is mis-shaped for a cold reviewer who wants install + quickstart above the fold.

## README status banner

| Option | Description | Selected |
|--------|-------------|----------|
| Replace with shippable v1.0 | Drop the in-dev/stubbed line; present as v1.0 with all three providers working; install as npm + honest note. | ✓ |
| Keep an honest pre-release note | Replace false "stubbed" text but keep a short "pre-1.0, not on npm" status line. | |
| Remove banner entirely | No status line at all. | |

**User's choice:** Replace with shippable v1.0
**Notes:** Current banner ("v0.0.1 … Phase 3 of 7 … validators stubbed") is false since Phases 4–6 shipped real validators.

## Example app demo mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| One-shot self-firing | `npm start` boots server, auto-fires 3 signed mock requests, prints each req.webhook, exits 0. | ✓ |
| Server + demo sender | Long-lived server + separate `npm run demo` sender. | |
| Server + manual curl | Long-lived server + documented curl commands with pre-signed payloads. | |

**User's choice:** One-shot self-firing
**Notes:** Clone-and-see-it-run in a single command best serves the "reviewer sees all three running locally" goal.

## Example app — library import

| Option | Description | Selected |
|--------|-------------|----------|
| By package name (local install) | Import `express-webhook-validator` via file:/workspace dependency; reads like a real consumer. | ✓ |
| Relative from src | Import from `../../src`; zero install/build, but less realistic. | |
| From built dist | Import compiled `dist`; needs a build first. | |

**User's choice:** By package name (local install)
**Notes:** Portfolio realism — the integration code should read exactly like a real consumer's.

## Example app — mock signing

| Option | Description | Selected |
|--------|-------------|----------|
| Independent Node crypto | Sender builds each provider's signing string and signs with Node crypto; independent check the validator agrees. | ✓ |
| Reuse lib's computeHmac | Sender imports the library's computeHmac; less code but circular. | |
| Static fixtures | Commit pre-computed signature/payload pairs. | |

**User's choice:** Independent Node crypto
**Notes:** Independent signing makes the demo a real check (a shared HMAC bug would not silently pass) and illustrates the sender side.

## Config reference format

| Option | Description | Selected |
|--------|-------------|----------|
| Options table | Scannable table per export: option / type / default / description. | ✓ |
| Table + TS interface | Table plus the annotated TypeScript interface block. | |
| Annotated TS interface only | Just the commented interface(s). | |

**User's choice:** Options table
**Notes:** Standard OSS-README convention; easiest to skim.

## Quickstart layout

| Option | Description | Selected |
|--------|-------------|----------|
| Three self-contained blocks | One complete copy-pasteable block per provider; some repetition. | ✓ |
| Shared scaffold + deltas | One base block + per-provider diffs; DRY but reader assembles. | |

**User's choice:** Three self-contained blocks
**Notes:** Copy-paste-ability for the one provider a reviewer cares about beats DRY.

## Install line

| Option | Description | Selected |
|--------|-------------|----------|
| npm command + honest note | Headline `npm install express-webhook-validator` + one-line "not yet published" note. | ✓ |
| GitHub install | Working `npm install github:<owner>/<repo>`; needs repo slug (repository field empty). | |
| Clone + npm link | Local clone + npm link / file: dependency workflow. | |

**User's choice:** npm command + honest note
**Notes:** package.json is `express-webhook-validator@0.0.1`, not on npm, no repository field. The note keeps it honest while the headline reads as shippable.

## Claude's Discretion

- **Version bump (flagged, not decided):** `package.json` is `0.0.1` while the README presents v1.0. Planner decides whether to bump to `1.0.0` or keep the framing decoupled.
- Exact prose, diagram placement, config-table wording, and `examples/` file/script layout left to planning/implementation.

## Deferred Ideas

- **npm publishing** — out of scope (PROJECT.md); acknowledged in the install note as a future step, not done this phase.
- **Built-in delivery-ID dedup store** — out of scope (stateful, consumer's responsibility); documented as guidance in security notes, not built.
