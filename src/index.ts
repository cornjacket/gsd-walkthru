// express-webhook-validator
// Phase 3 surface: crypto primitives, discriminated error class,
// middleware factory, raw-body capture, per-provider types, opt-in
// error handler, and side-effect provider registration (D-03, D-19).

export const VERSION = '1.0.0';

export { timingSafeCompare } from './crypto/compare.js';
export { computeHmac } from './crypto/hmac.js';
export { webhookErrorHandler } from './error-handler.js';
export { WebhookValidationError, type WebhookValidationReason } from './errors.js';
export { createWebhookMiddleware } from './middleware.js';
export type { GitHubWebhook } from './providers/github.js';
export type { ShopifyWebhook } from './providers/shopify.js';
export type { StripeWebhook } from './providers/stripe.js';
export { type RawBodyOptions, rawBodyCapture } from './raw-body/middleware.js';
export { captureRawBody } from './raw-body/verify.js';
export type { WebhookMetadata } from './types.js';

// D-03 / D-19: side-effect imports register all three providers transparently
// when any consumer imports anything from `express-webhook-validator`.
// Order is alphabetical by source path (Biome `organizeImports: "on"`).
import './providers/github.js';
import './providers/shopify.js';
import './providers/stripe.js';
