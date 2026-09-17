<p align="center"><img src="https://raw.githubusercontent.com/Pepebits/search-builder/main/docs/banner.png" alt="search-builder" width="720"></p>

**Headless tools for building advanced search experiences.**

A token/chip search bar — filter, operator, value — with the behaviour, the keyboard handling
and every `aria-*` attribute living in a framework-agnostic core, handed out as **prop getters**.
A Vue composable and a React hook adapt it to their framework; you supply the markup, and either
the plain stylesheet that ships alongside it or none at all.

> **Pre-1.0.** The public API (option names, getter shapes, the `apiable` factory) can still move
> between minor versions until `1.0.0`. The `data-fs` / `fs-<n>-*` / `--fs-*` / `.fs-*` styling
> contract described below is stable regardless — every getter and every stylesheet is written
> against it, and the test suites are the enforcement.

## Demos

| Page | What it shows |
| --- | --- |
| [Styled (Vue)](https://pepebits.github.io/search-builder/) | The Tailwind bar, `src/components/SearchBuilder.vue`. |
| [Headless (Vue)](https://pepebits.github.io/search-builder/headless.html) | The same behaviour, no stylesheet at all, `src/components/HeadlessSearch.vue`. |
| [React](https://pepebits.github.io/search-builder/react.html) | The same behaviour again, in React, over the plain stylesheet — no Tailwind, no Vue, `src/components/ReactSearch.tsx`. |

## Install

```
npm install @pepebits/search-builder
```

Plus whichever peer the entry you use needs — all optional, so installing the core alone pulls in
nothing else:

```
npm install vue                # for @pepebits/search-builder/vue
npm install react react-dom    # for @pepebits/search-builder/react
npm install flex-url           # for @pepebits/search-builder/apiable
```

Requires Node 18+ at build time (ESM, `exports` map with subpaths).

## Quick start

### Vue

```vue
<script setup>
import { computed } from 'vue'
import { useSearchBuilder } from '@pepebits/search-builder/vue'
import '@pepebits/search-builder/styles.css'

const props = defineProps({ filters: { type: Array, required: true } })
const tokens = defineModel({ type: Array, default: () => [] })

const s = useSearchBuilder({ tokens, filters: computed(() => props.filters), label: 'Search issues' })
</script>

<template>
  <div v-bind="s.getRootProps()">
    <label v-bind="s.getLabelProps()">Search issues</label>

    <div v-bind="s.getFieldsetProps()">
      <input v-bind="s.getInputProps()">
    </div>

    <div v-bind="s.getListboxProps()">
      <div v-for="g in s.indexedGroups.value" v-bind="s.getGroupProps(g)" :key="g.id">
        <b aria-hidden="true">{{ g.label }}</b>
        <span v-for="o in g.options" v-bind="s.getOptionProps(o)" :key="o.id">{{ o.label }}</span>
      </div>
    </div>

    <p v-bind="s.getHintProps()">Arrow keys browse, Enter selects.</p>
    <p v-bind="s.getAppliedProps()">{{ s.appliedSummary.value }}</p>
    <p v-bind="s.getLiveRegionProps()">{{ s.announcement.value }}</p>
  </div>
</template>
```

That's a trimmed [`HeadlessSearch.vue`](src/components/HeadlessSearch.vue) — 60 lines in full,
no stylesheet, and it passes the same accessibility suite as the Tailwind bar
([`SearchBuilder.vue`](src/components/SearchBuilder.vue)).

### React

```tsx
import { useSearchBuilder } from '@pepebits/search-builder/react'
import '@pepebits/search-builder/styles.css'

function Search ({ filters, tokens, onTokensChange }) {
  const s = useSearchBuilder({ filters, tokens, onTokensChange, label: 'Search issues' })

  return (
    <div {...s.getRootProps()}>
      <label {...s.getLabelProps()}>Search issues</label>

      <div {...s.getFieldsetProps()}>
        <input {...s.getInputProps()} />
      </div>

      <div {...s.getListboxProps()}>
        {s.indexedGroups.map((g) => (
          <div {...s.getGroupProps(g)} key={g.id}>
            <b aria-hidden="true">{g.label}</b>
            {g.options.map((o) => <span {...s.getOptionProps(o)} key={o.id}>{o.label}</span>)}
          </div>
        ))}
      </div>

      <p {...s.getHintProps()}>Arrow keys browse, Enter selects.</p>
      <p {...s.getAppliedProps()}>{s.appliedSummary}</p>
      <p {...s.getLiveRegionProps()}>{s.announcement}</p>
    </div>
  )
}
```

The full version, with operators, values and remove buttons, is
[`src/components/ReactSearch.tsx`](src/components/ReactSearch.tsx).

### Bring your own CSS

Both quick starts above import `@pepebits/search-builder/styles.css` — the `--fs-*` design tokens plus a
plain stylesheet, every selector an attribute selector. Drop that import for the fully unstyled
shape (the [headless demo](https://pepebits.github.io/search-builder/headless.html) does exactly
that); `@pepebits/search-builder/tokens.css` alone gets you just the palette to re-theme.

Either way, nothing is keyed off a class name — the contract is these attributes, and the test
suites are written against them, not against any markup:

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

Every id an instance mints is scoped under `fs-<n>-*` (or your own `id` option), and a person's
avatar tint reads `--fs-tone-h` off `toneHue()`. None of the four are renamed between now and
`1.0.0`.

## Filter definitions

```ts
interface FilterDef {
  key: string                                   // stable, unique per bar
  label: string                                 // "Milestone"
  param?: string                                 // wire attribute name, defaults to key
  operators: Operator[]
  values?: Value[]                               // a closed set, offered directly
  fetchValues?: (query: string) => Promise<Value[]>  // an open set, fetched as you type
  specialValues?: Value[]                        // "None" / "Any" / "Me", offered first
  repeatable?: boolean                           // can appear as more than one token
  freeValue?: boolean                            // the value stage also accepts typed text
  kind?: string                                  // presentation hint (e.g. "person")
}

interface Operator {
  value: string        // the wire key: "equal", "like", "in", ...
  symbol?: string       // "=", "~", "≥" — what a chip draws
  description: string  // "is", "contains" — what a screen reader reads
  multiple?: boolean    // the value stage accumulates values into one token
  negated?: boolean     // styles the chip's operator cell as excluding
}

interface Value {
  value: string
  label: string
  color?: string
  initials?: string
  avatar?: string
  sub?: string
  special?: boolean
}

type Token =
  | { id: string; type: 'text'; operator: string; value: string }
  | { id: string; type: string; operator: string; value: string | string[] }
```

All of the above — plus `Stage`, `Option`, `OptionGroup`, `SearchBuilderOptions`,
`SearchBuilderStore` and the rest of the getter/action surface — are exported as types from
`@pepebits/search-builder` (the root entry), so `@pepebits/search-builder/vue` and `@pepebits/search-builder/react` never need a
separate `@types` package.

## `@pepebits/search-builder/apiable`

Tokens ↔ a [`flex-url`](https://www.npmjs.com/package/flex-url) query string — the Laravel Apiable
grammar. Nothing here hand-builds a URL, and this is the only entry that touches `flex-url`; the
core and the adapters know nothing about it.

```ts
import { createApiable } from '@pepebits/search-builder/apiable'

const apiable = createApiable({
  filters: FILTERS,        // FilterDef[]
  path: '/api/v1/issues',  // defaults to '/'
  sorts: SORTS,            // optional: { value, attribute, direction }[]
  resource: 'issues'       // defaults to the last path segment of `path`
})

apiable.tokensToUrl(tokens, { sort })     // -> FlexUrl (immutable)
apiable.urlToTokens(url)                  // -> { tokens, sort, url }
apiable.requestUri(tokens, { sort })      // -> "/api/v1/issues?filter[...]=..."
apiable.requestParams(tokens, { sort })   // -> the same request, as flex-url's nested object
apiable.schema()                          // -> the EndpointSchema apiable's exporter would publish
```

A token's `operator` **is** the apiable wire key, so there is no separate translation table:

| Token operator | Wire | Chip shows | Spoken |
| --- | --- | --- | --- |
| `equal` | `filter[status][equal]=opened` | `=` | "is" |
| `in` | `filter[labels]=a11y,regression` | `=` | "is any of" |
| `like` | `filter[title][like]=combobox` | `~` | "contains" |
| `not_like` | `filter[title][not_like]=combobox` | `!~` | "does not contain" |
| `gte` / `lt` | `filter[updated_at][gte]=…` | `≥` / `<` | "on or after" / "before" |
| (free text) | `q=hydration` | — | — |

`in` is the marker for apiable's plain, bracket-less entry (`filter[attr]=a,b`) — the only one that
takes a value list.

### Negation

flex-url 3 added apiable's `not_equal` and `not_like` to the grammar. The backend has to register
the operator for the attribute like any other — an unregistered key is dropped, not applied — so
check the server side before offering it. An operator marked `negated: true` sets `data-negated`
on the chip, which tints only the operator cell (`.fs-token--not`-equivalent styling in
`filtered-search.css`), not the whole chip: painting the whole thing a warm colour reads as a
validation error, not as "this filter excludes".

### Commas

flex-url 3 treats a comma as a list separator whether it arrives raw or percent-encoded (`%2C`),
because apiable explodes on it after decoding either way. A comma inside a single value is
therefore not representable — it comes back as two values, and `like` reads that as "contains
either".

## Keyboard

| Key | Single value | Multi-value operator |
| --- | --- | --- |
| `↓` `↑` | Move through suggestions, across groups | same |
| `Enter` | Take the suggestion, advance a stage | Toggle the value, list stays open |
| `Tab` | Leave the bar | Apply the chosen values, then leave |
| `→` (empty field) | — | Apply the chosen values, stay in the bar |
| `Esc` | Step back a stage | Clear chosen values, then step back |
| `Backspace` | On empty text: step back, or remove the last chip | same |
| `Home` / `End` | First / last suggestion | same |
| `Space` | On a chip's operator or value: re-open just that part | same |

## Accessibility

- The input is the combobox (`role="combobox"`, `aria-expanded`, `aria-controls`); the suggestions
  are a sibling `role="listbox"`, **never removed from the DOM** (it closes with `hidden`), so
  `aria-controls` always resolves. Focus never leaves the input.
- Highlighting sets `aria-activedescendant` and `data-active`. Under a multi-value operator the
  listbox is `aria-multiselectable` and `aria-selected` means *chosen*, not *highlighted*.
- Each suggestion section is a `role="group"` with an `aria-label` — the visible heading is
  decorative, the group already carries the name.
- Loading and empty rows sit **outside** the option set (`role="presentation"`), so an empty list
  never announces "1 of 1"; async filters set `aria-busy` and announce "Loading suggestions".
- `aria-describedby` on the input carries the keyboard hint **and** a sentence listing the filters
  already applied.
- Chips are `role="list"` / `role="listitem"` explicitly, since `display: contents` drops those
  roles in several engines.
- Every state change that matters is written to a `role="status"` live region: adding, removing,
  clearing, toggling a value, discarding a draft, each optionally suffixed with a result count
  (the `resultCount` option).

## Architecture

The behaviour, the ARIA and the prop getters live in a framework-agnostic `src/core/`; `src/vue/`
and `src/react/` are thin adapters over it, and `src/apiable/` is the only module that touches
`flex-url`. The full design history — the extraction plan, what changed between phases, and why —
is in [`docs/plan/headless-package.md`](docs/plan/headless-package.md) and the decisions in
[`docs/adr/`](docs/adr/); [`docs/headless-filtered-search.md`](docs/headless-filtered-search.md) is
the original, self-contained implementation write-up (contract, every bug it hit, and a retrofit
checklist) from before the framework-agnostic split.

## Development

```
git clone https://github.com/Pepebits/search-builder.git
cd search-builder
npm install
npm run dev     # the three demo pages, at http://localhost:5173
npm test        # typecheck + every suite, including the packed-tarball proof
```

| Script | What it does |
| --- | --- |
| `npm run dev` / `npm run build` / `npm run preview` | The demo site (three pages) — `vite.config.js`, outputs to `dist/`. |
| `npm run build:lib` | The publishable package — declarations, the four JS entries and the CSS, into `dist-lib/`. Runs automatically before `npm pack`/`npm publish` (`prepack`). |
| `npm run typecheck` | `vue-tsc --noEmit` over `src` and `tests`. |
| `npm test` | Every suite in order: `test:url`, `test:core`, `test:logic` (jsdom), `test:browser` (Chromium, styled), `test:headless` (Chromium, unstyled), `test:react` (Chromium), `test:pack` (packs the tarball, installs it into a scratch Vue app and a scratch React app, builds and drives both with Playwright). |
| `npm run test:pack` | Just the packed-tarball proof, on its own. |

`npm run build` (the Pages workflow) and `npm run build:lib` (the npm package) are independent:
one always outputs `dist/`, the other always outputs `dist-lib/`, and neither script touches the
other's directory.

The first Chromium-based run on a machine needs the browser installed once:
`npx playwright install chromium`. `tests/core.mjs` imports the TypeScript core directly, which
needs Node 22.6 or newer (type stripping); consumers of the published package only need Node 18.

### Releasing

Publishing is staged, never direct: CI can put a version on the registry, only a maintainer with
2FA can make it live.

1. Bump `version` in `package.json`, add the `CHANGELOG.md` entry, commit.
2. Tag and push: `git tag -a vX.Y.Z -m vX.Y.Z && git push origin main vX.Y.Z`.
3. The `release` workflow runs the whole suite and, if it passes, `npm stage publish --provenance`
   through npm trusted publishing. Green means *staged*, not published.
4. Approve it (prompts for your one-time password), or reject it:

   ```
   npm stage list @pepebits/search-builder
   npm stage download <stage-id>     # optional: inspect the exact tarball first
   npm stage approve <stage-id>
   ```

   The same buttons exist on the package page at npmjs.com.

A tag whose version is already live is a no-op run. A tag whose version is already *staged* fails
at the staging step until that stage is approved or rejected.
