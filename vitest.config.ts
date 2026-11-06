import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    testTimeout: 10000,
    include: ['**/__tests__/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['**/index.ts', 'src/domain/contracts/**', '**/*.d.ts', '**/*.types.ts', '**/__tests__/**', '**/*.constant.ts', '**/*.constants.ts', '**/*.config.ts', '**/*.contracts.ts', '**/*.mocks.ts', '**/*.mock.ts', '**/*.spec.ts', '**/factories/**', '**/migrations/**', '**/seeders/**', '**/*.module.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
})
