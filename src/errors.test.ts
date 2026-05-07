import { describe, expect, it } from 'vitest';
import { WebhookValidationError, type WebhookValidationReason } from './errors.js';

// Sample sensitive material. These strings are NEVER passed to the
// constructor — the constructor has no field for them by design (D-11).
// The leakage tests assert that constructed instances cannot serialize
// these values, locking the structural guarantee against regressions.
const SAMPLE_SIGNATURE = 't=1700000000,v1=deadbeefcafe1234567890abcdef';
const SAMPLE_SECRET = 'whsec_super_secret_value_do_not_leak';
const SAMPLE_BODY = '{"id":"evt_test","type":"charge.succeeded"}';

describe('WebhookValidationError', () => {
  it('stores reason, provider, and statusCode on the instance', () => {
    const err = new WebhookValidationError({
      reason: 'signature_mismatch',
      provider: 'stripe',
      statusCode: 401,
    });
    expect(err.reason).toBe('signature_mismatch');
    expect(err.provider).toBe('stripe');
    expect(err.statusCode).toBe(401);
  });

  it('is an instance of Error and WebhookValidationError', () => {
    const err = new WebhookValidationError({
      reason: 'signature_mismatch',
      provider: 'stripe',
      statusCode: 401,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(WebhookValidationError);
  });

  it("sets name to 'WebhookValidationError'", () => {
    const err = new WebhookValidationError({
      reason: 'signature_mismatch',
      provider: 'stripe',
      statusCode: 401,
    });
    expect(err.name).toBe('WebhookValidationError');
  });

  it('auto-derives a non-empty message that contains the provider name', () => {
    const err = new WebhookValidationError({
      reason: 'signature_mismatch',
      provider: 'stripe',
      statusCode: 401,
    });
    expect(err.message.length).toBeGreaterThan(0);
    expect(err.message).toContain('stripe');
  });

  it.each<WebhookValidationReason>([
    'signature_mismatch',
    'timestamp_too_old',
    'missing_header',
    'missing_secret',
    'malformed_payload',
  ])('round-trips reason %s via instance.reason', (reason) => {
    const err = new WebhookValidationError({
      reason,
      provider: 'stripe',
      statusCode: reason === 'malformed_payload' ? 400 : 401,
    });
    expect(err.reason).toBe(reason);
  });

  it('auto-derives a human-readable message for malformed_payload (D-17)', () => {
    const err = new WebhookValidationError({
      reason: 'malformed_payload',
      provider: 'stripe',
      statusCode: 400,
    });
    expect(err.message).toBe('stripe webhook malformed payload');
  });

  it('does not leak sample signature/secret/body via JSON.stringify or String()', () => {
    const err = new WebhookValidationError({
      reason: 'signature_mismatch',
      provider: 'stripe',
      statusCode: 401,
    });
    const json = JSON.stringify(err);
    const str = String(err);
    for (const leak of [SAMPLE_SIGNATURE, SAMPLE_SECRET, SAMPLE_BODY]) {
      expect(json).not.toContain(leak);
      expect(str).not.toContain(leak);
    }
  });

  it('does not leak sample signature/secret/body for malformed_payload reason (D-11 + D-17)', () => {
    const err = new WebhookValidationError({
      reason: 'malformed_payload',
      provider: 'stripe',
      statusCode: 400,
    });
    const json = JSON.stringify(err);
    const str = String(err);
    for (const leak of [SAMPLE_SIGNATURE, SAMPLE_SECRET, SAMPLE_BODY]) {
      expect(json).not.toContain(leak);
      expect(str).not.toContain(leak);
    }
  });

  it('toJSON whitelists exactly { name, reason, provider, statusCode, message }', () => {
    const err = new WebhookValidationError({
      reason: 'signature_mismatch',
      provider: 'stripe',
      statusCode: 401,
    });
    const serialized = JSON.parse(JSON.stringify(err)) as Record<string, unknown>;
    const keys = Object.keys(serialized).sort();
    expect(keys).toEqual(['message', 'name', 'provider', 'reason', 'statusCode']);
  });
});
