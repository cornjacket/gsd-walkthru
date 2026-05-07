// Provider registry (D-01).
//
// Module-scope Map<string, Provider> singleton. Registration is
// last-write-wins (planner discretion per CONTEXT "Claude's Discretion":
// chose replace, not throw, to stay consistent with Map.set defaults
// and to allow Phase 4/5 to substitute the Phase 3 stubs without
// forcing a clear).
//
// Test isolation: _clearRegistryForTesting() is a leading-underscore
// private API used by src/providers/registry.test.ts and Phase 4/5
// tests (D-22). It is NOT re-exported from src/index.ts.
import type { Provider } from './types.js';

const registry = new Map<string, Provider>();

/**
 * Register a provider implementation by name. Last-write-wins on
 * duplicate name — Phase 4/5 may substitute the Phase 3 stubs without
 * a clear-and-re-register dance.
 */
export function registerProvider(name: string, provider: Provider): void {
  registry.set(name, provider);
}

/**
 * Look up a registered provider by name. Returns `undefined` if not
 * registered — `createWebhookMiddleware` (Plan 06) interprets `undefined`
 * as the unknown-provider failure (D-02) and throws a plain Error.
 */
export function getProvider(name: string): Provider | undefined {
  return registry.get(name);
}

/**
 * List the names of all currently-registered providers, sorted
 * alphabetically. Used by `createWebhookMiddleware` to build a helpful
 * unknown-provider error message that reflects the actual registry
 * contents (rather than a hard-coded list that drifts as Phase 4/5
 * substitute stubs and tests register fakes).
 */
export function listProviders(): string[] {
  return Array.from(registry.keys()).sort();
}

/**
 * Test-only escape hatch for clearing registry state between cases.
 * Leading-underscore name signals private API; not re-exported from
 * src/index.ts (D-19). Used by Phase 3+ unit tests (D-22) to isolate
 * fake-provider registration from the production side-effect imports
 * that run when `'../index.js'` is imported.
 */
export function _clearRegistryForTesting(): void {
  registry.clear();
}
