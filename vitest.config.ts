import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
  },
  coverage: {
    provider: 'v8',
    include: ['src/crypto/**', 'src/providers/**', 'src/middleware.ts'],
    thresholds: {
      perFile: true,
      statements: 90,
      branches: 90,
      functions: 90,
      lines: 90,
    },
  },
});
