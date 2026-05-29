import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { WebhookValidationError } from '../errors.js';
import { shopifyProvider } from './shopify.js';

// Sample sensitive material for leakage assertions
const SAMPLE_SECRET = 'whsec_shopify_test_secret_do_not_leak';
const SAMPLE_BODY = '{"order_id":12345,"customer":{"email":"buyer@example.com"}}';
const SAMPLE_TOPIC = 'orders/create';
const SAMPLE_WEBHOOK_ID = 'b54557e4-7f0e-4f2c-9b0e-1a2b3c4d5e6f';

/**
 * Build a correct X-Shopify-Hmac-Sha256 header value (BARE base64 digest, no prefix).
 * Mirrors the EXACT HMAC input shopifyProvider.validate() computes:
 * the rawBody Buffer DIRECTLY (no .toString('utf8') — D-07).
 *
 * NOTE: tests use node:crypto's createHmac directly (NOT the library's
 * computeHmac) so the test is not tautological with the implementation.
 */
function makeSignature(body: string | Buffer, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64');
}

/**
 * Build a minimal Express Request fixture for testing.
 * - When `opts.signature` is undefined, the 'x-shopify-hmac-sha256' header is omitted.
 * - When `opts.topic` is undefined, the 'x-shopify-topic' header is omitted.
 * - When `opts.webhookId` is undefined, the 'x-shopify-webhook-id' header is omitted.
 */
function makeReq(opts: {
  body?: string;
  rawBody?: Buffer | undefined;
  signature?: string | string[] | undefined;
  topic?: string | string[] | undefined;
  webhookId?: string | string[] | undefined;
}): unknown {
  const body = opts.body ?? SAMPLE_BODY;
  const headers: Record<string, string | string[]> = {};
  if (opts.signature !== undefined) headers['x-shopify-hmac-sha256'] = opts.signature;
  if (opts.topic !== undefined) headers['x-shopify-topic'] = opts.topic;
  if (opts.webhookId !== undefined) headers['x-shopify-webhook-id'] = opts.webhookId;
  return {
    rawBody: opts.rawBody !== undefined ? opts.rawBody : Buffer.from(body),
    headers,
  };
}

describe('shopifyProvider.validate()', () => {
  // ── SC3, SC4, SC5 happy-path + D-11/D-12 binding ─────────────────────────

  it('happy path: valid base64 signature and matching rawBody returns ShopifyWebhook with eventId === webhookId', () => {
    const sig = makeSignature(SAMPLE_BODY, SAMPLE_SECRET);
    const req = makeReq({ signature: sig, topic: SAMPLE_TOPIC, webhookId: SAMPLE_WEBHOOK_ID });
    const before = Math.floor(Date.now() / 1000);
    const result = shopifyProvider.validate(req as any, SAMPLE_SECRET);
    const after = Math.floor(Date.now() / 1000);
    expect(result.provider).toBe('shopify');
    expect(result.eventId).toBe(SAMPLE_WEBHOOK_ID);                 // D-11
    expect((result as any).webhookId).toBe(SAMPLE_WEBHOOK_ID);       // SHOP-02 / SC4
    expect((result as any).topic).toBe(SAMPLE_TOPIC);                // SHOP-02 / SC4
    expect(result.parsed).toMatchObject({ order_id: 12345 });
    expect(result.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.timestamp).toBeLessThanOrEqual(after);
  });

  // ── SC3 negative: tampered body ──────────────────────────────────────────

  it('tampered body throws signature_mismatch', () => {
    const sig = makeSignature(SAMPLE_BODY, SAMPLE_SECRET);
    const tampered = Buffer.from(SAMPLE_BODY.replace('12345', 'XXXXX'));
    const req = makeReq({
      rawBody: tampered,
      signature: sig,
      topic: SAMPLE_TOPIC,
      webhookId: SAMPLE_WEBHOOK_ID,
    });
    expect(() => shopifyProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      shopifyProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('signature_mismatch');
      expect((err as WebhookValidationError).statusCode).toBe(401);
    }
  });

  // ── SC3 / D-05 / SHOP-01 critical case: hex-as-base64 ────────────────────

  it('hex-encoded digest in X-Shopify-Hmac-Sha256 header throws signature_mismatch (D-05, NOT invalid_encoding)', () => {
    // The digest IS the correct HMAC of the body, but encoded as hex (64 chars)
    // instead of base64 (44 chars). Buffer.from(_, 'base64') decodes the 64-char
    // hex string with the base64 alphabet, producing ~48 bytes (vs the 32-byte
    // computed digest). timingSafeCompare returns false on length mismatch
    // (P2 D-09) → throws 'signature_mismatch'. Phase 5 D-05 EXPLICITLY rejects
    // widening the union with 'invalid_encoding'.
    const hexDigest = createHmac('sha256', SAMPLE_SECRET)
      .update(Buffer.from(SAMPLE_BODY))
      .digest('hex'); // 64 hex chars
    const req = makeReq({
      signature: hexDigest, // sent as base64 header — wrong encoding
      topic: SAMPLE_TOPIC,
      webhookId: SAMPLE_WEBHOOK_ID,
    });
    expect(() => shopifyProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      shopifyProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('signature_mismatch');
      // D-05 explicit-rejection guard: ensure we never silently re-classify this
      // as a hypothetical 'invalid_encoding' reason. If a future maintainer
      // widens the union, this test will catch it.
      expect((err as WebhookValidationError).reason).not.toBe('invalid_encoding' as any);
      expect((err as WebhookValidationError).statusCode).toBe(401);
      // D-16: defense-in-depth — the hex string sent should not appear in the error
      const json = JSON.stringify(err);
      expect(json).not.toContain(hexDigest);
    }
  });

  // ── D-10: Auth header three-way split (corrected from day one) ───────────

  it('missing X-Shopify-Hmac-Sha256 throws missing_header (D-10)', () => {
    const req = makeReq({
      signature: undefined,
      topic: SAMPLE_TOPIC,
      webhookId: SAMPLE_WEBHOOK_ID,
    });
    expect(() => shopifyProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      shopifyProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('missing_header');
      expect((err as WebhookValidationError).statusCode).toBe(401);
    }
  });

  it('array-shaped X-Shopify-Hmac-Sha256 throws invalid_signature_format (D-10 day-one fix, NOT missing_header)', () => {
    const sig = makeSignature(SAMPLE_BODY, SAMPLE_SECRET);
    const req = makeReq({
      signature: [sig, sig],
      topic: SAMPLE_TOPIC,
      webhookId: SAMPLE_WEBHOOK_ID,
    });
    expect(() => shopifyProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      shopifyProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      // D-10: Phase 5 splits this from 'missing_header' — Phase 4 stripe.ts:82 has
      // the WR-03 fold defect; Phase 5 ships the fix from day one.
      expect((err as WebhookValidationError).reason).toBe('invalid_signature_format');
      expect((err as WebhookValidationError).reason).not.toBe('missing_header');
      expect((err as WebhookValidationError).statusCode).toBe(401);
    }
  });

  it('empty-string X-Shopify-Hmac-Sha256 throws signature_mismatch (D-15 P5 WR-01)', () => {
    // Note asymmetry with GitHub: empty string has NO prefix to strip, so the provider
    // decodes '' as base64 → empty Buffer → length-mismatch in timingSafeCompare
    // → signature_mismatch (NOT invalid_signature_format). D-15 locks this asymmetry.
    const req = makeReq({ signature: '', topic: SAMPLE_TOPIC, webhookId: SAMPLE_WEBHOOK_ID });
    expect(() => shopifyProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      shopifyProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('signature_mismatch');
      expect((err as WebhookValidationError).statusCode).toBe(401);
    }
  });

  // ── P3 D-07 / D-13 step 7: rawBody guards & malformed_payload ────────────

  it('missing rawBody throws malformed_payload with statusCode 400 (P3 D-07)', () => {
    const req: unknown = {
      rawBody: undefined,
      headers: { 'x-shopify-hmac-sha256': 'somebase64==' },
    };
    expect(() => shopifyProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      shopifyProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('malformed_payload');
      expect((err as WebhookValidationError).statusCode).toBe(400);
    }
  });

  it('valid signature on non-JSON body throws malformed_payload (D-13 step 7)', () => {
    const nonJson = 'not-json';
    const sig = makeSignature(nonJson, SAMPLE_SECRET);
    const req = makeReq({
      body: nonJson,
      rawBody: Buffer.from(nonJson),
      signature: sig,
      topic: SAMPLE_TOPIC,
      webhookId: SAMPLE_WEBHOOK_ID,
    });
    expect(() => shopifyProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      shopifyProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('malformed_payload');
      expect((err as WebhookValidationError).statusCode).toBe(400);
    }
  });

  // ── D-08, D-09, D-11: Metadata header behavior ───────────────────────────

  it('missing X-Shopify-Topic → success with topic === \'\' (D-08)', () => {
    const sig = makeSignature(SAMPLE_BODY, SAMPLE_SECRET);
    const req = makeReq({ signature: sig, topic: undefined, webhookId: SAMPLE_WEBHOOK_ID });
    const result = shopifyProvider.validate(req as any, SAMPLE_SECRET);
    expect((result as any).topic).toBe('');
    expect((result as any).webhookId).toBe(SAMPLE_WEBHOOK_ID);
    expect(result.eventId).toBe(SAMPLE_WEBHOOK_ID);
  });

  it('missing X-Shopify-Webhook-Id → success with webhookId === \'\' and eventId === \'\' (D-08, D-11)', () => {
    const sig = makeSignature(SAMPLE_BODY, SAMPLE_SECRET);
    const req = makeReq({ signature: sig, topic: SAMPLE_TOPIC, webhookId: undefined });
    const result = shopifyProvider.validate(req as any, SAMPLE_SECRET);
    expect((result as any).webhookId).toBe('');
    expect(result.eventId).toBe('');
    expect((result as any).topic).toBe(SAMPLE_TOPIC);
  });

  it('array-shaped X-Shopify-Topic → topic === firstValue (D-09)', () => {
    const sig = makeSignature(SAMPLE_BODY, SAMPLE_SECRET);
    const req = makeReq({
      signature: sig,
      topic: ['orders/create', 'orders/update'],
      webhookId: SAMPLE_WEBHOOK_ID,
    });
    const result = shopifyProvider.validate(req as any, SAMPLE_SECRET);
    expect((result as any).topic).toBe('orders/create');
    expect((result as any).webhookId).toBe(SAMPLE_WEBHOOK_ID);
  });

  // ── P3 D-16, P2 D-11: leakage assertion ──────────────────────────────────

  it('error serializations do not contain signature, secret, or body bytes', () => {
    const sig = makeSignature(SAMPLE_BODY, SAMPLE_SECRET);
    const tampered = Buffer.from(SAMPLE_BODY.replace('12345', 'XXXXX'));
    const req = makeReq({
      rawBody: tampered,
      signature: sig,
      topic: SAMPLE_TOPIC,
      webhookId: SAMPLE_WEBHOOK_ID,
    });
    // Outer-guard (D-14): confirm the throw happens before introspecting
    // serialization. Phase 4 stripe.test.ts:243-259 omits this guard — that
    // is the WR-02 vacuous-pass shape Phase 5 explicitly avoids.
    expect(() => shopifyProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      shopifyProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      const json = JSON.stringify(err);
      const str = String(err);
      expect(json).not.toContain(SAMPLE_SECRET);
      // D-15 P5 WR-02: assert against the actual tampered bytes sent ('XXXXX'),
      // NOT against SAMPLE_BODY (which the tampered buffer doesn't equal — was trivially true).
      expect(json).not.toContain('XXXXX');
      expect(str).not.toContain(SAMPLE_SECRET);
      // D-16: defense-in-depth leakage assertion for future-refactor protection.
      expect(str).not.toContain('XXXXX');
    }
  });
});
