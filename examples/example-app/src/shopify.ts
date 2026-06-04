// D-09: Independent Node crypto — NOT library's computeHmac.
// CRITICAL: Shopify uses base64 digest encoding — NOT hex.
// Using .digest('hex') here would produce a valid-length base64 string when
// base64-decoded by the validator, but the decoded bytes won't match, causing
// 'signature_mismatch'. This is the single most common Shopify integration footgun.
import { createHmac } from 'node:crypto';
import http from 'node:http';

function signShopifyPayload(body: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(body)
    .digest('base64'); // base64 — NOT 'hex'
}

export async function fireShopifyRequest(host: string, port: number): Promise<void> {
  const topic = 'orders/create';
  const webhookId = 'ddddeeee-ffff-0000-1111-222233334444';
  const payload = JSON.stringify({
    id: 9999,
    email: 'buyer@example.com',
    line_items: [{ title: 'Widget', price: '9.99', quantity: 1 }],
  });

  const signature = signShopifyPayload(payload, 'test_shopify_secret');

  return new Promise((resolve, reject) => {
    const bodyBytes = Buffer.from(payload, 'utf8');
    const options: http.RequestOptions = {
      hostname: host,
      port,
      path: '/webhooks/shopify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Hmac-Sha256': signature,
        'X-Shopify-Topic': topic,
        'X-Shopify-Webhook-Id': webhookId,
        'Content-Length': bodyBytes.length,
      },
    };

    const req = http.request(options, (res) => {
      res.resume();
      if (res.statusCode === 200) {
        resolve();
      } else {
        reject(new Error(`Shopify request returned HTTP ${res.statusCode}`));
      }
    });

    req.on('error', reject);
    req.write(bodyBytes);
    req.end();
  });
}
