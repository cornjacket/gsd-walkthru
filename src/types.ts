// WebhookMetadata: discriminated union of per-provider webhook branches.
//
// Each branch is co-located in its provider module (D-10) — see
// src/providers/stripe.ts, github.ts, shopify.ts. This file ONLY
// re-exports the union; widening or adding fields belongs in the
// provider-side module so Phase 4/5 can extend a single branch
// without touching shared types.
//
// Global Express.Request augmentation (D-11) lives at the bottom of
// this file. Consumers get `req.webhook?: WebhookMetadata` and
// `req.rawBody?: Buffer` typed automatically once they import any
// value from `express-webhook-validator` — the public barrel
// (src/index.ts, Plan 07) re-exports from this module.
//
// D-12: `webhook?:` is OPTIONAL. Routes that don't mount the validation
// middleware see `undefined`; routes that do narrow via control-flow:
//   if (req.webhook?.provider === 'stripe') { req.webhook.replayWindowMs }
//
// RESEARCH anti-pattern: do NOT split the augmentation into a separate
// src/express.d.ts file — pure-ambient .d.ts files are not reliably
// auto-loaded across consumer environments. A module file with at
// least one export (this file qualifies) participates in the module
// graph and the augmentation lands transitively.
import type { GitHubWebhook } from './providers/github.js';
import type { ShopifyWebhook } from './providers/shopify.js';
import type { StripeWebhook } from './providers/stripe.js';

export type WebhookMetadata = StripeWebhook | GitHubWebhook | ShopifyWebhook;

declare global {
  namespace Express {
    interface Request {
      webhook?: WebhookMetadata;
      rawBody?: Buffer;
    }
  }
}
