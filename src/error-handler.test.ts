import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { webhookErrorHandler } from './error-handler.js';
import { WebhookValidationError, type WebhookValidationReason } from './errors.js';

// Sample sensitive material — same constants as src/errors.test.ts.
// The error class structurally cannot carry these (Phase 2 D-11), but the
// response body is also asserted to not contain them (defense-in-depth on D-15).
const SAMPLE_SIGNATURE = 't=1700000000,v1=deadbeefcafe1234567890abcdef';
const SAMPLE_SECRET = 'whsec_super_secret_value_do_not_leak';
const SAMPLE_BODY = '{"id":"evt_test","type":"charge.succeeded"}';

describe('webhookErrorHandler', () => {
  it.each<[WebhookValidationReason, number]>([
    ['signature_mismatch', 401],
    ['timestamp_too_old', 401],
    ['missing_header', 401],
    ['missing_secret', 401],
    ['malformed_payload', 400],
  ])('emits %s with status %d and { error, reason } body (D-14, D-15)', async (reason, statusCode) => {
    const app = express();
    app.get('/boom', (_req, _res, next) => {
      next(new WebhookValidationError({ reason, provider: 'stripe', statusCode }));
    });
    app.use(webhookErrorHandler());

    const res = await request(app).get('/boom');

    expect(res.status).toBe(statusCode);
    expect(res.body).toEqual({
      error: 'webhook validation failed',
      reason,
    });
    // No extra fields in response (D-15: shape is exactly { error, reason }).
    expect(Object.keys(res.body).sort()).toEqual(['error', 'reason']);
  });

  it('passes non-WebhookValidationError errors through to next(err) (D-14)', async () => {
    let downstreamErr: unknown;
    const app = express();
    app.get('/boom', (_req, _res, next) => {
      next(new Error('plain non-validation error'));
    });
    app.use(webhookErrorHandler());
    // Custom downstream handler captures whatever webhookErrorHandler passed through.
    app.use(
      (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        downstreamErr = err;
        res.status(500).json({ caught: true });
      }
    );

    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ caught: true });
    expect(downstreamErr).toBeInstanceOf(Error);
    expect(downstreamErr).not.toBeInstanceOf(WebhookValidationError);
    expect((downstreamErr as Error).message).toBe('plain non-validation error');
  });

  it('calls no logging methods on either path (D-16, T-3-05)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const app = express();
    app.get('/match', (_req, _res, next) => {
      next(
        new WebhookValidationError({
          reason: 'signature_mismatch',
          provider: 'stripe',
          statusCode: 401,
        })
      );
    });
    app.get('/passthrough', (_req, _res, next) => {
      next(new Error('plain'));
    });
    app.use(webhookErrorHandler());
    app.use(
      (
        _err: unknown,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction
      ) => {
        res.status(500).end();
      }
    );

    await request(app).get('/match');
    await request(app).get('/passthrough');

    expect(errSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    errSpy.mockRestore();
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('preserves fn.length === 4 (Express 4-arg error-handler detection, D-14)', () => {
    expect(webhookErrorHandler().length).toBe(4);
  });

  it('response body never contains sample signature/secret/body bytes (API-04, D-15 + D-11)', async () => {
    const app = express();
    app.get('/boom', (_req, _res, next) => {
      next(
        new WebhookValidationError({
          reason: 'signature_mismatch',
          provider: 'stripe',
          statusCode: 401,
        })
      );
    });
    app.use(webhookErrorHandler());

    const res = await request(app).get('/boom');

    const bodyJson = JSON.stringify(res.body);
    for (const leak of [SAMPLE_SIGNATURE, SAMPLE_SECRET, SAMPLE_BODY]) {
      expect(bodyJson).not.toContain(leak);
    }
  });
});
