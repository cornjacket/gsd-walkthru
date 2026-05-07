import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webhookErrorHandler } from './error-handler.js';
import { WebhookValidationError } from './errors.js';
import { createWebhookMiddleware } from './middleware.js';
import { _clearRegistryForTesting, registerProvider } from './providers/registry.js';
import type { Provider } from './providers/types.js';
import { rawBodyCapture } from './raw-body/middleware.js';

// Pitfall 2: imports are direct module imports — NOT via '../index.js' —
// so the production provider stubs (Plan 02 + Plan 07 side-effect imports)
// do NOT pre-populate the registry. We control registration explicitly.

// Sample sensitive material — same constants as src/errors.test.ts.
const SAMPLE_SIGNATURE = 't=1700000000,v1=deadbeefcafe1234567890abcdef';
const SAMPLE_SECRET = 'whsec_super_secret_value_do_not_leak';
const SAMPLE_BODY = '{"id":"evt_test","type":"charge.succeeded"}';

/**
 * Minimal fake Provider that returns a 'test-fake' branch shape compatible
 * with WebhookMetadata at runtime (we cast through `as never` because
 * WebhookMetadata is a closed union of Stripe/GitHub/Shopify; the fake
 * shape doesn't satisfy any of those branches structurally — that's fine
 * at runtime, and tests only assert observable behavior).
 */
function makeFakeProvider(
  opts: { throwError?: Error; onValidate?: (req: unknown, secret: string) => void } = {}
): Provider {
  return {
    name: 'test-fake',
    validate(req, secret) {
      opts.onValidate?.(req, secret);
      if (opts.throwError) throw opts.throwError;
      return {
        provider: 'test-fake',
        eventId: 'evt_fake',
        timestamp: 0,
        parsed: {},
      } as never;
    },
  };
}

describe('createWebhookMiddleware', () => {
  beforeEach(() => {
    _clearRegistryForTesting();
    registerProvider('test-fake', makeFakeProvider());
  });

  afterEach(() => {
    _clearRegistryForTesting();
  });

  it('throws synchronously on unknown provider (D-02)', () => {
    expect(() => createWebhookMiddleware('not-registered', { secret: 'x' })).toThrow(
      /unknown webhook provider/i
    );
  });

  it('unknown-provider error is plain Error, NOT WebhookValidationError (D-04)', () => {
    let caught: unknown;
    try {
      createWebhookMiddleware('not-registered', { secret: 'x' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(WebhookValidationError);
  });

  it('throws synchronously on empty secret (PITFALLS #11, T-3-03)', () => {
    expect(() => createWebhookMiddleware('test-fake', { secret: '' })).toThrow(/secret/i);
  });

  it('throws synchronously on whitespace-only secret with the same message (WR-03)', () => {
    // A " " / "\n" / "\t" secret is almost always a misconfig (placeholder
    // env value that wasn't substituted). Reject it at config time with
    // the same plain-Error message as the empty-secret case.
    expect(() => createWebhookMiddleware('test-fake', { secret: ' ' })).toThrow(
      /Webhook secret required for provider 'test-fake'/
    );
  });

  it('returns a RequestHandler that assigns req.webhook on success path (API-01)', async () => {
    let validateCalledWithSecret: string | undefined;
    _clearRegistryForTesting();
    registerProvider(
      'test-fake',
      makeFakeProvider({
        onValidate: (_req, secret) => {
          validateCalledWithSecret = secret;
        },
      })
    );

    const app = express();
    app.post(
      '/wh',
      rawBodyCapture(),
      createWebhookMiddleware('test-fake', { secret: 'wh_test_secret' }),
      (req, res) => {
        res.json({ webhook: req.webhook });
      }
    );

    const res = await request(app)
      .post('/wh')
      .set('content-type', 'application/json')
      .send('{"id":"evt_test"}');

    expect(res.status).toBe(200);
    expect(res.body.webhook?.provider).toBe('test-fake');
    expect(validateCalledWithSecret).toBe('wh_test_secret');
  });

  it("emits WebhookValidationError({ reason: 'malformed_payload', statusCode: 400 }) when req.rawBody is missing (D-07)", async () => {
    let captured: unknown;
    const app = express();
    // Note: NO rawBodyCapture() before createWebhookMiddleware.
    app.post('/wh', createWebhookMiddleware('test-fake', { secret: 'x' }), (_req, res) =>
      res.json({ ok: true })
    );
    app.use(
      (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        captured = err;
        res.status(500).end();
      }
    );

    await request(app).post('/wh').send('whatever');

    expect(captured).toBeInstanceOf(WebhookValidationError);
    expect((captured as WebhookValidationError).reason).toBe('malformed_payload');
    expect((captured as WebhookValidationError).statusCode).toBe(400);
    expect((captured as WebhookValidationError).provider).toBe('test-fake');
  });

  it('delegates provider.validate() throws via next(err) — never writes to res (D-13)', async () => {
    const thrown = new WebhookValidationError({
      reason: 'signature_mismatch',
      provider: 'test-fake',
      statusCode: 401,
    });
    _clearRegistryForTesting();
    registerProvider('test-fake', makeFakeProvider({ throwError: thrown }));

    let captured: unknown;
    const app = express();
    app.post(
      '/wh',
      rawBodyCapture(),
      createWebhookMiddleware('test-fake', { secret: 'x' }),
      (_req, res) => res.status(200).end()
    );
    app.use(
      (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        captured = err;
        res.status(500).end();
      }
    );

    const res = await request(app).post('/wh').set('content-type', 'application/json').send('{}');

    // Same instance — middleware called next(err) without rewrapping.
    expect(captured).toBe(thrown);
    // 500 because our test handler returns 500; 401 would only come from webhookErrorHandler (separate test).
    expect(res.status).toBe(500);
  });

  it('calls no logging methods on success or failure paths (D-16, T-3-05)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Success path.
    const appOk = express();
    appOk.post(
      '/wh',
      rawBodyCapture(),
      createWebhookMiddleware('test-fake', { secret: 'x' }),
      (_req, res) => res.json({ ok: true })
    );
    await request(appOk).post('/wh').send('{}');

    // Failure path (signature mismatch).
    _clearRegistryForTesting();
    registerProvider(
      'test-fake',
      makeFakeProvider({
        throwError: new WebhookValidationError({
          reason: 'signature_mismatch',
          provider: 'test-fake',
          statusCode: 401,
        }),
      })
    );
    const appBad = express();
    appBad.post(
      '/wh',
      rawBodyCapture(),
      createWebhookMiddleware('test-fake', { secret: 'x' }),
      (_req, res) => res.json({ ok: true })
    );
    appBad.use(webhookErrorHandler());
    await request(appBad).post('/wh').send('{}');

    expect(errSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    errSpy.mockRestore();
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('response body never contains sample signature/secret/body bytes (API-04, SC4)', async () => {
    // Register a fake that throws signature_mismatch; the body sent in
    // the request contains SAMPLE_BODY. Even if the middleware leaked the
    // body somehow, the response shape from webhookErrorHandler is
    // structurally `{ error, reason }` (Plan 04 D-15) — no input path
    // for the body bytes to enter.
    _clearRegistryForTesting();
    registerProvider(
      'test-fake',
      makeFakeProvider({
        throwError: new WebhookValidationError({
          reason: 'signature_mismatch',
          provider: 'test-fake',
          statusCode: 401,
        }),
      })
    );

    const app = express();
    app.post(
      '/wh',
      rawBodyCapture(),
      createWebhookMiddleware('test-fake', { secret: SAMPLE_SECRET }),
      (_req, res) => res.json({ ok: true })
    );
    app.use(webhookErrorHandler());

    const res = await request(app)
      .post('/wh')
      .set('content-type', 'application/json')
      .set('x-fake-signature', SAMPLE_SIGNATURE)
      .send(SAMPLE_BODY);

    expect(res.status).toBe(401);
    const bodyJson = JSON.stringify(res.body);
    expect(bodyJson).not.toContain(SAMPLE_SIGNATURE);
    expect(bodyJson).not.toContain(SAMPLE_SECRET);
    expect(bodyJson).not.toContain(SAMPLE_BODY);
    // Defense-in-depth: the response body shape is exactly { error, reason }.
    expect(Object.keys(res.body).sort()).toEqual(['error', 'reason']);
    expect(res.body.reason).toBe('signature_mismatch');
  });
});
