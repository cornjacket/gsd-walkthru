import { describe, expect, expectTypeOf, it } from 'vitest';
import type { WebhookMetadata } from './types.js';

// SC3 (Phase 3 ROADMAP): "In a TypeScript consumer project, req.webhook
// narrows to a per-provider discriminated union — accessing a Shopify-only
// field on a Stripe branch is a compile-time error."
//
// This file proves SC3 structurally. The runtime assertions are largely
// vacuous; the BINDING signal is `npx tsc --noEmit -p tsconfig.test.json`
// exiting 0 — which means every `// @ts-expect-error` directive caught a
// real TypeScript error. If a directive becomes unused (e.g., the union
// weakens and access becomes legal), tsc emits TS2578 and CI fails.
//
// Pitfall 1: this file is ONLY meaningful when run under tsconfig.test.json
// (Plan 01). The base tsconfig.json excludes `**/*.test.ts` from `tsc --noEmit`,
// which would silently skip the directives. tsconfig.test.json removes the
// exclude. The `npm run typecheck` script (Plan 01) targets the test config.

describe('WebhookMetadata discriminated union (SC3)', () => {
  it('narrows to StripeWebhook when provider === "stripe"', () => {
    const meta = {} as WebhookMetadata;
    if (meta.provider === 'stripe') {
      expectTypeOf(meta.replayWindowMs).toEqualTypeOf<number>();
      expectTypeOf(meta.eventId).toEqualTypeOf<string>();
      expectTypeOf(meta.timestamp).toEqualTypeOf<number>();
    }
    // Runtime assertion to keep vitest happy (this branch is unreachable at runtime).
    expect(true).toBe(true);
  });

  it('narrows to GitHubWebhook when provider === "github"', () => {
    const meta = {} as WebhookMetadata;
    if (meta.provider === 'github') {
      expectTypeOf(meta.deliveryId).toEqualTypeOf<string>();
      expectTypeOf(meta.eventId).toEqualTypeOf<string>();
    }
    expect(true).toBe(true);
  });

  it('narrows to ShopifyWebhook when provider === "shopify"', () => {
    const meta = {} as WebhookMetadata;
    if (meta.provider === 'shopify') {
      expectTypeOf(meta.topic).toEqualTypeOf<string>();
      expectTypeOf(meta.webhookId).toEqualTypeOf<string>();
    }
    expect(true).toBe(true);
  });

  it('forbids accessing Shopify-only fields on a Stripe-narrowed branch (SC3 binding)', () => {
    const meta = {} as WebhookMetadata;
    if (meta.provider === 'stripe') {
      // @ts-expect-error — `topic` is a Shopify-only field; not on StripeWebhook.
      const _topic = meta.topic;
      // @ts-expect-error — `webhookId` is a Shopify-only field; not on StripeWebhook.
      const _webhookId = meta.webhookId;
      // Reference the locals so Biome/tsc don't flag them as truly unused.
      void _topic;
      void _webhookId;
    }
    expect(true).toBe(true);
  });

  it('forbids accessing GitHub-only fields on a Stripe-narrowed branch (SC3 binding)', () => {
    const meta = {} as WebhookMetadata;
    if (meta.provider === 'stripe') {
      // @ts-expect-error — `deliveryId` is a GitHub-only field; not on StripeWebhook.
      const _deliveryId = meta.deliveryId;
      void _deliveryId;
    }
    expect(true).toBe(true);
  });

  it('forbids accessing Stripe-only fields on a GitHub-narrowed branch (SC3 binding)', () => {
    const meta = {} as WebhookMetadata;
    if (meta.provider === 'github') {
      // @ts-expect-error — `replayWindowMs` is a Stripe-only field; not on GitHubWebhook.
      const _replayWindowMs = meta.replayWindowMs;
      void _replayWindowMs;
    }
    expect(true).toBe(true);
  });
});
