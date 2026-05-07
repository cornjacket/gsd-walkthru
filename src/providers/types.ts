// Provider interface (D-01).
//
// The factory at src/middleware.ts looks up providers by name and calls
// their validate() method. Phase 3 ships stub providers whose validate()
// throws — Phase 3 tests register a fake provider (D-22) instead of
// invoking the stubs. Phase 4 (Stripe) and Phase 5 (GitHub, Shopify)
// replace each stub's validate() method with real signature-checking
// logic without altering this interface.
import type { Request } from 'express';
import type { WebhookMetadata } from '../types.js';

export interface Provider {
  readonly name: string;
  validate(req: Request, secret: string): WebhookMetadata;
}
