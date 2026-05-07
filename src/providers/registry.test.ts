import { beforeEach, describe, expect, it } from 'vitest';
import {
  _clearRegistryForTesting,
  getProvider,
  registerProvider,
} from './registry.js';
import type { Provider } from './types.js';

// Pitfall 2: this file imports './registry.js' directly — NOT via
// '../index.js' — to avoid triggering the side-effect provider imports
// (Plan 07) which would pre-populate the registry with stripe/github/shopify.

describe('provider registry', () => {
  beforeEach(() => {
    _clearRegistryForTesting();
  });

  it('register/get round-trip returns the same provider instance', () => {
    const fake: Provider = {
      name: 'fake',
      validate: () => {
        throw new Error('not invoked in this test');
      },
    };
    registerProvider('fake', fake);
    expect(getProvider('fake')).toBe(fake);
  });

  it('returns undefined for an unregistered name', () => {
    expect(getProvider('not-registered')).toBeUndefined();
  });

  it('last-write-wins on duplicate registration', () => {
    const a: Provider = {
      name: 'dup',
      validate: () => {
        throw new Error('a');
      },
    };
    const b: Provider = {
      name: 'dup',
      validate: () => {
        throw new Error('b');
      },
    };
    registerProvider('dup', a);
    registerProvider('dup', b);
    expect(getProvider('dup')).toBe(b);
  });
});
