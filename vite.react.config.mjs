// Builds the React example as one classic script for tests/react.mjs.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Production, like the other test builds. React's dev-only warnings (controlled input
  // without onChange, missing keys) are therefore compiled out of this bundle; the
  // adapter was checked against a StrictMode dev build by hand in the Phase 2 review.
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: '.tmp/react-build',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: { entry: 'src/react-entry.tsx', name: 'ReactDemo', formats: ['iife'], fileName: () => 'app.js' }
  }
})
