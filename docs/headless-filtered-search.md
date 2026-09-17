# Headless Filtered Search — Implementation Plan

A token/chip search bar — filter, operator, value — built as a **headless Vue 3
composable**: the behaviour, the keyboard and every ARIA attribute live in one file and are handed
to your markup as prop getters.

This document is self-contained. You can implement the whole thing from it, or use
[§12](#12-audit-what-most-implementations-get-wrong) and [§13](#13-retrofit-checklist) to fix a
selector you already have.

---

## Table of contents

1. [The one architectural rule](#1-the-one-architectural-rule)
2. [Data model](#2-data-model)
3. [State machine](#3-state-machine)
4. [Composable API](#4-composable-api)
5. [Prop getters — the complete contract](#5-prop-getters--the-complete-contract)
6. [Keyboard contract](#6-keyboard-contract)
7. [Open / close / focus rules](#7-open--close--focus-rules)
8. [Editing a chip in place](#8-editing-a-chip-in-place)
9. [Announcements](#9-announcements)
10. [Styling contract](#10-styling-contract)
11. [URL round-trip (optional)](#11-url-round-trip-optional)
12. [Audit: what most implementations get wrong](#12-audit-what-most-implementations-get-wrong)
13. [Retrofit checklist](#13-retrofit-checklist)
14. [Testing strategy](#14-testing-strategy)
15. [Reference code for the hard parts](#15-reference-code-for-the-hard-parts)

---

## 1. The one architectural rule

> **Behaviour and ARIA live in the composable. Markup and CSS live in the consumer. Nothing
> crosses.**

If an `aria-*` attribute is written in a template, it can be forgotten by the next template. If it
comes out of a prop getter, every consumer gets it for free and a test can prove it.

The practical shape:

```
useFilteredSearch(options) → { state…, actions…, helpers…, getXProps()… }
```

A consumer spreads getters onto whatever elements it likes:

```vue
<section v-bind="s.getRootProps()">
  <input v-bind="s.getInputProps()">
  <div v-bind="s.getListboxProps()">…</div>
</section>
```

**Why prop getters and not a renderless component with scoped slots:** slots force a fixed tree
shape and make the ARIA relationships (`aria-controls`, `aria-activedescendant`) implicit. Getters
let the consumer choose tags, order, and which affordances exist at all, while the id wiring stays
the composable's problem.

**Proof obligation.** Ship two consumers — a styled one and a deliberately unstyled one with
different tags — and run the same accessibility assertions against both. If an invariant hides in
the styled markup, the unstyled suite fails. This is the single most useful thing in the whole
design; without it "headless" is an unverified claim.

---

## 2. Data model

### 2.1 Token

What the bar holds. This is your `v-model` array.

```ts
type Token = {
  id: string           // stable, yours; used for :key, edit targeting, removal
  type: string         // the filter definition's `key`, or 'text' for free text
  operator: string     // the operator's wire key — see below
  value: string | string[]   // array only under a multi-value operator
}
```

Free text is a token like any other (`type: 'text'`). Do not keep it in a separate `searchTerm`
ref — that splits every code path in two.

### 2.2 Filter definition

```ts
type FilterDef = {
  key: string                 // token.type
  label: string               // what a human reads: "Assignee"
  param: string               // what the API calls it: "assignee_username"
  operators: Operator[]       // ordered; a single-entry array skips the operator stage
  values?: Value[]            // static suggestions
  fetchValues?: (query: string) => Promise<Value[]>  // or async ones
  specialValues?: Value[]     // None / Any / Me — see 2.4
  repeatable?: boolean        // may appear more than once in the bar
  freeValue?: boolean         // the typed text is offered as a value ("Use “…”"), first
  kind?: 'label' | 'person'   // render hint for the suggestion row
}

type Value = {
  value: string; label: string
  color?: string        // a swatch, for labels
  initials?: string     // tinted initials, for people without a picture
  avatar?: string       // picture URL, for people with one; wins over initials
  sub?: string          // secondary text drawn beside the label: an @handle
  special?: true
}
```

### 2.3 Operator — the piece people get wrong

An operator is **not** a string. It is an object with three faces, because three different
audiences need three different renderings of the same thing:

```ts
type Operator = {
  value: string        // what goes on the wire / into the token:  'equal'
  symbol: string       // what the chip draws:                     '='
  description: string  // what a screen reader says:               'is'
  multiple?: boolean   // the value stage accumulates a list
  negated?: boolean    // style hook: this filter excludes
}
```

Ship a small set and let each definition pick:

| `value` | `symbol` | `description` | notes |
| --- | --- | --- | --- |
| `equal` | `=` | "is" | single value |
| `in` | `=` | "is any of" | `multiple: true`; a comma list on one key |
| `like` | `~` | "contains" | single value |
| `gte` / `lt` | `≥` / `<` | "on or after" / "before" | dates, numbers |

The chip shows `=` because it is compact and scannable. The accessible name says *"Label is any of
a11y and regression"*. **Never make the symbol the accessible name.** `!=` read aloud is noise.

Offer an optional `friendlyOperators` flag that draws `description` in the chip instead of
`symbol`, for products that would rather spell it out. It changes nothing about the accessible
name — that already says the words.

### 2.4 Special values

*None*, *Any*, *Me* are values, not operators, and they come in two kinds:

- **Wildcards** (`special: true` — *None*, *Any*) get their own "Any or none" group, are hidden
  under a multi-value operator ("is any of None, v4.2" is meaningless), and therefore cannot carry
  across an operator change into one — see §8.
- **Pinned values** (`pinned: true` — *Me*) are ordinary members of the list that happen to be
  known up front: offered first in the main group, before an async list has returned, matched by
  their `sub` as well as their label, and allowed under multi-value operators. *Me* is a person
  with an avatar, tinted like the current user through `tone`.

---

## 3. State machine

Three stages, one draft:

```
filter ──pick a filter──► operator ──pick an operator──► value ──pick a value──► filter
   ▲                          │                            │                       │
   └──────────── Esc ─────────┴──────────── Esc ───────────┘        commits a token ┘
```

State to hold:

```js
const stage        = ref('filter')   // 'filter' | 'operator' | 'value'
const draftKey     = ref(null)       // filter key being built
const draftOperator= ref(null)
const draftValues  = ref([])         // accumulates under a multi-value operator
const editingId    = ref(null)       // set when re-opening an existing chip (§8)
const query        = ref('')         // the text in the field
const isOpen       = ref(false)
const activeIndex  = ref(0)          // highlighted option, index into the FLAT option list
```

**Skip rules.** A definition with exactly one operator skips the operator stage on the way in
(`filter → value` directly). Do not present a one-item menu.

**Suggestions are grouped, and groups are data**, not markup:

```js
groups = [
  { id: 'special', label: 'Any or none', options: [...] },
  { id: 'recent',  label: 'Recently used', options: [...] },
  { id: 'all',     label: 'Label', options: [...] },
]
```

Then derive two more:

- `flatOptions` — `groups.flatMap(g => g.options)`. Arrow keys and `activeIndex` work on this, so
  the highlight crosses group boundaries in one keypress.
- `indexedGroups` — the same groups with each option's flat index baked in. **Render from this.**
  That index is what the option's `id` and `aria-activedescendant` are built from; computing it in
  the template is how the two drift apart.

---

## 4. Composable API

```js
const s = useFilteredSearch({
  tokens,                    // Ref<Token[]> — required, read and written
  filters,                   // FilterDef[] | Ref — required
  label: 'Search issues',    // names the search landmark and the input
  resultCount: null,         // number | Ref — appended to announcements when given
  friendlyOperators: false,  // draw operator words instead of symbols
  onSubmit: (tokens) => {},  // the search was run
  onAnnounce: (text) => {},  // optional extra sink for live-region sentences
  recentLimit: 3             // how many "Recently used" values to keep, per filter
})
```

Returned, grouped by purpose:

**State** — `query` `isOpen` `stage` `activeIndex` `groups` `indexedGroups` `flatOptions` `status`
`loading` `listboxLabel` `placeholder` `appliedSummary` `announcement` `canApply` `draftDef`
`draftOperator` `draftValues` `draftSpoken` `isMultiSelect` `editingId` `editPart`

**Actions** — `open` `close` `focusInput` `openAndFocus` `submit` `move` `jump` `selectOption`
`applyDraft` `confirmDraft` `stepBack` `escape` `cancelDraft` `startEdit` `startEditPart` `removeToken`
`clearAll` `commitPendingText` `resetDraft`

**Helpers** — `spokenToken` `valueLabel` `operatorWords` `operatorSymbol` `operatorText` `defOf`
`tokenLabel` `tokenValues` `isEditing` `isNegated` `isChosen` `hasOperatorChoice` `chipOperator`
`chipValues` `partName` `carryValues`

**Getters** — §5.

**Element refs** — `rootRef` `inputRef` `listRef`, attached by the getters. The composable needs
them for focus management and outside-click; the consumer never touches them.

---

## 5. Prop getters — the complete contract

Every getter emits `data-fs="<part>"` so CSS and tests can name the part without depending on tags
or classes.

| Getter | Emits |
| --- | --- |
| `getRootProps()` | `ref`, `data-fs="root"`, `data-stage`, `data-open`, `role="search"`, `aria-label`, `onFocusout` |
| `getLabelProps()` | `data-fs="label"`, `for={inputId}` |
| `getFieldsetProps()` | `data-fs="bar"`, `onMousedown` (clicking the bar's padding focuses the field; guard with `event.target !== event.currentTarget`) |
| `getInputProps()` | `ref`, `data-fs="input"`, `id`, `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls`, `aria-describedby`, `aria-activedescendant`, `value`, `placeholder`, `onInput`, `onClick`, `onKeydown` |
| `getTokenListProps()` | `data-fs="tokens"`, `role="list"` |
| `getTokenProps(token)` | `data-fs="token"`, `data-type`, `data-editing`, `data-negated`, `role="listitem"` |
| `getPendingProps()` | `data-fs="token"`, `data-pending`, `data-negated` |
| `getOperatorProps(token)` | `data-fs="operator"`, `data-token`, `data-edit="operator"`, `type="button"`, `aria-label`, `onClick` |
| `getValueProps(token)` | `data-fs="value"`, `data-token`, `data-edit="value"`, `type="button"`, `aria-label`, `onClick` |
| `getRemoveProps(token)` | `data-fs="remove"`, `type="button"`, `aria-label`, `onClick` |
| `getListboxProps()` | `ref`, `data-fs="listbox"`, `data-stage`, `id`, `role="listbox"`, `hidden`, `aria-label`, `aria-multiselectable`, `aria-busy` |
| `getGroupProps(group)` | `data-fs="group"`, `role="group"`, `aria-label` |
| `getOptionProps(option)` | `data-fs="option"`, `data-kind`, `id`, `role="option"`, `data-active`, `aria-selected`, `onMousemove`, `onMousedown` |
| `getStatusRowProps()` | `data-fs="status"`, `data-kind`, `role="presentation"` |
| `getHintProps()` | `data-fs="hint"`, `id` |
| `getAppliedProps()` | `data-fs="applied"`, `id` |
| `getLiveRegionProps()` | `data-fs="live"`, `role="status"`, `aria-live="polite"` |
| `getApplyProps()` / `getDiscardProps()` / `getClearProps()` / `getSubmitProps()` | `data-fs`, `type="button"`, `aria-label` where the visible text is not enough, `onClick` |

Notes that matter:

- **Getters never set `class` and never set `key`.** The consumer keeps full control of both.
  Document that `:key` is the consumer's job.
- In Vue 3, `ref` inside a `v-bind` object works — the runtime extracts it. So `getInputProps()`
  can own the element ref.
- `onInput` + `value` means the consumer does **not** add `v-model`. Say so, or you get double
  binding.

### 5.1 Accessible names

| Element | Name |
| --- | --- |
| landmark + input | the `label` option |
| listbox | "Filters" / "Operators for Label" / "Values for Label" — follows the stage |
| group | "Recently used", "Any or none", the filter's label |
| chip operator button | `Change operator for Label, currently is any of` → while editing: `Choosing operator for Label` |
| chip value button | `Change value for Label, currently a11y and regression` |
| chip remove button | `Remove filter: Label is any of a11y and regression` |
| Apply | `Apply filter: Label is any of a11y and regression` |

Build these from one function so they cannot disagree:

```js
const spokenToken = (t) =>
  `${def.label} ${operatorWords(t.type, t.operator)} ${listSentence(values)}`
// listSentence(['a','b','c']) === 'a, b and c'
```

---

## 6. Keyboard contract

All of it hangs off **one** `onKeydown` on the input. No key handling anywhere else — the chips
are `<button>`s, so Space and Enter come from the platform.

| Key | Filter / operator / single value | Multi-value operator |
| --- | --- | --- |
| `↓` `↑` | move the highlight, wrapping, across groups; opens the list if closed | same |
| `Home` `End` | first / last option | same |
| `Enter` | take the highlighted option and advance a stage | toggle the value, list stays open |
| `Enter` (nothing highlighted) | submit | apply the accumulated values |
| `Esc` | step back one stage; from `filter`, close the list | clear chosen values, then step back |
| `Esc` (while editing a chip) | cancel the edit outright, restore focus to the chip part | same |
| `Backspace` (empty field) | step back a stage, or remove the last chip | same |
| `Tab` | close the list, leave | apply the chosen values, then leave |
| `→` (empty field) | nothing; the caret moves | apply the chosen values, stay in the field |
| `Space` (on a chip part) | re-open just that part | same |

**Focus never leaves the input while the list is open.** The highlight is `aria-activedescendant`
plus a `data-active` attribute for styling — not DOM focus, and not `tabindex` on options.

---

## 7. Open / close / focus rules

These look like details. They are the difference between a bar that feels right and one that
fights you.

**Open on:** click on the input, click on the bar's padding, any arrow key, typing.
**Never open on focus.** This is the important one: several buttons in the bar (*Clear all*, the
discard ×) remove themselves as a result of being pressed, and the handler then refocuses the
input. If focus opens the list, running a search bounces the dropdown straight back open.

**Close on:** `Tab`, `Esc` at the filter stage, pointer down outside, running the search.

**Auto-confirm a multi-value draft on:** `Tab`, `→` on an empty field, pointer down outside,
focus leaving the search area. All four go through one `confirmDraft()` guarded by `canApply`
(value stage, multi-value operator, at least one value ticked), so an empty draft is never
committed and the leftover draft survives the close. Committing resets the draft, which is what
makes the double trigger safe: a real `Tab` fires `keydown` and then the `focusout` it causes,
and the second call finds nothing left to commit.

**Do not close on:** committing a token. Staying open is what makes "add three filters" fast.

Two implementation notes you will otherwise discover the hard way:

1. **Outside-click must run in the capture phase.** In the bubble phase your document listener
   runs *after* the option's own handler; by then the framework has re-rendered and detached the
   clicked node, so `root.contains(event.target)` reports "outside" and closes the list on **every
   mouse selection**. Use `document.addEventListener('pointerdown', handler, true)`.
2. **Refocus must be synchronous.** `nextTick(() => input.focus())` loses the focus to the
   vanishing button, and your `focusout` handler then closes the list. Focus immediately; fall
   back to `nextTick` only if the ref is not set yet.

Also scope outside-click to the **search area**, not to an outer panel — otherwise the list stays
open on top of the sort control and the results.

---

## 8. Editing a chip in place

Focus a part of an existing chip, press `Space`, and that part re-opens.

**The operator and the value are separate buttons.** Wanting a different operator is not wanting a
different value. One "edit the chip" button that always walks you through both is the design
mistake to avoid.

- `startEdit(id, part)` sets `editingId` and seeds the draft from the token, then opens at
  `'operator'` or `'value'`. A one-operator filter always opens at `'value'`.
- The chip **stays where it is** and renders from the draft while being edited. Nothing is removed
  and re-added, so the filter you were reading does not jump to the end of the bar.
- Committing **replaces in place**: same id, same position.
- `Esc` cancels outright — not "clear the chosen values first" — and returns focus to the part it
  came from. The original was never touched, so there is nothing to restore.

**Changing the operator is one step when the value can carry:**

```js
function carryValues (values, operator, def) {
  if (!values.length) return null                     // nothing to carry
  const specials = new Set((def.specialValues ?? []).filter(v => v.special).map(v => v.value))
  if (operator?.multiple) {
    return values.some(v => specials.has(v)) ? null : [...values]  // None/Any can't join a list
  }
  return values.length === 1 ? values[0] : null       // many → one needs a choice
}
```

If it returns non-null, commit immediately and stop. Only fall through to the value stage when it
returns `null`. Opening the value list for a value nobody asked to change is the thing that makes
the interaction feel wrong.

---

## 9. Announcements

One polite live region, owned by the composable, rendered by the consumer:

```js
function announce (message, { count = true } = {}) {
  const seq = ++announceSeq
  announcement.value = ''          // forces a re-announce of an identical message
  requestAnimationFrame(() => {
    if (seq !== announceSeq) return
    const total = unref(resultCount)
    announcement.value = message + (count && total != null
      ? ` ${total} ${total === 1 ? 'result' : 'results'}.` : '')
  })
}
```

Announce: filter added / updated / removed, all cleared, a value toggled with the running count,
an edit started and cancelled, "Loading suggestions", "No matches found", and the search being
run. Append the **result count** to anything that changes the results — silence after a filter
change is the classic failure of this widget.

Separately, put a **summary of what is already applied** in the input's `aria-describedby`, so
landing on the field tells you the results are already narrowed:

> `2 filters applied: Status is Open; Label is any of a11y and regression.`

---

## 10. Styling contract

There is no class API and no theme prop, and there should not be: **the state is already in the
DOM** because the accessibility tree needs it. So styling is attribute selectors.

| Part (`data-fs`) | State it carries |
| --- | --- |
| `root` | `data-stage`, `data-open` |
| `token` | `data-type`, `data-editing`, `data-negated`, `data-pending` |
| `listbox` | `hidden`, `aria-busy`, `aria-multiselectable`, `data-stage` |
| `option` | `data-active` (the highlight), `aria-selected` (chosen), `data-kind` |
| `status` | `data-kind`: `loading` / `no-matches` / `empty` |

Plain CSS:

```css
[data-fs='option'][data-active='true'] { background: var(--accent-soft); }
[data-fs='token'][data-editing]        { border-style: dashed; }
[data-fs='listbox'][aria-busy='true']  { opacity: .6; }
```

Tailwind v4 — name the states once as custom variants:

```css
@custom-variant state-active  (&[data-active='true']);
@custom-variant state-chosen  (&[aria-selected='true']);
@custom-variant state-editing (&[data-editing]);
@custom-variant state-negated (&[data-negated]);
@custom-variant state-pending (&[data-pending]);
@custom-variant state-busy    (&[aria-busy='true']);
@custom-variant in-editing    (:where([data-editing]) &);   /* for a chip's inner parts */
@custom-variant in-negated    (:where([data-negated]) &);
```

```html
<li class="border border-chip-line state-editing:border-dashed">
  <span class="in-negated:bg-chip-not in-negated:text-chip-not-ink">…</span>
```

And point Tailwind at your existing tokens instead of duplicating the palette:

```css
@theme inline {
  --color-surface: var(--fs-surface);
  --color-accent:  var(--fs-accent);
}
```

`--fs-*` already switches for light/dark, so `bg-surface` switches too and **there is not one
`dark:` variant in the component**.

Two Tailwind v4 traps:

1. **Unlayered CSS beats utilities.** Utilities live in `@layer utilities`; any unlayered rule
   wins regardless of specificity. A bare `:focus-visible {}` in a global stylesheet will silently
   override the component's `outline-none`. Keep global CSS on global selectors, or layer it.
2. **Arbitrary variants cannot nest brackets.** `[&_:focus-visible:not([data-fs=input])]:…` does
   not parse — the inner `]` closes the variant. Put the utility on the element instead of
   reaching from an ancestor.

### Colour advice

Do not colour every chip with your accent. A row of identical accent-coloured chips reads as one
block and spends the accent on nothing. Instead:

- **Neutral** = an applied filter. Give the chip internal structure (key segment on its own tint,
  value on the chip's) rather than a flat fill.
- **One hue, on the operator cell only** = the filter *excludes* (negation) — the only property
  worth spotting without reading. Colour the operator segment, not the whole chip: a chip painted
  entirely in a warm colour reads as a validation error, not as "this excludes". Pick a hue that
  is not red/orange for the same reason — a plum or violet reads as "different", not "wrong".
- **Dashed border** = provisional (being built, or being edited).
- **The accent** = "this is the one you are working on": the chip under edit and the highlighted
  option. Nothing else.
- Colour is never the only signal: the operator symbol is on the chip and the accessible name says
  the words. Remove the hue and nothing is lost — that is the test a colour code must pass.

---

## 11. URL round-trip (optional)

If your filters map to an API query, make the URL the same object both ways and let one library
own it. We used [`flex-url`](https://www.npmjs.com/package/flex-url) (Laravel Apiable grammar);
adapt the mapping to yours.

```js
tokensToUrl(tokens, { path, sort })   // → immutable builder
urlToTokens(url)                      // → { tokens, sort }
```

- Keep the token's `operator` **identical to the wire key** (`equal`, `like`, `not_like`, `gte`,
  `in`). No translation table means no drift.
- Free text → the API's search param (`q=`).
- On mount, parse `window.location.href`; on change, push with `history.replaceState` using the
  same builder with a different `path`. A filtered view becomes a link you can send someone.
- Parsing must be forgiving: a filter you do not know, or an operator a filter never declared, is
  **dropped**, not thrown on.
- Round-trip is a test, not a hope: `serialise(parse(url)) === url`.

Caveat worth checking before you commit to a library: not every API grammar has **negation**.
apiable gained `not_equal` / `not_like` (flex-url 3 speaks both), but the backend still has to
register the operator per attribute — an unregistered key is dropped, not applied. Keep the
`negated: true` flag on the operator type so the styling follows the operator, not the symbol.

---

## 12. Audit: what most implementations get wrong

Ordered by how badly it hurts. Each is a real bug this component shipped and fixed.

| # | Symptom | Cause | Fix |
| --- | --- | --- | --- |
| 1 | Clicking a suggestion closes the dropdown instead of advancing | Outside-click check runs in the **bubble** phase, after the framework re-rendered and detached the clicked node, so `contains()` says "outside" | Register the listener with `capture: true` |
| 2 | Running the search re-opens the dropdown | The input opens the list on `focus`, and submit refocuses the input | Open on click/keys/typing, never on focus |
| 3 | Clicking *Clear all* closes the list and loses focus | The button removes itself; focus was deferred with `nextTick` | Focus synchronously |
| 4 | The list floats over the page and stays open | Outside-click scoped to a whole panel; `focusout` alone misses clicks on unfocusable elements | Scope to the search area and listen on `pointerdown` |
| 5 | Screen reader says "1 of 1" on an empty list | The "No matches" row was given `role="option"` | Make it `role="presentation"` and announce it instead |
| 6 | `aria-controls` points at nothing when closed | The listbox is `v-if`'d out of the DOM | Always render it; close with the `hidden` attribute |
| 7 | Section headings are invisible to assistive tech | Visible header is `aria-hidden` with nothing standing in | `role="group"` + `aria-label` on the section; the visible header stays decorative |
| 8 | Chips lose list semantics | `display: contents` on the `<ul>`/`<li>` drops `list`/`listitem` roles in several engines | Set `role="list"` and `role="listitem"` explicitly |
| 9 | Nothing is announced when filters change | No live region, or it never re-announces an identical message | One `role="status"` region; blank it before re-writing; append the result count |
| 10 | Landing on the field tells you nothing | No description of what is already applied | Add a visually hidden summary to `aria-describedby` |
| 11 | Operators read as "bang equals" | `!=` used as the accessible name | `symbol` for the eye, `description` for the ear |
| 12 | Changing an operator forces you through the value list | No carry-over rule | `carryValues()`: commit immediately when the value still fits |
| 13 | No way to run the search but Enter | No submit button | Add one; commit any typed-but-unchipped term first |
| 14 | Multi-select marks the wrong thing | `aria-selected` used for the highlight while multiselectable | Multi: `aria-selected` = chosen, highlight via `aria-activedescendant` + `data-active`. Single: APG allows `aria-selected` on the active option |
| 15 | Async suggestions appear with no warning | No busy state | `aria-busy` on the listbox + "Loading suggestions" announced |
| 16 | Initials/avatars are unreadable to a screen reader | `title` used as the name | `title` is not an accessible name — add visually hidden text |
| 17 | Two nested focus rings inside the field | The bar draws `focus-within` and the input draws its own | `outline: none` on the input only; the bar's ring is the indicator |
| 18 | Cancelling an edit empties the chip | `Esc` ran the generic "clear chosen values" branch | While editing, `Esc` cancels the edit outright |

---

## 13. Retrofit checklist

Applying this to a selector you already have. In this order — the first four change how it
*feels*, the rest change whether it *works* for everyone.

**Phase 1 — interaction (a day)**

- [ ] Move outside-click to `pointerdown` + capture phase (#1)
- [ ] Stop opening the list on `focus`; open on click, arrows, typing (#2)
- [ ] Make every refocus synchronous (#3)
- [ ] Scope outside-click to the search area (#4)
- [ ] Decide the close rules explicitly and write them down: what closes, what stays open

**Phase 2 — structure**

- [ ] Give operators three faces: `value` / `symbol` / `description` (#11)
- [ ] Split the chip into operator and value buttons; `Space` edits just that part (§8)
- [ ] Add `carryValues()` so an operator change is one step (#12)
- [ ] Group the suggestion list as data; derive `flatOptions` and `indexedGroups` (§3)
- [ ] Add a submit button that commits pending text (#13)

**Phase 3 — accessibility**

- [ ] Always-rendered listbox closed with `hidden` (#6)
- [ ] `role="group"` + `aria-label` per section (#7)
- [ ] Status/loading rows outside the option set (#5)
- [ ] Explicit `role="list"` / `role="listitem"` on chips (#8)
- [ ] One live region, count appended, blanked before re-write (#9)
- [ ] Applied-filters summary in `aria-describedby` (#10)
- [ ] `aria-multiselectable` + correct `aria-selected` semantics (#14)
- [ ] `aria-busy` and a loading announcement for async values (#15)
- [ ] Kill every `title`-as-name (#16)
- [ ] One focus ring per field (#17)

**Phase 4 — headless**

- [ ] Move all of the above into a composable
- [ ] Expose prop getters; make your existing styled component consume them and delete its ARIA
- [ ] Write a second, unstyled consumer with different tags
- [ ] Run the same accessibility assertions against both

**Phase 5 — styling**

- [ ] Emit `data-fs` per part and `data-*` per state from the getters
- [ ] Replace state-driven class toggling with attribute selectors / Tailwind state variants
- [ ] Re-look at the colour: neutral by default, one hue for negation on the operator cell only,
      accent only for "this one"

---

## 14. Testing strategy

Three layers, because each catches what the others cannot.

**1. Pure logic (node, no DOM).** The URL/serialisation boundary, the operator mapping, the
round-trip, the encoding contract. Fast, run on every save.

**2. jsdom.** State, ARIA attribute wiring, that id references resolve, announcements. Fast enough
to run a lot of cases.

**3. A real browser (Playwright/Chromium). Non-negotiable.** jsdom does **not** run a microtask
checkpoint between event listeners, so it cannot see the single worst bug in this component
(#1 above): in jsdom the mouse-selection chain passes while in every real browser it closes the
list. It also does not implement focus behaviour for `preventDefault()` on `mousedown`, or
`scrollIntoView`.

> **Rule: anything touching pointers or focus is tested in a real browser. jsdom will pass it
> wrongly.**

Also: if a suite mounts your bundle in jsdom, remember `TextDecoder`/`TextEncoder` are not on the
jsdom `window`; inject them in `beforeParse` if any dependency uses them.

**What to assert**, at minimum:

- `aria-controls`, `aria-describedby`, `aria-activedescendant` all resolve to elements that exist
- no `aria-activedescendant` when the list is empty or closed
- the full mouse chain: filter → operator → value, list open at each step, focus never leaves the
  input
- every close rule, and every "must not reopen" rule
- the edit gesture: one-step operator change, the carry-over fall-through, cancel restores
- the busy → arrived transition for async values
- the same subset against the unstyled consumer

Guard against stale tests: select by `[data-fs=…]` and `role`, never by styling classes.

---

## 15. Reference code for the hard parts

### 15.1 The keydown handler (all of the keyboard)

```js
function onKeydown (event) {
  switch (event.key) {
    case 'ArrowDown': event.preventDefault(); move(1); break
    case 'ArrowUp':   event.preventDefault(); move(-1); break
    case 'Home':      event.preventDefault(); jump('start'); break
    case 'End':       event.preventDefault(); jump('end'); break
    case 'Escape':    event.preventDefault(); escape(); break
    case 'Tab':       confirmDraft(); isOpen.value = false; break
    case 'ArrowRight':                          // empty field only; otherwise the caret moves
      if (query.value === '' && confirmDraft()) event.preventDefault()
      break
    case 'Backspace': handleBackspace(event); break
    case 'Enter':
      event.preventDefault()
      if (isOpen.value && flatOptions.value.length) selectOption()
      else if (isMultiSelect.value && draftValues.value.length) applyDraft()
      else submit()
      break
  }
}

function move (delta) {                       // wraps, across groups
  isOpen.value = true
  const n = flatOptions.value.length
  if (!n) return
  activeIndex.value = (activeIndex.value + delta + n) % n
}

function handleBackspace (event) {
  if (query.value !== '') return              // only on an empty field
  if (stage.value !== 'filter') { event.preventDefault(); stepBack(); return }
  if (!tokens.value.length) return
  event.preventDefault()
  const last = tokens.value.at(-1)
  tokens.value = tokens.value.slice(0, -1)
  announce(`Filter removed, ${spokenToken(last)}.`)
}
```

### 15.2 Outside click — the capture-phase detail

```js
function onPointerDownCapture (event) {
  if (!rootRef.value || rootRef.value.contains(event.target)) return
  confirmDraft()            // a multi-value draft with values ticked is committed, not lost
  isOpen.value = false
}
onMounted(() => document.addEventListener('pointerdown', onPointerDownCapture, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDownCapture, true))
```

### 15.3 Option props — the two-mode `aria-selected`

```js
const getOptionProps = (option) => ({
  'data-fs': 'option',
  'data-kind': option.kind,
  id: optionId(option.index),
  role: 'option',
  'data-active': option.index === activeIndex.value ? 'true' : 'false',
  'aria-selected': isMultiSelect.value
    ? (isChosen(option) ? 'true' : 'false')      // multi: selected means chosen
    : (option.index === activeIndex.value ? 'true' : 'false'),  // single: APG's active option
  onMousemove: () => { activeIndex.value = option.index },
  onMousedown: (event) => {
    event.preventDefault()        // keep focus in the input
    selectOption(option.index)
    isOpen.value = true
    focusInput()
  }
})
```

### 15.4 Input props

```js
const getInputProps = () => ({
  ref: inputRef,
  'data-fs': 'input',
  id: ids.input,
  type: 'text',
  autocomplete: 'off',
  spellcheck: 'false',
  role: 'combobox',
  'aria-autocomplete': 'list',
  'aria-expanded': isOpen.value ? 'true' : 'false',
  'aria-controls': ids.listbox,                       // always resolves: see #6
  'aria-describedby': `${ids.hint} ${ids.applied}`,
  'aria-activedescendant':
    isOpen.value && flatOptions.value.length ? optionId(activeIndex.value) : null,
  placeholder: placeholder.value,
  value: query.value,
  onInput: (e) => { query.value = e.target.value },
  onClick: () => { isOpen.value = true },             // never onFocus: see #2
  onKeydown
})
```

### 15.5 Commit, with in-place replacement

```js
function commitToken (value) {
  const type = draftKey.value
  const operator = draftOperator.value
  if (editingId.value) {
    const updated = { id: editingId.value, type, operator, value }
    tokens.value = tokens.value.map(t => (t.id === editingId.value ? updated : t))
    rememberRecent(type, asArray(value))
    query.value = ''
    resetDraft()
    announce(`Filter updated, ${spokenToken(updated)}.`)
    return
  }
  const token = { id: nextTokenId(), type, operator, value }
  tokens.value = [...tokens.value, token]
  rememberRecent(type, asArray(value))
  query.value = ''
  resetDraft()
  announce(`Filter added, ${spokenToken(token)}.`)
}
```

### 15.6 Async values, with the busy state

```js
watch([stage, draftKey, query], async ([currentStage, key, text]) => {
  const def = key ? defOf(key) : null
  if (currentStage !== 'value' || !def?.fetchValues) { loading.value = false; return }
  const seq = ++fetchSeq                      // drop stale responses
  loading.value = true
  announce('Loading suggestions.', { count: false })
  const values = await def.fetchValues(text.trim())
  if (seq !== fetchSeq) return
  fetched.value = values
  loading.value = false
})
```

### 15.7 A complete unstyled consumer

Everything above, wired up. 60 lines, no stylesheet, and it should pass the same accessibility
suite as your styled version.

```vue
<script setup>
const s = useFilteredSearch({ tokens, filters, label, resultCount })
</script>

<template>
  <section v-bind="s.getRootProps()">
    <label v-bind="s.getLabelProps()">{{ label }}</label>

    <ol v-bind="s.getTokenListProps()">
      <li v-for="t in tokens" v-bind="s.getTokenProps(t)" :key="t.id">
        <template v-if="t.type !== 'text'">
          {{ s.tokenLabel(t) }}
          <button v-if="s.hasOperatorChoice(t)" v-bind="s.getOperatorProps(t)">
            {{ s.chipOperator(t) }}
          </button>
          <span v-else>{{ s.chipOperator(t) }}</span>
          <button v-bind="s.getValueProps(t)">{{ s.chipValues(t) }}</button>
        </template>
        <span v-else>{{ t.value }}</span>
        <button v-bind="s.getRemoveProps(t)">x</button>
      </li>
    </ol>

    <input v-bind="s.getInputProps()">

    <button v-if="s.canApply.value" v-bind="s.getApplyProps()">Apply</button>
    <button v-bind="s.getSubmitProps()">Search</button>

    <div v-bind="s.getListboxProps()">
      <div v-for="g in s.indexedGroups.value" v-bind="s.getGroupProps(g)" :key="g.id">
        <b aria-hidden="true">{{ g.label }}</b>
        <span v-for="o in g.options" v-bind="s.getOptionProps(o)" :key="o.id">{{ o.label }}</span>
      </div>
      <p v-if="s.status.value" v-bind="s.getStatusRowProps()">{{ s.status.value.text }}</p>
    </div>

    <p v-bind="s.getHintProps()">Arrow keys browse, Enter selects, Escape steps back.</p>
    <p v-bind="s.getAppliedProps()">{{ s.appliedSummary.value }}</p>
    <p v-bind="s.getLiveRegionProps()">{{ s.announcement.value }}</p>
  </section>
</template>
```

---

## Appendix — decisions worth keeping, in one list

1. Behaviour and ARIA in the composable; markup in the consumer; prove it with two consumers.
2. Free text is a token, not a separate field.
3. An operator has a wire key, a symbol, and a description.
4. Groups are data; render from `indexedGroups`; arrow keys work on the flat list.
5. Focus stays in the input; the highlight is `aria-activedescendant`.
6. The listbox is never removed from the DOM.
7. Open on click/keys/typing, never on focus.
8. Outside-click on `pointerdown`, capture phase, scoped to the search area.
9. Refocus synchronously.
10. Operator and value are separate buttons; changing the operator is one step when the value fits.
11. Edits happen in place; `Esc` cancels outright and restores focus.
12. One live region, with the result count.
13. State goes in the DOM as attributes; CSS reads those; no class API.
14. Colour encodes negation only, spent on the operator cell, not the whole chip; the accent means
    "this one".
15. Pointer and focus behaviour is tested in a real browser, always.
