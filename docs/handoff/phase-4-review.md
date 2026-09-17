# Hand-off — Phase 4 review: the publishable package

For: the reviewing agent (Opus 5). Code only; the implementer's summary is withheld. Read
`docs/handoff/phase-4-implementation.md` and `docs/adr/0006`, then `package.json`,
`tsconfig.build.json`, `vite.lib.config.mjs`, `src/apiable/index.ts`, `tests/pack.mjs`,
`tests/url.mjs`, `.github/workflows/*.yml`, `CHANGELOG.md`, `README.md`, and the renamed
surfaces in `src/core/index.ts`, `src/vue/index.ts`, `src/react/index.ts`.

## Run first

```
npm run typecheck
npm test                       # includes test:pack
npm pack --dry-run
BASE_PATH=/search-builder/ npm run build && ls dist
```

Report suite counts, the dry-run file list, and that the Pages build still emits three pages.

## Priority list

1. **What ships.** Unpack the tarball (`npm pack --pack-destination .tmp/review && tar -tzf`)
   and check: no demo data (`grep -l "Nadia\|ISSUES\|PEOPLE\|LABELS" dist-lib -r`), no bundled
   framework code (`grep -c "createElementVNode\|useSyncExternalStore" dist-lib/*.js` should be
   0 for Vue internals in `vue.js` and React internals in `react.js` — imports only), no
   `flex-url` code inlined in `apiable.js`, source maps present, both CSS files present,
   `LICENSE`, `README.md`, `CHANGELOG.md`.
2. **Exports resolve.** From a scratch directory with the tarball installed, `node -e
   "import('search-builder').then(m => console.log(Object.keys(m)))"` and the same for `/vue`,
   `/react`, `/apiable` (with peers installed). Run `npx --yes @arethetypeswrong/cli --pack .`
   if the network allows and report its table; otherwise type-check a scratch `.ts` that imports
   all four entries with `moduleResolution: bundler` and `node16`.
3. **Types.** Open each `dist-lib/types/**/index.d.ts`: imports must be relative within
   `dist-lib/types` or to the externals; no path back into `src/`; no `any` in the public
   surface; the renamed identifiers everywhere; `SearchBuilderStore['actions']` complete.
4. **The apiable factory.** No import from `src/data`; `PLAIN` semantics identical to the old
   module (compare `tests/url.mjs` expectations before and after — same strings); `schema()`
   equals what `schemaFor` produced for the demo inputs; `urlToTokens` still ignores unknown
   attributes and undeclared operators.
5. **Renames complete, contract intact.** `grep -rn "FilteredSearch\|createFilteredSearch\|
   useFilteredSearch" src tests README.md` → nothing but prose history. `data-fs`, `fs-<n>-*`,
   `--fs-*`, `.fs-*` unchanged — the DOM suites prove it.
6. **Workflows.** `ci.yml` runs the full suite with Playwright installed; `release.yml` has
   `id-token: write`, `registry-url`, no token secret, fires on `v*` tags only, and runs the
   tests before publishing; `pages.yml` untouched and still building `dist/` not `dist-lib/`.
7. **`tests/pack.mjs`.** Does it really prove use through the tarball (not through `src/`)?
   Does the scratch React app render under StrictMode? Is the temp directory cleaned or
   ignored? Is the runtime acceptable?
8. **README.** Every code sample must type-check against the shipped entries; try them.
   Install lines list the right peers. The pre-1.0 notice is present. No mention of internal
   agents or process.
9. **Simplifications** before `0.1.0`, one line each, not applied.

## Do not

- Do not publish, do not log in to npm, do not run git. Fix only what is needed for a suite,
  the tarball or the exports to be correct, and say exactly what you changed. Do not touch
  `docs/adr/**`, `docs/plan/**`, `docs/handoff/**`.

## Report format

Findings most severe first with file:line and how you verified; suite counts after your
changes; the dry-run file list; the simplification list; one-line verdict: publishable as
`0.1.0`, or not, and why.
