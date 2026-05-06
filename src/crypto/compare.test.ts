import { describe, expect, it } from 'vitest';
import { timingSafeCompare } from './compare.js';

describe('timingSafeCompare', () => {
  it('returns true for equal-length matching buffers', () => {
    const a = Buffer.from('abcdef', 'hex');
    const b = Buffer.from('abcdef', 'hex');
    expect(timingSafeCompare(a, b)).toBe(true);
  });

  it('returns false for equal-length differing buffers', () => {
    const a = Buffer.from('abcdef', 'hex');
    const b = Buffer.from('abcd00', 'hex');
    expect(timingSafeCompare(a, b)).toBe(false);
  });

  it('returns false (without throwing) when buffer lengths differ', () => {
    const a = Buffer.from('abcdef', 'hex');
    const b = Buffer.from('ab', 'hex');
    expect(() => timingSafeCompare(a, b)).not.toThrow();
    expect(timingSafeCompare(a, b)).toBe(false);
  });
});
