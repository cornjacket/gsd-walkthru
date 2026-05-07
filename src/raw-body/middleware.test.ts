import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { rawBodyCapture } from './middleware.js';

describe('rawBodyCapture', () => {
  it('populates req.rawBody as a Buffer with the exact bytes sent (BODY-01)', async () => {
    const app = express();
    let captured: Buffer | undefined;
    app.post('/wh', rawBodyCapture(), (req, res) => {
      captured = (req as typeof req & { rawBody?: Buffer }).rawBody;
      res.json({ ok: true });
    });

    const body = '{"id":"evt_test","type":"charge.succeeded"}';
    const res = await request(app).post('/wh').set('content-type', 'application/json').send(body);

    expect(res.status).toBe(200);
    expect(Buffer.isBuffer(captured)).toBe(true);
    expect(captured?.toString('utf8')).toBe(body);
  });

  it('respects { limit } and rejects oversize with 413 (D-08, T-3-02)', async () => {
    const app = express();
    app.post('/wh', rawBodyCapture({ limit: '10b' }), (_req, res) => {
      res.json({ ok: true });
    });
    // 4-arg error middleware to surface 413 rather than 500.
    app.use(
      (
        err: { status?: number },
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction
      ) => {
        res.status(err.status ?? 500).json({ status: err.status });
      }
    );

    const res = await request(app)
      .post('/wh')
      .set('content-type', 'application/json')
      .send('x'.repeat(100));

    expect(res.status).toBe(413);
  });

  it('skips capture when req.rawBody is already set (Pitfall 3)', async () => {
    const app = express();
    const presetBuffer = Buffer.from('preset');
    // Synthetic prior middleware that pre-sets req.rawBody.
    app.use((req, _res, next) => {
      (req as typeof req & { rawBody?: Buffer }).rawBody = presetBuffer;
      next();
    });
    let captured: Buffer | undefined;
    app.post('/wh', rawBodyCapture(), (req, res) => {
      captured = (req as typeof req & { rawBody?: Buffer }).rawBody;
      res.json({ ok: true });
    });

    await request(app).post('/wh').send('ignored body');

    expect(captured).toBe(presetBuffer);
    expect(captured?.toString('utf8')).toBe('preset');
  });

  it('413 errors are NOT WebhookValidationError instances (Pitfall 4)', async () => {
    const app = express();
    app.post('/wh', rawBodyCapture({ limit: '10b' }), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(
      (
        err: Error & { status?: number },
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction
      ) => {
        // Stamp the assertion result into the response body so supertest can read it.
        res.status(200).json({
          errName: err.constructor.name,
          errStatus: err.status,
        });
      }
    );

    const res = await request(app).post('/wh').send('x'.repeat(100));

    expect(res.status).toBe(200);
    expect(res.body.errName).not.toBe('WebhookValidationError');
    expect(res.body.errStatus).toBe(413);
  });

  it('does not call any console method during success or oversize paths (D-16)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const app = express();
    app.post('/ok', rawBodyCapture(), (_req, res) => res.json({ ok: true }));
    app.post('/big', rawBodyCapture({ limit: '10b' }), (_req, res) => res.json({ ok: true }));
    app.use(
      (
        err: { status?: number },
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction
      ) => {
        res.status(err.status ?? 500).end();
      }
    );

    await request(app).post('/ok').send('{"a":1}');
    await request(app).post('/big').send('x'.repeat(100));

    expect(errSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    errSpy.mockRestore();
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
