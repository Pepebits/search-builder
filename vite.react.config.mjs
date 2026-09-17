// Builds the React example as one classic script for tests/react.mjs.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // A *development* build, unlike the other test builds: it keeps React's
  // dev-only warnings (controlled input without onChange, missing keys,
  // effect leaks) and makes <StrictMode> in react-entry.tsx actually
  // double-invoke renders and effects. The suite asserts `errors` is empty,
  // so those warnings fail it.
  mode: 'development',
  define: { 'process.env.NODE_ENV': '"development"' },
  build: {
    outDir: '.tmp/react-build',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: { entry: 'src/react-entry.tsx', name: 'ReactDemo', formats: ['iife'], fileName: () => 'app.js' }
  }
})
