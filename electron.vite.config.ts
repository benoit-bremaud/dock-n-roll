import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

// electron-vite resolves this file through its default export (tool constraint).
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()]
  }
})
