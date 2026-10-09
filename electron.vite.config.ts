import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'

// In dev only, the React refresh preamble is an inline <script> and Vite injects CSS as
// <style> elements: the strict CSP of index.html would block both and leave a blank window.
// Builds keep the strict policy (no inline script or style in the bundled page).
const relaxCspForDevServer: Plugin = {
  name: 'dock-n-roll:relax-csp-for-dev-server',
  apply: 'serve',
  transformIndexHtml: (html) =>
    html
      .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
      .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
}

// electron-vite resolves this file through its default export (tool constraint).
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react(), relaxCspForDevServer]
  }
})
