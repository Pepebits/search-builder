# Hand-off — Phase 0 + Phase 1 implementation

For: the implementing agent (Sonnet 5). Read, in this order: `docs/plan/headless-package.md`,
`docs/adr/0001` … `0005`, then `src/composables/useFilteredSearch.js` in full, then the two
consumers `src/components/FilteredSearch.vue` and `src/components/HeadlessSearch.vue`, then
`tests/interaction.mjs` (the `fresh()` helper shows what the DOM must look like).

## The one rule

**No behaviour changes.** Every attribute, id format, announcement string, focus move and
open/close decision stays exactly as the composable does it today. The five test suites are
the specification; you extend them, you do not weaken them. If a test has to change, the only
acceptable reason is an import path, and you say so in the report.

## Deliverables

### Phase 0 — tooling and packaging

1. `package.json`
   - move `flex-url` from `dependencies` to `peerDependencies` (`"^3.1.0"`) with
     `peerDependenciesMeta: { "flex-url": { "optional": true } }`; add it to `devDependencies`
     at the same range;
   - add `typescript` (latest 5.x) and `vue-tsc` (latest compatible with Vue 3.5) to
     `devDependencies`;
   - add script `"typecheck": "vue-tsc --noEmit"`, and add `npm run typecheck &&` in front of
     the existing `test` script;
   - add `"test:core": "node tests/core.mjs"` and put `node tests/core.mjs` into `test` right
     after `node tests/url.mjs`.
2. `tsconfig.json` per ADR-0002 (`strict`, `verbatimModuleSyntax`, `isolatedModules`,
   `moduleResolution: "bundler"`, `noEmit`, `allowJs: true`, `checkJs: false`, `jsx: "preserve"`
   for later, `include: ["src", "tests"]`, `types: []` unless something needs DOM lib — it does:
   `lib: ["ES2022", "DOM", "DOM.Iterable"]`).
3. `src/vite-env.d.ts` or `src/shims-vue.d.ts` so `.vue` imports type-check.
4. `npm install`, then `npm run typecheck` must pass on the *existing* JS (with `checkJs: false`
   this is mostly the `.vue` files; fix only what is needed to get green, do not start
   converting).

### Phase 1 — the core and the Vue adapter

Create the files listed in ADR-0004 under `src/core/` and `src/vue/`. Guidance per file:

- `core/types.ts` — `Operator`, `Value`, `FilterDef`, `Token` (`TextToken | FilterToken`),
  `Stage`, `Option`, `OptionGroup`, `IndexedOption`, `IndexedGroup`, `Status`,
  `FilteredSearchOptions`, `FilteredSearchState`, `FilteredSearchStore`. Derive them from the
  JSDoc and the data in `src/data/filters.js`; `Value` has `value, label, color?, initials?,
  avatar?, sub?, special?`; `FilterDef` has `key, label, param?, operators, values?,
  fetchValues?, specialValues?, repeatable?, freeValue?, kind?`.
- `core/state.ts` — `initialState(options)`, and every transition as a pure function
  `(state, options, …args) => state` or, where a transition needs to announce or fetch, a
  function that receives the `ctx` (commit, announce, options). Keep the composable's function
  names: `selectOption`, `applyDraft`, `confirmDraft`, `stepBack`, `cancelDraft`, `startEdit`,
  `commitToken`, `handleBackspace` (takes a `{ preventDefault }`-shaped event), `removeToken`,
  `commitPendingText`, `clearAll`, `submit`, `move`, `jump`, `escape`, `discardDraft`,
  `startEditPart`, `open`, `close`, `setQuery`, `setTokens`, `rememberRecent`, `carryValues`.
- `core/derive.ts` — `defOf`, `operatorFor`, `operatorWords`, `operatorSymbol`, `valuePool`,
  `valueLabel`, `spokenToken`, `draftSpoken`, `usedKeys`, `groups`, `flatOptions`,
  `indexedGroups`, `listboxLabel`, `placeholder`, `status`, `canApply`, `isMultiSelect`,
  `isChosen`, `appliedSummary`, `tokenLabel`, `tokenValues`, `isEditing`, `hasOperatorChoice`,
  `operatorText`, `chipOperator`, `chipValues`, `isNegated`, `partName`. Same output as today.
  Memoise `groups`/`flatOptions` on the identity of `(state, options.filters)`.
- `core/announce.ts` — per ADR-0005 §7.
- `core/connect.ts` — per ADR-0005 §4. `onPointerDownCapture` must stay in the capture phase.
- `core/props.ts` — per ADR-0005 §5, React-cased handlers, no `ref`. Same attribute set as
  today's getters, including `data-fs`, `data-stage`, `data-open`, `data-type`, `data-editing`,
  `data-negated`, `data-pending`, `data-token`, `data-edit`, `data-active`, `data-kind`,
  `aria-activedescendant`, `aria-multiselectable`, `aria-busy`, `hidden`.
- `core/store.ts` — `createFilteredSearch(options)`; `commit` with the post-transition rules of
  ADR-0005 §2 in that order; synchronous notify once per commit; `setOptions`; `connect`.
- `core/index.ts` — exports: `createFilteredSearch`, every getter, `toneHue`, `nextTokenId`,
  and the types.
- `core/tone.ts` — move `toneHue` and `TONE_HUES` here unchanged.
- `vue/normalize.ts` — the mapping in ADR-0005 §5.
- `vue/index.ts` — `useFilteredSearch(options)` with **exactly today's return shape and names**
  (see the `return { … }` at the end of the composable: `ids, optionId, rootRef, inputRef,
  listRef, query, isOpen, stage, activeIndex, groups, indexedGroups, flatOptions, status,
  loading, listboxLabel, placeholder, appliedSummary, announcement, canApply, draftDef,
  draftOperator, draftValues, draftSpoken, isMultiSelect, isChosen, editingId, editPart,
  open, close, focusInput, openAndFocus, submit, move, jump, selectOption, applyDraft,
  confirmDraft, stepBack, cancelDraft, escape, handleBackspace, carryValues, startEdit,
  startEditPart, removeToken, clearAll, commitPendingText, resetDraft, scrollActiveIntoView,
  spokenToken, valueLabel, operatorWords, operatorSymbol, operatorText, defOf, tokenLabel,
  tokenValues, isEditing, isNegated, hasOperatorChoice, chipOperator, chipValues, partName,
  getRootProps, getLabelProps, getInputProps, getFieldsetProps, getTokenListProps,
  getTokenProps, getPendingProps, getOperatorProps, getValueProps, getRemoveProps,
  getListboxProps, getGroupProps, getOptionProps, getStatusRowProps, getHintProps,
  getAppliedProps, getLiveRegionProps, getApplyProps, getDiscardProps, getClearProps,
  getSubmitProps`). State members that are refs today (`query`, `isOpen`, `stage`, …) stay
  **refs/computeds** so `s.canApply.value` in `HeadlessSearch.vue` keeps working; back them
  with one `shallowRef<FilteredSearchState>` updated from `subscribe`, and `computed`s over it.
  `query` must be writable (`onInput` sets it) — a writable `computed` calling `setQuery`.
  Accept `Ref | value` for `filters`, `label`, `resultCount`, `friendlyOperators`, and a `Ref`
  for `tokens` (two-way, ADR-0005 §3). Call `connect` when the root element ref becomes
  non-null (`watch(rootRef, …, { immediate: true })`), disconnect in `onScopeDispose`.
- Delete `src/composables/useFilteredSearch.js`. Update the three importers
  (`FilteredSearch.vue`, `HeadlessSearch.vue`, `IssueList.vue` for `toneHue`) to
  `../vue` / `../core`.
- `tests/core.mjs` — Node, no DOM, importing `../src/core/index.ts` directly (Node 24 strips
  types; keep the core to erasable syntax). Use the same `check(name, got, want)` style as the
  other suites. Cover at least: initial state; filter → operator → value transitions with
  `selectOption`; multi-select toggle and `applyDraft`; `confirmDraft` guarded by `canApply`
  and idempotent; `stepBack` at each stage; `startEdit` + `carryValues` one-step operator
  change; `commitPendingText`; `handleBackspace` removing the last chip; `groups` for the three
  stages including `Free text`, `Typed value`, `Recently used`; post-transition rules 1–3
  (typing opens, activeIndex resets when the option list changes, no-matches announced once);
  `setTokens` no-op on same reference; `onTokensChange` fired on commit; prop getters return
  React-cased handlers and no `ref`; ids use the `id` option when given.

## Constraints

- Coding style: single quotes, no semicolons, 2-space indent, the same comment voice as the
  existing files (explain *why*, briefly).
- `src/core/**` imports nothing from outside `src/core`. Not Vue, not `flex-url`, not `src/data`.
- Do not modify `tests/url.mjs`, `tests/interaction.mjs`, `tests/browser.mjs`,
  `tests/headless.mjs` except, if unavoidable, an import path — and report it.
- Do not modify `src/styles/**`, `src/data/**`, `src/App.vue`, `src/main.js`,
  `src/headless-entry.js`, the Vite configs.
- Do not touch `docs/**` beyond adding a short "Core / adapters" pointer paragraph at the top of
  `README.md`'s architecture section that links to `docs/plan/headless-package.md`.
- Work incrementally: get `tests/core.mjs` passing against the core first, then wire the Vue
  adapter and run `npm run test:logic` (jsdom, fast) until green, then the two Playwright
  suites, then `npm run typecheck`, then `npm test` as a whole. Playwright browsers are
  installed.
- Do not run `git` commands; the repo is not under version control.
- A Vite dev server may be running on 127.0.0.1:5173 from another session; leave it alone.

## Acceptance

- `npm test` green: url, core, interaction (76 before your change), browser (100), headless
  (32), plus typecheck.
- `src/composables/` gone; no file outside `src/core` and `src/vue` implements behaviour.
- `grep -rn "from 'vue'" src/core` returns nothing; `grep -rn "flex-url" src/core src/vue`
  returns nothing.
- `package.json` reflects Phase 0.

## Report back with

- File list created/removed/modified.
- Any place where reproducing a `watch` needed a judgment call, and what you chose.
- Test output per suite (counts, failures verbatim if any).
- Anything you deliberately left for the reviewer.
