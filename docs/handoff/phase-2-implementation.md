# Hand-off — Phase 2 implementation: React adapter + demo site

For: the implementing agent (Sonnet 5). Read, in this order: `docs/plan/headless-package.md`,
`docs/adr/0005-state-and-props-contract.md` (§3, §4, §5 especially), `docs/adr/0006`, then the
finished Vue adapter `src/vue/index.ts` and `src/vue/normalize.ts` (the shape you mirror), the
core entry `src/core/index.ts` and `src/core/props.ts` (what the getters emit), then
`src/components/HeadlessSearch.vue` and `src/styles/filtered-search.css` (the markup and class
hooks the React demo reproduces), then `tests/headless.mjs` (the suite you parametrise).

## The one rule

The core is finished and reviewed. **Do not change `src/core/**` or `src/vue/**`.** If the React
adapter genuinely cannot be built without a core change, stop, write down what and why in your
report, and build everything else. The DOM suites for Vue must stay byte-for-byte unchanged and
green.

## Deliverables

### A. The React adapter — `src/react/`

- `src/react/normalize.ts` — the core's prop dialect → React, per ADR-0005 §5: `onInput → onChange`
  (the input is controlled: `value` + `onChange`), `onFocusOut → onBlur` (React's `onBlur`
  bubbles, so it is the focusout equivalent), `for → htmlFor`, `spellcheck → spellCheck`
  (string `'false'` stays a string), `autocomplete → autoComplete`, `hidden` boolean as is,
  `onKeyDown`/`onClick`/`onMouseDown`/`onMouseMove`/`onPointerDown` unchanged. Everything the
  core can emit must be covered; an unmapped handler is a silent no-op.
- `src/react/index.ts` (or `.tsx` only if JSX is needed; it should not be) — export
  `useFilteredSearch(options)`. Keep the Phase 4 rename out of scope.
  - **Store**: created once with `useState(() => createFilteredSearch(...))`. Subscribe with
    `useSyncExternalStore(store.subscribe, store.getState, store.getState)`.
  - **Options**: `filters`, `label`, `resultCount`, `friendlyOperators`, `recentLimit`, `id`,
    `onSubmit`, `onAnnounce` as plain props. Push changes with `useEffect(() =>
    store.setOptions({ filters }), [filters])` etc. — one effect per option so an unrelated
    re-render does not re-commit. Keep the latest `onSubmit`/`onAnnounce` in refs read by
    stable wrappers, so a new callback identity on every render costs nothing.
  - **Tokens** (ADR-0005 §3): controlled `tokens` + `onTokensChange`, or uncontrolled with
    `defaultTokens`. Controlled: `useEffect(() => { store.actions.setTokens(tokens) }, [tokens])`
    one way; the store's `onTokensChange` calls the prop the other. The same-reference no-op in
    `setTokens` is what stops the loop — do not add extra guards that would mask a real bug.
  - **DOM lifecycle** (ADR-0005 §4): the root getter returns a callback `ref`; on a non-null
    element call `store.connect(el, schedule)`, on null/unmount call the returned disconnect.
    `schedule` must run its callback **after React has committed the re-render that follows the
    current store commit**: implement it as a queue drained in a `useLayoutEffect` with no deps
    (runs after every commit) plus a microtask fallback for calls that cause no re-render.
    Whatever you choose, `focusInput` after removing a chip, `restoreEditFocus` after Escape on
    an edit, and `scrollIntoView` of the active option must behave as in the Vue suites.
  - **Return shape**: the Vue adapter's names, with plain values where Vue has refs
    (`query`, `isOpen`, `stage`, `activeIndex`, `groups`, `indexedGroups`, `flatOptions`,
    `status`, `loading`, `listboxLabel`, `placeholder`, `appliedSummary`, `announcement`,
    `canApply`, `draftDef`, `draftOperator`, `draftValues`, `draftSpoken`, `isMultiSelect`,
    `editingId`, `editPart`), the same helpers (`isChosen`, `spokenToken`, `valueLabel`, …,
    `partName`), the same actions (`cancelDraft` aliased to `discardDraft` as in Vue), `ids`,
    `optionId`, and the 21 getters, each through one `toReactProps` helper. No `rootRef` /
    `inputRef` / `listRef` refs: React consumers get the root via the callback `ref` in
    `getRootProps()`; expose `focusInput` for the rest.
  - Handlers passed to React must be stable enough not to defeat memoisation, but correctness
    first: getters may return fresh objects each render, exactly like Vue.

### B. The React demo — `src/components/ReactSearch.tsx` + `src/react-entry.tsx` + `react.html`

- `ReactSearch` renders the **same structure as `HeadlessSearch.vue`** but with the class hooks
  the plain stylesheet expects (`fs-combo`, `fs-icon`, `fs-key`, `fs-field`, `fs-actions`,
  `fs-check`, `fs-sym`, `fs-dot`, `fs-av`, `fs-name`, `fs-sub`, `fs-hint-x`, `fs-group-name`)
  and imports `src/styles/tokens.css` + `src/styles/filtered-search.css`. This is the proof that
  the plain CSS works with no Tailwind and no Vue. Person avatars use `toneHue` with the
  `--fs-tone-h` custom property, as the Vue component does.
- `src/react-entry.tsx` mounts it with the same seeded tokens and the same result list as
  `src/headless-entry.js` (reuse `FILTERS`, `ISSUES`, `applyTokens`), plus `resultCount`.
- `react.html` at the repo root loads it. Add `headless.html` at the root loading
  `src/headless-entry.js` the same way, and give all three pages (`index.html`, `headless.html`,
  `react.html`) a small shared top nav: "Styled (Vue)", "Headless (Vue)", "React (plain CSS)",
  plain `<nav>` markup with relative links (`./`, `./headless.html`, `./react.html`) so it works
  under a base path. Style it minimally in `src/styles.css` (demo stylesheet) — the headless
  and React pages should import `src/styles.css` too, only for the page furniture.

### C. Build and tooling

- `vite.config.js`: add `@vitejs/plugin-react` next to the Vue plugin (they select by file
  type), `build.rollupOptions.input` with the three HTML pages, and `base: process.env.BASE_PATH
  ?? '/'` (the Pages workflow in `.github/workflows/pages.yml` sets `/search-builder/`).
- `vite.react.config.mjs`: like `vite.headless.config.mjs` but with the React plugin, entry
  `src/react-entry.tsx`, out `.tmp/react-build`. `define` `process.env.NODE_ENV` as production
  so React's dev warnings still fire? No — keep production like the others, **but** in
  `tests/react.mjs` also run one page in a development build? Keep it simple: production build
  for the suite, and add a second tiny config or a `mode` switch only if you find a warning
  worth catching. Document the choice.
- `package.json`: `react`, `react-dom`, `@types/react`, `@types/react-dom`,
  `@vitejs/plugin-react` in `devDependencies`; `react` (`>=18`) and `react-dom` in
  `peerDependencies` with `peerDependenciesMeta` optional, next to `flex-url`; scripts
  `build:react`, `test:react` (`npm run build:react && node tests/react.mjs`), and `node
  tests/react.mjs` appended to `test` after the headless step (with its build).
- `tsconfig.json`: `jsx: "react-jsx"`. `npm run typecheck` must cover `src/react`.

### D. Tests — `tests/react.mjs`

A parametrised copy of `tests/headless.mjs`: same `fresh()`, same `state()`, same assertions
H1–H8, I1–I9, J1–J7, K1–K5, L1–L3 against `.tmp/react-build/app.js`, renumbered with an `R`
prefix if you like. Add:

- controlled typing: `page.keyboard.type('assign')` reaches the query (the input is controlled;
  a broken `onChange` mapping would freeze it);
- Tab from the input with a multi-select draft commits once (auto-confirm through `onBlur`);
- an external token replacement from the host (call a function exposed on `window` by the
  entry, e.g. `window.__setTokens([])`) empties the chips;
- `errors` stays empty — React prints its warnings with `console.error`, so this catches
  controlled-input and key warnings too.

`npm test` must end green across all seven steps: typecheck, url, core, interaction, browser,
headless, react.

## Constraints

- Style as the repo: single quotes, no semicolons, 2-space indent, comments explain *why*.
- `src/react/**` imports only from `react` and `../core`. Nothing from `src/vue`, `src/data`,
  `flex-url`.
- Do not edit `src/core/**`, `src/vue/**`, `tests/url.mjs`, `tests/core.mjs`,
  `tests/interaction.mjs`, `tests/browser.mjs`, `tests/headless.mjs`, `src/styles/**`
  (the plain stylesheet is the contract the React demo must satisfy, not adapt),
  `.github/**`, `docs/**` except one short "Demos" section in `README.md` naming the three
  pages and the `BASE_PATH` build variable.
- No git. A Vite dev server from another session may be on 127.0.0.1:5173; leave it alone.
- Run suites sequentially (`npm test`), never in parallel: builds share `.tmp/`.

## Report back with

- Files created/modified; the `schedule` strategy you chose and why; how `onBlur` maps to the
  focusout rule and whether anything differed from Vue; anything left for the reviewer;
  suite counts, failures verbatim if any.
