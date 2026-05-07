// Stripe provider — real HMAC-SHA256 signature validator (Phase 4).
//
// D-09: StripeWebhook branch type co-located here per D-10.
// D-03: side-effect registration at top level — when `src/index.ts`
// imports this module, the registerProvider call runs and 'stripe'
// becomes a known provider name.
//
// Implementation follows D-08 step order:
//   1. rawBody guard      → 'malformed_payload' (400)
//   2. header guard       → 'missing_header' (401)
//   3. parse header       → 'invalid_signature_format' (401)
//   4. compute HMAC       → Buffer digest
//   5. compare segments   → 'signature_mismatch' (401) if no match
//   6. timestamp check    → 'timestamp_too_old' (401) if age > tolerance
//   7. JSON.parse body    → 'malformed_payload' (400) if parse fails
//   8. build StripeWebhook
import type { Request } from 'express';
import { computeHmac } from '../crypto/hmac.js';
import { timingSafeCompare } from '../crypto/compare.js';
import { WebhookValidationError } from '../errors.js';
import { registerProvider } from './registry.js';
import type { Provider } from './types.js';

export type StripeWebhook = {
  provider: 'stripe';
  eventId: string;
  timestamp: number;
  // WR-05: typed as `unknown` (not `Record<string, unknown>`) because the
  // library does not own the JSON parse and cannot guarantee the top-level
  // shape (object vs. array vs. primitive). Consumers must narrow before
  // accessing keys.
  parsed: unknown;
  replayWindowMs: number;
};

/**
 * Parse a Stripe-Signature header into its timestamp and v1= segments.
 *
 * Returns `{ timestamp, v1Segments }` when at least one parseable `t=` and
 * one valid hex `v1=` segment are found; returns `null` otherwise.
 *
 * D-07: silently ignores `v0=`, `v2=`, and all other non-v1 schemes.
 * D-07: requires at least one `v1=` segment to return non-null.
 */
function parseStripeSignature(
  header: string
): { timestamp: number; v1Segments: string[] } | null {
  let timestamp: number | undefined;
  const v1Segments: string[] = [];
  for (const pair of header.split(',')) {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) continue;
    const key = pair.substring(0, eqIndex);
    const value = pair.substring(eqIndex + 1);
    if (key === 't') {
      const ts = parseInt(value, 10);
      if (!isNaN(ts)) timestamp = ts;
    } else if (key === 'v1') {
      if (value && /^[0-9a-f]+$/.test(value)) {
        v1Segments.push(value);
      }
    }
    // Silently ignore v0, v2, and any other non-v1 schemes (D-07)
  }
  return timestamp !== undefined && v1Segments.length > 0 ? { timestamp, v1Segments } : null;
}

export const stripeProvider: Provider = {
  name: 'stripe',
  validate(req: Request, secret: string, toleranceSeconds = 300): StripeWebhook {
    // Step 1 — rawBody guard (D-08 step 1, Phase 3 D-07)
    if (!req.rawBody) {
      throw new WebhookValidationError({
        reason: 'malformed_payload',
        provider: 'stripe',
        statusCode: 400,
      });
    }

    // Step 2 — Missing header check (D-04)
    const header = req.headers['stripe-signature'];
    if (!header || typeof header !== 'string') {
      throw new WebhookValidationError({
        reason: 'missing_header',
        provider: 'stripe',
        statusCode: 401,
      });
    }

    // Step 3 — Parse header (D-04, D-07)
    const sig = parseStripeSignature(header);
    if (sig === null) {
      throw new WebhookValidationError({
        reason: 'invalid_signature_format',
        provider: 'stripe',
        statusCode: 401,
      });
    }

    // Step 4 — Compute HMAC over `${timestamp}.${rawBody.toString('utf8')}` (D-10)
    const { timestamp, v1Segments } = sig;
    const signedPayload = `${timestamp}.${req.rawBody.toString('utf8')}`;
    const computed = computeHmac(signedPayload, secret, 'sha256');

    // Step 5 — Constant-time compare against ALL v1= segments (Pitfall 2 — no early break)
    let signatureMatched = false;
    for (const hexSegment of v1Segments) {
      const segmentBuf = Buffer.from(hexSegment, 'hex');
      if (timingSafeCompare(computed, segmentBuf)) {
        signatureMatched = true;
        // Continue loop — do NOT break; avoid timing leaks on rotation
      }
    }
    if (!signatureMatched) {
      throw new WebhookValidationError({
        reason: 'signature_mismatch',
        provider: 'stripe',
        statusCode: 401,
      });
    }

    // Step 6 — Timestamp tolerance check (past-only per D-01)
    const nowSeconds = Date.now() / 1000;
    const age = nowSeconds - timestamp;
    if (age > toleranceSeconds) {
      throw new WebhookValidationError({
        reason: 'timestamp_too_old',
        provider: 'stripe',
        statusCode: 401,
      });
    }
    // Note: age < 0 (future timestamp) PASSES — past-only direction

    // Step 7 — JSON.parse rawBody after signature passes (D-08 step 7)
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(req.rawBody.toString('utf8'));
    } catch {
      throw new WebhookValidationError({
        reason: 'malformed_payload',
        provider: 'stripe',
        statusCode: 400,
      });
    }

    // Step 8 — Populate eventId with leniency (D-09: missing/non-string id → '')
    const eventId =
      typeof parsedBody === 'object' &&
      parsedBody !== null &&
      'id' in parsedBody &&
      typeof (parsedBody as Record<string, unknown>).id === 'string'
        ? ((parsedBody as Record<string, unknown>).id as string)
        : '';

    // Step 9 — Return StripeWebhook with replayWindowMs (D-03)
    return {
      provider: 'stripe',
      eventId,
      timestamp,
      parsed: parsedBody,
      replayWindowMs: toleranceSeconds * 1000,
    };
  },
};

registerProvider('stripe', stripeProvider);
