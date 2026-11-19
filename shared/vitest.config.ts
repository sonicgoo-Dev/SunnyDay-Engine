import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/no-waiting.ts'],
    // One database for all files: run them one after another.
    fileParallelism: false,
  },
})
