// Discriminated reason union for webhook signature validation failures.
// Phase 2 ships exactly the 4 reasons mandated by ROADMAP success criterion 3.
// Each later phase widens this union in the SAME commit that ships the test
// exercising the new reason. Phase 2 D-07 — DO NOT pre-add reasons.
export type WebhookValidationReason =
  | 'signature_mismatch'
  | 'timestamp_too_old'
  | 'missing_header'
  | 'missing_secret';

/**
 * Deterministic message lookup. Consumes only `reason` and `provider`;
 * never includes signature bytes, secret bytes, or body content.
 *
 * Phase 2 D-06: caller cannot override the message — that closes the
 * historical leak vector where developers inadvertently put secrets into
 * a `message` string. Phase 2 D-13: result must contain the provider name.
 */
function messageFor(reason: WebhookValidationReason, provider: string): string {
  // Convention: `<provider> webhook <human-readable reason>`.
  // Deterministic, contains the provider name, no inputs beyond reason/provider.
  const humanReason = reason.replace(/_/g, ' ');
  return `${provider} webhook ${humanReason}`;
}

/**
 * Discriminated webhook validation error. Throw this from provider modules
 * when signature verification (or its preconditions) fails.
 *
 * Constructor signature is locked (Phase 2 D-05): only `{ reason, provider,
 * statusCode }`. NO `message` parameter (auto-derived per D-06). NO `cause`
 * parameter (D-11 structural leakage prevention). NO `details` parameter
 * (D-11). If a future need emerges for wrapping a downstream error,
 * revisit with a test that proves the wrapped error does not leak through
 * `toJSON`.
 *
 * Leakage stance is structural: because no field exists for sensitive
 * data, there is no path for signature/secret/body content to enter the
 * instance. `toJSON()` whitelists the safe fields; `toString()` falls
 * through to `Error.prototype.toString`.
 */
export class WebhookValidationError extends Error {
  public readonly reason: WebhookValidationReason;
  public readonly provider: string;
  public readonly statusCode: number;

  constructor(opts: {
    reason: WebhookValidationReason;
    provider: string;
    statusCode: number;
  }) {
    super(messageFor(opts.reason, opts.provider));
    this.name = 'WebhookValidationError';
    this.reason = opts.reason;
    this.provider = opts.provider;
    this.statusCode = opts.statusCode;
  }

  // Whitelist serialization. Defense-in-depth re-statement of the
  // structural guarantee from D-11: even if a future maintainer adds a
  // private field, this method enumerates exactly what may be serialized.
  toJSON(): {
    name: string;
    reason: WebhookValidationReason;
    provider: string;
    statusCode: number;
    message: string;
  } {
    return {
      name: this.name,
      reason: this.reason,
      provider: this.provider,
      statusCode: this.statusCode,
      message: this.message,
    };
  }
}
