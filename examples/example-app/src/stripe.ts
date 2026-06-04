// D-09: Signs independently using Node crypto.createHmac — NOT library's computeHmac.
// If computeHmac had a bug, both sender and validator would fail/pass together; this
// independent implementation proves they agree on the signing rule.
import { createHmac } from 'node:crypto';
import http from 'node:http';

function signStripePayload(body: string, secret: string, timestamp: number): string {
  const signedPayload = `${timestamp}.${body}`;
  const digest = createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

export async function fireStripeRequest(host: string, port: number): Promise<void> {
  const payload = JSON.stringify({
    id: 'evt_example_stripe_1234',
    type: 'charge.succeeded',
    created: Math.floor(Date.now() / 1000),
    data: { object: { amount: 2000, currency: 'usd' } },
  });

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signStripePayload(payload, 'test_stripe_secret', timestamp);

  return new Promise((resolve, reject) => {
    const bodyBytes = Buffer.from(payload, 'utf8');
    const options: http.RequestOptions = {
      hostname: host,
      port,
      path: '/webhooks/stripe',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': signature,
        'Content-Length': bodyBytes.length,
      },
    };

    const req = http.request(options, (res) => {
      res.resume(); // drain response body
      if (res.statusCode === 200) {
        resolve();
      } else {
        reject(new Error(`Stripe request returned HTTP ${res.statusCode}`));
      }
    });

    req.on('error', reject);
    req.write(bodyBytes);
    req.end();
  });
}
