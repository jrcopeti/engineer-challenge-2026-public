import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // The app module holds one DB connection; keep tests in a single process
    // so they don't fight over it.
    fileParallelism: false,
  },
})
