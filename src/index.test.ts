import { describe, expect, it } from 'vitest';
import {
  captureRawBody,
  computeHmac,
  createWebhookMiddleware,
  type GitHubWebhook,
  type RawBodyOptions,
  rawBodyCapture,
  type ShopifyWebhook,
  type StripeWebhook,
  timingSafeCompare,
  VERSION,
  type WebhookMetadata,
  WebhookValidationError,
  type WebhookValidationReason,
  webhookErrorHandler,
} from './index.js';
import { getProvider } from './providers/registry.js';

describe('express-webhook-validator', () => {
  // ─── Phase 2 smokes (preserved verbatim) ───────────────────────────────

  it('exports a VERSION string', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION.length).toBeGreaterThan(0);
  });

  it('re-exports computeHmac (callable from the public barrel)', () => {
    const digest = computeHmac('x', 'k', 'sha256');
    expect(Buffer.isBuffer(digest)).toBe(true);
  });

  it('re-exports timingSafeCompare (callable from the public barrel)', () => {
    const a = Buffer.from([1, 2, 3]);
    const b = Buffer.from([1, 2, 3]);
    expect(timingSafeCompare(a, b)).toBe(true);
  });

  it('re-exports WebhookValidationError (constructable from the public barrel)', () => {
    const err = new WebhookValidationError({
      reason: 'signature_mismatch',
      provider: 'stripe',
      statusCode: 401,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(WebhookValidationError);
    expect(err.reason).toBe('signature_mismatch');
  });

  it('re-exports the WebhookValidationReason type (compile-time check)', () => {
    const reason: WebhookValidationReason = 'signature_mismatch';
    expect(reason).toBe('signature_mismatch');
  });

  it("includes 'invalid_signature_format' in re-exported WebhookValidationReason type (Phase 4 D-14)", () => {
    // Compile-time check: if the new reason is NOT in the union, TypeScript
    // will error on this assignment. Runtime check confirms the value passes through.
    const reason: WebhookValidationReason = 'invalid_signature_format';
    expect(reason).toBe('invalid_signature_format');
  });

  // ─── Phase 3 smokes ────────────────────────────────────────────────────

  it('re-exports createWebhookMiddleware (callable from the public barrel)', () => {
    expect(typeof createWebhookMiddleware).toBe('function');
    // Side-effect imports populated the registry — 'not-registered' is the
    // documented unknown-provider failure path (D-02).
    expect(() => createWebhookMiddleware('not-registered', { secret: 'x' })).toThrow(
      /unknown webhook provider/i
    );
  });

  it('re-exports webhookErrorHandler (callable from the public barrel; .length === 4)', () => {
    const handler = webhookErrorHandler();
    expect(typeof handler).toBe('function');
    expect(handler.length).toBe(4);
  });

  it('re-exports rawBodyCapture (callable from the public barrel; .length === 3)', () => {
    const mw = rawBodyCapture();
    expect(typeof mw).toBe('function');
    expect(mw.length).toBe(3);
  });

  it('re-exports the RawBodyOptions type (compile-time check)', () => {
    const opts: RawBodyOptions = { limit: '1mb' };
    expect(opts.limit).toBe('1mb');
  });

  it('re-exports captureRawBody (callable from the public barrel; .length === 4)', () => {
    expect(typeof captureRawBody).toBe('function');
    expect(captureRawBody.length).toBe(4);
  });

  it('re-exports StripeWebhook (compile-time check)', () => {
    const meta: StripeWebhook = {
      provider: 'stripe',
      eventId: 'evt_x',
      timestamp: 0,
      parsed: {},
      replayWindowMs: 0,
    };
    expect(meta.provider).toBe('stripe');
    expect(meta.replayWindowMs).toBe(0);
  });

  it('re-exports GitHubWebhook (compile-time check)', () => {
    const meta: GitHubWebhook = {
      provider: 'github',
      eventId: 'evt_x',
      timestamp: 0,
      parsed: {},
      deliveryId: 'd_x',
    };
    expect(meta.provider).toBe('github');
    expect(meta.deliveryId).toBe('d_x');
  });

  it('re-exports ShopifyWebhook (compile-time check)', () => {
    const meta: ShopifyWebhook = {
      provider: 'shopify',
      eventId: 'evt_x',
      timestamp: 0,
      parsed: {},
      topic: 'orders/create',
      webhookId: 'w_x',
    };
    expect(meta.provider).toBe('shopify');
    expect(meta.topic).toBe('orders/create');
    expect(meta.webhookId).toBe('w_x');
  });

  it('re-exports WebhookMetadata as a discriminated union (compile-time check)', () => {
    const meta: WebhookMetadata = {
      provider: 'stripe',
      eventId: 'evt_x',
      timestamp: 0,
      parsed: {},
      replayWindowMs: 0,
    };
    expect(meta.provider).toBe('stripe');
  });

  // ─── Side-effect registration smoke (D-03) ─────────────────────────────

  it('side-effect imports register all three providers transparently (D-03)', () => {
    // Importing './index.js' ran the side-effect imports at module
    // evaluation time. Each provider stub's top-level body called
    // registerProvider(<name>, ...). Use the registry's getProvider
    // (NOT exported from the barrel — internal plumbing) to verify.
    expect(getProvider('stripe')).toBeDefined();
    expect(getProvider('stripe')?.name).toBe('stripe');
    expect(getProvider('github')).toBeDefined();
    expect(getProvider('github')?.name).toBe('github');
    expect(getProvider('shopify')).toBeDefined();
    expect(getProvider('shopify')?.name).toBe('shopify');
  });
});
