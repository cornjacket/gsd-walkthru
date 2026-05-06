import { createHmac } from 'node:crypto';

/**
 * Compute an HMAC digest for a webhook body. Returns raw digest bytes (Buffer).
 * Encoding-neutral by design: each provider converts at its own boundary
 * (Stripe→hex, GitHub→hex, Shopify→base64). Phase 2 D-01.
 *
 * @param rawBody - Raw request bytes. Buffer is preferred (matches what arrives
 *                  on the wire); string is accepted for ergonomics in tests and
 *                  callers that already have UTF-8 text.
 * @param secret  - The webhook signing secret.
 * @param algorithm - Locked to 'sha256' for v1 (D-02). All three v1 providers
 *                    use SHA-256; widen the literal only when a future provider
 *                    needs SHA-512.
 */
export function computeHmac(rawBody: Buffer | string, secret: string, algorithm: 'sha256'): Buffer {
  return createHmac(algorithm, secret).update(rawBody).digest();
}
