// The Vue adapter: a thin composable over the framework-agnostic store that
// keeps today's return shape (names, and which members are refs) so
// `FilteredSearch.vue` and `HeadlessSearch.vue` only change their import.
import { computed, nextTick, onScopeDispose, ref, shallowRef, unref, watch } from 'vue'
import type { Ref } from 'vue'
import * as core from '../core/index.ts'
import type { FilterDef, Option, Token } from '../core/index.ts'
import { normalizeProps } from './normalize.ts'

export interface UseFilteredSearchOptions {
  /** v-model array of tokens. */
  tokens?: Ref<Token[]>
  filters: FilterDef[] | Ref<FilterDef[]>
  label?: string | Ref<string>
  resultCount?: number | null | Ref<number | null>
  friendlyOperators?: boolean | Ref<boolean>
  onSubmit?: (tokens: Token[]) => void
  onAnnounce?: (text: string) => void
  recentLimit?: number
}

export function useFilteredSearch (options: UseFilteredSearchOptions) {
  const {
    tokens,
    filters,
    label = 'Search or filter results',
    resultCount = null,
    friendlyOperators = false,
    onSubmit,
    onAnnounce,
    recentLimit = 3
  } = options

  const store = core.createFilteredSearch({
    filters: unref(filters),
    tokens: tokens ? unref(tokens) : [],
    label: unref(label),
    resultCount: unref(resultCount),
    friendlyOperators: unref(friendlyOperators),
    recentLimit,
    onSubmit,
    onAnnounce,
    onTokensChange: (next) => { if (tokens && tokens.value !== next) tokens.value = next }
  })

  const snapshot = shallowRef(store.getState())
  onScopeDispose(store.subscribe(() => { snapshot.value = store.getState() }))

  // `Ref | value` for these four keeps today's parameters working: the Vue
  // idiom of watching into `setOptions` is what the core doesn't need to know.
  watch(() => unref(filters), (value) => { store.setOptions({ filters: value }) })
  watch(() => unref(label), (value) => { store.setOptions({ label: value }) })
  watch(() => unref(resultCount), (value) => { store.setOptions({ resultCount: value }) })
  watch(() => unref(friendlyOperators), (value) => { store.setOptions({ friendlyOperators: value }) })

  // Tokens are owned by the core; this is the one-way half of ADR-0005 §3 —
  // `onTokensChange` above is the other. A no-op when the array is the same
  // reference is what stops the two watches from looping on each other.
  if (tokens) watch(tokens, (value) => { store.actions.setTokens(value) })

  const rootRef = ref<HTMLElement | null>(null)
  const inputRef = ref<HTMLElement | null>(null)
  const listRef = ref<HTMLElement | null>(null)

  let disconnect: (() => void) | null = null
  watch(rootRef, (el) => {
    disconnect?.()
    disconnect = el ? store.connect(el, (fn) => { nextTick(fn) }) : null
  }, { immediate: true })
  onScopeDispose(() => disconnect?.())

  const opts = () => store.getOptions()

  /* ---- state, kept as refs/computeds over the one immutable snapshot ---- */
  const query = computed<string>({
    get: () => snapshot.value.query,
    set: (value) => { store.actions.setQuery(value) }
  })
  const isOpen = computed(() => snapshot.value.isOpen)
  const stage = computed(() => snapshot.value.stage)
  const activeIndex = computed(() => snapshot.value.activeIndex)
  const loading = computed(() => snapshot.value.loading)
  const editingId = computed(() => snapshot.value.editingId)
  const editPart = computed(() => snapshot.value.editPart)
  const draftOperator = computed(() => snapshot.value.draftOperator)
  const draftValues = computed(() => snapshot.value.draftValues)
  const announcement = computed(() => snapshot.value.announcement)

  const draftDef = computed(() => core.defOf(opts(), snapshot.value.draftKey))
  const groups = computed(() => core.groups(snapshot.value, opts()))
  const indexedGroups = computed(() => core.indexedGroups(snapshot.value, opts()))
  const flatOptions = computed(() => core.flatOptions(snapshot.value, opts()))
  const status = computed(() => core.status(snapshot.value, opts()))
  const listboxLabel = computed(() => core.listboxLabel(snapshot.value, opts()))
  const placeholder = computed(() => core.placeholder(snapshot.value, opts()))
  const appliedSummary = computed(() => core.appliedSummary(snapshot.value, opts()))
  const canApply = computed(() => core.canApply(snapshot.value, opts()))
  const draftSpoken = computed(() => core.draftSpoken(snapshot.value, opts()))
  const isMultiSelect = computed(() => core.isMultiSelect(snapshot.value, opts()))

  const isChosen = (option: Option) => core.isChosen(snapshot.value, opts(), option)

  /* ---- actions: plain functions, no `this` — safe to hand out detached ---- */
  const { actions } = store

  /* ---- display helpers a chip needs, whatever it looks like --- */
  const defOf = (key: string | null) => core.defOf(opts(), key)
  const valueLabel = (key: string | null, value: string) => core.valueLabel(snapshot.value, opts(), key, value)
  const operatorWords = (key: string | null, operator: string | null) => core.operatorWords(opts(), key, operator)
  const operatorSymbol = (key: string | null, operator: string | null) => core.operatorSymbol(opts(), key, operator)
  const operatorText = (key: string | null, operator: string | null) => core.operatorText(snapshot.value, opts(), key, operator)
  const spokenToken = (token: Token) => core.spokenToken(snapshot.value, opts(), token)
  const tokenLabel = (token: Token) => core.tokenLabel(opts(), token)
  const tokenValues = (token: Token) => core.tokenValues(snapshot.value, opts(), token)
  const isEditing = (token: Token) => core.isEditing(snapshot.value, token)
  const isNegated = (token: Token) => core.isNegated(snapshot.value, opts(), token)
  const hasOperatorChoice = (token: Token) => core.hasOperatorChoice(opts(), token)
  const chipOperator = (token: Token) => core.chipOperator(snapshot.value, opts(), token)
  const chipValues = (token: Token) => core.chipValues(snapshot.value, opts(), token)
  const partName = (token: Token, part: 'operator' | 'value') => core.partName(snapshot.value, opts(), token, part)

  /* ---- prop getters: bound to the current snapshot, normalised for Vue ----
   * Every one of these goes through `toVueProps`, whether or not it happens
   * to carry a handler today — one rule, not a per-getter judgment call. */
  const toVueProps = (props: Record<string, unknown>, extra?: Record<string, unknown>) => ({
    ...normalizeProps(props),
    ...extra
  })
  const getRootProps = () => toVueProps(core.getRootProps(snapshot.value, store.api), { ref: rootRef })
  const getLabelProps = () => toVueProps(core.getLabelProps(store.api))
  const getInputProps = () => toVueProps(core.getInputProps(snapshot.value, store.api), { ref: inputRef })
  const getFieldsetProps = () => toVueProps(core.getFieldsetProps(store.api))
  const getTokenListProps = () => toVueProps(core.getTokenListProps())
  const getTokenProps = (token: Token) => toVueProps(core.getTokenProps(snapshot.value, store.api, token))
  const getPendingProps = () => toVueProps(core.getPendingProps(snapshot.value, store.api))
  const getOperatorProps = (token: Token) => toVueProps(core.getOperatorProps(snapshot.value, store.api, token))
  const getValueProps = (token: Token) => toVueProps(core.getValueProps(snapshot.value, store.api, token))
  const getRemoveProps = (token: Token) => toVueProps(core.getRemoveProps(snapshot.value, store.api, token))
  const getListboxProps = () => toVueProps(core.getListboxProps(snapshot.value, store.api), { ref: listRef })
  const getGroupProps = (group: core.OptionGroup) => toVueProps(core.getGroupProps(group))
  const getOptionProps = (option: core.IndexedOption) => toVueProps(core.getOptionProps(snapshot.value, store.api, option))
  const getStatusRowProps = () => toVueProps(core.getStatusRowProps(snapshot.value, store.api))
  const getHintProps = () => toVueProps(core.getHintProps(store.api))
  const getAppliedProps = () => toVueProps(core.getAppliedProps(store.api))
  const getLiveRegionProps = () => toVueProps(core.getLiveRegionProps())
  const getApplyProps = () => toVueProps(core.getApplyProps(snapshot.value, store.api))
  const getDiscardProps = () => toVueProps(core.getDiscardProps(snapshot.value, store.api))
  const getClearProps = () => toVueProps(core.getClearProps(store.api))
  const getSubmitProps = () => toVueProps(core.getSubmitProps(store.api))

  return {
    // ids
    ids: store.api.ids, optionId: store.api.optionId,
    // element refs, if you want them directly
    rootRef, inputRef, listRef,
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
    // The composable's public `cancelDraft` was always the focus-restoring
    // one (today's source literally aliases `cancelDraft: discardDraft`);
    // keeping that mapping is what "same public API" means here.
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
