import { describe, expect, it } from 'vitest';
import { computeHmac } from './hmac.js';

describe('computeHmac', () => {
  it('produces the known SHA-256 HMAC digest for a fixed body and secret', () => {
    // Hand-computed reference vector. Verified with:
    //   node -e "console.log(require('crypto').createHmac('sha256','shh').update('hello').digest('hex'))"
    const body = 'hello';
    const secret = 'shh';
    const expectedHex = '0e396369ee043c5b6b922743631745b2249cf7cb2c4722e61e802447d5d14c70';

    const digest = computeHmac(body, secret, 'sha256');

    expect(digest.toString('hex')).toBe(expectedHex);
  });

  it('returns a Buffer (not a string, not a Uint8Array view)', () => {
    const digest = computeHmac('x', 'k', 'sha256');
    expect(Buffer.isBuffer(digest)).toBe(true);
  });
});
