# Hand-off — Phase 4 implementation: publishable `search-builder` package

For: the implementing agent (Sonnet 5). Read, in this order: `docs/plan/headless-package.md`,
`docs/adr/0006-single-package-subpath-exports.md`, `docs/adr/0003-flex-url-optional-peer.md`,
`docs/adr/0002-typescript.md`, then `package.json`, `tsconfig.json`, `vite.config.js`, the four
`vite.*.config.mjs`, `src/core/index.ts`, `src/vue/index.ts`, `src/react/index.ts`,
`src/lib/apiable.js`, `src/App.vue`, `src/headless-entry.js`, `src/react-entry.tsx`,
`tests/url.mjs`, `tests/core.mjs`, `README.md`.

Phase 3's one hard requirement — the apiable bridge free of demo data — is folded in here. The
docs restructure stays optional; the README rewrite below is the part that ships.

## Goal

`npm pack` produces a tarball that a Vue app and a React app can install and use through the
five entry points of ADR-0006, with types, and the repo can publish it from a tag. Nothing
observable changes in the three demo pages except the new names.

## Deliverables

### A. Rename to the product name

- Core: `createFilteredSearch` → `createSearchBuilder`; types `FilteredSearchOptions` →
  `SearchBuilderOptions`, `FilteredSearchState` → `SearchBuilderState`, `FilteredSearchStore` →
  `SearchBuilderStore`, `CreateFilteredSearchConfig` → `CreateSearchBuilderConfig`. Any other
  `FilteredSearch*` identifier in `src/core` follows.
- Adapters: `useFilteredSearch` → `useSearchBuilder` in `src/vue` and `src/react`;
  `UseFilteredSearchOptions` → `UseSearchBuilderOptions` (and the React equivalent).
- Demo: `src/components/FilteredSearch.vue` → `SearchBuilder.vue` (component name
  `SearchBuilder`); `ReactSearch.tsx` and `HeadlessSearch.vue` keep their names but import the
  new hooks. `App.vue` follows.
- **Do not rename** the `data-fs` attribute prefix, the `fs-<n>-*` id scope, the `--fs-*` CSS
  custom properties or the `.fs-*` class hooks. They are the styling contract every stylesheet
  and every test is written against; document them as stable in the README.
- Tests follow the renames (`tests/core.mjs` imports; the DOM suites should need nothing).
- No compatibility aliases: nothing has been published yet.

### B. The apiable entry without demo data — `src/apiable/index.ts`

Move `src/lib/apiable.js` to `src/apiable/index.ts`, typed, importing types from `../core`
and values only from `flex-url`. It must not import `src/data/**`. Replace the module-level
defaults with a factory:

```ts
export interface SortDef { value: string; attribute: string; direction: 'asc' | 'desc' }
export interface ApiableOptions { filters: FilterDef[]; path?: string; sorts?: SortDef[]; resource?: string }
export function createApiable (options: ApiableOptions): {
  tokensToUrl (tokens: Token[], opts?: { path?: string; sort?: string }): FlexUrl
  urlToTokens (input: string | URL): { tokens: Token[]; sort?: string; url: FlexUrl }
  requestUri (tokens: Token[], opts?: { sort?: string }): string
  requestParams (tokens: Token[], opts?: { sort?: string }): Record<string, unknown>
  schema (): EndpointSchema   // what schemaFor computes today, from options.filters/sorts
}
```

`path` defaults to `'/'`; `resource` defaults to the last path segment. Keep `PLAIN` (`'in'`)
handling exactly as today; keep the `nextId` generator for parsed tokens. Export the
`FilterDef`-compatible operator constants? No — those are demo data; the entry exports the
factory and its types only. The demo (`App.vue`, `DebugPanel` inputs) creates one instance:
`createApiable({ filters: FILTERS, path: '/api/v1/issues', sorts: SORTS, resource: 'issues' })`.
`tests/url.mjs` is rewritten against the factory with the same assertions (28 checks, same
expected strings).

### C. Library build

- `vite.lib.config.mjs`: `build.lib` with entries `{ index: 'src/core/index.ts', vue:
  'src/vue/index.ts', react: 'src/react/index.ts', apiable: 'src/apiable/index.ts' }`, `formats:
  ['es']`, `fileName: (_, name) => `${name}.js``, `outDir: 'dist-lib'` (not `dist/`, which the
  Pages build owns — see D), `rollupOptions.external: ['vue', 'react', 'react-dom',
  'react/jsx-runtime', 'flex-url']`, `sourcemap: true`, `minify: false` (consumers minify).
  Plugins: the React plugin is only needed if any entry contains JSX — `src/react/index.ts`
  should not; the Vue plugin is not needed (no `.vue` in the entries). Keep the config
  plugin-free if that holds.
- Styles: copy `src/styles/tokens.css` to `dist-lib/tokens.css` and write
  `dist-lib/styles.css` as `tokens.css` + `filtered-search.css` concatenated (a tiny
  `scripts/build-styles.mjs` or a Vite plugin `closeBundle` hook — your choice, no new
  dependency).
- Declarations: `tsconfig.build.json` extending `tsconfig.json` with `noEmit: false`,
  `declaration: true`, `emitDeclarationOnly: true`, `declarationMap: true`, `outDir:
  'dist-lib/types'`, `rootDir: 'src'`, `include: ['src/core', 'src/vue', 'src/react',
  'src/apiable']`. Run with `vue-tsc -p tsconfig.build.json`. Verify every `.d.ts` imports only
  from relative paths inside `dist-lib/types` or from the externals.
- Scripts: `build:lib` = declarations + vite lib build + styles; `prepack` = `npm run build:lib`
  so `npm pack`/`npm publish` never ship a stale build.

### D. `package.json` for publishing

```json
"name": "search-builder", "version": "0.1.0", "type": "module",
"description": "Headless tools for building advanced search experiences",
"keywords": ["search", "filter", "combobox", "headless", "vue", "react", "accessibility", "aria", "apiable"],
"files": ["dist-lib", "LICENSE", "README.md", "CHANGELOG.md"],
"sideEffects": ["*.css"],
"engines": { "node": ">=18" },
"exports": {
  ".":          { "types": "./dist-lib/types/core/index.d.ts",    "import": "./dist-lib/index.js" },
  "./vue":      { "types": "./dist-lib/types/vue/index.d.ts",     "import": "./dist-lib/vue.js" },
  "./react":    { "types": "./dist-lib/types/react/index.d.ts",   "import": "./dist-lib/react.js" },
  "./apiable":  { "types": "./dist-lib/types/apiable/index.d.ts", "import": "./dist-lib/apiable.js" },
  "./styles.css": "./dist-lib/styles.css",
  "./tokens.css": "./dist-lib/tokens.css",
  "./package.json": "./package.json"
},
"publishConfig": { "access": "public", "provenance": true }
```

Remove `private`. Keep `repository`, `homepage`, `license`, the peer dependencies and their
optional meta. Add `"bugs"`. Add `CHANGELOG.md` with a `0.1.0` entry (Keep a Changelog format,
a short list of what ships). Add `dist-lib` to `.gitignore`.

### E. Proof the tarball works — `tests/pack.mjs` and `npm run test:pack`

A Node script that: runs `npm pack --pack-destination .tmp/pack` (this triggers `prepack`);
creates `.tmp/pack/vue-app` and `.tmp/pack/react-app`, each a minimal Vite project written by
the script (a `package.json` with `vue`/`react` + `react-dom` + `flex-url` + the tarball as
`file:` dependencies and the matching Vite plugin, an `index.html`, one entry that imports
`search-builder/vue` or `search-builder/react`, `search-builder/apiable`, and
`search-builder/styles.css`, mounts the bar with two filters and calls `createApiable(...)
.requestUri`); runs `npm install` and `vite build` in each; serves each `dist/` and drives it
with Playwright: the combobox mounts, opening it lists the two filters, choosing one advances
to values, the plain stylesheet applied (`getComputedStyle` of `[data-fs='bar']` has a border),
and `errors` is empty. Also type-check the Vue and React scratch entries as `.ts`/`.tsx` with
a scratch `tsconfig` (`moduleResolution: bundler`) so the `exports.types` paths are proven to
resolve. Report timings; keep it under ~2 minutes. Add `test:pack` to `npm test` at the end.

### F. Workflows

- `.github/workflows/ci.yml`: on push to `main` and on pull requests: `npm ci`, `npx playwright
  install --with-deps chromium`, `npm test`. Concurrency per ref.
- `.github/workflows/release.yml`: on tags `v*`: same checks, then `npm publish` with
  `permissions: id-token: write` and `actions/setup-node` `registry-url:
  https://registry.npmjs.org`. No `NODE_AUTH_TOKEN` secret: the package will be configured for
  npm trusted publishing after its first (local) publish. Add a comment saying exactly that.
- `pages.yml` stays; make sure the Pages build (`npm run build`) still outputs to `dist/`.

### G. README for consumers

Rewrite `README.md` top to bottom for someone who installs the package:

1. Name, tagline, one-paragraph description, demo links (three pages), pre-1.0 notice.
2. Install: `npm i search-builder` plus the peer you need (`vue`, `react`+`react-dom`,
   `flex-url`).
3. Quick start: Vue (composable + minimal template), React (hook + minimal JSX), both with
   `search-builder/styles.css`. Then "bring your own CSS" pointing at the headless page and the
   `data-fs` contract table (moved from today's README).
4. Filter definitions: the `FilterDef`/`Operator`/`Value`/`Token` shapes.
5. `search-builder/apiable`: the factory, the wire mapping table, negation, commas.
6. Keyboard and accessibility (today's tables, trimmed).
7. Architecture in five lines with links to `docs/plan`, `docs/adr`,
   `docs/headless-filtered-search.md`.
8. Development: scripts, tests, Pages.

Keep the voice of the current README. Move anything historical you cut into
`docs/headless-filtered-search.md` only if it is not already there; otherwise drop it.

## Constraints

- Style as the repo. `src/core/**` imports nothing outside `src/core`; `src/apiable/**` imports
  only `flex-url` and `../core` types; `src/vue`/`src/react` unchanged except the rename.
- The three demo pages must render and behave exactly as before. All existing suites stay
  green after the renames; do not weaken assertions.
- No git commands; no `npm publish`; no `npm login`. The user is handling npm auth separately.
- Run `npm test` sequentially. A dev server may be on 127.0.0.1:5173; leave it.
- Do not touch `docs/adr/**`, `docs/plan/**`, `docs/handoff/**`.

## Acceptance

- `npm run typecheck && npm test` green, including `test:pack`.
- `npm pack --dry-run` lists only `dist-lib/**`, `LICENSE`, `README.md`, `CHANGELOG.md`,
  `package.json`; the tarball contains no demo data (grep for `Nadia`, `ISSUES`, `PEOPLE`),
  no bundled `vue`/`react`/`flex-url` code, and every `.js` entry has its `.d.ts`.
- `grep -rn "FilteredSearch\|filtered-search" src tests` returns only the file name
  `docs/headless-filtered-search.md` references and the `data-fs`/CSS contract.

## Report back with

Files changed; the final `exports` map; `npm pack --dry-run` output; `test:pack` timings;
anything you could not make work and why; suite counts.
