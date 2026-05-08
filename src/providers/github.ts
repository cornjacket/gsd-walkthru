// GitHub provider — real HMAC-SHA256 signature validator (Phase 5).
//
// D-09: GitHubWebhook branch type co-located here per D-10.
// D-03: side-effect registration at top level — when src/index.ts
// imports this module, the registerProvider call runs and 'github'
// becomes a known provider name.
//
// Implementation follows D-13 step order:
//   1. rawBody guard      → 'malformed_payload' (400)
//   2. header guard       → 'missing_header' (undefined) / 'invalid_signature_format' (array) — D-10
//   3. parse header       → strip 'sha256=' prefix; validate hex tail → 'invalid_signature_format' (D-03)
//   4. compute HMAC       → computeHmac(req.rawBody, secret, 'sha256') Buffer-direct (D-07)
//   5. compare bytes      → Buffer.from(headerHex, 'hex') vs computed → 'signature_mismatch' (D-04)
//   6. read metadata      → X-GitHub-Delivery; missing → ''; array → [0] || '' (D-08, D-09)
//   7. JSON.parse body    → 'malformed_payload' (400) if parse fails (D-13 step 7)
//   8. build GitHubWebhook with eventId === deliveryId (D-11), timestamp = floor(Date.now()/1000) (D-12)
//
// D-01 / D-02 / GHUB-02: validator looks ONLY at x-hub-signature-256.
// The deprecated SHA-1 header (the one without the -256 suffix) is invisible —
// never read for any purpose. SHA-1-only request → 'missing_header' (D-01).
import type { Request } from 'express';
import { computeHmac } from '../crypto/hmac.js';
import { timingSafeCompare } from '../crypto/compare.js';
import { WebhookValidationError } from '../errors.js';
import { registerProvider } from './registry.js';
import type { Provider } from './types.js';

export type GitHubWebhook = {
  provider: 'github';
  eventId: string;
  timestamp: number;
  // WR-05: typed as `unknown` (not `Record<string, unknown>`) because the
  // library does not own the JSON parse and cannot guarantee the top-level
  // shape (object vs. array vs. primitive). Consumers must narrow before
  // accessing keys.
  parsed: unknown;
  deliveryId: string;
};

export const githubProvider: Provider = {
  name: 'github',
  // IN-04 carry-over: accept the 3rd positional arg, ignore it. The middleware
  // factory passes tolerance to all providers via positional cast (P4 IN-02);
  // GitHub has no provider-signed timestamp, so silently swallow.
  validate(req: Request, secret: string, _toleranceSeconds?: number): GitHubWebhook {
    // Step 1 — rawBody guard (D-13 step 1, P3 D-07)
    if (!req.rawBody) {
      throw new WebhookValidationError({
        reason: 'malformed_payload',
        provider: 'github',
        statusCode: 400,
      });
    }

    // Step 2 — Auth header three-way split (D-10 corrected from day one).
    // Phase 4 stripe.ts:82 folds `(undefined | array)` into 'missing_header' (WR-03 defect);
    // Phase 5 ships the corrected split.
    const header = req.headers['x-hub-signature-256'];
    if (header === undefined) {
      throw new WebhookValidationError({
        reason: 'missing_header',
        provider: 'github',
        statusCode: 401,
      });
    }
    if (typeof header !== 'string') {
      // Array-shaped (RFC 7230 duplicate header).
      throw new WebhookValidationError({
        reason: 'invalid_signature_format',
        provider: 'github',
        statusCode: 401,
      });
    }

    // Step 3 — Parse 'sha256=' prefix; validate hex tail (D-03).
    const PREFIX = 'sha256=';
    if (!header.startsWith(PREFIX)) {
      throw new WebhookValidationError({
        reason: 'invalid_signature_format',
        provider: 'github',
        statusCode: 401,
      });
    }
    const headerHex = header.slice(PREFIX.length);
    if (headerHex.length === 0 || !/^[0-9a-fA-F]+$/.test(headerHex)) {
      throw new WebhookValidationError({
        reason: 'invalid_signature_format',
        provider: 'github',
        statusCode: 401,
      });
    }

    // Step 4 — Compute HMAC over req.rawBody Buffer DIRECTLY (D-07).
    // No .toString('utf8') round-trip; no prefix string. computeHmac accepts Buffer | string
    // (src/crypto/hmac.ts:16) and returns 32-byte raw Buffer.
    const computed = computeHmac(req.rawBody, secret, 'sha256');

    // Step 5 — Constant-time compare via timingSafeCompare (D-04).
    // Buffer.from(hex, 'hex') is case-insensitive; length-mismatch returns false (P2 D-09).
    const headerBuf = Buffer.from(headerHex, 'hex');
    if (!timingSafeCompare(computed, headerBuf)) {
      throw new WebhookValidationError({
        reason: 'signature_mismatch',
        provider: 'github',
        statusCode: 401,
      });
    }

    // Step 6 — Read X-GitHub-Delivery metadata (D-08 missing→''; D-09 array→[0]||'').
    // Auth has passed; this is post-auth metadata. The validator's job is auth, not
    // contract-policing of vendor metadata.
    const deliveryRaw = req.headers['x-github-delivery'];
    const deliveryId =
      Array.isArray(deliveryRaw)
        ? (deliveryRaw[0] || '')
        : (typeof deliveryRaw === 'string' ? deliveryRaw : '');

    // Step 7 — JSON.parse rawBody after signature passes (D-13 step 7).
    // Defense against parser-level DoS on attacker-controlled input — only authenticated
    // bytes reach JSON.parse.
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(req.rawBody.toString('utf8'));
    } catch {
      throw new WebhookValidationError({
        reason: 'malformed_payload',
        provider: 'github',
        statusCode: 400,
      });
    }

    // Step 8 — Build GitHubWebhook (D-11: eventId === deliveryId; D-12: receipt timestamp).
    return {
      provider: 'github',
      eventId: deliveryId,                          // D-11
      timestamp: Math.floor(Date.now() / 1000),     // D-12 — receipt time, not provider-signed
      parsed: parsedBody,
      deliveryId,
    };
  },
};

registerProvider('github', githubProvider);
