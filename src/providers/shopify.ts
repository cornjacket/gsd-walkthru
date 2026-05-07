// Shopify provider stub (Phase 3, fills in Phase 5).
//
// D-09: ShopifyWebhook branch type co-located here per D-10.
// D-03: side-effect registration at top level.
//
// Phase 5 will populate validate() with real X-Shopify-Hmac-Sha256
// (base64-decoded — SHOP-01) verification + X-Shopify-Topic and
// X-Shopify-Webhook-Id → req.webhook.{topic,webhookId} mapping
// (SHOP-02).
import { registerProvider } from './registry.js';
import type { Provider } from './types.js';

export type ShopifyWebhook = {
  provider: 'shopify';
  eventId: string;
  timestamp: number;
  parsed: Record<string, unknown>;
  topic: string;
  webhookId: string;
};

const shopifyProvider: Provider = {
  name: 'shopify',
  validate(_req, _secret) {
    // Phase 5 fills this in.
    throw new Error('Shopify provider not yet implemented (Phase 5)');
  },
};

registerProvider('shopify', shopifyProvider);
