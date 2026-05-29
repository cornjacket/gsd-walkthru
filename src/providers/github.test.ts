import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { WebhookValidationError } from '../errors.js';
import { githubProvider } from './github.js';

// Sample sensitive material for leakage assertions
const SAMPLE_SECRET = 'whsec_github_test_secret_do_not_leak';
const SAMPLE_BODY = '{"action":"opened","number":1,"repository":{"id":42}}';
const SAMPLE_DELIVERY = '01234567-89ab-cdef-0123-456789abcdef';

/**
 * Build a correct X-Hub-Signature-256 header value for the given body/secret.
 * Mirrors the EXACT HMAC input githubProvider.validate() computes:
 * the rawBody Buffer DIRECTLY (no timestamp prefix, no .toString('utf8') — D-07).
 *
 * NOTE: tests use node:crypto's createHmac directly (NOT the library's
 * computeHmac) so the test is not tautological with the implementation.
 */
function makeSignature(body: string | Buffer, secret: string): string {
  const sig = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${sig}`;
}

/**
 * Build a minimal Express Request fixture for testing.
 * - When `opts.signature` is undefined, the 'x-hub-signature-256' header is omitted.
 * - When `opts.delivery` is undefined, the 'x-github-delivery' header is omitted.
 * - When `opts.extraHeaders` is provided (e.g., for D-02 dual-header test),
 *   those headers are merged in AFTER signature/delivery so the test can add
 *   the deprecated x-hub-signature for D-02.
 */
function makeReq(opts: {
  body?: string;
  rawBody?: Buffer | undefined;
  signature?: string | string[] | undefined;
  delivery?: string | string[] | undefined;
  extraHeaders?: Record<string, string | string[]>;
}): unknown {
  const body = opts.body ?? SAMPLE_BODY;
  const headers: Record<string, string | string[]> = {};
  if (opts.signature !== undefined) headers['x-hub-signature-256'] = opts.signature;
  if (opts.delivery !== undefined) headers['x-github-delivery'] = opts.delivery;
  if (opts.extraHeaders) Object.assign(headers, opts.extraHeaders);
  return {
    rawBody: opts.rawBody !== undefined ? opts.rawBody : Buffer.from(body),
    headers,
  };
}

describe('githubProvider.validate()', () => {
  // ── SC1, SC2, SC5 happy-path + D-11/D-12 binding ─────────────────────────

  it('happy path: valid signature and matching rawBody returns GitHubWebhook with eventId === deliveryId', () => {
    const sig = makeSignature(SAMPLE_BODY, SAMPLE_SECRET);
    const req = makeReq({ signature: sig, delivery: SAMPLE_DELIVERY });
    const before = Math.floor(Date.now() / 1000);
    const result = githubProvider.validate(req as any, SAMPLE_SECRET);
    const after = Math.floor(Date.now() / 1000);
    expect(result.provider).toBe('github');
    expect(result.eventId).toBe(SAMPLE_DELIVERY); // D-11
    expect((result as any).deliveryId).toBe(SAMPLE_DELIVERY); // GHUB-03 / SC2
    expect(result.parsed).toMatchObject({ action: 'opened', number: 1 });
    // D-12 — receipt timestamp at validation time
    expect(result.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.timestamp).toBeLessThanOrEqual(after);
  });

  it('both x-hub-signature-256 and x-hub-signature present → SHA-256 validates normally (D-02)', () => {
    const sig = makeSignature(SAMPLE_BODY, SAMPLE_SECRET);
    const req = makeReq({
      signature: sig,
      delivery: SAMPLE_DELIVERY,
      extraHeaders: { 'x-hub-signature': 'sha1=deadbeefcafe' },
    });
    const result = githubProvider.validate(req as any, SAMPLE_SECRET);
    expect(result.provider).toBe('github');
    expect((result as any).deliveryId).toBe(SAMPLE_DELIVERY);
  });

  // ── SC1 negative: tampered body ──────────────────────────────────────────

  it('tampered body throws signature_mismatch', () => {
    const sig = makeSignature(SAMPLE_BODY, SAMPLE_SECRET);
    const tampered = Buffer.from(SAMPLE_BODY.replace('opened', 'XXXXXX'));
    const req = makeReq({ rawBody: tampered, signature: sig, delivery: SAMPLE_DELIVERY });
    expect(() => githubProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      githubProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('signature_mismatch');
      expect((err as WebhookValidationError).statusCode).toBe(401);
    }
  });

  // ── SC1 / D-01 / GHUB-02: SHA-1-only request ─────────────────────────────

  it('SHA-1-only request (only x-hub-signature, no -256) throws missing_header (D-01)', () => {
    const req: unknown = {
      rawBody: Buffer.from(SAMPLE_BODY),
      headers: { 'x-hub-signature': 'sha1=deadbeefcafe' },
    };
    expect(() => githubProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      githubProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('missing_header');
      expect((err as WebhookValidationError).statusCode).toBe(401);
    }
  });

  // ── D-03: Header parse failures ──────────────────────────────────────────

  it('bare hex (no sha256= prefix) throws invalid_signature_format (D-03)', () => {
    const bareHex = createHmac('sha256', SAMPLE_SECRET).update(SAMPLE_BODY).digest('hex');
    const req = makeReq({ signature: bareHex, delivery: SAMPLE_DELIVERY });
    expect(() => githubProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      githubProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('invalid_signature_format');
      expect((err as WebhookValidationError).statusCode).toBe(401);
    }
  });

  it('non-hex tail (sha256=zzzz...) throws invalid_signature_format (D-03)', () => {
    const req = makeReq({ signature: 'sha256=' + 'z'.repeat(64), delivery: SAMPLE_DELIVERY });
    expect(() => githubProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      githubProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('invalid_signature_format');
      expect((err as WebhookValidationError).statusCode).toBe(401);
    }
  });

  // ── D-10: Auth header three-way split (corrected from day one) ───────────

  it('missing X-Hub-Signature-256 throws missing_header (D-10)', () => {
    const req = makeReq({ signature: undefined, delivery: SAMPLE_DELIVERY });
    expect(() => githubProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      githubProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('missing_header');
      expect((err as WebhookValidationError).statusCode).toBe(401);
    }
  });

  it('array-shaped X-Hub-Signature-256 throws invalid_signature_format (D-10 day-one fix, NOT missing_header)', () => {
    const sig = makeSignature(SAMPLE_BODY, SAMPLE_SECRET);
    const req = makeReq({ signature: [sig, sig], delivery: SAMPLE_DELIVERY });
    expect(() => githubProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      githubProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      // D-10: Phase 5 splits this from 'missing_header' — Phase 4 stripe.ts:82 has the WR-03 fold
      // defect; Phase 5 ships the fix from day one. Assert the corrected reason explicitly.
      expect((err as WebhookValidationError).reason).toBe('invalid_signature_format');
      expect((err as WebhookValidationError).reason).not.toBe('missing_header');
      expect((err as WebhookValidationError).statusCode).toBe(401);
    }
  });

  it('empty-string X-Hub-Signature-256 throws invalid_signature_format (D-15 P5 WR-01)', () => {
    const req = makeReq({ signature: '', delivery: SAMPLE_DELIVERY });
    expect(() => githubProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      githubProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      // empty string has no sha256= prefix → invalid_signature_format (not missing_header)
      expect((err as WebhookValidationError).reason).toBe('invalid_signature_format');
      expect((err as WebhookValidationError).statusCode).toBe(401);
    }
  });

  // ── P3 D-07 / D-13 step 7: rawBody guards & malformed_payload ────────────

  it('missing rawBody throws malformed_payload with statusCode 400 (P3 D-07)', () => {
    const req: unknown = {
      rawBody: undefined,
      headers: { 'x-hub-signature-256': 'sha256=' + 'a'.repeat(64) },
    };
    expect(() => githubProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      githubProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('malformed_payload');
      expect((err as WebhookValidationError).statusCode).toBe(400);
    }
  });

  it('valid signature on non-JSON body throws malformed_payload (D-13 step 7)', () => {
    const nonJson = 'not-json';
    const sig = makeSignature(nonJson, SAMPLE_SECRET);
    const req = makeReq({
      body: nonJson,
      rawBody: Buffer.from(nonJson),
      signature: sig,
      delivery: SAMPLE_DELIVERY,
    });
    expect(() => githubProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      githubProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      expect((err as WebhookValidationError).reason).toBe('malformed_payload');
      expect((err as WebhookValidationError).statusCode).toBe(400);
    }
  });

  // ── D-08, D-09, D-11: Metadata header behavior ───────────────────────────

  it("missing X-GitHub-Delivery → success with deliveryId === '' and eventId === '' (D-08, D-11)", () => {
    const sig = makeSignature(SAMPLE_BODY, SAMPLE_SECRET);
    const req = makeReq({ signature: sig, delivery: undefined });
    const result = githubProvider.validate(req as any, SAMPLE_SECRET);
    expect((result as any).deliveryId).toBe('');
    expect(result.eventId).toBe('');
    expect(result.provider).toBe('github');
  });

  it('array-shaped X-GitHub-Delivery → deliveryId === firstValue (D-09)', () => {
    const sig = makeSignature(SAMPLE_BODY, SAMPLE_SECRET);
    const req = makeReq({ signature: sig, delivery: ['abc', 'def'] });
    const result = githubProvider.validate(req as any, SAMPLE_SECRET);
    expect((result as any).deliveryId).toBe('abc');
    expect(result.eventId).toBe('abc');
  });

  // ── P3 D-16, P2 D-11: leakage assertion ──────────────────────────────────

  it('error serializations do not contain signature, secret, or body bytes', () => {
    const sig = makeSignature(SAMPLE_BODY, SAMPLE_SECRET);
    const tampered = Buffer.from(SAMPLE_BODY.replace('opened', 'XXXXXX'));
    const req = makeReq({ rawBody: tampered, signature: sig, delivery: SAMPLE_DELIVERY });
    // D-14 outer-guard: avoids WR-02 vacuous-pass if validate() ever silently
    // returns instead of throwing — the leakage try/catch below would no-op in
    // that case. Outer toThrow guarantees the throw actually happened.
    expect(() => githubProvider.validate(req as any, SAMPLE_SECRET)).toThrow(
      WebhookValidationError
    );
    try {
      githubProvider.validate(req as any, SAMPLE_SECRET);
    } catch (err) {
      const json = JSON.stringify(err);
      const str = String(err);
      expect(json).not.toContain(SAMPLE_SECRET);
      // D-15 P5 WR-02: assert against the actual tampered bytes sent ('XXXXXX'),
      // NOT against SAMPLE_BODY (which the tampered buffer doesn't equal — was trivially true).
      expect(json).not.toContain('XXXXXX');
      expect(str).not.toContain(SAMPLE_SECRET);
      // D-16: defense-in-depth leakage assertion for future-refactor protection.
      expect(str).not.toContain('XXXXXX');
    }
  });
});
