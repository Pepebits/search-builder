// Everything the composable computed with `computed()`. Pure functions of
// (state, options); nothing here stores anything — the store holds the one
// state object, this file only reads it.
import type {
  FilterDef, FilterToken, FilteredSearchOptions, FilteredSearchState, IndexedGroup, IndexedOption,
  Operator, Option, OptionGroup, Status, Token, Value
} from './types.ts'

const asArray = <T> (value: T | T[]): T[] => (Array.isArray(value) ? value : [value])

/** "a, b and c" — read out in full rather than as a bare list. */
function listSentence (items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export const defOf = (options: FilteredSearchOptions, key: string | null): FilterDef | null =>
  (key ? options.filters.find((f) => f.key === key) ?? null : null)

export const operatorFor = (options: FilteredSearchOptions, key: string | null, operator: string | null): Operator | null =>
  defOf(options, key)?.operators.find((o) => o.value === operator) ?? null

/** The words a screen reader reads: "is any of". */
export const operatorWords = (options: FilteredSearchOptions, key: string | null, operator: string | null): string =>
  operatorFor(options, key, operator)?.description ?? String(operator)

/** The short form the chip draws: "=", "~", "≥". Never the raw wire key. */
export const operatorSymbol = (options: FilteredSearchOptions, key: string | null, operator: string | null): string =>
  operatorFor(options, key, operator)?.symbol ?? String(operator)

export const isMultiSelect = (state: FilteredSearchState, options: FilteredSearchOptions): boolean =>
  operatorFor(options, state.draftKey, state.draftOperator)?.multiple === true

export const valuePool = (state: FilteredSearchState, def: FilterDef | null): Value[] =>
  [...(def?.specialValues ?? []), ...(def?.values ?? []), ...state.fetched]

export const valueLabel = (state: FilteredSearchState, options: FilteredSearchOptions, key: string | null, value: string): string =>
  valuePool(state, defOf(options, key)).find((v) => v.value === value)?.label ?? value

/** Accessible name for a token: "Label is one of a11y and regression". */
export const spokenToken = (state: FilteredSearchState, options: FilteredSearchOptions, token: Token): string => {
  if (token.type === 'text') return `text contains ${token.value}`
  const def = defOf(options, token.type)
  const values = asArray(token.value).map((v) => valueLabel(state, options, token.type, v))
  return `${def?.label ?? token.type} ${operatorWords(options, token.type, token.operator)} ${listSentence(values)}`
}

/** "Milestone", then "Milestone is not one of", then the values as they are picked. */
export const draftSpoken = (state: FilteredSearchState, options: FilteredSearchOptions): string => {
  const def = defOf(options, state.draftKey)
  if (!def) return ''
  const operator = operatorFor(options, state.draftKey, state.draftOperator)
  const words = operator ? ` ${operator.description}` : ''
  const values = state.draftValues.length
    ? ` ${listSentence(state.draftValues.map((v) => valueLabel(state, options, state.draftKey, v)))}`
    : ''
  return `${def.label}${words}${values}`
}

export const usedKeys = (state: FilteredSearchState, options: FilteredSearchOptions): Set<string> => {
  const set = new Set<string>()
  for (const token of state.tokens) {
    if (token.type === 'text') continue
    if (defOf(options, token.type)?.repeatable) continue
    set.add(token.type)
  }
  return set
}

const matches = (item: Value, text: string): boolean => !text || item.label.toLowerCase().includes(text)

/** Memoised on the identity of (state, options.filters) — see the hand-off. */
const groupsCache = new WeakMap<FilteredSearchState, { filters: FilterDef[]; result: OptionGroup[] }>()

function computeGroups (state: FilteredSearchState, options: FilteredSearchOptions): OptionGroup[] {
  const text = state.query.trim().toLowerCase()
  const used = usedKeys(state, options)

  if (state.stage === 'filter') {
    const list: Option[] = options.filters
      .filter((def) => !used.has(def.key))
      .filter((def) => !text || def.label.toLowerCase().includes(text) || def.key.includes(text))
      .map((def) => ({ id: `f:${def.key}`, kind: 'filter', label: def.label, hint: def.key, payload: def.key }))
    const out: OptionGroup[] = [{ id: 'filters', label: 'Filters', options: list }]
    if (text) {
      out.push({
        id: 'free-text',
        label: 'Free text',
        options: [{ id: 'f:text', kind: 'text', label: `Search for “${state.query.trim()}”`, payload: state.query.trim() }]
      })
    }
    return out.filter((g) => g.options.length)
  }

  const def = defOf(options, state.draftKey)
  if (!def) return []

  if (state.stage === 'operator') {
    return [{
      id: 'operators',
      label: `Operators for ${def.label}`,
      options: def.operators.map((op) => ({
        id: `o:${op.value}`, kind: 'operator', label: op.description,
        // The hint is the apiable key that goes on the wire — worth showing.
        hint: op.value, symbol: op.symbol ?? op.value, payload: op.value
      }))
    }]
  }

  // "None" and "Any" cannot be combined with the multi-value operators.
  const multi = isMultiSelect(state, options)
  const specials = multi ? [] : (def.specialValues ?? [])
  const pool = def.fetchValues ? state.fetched : (def.values ?? [])
  const taken = new Set(
    state.tokens
      .filter((t) => t.id !== state.editingId)
      .filter((t) => t.type === state.draftKey && t.operator === state.draftOperator)
      .flatMap((t) => asArray(t.value))
  )
  const toOption = (v: Value): Option => ({
    id: `v:${v.value}`, kind: 'value', label: v.label, payload: v.value,
    color: v.color, initials: v.initials, avatar: v.avatar, sub: v.sub, special: v.special, of: def.kind
  })
  // Look recents up across specials too, or a remembered "None" never resurfaces.
  const lookup = [...specials, ...pool]
  const recentValues = (state.recents[def.key] ?? [])
    .map((value) => lookup.find((v) => v.value === value))
    .filter((v): v is Value => !!v && !taken.has(v.value) && matches(v, text))

  const recentIds = new Set(recentValues.map((v) => v.value))

  // A free-value filter takes what was typed, offered first so Enter means
  // "use my text". Hidden when a suggestion already says the same thing.
  const typed = state.query.trim()
  const typedIsSuggested = lookup.some(
    (v) => v.value.toLowerCase() === text || v.label.toLowerCase() === text
  )
  const custom: OptionGroup[] = def.freeValue && typed && !typedIsSuggested && !taken.has(typed)
    ? [{ id: 'typed', label: 'Typed value', options: [{ id: 'v:typed', kind: 'value', label: `Use “${typed}”`, payload: typed }] }]
    : []

  return [
    ...custom,
    { id: 'special', label: 'Any or none', options: specials.filter((v) => matches(v, text)).map(toOption) },
    { id: 'recent', label: 'Recently used', options: text ? [] : recentValues.map(toOption) },
    {
      id: 'all',
      label: def.label,
      options: pool
        .filter((v) => !taken.has(v.value) && !recentIds.has(v.value) && matches(v, text))
        .map(toOption)
    }
  ].filter((g) => g.options.length)
}

/**
 * Suggestions as named groups. Every group carries its own accessible name,
 * so the section headings are not lost to screen readers.
 */
export function groups (state: FilteredSearchState, options: FilteredSearchOptions): OptionGroup[] {
  const cached = groupsCache.get(state)
  if (cached && cached.filters === options.filters) return cached.result
  const result = computeGroups(state, options)
  groupsCache.set(state, { filters: options.filters, result })
  return result
}

const flatCache = new WeakMap<FilteredSearchState, { filters: FilterDef[]; result: Option[] }>()

/** Flat view for index maths; option ids come from this order. */
export function flatOptions (state: FilteredSearchState, options: FilteredSearchOptions): Option[] {
  const cached = flatCache.get(state)
  if (cached && cached.filters === options.filters) return cached.result
  const result = groups(state, options).flatMap((g) => g.options)
  flatCache.set(state, { filters: options.filters, result })
  return result
}

/**
 * The same groups with each option's position in the flat list baked in —
 * that position is the option id `aria-activedescendant` points at. Render
 * from this, not from `groups`.
 */
export function indexedGroups (state: FilteredSearchState, options: FilteredSearchOptions): IndexedGroup[] {
  let index = 0
  return groups(state, options).map((group) => ({
    ...group,
    options: group.options.map((option): IndexedOption => ({ ...option, index: index++ }))
  }))
}

export const listboxLabel = (state: FilteredSearchState, options: FilteredSearchOptions): string => {
  if (state.stage === 'filter') return 'Filters'
  const def = defOf(options, state.draftKey)
  if (state.stage === 'operator') return `Operators for ${def?.label}`
  return `Values for ${def?.label}`
}

export const placeholder = (state: FilteredSearchState, options: FilteredSearchOptions): string => {
  const def = defOf(options, state.draftKey)
  if (state.stage === 'operator') return 'Choose an operator…'
  if (state.stage === 'value') {
    return isMultiSelect(state, options)
      ? `Choose values for ${def?.label.toLowerCase()}…`
      : `Choose a value for ${def?.label.toLowerCase()}…`
  }
  return state.tokens.length ? 'Add another filter…' : 'Search or filter results…'
}

/** Empty and busy states, so both can be announced as well as drawn. */
export const status = (state: FilteredSearchState, options: FilteredSearchOptions): Status => {
  if (state.loading) return { kind: 'loading', text: 'Loading suggestions…' }
  if (flatOptions(state, options).length) return null
  return state.query.trim()
    ? { kind: 'no-matches', text: 'No matches found' }
    : { kind: 'empty', text: 'No suggestions available' }
}

/** True while the Apply affordance means anything. */
export const canApply = (state: FilteredSearchState, options: FilteredSearchOptions): boolean =>
  state.stage === 'value' && isMultiSelect(state, options) && state.draftValues.length > 0

export const isChosen = (state: FilteredSearchState, options: FilteredSearchOptions, option: Option): boolean =>
  isMultiSelect(state, options) && state.draftValues.includes(option.payload)

export const appliedSummary = (state: FilteredSearchState, options: FilteredSearchOptions): string => {
  const count = state.tokens.length
  if (!count) return 'No filters applied.'
  return `${count} ${count === 1 ? 'filter' : 'filters'} applied: ${state.tokens.map((t) => spokenToken(state, options, t)).join('; ')}.`
}

/* --- display helpers a chip needs, whatever it looks like --- */

export const tokenLabel = (options: FilteredSearchOptions, token: Token): string =>
  token.type === 'text' ? 'Text' : defOf(options, token.type)?.label ?? token.type

export const tokenValues = (state: FilteredSearchState, options: FilteredSearchOptions, token: Token): string[] => {
  // `FilterToken.type` is `string` (any key but 'text'), so TS can't narrow
  // the union on it the way it narrows `TextToken`'s literal — the checks
  // below already tell the two apart at runtime, hence the casts.
  if (token.type === 'text') return [(token as { value: string }).value]
  const value = (token as FilterToken).value
  return asArray(value).map((v) => valueLabel(state, options, token.type, v))
}

export const isEditing = (state: FilteredSearchState, token: Token): boolean => state.editingId === token.id

export const hasOperatorChoice = (options: FilteredSearchOptions, token: Token): boolean =>
  (defOf(options, token.type)?.operators.length ?? 0) > 1

export const operatorText = (state: FilteredSearchState, options: FilteredSearchOptions, key: string | null, operator: string | null): string =>
  (options.friendlyOperators ? operatorWords(options, key, operator) : operatorSymbol(options, key, operator))

/** What the chip draws for its operator — the draft while it is being edited. */
export const chipOperator = (state: FilteredSearchState, options: FilteredSearchOptions, token: Token): string => {
  if (!isEditing(state, token)) return operatorText(state, options, token.type, token.operator)
  return state.draftOperator ? operatorText(state, options, token.type, state.draftOperator) : '…'
}

export const chipValues = (state: FilteredSearchState, options: FilteredSearchOptions, token: Token): string => {
  if (!isEditing(state, token)) return tokenValues(state, options, token).join(', ')
  return state.draftValues.length
    ? state.draftValues.map((v) => valueLabel(state, options, token.type, v)).join(', ')
    : '…'
}

/** Colour a chip as excluding. Dormant until an operator declares itself so. */
export const isNegated = (state: FilteredSearchState, options: FilteredSearchOptions, token: Token): boolean => {
  const operator = isEditing(state, token) ? state.draftOperator : token.operator
  return operatorFor(options, token.type, operator)?.negated === true
}

export const partName = (state: FilteredSearchState, options: FilteredSearchOptions, token: Token, part: 'operator' | 'value'): string => {
  const name = tokenLabel(options, token)
  if (part === 'operator') {
    return isEditing(state, token) && state.stage === 'operator'
      ? `Choosing operator for ${name}`
      : `Change operator for ${name}, currently ${operatorWords(options, token.type, token.operator)}`
  }
  return isEditing(state, token) && state.stage === 'value'
    ? `Choosing value for ${name}`
    : `Change value for ${name}, currently ${tokenValues(state, options, token).join(' and ')}`
}
