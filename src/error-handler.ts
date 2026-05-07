// Opt-in 4-arg Express error middleware (Phase 3 D-14).
//
// Detects WebhookValidationError instances and emits the
// `{ error, reason }` JSON shape (D-15) at `err.statusCode`. Passes
// non-matching errors through unchanged so consumers' downstream
// error pipelines (Sentry, structured logging, custom envelopes) keep
// ownership of formatting and observability.
//
// D-16: this handler calls NO logging methods. Library-never-logs is a
// structural guarantee — any logging is the consumer's choice.
//
// Mounting: consumer mounts explicitly via `app.use(webhookErrorHandler())`.
// NEVER auto-mounted from inside `createWebhookMiddleware()` — auto-mount
// would steal errors from the consumer's pipeline.
import type { ErrorRequestHandler } from 'express';
import { WebhookValidationError } from './errors.js';

/**
 * Returns a 4-arg Express error middleware that responds to
 * `WebhookValidationError` failures with a sanitized JSON envelope.
 *
 * Response shape (D-15): HTTP status from err.statusCode; body contains
 * the generic error phrase and the discriminated reason string only.
 *
 * Non-matching errors are forwarded unchanged to downstream handlers.
 *
 * Empirically verified: TypeScript-typed factory returns preserve
 * `fn.length === 4`, which is what Express's router uses to detect
 * 4-arg error middleware (RESEARCH.md Pattern 5).
 */
export function webhookErrorHandler(): ErrorRequestHandler {
  return (err, _req, res, next) => {
    if (err instanceof WebhookValidationError) {
      // D-15: { error: <generic>, reason: <discriminated> }.
      // D-16: NO logging.
      res.status(err.statusCode).json({
        error: 'webhook validation failed',
        reason: err.reason,
      });
      return;
    }
    // D-14: pass unrecognized errors through unchanged.
    next(err);
  };
}
