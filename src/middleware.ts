// createWebhookMiddleware factory (Phase 3 D-01..D-04, D-07, D-13).
//
// Single primary library export per API-01. Returns a standard Express
// RequestHandler compatible with both Express 4.x and 5.x.
//
// Call-time invariants (fail loudly per PITFALLS #11):
//   - D-02: providerName must be in the registry → plain Error if not.
//   - PITFALLS #11: options.secret must be non-empty → plain Error if not.
//   - D-04: configuration errors are plain Error, NOT validation errors.
//
// Request-time invariants:
//   - D-07: req.rawBody MUST be populated upstream by rawBodyCapture()
//     or express.json({ verify: captureRawBody }) — missing rawBody
//     yields a validation error with reason malformed_payload
//     and statusCode 400.
//   - D-13: failures delegate via the next() error callback; the middleware
//     NEVER writes to res itself. Consumers mount webhookErrorHandler()
//     (or their own error pipeline) downstream to format the response.
//
// Provider-agnostic: this file contains NO provider-name dispatch logic.
// The factory only knows how to look up a provider by string and
// call its Provider interface (D-01). Phase 4/5 replace each stub
// provider's validate() method without touching this factory.
//
// D-16: zero console.* calls. The error class (Phase 2 D-11) plus
// webhookErrorHandler() (Plan 04) are the only failure-surface
// components; logging is the consumer's choice.
import type { RequestHandler } from 'express';
import { WebhookValidationError } from './errors.js';
import { getProvider } from './providers/registry.js';

export interface CreateWebhookMiddlewareOptions {
  /** The webhook signing secret. Must be non-empty (PITFALLS #11). */
  secret: string;
}

/**
 * The single primary library export (API-01). Looks up `providerName`
 * in the registry, validates configuration synchronously, and returns
 * an Express RequestHandler that:
 *   - Yields a validation error with reason 'malformed_payload'
 *     when req.rawBody is missing (D-07).
 *   - Calls provider.validate(req, options.secret), assigns the result
 *     to req.webhook, and calls next() on success.
 *   - Delegates any thrown error from validate() via the error callback.
 *
 * @throws Error - synchronously at call time when providerName is not
 *                  registered (D-02) or options.secret is empty (PITFALLS #11).
 */
export function createWebhookMiddleware(
  providerName: string,
  options: CreateWebhookMiddlewareOptions
): RequestHandler {
  // D-02: synchronous validation at call time, not request time.
  const provider = getProvider(providerName);
  if (!provider) {
    // Static list of v1 provider names for a helpful error message.
    // Phase 4/5 REPLACE these entries (they don't add new names), so a
    // dynamic lookup of registered names from registry.ts is unnecessary
    // for v1.
    const known = ['stripe', 'github', 'shopify'].join(', ');
    throw new Error(
      `Unknown webhook provider: '${providerName}'. ` + `Registered v1 providers: ${known}.`
    );
  }

  // PITFALLS #11 / T-3-03: fail loudly on missing/empty secret.
  // D-04: plain Error for config issues, NOT a validation error.
  if (!options.secret) {
    throw new Error(`Webhook secret required for provider '${providerName}'`);
  }

  const secret = options.secret;

  return (req, _res, next) => {
    // D-07: missing rawBody → malformed_payload validation error.
    if (!req.rawBody) {
      return next(
        new WebhookValidationError({
          reason: 'malformed_payload',
          provider: providerName,
          statusCode: 400,
        })
      );
    }

    try {
      const metadata = provider.validate(req, secret);
      req.webhook = metadata;
      next();
    } catch (err) {
      // D-13: never write res ourselves; delegate to error pipeline.
      next(err);
    }
  };
}
