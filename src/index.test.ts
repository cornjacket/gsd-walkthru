import { describe, expect, it } from 'vitest';
import {
  computeHmac,
  timingSafeCompare,
  VERSION,
  WebhookValidationError,
  type WebhookValidationReason,
} from './index.js';

describe('express-webhook-validator', () => {
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
});
