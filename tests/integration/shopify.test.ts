import { createHmac } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { webhookErrorHandler } from '../../src/error-handler.js';
import { createWebhookMiddleware } from '../../src/middleware.js';
import { rawBodyCapture } from '../../src/raw-body/middleware.js';
import { captureRawBody } from '../../src/raw-body/verify.js';
// Side-effect import: triggers registerProvider('shopify', shopifyProvider)
import '../../src/providers/shopify.js';

const SAMPLE_SECRET = 'whsec_shopify_integration_test_secret';
const SAMPLE_PAYLOAD = '{"order_id":9999,"customer":{"email":"test@example.com"}}';
const SAMPLE_TOPIC = 'orders/create';
const SAMPLE_WEBHOOK_ID = 'ddddeeee-ffff-0000-1111-222233334444';

// D-11: inline makeSignature — Shopify: bare base64, NO prefix
function makeSignature(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64');
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
    createWebhookMiddleware('shopify', { secret: SAMPLE_SECRET }),
    (req: express.Request, res: express.Response) => {
      res.json({ webhook: req.webhook });
    }
  );
  app.use(webhookErrorHandler());
  return app;
}

// D-10: BOTH describe groups per provider

describe('Shopify integration — rawBodyCapture mode (BODY-01)', () => {
  it('valid base64 signature: returns 200 with webhook.provider === shopify and topic', async () => {
    const sig = makeSignature(SAMPLE_PAYLOAD, SAMPLE_SECRET);
    const res = await request(makeApp('rawBodyCapture'))
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('x-shopify-hmac-sha256', sig)
      .set('x-shopify-topic', SAMPLE_TOPIC)
      .set('x-shopify-webhook-id', SAMPLE_WEBHOOK_ID)
      .send(SAMPLE_PAYLOAD);
    expect(res.status).toBe(200);
    expect(res.body.webhook?.provider).toBe('shopify');
    expect(res.body.webhook?.topic).toBe(SAMPLE_TOPIC);
    expect(res.body.webhook?.webhookId).toBe(SAMPLE_WEBHOOK_ID);
  });

  it('tampered body: returns 401', async () => {
    const sig = makeSignature(SAMPLE_PAYLOAD, SAMPLE_SECRET);
    // Use a valid JSON number (8888 not 0000) to avoid body-parser parse error
    const tamperedPayload = SAMPLE_PAYLOAD.replace('9999', '8888');
    const res = await request(makeApp('rawBodyCapture'))
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('x-shopify-hmac-sha256', sig)
      .set('x-shopify-topic', SAMPLE_TOPIC)
      .set('x-shopify-webhook-id', SAMPLE_WEBHOOK_ID)
      .send(tamperedPayload);
    expect(res.status).toBe(401);
    expect(res.body.reason).toBe('signature_mismatch');
  });

  it('hex-encoded digest (wrong encoding): returns 401 (QUAL-04 Shopify encoding mismatch)', async () => {
    const hexDigest = createHmac('sha256', SAMPLE_SECRET).update(SAMPLE_PAYLOAD).digest('hex'); // hex, not base64 — wrong encoding
    const res = await request(makeApp('rawBodyCapture'))
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('x-shopify-hmac-sha256', hexDigest)
      .set('x-shopify-topic', SAMPLE_TOPIC)
      .set('x-shopify-webhook-id', SAMPLE_WEBHOOK_ID)
      .send(SAMPLE_PAYLOAD);
    expect(res.status).toBe(401);
    // D-05: wrong encoding decodes to wrong-length bytes → signature_mismatch
    // (NOT a widened 'invalid_encoding' reason).
    expect(res.body.reason).toBe('signature_mismatch');
  });

  it('missing X-Shopify-Hmac-Sha256: returns 401 with reason missing_header', async () => {
    // WR-01: Shopify previously had no missing-header integration test; add one
    // and assert reason (not just status) to cover the missing-header guard at
    // the integration tier.
    const res = await request(makeApp('rawBodyCapture'))
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('x-shopify-topic', SAMPLE_TOPIC)
      .set('x-shopify-webhook-id', SAMPLE_WEBHOOK_ID)
      .send(SAMPLE_PAYLOAD);
    expect(res.status).toBe(401);
    expect(res.body.reason).toBe('missing_header');
  });
});

describe('Shopify integration — express.json verify-callback mode (BODY-02)', () => {
  it('valid base64 signature: returns 200 with webhook.provider === shopify', async () => {
    const sig = makeSignature(SAMPLE_PAYLOAD, SAMPLE_SECRET);
    const res = await request(makeApp('verifyCallback'))
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('x-shopify-hmac-sha256', sig)
      .set('x-shopify-topic', SAMPLE_TOPIC)
      .set('x-shopify-webhook-id', SAMPLE_WEBHOOK_ID)
      .send(SAMPLE_PAYLOAD);
    expect(res.status).toBe(200);
    expect(res.body.webhook?.provider).toBe('shopify');
  });

  it('tampered body: returns 401', async () => {
    const sig = makeSignature(SAMPLE_PAYLOAD, SAMPLE_SECRET);
    // Use a valid JSON number (8888 not 0000) to avoid body-parser parse error
    const tamperedPayload = SAMPLE_PAYLOAD.replace('9999', '8888');
    const res = await request(makeApp('verifyCallback'))
      .post('/webhook')
      .set('content-type', 'application/json')
      .set('x-shopify-hmac-sha256', sig)
      .set('x-shopify-topic', SAMPLE_TOPIC)
      .set('x-shopify-webhook-id', SAMPLE_WEBHOOK_ID)
      .send(tamperedPayload);
    expect(res.status).toBe(401);
    expect(res.body.reason).toBe('signature_mismatch');
  });
});
