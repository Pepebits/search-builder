// The demo site: three pages (styled Vue, headless Vue, React over the
// plain stylesheet), built together so GitHub Pages can serve them from one
// deploy. Vue and React select by file type, so both plugins coexist.
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // The Pages workflow (.github/workflows/pages.yml) sets this to
  // '/search-builder/'; everything else (dev, a plain `npm run build`) gets
  // the site root.
  base: process.env.BASE_PATH ?? '/',
  plugins: [vue(), react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        headless: 'headless.html',
        react: 'react.html'
      }
    }
  }
})
