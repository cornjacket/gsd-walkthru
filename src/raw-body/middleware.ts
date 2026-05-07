// Standalone raw-body capture middleware (D-05).
//
// Reads the request stream into a Buffer via the `raw-body` npm package
// (already a transitive dep of `express` — RESEARCH.md Standard Stack)
// and stores it at `req.rawBody` BEFORE any JSON parsing runs.
//
// D-08: default { limit: '1mb' } mitigates pre-validation memory-DoS;
// bodies exceeding the limit reject with HTTP 413 BEFORE any HMAC
// computation runs. Rejection propagates via Express error delegation.
//
// D-13: failures (oversize, aborted, encoding) delegate to the next
// error handler; this middleware never writes to `res` directly.
//
// Pitfall 3: if `req.rawBody` is already populated (e.g., by an upstream
// express.json({ verify: captureRawBody })), this middleware skips —
// re-reading would fail because the stream has already been consumed.
//
// Pitfall 4: 413 errors are NOT the library's validation error class. They are
// RawBodyError (raw-body's own type) and propagate unchanged through
// webhookErrorHandler() (Plan 04) which passes non-validation errors
// through to the consumer's pipeline.
//
// Mounting: PER-ROUTE only (PITFALLS #18). Never `app.use(rawBodyCapture())`
// globally — that would force every non-webhook route through this read.
import type { RequestHandler } from 'express';
import getRawBody from 'raw-body';

export interface RawBodyOptions {
  /** Default '1mb' (D-08). Accepts any string the `bytes` package parses (e.g., '500kb', '2mb'). */
  limit?: string | number;
}

/**
 * Returns an Express middleware that captures the raw request body as
 * a Buffer at `req.rawBody`. Mount BEFORE `createWebhookMiddleware()`
 * on a per-route basis.
 *
 * @example
 * app.post('/wh/stripe',
 *   rawBodyCapture(),
 *   createWebhookMiddleware('stripe', { secret }),
 *   handler
 * );
 */
export function rawBodyCapture(options: RawBodyOptions = {}): RequestHandler {
  const limit = options.limit ?? '1mb';

  return (req, _res, next) => {
    // Pitfall 3: skip if a previous middleware already captured.
    const reqWithRaw = req as typeof req & { rawBody?: Buffer };
    if (reqWithRaw.rawBody) {
      return next();
    }

    getRawBody(req, {
      limit,
      length: req.headers['content-length'],
    })
      .then((buf) => {
        reqWithRaw.rawBody = buf;
        next();
      })
      .catch((err) => {
        // raw-body throws RawBodyError with .status set (413, 400, 415).
        // D-13: never write res ourselves; delegate to Express error pipeline.
        // Pitfall 4: do NOT translate to a library validation error class.
        next(err);
      });
  };
}
