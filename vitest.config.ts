import { defineConfig } from 'vitest/config'

// Vitest resolves this file through its default export (tool constraint).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    // The scaffold ships no domain logic yet; the first tests land with src/main/domain.
    passWithNoTests: true
  }
})
