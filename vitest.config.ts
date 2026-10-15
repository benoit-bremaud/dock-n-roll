import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Vitest resolves this file through its default export (tool constraint).
// Two projects: the main process and the domain run in Node; renderer components in a DOM.
// Every renderer test (`.ts` or `.tsx`) runs in the DOM project; none is left unrun.
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'node', include: ['src/**/*.test.ts'], exclude: ['src/renderer/**'], environment: 'node' } },
      { plugins: [react()], test: { name: 'renderer', include: ['src/renderer/**/*.test.{ts,tsx}'], environment: 'happy-dom' } }
    ]
  }
})
