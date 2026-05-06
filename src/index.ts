// express-webhook-validator
// Phase 2 surface: crypto primitives + discriminated error class.
// Phases 3-5 will add the middleware factory and per-provider modules.

export const VERSION = '0.0.1';

export { timingSafeCompare } from './crypto/compare.js';
export { computeHmac } from './crypto/hmac.js';
export { WebhookValidationError, type WebhookValidationReason } from './errors.js';
