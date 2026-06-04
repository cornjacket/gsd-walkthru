/**
 * express-webhook-validator — Example App
 *
 * Demonstrates all three providers (Stripe, GitHub, Shopify) end-to-end.
 * Run: npm start  (from examples/example-app/ — builds TypeScript then runs)
 *
 * What happens:
 * 1. Express server starts on PORT 3000
 * 2. Three mock webhook requests are fired in parallel (one per provider)
 * 3. Each request is signed with independent Node crypto (not the library's computeHmac)
 * 4. The middleware validates the signature and sets req.webhook
 * 5. Each handler prints req.webhook to stdout
 * 6. After all three succeed, the process exits 0
 */
import express from 'express';
import {
  createWebhookMiddleware,
  rawBodyCapture,
  webhookErrorHandler,
} from 'express-webhook-validator';
import { fireStripeRequest } from './stripe.js';
import { fireGitHubRequest } from './github.js';
import { fireShopifyRequest } from './shopify.js';

const app = express();
const PORT = 3000;

// ---------------------------------------------------------------------------
// Stripe webhook route
// rawBodyCapture() MUST come before createWebhookMiddleware() — it captures the
// raw bytes the HMAC was computed over, before any JSON parsing discards them.
// ---------------------------------------------------------------------------
app.post(
  '/webhooks/stripe',
  rawBodyCapture(),
  createWebhookMiddleware('stripe', {
    secret: 'test_stripe_secret',
    tolerance: 300,
  }),
  (req, res) => {
    if (req.webhook?.provider === 'stripe') {
      console.log('[stripe] validated req.webhook:', {
        provider: req.webhook.provider,
        eventId: req.webhook.eventId,
        timestamp: req.webhook.timestamp,
        parsed: req.webhook.parsed,
      });
    }
    res.sendStatus(200);
  }
);

// ---------------------------------------------------------------------------
// GitHub webhook route
// No signed timestamp — replay defense requires consumer dedup on deliveryId.
// ---------------------------------------------------------------------------
app.post(
  '/webhooks/github',
  rawBodyCapture(),
  createWebhookMiddleware('github', {
    secret: 'test_github_secret',
  }),
  (req, res) => {
    if (req.webhook?.provider === 'github') {
      console.log('[github] validated req.webhook:', {
        provider: req.webhook.provider,
        deliveryId: req.webhook.deliveryId,
        eventId: req.webhook.eventId,
        timestamp: req.webhook.timestamp,
        parsed: req.webhook.parsed,
      });
    }
    res.sendStatus(200);
  }
);

// ---------------------------------------------------------------------------
// Shopify webhook route
// No signed timestamp — replay defense requires consumer dedup on webhookId.
// Digest is base64-encoded (not hex) — see src/shopify.ts for the signing rule.
// ---------------------------------------------------------------------------
app.post(
  '/webhooks/shopify',
  rawBodyCapture(),
  createWebhookMiddleware('shopify', {
    secret: 'test_shopify_secret',
  }),
  (req, res) => {
    if (req.webhook?.provider === 'shopify') {
      console.log('[shopify] validated req.webhook:', {
        provider: req.webhook.provider,
        topic: req.webhook.topic,
        webhookId: req.webhook.webhookId,
        eventId: req.webhook.eventId,
        timestamp: req.webhook.timestamp,
        parsed: req.webhook.parsed,
      });
    }
    res.sendStatus(200);
  }
);

// ---------------------------------------------------------------------------
// Error handler — catches WebhookValidationError from middleware, responds with
// { error, reason } JSON at the appropriate status. Other errors pass through.
// ---------------------------------------------------------------------------
app.use(webhookErrorHandler());

// ---------------------------------------------------------------------------
// Start server, fire all three mock requests in parallel, then exit
// ---------------------------------------------------------------------------
const server = app.listen(PORT, async () => {
  console.log(`Example app listening on http://localhost:${PORT}`);
  console.log('Firing three mock webhook requests...\n');

  try {
    await Promise.all([
      fireStripeRequest('localhost', PORT),
      fireGitHubRequest('localhost', PORT),
      fireShopifyRequest('localhost', PORT),
    ]);

    console.log('\nAll three mock webhooks validated successfully.');
    console.log('Each provider signed with independent Node crypto (D-09).');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('\nMock webhook failed:', err);
    server.close();
    process.exit(1);
  }
});
