import { createHmac } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { webhookErrorHandler } from '../../src/error-handler.js';
import { createWebhookMiddleware } from '../../src/middleware.js';
import { captureRawBody } from '../../src/raw-body/verify.js';
import { rawBodyCapture } from '../../src/raw-body/middleware.js';
// Side-effect import: triggers registerProvider('github', githubProvider)
import '../../src/providers/github.js';

const SAMPLE_SECRET = 'whsec_github_integration_test_secret';
const SAMPLE_PAYLOAD = '{"action":"opened","number":42,"repository":{"id":99}}';
const SAMPLE_DELIVERY = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff';

// D-11: inline makeSignature — NOT shared across files
function makeSignature(body: string, secret: string): string {
  const sig = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${sig}`;
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
    createWebhookMiddleware('github', { secret: SAMPLE_SECRET }),
    (req: express.Request, res: express.Response) => {
      res.json({ webhook: req.webhook });
    }
  );
  app.use(webhookErrorHandler());
  return app;
}

// D-10: BOTH describe groups per provider

describe('GitHub integration — rawBodyCapture mode (BODY-01)', () => {
  it('valid signature: returns 200 with webhook.provider === github and deliveryId', async () => {
    const sig = makeSignature(SAMPLE_PAYLOAD, SAMPLE_SECRET);
    const res = await request(makeApp('rawBodyCapture'))
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', sig)
      .set('x-github-delivery', SAMPLE_DELIVERY)
      .send(SAMPLE_PAYLOAD);
    expect(res.status).toBe(200);
    expect(res.body.webhook?.provider).toBe('github');
    expect(res.body.webhook?.deliveryId).toBe(SAMPLE_DELIVERY);
  });

  it('tampered body: returns 401', async () => {
    const sig = makeSignature(SAMPLE_PAYLOAD, SAMPLE_SECRET);
    const tamperedPayload = SAMPLE_PAYLOAD.replace('opened', 'TAMPERED');
    const res = await request(makeApp('rawBodyCapture'))
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', sig)
      .set('x-github-delivery', SAMPLE_DELIVERY)
      .send(tamperedPayload);
    expect(res.status).toBe(401);
  });

  it('missing X-Hub-Signature-256: returns 401', async () => {
    const res = await request(makeApp('rawBodyCapture'))
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('x-github-delivery', SAMPLE_DELIVERY)
      .send(SAMPLE_PAYLOAD);
    expect(res.status).toBe(401);
  });
});

describe('GitHub integration — express.json verify-callback mode (BODY-02)', () => {
  it('valid signature: returns 200 with webhook.provider === github', async () => {
    const sig = makeSignature(SAMPLE_PAYLOAD, SAMPLE_SECRET);
    const res = await request(makeApp('verifyCallback'))
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', sig)
      .set('x-github-delivery', SAMPLE_DELIVERY)
      .send(SAMPLE_PAYLOAD);
    expect(res.status).toBe(200);
    expect(res.body.webhook?.provider).toBe('github');
  });

  it('tampered body: returns 401', async () => {
    const sig = makeSignature(SAMPLE_PAYLOAD, SAMPLE_SECRET);
    const tamperedPayload = SAMPLE_PAYLOAD.replace('opened', 'TAMPERED');
    const res = await request(makeApp('verifyCallback'))
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', sig)
      .set('x-github-delivery', SAMPLE_DELIVERY)
      .send(tamperedPayload);
    expect(res.status).toBe(401);
  });
});
