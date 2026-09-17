// Builds the unstyled example as one classic script for tests/headless.mjs.
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: '.tmp/headless-build',
    emptyOutDir: true,
    lib: { entry: 'src/headless-entry.js', name: 'HeadlessDemo', formats: ['iife'], fileName: () => 'app.js' }
  }
})
