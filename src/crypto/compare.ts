import { timingSafeEqual } from 'node:crypto';

/**
 * Length-guarded constant-time byte comparison.
 *
 * Length mismatch returns `false` WITHOUT throwing — a top-level guard, not a
 * try/catch around `crypto.timingSafeEqual`. See PITFALLS.md Pitfall #2 for
 * the rationale: a thrown exception (or a caught-and-rethrown one) leaks
 * timing information about whether the lengths differed, which can leak
 * information about the secret's length over many requests.
 *
 * Buffer-only by design (Phase 2 D-03). Providers convert hex/base64 header
 * strings to Buffer at their own call site — no string normalization here.
 */
export function timingSafeCompare(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
