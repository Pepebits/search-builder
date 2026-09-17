# ADR-0005 — State model, post-transition rules, DOM lifecycle and the prop dialect

Status: accepted, 2026-09-16. This is the ADR the implementer reads twice.

## 1. State is one immutable object; `commit` is the only way to change it

```ts
interface FilteredSearchState {
  tokens: Token[]
  query: string
  isOpen: boolean
  activeIndex: number
  stage: 'filter' | 'operator' | 'value'
  draftKey: string | null
  draftOperator: string | null
  draftValues: string[]
  editingId: string | null
  editPart: 'operator' | 'value'
  loading: boolean
  fetched: Value[]
  recents: Record<string, string[]>
  announcement: string
}
```

Every action computes a new state and calls `commit(next)`. `commit` runs the post-transition
rules below, stores the state, and notifies subscribers **synchronously, once per commit**.
Adapters coalesce if their framework needs it (Vue's scheduler does; React batches inside
handlers).

Derived data (`groups`, `flatOptions`, `indexedGroups`, `status`, `placeholder`,
`listboxLabel`, `canApply`, `isMultiSelect`, `draftSpoken`, `appliedSummary`, `usedKeys`) is
computed by selectors in `derive.ts` from `(state, options)`. Memoise on the identity of the
inputs; never store derived data in state.

## 2. Post-transition rules (what the Vue `watch`es did)

Run inside `commit`, in this order, comparing `previous` and `next`:

1. **Typing reopens.** If `next.query !== ''` and it changed, set `isOpen = true`.
2. **Fresh option list starts at the top.** If the *flat option ids* derived from `next` differ
   from those derived from `previous`, set `activeIndex = 0`.
3. **No-matches is announced on entry.** If `status(next).kind === 'no-matches'` and
   `status(previous)?.kind !== 'no-matches'`, `announce('No matches found.', { count: false })`.
4. **Value fetch.** If `(stage, draftKey, query)` changed and `stage === 'value'` and the draft
   filter has `fetchValues`: bump the fetch sequence, set `loading = true`, announce
   `'Loading suggestions.'` (no count), await `fetchValues(query.trim())`, and if the sequence
   is still current commit `{ fetched, loading: false }`. If the stage is not `value` or the
   filter has no `fetchValues`, ensure `loading = false`.
5. **Active option scrolls into view.** If `activeIndex` changed, ask the connected DOM (see §4)
   to scroll `[data-active="true"]` into view on the next tick. No-op when not connected or when
   `scrollIntoView` is missing (jsdom).

Rules 1–3 may themselves change state; apply them to `next` before storing, do not re-enter
`commit`. Rule 4 is asynchronous and commits later through the normal path.

## 3. Tokens are owned by the core and synced by the adapter

- The core holds `state.tokens`. Actions that change tokens go through `commit` like anything
  else. `options.onTokensChange?.(tokens)` is called after such a commit.
- `store.actions.setTokens(tokens)` replaces them from outside. It is a no-op when the array is
  the same reference, which is what prevents adapter loops.
- Vue adapter: `watch(modelRef, setTokens)` one way; `onTokensChange` emits
  `update:modelValue` the other. React adapter: controlled `tokens` + `onTokensChange` props, or
  uncontrolled with `defaultTokens`.

## 4. DOM lifecycle: `connect(root)`

The core never touches `document` or `window` at creation. `store.connect(root: HTMLElement)`:

- registers `pointerdown` on `document` in the **capture phase** (see the composable's comment:
  bubble phase runs after the clicked option has been re-rendered away), and on an outside
  target calls `actions.confirmDraft()` then closes;
- resolves the input and the listbox from the root by attribute:
  `root.querySelector('[data-fs="input"]')`, `'[data-fs="listbox"]'`. **No `ref` in props.**
- implements `focusInput`, `restoreEditFocus(id, part)`, `scrollActiveIntoView` against those
  elements; before `connect`, they are no-ops that queue nothing;
- returns `disconnect()`.

`focusInput` stays **synchronous** when the element exists (the composable explains why:
buttons that remove themselves on click).

## 5. The prop dialect

Prop getters are pure: `getInputProps(state, api)`, where `api` is the store's actions plus the
derived selectors. They return plain objects in **one dialect**:

- attribute names as in HTML (`role`, `aria-*`, `data-*`, `id`, `hidden`, `type`, `value`,
  `placeholder`, `autocomplete`, `spellcheck`, `for`);
- event handlers in **React casing**: `onKeyDown`, `onInput`, `onClick`, `onMouseDown`,
  `onMouseMove`, `onPointerDown`, `onFocusOut`;
- no `ref`, no `class`/`className`, no `style`.

Each adapter has a `normalizeProps(props)`:

- Vue: `onKeyDown → onKeydown`, `onFocusOut → onFocusout`, `onMouseDown → onMousedown`,
  `onMouseMove → onMousemove`, `onPointerDown → onPointerdown`, `onInput`/`onClick` unchanged;
  `hidden: false` must render as no attribute (Vue does this for `false`). The Vue root getter
  additionally attaches the adapter's own `ref` so it can call `connect`.
- React (Phase 2): `onInput → onChange` on the input (controlled `value`), `for → htmlFor`,
  `spellcheck → spellCheck`, `autocomplete → autoComplete`, boolean `hidden` as is; the root
  getter attaches a callback `ref`.

Every `data-*` and `aria-*` value, every id format (`fs-<n>-input`, `fs-<n>-opt-<i>`, …) and
every announcement string stays byte-for-byte what it is today. The test suites assert them.

## 6. Options and their reactivity

```ts
interface FilteredSearchOptions {
  filters: FilterDef[]
  tokens?: Token[]                 // initial
  label?: string
  resultCount?: number | null
  friendlyOperators?: boolean
  recentLimit?: number
  id?: string                      // scope for ids; default `fs-<counter>`
  onSubmit?: (tokens: Token[]) => void
  onAnnounce?: (text: string) => void
  onTokensChange?: (tokens: Token[]) => void
}
```

`store.setOptions(partial)` replaces the given keys and commits (so selectors re-derive). The
Vue adapter accepts refs or plain values for `filters`, `label`, `resultCount`,
`friendlyOperators`, unwraps them with `unref` and watches them into `setOptions`, which is how
today's `Ref | value` parameters keep working.

## 7. Announcements

`announce(message, { count })` keeps today's mechanism: bump a sequence, clear the live text,
and write on the next animation frame (or microtask when `requestAnimationFrame` is missing);
the result count is read from options **at write time**, appended as ` N result(s).` when
`count` is true and `resultCount` is a number; `onAnnounce` receives the final text.
