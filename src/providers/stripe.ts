// Stripe provider stub (Phase 3, fills in Phase 4).
//
// D-09: StripeWebhook branch type co-located here per D-10.
// D-03: side-effect registration at top level — when `src/index.ts`
// (Plan 07) imports this module, the registerProvider call runs and
// 'stripe' becomes a known provider name.
//
// Phase 4 will populate validate() with real signature-checking
// logic; Phase 3 ships a throwing stub so the registry has the entry
// but Phase 3 tests register a fake (D-22) instead of invoking this stub.
import { registerProvider } from './registry.js';
import type { Provider } from './types.js';

export type StripeWebhook = {
  provider: 'stripe';
  eventId: string;
  timestamp: number;
  parsed: Record<string, unknown>;
  replayWindowMs: number;
};

const stripeProvider: Provider = {
  name: 'stripe',
  validate(_req, _secret) {
    // Phase 4 fills this in.
    throw new Error('Stripe provider not yet implemented (Phase 4)');
  },
};

registerProvider('stripe', stripeProvider);
