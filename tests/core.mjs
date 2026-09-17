// Unit suite for the framework-agnostic core — no DOM, no Vue. Node 24 strips
// the types on import, so this runs `../src/core/index.ts` directly.
import {
  createFilteredSearch, groups, flatOptions, status, canApply, isMultiSelect,
  getRootProps, getInputProps, chipValues, appliedSummary
} from '../src/core/index.ts'
import { FILTERS } from '../src/data/filters.js'

let pass = 0, fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`)
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function pick (store, kind, payload) {
  const options = flatOptions(store.getState(), store.getOptions())
  const index = options.findIndex((o) => o.kind === kind && o.payload === payload)
  store.actions.selectOption(index)
}

// ---- initial state ----
{
  const store = createFilteredSearch({ filters: FILTERS, id: 'fs-t1' })
  const s = store.getState()
  check('A1. starts on the filter stage', s.stage, 'filter')
  check('A2. no tokens yet', s.tokens, [])
  check('A3. starts closed', s.isOpen, false)
  check('A4. activeIndex starts at 0', s.activeIndex, 0)
  check('A5. ids use the given id option', store.api.ids, {
    input: 'fs-t1-input', listbox: 'fs-t1-listbox', hint: 'fs-t1-hint', applied: 'fs-t1-applied'
  })
}

// ---- filter -> operator -> value, via selectOption ----
{
  const store = createFilteredSearch({ filters: FILTERS, id: 'fs-t2' })
  pick(store, 'filter', 'milestone')
  check('B1. picking a filter advances to the operator stage', store.getState().stage, 'operator')
  check('B2. draftKey is set', store.getState().draftKey, 'milestone')
  pick(store, 'operator', 'in')
  check('B3. picking a multi operator advances to the value stage', store.getState().stage, 'value')
  check('B4. isMultiSelect turns on', isMultiSelect(store.getState(), store.getOptions()), true)
  pick(store, 'value', 'v4.2')
  check('B5. a value toggles into the draft, not committed yet', store.getState().draftValues, ['v4.2'])
  check('B6. canApply is true with one value chosen', canApply(store.getState(), store.getOptions()), true)
  store.actions.applyDraft()
  check('B7. applyDraft commits one token', store.getState().tokens.length, 1)
  check('B8. and returns to the filter stage', store.getState().stage, 'filter')
}

// ---- confirmDraft: guarded by canApply, and idempotent ----
{
  const store = createFilteredSearch({ filters: FILTERS, id: 'fs-t3' })
  check('C1. nothing to confirm on the filter stage', store.actions.confirmDraft(), false)
  pick(store, 'filter', 'milestone')
  pick(store, 'operator', 'in')
  pick(store, 'value', 'v4.2')
  check('C2. confirmDraft commits when a value is chosen', store.actions.confirmDraft(), true)
  check('C3. one token', store.getState().tokens.length, 1)
  check('C4. confirmDraft is idempotent: nothing left to confirm', store.actions.confirmDraft(), false)
  check('C5. still one token, no duplicate', store.getState().tokens.length, 1)
}

// ---- stepBack at each stage ----
{
  const store = createFilteredSearch({ filters: FILTERS, id: 'fs-t4' })
  pick(store, 'filter', 'milestone')
  pick(store, 'operator', 'in')
  pick(store, 'value', 'v4.2')
  check('D1. stepBack with a value chosen clears it first', store.actions.stepBack(), true)
  check('D2. still on the value stage', store.getState().stage, 'value')
  check('D3. draft values cleared', store.getState().draftValues, [])
  check('D4. stepBack from an empty value stage goes to operators', store.actions.stepBack(), true)
  check('D5. back on the operator stage', store.getState().stage, 'operator')
  check('D6. stepBack from operators resets to filters', store.actions.stepBack(), true)
  check('D7. back on the filter stage', store.getState().stage, 'filter')
  store.actions.open()
  check('D8. stepBack while open just closes', store.actions.stepBack(), true)
  check('D9. closed', store.getState().isOpen, false)
  check('D10. stepBack with nothing left to unwind reports false', store.actions.stepBack(), false)
}

// ---- startEdit + carryValues: a one-step operator change ----
{
  const store = createFilteredSearch({
    filters: FILTERS,
    tokens: [{ id: 'seed', type: 'milestone', operator: 'equal', value: 'v4.2' }],
    id: 'fs-t5'
  })
  const ok = store.actions.startEdit('seed', 'operator')
  check('E1. startEdit succeeds on a real chip', ok, true)
  check('E2. opens on the operator stage (more than one operator)', store.getState().stage, 'operator')
  pick(store, 'operator', 'in')
  check('E3. a value that carries commits there and then — no value step', store.getState().stage, 'filter')
  check('E4. the token is updated in place, value carried over', store.getState().tokens, [
    { id: 'seed', type: 'milestone', operator: 'in', value: ['v4.2'] }
  ])
  check('E5. startEdit on a missing id fails', store.actions.startEdit('nope'), false)
}

// ---- commitPendingText ----
{
  const store = createFilteredSearch({ filters: FILTERS, id: 'fs-t6' })
  check('F1. nothing to commit when empty', store.actions.commitPendingText(), false)
  store.actions.setQuery('hydration')
  check('F2. commits the typed text', store.actions.commitPendingText(), true)
  check('F3. as a text token', store.getState().tokens[0].type, 'text')
  check('F4. query cleared', store.getState().query, '')
}

// ---- handleBackspace removes the last chip ----
{
  const store = createFilteredSearch({
    filters: FILTERS,
    tokens: [{ id: 'seed', type: 'state', operator: 'equal', value: 'opened' }],
    id: 'fs-t7'
  })
  let prevented = false
  store.actions.handleBackspace({ preventDefault: () => { prevented = true } })
  check('G1. preventDefault called', prevented, true)
  check('G2. the last token is gone', store.getState().tokens, [])
}

// ---- groups: Free text, Typed value, Recently used ----
{
  const store = createFilteredSearch({ filters: FILTERS, id: 'fs-t8' })
  store.actions.setQuery('zzzz')
  check('H1. free text is offered in the filter stage', groups(store.getState(), store.getOptions()).map((g) => g.label), ['Free text'])
}
{
  const store = createFilteredSearch({ filters: FILTERS, id: 'fs-t9' })
  pick(store, 'filter', 'title')
  pick(store, 'operator', 'like')
  store.actions.setQuery('hydration')
  const g = groups(store.getState(), store.getOptions())
  check('H2. a free-value filter offers the typed text', g.some((x) => x.label === 'Typed value'), true)
}
{
  const store = createFilteredSearch({ filters: FILTERS, id: 'fs-t10' })
  pick(store, 'filter', 'label')
  pick(store, 'operator', 'equal')
  pick(store, 'value', 'a11y')
  check('H3. single-value pick commits immediately', store.getState().tokens.length, 1)
  // Same key, different operator: recents are tracked per key, `taken` per operator.
  pick(store, 'filter', 'label')
  pick(store, 'operator', 'in')
  const g = groups(store.getState(), store.getOptions())
  check('H4. the value just used resurfaces as Recently used',
    g.find((x) => x.label === 'Recently used')?.options.map((o) => o.payload), ['a11y'])
}

// ---- post-transition rules 1-3 ----
{
  const store = createFilteredSearch({ filters: FILTERS, id: 'fs-t11' })
  check('I1. starts closed', store.getState().isOpen, false)
  store.actions.setQuery('mile')
  check('I2. rule 1: typing reopens', store.getState().isOpen, true)
}
{
  const store = createFilteredSearch({ filters: FILTERS, id: 'fs-t12' })
  store.actions.open()
  store.api.actions.setActiveIndex(2)
  check('J1. activeIndex set away from 0', store.getState().activeIndex, 2)
  store.actions.setQuery('mile')
  check('J2. rule 2: a fresh option list resets activeIndex to 0', store.getState().activeIndex, 0)
}
{
  const store = createFilteredSearch({ filters: FILTERS, id: 'fs-t13' })
  pick(store, 'filter', 'milestone')
  pick(store, 'operator', 'equal')
  store.actions.setQuery('zzzzzz')
  check('K1. status is no-matches', status(store.getState(), store.getOptions())?.kind, 'no-matches')
  await tick()
  check('K2. rule 3: no-matches announced on entry', store.getState().announcement, 'No matches found.')
  store.actions.setQuery('zzzzzzzz')
  await tick()
  check('K3. staying in no-matches does not change the announcement', store.getState().announcement, 'No matches found.')
}

// ---- setTokens is a no-op on the same reference; onTokensChange fires on commit ----
{
  const seen = []
  const store = createFilteredSearch({ filters: FILTERS, id: 'fs-t14', onTokensChange: (t) => seen.push(t) })
  const before = store.getState().tokens
  store.actions.setTokens(before)
  check('L1. same reference: state untouched', store.getState().tokens, before)
  check('L2. onTokensChange not called for the no-op', seen.length, 0)
  const next = [...before, { id: 'x', type: 'text', operator: '~', value: 'q' }]
  store.actions.setTokens(next)
  check('L3. a new reference replaces the tokens', store.getState().tokens, next)
  check('L4. onTokensChange fires once', seen.length, 1)
  check('L5. with the new tokens', seen[0], next)
}

// ---- prop getters: React-cased handlers, no ref ----
{
  const store = createFilteredSearch({ filters: FILTERS, id: 'fs-t15' })
  const root = getRootProps(store.getState(), store.api)
  check('M1. no ref on the core root props', 'ref' in root, false)
  check('M2. React-cased focus-out handler', typeof root.onFocusOut, 'function')
  const input = getInputProps(store.getState(), store.api)
  check('M3. no ref on the core input props', 'ref' in input, false)
  check('M4. React-cased key handler', typeof input.onKeyDown, 'function')
  check('M5. onInput is left as-is', typeof input.onInput, 'function')
}

// ---- prop getter handlers read live state, not the snapshot they were built with ----
// `getInputProps` closes over the store's `api`, but the original composable
// read plain refs at event time — a handler built from an old render must
// still act on whatever the state is *now*, not what it was when the props
// object was constructed.
{
  const store = createFilteredSearch({ filters: FILTERS, id: 'fs-t18' })
  const staleClosed = store.getState()
  const input = getInputProps(staleClosed, store.api)
  // Change state through an action *after* the props were built — the
  // snapshot `input` closed over is now stale.
  store.actions.open()
  check('P1. sanity: the snapshot used to build the props is stale', staleClosed.isOpen, false)
  check('P2. sanity: the live state has since moved on', store.getState().isOpen, true)
  input.onKeyDown({ key: 'Enter', preventDefault: () => {} })
  check('P3. Enter reads the live isOpen/flatOptions: it picks the highlighted filter, not submit()',
    store.getState().draftKey !== null, true)
}
{
  const store = createFilteredSearch({ filters: FILTERS, id: 'fs-t19' })
  pick(store, 'filter', 'label')
  pick(store, 'operator', 'in')
  pick(store, 'value', 'a11y')
  // A stale snapshot that (wrongly) still says there is text in the field.
  const staleTyping = { ...store.getState(), query: 'still typing' }
  const input = getInputProps(staleTyping, store.api)
  check('P4. sanity: the live query is actually empty', store.getState().query, '')
  input.onKeyDown({ key: 'ArrowRight', preventDefault: () => {} })
  check('P5. ArrowRight reads the live query and confirms the draft',
    store.getState().tokens.some((t) => t.type === 'label'), true)
}

// ---- rule 2 after setOptions replaces the filters (review round 1, fixed) ----
// The old composable watched the `flatOptions` computed, so swapping `filters`
// re-derived it and reset the highlight. `commit` used to compare the ids
// derived from `previous` and `next` using the *new* options for both, so a
// filter swap looked like "nothing changed" and `activeIndex` survived past
// the end of the shorter list — `aria-activedescendant` then named an option
// id that was not in the DOM. Fixed by making `options` immutable and having
// `commit` derive `previous` under the options it was actually committed with.
{
  const store = createFilteredSearch({ filters: FILTERS, id: 'fs-t16' })
  store.actions.open()
  store.api.actions.setActiveIndex(6)
  store.setOptions({ filters: FILTERS.slice(0, 2) })
  check('N1. rule 2: swapping the filters resets activeIndex', store.getState().activeIndex, 0)
  const ids = flatOptions(store.getState(), store.getOptions()).map((_, i) => store.api.optionId(i))
  const active = getInputProps(store.getState(), store.api)['aria-activedescendant']
  check('N2. aria-activedescendant still names a real option', ids.includes(active), true)
}

// ---- one token, two names (review round 1, fixed) ----
// `commitToken` used to announce from the state *before* the transition, so
// `spokenToken` still saw `state.fetched`; the chip and `appliedSummary` are
// read after the commit, and `resetDraft` has emptied `fetched` by then. For a
// filter whose values are fetched, the live region said "Rin Tanaka" while
// `aria-describedby` said "rin.tanaka". The original composable built the
// sentence after `resetDraft()`, so the announcement is meant to be the half
// that falls back to the raw value — fixed by reading the post-commit state
// for the message too, same as the chip and the summary. The underlying wart
// (a fetched label becomes unrecoverable once `fetched` is cleared) is
// pre-existing and intentionally left alone; see the comment in state.ts.
{
  const seen = []
  const store = createFilteredSearch({ filters: FILTERS, id: 'fs-t17', onAnnounce: (t) => seen.push(t) })
  pick(store, 'filter', 'assignee')
  pick(store, 'operator', 'equal')
  await new Promise((resolve) => setTimeout(resolve, 400))
  pick(store, 'value', 'rin.tanaka')
  await tick()
  const token = store.getState().tokens[0]
  const spokenInLive = seen.at(-1).replace(/^Filter added, Assignee is /, '').replace(/\.$/, '')
  check('O1. the live region and the chip name the same value',
    spokenInLive, chipValues(store.getState(), store.getOptions(), token))
  check('O2. and so does the applied summary',
    appliedSummary(store.getState(), store.getOptions()).includes(spokenInLive), true)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
