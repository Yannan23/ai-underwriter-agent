import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      // apps/ (the HTTP/SSE server) has no unit tests yet — add it here once it does.
      include: ['packages/*/src/**'],
      // Type-only module: no executable code to cover.
      exclude: ['packages/pipeline/src/stage.ts'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
