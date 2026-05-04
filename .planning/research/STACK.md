# Technology Stack: Express Webhook Signature Validation Middleware

**Domain:** TypeScript Express.js middleware library (CJS+ESM dual-publish, npm-ready)
**Researched:** 2026-05-04
**Confidence:** HIGH (verified with Context7 docs and official npm registry)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **TypeScript** | 6.0.3 | Language + type safety | Latest stable; zero breaking changes from 5.x; excellent ESM support; required for professional library packaging |
| **Express** | 4.21.2 (peer) + 5.2.1 opt. | HTTP framework | 4.x stable production standard; 5.x released Dec 2025, production-ready but not required; dual support via peerDependencies |
| **Node.js** | 20.x, 22.x, 24.x (LTS) | Runtime | 20 (Iron): stable; 22 (Jod): recommended current; 24 (Krypton): latest LTS as of May 2026; test against all three |
| **Vitest** | 4.1.5 | Test runner | Jest-compatible, ESM-native, fastest framework for modern projects; significantly faster than Jest for TS/ESM projects |
| **Supertest** | Latest | Express integration testing | Industry standard for Express middleware testing; pairs directly with Vitest/Jest |
| **tsup** | Latest (egoist/tsup) | Build/bundler | Zero-config TS bundler; handles CJS+ESM dual output automatically; faster/simpler than tsc for libraries |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **@types/express** | Latest | TypeScript definitions | Required for full TypeScript support in middleware |
| **@types/node** | Latest | Node.js type definitions | Standard for Node projects; tsup handles this automatically |
| **typescript-eslint** | Latest (eslint-compatible) | TS linting rules | Required if using ESLint; provides 100+ TS-aware rules |
| **prettier** | 3.8.3+ | Code formatter | Opinionated formatter; use if you want Prettier's style; otherwise Biome is faster |
| **@biomejs/biome** | 2.4.14+ | Linter + formatter (unified) | Modern alternative; 10–25x faster than ESLint + Prettier combined; single binary, single config |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **ESLint** (flat config) | JavaScript/TypeScript linting | v10.2.1+; use flat config (`eslint.config.js`) not `.eslintrc` (deprecated v9+); OR switch to Biome for faster tooling |
| **Prettier** | Code formatting (if not using Biome) | v3.8.3+; works alongside ESLint with `eslint-config-prettier` to disable conflicting rules |
| **GitHub Actions** | CI/CD | Test matrix: Node 20, 22, 24 (all LTS); covers 95% of user environments |
| **npm** | Package manager + publishing | v10.x+ (auto-installed with Node 20+); handles peerDependencies correctly since v7 |

## Installation

```bash
# Core dependencies (peerDependency — users install Express)
npm install express

# Dev dependencies — build
npm install -D typescript@^6.0.0 tsup vite

# Dev dependencies — testing
npm install -D vitest supertest @types/express @types/node @types/supertest

# Dev dependencies — linting/formatting (Option A: ESLint + Prettier)
npm install -D eslint@^10.0.0 prettier @eslint/js typescript-eslint@latest eslint-config-prettier

# Dev dependencies — linting/formatting (Option B: Biome — recommended)
npm install -D @biomejs/biome

# Dev dependencies — CI helpers
npm install -D @actions/setup-node (if using GitHub Actions)
```

## Stack Patterns by Variant

### **If you want unified lint + format (recommended for greenfield 2026 projects):**
- Use `@biomejs/biome` as your single tool
- Why: 10–25x faster, single config file, no ESLint+Prettier conflict management, production-ready as of v2.0 (Dec 2025)
- Configuration: Single `biome.json` replaces `eslint.config.js` + `.prettierrc`
- Caveat: If you need obscure ESLint plugins (e.g., custom rule sets), ESLint+Prettier still required

### **If you need the full ESLint plugin ecosystem:**
- Use ESLint (flat config) + Prettier + `eslint-config-prettier`
- Why: Maximum rule flexibility; ~1000 community plugins available
- Configuration: `eslint.config.js` (flat config format, ESLint 9+ standard)
- Note: Slower on large codebases; 3–4x slower than Biome

### **For Express 4.x vs 5.x support:**
- **Declare peerDependencies:** `"express": "4.x || 5.x"`
- Why: Allows users on either version; no forced upgrade
- Test in CI: Run test suite against both 4.21.2 (latest v4) and 5.2.1 (latest v5) in separate GitHub Actions matrix jobs
- **Breaking change strategy:** If you find incompatibility, document it and use range like `"express": "^4.21.0 || ^5.0.0"` with explicit version support matrix in README

### **For TypeScript target + module configuration:**
- **tsconfig.json essentials:**
  ```json
  {
    "compilerOptions": {
      "target": "ES2020",
      "module": "ESNext",
      "lib": ["ES2020"],
      "moduleResolution": "bundler",
      "strict": true,
      "esModuleInterop": true,
      "declaration": true,
      "declarationMap": true,
      "sourceMap": true,
      "skipLibCheck": true
    },
    "include": ["src"],
    "exclude": ["node_modules", "dist", "**/*.test.ts"]
  }
  ```
- Why: `moduleResolution: "bundler"` is the modern standard (replaces `node16` in v5+); `ES2020` target widely supported; `ESNext` module lets tsup/bundler choose output format

- **package.json exports map (dual CJS+ESM):**
  ```json
  {
    "name": "webhook-validator",
    "version": "1.0.0",
    "type": "module",
    "main": "./dist/index.cjs",
    "module": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": {
      ".": {
        "import": "./dist/index.js",
        "require": "./dist/index.cjs",
        "types": "./dist/index.d.ts"
      }
    },
    "files": ["dist"],
    "peerDependencies": {
      "express": "4.x || 5.x"
    }
  }
  ```
- Why: Explicit exports field tells bundlers the entry points; separate `.cjs` and `.js` files; modern tooling respects this over `main`/`module` fields

- **tsup.config.ts (builds both formats):**
  ```typescript
  import { defineConfig } from 'tsup'

  export default defineConfig({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    outDir: 'dist',
  })
  ```
- Why: Automatic dual-format output; one config file; no manual tsc juggling

## Raw Body Handling Strategy (Critical for Webhook Signatures)

### Problem
HMAC signature verification requires the **exact raw request bytes**, not JSON-parsed or reformatted body. If you use `express.json()` first, the parser consumes the raw body, and signature validation fails.

### Recommended Pattern: `express.json()` with `verify` callback

```typescript
// middleware/webhookValidator.ts
import { Request, Response, NextFunction } from 'express'
import { createHmac } from 'crypto'

const storeRawBody = (req: Request, res: Response, buf: Buffer, encoding: string) => {
  if (buf && buf.length) {
    (req as any).rawBody = buf.toString(encoding || 'utf8')
  }
}

export const webhookValidatorMiddleware = (secret: string) => {
  return express.json({
    verify: storeRawBody, // Capture raw body before parsing
  })
}

// Then in your route handler:
app.post('/webhook', webhookValidatorMiddleware(STRIPE_SECRET), (req, res) => {
  const rawBody = (req as any).rawBody
  const signature = req.headers['stripe-signature'] as string
  
  const hash = createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')
  
  if (hash !== signature) {
    return res.status(401).json({ error: 'Invalid signature' })
  }
  
  res.json({ ok: true })
})
```

**Why this pattern:**
- Middleware ordering: `express.json()` with `verify` callback preserves raw body in memory
- No custom body parser needed; works with existing Express patterns
- The `verify(req, res, buf, encoding)` callback fires **before** JSON parsing
- Store in `req.rawBody` (or custom property) for later use
- Simpler than implementing a full custom parser; Stripe, GitHub, Shopify docs recommend this approach

### Alternative: `express.raw()` then custom parser
**Not recommended for this project** because:
- Requires manual JSON parsing after signature validation
- More boilerplate; higher footgun surface
- No DX advantage over `express.json()` + `verify` callback

### Testing raw body with Supertest

```typescript
import request from 'supertest'
import express from 'express'
import { createHmac } from 'crypto'

const app = express()
app.use(express.json({ verify: storeRawBody }))

describe('webhook signature validation', () => {
  it('validates stripe webhook with raw body', async () => {
    const secret = 'test_secret'
    const payload = { id: '123', event: 'payment.success' }
    const rawBody = JSON.stringify(payload)
    const signature = createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex')

    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Signature', signature)
      .send(payload) // Supertest sends body; middleware captures raw
      .expect(200)

    expect(res.body).toEqual({ ok: true })
  })
})
```

**Key Supertest behavior:**
- `.send(object)` auto-serializes to JSON
- Middleware `verify` callback receives the raw Buffer before parsing
- No special setup needed; Supertest handles Content-Type correctly

## Version Compatibility Matrix

| Package | Version | Node Support | Express 4 | Express 5 | Notes |
|---------|---------|--------------|-----------|-----------|-------|
| TypeScript | 6.0.3 | 20+, 22+, 24+ | ✓ | ✓ | No Node 18 support; drop it unless required |
| Vitest | 4.1.5 | 20+, 22+, 24+ | ✓ | ✓ | ESM-first; Jest fallback if needed |
| @types/express | Latest | 20+, 22+, 24+ | ✓ | ✓ | Both versions have types |
| tsup | Latest | 18+, 20+, 22+ | ✓ | ✓ | Permissive; works on older Node too |
| ESLint | 10.2.1 | 18+, 20+, 22+ | ✓ | ✓ | Flat config standard from v9+ |
| Prettier | 3.8.3 | 14+, 16+, 18+ | ✓ | ✓ | Very backward-compatible |
| @biomejs/biome | 2.4.14 | 18+, 20+, 22+ | ✓ | ✓ | Newer releases support both |

## GitHub Actions CI Configuration (Recommended)

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20.x, 22.x, 24.x]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm run lint    # or: npm run biome check
      - run: npm run build
      - run: npm run test
      - run: npm run test:integration  # Supertest against real Express

  test-express-versions:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20.x]
        express-version: ['4.21.2', '5.2.1']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm install express@${{ matrix.express-version }}
      - run: npm run test:integration
```

**Why this configuration:**
- Tests against all current LTS versions (20, 22, 24)
- Separate job tests both Express 4.x and 5.x to catch breaking changes early
- `cache: 'npm'` speeds up CI; `npm ci` ensures lockfile consistency

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **tsup** | `tsc` (raw TypeScript compiler) | Never for libraries; tsc doesn't bundle; requires manual dual-output config |
| **tsup** | **vite-lib** | If building a Vite ecosystem library or want Vite integration; more overhead than tsup; tsup is simpler |
| **tsup** | **esbuild** (raw) | If you need non-standard output or tree-shaking; esbuild has no types support; tsup wraps it better |
| **tsup** | **unbuild** | Unjs tooling; more opinionated; tsup is more minimal for middleware libraries |
| **Vitest** | **Jest** | If you must use Jest for organizational consistency; Vitest is faster and ESM-first; Jest still works fine |
| **ESLint (flat config)** | **@biomejs/biome** | Already covered above; Biome is the future, but ESLint is safe if you need plugin ecosystem |
| **Prettier** | **Biome formatter** | Already covered; Biome if you want one tool; Prettier if you have existing Prettier configs to keep |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Node 18 in 2026** | LTS ended 2025-04-30; security updates stop; use 20+, 22+, or 24+ | Node 20, 22, or 24 |
| **tsc for building libraries** | No bundling; generates separate `.d.ts` files; requires manual dual-output gymnastics | tsup (handles all automatically) |
| **express.raw() alone** | Requires manual JSON parsing; higher footgun surface for body handling | `express.json({ verify })` callback pattern |
| **Jest for new TS projects** | Significantly slower on ESM/TypeScript; Vitest is 5–10x faster for modern stacks | Vitest (also Jest-compatible if you switch later) |
| **String-based ESLint config** | Deprecated since ESLint 9 (late 2024); `.eslintrc.json` files no longer supported in v10+ | Flat config (`eslint.config.js`) or Biome |
| **Separate body-parser package** | Built into Express since v4.16.0; bringing in extra dependency is redundant | Express built-in `express.json()`, `express.raw()`, `express.urlencoded()` |
| **`stripe` SDK** | Pulls in entire SDK; you only need crypto + signature validation; bloats bundle | Native Node.js `crypto` module (built-in) |
| **`@octokit/webhooks`** | Full GitHub ecosystem; you only need HMAC validation | Native Node.js `crypto` + your middleware |

## TypeScript Configuration Reasoning

### Why ES2020 target?
- Supports: async/await, Promise, destructuring, optional chaining — all stable since 2020
- Avoids: Output that requires downlevel helpers
- Widely supported: Node 14+ (your minimum is 20, so very safe)

### Why `moduleResolution: "bundler"`?
- Modern standard (TypeScript 5.0+); replaces `node16`
- Tells bundlers to resolve as if using esbuild/Vite (not CommonJS)
- Critical for tsup's dual-format output

### Why `declaration: true` + `declarationMap: true`?
- `declaration: true` generates `.d.ts` files for consumers
- `declarationMap: true` maps types back to source (better IDE experience)
- tsup also generates these; redundant in tsconfig but harmless

## Pitfalls to Avoid

1. **Middleware ordering in tests:** Always place signature validation middleware **before** `express.json()` or use the `verify` callback pattern. Never reverse the order.

2. **Body-parser version mismatch:** Don't bring in an explicit `body-parser` package; Express 4.x and 5.x ship with it. Explicit versions cause conflicts.

3. **peerDependencies optional field:** Some libraries use `optionalDependencies` for Express. Don't do this. Use `peerDependencies` with a clear version range. Users must install Express intentionally.

4. **Losing raw body in integration tests:** Supertest will auto-parse `.send()` JSON. Ensure middleware `verify` callback runs **before** parsing, or raw body is lost. Test this explicitly.

5. **ESM+CJS export confusion:** Always include `types` field in exports. Never rely on TypeScript's inference of `.d.ts` location; explicit is better.

## Sources

- **Context7: /microsoft/typescript** — Latest TS 6.0.3; dual CJS/ESM configuration patterns
- **Context7: /expressjs/express** — Express 5.2.1 release; version compatibility; peerDependencies best practices
- **Context7: /vitest-dev/vitest** — Vitest 4.1.5; Jest compatibility; projects configuration
- **Context7: /egoist/tsup** — tsup bundling for CJS+ESM; configuration patterns
- **Context7: /eslint/eslint** — ESLint 10.2.1; flat config (`eslint.config.js`); migration from v8
- **Context7: /forwardemail/supertest** — Supertest with async/await; body sending; Express integration testing
- **npm registry** — Express 5.2.1 latest; TypeScript 6.0.3 latest; Vitest 4.1.5 latest; @biomejs/biome 2.4.14 latest
- **GitHub Docs: Building and testing Node.js** — Node LTS versions (20, 22, 24 active as of May 2026); CI matrix strategy
- **WebSearch: Webhook signature verification patterns** — Raw body handling best practices; express.json verify callback standard pattern
- **WebSearch: Biome 2026** — @biomejs/biome v2.4.14 production-ready; ESLint+Prettier replacement; 10–25x faster

---
*Stack research for: Express webhook signature validation middleware (TypeScript/Node.js)*
*Researched: 2026-05-04*
