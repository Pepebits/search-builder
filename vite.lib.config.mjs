// The publishable library build: four ES entries, no bundled framework code
// (vue/react/react-dom/flex-url stay external — ADR-0003, ADR-0006), no
// plugins (nothing here is .vue or .jsx/.tsx). Declarations come from a
// separate `vue-tsc -p tsconfig.build.json` run (see `npm run build:lib`),
// so this config only emits JS + source maps into `dist-lib` — the Pages
// build (`vite.config.js`) owns `dist/`.
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist-lib',
    // The declarations step (or a fresh `build:lib`) already cleared
    // `dist-lib`; emptying it here would delete `types/` written just before.
    emptyOutDir: false,
    sourcemap: true,
    minify: false,
    lib: {
      entry: {
        index: 'src/core/index.ts',
        vue: 'src/vue/index.ts',
        react: 'src/react/index.ts',
        apiable: 'src/apiable/index.ts'
      },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`
    },
    rollupOptions: {
      external: ['vue', 'react', 'react-dom', 'react/jsx-runtime', 'flex-url']
    }
  }
})
