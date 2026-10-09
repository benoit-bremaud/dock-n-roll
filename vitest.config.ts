import { defineConfig } from 'vitest/config'

// Vitest resolves this file through its default export (tool constraint).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
