// Proof that the tarball itself — not `src/` — is a usable package: build it
// with `npm pack`, install it into a scratch Vue app and a scratch React app
// (real `npm install`, real `vite build`), serve each `dist/` and drive it
// with Playwright, and type-check a `.ts`/`.tsx` entry against each against
// the shipped `.d.ts` so `exports.types` is proven to resolve, not assumed.
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, rm, mkdir, writeFile, readdir } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = fileURLToPath(new URL('..', import.meta.url))
const packDir = join(root, '.tmp', 'pack')
const tscBin = join(root, 'node_modules', 'typescript', 'bin', 'tsc')

let pass = 0, fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`)
}

const now = () => Date.now()
const since = (t) => `${((now() - t) / 1000).toFixed(1)}s`

function run (cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8' })
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
  '.json': 'application/json',
  '.svg': 'image/svg+xml'
}

function serveDir (dir) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://x')
        const rel = url.pathname === '/' ? '/index.html' : url.pathname
        const data = await readFile(join(dir, decodeURIComponent(rel)))
        res.writeHead(200, { 'Content-Type': MIME[extname(rel)] ?? 'application/octet-stream' })
        res.end(data)
      } catch {
        res.writeHead(404)
        res.end()
      }
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({ server, url: `http://127.0.0.1:${port}/` })
    })
  })
}

/* --------------------------------------------------------------------- */
/* 0. Build the tarball (triggers `prepack` -> `build:lib`).              */
/* --------------------------------------------------------------------- */

await rm(packDir, { recursive: true, force: true })
await mkdir(packDir, { recursive: true })

const t0 = now()
run('npm', ['pack', '--pack-destination', packDir, '--loglevel=error'], root)
const tarball = (await readdir(packDir)).find((f) => f.endsWith('.tgz'))
check('the tarball was produced', Boolean(tarball), true)
console.log(`  npm pack: ${since(t0)}`)

/* --------------------------------------------------------------------- */
/* Scratch app sources                                                    */
/* --------------------------------------------------------------------- */

const FILTERS_TS = `
import type { FilterDef } from 'search-builder'

export const FILTERS: FilterDef[] = [
  { key: 'status', label: 'Status', operators: [{ value: 'equal', symbol: '=', description: 'is' }],
    values: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }] },
  { key: 'type', label: 'Type', operators: [{ value: 'equal', symbol: '=', description: 'is' }],
    values: [{ value: 'bug', label: 'Bug' }, { value: 'feature', label: 'Feature' }] }
]
`.trimStart()

const INDEX_HTML = (entry) => `<!doctype html>
<html>
  <head><meta charset="utf-8" /></head>
  <body>
    <div id="app"></div>
    <script type="module" src="${entry}"></script>
  </body>
</html>
`

const VUE_MAIN_TS = `
import { createApp, h } from 'vue'
import { useSearchBuilder } from 'search-builder/vue'
import { createApiable } from 'search-builder/apiable'
import 'search-builder/styles.css'
import { FILTERS } from './filters'

const apiable = createApiable({ filters: FILTERS, path: '/api/items' })
// eslint-disable-next-line no-console
console.log('requestUri', apiable.requestUri([{ id: '1', type: 'status', operator: 'equal', value: 'open' }]))

const App = {
  setup () {
    const s = useSearchBuilder({ filters: FILTERS, label: 'Search issues' })
    return () => h('div', s.getRootProps(), [
      h('label', s.getLabelProps(), 'Search issues'),
      h('div', s.getFieldsetProps(), [h('input', s.getInputProps())]),
      h('div', s.getListboxProps(), s.indexedGroups.value.map((g) =>
        h('div', s.getGroupProps(g), [
          h('b', {}, g.label),
          ...g.options.map((o) => h('div', s.getOptionProps(o), o.label))
        ])
      )),
      h('p', s.getHintProps(), 'Arrow keys browse, Enter selects.'),
      h('p', s.getAppliedProps(), s.appliedSummary.value),
      h('p', s.getLiveRegionProps(), s.announcement.value)
    ])
  }
}

createApp(App).mount('#app')
`.trimStart()

const REACT_MAIN_TSX = `
import { createRoot } from 'react-dom/client'
import { useSearchBuilder } from 'search-builder/react'
import { createApiable } from 'search-builder/apiable'
import 'search-builder/styles.css'
import { FILTERS } from './filters'

const apiable = createApiable({ filters: FILTERS, path: '/api/items' })
// eslint-disable-next-line no-console
console.log('requestUri', apiable.requestUri([{ id: '1', type: 'status', operator: 'equal', value: 'open' }]))

function App () {
  const s = useSearchBuilder({ filters: FILTERS, label: 'Search issues', defaultTokens: [] })
  return (
    <div {...s.getRootProps()}>
      <label {...s.getLabelProps()}>Search issues</label>
      <div {...s.getFieldsetProps()}><input {...s.getInputProps()} /></div>
      <div {...s.getListboxProps()}>
        {s.indexedGroups.map((g) => (
          <div {...s.getGroupProps(g)} key={g.id}>
            <b>{g.label}</b>
            {g.options.map((o) => <div {...s.getOptionProps(o)} key={o.id}>{o.label}</div>)}
          </div>
        ))}
      </div>
      <p {...s.getHintProps()}>Arrow keys browse, Enter selects.</p>
      <p {...s.getAppliedProps()}>{s.appliedSummary}</p>
      <p {...s.getLiveRegionProps()}>{s.announcement}</p>
    </div>
  )
}

createRoot(document.getElementById('app')!).render(<App />)
`.trimStart()

const SCRATCH_TSCONFIG = (jsx) => JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    lib: ['ES2022', 'DOM'],
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    types: [],
    ...(jsx ? { jsx: 'react-jsx' } : {})
  },
  include: ['src']
}, null, 2)

async function writeScratchApp (dir, { pkg, viteConfig, indexHtml, mainFile, mainName, jsx }) {
  await rm(dir, { recursive: true, force: true })
  await mkdir(join(dir, 'src'), { recursive: true })
  await writeFile(join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  await writeFile(join(dir, 'vite.config.mjs'), viteConfig)
  await writeFile(join(dir, 'index.html'), indexHtml)
  await writeFile(join(dir, 'src', 'filters.ts'), FILTERS_TS)
  await writeFile(join(dir, 'src', mainName), mainFile)
  await writeFile(join(dir, 'tsconfig.scratch.json'), SCRATCH_TSCONFIG(jsx))
}

/* --------------------------------------------------------------------- */
/* Vue scratch app                                                        */
/* --------------------------------------------------------------------- */

const vueDir = join(packDir, 'vue-app')
await writeScratchApp(vueDir, {
  pkg: {
    name: 'scratch-vue-app',
    private: true,
    type: 'module',
    scripts: { build: 'vite build' },
    dependencies: {
      'search-builder': `file:../${tarball}`,
      vue: '^3.5.13',
      'flex-url': '^3.1.0'
    },
    devDependencies: {
      vite: '^6.0.7',
      '@vitejs/plugin-vue': '^5.2.1'
    }
  },
  viteConfig: `import { defineConfig } from 'vite'\nimport vue from '@vitejs/plugin-vue'\nexport default defineConfig({ plugins: [vue()] })\n`,
  indexHtml: INDEX_HTML('/src/main.ts'),
  mainFile: VUE_MAIN_TS,
  mainName: 'main.ts',
  jsx: false
})

/* --------------------------------------------------------------------- */
/* React scratch app                                                      */
/* --------------------------------------------------------------------- */

const reactDir = join(packDir, 'react-app')
await writeScratchApp(reactDir, {
  pkg: {
    name: 'scratch-react-app',
    private: true,
    type: 'module',
    scripts: { build: 'vite build' },
    dependencies: {
      'search-builder': `file:../${tarball}`,
      react: '^18.3.1',
      'react-dom': '^18.3.1',
      'flex-url': '^3.1.0'
    },
    devDependencies: {
      vite: '^6.0.7',
      '@vitejs/plugin-react': '^4.3.4',
      '@types/react': '^18.3.12',
      '@types/react-dom': '^18.3.1'
    }
  },
  viteConfig: `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nexport default defineConfig({ plugins: [react()] })\n`,
  indexHtml: INDEX_HTML('/src/main.tsx'),
  mainFile: REACT_MAIN_TSX,
  mainName: 'main.tsx',
  jsx: true
})

/* --------------------------------------------------------------------- */
/* Install + build both, in parallel                                      */
/* --------------------------------------------------------------------- */

const tInstall = now()
run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], vueDir)
run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], reactDir)
console.log(`  npm install (vue-app, react-app): ${since(tInstall)}`)

const tBuild = now()
run('npm', ['run', 'build', '--silent'], vueDir)
run('npm', ['run', 'build', '--silent'], reactDir)
console.log(`  vite build (vue-app, react-app): ${since(tBuild)}`)

check('vue-app/dist/index.html exists', (await readdir(join(vueDir, 'dist'))).includes('index.html'), true)
check('react-app/dist/index.html exists', (await readdir(join(reactDir, 'dist'))).includes('index.html'), true)

/* --------------------------------------------------------------------- */
/* Type-check the scratch entries: proves exports.types resolves.         */
/* --------------------------------------------------------------------- */

const tTypes = now()
for (const [name, dir] of [['vue-app', vueDir], ['react-app', reactDir]]) {
  try {
    run(process.execPath, [tscBin, '-p', 'tsconfig.scratch.json'], dir)
    check(`${name}: scratch entry type-checks against the shipped .d.ts`, true, true)
  } catch (e) {
    check(`${name}: scratch entry type-checks against the shipped .d.ts`, e.stdout?.toString() ?? String(e), true)
  }
}
console.log(`  type-check (vue-app, react-app): ${since(tTypes)}`)

/* --------------------------------------------------------------------- */
/* Serve + drive with Playwright.                                         */
/* --------------------------------------------------------------------- */

const tRuntime = now()
const browser = await chromium.launch()

async function driveScratchApp (label, dir, { openText, valueText }) {
  const { server, url } = await serveDir(join(dir, 'dist'))
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  await page.goto(url)
  await page.waitForSelector('[role=combobox]')

  await page.click('[role=combobox]')
  await page.waitForTimeout(120)
  const groupText = await page.evaluate(() => document.querySelector('[role=listbox]').textContent)
  check(`${label}: opening the combobox lists the two filters`, groupText.includes(openText[0]) && groupText.includes(openText[1]), true)

  await page.locator('[role=option]', { hasText: 'Status' }).first().click()
  await page.waitForTimeout(120)
  const valuesText = await page.evaluate(() => document.querySelector('[role=listbox]').textContent)
  check(`${label}: choosing a filter advances to its values`, valuesText.includes(valueText), true)

  const border = await page.evaluate(() => getComputedStyle(document.querySelector('[data-fs="bar"]')).borderWidth)
  check(`${label}: the plain stylesheet applied (the bar has a border)`, border !== '0px', true)

  check(`${label}: no console/page errors`, errors, [])

  await page.close()
  server.close()
}

await driveScratchApp('vue-app', vueDir, { openText: ['Status', 'Type'], valueText: 'Open' })
await driveScratchApp('react-app', reactDir, { openText: ['Status', 'Type'], valueText: 'Open' })

await browser.close()
// Two scratch node_modules trees are ~80 MB; nothing reads them after this point.
await rm(packDir, { recursive: true, force: true })
console.log(`  runtime (serve + Playwright): ${since(tRuntime)}`)
console.log(`  total: ${since(t0)}`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
