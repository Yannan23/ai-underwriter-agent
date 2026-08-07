import { defineConfig } from 'vitest/config'

const unitTests = ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts']
const integrationTests = [
  'packages/*/test/**/*.integration.test.ts',
  'apps/*/test/**/*.integration.test.ts',
]
const liveTests = [
  'packages/*/test/**/*.live.test.ts',
  'apps/*/test/**/*.live.test.ts',
]

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    // The default test command is deliberately offline. Live provider tests
    // exist as a named project but must be selected explicitly.
    project: ['unit', 'integration'],
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: unitTests,
          exclude: [...integrationTests, ...liveTests],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: integrationTests,
          exclude: liveTests,
        },
      },
      {
        extends: true,
        test: {
          name: 'live',
          include: liveTests,
        },
      },
    ],
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'],
      // Type-only module: no executable code to cover.
      exclude: ['packages/pipeline/src/stage.ts'],
      thresholds: {
        perFile: true,
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
