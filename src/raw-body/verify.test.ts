import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { rawBodyCapture } from './middleware.js';
import { captureRawBody } from './verify.js';

describe('captureRawBody', () => {
  it('stores raw body Buffer at req.rawBody when used as express.json verify callback (BODY-02)', async () => {
    const app = express();
    let captured: Buffer | undefined;
    app.post('/wh', express.json({ verify: captureRawBody }), (req, res) => {
      captured = (req as typeof req & { rawBody?: Buffer }).rawBody;
      res.json({ ok: true });
    });

    const body = '{"id":"evt_test","type":"charge.succeeded"}';
    const res = await request(app)
      .post('/wh')
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
    expect(Buffer.isBuffer(captured)).toBe(true);
    expect(captured?.toString('utf8')).toBe(body);
  });

  it('produces the same Buffer shape as the standalone middleware (BODY-01 cross-surface parity)', async () => {
    // Surface A: standalone middleware.
    const appA = express();
    let bufA: Buffer | undefined;
    appA.post('/wh', rawBodyCapture(), (req, res) => {
      bufA = (req as typeof req & { rawBody?: Buffer }).rawBody;
      res.json({ ok: true });
    });

    // Surface B: verify callback.
    const appB = express();
    let bufB: Buffer | undefined;
    appB.post('/wh', express.json({ verify: captureRawBody }), (req, res) => {
      bufB = (req as typeof req & { rawBody?: Buffer }).rawBody;
      res.json({ ok: true });
    });

    const body = '{"id":"evt_test","amount":4242}';
    await request(appA).post('/wh').set('content-type', 'application/json').send(body);
    await request(appB).post('/wh').set('content-type', 'application/json').send(body);

    expect(Buffer.isBuffer(bufA)).toBe(true);
    expect(Buffer.isBuffer(bufB)).toBe(true);
    // Byte-for-byte parity — D-06 says both surfaces write to req.rawBody
    // with the same shape.
    if (bufA && bufB) {
      expect(Buffer.compare(bufA, bufB)).toBe(0);
    }
  });

  it('does not throw or decode the body using the encoding parameter (unit-only)', () => {
    const reqStub = {} as unknown as Parameters<typeof captureRawBody>[0];
    const resStub = {} as unknown as Parameters<typeof captureRawBody>[1];
    const buf = Buffer.from('hello world', 'utf8');

    expect(() => captureRawBody(reqStub, resStub, buf, 'utf-8')).not.toThrow();

    const stash = (reqStub as unknown as { rawBody?: Buffer }).rawBody;
    // Same Buffer reference passed in — no decode/copy.
    expect(stash).toBe(buf);
  });
});
