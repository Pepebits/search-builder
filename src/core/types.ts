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
  /** Secondary text beside the label — an @handle. Typing matches it too. */
  sub?: string
  /**
   * A wildcard such as None or Any: offered under "Any or none", hidden under
   * a multi-value operator ("is any of None, v4.2" means nothing), and never
   * carried into one when the operator changes.
   */
  special?: boolean
  /**
   * A value that is not in the list but behaves like one of its members — Me
   * among people. Offered first in the main group, even before an async list
   * has returned, and allowed under multi-value operators.
   */
  pinned?: boolean
  /** Seed for the avatar tint when it should follow another identity — Me is the current user. */
  tone?: string
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

/** A filter definition: one row of the bar's filter list, and the shape `createSearchBuilder` is configured with. */
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
  pinned?: boolean
  tone?: string
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
export interface SearchBuilderState {
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
  /**
   * Values committed from a fetched list, by filter key then value. A fetched
   * list is discarded when the draft resets, so this is what lets a chip keep
   * saying "Rin Tanaka" rather than "rin.tanaka", and what lets "Recently
   * used" offer her again with her avatar before any new fetch has returned.
   */
  seen: Record<string, Record<string, Value>>
  announcement: string
}

export interface SearchBuilderOptions {
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

export interface SearchBuilderStore {
  getState(): SearchBuilderState
  getOptions(): SearchBuilderOptions
  subscribe(listener: () => void): () => void
  setOptions(partial: Partial<SearchBuilderOptions>): void
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
