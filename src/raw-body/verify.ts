// captureRawBody — verify-callback helper for express.json (D-05, BODY-02).
//
// Body-parser's `verify` option fires with the raw pre-parse Buffer
// BEFORE JSON parsing. This helper stores that Buffer at `req.rawBody`
// so the validation middleware (Plan 06) computes HMAC against the
// exact bytes the provider sent.
//
// D-06: stores at `req.rawBody` as Buffer — same property the standalone
// middleware uses, so consumers can pick either surface and downstream
// code stays identical.
//
// PITFALLS #6 / RESEARCH anti-pattern: do NOT raise errors from this helper.
// body-parser does propagate sync errors via Express's error pipeline,
// but raising errors here mixes validation logic into the body-parser layer.
// Validation belongs in createWebhookMiddleware (Plan 06).
//
// Single-surface rule: Pitfall 3 — consumers should pick ONE of
// rawBodyCapture() or express.json({ verify: captureRawBody }) per route,
// NOT both. The standalone middleware's skip-if-already-set guard makes
// the both-mounted case safe in practice but is NOT the documented path.
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Helper for `express.json({ verify: captureRawBody })`. Stores the raw
 * pre-parse Buffer at `req.rawBody` so the validation middleware can
 * compute the HMAC against the exact bytes the provider sent.
 *
 * @param req      - Node IncomingMessage (NOT Express Request — body-parser
 *                   invokes verify before Express's Request shape is
 *                   established; cast inline to attach the property).
 * @param _res     - Unused; required by the @types/body-parser verify signature.
 * @param buf      - Raw pre-parse Buffer from body-parser.
 * @param _encoding - Unused; we deliberately do NOT decode using this
 *                   parameter — providers sign raw bytes, not decoded strings.
 */
export function captureRawBody(
  req: IncomingMessage,
  _res: ServerResponse,
  buf: Buffer,
  _encoding: string
): void {
  // D-06: stash on req.rawBody as Buffer.
  (req as IncomingMessage & { rawBody?: Buffer }).rawBody = buf;
}
