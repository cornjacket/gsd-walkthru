// GitHub provider stub (Phase 3, fills in Phase 5).
//
// D-09: GitHubWebhook branch type co-located here per D-10.
// D-03: side-effect registration at top level.
//
// Phase 5 will populate validate() with real X-Hub-Signature-256
// verification + X-GitHub-Delivery → req.webhook.deliveryId mapping
// (REQUIREMENTS.md GHUB-03).
import { registerProvider } from './registry.js';
import type { Provider } from './types.js';

export type GitHubWebhook = {
  provider: 'github';
  eventId: string;
  timestamp: number;
  parsed: Record<string, unknown>;
  deliveryId: string;
};

const githubProvider: Provider = {
  name: 'github',
  validate(_req, _secret) {
    // Phase 5 fills this in.
    throw new Error('GitHub provider not yet implemented (Phase 5)');
  },
};

registerProvider('github', githubProvider);
