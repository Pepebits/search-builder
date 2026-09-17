// Every transition the composable used to perform with direct ref writes.
// Each function here is pure: `(state, options, ...args) => result`, where
// `result` bundles the next immutable state plus a list of effects the store
// must carry out afterwards (an announcement, a focus move, the onSubmit
// callback). Nothing in this file touches `document`, `window` or a clock —
// that is `connect.ts` and `announce.ts`'s job, orchestrated by `store.ts`.
import type { FilterDef, FilteredSearchOptions, FilteredSearchState, Operator, Token } from './types.ts'
import { defOf, draftSpoken, flatOptions, isMultiSelect, spokenToken } from './derive.ts'

const asArray = <T> (value: T | T[]): T[] => (Array.isArray(value) ? value : [value])

let uid = 0
export const nextTokenId = (): string => `tok-${++uid}`

export type Effect =
  | { type: 'announce'; message: string; opts?: { count?: boolean } }
  | { type: 'focusInput' }
  | { type: 'restoreEditFocus'; id: string; part: 'operator' | 'value' }
  | { type: 'submit'; tokens: Token[] }

export interface Transition {
  state: FilteredSearchState
  effects: Effect[]
}

export function initialState (options: FilteredSearchOptions): FilteredSearchState {
  return {
    tokens: options.tokens ?? [],
    query: '',
    isOpen: false,
    activeIndex: 0,
    stage: 'filter',
    draftKey: null,
    draftOperator: null,
    draftValues: [],
    editingId: null,
    editPart: 'operator',
    loading: false,
    fetched: [],
    recents: {},
    announcement: ''
  }
}

export function resetDraft (state: FilteredSearchState): FilteredSearchState {
  return {
    ...state,
    stage: 'filter',
    draftKey: null,
    draftOperator: null,
    draftValues: [],
    editingId: null,
    fetched: []
  }
}

/**
 * Can this value list carry over to another operator untouched? If it can,
 * changing the operator is a one-step edit and the value stage never opens.
 */
export function carryValues (values: string[], operator: Operator | null, def: FilterDef | null): string | string[] | null {
  if (!values.length || !def) return null
  const specials = new Set((def.specialValues ?? []).map((v) => v.value))
  if (operator?.multiple) {
    // "None"/"Any" are meaningless in a list, so those have to be re-picked.
    return values.some((v) => specials.has(v)) ? null : [...values]
  }
  // A single-value operator can only take one; more than that needs a choice.
  return values.length === 1 ? values[0] : null
}

export function rememberRecent (state: FilteredSearchState, options: FilteredSearchOptions, key: string, values: string[]): FilteredSearchState {
  const limit = options.recentLimit ?? 3
  const previous = state.recents[key] ?? []
  return {
    ...state,
    recents: {
      ...state.recents,
      [key]: [...values, ...previous.filter((v) => !values.includes(v))].slice(0, limit)
    }
  }
}

export function commitToken (state: FilteredSearchState, options: FilteredSearchOptions, value: string | string[]): Transition {
  const type = state.draftKey as string
  const operator = state.draftOperator as string
  if (state.editingId) {
    const updated = { id: state.editingId, type, operator, value } as Token
    let next: FilteredSearchState = { ...state, tokens: state.tokens.map((t) => (t.id === state.editingId ? updated : t)) }
    next = rememberRecent(next, options, type, asArray(value))
    next = { ...resetDraft(next), query: '' }
    // The original built this sentence *after* `resetDraft()`, so `spokenToken`
    // reads the post-commit state here, not `state`. That is a deliberate
    // match, not a nicety: `resetDraft` empties `fetched`, so a value whose
    // label only exists in a fetched list (e.g. an assignee's name) is no
    // longer resolvable, and the announcement falls back to the raw value —
    // same as the chip and `appliedSummary` do when they read it later. That
    // loss-of-label is a pre-existing wart in the original composable, not
    // something to fix here; it just has to stay consistent across all three.
    return { state: next, effects: [{ type: 'announce', message: `Filter updated, ${spokenToken(next, options, updated)}.` }] }
  }
  const token = { id: nextTokenId(), type, operator, value } as Token
  let next: FilteredSearchState = { ...state, tokens: [...state.tokens, token] }
  next = rememberRecent(next, options, type, asArray(value))
  next = { ...resetDraft(next), query: '' }
  // See the comment in the `editingId` branch above: post-reset state on purpose.
  return { state: next, effects: [{ type: 'announce', message: `Filter added, ${spokenToken(next, options, token)}.` }] }
}

/** Enter, or a click, on the highlighted suggestion. */
export function selectOption (state: FilteredSearchState, options: FilteredSearchOptions, index: number = state.activeIndex): Transition {
  const option = flatOptions(state, options)[index]
  if (!option) return { state, effects: [] }

  if (option.kind === 'text') {
    const token: Token = { id: nextTokenId(), type: 'text', operator: '~', value: option.payload }
    const next = { ...resetDraft({ ...state, tokens: [...state.tokens, token] }), query: '' }
    return { state: next, effects: [{ type: 'announce', message: `Added text search ${option.payload}.` }] }
  }

  if (option.kind === 'filter') {
    const def = defOf(options, option.payload)
    if (!def) return { state, effects: [] }
    let next = { ...state, draftKey: def.key, query: '' }
    next = def.operators.length === 1
      ? { ...next, draftOperator: def.operators[0].value, stage: 'value' }
      : { ...next, stage: 'operator' }
    return { state: next, effects: [] }
  }

  if (option.kind === 'operator') {
    const def = defOf(options, state.draftKey)
    const nextOperator = def?.operators.find((o) => o.value === option.payload) ?? null

    if (state.editingId) {
      // Changing the operator on an existing chip is one step: if the value
      // it already holds still works, commit and stop. Opening the value list
      // for a value nobody asked to change is the thing that made no sense.
      const carried = carryValues(state.draftValues, nextOperator, def)
      if (carried !== null) {
        return commitToken({ ...state, draftOperator: option.payload }, options, carried)
      }
    }

    const next = { ...state, draftOperator: option.payload, draftValues: [], stage: 'value' as const, query: '' }
    return { state: next, effects: [] }
  }

  if (!isMultiSelect(state, options)) {
    return commitToken(state, options, option.payload)
  }

  // Multi-value operator: toggle, keep the list open, report the running total.
  const chosen = state.draftValues.includes(option.payload)
  const draftValues = chosen
    ? state.draftValues.filter((v) => v !== option.payload)
    : [...state.draftValues, option.payload]
  const next = { ...state, draftValues, query: '' }
  const total = draftValues.length
  const message = `${option.label} ${chosen ? 'removed' : 'added'}. ${total} ${total === 1 ? 'value' : 'values'} chosen.`
  return { state: next, effects: [{ type: 'announce', message, opts: { count: false } }] }
}

/** Commit the multi-value filter that has been building up. */
export function applyDraft (state: FilteredSearchState, options: FilteredSearchOptions): Transition {
  if (!isMultiSelect(state, options) || !state.draftValues.length) return { state, effects: [] }
  return commitToken(state, options, [...state.draftValues])
}

export interface OkTransition extends Transition { ok: boolean }

/**
 * Auto-confirm: the gestures that mean "I am done picking" — ArrowRight on an
 * empty field, Tab, a pointer down outside, focus leaving — commit the
 * multi-value draft without a trip to the Apply button. Guarded by `canApply`
 * (see derive.ts), so nothing happens with no values chosen, and committing
 * resets the draft, so a second trigger in the same gesture cannot duplicate
 * the token.
 */
export function confirmDraft (state: FilteredSearchState, options: FilteredSearchOptions): OkTransition {
  if (!(state.stage === 'value' && isMultiSelect(state, options) && state.draftValues.length > 0)) {
    return { ok: false, state, effects: [] }
  }
  const result = commitToken(state, options, [...state.draftValues])
  return { ok: true, state: result.state, effects: result.effects }
}

export function move (state: FilteredSearchState, options: FilteredSearchOptions, delta: number): Transition {
  const opened = { ...state, isOpen: true }
  const count = flatOptions(opened, options).length
  if (!count) return { state: opened, effects: [] }
  const activeIndex = (state.activeIndex + delta + count) % count
  return { state: { ...opened, activeIndex }, effects: [] }
}

export function jump (state: FilteredSearchState, options: FilteredSearchOptions, edge: 'start' | 'end'): Transition {
  const opened = { ...state, isOpen: true }
  const count = flatOptions(opened, options).length
  if (!count) return { state: opened, effects: [] }
  const activeIndex = edge === 'start' ? 0 : count - 1
  return { state: { ...opened, activeIndex }, effects: [] }
}

/** Throw away the half-built filter entirely — the pure part, no focus move. */
export function cancelDraft (state: FilteredSearchState, options: FilteredSearchOptions): Transition {
  if (state.stage === 'filter') return { state, effects: [] }
  const was = draftSpoken(state, options)
  const wasEditing = Boolean(state.editingId)
  const next = { ...resetDraft(state), query: '' }
  const message = wasEditing ? `Edit cancelled, ${was} left as it was.` : `Discarded the filter being added, ${was}.`
  return { state: next, effects: [{ type: 'announce', message, opts: { count: false } }] }
}

/**
 * The × on the pending chip, and what the composable's public `cancelDraft`
 * actually did: discard the draft, then put focus back where it started.
 */
export function discardDraft (state: FilteredSearchState, options: FilteredSearchOptions): Transition {
  const wasEditing = state.editingId
  const part = state.editPart
  const result = cancelDraft(state, options)
  const effects = [...result.effects, wasEditing
    ? { type: 'restoreEditFocus' as const, id: wasEditing, part }
    : { type: 'focusInput' as const }]
  return { state: result.state, effects }
}

/** Escape and Backspace unwind one stage rather than throwing the draft away. */
export function stepBack (state: FilteredSearchState, options: FilteredSearchOptions): OkTransition {
  // An edit opened straight at one stage, so there is no earlier stage to
  // unwind to: backing out means leaving the chip as it was.
  if (state.editingId) {
    const result = cancelDraft(state, options)
    return { ok: true, state: result.state, effects: result.effects }
  }
  if (state.stage === 'value') {
    if (state.draftValues.length) {
      return {
        ok: true,
        state: { ...state, draftValues: [] },
        effects: [{ type: 'announce', message: 'Chosen values cleared.', opts: { count: false } }]
      }
    }
    const def = defOf(options, state.draftKey)
    const next = (def?.operators.length ?? 0) > 1
      ? { ...state, stage: 'operator' as const, draftOperator: null, query: '' }
      : { ...resetDraft(state), query: '' }
    return { ok: true, state: next, effects: [] }
  }
  if (state.stage === 'operator') {
    return { ok: true, state: { ...resetDraft(state), query: '' }, effects: [] }
  }
  if (state.isOpen) {
    return { ok: true, state: { ...state, isOpen: false }, effects: [] }
  }
  return { ok: false, state, effects: [] }
}

/**
 * Escape: unwind one stage, and if that closed out an edit, put focus back
 * on the chip part the edit was opened from.
 */
export function escape (state: FilteredSearchState, options: FilteredSearchOptions): Transition {
  const wasEditing = state.editingId
  const part = state.editPart
  const result = stepBack(state, options)
  const effects = [...result.effects]
  if (wasEditing && !result.state.editingId) {
    effects.push({ type: 'restoreEditFocus', id: wasEditing, part })
  }
  return { state: result.state, effects }
}

/**
 * Re-open one part of an existing chip: focus the part, press Space. `part` is 'operator' or 'value'; each opens only its own step,
 * because wanting a different operator is not wanting a different value.
 */
export function startEdit (state: FilteredSearchState, options: FilteredSearchOptions, id: string, part: 'operator' | 'value' = 'operator'): OkTransition {
  const token = state.tokens.find((t) => t.id === id)
  if (!token || token.type === 'text') return { ok: false, state, effects: [] }
  const def = defOf(options, token.type)
  const wanted = part === 'value' || (def?.operators.length ?? 0) === 1 ? 'value' : 'operator'
  const next: FilteredSearchState = {
    ...state,
    editingId: id,
    draftKey: token.type,
    draftOperator: token.operator,
    draftValues: asArray(token.value),
    query: '',
    isOpen: true,
    stage: wanted
  }
  const message = `Editing ${spokenToken(state, options, token)}. Choose ${wanted === 'operator' ? 'an operator' : 'a value'}.`
  return { ok: true, state: next, effects: [{ type: 'announce', message, opts: { count: false } }] }
}

export function startEditPart (state: FilteredSearchState, options: FilteredSearchOptions, id: string, part: 'operator' | 'value'): Transition {
  const withPart = { ...state, editPart: part }
  const result = startEdit(withPart, options, id, part)
  if (!result.ok) return { state: withPart, effects: [] }
  return { state: result.state, effects: [...result.effects, { type: 'focusInput' }] }
}

export function handleBackspace (state: FilteredSearchState, options: FilteredSearchOptions, event: { preventDefault (): void }): Transition {
  if (state.query !== '') return { state, effects: [] }
  if (state.stage !== 'filter') {
    event.preventDefault()
    const result = stepBack(state, options)
    return { state: result.state, effects: result.effects }
  }
  if (!state.tokens.length) return { state, effects: [] }
  event.preventDefault()
  const last = state.tokens[state.tokens.length - 1]
  const next = { ...state, tokens: state.tokens.slice(0, -1) }
  return { state: next, effects: [{ type: 'announce', message: `Filter removed, ${spokenToken(state, options, last)}.` }] }
}

export function removeToken (state: FilteredSearchState, options: FilteredSearchOptions, id: string): Transition {
  const base = state.editingId === id ? resetDraft(state) : state
  const token = state.tokens.find((t) => t.id === id)
  const next = { ...base, tokens: base.tokens.filter((t) => t.id !== id) }
  if (!token) return { state: next, effects: [] }
  return { state: next, effects: [{ type: 'announce', message: `Filter removed, ${spokenToken(state, options, token)}.` }] }
}

/** A term typed but never turned into a chip still counts as the search. */
export function commitPendingText (state: FilteredSearchState): OkTransition {
  if (state.stage !== 'filter') return { ok: false, state, effects: [] }
  const text = state.query.trim()
  if (!text) return { ok: false, state, effects: [] }
  const token: Token = { id: nextTokenId(), type: 'text', operator: '~', value: text }
  const next = { ...state, tokens: [...state.tokens, token], query: '' }
  return { ok: true, state: next, effects: [] }
}

export function clearAll (state: FilteredSearchState): Transition {
  if (!state.tokens.length && !state.query && state.stage === 'filter') return { state, effects: [] }
  const next = { ...resetDraft(state), tokens: [], query: '' }
  return { state: next, effects: [{ type: 'announce', message: 'All filters cleared.' }] }
}

/** Run the search: commit anything still typed, close the list, keep focus. */
export function submit (state: FilteredSearchState): Transition {
  const pending = commitPendingText(state)
  const next = { ...pending.state, isOpen: false }
  return {
    state: next,
    effects: [
      { type: 'focusInput' },
      { type: 'announce', message: 'Search run.' },
      { type: 'submit', tokens: next.tokens }
    ]
  }
}

/** The listbox's mouseover highlight — a direct jump, no wrap-around maths. */
export function setActiveIndex (state: FilteredSearchState, index: number): Transition {
  return { state: { ...state, activeIndex: index }, effects: [] }
}

export function open (state: FilteredSearchState): Transition {
  return { state: { ...state, isOpen: true }, effects: [] }
}

export function close (state: FilteredSearchState): Transition {
  return { state: { ...state, isOpen: false }, effects: [] }
}

export function setQuery (state: FilteredSearchState, text: string): Transition {
  return { state: { ...state, query: text }, effects: [] }
}

/** A no-op when the array is the same reference — what keeps the adapter's sync from looping. */
export function setTokens (state: FilteredSearchState, tokens: Token[]): Transition {
  if (tokens === state.tokens) return { state, effects: [] }
  return { state: { ...state, tokens }, effects: [] }
}
