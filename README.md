# Filtered Search

A token search bar — filter, operator, value — built with Vue 3 `<script setup>`, focused on accessibility.
**Headless**: the behaviour and the ARIA live in a composable and are handed out as prop getters,
so any markup can carry them.

```
npm install
npm run dev
npm test
```

Taking this to another project, or fixing a selector you already have?
**[docs/headless-filtered-search.md](docs/headless-filtered-search.md)** is a self-contained
implementation plan: the full contract, every bug this hit and why, and a retrofit checklist
ordered by impact.

## Demos

`npm run dev` (or `npm run build` + `npm run preview`) serves three pages, linked from a shared
nav:

| Page | What it shows |
| --- | --- |
| `index.html` | The styled bar, in Tailwind — `src/components/FilteredSearch.vue`. |
| `headless.html` | The same behaviour, unstyled, in Vue — `src/components/HeadlessSearch.vue`. |
| `react.html` | The same behaviour again, in React, over the plain stylesheet with no Tailwind and no Vue — `src/components/ReactSearch.tsx`. |

`npm run build` builds all three into `dist/`. The GitHub Pages workflow
(`.github/workflows/pages.yml`) builds the same way with `BASE_PATH=/search-builder/`, which
`vite.config.js` reads as its `base` — set that variable to deploy under a subpath yourself.

## Headless usage

`useFilteredSearch` owns the state, the keyboard, the live region and every `aria-*`. It gives
back **prop getters** — objects of attributes and handlers to spread with `v-bind`.

```vue
<script setup>
const s = useFilteredSearch({tokens, filters, label, resultCount})
</script>

<template>
  <section v-bind="s.getRootProps()">
    <label v-bind="s.getLabelProps()">{{ label }}</label>

    <ol v-bind="s.getTokenListProps()">
      <li v-for="t in tokens" v-bind="s.getTokenProps(t)" :key="t.id">
        {{ s.tokenLabel(t) }}
        <button v-bind="s.getOperatorProps(t)">{{ s.chipOperator(t) }}</button>
        <button v-bind="s.getValueProps(t)">{{ s.chipValues(t) }}</button>
        <button v-bind="s.getRemoveProps(t)">x</button>
      </li>
    </ol>

    <input v-bind="s.getInputProps()">

    <div v-bind="s.getListboxProps()">
      <div v-for="g in s.indexedGroups.value" v-bind="s.getGroupProps(g)" :key="g.id">
        <b aria-hidden="true">{{ g.label }}</b>
        <span v-for="o in g.options" v-bind="s.getOptionProps(o)" :key="o.id">{{ o.label }}</span>
      </div>
      <p v-if="s.status.value" v-bind="s.getStatusRowProps()">{{ s.status.value.text }}</p>
    </div>

    <p v-bind="s.getHintProps()">Arrow keys browse, Enter selects.</p>
    <p v-bind="s.getAppliedProps()">{{ s.appliedSummary.value }}</p>
    <p v-bind="s.getLiveRegionProps()">{{ s.announcement.value }}</p>
  </section>
</template>
```

That is `src/components/HeadlessSearch.vue` in full — 60 lines, no stylesheet, and it passes the
same 32 accessibility cases as the styled bar (`npm run test:headless`).

### Options

| Option | Notes |
| --- | --- |
| `tokens` | Required. The `v-model` ref the composable reads and writes. |
| `filters` | Required. Definitions, or a ref/computed of them. |
| `label` | Names the search landmark and the input. |
| `resultCount` | When given, announcements end with the new count. |
| `friendlyOperators` | Draw operators as words rather than symbols. |
| `onSubmit` | Called with the tokens when the search runs. |
| `onAnnounce` | Extra sink for live-region sentences, if you want to log them. |
| `recentLimit` | How many "Recently used" values to keep. Default 3. |

### Getters

`getRootProps` `getLabelProps` `getInputProps` `getFieldsetProps` · `getTokenListProps`
`getTokenProps` `getOperatorProps` `getValueProps` `getRemoveProps` · `getListboxProps`
`getGroupProps` `getOptionProps` `getStatusRowProps` · `getHintProps` `getAppliedProps`
`getLiveRegionProps` · `getApplyProps` `getDiscardProps` `getClearProps` `getSubmitProps`

Render options from `indexedGroups`, not `groups`: each option carries the position that its id
and `aria-activedescendant` are built from. Write your own `:key`; the getters do not set one.

## Styling — Tailwind

Tailwind v4 is the default. `@tailwindcss/vite` is in every Vite config and
`src/styles/tailwind.css` is the entry.

The palette stays in `src/styles/tokens.css` and `@theme inline` only re-publishes those custom
properties under Tailwind's names:

```css
@theme inline {
  --color-surface: var(--fs-surface);
  --color-chip:    var(--fs-chip-bg);
  --color-accent:  var(--fs-accent);
}
```

So `bg-surface` resolves to `var(--fs-surface)`, which already switches with the theme — **there
is not one `dark:` variant in the component**. Re-theme by redefining the tokens; every utility
that reads them follows.

### State variants

The state is already in the DOM for the accessibility tree, so Tailwind can see it. Five custom
variants in `tailwind.css` name the ones worth reading:

| Variant | Matches | Means |
| --- | --- | --- |
| `state-active:` | `[data-active="true"]` | the highlighted suggestion |
| `state-chosen:` | `[aria-selected="true"]` | a chosen value, under a multi-value operator |
| `state-editing:` | `[data-editing]` | the chip being changed |
| `state-negated:` | `[data-negated]` | a filter that excludes |
| `state-pending:` | `[data-pending]` | a filter still being built |
| `state-busy:` | `[aria-busy="true"]` | the list, while values are being fetched |
| `in-editing:` `in-negated:` `in-pending:` | an ancestor in that state | for a chip's inner parts |

```html
<li :class="'border border-chip-line state-editing:border-dashed'">
  <span :class="'in-negated:bg-chip-not in-negated:text-chip-not-ink'">…</span>
```

Nothing is duplicated to make this work: if the component behaves differently, the CSS already
knows, because the attribute it reads is the one a screen reader reads.

### Two things that will bite you

1. **Unlayered CSS beats utilities.** Tailwind v4 puts utilities in `@layer utilities`, and any
   plain unlayered rule wins over a layered one *whatever the specificity*. A bare
   `:focus-visible {}` in a page stylesheet silently overrode the component's `outline-none`
   here. Keep page CSS on page selectors, or wrap it in a layer.
2. **Arbitrary variants cannot nest brackets.** `[&_:focus-visible:not([data-fs=input])]:…` does
   not parse — the inner `]` ends the variant. Put the utility on the element instead of
   reaching for it from an ancestor.

### Not using Tailwind

`src/styles/filtered-search.css` is the same design as plain CSS, every selector an attribute
selector. Drop the utility classes from `FilteredSearch.vue`, import that file, and you get the
identical result. Both work because the contract is the attributes, not the classes:

| Part (`data-fs`) | State it carries |
| --- | --- |
| `root` | `data-stage` (filter / operator / value), `data-open` |
| `label` `hint` `applied` `live` | text; the last three are visually hidden |
| `bar` | the click target that focuses the field |
| `tokens` `token` | `data-type`, `data-editing`, `data-negated`, `data-pending` |
| `operator` `value` `remove` | a chip's parts; `operator` is a `<button>` only when there is a choice |
| `listbox` | `hidden`, `aria-busy`, `aria-multiselectable`, `data-stage` |
| `group` `option` | `data-active` (highlight), `aria-selected` (chosen), `data-kind` |
| `status` | `data-kind`: loading / no-matches / empty |
| `apply` `clear` `submit` `discard` | actions; render the ones you want |

A `classNames` prop would have been a second copy of this state, synced by hand and wrong the day
the two diverge. The accessible attributes cannot drift — if they did, the component would be
broken for a screen reader first, and the tests catch that.

## Files

**Core / adapters:** the behaviour has moved out of the Vue composable and into a
framework-agnostic `src/core/` with thin per-framework adapters (`src/vue/` today, `src/react/`
later) — see [`docs/plan/headless-package.md`](docs/plan/headless-package.md) for the phased
plan and the ADRs it links to. The table below still describes the pre-split layout in one row
(`src/composables/...`, now `src/core/` + `src/vue/`); it will catch up as the later phases land.

| Path | What it holds |
| --- | --- |
| `src/composables/useFilteredSearch.js` | Everything: the three-stage state machine, the option list, the live region, the keyboard, and the prop getters. |
| `src/components/FilteredSearch.vue` | The styled bar. Markup and CSS over the getters — no ARIA of its own. |
| `src/components/HeadlessSearch.vue` | The unstyled example, and what `npm run test:headless` drives. |
| `src/lib/apiable.js` | tokens ↔ flex-url; `schemaFor` derives the apiable `EndpointSchema` a backend would publish. |
| `src/components/DebugPanel.vue` | demo only: backend schema, filter definitions, tokens, request, core state, announcements. |
| `src/components/IssueList.vue` | Result rows for the demo. |
| `src/data/filters.js` | Filter definitions. Add a filter here, not in the component. |
| `src/data/issues.js` | Sample issues, the token matcher, and sort orders. |
| `src/styles/tailwind.css` | Tailwind entry: `@theme` mapping and the state variants. |
| `src/styles/tokens.css` | The `--fs-*` palette, light and dark. The one thing to re-theme. |
| `src/styles/filtered-search.css` | The same design in plain CSS, for projects without Tailwind. |
| `src/styles.css` | Demo page only. |

## Using it

```vue
<FilteredSearch v-model="tokens" :filters="FILTERS" label="Search issues" @submit="run" />
```

- `v-model` — array of `{ id, type, operator, value }`. Free text is a token of type `text` with operator `~`.
- `filters` — see the shape documented at the top of `src/data/filters.js`. A definition with one operator skips the operator stage.
- `@submit` — fires on Enter when no suggestion is highlighted.
- Exposed via template ref: `focus()` and `compiled` (the tokens as query-string parts).

## Accessibility notes

- The input is the combobox (`role="combobox"`, `aria-expanded`, `aria-controls`); the suggestions are a sibling `role="listbox"`. Focus never leaves the input.
- The listbox is **never removed from the DOM** — it closes with `hidden` — so `aria-controls` always resolves.
- Highlighting sets `aria-activedescendant` and a `data-active` attribute. Under a multi-value operator the listbox is `aria-multiselectable` and `aria-selected` means *chosen*, not *highlighted*.
- Each suggestion section is a `role="group"` with an `aria-label`; the visible heading is decorative because the group already carries the name.
- Loading and empty rows sit **outside** the option set (`role="presentation"`), so an empty list never announces "1 of 1". Async filters set `aria-busy` and announce "Loading suggestions".
- Operators carry a `description` per filter, so accessible names read "Label is one of a11y and regression" while the chip shows `||`.
- `aria-describedby` on the input carries the keyboard hint **and** a sentence listing the filters already applied.
- Chips are `role="list"` / `role="listitem"` explicitly — `display: contents` drops those roles in several engines.
- Adding, removing, clearing, toggling a value, and discarding a draft all write to a `role="status"` live region, with the new result count when `result-count` is passed.
- Sorting uses a native `<label>` + `<select>`; the bar sits in a labelled `role="search"` landmark.
- A pending chip shows the filter being built with a `×` to discard it, and a *Search* button gives pointer users a way to submit.

## Keyboard

| Key | Single value | Multi-value operator (`||`, `!=`) |
| --- | --- | --- |
| `↓` `↑` | Move through suggestions, across groups | same |
| `Enter` | Take the suggestion, advance a stage | Toggle the value, list stays open |
| `Tab` | Leave the bar | Apply the chosen values, then leave |
| `→` (empty field) | — | Apply the chosen values, stay in the bar |
| `Esc` | Step back a stage | Clear chosen values, then step back |
| `Backspace` | On empty text: step back, or remove the last chip | same |
| `Home` / `End` | First / last suggestion | same |
| `Space` | On a chip's operator or value: re-open just that part | same |

## Tests

```
npm test              # all four suites
npm run test:url      # the flex-url boundary, no DOM
npm run test:logic    # jsdom
npm run test:browser  # Chromium, the styled bar
npm run test:headless # Chromium, the unstyled example
```

- `tests/url.mjs` — 18 cases over `src/lib/apiable.js`: every operator's wire form, the round
  trip, the encoding contract, and that unknown filters are dropped rather than crashed on.

- `tests/interaction.mjs` — 47 cases in **jsdom**. Fast, good for state and ARIA wiring.
- `tests/headless.mjs` — 32 cases in **Chromium** against `HeadlessSearch.vue`. The point of
  these: if an ARIA invariant hides in the styled markup instead of the composable, they fail.
- `tests/browser.mjs` — 63 cases in **Chromium** via Playwright. Needed for anything involving
  pointers or focus. jsdom does not run a microtask checkpoint between event listeners, and that
  is exactly where the mouse-selection bug lived: the outside-click check ran in the bubble
  phase, after Vue had re-rendered and detached the clicked node, so `contains()` reported
  "outside" and closed the list on every mouse selection. **Anything touching pointer or focus
  behaviour must be tested in `tests/browser.mjs` — jsdom will pass it wrongly.**

First run needs the browser: `npx playwright install chromium`.

jsdom does not put `TextDecoder`/`TextEncoder` on its `window`, and flex-url uses them for its
UTF-8 decoding contract; `tests/interaction.mjs` injects them in `beforeParse`. Real browsers
have them.

## Editing a filter already in the bar

Focus the **part** you want to change, press `Space` (or `Enter`). The
operator and the value are separate buttons, because wanting a different operator is not wanting
a different value.

- **Changing the operator is one step.** Pick a new one and the chip commits immediately, keeping
  the value it had. `carryValues()` decides: the value list opens only when the value genuinely
  cannot carry — more than one value under an operator that takes one, or a `None`/`Any` special
  under a multi-value operator.
- **Changing the value** opens the value list with what the chip already holds ticked.
- The chip is **edited in place**: same id, same position, showing the change live. Nothing is
  removed and re-added, so nothing jumps to the end of the bar.
- `Esc` cancels the edit outright — not "clear the chosen values first" — and returns focus to
  the part it came from. The original was never touched.
- A filter with one operator draws it as plain text: nothing to choose, nothing to land on.
- Free-text chips have no operator or value list, so they are only removable.

Buttons carry `data-token="<id>"` and `data-edit="operator" | "value"`.

Composable surface: `editingId`, `startEdit(id, part)` and `carryValues(values, operator, def)`.

## flex-url

The query string is [`flex-url`](https://www.npmjs.com/package/flex-url)'s — the Laravel Apiable
grammar. Nothing in this project hand-builds a URL.

`src/lib/apiable.js` is the whole boundary:

```js
tokensToUrl(tokens, {path, sort})  // -> FlexUrl (immutable)
urlToTokens(url)                   // -> {tokens, sort, url}
requestUri(tokens, {sort})         // -> "/api/v1/issues?filter[...]=..."
```

Operator mapping — a token's `operator` **is** the apiable key, so there is no translation table:

| Token operator | Wire | Chip shows | Spoken |
| --- | --- | --- | --- |
| `equal` | `filter[status][equal]=opened` | `=` | "is" |
| `in` | `filter[labels]=a11y,regression` | `=` | "is any of" |
| `like` | `filter[title][like]=combobox` | `~` | "contains" |
| `not_like` | `filter[title][not_like]=combobox` | `!~` | "does not contain" |
| `gte` / `lt` | `filter[updated_at][gte]=…` | `≥` / `<` | "on or after" / "before" |
| (free text) | `q=hydration` | — | — |

`in` is our marker for apiable's plain, bracket-less entry — the only one that takes a value list.

The bar **restores itself from the address bar**: `App.vue` parses `window.location.href` on
setup and pushes every change back with `replaceState`, using the same builder with a different
`path`. A filtered view is a link you can send someone.

### Negation

flex-url 3 added apiable's `not_equal` and `not_like` to the grammar, and the demo uses the second
one: *Title does not contain* goes on the wire as `filter[title][not_like]=focus`. The backend has
to register the operator for the attribute like any other — an unregistered key is dropped, not
applied — so check the server side before offering it.

An operator definition marked `negated: true` sets `data-negated` on the chip, which colours the
operator cell only — a plum background and ink on the operator itself, nothing else on the chip.
(There is no `.fs-token--not` class; the hooks are the `[data-negated]` attribute and the
`state-negated:` / `in-negated:` Tailwind variants.) The chip's outer border, key and value stay
neutral on purpose: painting the whole chip a warm colour reads as a validation error, not as
"this filter excludes".

### Typed values

A filter with `freeValue: true` takes whatever is typed at the value stage: the text is offered
first as *Use “…”*, so Enter means "use my text", and matching suggestions follow. *Title* is the
example — its three suggestions are a head start, not the vocabulary.

### Commas

flex-url 3 treats a comma as a list separator whether it arrives raw or as `%2C`, because apiable
explodes on it after decoding either way. A comma inside a single value is therefore not
representable; it comes back as two values, and `like` reads that as "contains either".

## Chip colours

Colour on a chip encodes one property and one only: whether the filter **excludes**.

| State | Looks like | Tokens |
| --- | --- | --- |
| Applied, includes | Neutral ground, key on its own tint | `--fs-chip-bg`, `--fs-chip-key-bg` |
| Applied, excludes | Neutral chip; only the operator cell gets a plum tint — dormant, see above | `--fs-chip-not-*` |
| Being built or edited | Dashed edge | `.fs-token--pending`, `.fs-token--editing` |
| Being edited right now | Dashed **accent** edge, accent key | `--fs-accent*` |

Two rules to keep if you change this:

- **Colour is never the only signal.** The `!=` symbol is on the chip and the accessible name
  says "is not one of". Remove the hue and nothing is lost.
- **The accent means "this one".** It is reserved for the chip under edit and the highlighted
  suggestion. Spending it on every chip is what made it meaningless before.

The bar draws a single focus ring: `.fs-field input:focus-visible` is explicitly `outline: none`
because `.fs-bar:focus-within` already shows it. Every other control keeps its outline.

## Behaviour rules worth knowing

- The list opens on **click**, on the **arrow keys** and on **typing** — never on focus alone.
  Refocusing the input after Search, after removing a chip, or after discarding a draft must
  not reopen it.
- **Search** closes the list, and first turns any term still in the field into a free-text chip.
- **Clear all** deliberately reopens the list: the next thing you do is filter again.
- A multi-value draft with at least one value ticked is **auto-confirmed** by any gesture that
  means "done picking": `Tab`, `→` on an empty field, a pointer down outside the bar, or focus
  leaving it. Nothing is chosen yet? Nothing is committed. Committing resets the draft, so `Tab`
  followed by the `focusout` it causes commits once, never twice.
- Outside-click detection is scoped to the search area, listens on `pointerdown`, and runs in
  the **capture phase** — see the note under Tests for why the bubble phase is wrong here.
  `focusout` alone also misses clicks on things that take no focus, like a result row.
- Chips come before the field in reading order, so Tab reaches their parts first: operator,
  value, remove, per chip.
