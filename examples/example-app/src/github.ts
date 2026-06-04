// D-09: Independent Node crypto — NOT library's computeHmac.
import { createHmac } from 'node:crypto';
import http from 'node:http';

function signGitHubPayload(body: string, secret: string): string {
  const digest = createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return `sha256=${digest}`;
}

export async function fireGitHubRequest(host: string, port: number): Promise<void> {
  const deliveryId = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff';
  const payload = JSON.stringify({
    action: 'opened',
    number: 42,
    repository: { id: 123456, name: 'example-repo', full_name: 'org/example-repo' },
    sender: { login: 'octocat', id: 1 },
  });

  const signature = signGitHubPayload(payload, 'test_github_secret');

  return new Promise((resolve, reject) => {
    const bodyBytes = Buffer.from(payload, 'utf8');
    const options: http.RequestOptions = {
      hostname: host,
      port,
      path: '/webhooks/github',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': signature,
        'X-GitHub-Delivery': deliveryId,
        'Content-Length': bodyBytes.length,
      },
    };

    const req = http.request(options, (res) => {
      res.resume();
      if (res.statusCode === 200) {
        resolve();
      } else {
        reject(new Error(`GitHub request returned HTTP ${res.statusCode}`));
      }
    });

    req.on('error', reject);
    req.write(bodyBytes);
    req.end();
  });
}
