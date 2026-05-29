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
import { getProvider, listProviders } from './providers/registry.js';
import type { WebhookMetadata } from './types.js';

export interface CreateWebhookMiddlewareOptions {
  /** The webhook signing secret. Must be non-empty (PITFALLS #11). */
  secret: string;
  /**
   * Timestamp tolerance in seconds. Requests with a Stripe-Signature
   * timestamp older than this value are rejected with reason
   * 'timestamp_too_old'. Defaults to 300 (5 minutes) when unset.
   * Only used by providers that enforce a replay window (e.g., Stripe).
   * @default 300
   */
  tolerance?: number;
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
    // Build the "known providers" list dynamically from the registry so
    // tests that register fakes (and Phase 4/5 substitutions) are
    // reflected accurately. Falls back to '(none registered)' when the
    // registry is empty (e.g., test that cleared the registry without
    // registering anything).
    const known = listProviders().join(', ') || '(none registered)';
    throw new Error(
      `Unknown webhook provider: '${providerName}'. ` + `Registered providers: ${known}.`
    );
  }

  // PITFALLS #11 / T-3-03: fail loudly on missing/empty/whitespace-only
  // secret. A whitespace-only value almost always indicates a misconfig
  // (e.g., a placeholder in an env file the dev expected to be replaced)
  // — surface it at config time instead of letting it produce an opaque
  // signature_mismatch at request time.
  // D-04: plain Error for config issues, NOT a validation error.
  if (!options.secret || options.secret.trim().length === 0) {
    throw new Error(`Webhook secret required for provider '${providerName}'`);
  }

  // D-13 (Phase 6): fail loudly at factory call time on NaN/non-finite/negative tolerance.
  // Mirrors the P3 WR-03 secret-whitespace loud-fail precedent. Plain Error (not
  // WebhookValidationError) — this is a configuration error, not a request validation error.
  if (options.tolerance !== undefined) {
    if (
      typeof options.tolerance !== 'number' ||
      !Number.isFinite(options.tolerance) ||
      options.tolerance < 0
    ) {
      throw new Error(
        `Webhook tolerance must be a non-negative finite number for provider '${providerName}' (got ${String(options.tolerance)})`
      );
    }
  }

  const secret = options.secret;
  // STRP-02: resolve tolerance once at factory time so the stripe provider
  // can enforce its timestamp window. Default of 300 s matches Stripe's
  // recommended replay window. Providers that do not use a timestamp window
  // (GitHub, Shopify) receive and ignore this argument.
  const tolerance = options.tolerance ?? 300;

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
      // Pass tolerance as an optional 3rd argument. The Provider interface
      // declares validate(req, secret) with 2 params (D-16 — do not widen
      // the interface); the cast is intentional and localized so that
      // providers accepting a tolerance argument (Stripe) can receive it
      // without polluting the shared Provider contract.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      const metadata = (provider!.validate as Function).call(
        provider,
        req,
        secret,
        tolerance
      ) as WebhookMetadata;
      req.webhook = metadata;
      next();
    } catch (err) {
      // D-13: never write res ourselves; delegate to error pipeline.
      next(err);
    }
  };
}
