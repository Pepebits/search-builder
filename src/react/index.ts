// The React adapter: a thin hook over the framework-agnostic store that
// keeps the Vue adapter's names, with plain values where Vue has refs (see
// the Phase 2 hand-off). No JSX here on purpose — this file only builds
// prop objects, it never renders anything.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import * as core from '../core/index.ts'
import type { FilterDef, Option, Token } from '../core/index.ts'
import { normalizeProps } from './normalize.ts'

/** Same members in the same order — the cheapest "nothing actually changed". */
const sameMembers = <T>(a: T[], b: T[]): boolean =>
  a === b || (a.length === b.length && a.every((item, index) => item === b[index]))

export interface UseFilteredSearchOptions {
  filters: FilterDef[]
  /** Controlled tokens, React's `value`/`onChange` idiom. */
  tokens?: Token[]
  /** Uncontrolled initial tokens; ignored once `tokens` is passed. */
  defaultTokens?: Token[]
  onTokensChange?: (tokens: Token[]) => void
  label?: string
  resultCount?: number | null
  friendlyOperators?: boolean
  recentLimit?: number
  /** Scope for every id this instance mints; defaults to `fs-<counter>`. */
  id?: string
  onSubmit?: (tokens: Token[]) => void
  onAnnounce?: (text: string) => void
}

export function useFilteredSearch (options: UseFilteredSearchOptions) {
  const {
    filters,
    tokens,
    defaultTokens,
    onTokensChange,
    label = 'Search or filter results',
    resultCount = null,
    friendlyOperators = false,
    recentLimit = 3,
    id,
    onSubmit,
    onAnnounce
  } = options

  // A new function identity every render must not cost a `setOptions` commit
  // (ADR-0005 §6 is about `filters`/`label`/etc., not callbacks): keep the
  // latest callback in a ref, read by a wrapper that is created once and
  // handed to the store at construction time.
  const onSubmitRef = useRef(onSubmit)
  onSubmitRef.current = onSubmit
  const onAnnounceRef = useRef(onAnnounce)
  onAnnounceRef.current = onAnnounce
  const onTokensChangeRef = useRef(onTokensChange)
  onTokensChangeRef.current = onTokensChange

  const [store] = useState(() => core.createFilteredSearch({
    filters,
    tokens: tokens ?? defaultTokens ?? [],
    label,
    resultCount,
    friendlyOperators,
    recentLimit,
    id,
    onSubmit: (value) => { onSubmitRef.current?.(value) },
    onAnnounce: (text) => { onAnnounceRef.current?.(text) },
    // The other half of ADR-0005 §3; the effect below is the one-way sync
    // into the store for a *controlled* consumer.
    onTokensChange: (next) => { onTokensChangeRef.current?.(next) }
  }))

  const snapshot = useSyncExternalStore(store.subscribe, store.getState, store.getState)

  // One effect per option, mirroring the Vue adapter's per-ref `watch`es: an
  // unrelated re-render (a new `onSubmit` closure, say) must not re-commit.
  // `filters` is the one that is an array, so it is the one that needs the
  // member comparison below; the other three are primitives that `Object.is`
  // already settles.
  const filtersRef = useRef(filters)
  useEffect(() => {
    // `setOptions` always commits (the core forces a fresh state object so
    // memoised selectors re-derive) and every commit re-renders, so an
    // effect that fired on array *identity* alone would never settle for
    // the idiomatic React consumer who writes `filters={[...]}` inline:
    // render → effect → commit → render, until React gives up with
    // "Maximum update depth exceeded". Vue gets this for free — a prop
    // array keeps its identity across renders there — so comparing the
    // members here is what makes the two adapters behave the same.
    if (sameMembers(filtersRef.current, filters)) return
    filtersRef.current = filters
    store.setOptions({ filters })
  }, [store, filters])
  useEffect(() => { store.setOptions({ label }) }, [store, label])
  useEffect(() => { store.setOptions({ resultCount }) }, [store, resultCount])
  useEffect(() => { store.setOptions({ friendlyOperators }) }, [store, friendlyOperators])

  // Tokens (ADR-0005 §3): only a *controlled* consumer (one that passed
  // `tokens`) pushes back into the store; the same-reference no-op inside
  // `setTokens` is what stops this and the store's own `onTokensChange`
  // (wired once, above) from looping on each other.
  useEffect(() => {
    if (tokens) store.actions.setTokens(tokens)
  }, [store, tokens])

  /* ---- DOM lifecycle (ADR-0005 §4) --------------------------------------
   * `schedule` must run its callback after React has committed the
   * re-render that follows the current store commit. A queue drained in a
   * `useLayoutEffect` with no deps does exactly that: that effect re-runs
   * after every commit of *this* component, which is what a store commit
   * produces (its snapshot is a fresh object every time, so
   * `useSyncExternalStore` never bails out). The `queueMicrotask` alongside
   * every push is a fallback for a `schedule` call that, for whatever
   * reason, is not followed by one of this component's own commits — it
   * still runs before the next paint, and is a no-op if the layout effect
   * already drained the queue. */
  const queueRef = useRef<Array<() => void>>([])
  const drain = useCallback(() => {
    const queue = queueRef.current
    queueRef.current = []
    for (const fn of queue) fn()
  }, [])
  useLayoutEffect(() => { drain() })
  const schedule = useCallback((fn: () => void) => {
    queueRef.current.push(fn)
    queueMicrotask(drain)
  }, [drain])

  // The root getter's callback `ref`: no `rootRef`/`inputRef`/`listRef` in
  // the return value (ADR-0005 §4) — a consumer gets the root through
  // `getRootProps()` and everything else through `data-fs` lookups, same as
  // the core's own DOM controller does.
  const disconnectRef = useRef<(() => void) | null>(null)
  const rootRef = useCallback((el: HTMLElement | null) => {
    disconnectRef.current?.()
    disconnectRef.current = el ? store.connect(el, schedule) : null
  }, [store, schedule])

  const opts = () => store.getOptions()

  /* ---- state, plain values over the one immutable snapshot -------------- */
  const query = snapshot.query
  const isOpen = snapshot.isOpen
  const stage = snapshot.stage
  const activeIndex = snapshot.activeIndex
  const loading = snapshot.loading
  const editingId = snapshot.editingId
  const editPart = snapshot.editPart
  const draftOperator = snapshot.draftOperator
  const draftValues = snapshot.draftValues
  const announcement = snapshot.announcement

  const draftDef = core.defOf(opts(), snapshot.draftKey)
  const groups = core.groups(snapshot, opts())
  const indexedGroups = core.indexedGroups(snapshot, opts())
  const flatOptions = core.flatOptions(snapshot, opts())
  const status = core.status(snapshot, opts())
  const listboxLabel = core.listboxLabel(snapshot, opts())
  const placeholder = core.placeholder(snapshot, opts())
  const appliedSummary = core.appliedSummary(snapshot, opts())
  const canApply = core.canApply(snapshot, opts())
  const draftSpoken = core.draftSpoken(snapshot, opts())
  const isMultiSelect = core.isMultiSelect(snapshot, opts())

  const isChosen = (option: Option) => core.isChosen(snapshot, opts(), option)

  /* ---- actions: plain functions, no `this` — safe to hand out detached -- */
  const { actions } = store

  /* ---- display helpers a chip needs, whatever it looks like ------------- */
  const defOf = (key: string | null) => core.defOf(opts(), key)
  const valueLabel = (key: string | null, value: string) => core.valueLabel(snapshot, opts(), key, value)
  const operatorWords = (key: string | null, operator: string | null) => core.operatorWords(opts(), key, operator)
  const operatorSymbol = (key: string | null, operator: string | null) => core.operatorSymbol(opts(), key, operator)
  const operatorText = (key: string | null, operator: string | null) => core.operatorText(snapshot, opts(), key, operator)
  const spokenToken = (token: Token) => core.spokenToken(snapshot, opts(), token)
  const tokenLabel = (token: Token) => core.tokenLabel(opts(), token)
  const tokenValues = (token: Token) => core.tokenValues(snapshot, opts(), token)
  const isEditing = (token: Token) => core.isEditing(snapshot, token)
  const isNegated = (token: Token) => core.isNegated(snapshot, opts(), token)
  const hasOperatorChoice = (token: Token) => core.hasOperatorChoice(opts(), token)
  const chipOperator = (token: Token) => core.chipOperator(snapshot, opts(), token)
  const chipValues = (token: Token) => core.chipValues(snapshot, opts(), token)
  const partName = (token: Token, part: 'operator' | 'value') => core.partName(snapshot, opts(), token, part)

  /* ---- prop getters: bound to the current snapshot, normalised for React -
   * Every one of these goes through `toReactProps`, whether or not it
   * happens to carry a handler today — one rule, not a per-getter judgment
   * call (mirrors the Vue adapter's `toVueProps`). */
  const toReactProps = (props: Record<string, unknown>, extra?: Record<string, unknown>) => ({
    ...normalizeProps(props),
    ...extra
  })
  const getRootProps = () => toReactProps(core.getRootProps(snapshot, store.api), { ref: rootRef })
  const getLabelProps = () => toReactProps(core.getLabelProps(store.api))
  const getInputProps = () => toReactProps(core.getInputProps(snapshot, store.api))
  const getFieldsetProps = () => toReactProps(core.getFieldsetProps(store.api))
  const getTokenListProps = () => toReactProps(core.getTokenListProps())
  const getTokenProps = (token: Token) => toReactProps(core.getTokenProps(snapshot, store.api, token))
  const getPendingProps = () => toReactProps(core.getPendingProps(snapshot, store.api))
  const getOperatorProps = (token: Token) => toReactProps(core.getOperatorProps(snapshot, store.api, token))
  const getValueProps = (token: Token) => toReactProps(core.getValueProps(snapshot, store.api, token))
  const getRemoveProps = (token: Token) => toReactProps(core.getRemoveProps(snapshot, store.api, token))
  const getListboxProps = () => toReactProps(core.getListboxProps(snapshot, store.api))
  const getGroupProps = (group: core.OptionGroup) => toReactProps(core.getGroupProps(group))
  const getOptionProps = (option: core.IndexedOption) => toReactProps(core.getOptionProps(snapshot, store.api, option))
  const getStatusRowProps = () => toReactProps(core.getStatusRowProps(snapshot, store.api))
  const getHintProps = () => toReactProps(core.getHintProps(store.api))
  const getAppliedProps = () => toReactProps(core.getAppliedProps(store.api))
  const getLiveRegionProps = () => toReactProps(core.getLiveRegionProps())
  const getApplyProps = () => toReactProps(core.getApplyProps(snapshot, store.api))
  const getDiscardProps = () => toReactProps(core.getDiscardProps(snapshot, store.api))
  const getClearProps = () => toReactProps(core.getClearProps(store.api))
  const getSubmitProps = () => toReactProps(core.getSubmitProps(store.api))

  return {
    // ids
    ids: store.api.ids, optionId: store.api.optionId,
    // state
    query, isOpen, stage, activeIndex, groups, indexedGroups, flatOptions, status, loading,
    listboxLabel, placeholder, appliedSummary, announcement, canApply,
    draftDef, draftOperator, draftValues, draftSpoken, isMultiSelect, isChosen,
    editingId, editPart,
    // actions
    open: actions.open,
    close: actions.close,
    focusInput: actions.focusInput,
    openAndFocus: actions.openAndFocus,
    submit: actions.submit,
    move: actions.move,
    jump: actions.jump,
    selectOption: actions.selectOption,
    applyDraft: actions.applyDraft,
    confirmDraft: actions.confirmDraft,
    stepBack: actions.stepBack,
    // Same mapping as the Vue adapter: the public `cancelDraft` is the
    // focus-restoring one, aliased from `discardDraft`.
    cancelDraft: actions.discardDraft,
    escape: actions.escape,
    handleBackspace: actions.handleBackspace,
    carryValues: actions.carryValues,
    startEdit: actions.startEdit,
    startEditPart: actions.startEditPart,
    removeToken: actions.removeToken,
    clearAll: actions.clearAll,
    commitPendingText: actions.commitPendingText,
    resetDraft: actions.resetDraft,
    scrollActiveIntoView: actions.scrollActiveIntoView,
    // helpers
    spokenToken, valueLabel, operatorWords, operatorSymbol, operatorText, defOf,
    tokenLabel, tokenValues, isEditing, isNegated, hasOperatorChoice, chipOperator, chipValues, partName,
    // prop getters
    getRootProps, getLabelProps, getInputProps, getFieldsetProps,
    getTokenListProps, getTokenProps, getPendingProps, getOperatorProps, getValueProps, getRemoveProps,
    getListboxProps, getGroupProps, getOptionProps, getStatusRowProps,
    getHintProps, getAppliedProps, getLiveRegionProps,
    getApplyProps, getDiscardProps, getClearProps, getSubmitProps
  }
}
