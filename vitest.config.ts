import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Vitest resolves this file through its default export (tool constraint).
// Two projects: the main process and the domain run in Node; renderer components in a DOM.
// Every renderer test (`.ts` or `.tsx`) runs in the DOM project; none is left unrun.
export default defineConfig({
  test: {
    // Thresholds = measured coverage rounded down to a multiple of 5 (5–8 points under), raised
    // by hand (ADR-0007). Excluded: the Electron composition roots (exercised by the manual test
    // of the built app) and test helpers.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts', 'src/main/index.ts', 'src/renderer/src/main.tsx', 'src/main/adapters/fake-docker-daemon.ts', 'src/main/domain/test-fixtures.ts'],
      reporter: ['text-summary', 'html'],
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 }
    },
    projects: [
      { test: { name: 'node', include: ['src/**/*.test.ts'], exclude: ['src/renderer/**'], environment: 'node' } },
      { plugins: [react()], test: { name: 'renderer', include: ['src/renderer/**/*.test.{ts,tsx}'], environment: 'happy-dom' } }
    ]
  }
})
