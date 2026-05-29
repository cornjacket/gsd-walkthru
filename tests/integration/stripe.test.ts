import { createHmac } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { webhookErrorHandler } from '../../src/error-handler.js';
import { createWebhookMiddleware } from '../../src/middleware.js';
import { rawBodyCapture } from '../../src/raw-body/middleware.js';
import { captureRawBody } from '../../src/raw-body/verify.js';
// Side-effect import: triggers registerProvider('stripe', stripeProvider)
import '../../src/providers/stripe.js';

const SAMPLE_SECRET = 'whsec_stripe_integration_test_secret';
const SAMPLE_PAYLOAD = '{"id":"evt_integration_test","type":"charge.succeeded"}';

// D-11: inline makeSignature — NOT shared across files
function makeSignature(body: string, secret: string, timestamp: number): string {
  const payload = `${timestamp}.${body}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

// D-09: fresh Express instance per test call — no leaked state between tests
function makeApp(mode: 'rawBodyCapture' | 'verifyCallback'): express.Application {
  const app = express();
  if (mode === 'rawBodyCapture') {
    app.use(rawBodyCapture());
  } else {
    app.use(express.json({ verify: captureRawBody }));
  }
  app.post(
    '/webhook',
    createWebhookMiddleware('stripe', { secret: SAMPLE_SECRET }),
    (req: express.Request, res: express.Response) => {
      res.json({ webhook: req.webhook });
    }
  );
  app.use(webhookErrorHandler());
  return app;
}

// D-10: BOTH describe groups per provider

describe('Stripe integration — rawBodyCapture mode (BODY-01)', () => {
  it('valid signature: returns 200 with webhook.provider === stripe', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = makeSignature(SAMPLE_PAYLOAD, SAMPLE_SECRET, timestamp);
    const res = await request(makeApp('rawBodyCapture'))
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', sig)
      .send(SAMPLE_PAYLOAD);
    expect(res.status).toBe(200);
    expect(res.body.webhook?.provider).toBe('stripe');
    expect(res.body.webhook?.eventId).toBe('evt_integration_test');
  });

  it('tampered body: returns 401', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = makeSignature(SAMPLE_PAYLOAD, SAMPLE_SECRET, timestamp);
    const tamperedPayload = SAMPLE_PAYLOAD.replace('evt_integration_test', 'evt_TAMPERED');
    const res = await request(makeApp('rawBodyCapture'))
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', sig)
      .send(tamperedPayload);
    expect(res.status).toBe(401);
  });

  it('missing Stripe-Signature header: returns 401', async () => {
    const res = await request(makeApp('rawBodyCapture'))
      .post('/webhook')
      .set('content-type', 'application/json')
      .send(SAMPLE_PAYLOAD);
    expect(res.status).toBe(401);
  });

  it('replay outside tolerance window: returns 401', async () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 301;
    const sig = makeSignature(SAMPLE_PAYLOAD, SAMPLE_SECRET, oldTimestamp);
    const res = await request(makeApp('rawBodyCapture'))
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', sig)
      .send(SAMPLE_PAYLOAD);
    expect(res.status).toBe(401);
  });
});

describe('Stripe integration — express.json verify-callback mode (BODY-02)', () => {
  it('valid signature: returns 200 with webhook.provider === stripe', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = makeSignature(SAMPLE_PAYLOAD, SAMPLE_SECRET, timestamp);
    const res = await request(makeApp('verifyCallback'))
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', sig)
      .send(SAMPLE_PAYLOAD);
    expect(res.status).toBe(200);
    expect(res.body.webhook?.provider).toBe('stripe');
  });

  it('tampered body: returns 401', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = makeSignature(SAMPLE_PAYLOAD, SAMPLE_SECRET, timestamp);
    const tamperedPayload = SAMPLE_PAYLOAD.replace('evt_integration_test', 'evt_TAMPERED');
    const res = await request(makeApp('verifyCallback'))
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', sig)
      .send(tamperedPayload);
    expect(res.status).toBe(401);
  });
});
