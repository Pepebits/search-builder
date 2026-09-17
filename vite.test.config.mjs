// Builds the app as one classic script so the interaction tests can run it in jsdom.
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: '.tmp/test-build',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: { entry: 'src/main.js', name: 'DemoApp', formats: ['iife'], fileName: () => 'app.js' }
  }
})
