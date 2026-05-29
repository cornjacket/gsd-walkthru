import { createHmac } from 'node:crypto';
import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { WebhookValidationError } from '../errors.js';
import { type StripeWebhook, stripeProvider } from './stripe.js';

// stripe's validate accepts an explicit tolerance (3rd arg) that the shared
// 2-arg Provider interface intentionally hides (D-16 keeps the contract at
// (req, secret); the middleware bridges the 3rd arg via a localized Function
// cast). Tests exercise the timestamp/tolerance path through this typed view —
// the same indirection the middleware uses — while keeping full return typing.
const validateWithTolerance = stripeProvider.validate as (
  req: Request,
  secret: string,
  toleranceSeconds?: number
) => StripeWebhook;

// Sample sensitive material for leakage assertions
const SAMPLE_SECRET = 'whsec_test_secret_do_not_leak';
const SAMPLE_BODY = '{"id":"evt_test","type":"charge.succeeded"}';

/**
 * Build a correct Stripe-Signature header value for the given body/secret/timestamp.
 * Mirrors the exact HMAC input that stripeProvider.validate() computes: `${t}.${body}`.
 */
function makeSignature(body: string, secret: string, timestamp: number): string {
  const payload = `${timestamp}.${body}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

/**
 * Build a minimal Express Request fixture for testing.
 * When `opts.signature` is undefined, the 'stripe-signature' header is omitted.
 */
function makeReq(opts: {
  body?: string;
  rawBody?: Buffer | undefined;
  signature?: string;
}): unknown {
  const body = opts.body ?? '{"id":"evt_1234","type":"charge.succeeded"}';
  return {
    rawBody: opts.rawBody !== undefined ? opts.rawBody : Buffer.from(body),
    headers: opts.signature !== undefined ? { 'stripe-signature': opts.signature } : {},
  };
}

describe('stripeProvider.validate()', () => {
  // ── D-12: SC4-binding cases ──────────────────────────────────────────────

  it('happy path: valid signature and matching rawBody returns StripeWebhook', () => {
    const secret = SAMPLE_SECRET;
    const body = SAMPLE_BODY;
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = makeSignature(body, secret, timestamp);
    const req = makeReq({ body, signature: sig });
    const result = validateWithTolerance(req as any, secret, 300);
    expect(result.provider).toBe('stripe');
    expect(result.eventId).toBe('evt_test');
    expect(result.timestamp).toBe(timestamp);
    expect((result as any).replayWindowMs).toBe(300000);
    expect(result.parsed).toMatchObject({ id: 'evt_test' });
  });

  it('tampered body throws signature_mismatch', () => {
    const secret = SAMPLE_SECRET;
    const body = SAMPLE_BODY;
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = makeSignature(body, secret, timestamp);
    const tamperedBody = Buffer.from(body.replace('evt_test', 'evt_XXXX'));
    const req = makeReq({ rawBody: tamperedBody, signature: sig });
    expect(() => stripeProvider.validate(req as any, secret)).toThrow(WebhookValidationError);
    try {
      stripeProvider.validate(req as any, secret);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('signature_mismatch');
      expect((err as WebhookValidationError).statusCode).toBe(401);
    }
  });

  it('timestamp 301s old with default 300s tolerance throws timestamp_too_old', () => {
    const secret = SAMPLE_SECRET;
    const body = SAMPLE_BODY;
    const oldTimestamp = Math.floor(Date.now() / 1000) - 301;
    const sig = makeSignature(body, secret, oldTimestamp);
    const req = makeReq({ body, signature: sig });
    expect(() => validateWithTolerance(req as any, secret, 300)).toThrow(WebhookValidationError);
    try {
      validateWithTolerance(req as any, secret, 300);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('timestamp_too_old');
    }
  });

  it('configurable tolerance: 90s old timestamp rejected with tolerance=60', () => {
    const secret = SAMPLE_SECRET;
    const body = SAMPLE_BODY;
    const oldTimestamp = Math.floor(Date.now() / 1000) - 90;
    const sig = makeSignature(body, secret, oldTimestamp);
    const req = makeReq({ body, signature: sig });
    expect(() => validateWithTolerance(req as any, secret, 60)).toThrow(WebhookValidationError);
    try {
      validateWithTolerance(req as any, secret, 60);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('timestamp_too_old');
    }
  });

  it('multi-v1 rotation: first v1 wrong, second v1 correct → StripeWebhook returned', () => {
    const secret = SAMPLE_SECRET;
    const body = SAMPLE_BODY;
    const timestamp = Math.floor(Date.now() / 1000);
    const correctSig = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
    const wrongSig = 'deadbeefcafe1234567890abcdef01234567890abcdef01234567890abcdef0123';
    const header = `t=${timestamp},v1=${wrongSig},v1=${correctSig}`;
    const req = makeReq({ body, signature: header });
    const result = validateWithTolerance(req as any, secret, 300);
    expect(result.provider).toBe('stripe');
    expect(result.eventId).toBe('evt_test');
  });

  // ── D-13: Negative cases ─────────────────────────────────────────────────

  it('missing Stripe-Signature header throws missing_header', () => {
    const req = makeReq({ body: SAMPLE_BODY, signature: undefined });
    expect(() => stripeProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      stripeProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('missing_header');
      expect((err as WebhookValidationError).statusCode).toBe(401);
    }
  });

  it('array-shaped Stripe-Signature header throws invalid_signature_format, NOT missing_header (D-12 WR-03)', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const req: unknown = {
      rawBody: Buffer.from(SAMPLE_BODY),
      headers: {
        'stripe-signature': [`t=${timestamp},v1=abc`, `t=${timestamp},v1=def`],
      },
    };
    expect(() => stripeProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      stripeProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('invalid_signature_format');
      expect((err as WebhookValidationError).reason).not.toBe('missing_header');
      expect((err as WebhookValidationError).statusCode).toBe(401);
    }
  });

  it('non-numeric t= value (t=1700000000xyz) throws invalid_signature_format (D-14 WR-05)', () => {
    const req = makeReq({
      body: SAMPLE_BODY,
      signature:
        't=1700000000xyz,v1=deadbeefcafe01234567890abcdef01234567890abcdef01234567890abcdef01',
    });
    expect(() => stripeProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      stripeProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('invalid_signature_format');
      expect((err as WebhookValidationError).statusCode).toBe(401);
    }
  });

  it('garbled header (no t= or v1=) throws invalid_signature_format', () => {
    const req = makeReq({ body: SAMPLE_BODY, signature: 'garbage_no_equals' });
    expect(() => stripeProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      stripeProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('invalid_signature_format');
      expect((err as WebhookValidationError).statusCode).toBe(401);
    }
  });

  it('header with only v0= and no v1= throws invalid_signature_format', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const req = makeReq({
      body: SAMPLE_BODY,
      signature: `t=${timestamp},v0=deadbeef`,
    });
    expect(() => stripeProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      stripeProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('invalid_signature_format');
    }
  });

  it('header with only v2= throws invalid_signature_format', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const req = makeReq({
      body: SAMPLE_BODY,
      signature: `t=${timestamp},v2=deadbeef`,
    });
    expect(() => stripeProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      stripeProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('invalid_signature_format');
    }
  });

  it('missing req.rawBody throws malformed_payload with statusCode 400', () => {
    const req = {
      rawBody: undefined,
      headers: { 'stripe-signature': 't=1,v1=abc' },
    };
    expect(() => stripeProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      stripeProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('malformed_payload');
      expect((err as WebhookValidationError).statusCode).toBe(400);
    }
  });

  it('valid signature but non-JSON rawBody throws malformed_payload', () => {
    const secret = SAMPLE_SECRET;
    const body = 'not-valid-json';
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = makeSignature(body, secret, timestamp);
    const req = makeReq({ rawBody: Buffer.from(body), signature: sig });
    expect(() => validateWithTolerance(req as any, secret, 300)).toThrow(WebhookValidationError);
    try {
      validateWithTolerance(req as any, secret, 300);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('malformed_payload');
      expect((err as WebhookValidationError).statusCode).toBe(400);
    }
  });

  it('valid signature + valid JSON with no id field → eventId empty string', () => {
    const secret = SAMPLE_SECRET;
    const body = '{"type":"charge.succeeded"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = makeSignature(body, secret, timestamp);
    const req = makeReq({ rawBody: Buffer.from(body), signature: sig });
    const result = validateWithTolerance(req as any, secret, 300);
    expect(result.eventId).toBe('');
    expect(result.provider).toBe('stripe');
  });

  it('valid signature + valid JSON with numeric id → eventId empty string (D-09)', () => {
    const secret = SAMPLE_SECRET;
    const body = '{"id":12345,"type":"charge.succeeded"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = makeSignature(body, secret, timestamp);
    const req = makeReq({ rawBody: Buffer.from(body), signature: sig });
    const result = validateWithTolerance(req as any, secret, 300);
    expect(result.eventId).toBe('');
  });

  it('future-skewed timestamp (10 min in future) passes validation (D-01 past-only)', () => {
    const secret = SAMPLE_SECRET;
    const body = SAMPLE_BODY;
    const futureTimestamp = Math.floor(Date.now() / 1000) + 600;
    const sig = makeSignature(body, secret, futureTimestamp);
    const req = makeReq({ body, signature: sig });
    const result = validateWithTolerance(req as any, secret, 300);
    expect(result.provider).toBe('stripe');
  });

  it('error serializations do not contain signature, secret, or body bytes', () => {
    const SAMPLE_SIGNATURE_VAL = makeSignature(
      SAMPLE_BODY,
      SAMPLE_SECRET,
      Math.floor(Date.now() / 1000) - 9999
    );
    const req = makeReq({ body: SAMPLE_BODY, signature: SAMPLE_SIGNATURE_VAL });
    expect(() => validateWithTolerance(req as any, SAMPLE_SECRET, 300)).toThrow(
      WebhookValidationError
    );
    try {
      validateWithTolerance(req as any, SAMPLE_SECRET, 300);
    } catch (err) {
      const json = JSON.stringify(err);
      const str = String(err);
      expect(json).not.toContain(SAMPLE_SECRET);
      expect(json).not.toContain(SAMPLE_BODY);
      expect(str).not.toContain(SAMPLE_SECRET);
    }
  });
});
