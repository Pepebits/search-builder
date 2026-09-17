// Public types for the framework-agnostic core. Kept to erasable syntax
// (no enum, no parameter properties, no namespaces) so Node can strip them
// and run tests/core.mjs with no build step.
import type { PropApi } from './props.ts'

/** One value a filter can hold — a suggestion row, and a token's payload. */
export interface Value {
  value: string
  label: string
  color?: string
  initials?: string
  avatar?: string
  sub?: string
  special?: boolean
}

/** An operator a filter offers ("is", "is any of", "contains", …). */
export interface Operator {
  value: string
  symbol?: string
  description: string
  /** The value stage accumulates values into one token instead of committing on pick. */
  multiple?: boolean
  /** Styles the chip as excluding. */
  negated?: boolean
}

/** A filter definition, as authored in `src/data/filters.js`. */
export interface FilterDef {
  key: string
  label: string
  param?: string
  operators: Operator[]
  values?: Value[]
  fetchValues?: (query: string) => Promise<Value[]>
  specialValues?: Value[]
  /** Can appear more than once as a token (e.g. Label). */
  repeatable?: boolean
  /** Lets the value stage accept typed text, not only a suggestion. */
  freeValue?: boolean
  kind?: string
}

export interface TextToken {
  id: string
  type: 'text'
  operator: string
  value: string
}

export interface FilterToken {
  id: string
  type: string
  operator: string
  value: string | string[]
}

export type Token = TextToken | FilterToken

export type Stage = 'filter' | 'operator' | 'value'

/** A row the listbox can render — a filter, an operator, a value or free text. */
export interface Option {
  id: string
  kind: 'filter' | 'text' | 'operator' | 'value'
  label: string
  hint?: string
  payload: string
  symbol?: string
  color?: string
  initials?: string
  avatar?: string
  sub?: string
  special?: boolean
  of?: string
}

/** An option with its position in the flat list baked in. */
export interface IndexedOption extends Option {
  index: number
}

export interface OptionGroup {
  id: string
  label: string
  options: Option[]
}

export interface IndexedGroup extends OptionGroup {
  options: IndexedOption[]
}

export type Status =
  | { kind: 'loading'; text: string }
  | { kind: 'no-matches'; text: string }
  | { kind: 'empty'; text: string }
  | null

/** One immutable snapshot of everything the behaviour needs. */
export interface FilteredSearchState {
  tokens: Token[]
  query: string
  isOpen: boolean
  activeIndex: number
  stage: Stage
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

export interface FilteredSearchOptions {
  filters: FilterDef[]
  tokens?: Token[]
  label?: string
  resultCount?: number | null
  friendlyOperators?: boolean
  recentLimit?: number
  /** Scope for every id this instance mints; defaults to `fs-<counter>`. */
  id?: string
  onSubmit?: (tokens: Token[]) => void
  onAnnounce?: (text: string) => void
  onTokensChange?: (tokens: Token[]) => void
}

export interface FilteredSearchStore {
  getState(): FilteredSearchState
  getOptions(): FilteredSearchOptions
  subscribe(listener: () => void): () => void
  setOptions(partial: Partial<FilteredSearchOptions>): void
  connect(root: HTMLElement, schedule?: (fn: () => void) => void): () => void
  api: PropApi
  actions: {
    selectOption(index?: number): void
    applyDraft(): void
    confirmDraft(): boolean
    stepBack(): boolean
    cancelDraft(): void
    startEdit(id: string, part?: 'operator' | 'value'): boolean
    startEditPart(id: string, part: 'operator' | 'value'): void
    commitToken(value: string | string[]): void
    handleBackspace(event: { preventDefault(): void }): void
    removeToken(id: string): void
    commitPendingText(): boolean
    clearAll(): void
    submit(): void
    move(delta: number): void
    jump(edge: 'start' | 'end'): void
    escape(): void
    discardDraft(): void
    open(): void
    close(): void
    setQuery(text: string): void
    setTokens(tokens: Token[]): void
    carryValues(values: string[], operator: Operator | null, def: FilterDef): string | string[] | null
    focusInput(): void
    openAndFocus(): void
    resetDraft(): void
    scrollActiveIntoView(): void
    /** The listbox's mouseover highlight — a direct jump, no wrap-around maths. */
    setActiveIndex(index: number): void
  }
}
