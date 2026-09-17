// Everything the composable computed with `computed()`. Pure functions of
// (state, options); nothing here stores anything — the store holds the one
// state object, this file only reads it.
import type {
  FilterDef, FilterToken, SearchBuilderOptions, SearchBuilderState, IndexedGroup, IndexedOption,
  Operator, Option, OptionGroup, Status, Token, Value
} from './types.ts'

const asArray = <T> (value: T | T[]): T[] => (Array.isArray(value) ? value : [value])

/** "a, b and c" — read out in full rather than as a bare list. */
function listSentence (items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export const defOf = (options: SearchBuilderOptions, key: string | null): FilterDef | null =>
  (key ? options.filters.find((f) => f.key === key) ?? null : null)

export const operatorFor = (options: SearchBuilderOptions, key: string | null, operator: string | null): Operator | null =>
  defOf(options, key)?.operators.find((o) => o.value === operator) ?? null

/** The words a screen reader reads: "is any of". */
export const operatorWords = (options: SearchBuilderOptions, key: string | null, operator: string | null): string =>
  operatorFor(options, key, operator)?.description ?? String(operator)

/** The short form the chip draws: "=", "~", "≥". Never the raw wire key. */
export const operatorSymbol = (options: SearchBuilderOptions, key: string | null, operator: string | null): string =>
  operatorFor(options, key, operator)?.symbol ?? String(operator)

export const isMultiSelect = (state: SearchBuilderState, options: SearchBuilderOptions): boolean =>
  operatorFor(options, state.draftKey, state.draftOperator)?.multiple === true

export const valuePool = (state: SearchBuilderState, def: FilterDef | null): Value[] => [
  ...(def?.specialValues ?? []),
  ...(def?.values ?? []),
  ...state.fetched,
  // Last, so a live fetch wins over what was remembered about the same value.
  ...(def ? Object.values(state.seen[def.key] ?? {}) : [])
]

export const valueLabel = (state: SearchBuilderState, options: SearchBuilderOptions, key: string | null, value: string): string =>
  valuePool(state, defOf(options, key)).find((v) => v.value === value)?.label ?? value

/** Accessible name for a token: "Label is one of a11y and regression". */
export const spokenToken = (state: SearchBuilderState, options: SearchBuilderOptions, token: Token): string => {
  if (token.type === 'text') return `text contains ${token.value}`
  const def = defOf(options, token.type)
  const values = asArray(token.value).map((v) => valueLabel(state, options, token.type, v))
  return `${def?.label ?? token.type} ${operatorWords(options, token.type, token.operator)} ${listSentence(values)}`
}

/** "Milestone", then "Milestone is not one of", then the values as they are picked. */
export const draftSpoken = (state: SearchBuilderState, options: SearchBuilderOptions): string => {
  const def = defOf(options, state.draftKey)
  if (!def) return ''
  const operator = operatorFor(options, state.draftKey, state.draftOperator)
  const words = operator ? ` ${operator.description}` : ''
  const values = state.draftValues.length
    ? ` ${listSentence(state.draftValues.map((v) => valueLabel(state, options, state.draftKey, v)))}`
    : ''
  return `${def.label}${words}${values}`
}

export const usedKeys = (state: SearchBuilderState, options: SearchBuilderOptions): Set<string> => {
  const set = new Set<string>()
  for (const token of state.tokens) {
    if (token.type === 'text') continue
    if (defOf(options, token.type)?.repeatable) continue
    set.add(token.type)
  }
  return set
}

/**
 * A label split around the first, case-insensitive occurrence of what was
 * typed, so a row can show *why* it matched. Uses the same trimmed, lowercased
 * query `matches` filters by; an empty query or no hit yields one plain segment.
 */
export function matchSegments (text: string, query: string): Array<{ text: string, hit: boolean }> {
  const needle = query.trim().toLowerCase()
  const at = needle ? text.toLowerCase().indexOf(needle) : -1
  if (at === -1) return [{ text, hit: false }]
  return [
    { text: text.slice(0, at), hit: false },
    { text: text.slice(at, at + needle.length), hit: true },
    { text: text.slice(at + needle.length), hit: false }
  ].filter((s) => s.text)
}

const matches = (item: Value, text: string): boolean =>
  !text || item.label.toLowerCase().includes(text) || (item.sub?.toLowerCase().includes(text) ?? false)

/**
 * A small memo keyed on the inputs a computation actually reads, compared by
 * identity, rather than on the state object itself: state is replaced on every
 * commit, including ones that cannot change the suggestion list (an
 * announcement, `activeIndex`, a `resultCount` update), and those must not
 * throw the previous result away. A handful of entries covers several stores
 * sharing the module without one evicting another's result on every call.
 */
function memo<T> (size = 8): (deps: unknown[], compute: () => T) => T {
  const entries: Array<{ deps: unknown[], result: T }> = []
  return (deps, compute) => {
    const hit = entries.findIndex((e) => e.deps.length === deps.length && e.deps.every((d, i) => d === deps[i]))
    if (hit !== -1) {
      const [entry] = entries.splice(hit, 1)
      entries.unshift(entry)
      return entry.result
    }
    const result = compute()
    entries.unshift({ deps, result })
    if (entries.length > size) entries.pop()
    return result
  }
}

/** Everything `computeGroups` reads. Keep in step with it. */
const groupDeps = (state: SearchBuilderState, options: SearchBuilderOptions): unknown[] => [
  options.filters, state.stage, state.query, state.tokens, state.editingId,
  state.draftKey, state.draftOperator, state.fetched, state.recents, state.seen
]

const groupsMemo = memo<OptionGroup[]>()
const flatMemo = memo<Option[]>()

function computeGroups (state: SearchBuilderState, options: SearchBuilderOptions): OptionGroup[] {
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

  // Wildcards ("None", "Any") cannot be combined with the multi-value operators;
  // pinned values ("Me") are ordinary members of the list that happen to be
  // known up front, so they lead the main group whatever the operator.
  const multi = isMultiSelect(state, options)
  const wildcards = (def.specialValues ?? []).filter((v) => v.special)
  const pinned = (def.specialValues ?? []).filter((v) => !v.special)
  const specials = multi ? [] : wildcards
  const pool = [...pinned, ...(def.fetchValues ? state.fetched : (def.values ?? []))]
  const taken = new Set(
    state.tokens
      .filter((t) => t.id !== state.editingId)
      .filter((t) => t.type === state.draftKey && t.operator === state.draftOperator)
      .flatMap((t) => asArray(t.value))
  )
  const toOption = (v: Value): Option => ({
    id: `v:${v.value}`, kind: 'value', label: v.label, payload: v.value,
    color: v.color, initials: v.initials, avatar: v.avatar, sub: v.sub, special: v.special,
    pinned: v.pinned, tone: v.tone, of: def.kind
  })
  // Look recents up across specials too, or a remembered "None" never resurfaces;
  // and across values seen in earlier fetches, or an async filter never has recents.
  const remembered = Object.values(state.seen[def.key] ?? {}).filter((v) => !pool.some((p) => p.value === v.value))
  const lookup = [...specials, ...pool, ...remembered]
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
export function groups (state: SearchBuilderState, options: SearchBuilderOptions): OptionGroup[] {
  return groupsMemo(groupDeps(state, options), () => computeGroups(state, options))
}

/** Flat view for index maths; option ids come from this order. */
export function flatOptions (state: SearchBuilderState, options: SearchBuilderOptions): Option[] {
  return flatMemo(groupDeps(state, options), () => groups(state, options).flatMap((g) => g.options))
}

/**
 * The same groups with each option's position in the flat list baked in —
 * that position is the option id `aria-activedescendant` points at. Render
 * from this, not from `groups`.
 */
export function indexedGroups (state: SearchBuilderState, options: SearchBuilderOptions): IndexedGroup[] {
  let index = 0
  return groups(state, options).map((group) => ({
    ...group,
    options: group.options.map((option): IndexedOption => ({ ...option, index: index++ }))
  }))
}

export const listboxLabel = (state: SearchBuilderState, options: SearchBuilderOptions): string => {
  if (state.stage === 'filter') return 'Filters'
  const def = defOf(options, state.draftKey)
  if (state.stage === 'operator') return `Operators for ${def?.label}`
  return `Values for ${def?.label}`
}

export const placeholder = (state: SearchBuilderState, options: SearchBuilderOptions): string => {
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
export const status = (state: SearchBuilderState, options: SearchBuilderOptions): Status => {
  if (state.loading) return { kind: 'loading', text: 'Loading suggestions…' }
  if (flatOptions(state, options).length) return null
  return state.query.trim()
    ? { kind: 'no-matches', text: 'No matches found' }
    : { kind: 'empty', text: 'No suggestions available' }
}

/** True while the Apply affordance means anything. */
export const canApply = (state: SearchBuilderState, options: SearchBuilderOptions): boolean =>
  state.stage === 'value' && isMultiSelect(state, options) && state.draftValues.length > 0

export const isChosen = (state: SearchBuilderState, options: SearchBuilderOptions, option: Option): boolean =>
  isMultiSelect(state, options) && state.draftValues.includes(option.payload)

export const appliedSummary = (state: SearchBuilderState, options: SearchBuilderOptions): string => {
  const count = state.tokens.length
  if (!count) return 'No filters applied.'
  return `${count} ${count === 1 ? 'filter' : 'filters'} applied: ${state.tokens.map((t) => spokenToken(state, options, t)).join('; ')}.`
}

/* --- display helpers a chip needs, whatever it looks like --- */

export const tokenLabel = (options: SearchBuilderOptions, token: Token): string =>
  token.type === 'text' ? 'Text' : defOf(options, token.type)?.label ?? token.type

export const tokenValues = (state: SearchBuilderState, options: SearchBuilderOptions, token: Token): string[] => {
  // `FilterToken.type` is `string` (any key but 'text'), so TS can't narrow
  // the union on it the way it narrows `TextToken`'s literal — the checks
  // below already tell the two apart at runtime, hence the casts.
  if (token.type === 'text') return [(token as { value: string }).value]
  const value = (token as FilterToken).value
  return asArray(value).map((v) => valueLabel(state, options, token.type, v))
}

export const isEditing = (state: SearchBuilderState, token: Token): boolean => state.editingId === token.id

export const hasOperatorChoice = (options: SearchBuilderOptions, token: Token): boolean =>
  (defOf(options, token.type)?.operators.length ?? 0) > 1

export const operatorText = (state: SearchBuilderState, options: SearchBuilderOptions, key: string | null, operator: string | null): string =>
  (options.friendlyOperators ? operatorWords(options, key, operator) : operatorSymbol(options, key, operator))

/** What the chip draws for its operator — the draft while it is being edited. */
export const chipOperator = (state: SearchBuilderState, options: SearchBuilderOptions, token: Token): string => {
  if (!isEditing(state, token)) return operatorText(state, options, token.type, token.operator)
  return state.draftOperator ? operatorText(state, options, token.type, state.draftOperator) : '…'
}

export const chipValues = (state: SearchBuilderState, options: SearchBuilderOptions, token: Token): string => {
  if (!isEditing(state, token)) return tokenValues(state, options, token).join(', ')
  return state.draftValues.length
    ? state.draftValues.map((v) => valueLabel(state, options, token.type, v)).join(', ')
    : '…'
}

/** Colour a chip as excluding. Dormant until an operator declares itself so. */
export const isNegated = (state: SearchBuilderState, options: SearchBuilderOptions, token: Token): boolean => {
  const operator = isEditing(state, token) ? state.draftOperator : token.operator
  return operatorFor(options, token.type, operator)?.negated === true
}

export const partName = (state: SearchBuilderState, options: SearchBuilderOptions, token: Token, part: 'operator' | 'value'): string => {
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
