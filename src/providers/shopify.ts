// Shopify provider — real HMAC-SHA256 signature validator (Phase 5).
//
// D-09: ShopifyWebhook branch type co-located here per D-10.
// D-03: side-effect registration at top level — when src/index.ts imports
// this module, the registerProvider call runs and 'shopify' becomes a
// known provider name.
//
// Implementation follows D-13 step order:
//   1. rawBody guard      → 'malformed_payload' (400)
//   2. header guard       → 'missing_header' (undefined) / 'invalid_signature_format' (array) — D-10
//   3. (no parse step — Shopify header is bare base64 digest, no prefix)
//   4. compute HMAC       → Buffer-direct over req.rawBody (D-07) — see step 4 below
//   5. compare bytes      → Buffer.from(headerValue, 'base64') vs computed
//                            (D-06 loose decode; D-05 hex-in-base64 falls through here as
//                             length-mismatch via P2 D-09 → 'signature_mismatch')
//   6. read metadata      → X-Shopify-Topic + X-Shopify-Webhook-Id; missing → ''; array → [0] || '' (D-08, D-09)
//   7. JSON.parse body    → 'malformed_payload' (400) if parse fails
//   8. build ShopifyWebhook with eventId === webhookId (D-11), timestamp = floor(Date.now()/1000) (D-12)
import type { Request } from 'express';
import { computeHmac } from '../crypto/hmac.js';
import { timingSafeCompare } from '../crypto/compare.js';
import { WebhookValidationError } from '../errors.js';
import { registerProvider } from './registry.js';
import type { Provider } from './types.js';

export type ShopifyWebhook = {
  provider: 'shopify';
  eventId: string;
  timestamp: number;
  // WR-05: typed as `unknown` (not `Record<string, unknown>`) because the
  // library does not own the JSON parse and cannot guarantee the top-level
  // shape (object vs. array vs. primitive). Consumers must narrow before
  // accessing keys.
  parsed: unknown;
  topic: string;
  webhookId: string;
};

export const shopifyProvider: Provider = {
  name: 'shopify',
  // IN-04 carry-over: accept the 3rd positional arg, ignore it. Shopify has no
  // provider-signed timestamp.
  validate(req: Request, secret: string, _toleranceSeconds?: number): ShopifyWebhook {
    // Step 1 — rawBody guard (D-13 step 1, P3 D-07)
    if (!req.rawBody) {
      throw new WebhookValidationError({
        reason: 'malformed_payload',
        provider: 'shopify',
        statusCode: 400,
      });
    }

    // Step 2 — Auth header three-way split (D-10 corrected from day one).
    // Phase 4 stripe.ts:82 folds (undefined | array) into 'missing_header' (WR-03 defect);
    // Phase 5 ships the corrected split.
    const header = req.headers['x-shopify-hmac-sha256'];
    if (header === undefined) {
      throw new WebhookValidationError({
        reason: 'missing_header',
        provider: 'shopify',
        statusCode: 401,
      });
    }
    if (typeof header !== 'string') {
      // Array-shaped (RFC 7230 duplicate header).
      throw new WebhookValidationError({
        reason: 'invalid_signature_format',
        provider: 'shopify',
        statusCode: 401,
      });
    }

    // Step 3 — NO parse step. Shopify's header value is the BARE base64 digest
    // with no prefix. Any pre-check on alphabet or length is intentionally
    // omitted (D-06 loose decode). The byte-compare gates the actual auth.

    // Step 4 — Compute HMAC over req.rawBody Buffer DIRECTLY (D-07).
    // No .toString('utf8') round-trip; no prefix string. computeHmac accepts
    // Buffer | string (src/crypto/hmac.ts:16) and returns 32-byte raw Buffer.
    const computed = computeHmac(req.rawBody, secret, 'sha256');

    // Step 5 — Constant-time compare via timingSafeCompare (D-04, D-06).
    // D-05: hex-string-in-base64-header decodes to wrong-length buffer
    // (~48 bytes from 64 hex chars vs 32-byte computed). timingSafeCompare
    // returns false on length mismatch (P2 D-09) → throws 'signature_mismatch'.
    // NO union widening for an encoding-confusion reason — D-05 explicitly rejects it.
    const headerBuf = Buffer.from(header, 'base64');
    if (!timingSafeCompare(computed, headerBuf)) {
      throw new WebhookValidationError({
        reason: 'signature_mismatch',
        provider: 'shopify',
        statusCode: 401,
      });
    }

    // Step 6 — Read X-Shopify-Topic + X-Shopify-Webhook-Id metadata
    // (D-08 missing→''; D-09 array→[0]||''). Auth has passed; this is post-auth metadata.
    const topicRaw = req.headers['x-shopify-topic'];
    const topic =
      Array.isArray(topicRaw)
        ? (topicRaw[0] || '')
        : (typeof topicRaw === 'string' ? topicRaw : '');

    const webhookIdRaw = req.headers['x-shopify-webhook-id'];
    const webhookId =
      Array.isArray(webhookIdRaw)
        ? (webhookIdRaw[0] || '')
        : (typeof webhookIdRaw === 'string' ? webhookIdRaw : '');

    // Step 7 — JSON.parse rawBody after signature passes (D-13 step 7).
    // Defense against parser-level DoS on attacker-controlled input — only
    // authenticated bytes reach JSON.parse.
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(req.rawBody.toString('utf8'));
    } catch {
      throw new WebhookValidationError({
        reason: 'malformed_payload',
        provider: 'shopify',
        statusCode: 400,
      });
    }

    // Step 8 — Build ShopifyWebhook (D-11: eventId === webhookId; D-12: receipt timestamp).
    return {
      provider: 'shopify',
      eventId: webhookId,                            // D-11
      timestamp: Math.floor(Date.now() / 1000),      // D-12 — receipt time, not provider-signed
      parsed: parsedBody,
      topic,
      webhookId,
    };
  },
};

registerProvider('shopify', shopifyProvider);
