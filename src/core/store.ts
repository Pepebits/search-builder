// The store: one immutable state object, a synchronous `commit` that runs
// the post-transition rules of ADR-0005 §2, and the actions every adapter
// binds to its framework. This is the only file that ties state.ts,
// derive.ts, announce.ts and connect.ts together.
import type { Effect } from './state.ts'
import * as transitions from './state.ts'
import { flatOptions, status } from './derive.ts'
import { createAnnouncer } from './announce.ts'
import type { AnnounceSchedule } from './announce.ts'
import { createDomController } from './connect.ts'
import type { PropApi } from './props.ts'
import type { SearchBuilderOptions, SearchBuilderState, SearchBuilderStore, Option, Token } from './types.ts'

let instanceCounter = 0

function sameIds (a: Option[], b: Option[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i].id !== b[i].id) return false
  return true
}

export interface CreateSearchBuilderConfig {
  /**
   * How `announce` schedules its delayed write. Defaults to the next
   * animation frame, or a microtask when `requestAnimationFrame` is
   * missing. Adapters normally leave this alone (the Vue adapter passes
   * nothing); tests can pass a synchronous scheduler to avoid awaiting a
   * tick after every assertion.
   */
  announceSchedule?: AnnounceSchedule
}

export function createSearchBuilder (raw: SearchBuilderOptions, config: CreateSearchBuilderConfig = {}): SearchBuilderStore {
  // Reassigned, never mutated in place (see `setOptions`) — so a reference
  // captured before a `setOptions` call (see `committedOptions` below) keeps
  // describing the world as it was, instead of silently changing under it.
  let options: SearchBuilderOptions = {
    ...raw,
    label: raw.label ?? 'Search or filter results',
    resultCount: raw.resultCount ?? null,
    friendlyOperators: raw.friendlyOperators ?? false,
    recentLimit: raw.recentLimit ?? 3
  }
  // The options `state` was last committed under — see `commit`.
  let committedOptions = options

  const scope = options.id ?? `fs-${++instanceCounter}`
  const ids = {
    input: `${scope}-input`,
    listbox: `${scope}-listbox`,
    hint: `${scope}-hint`,
    applied: `${scope}-applied`
  }
  const optionId = (index: number): string => `${scope}-opt-${index}`

  let state: SearchBuilderState = transitions.initialState(options)
  const listeners = new Set<() => void>()
  let fetchSeq = 0

  const notify = (): void => { for (const listener of listeners) listener() }

  // Bypasses `commit`'s post-transition rules on purpose — see announce.ts.
  const setAnnouncement = (text: string): void => {
    state = { ...state, announcement: text }
    notify()
  }
  const announce = createAnnouncer(setAnnouncement, () => options, config.announceSchedule)

  const dom = createDomController({
    // Read lazily: `actions` is defined further down, after `dom`.
    confirmDraft: () => actions.confirmDraft(),
    close: () => actions.close()
  })

  interface FetchPlan { state: SearchBuilderState, announceLoading: boolean, run: (() => void) | null }

  /** The synchronous half of post-transition rule 4; the async half runs after commit stores `next`. */
  function planValueFetch (previous: SearchBuilderState, next: SearchBuilderState, nextOptions: SearchBuilderOptions): FetchPlan {
    const changed = previous.stage !== next.stage || previous.draftKey !== next.draftKey || previous.query !== next.query
    if (!changed) return { state: next, announceLoading: false, run: null }
    const def = next.draftKey ? nextOptions.filters.find((f) => f.key === next.draftKey) ?? null : null
    if (next.stage !== 'value' || !def?.fetchValues) {
      return { state: next.loading ? { ...next, loading: false } : next, announceLoading: false, run: null }
    }
    const seq = ++fetchSeq
    const withLoading = { ...next, loading: true }
    const query = withLoading.query.trim()
    const fetchValues = def.fetchValues
    return {
      state: withLoading,
      announceLoading: true,
      run: () => {
        fetchValues(query).then((values) => {
          if (seq !== fetchSeq) return
          commit({ ...state, fetched: values, loading: false })
        })
      }
    }
  }

  function commit (rawNext: SearchBuilderState): void {
    const previous = state
    // `previous` was committed under `previousOptions`; `next` is judged
    // under whatever `options` is *now* — the two only differ mid-way
    // through the one commit that follows a `setOptions` call (e.g. a
    // `filters` swap), which is exactly the case rule 2 has to catch: the
    // option list can change out from under `previous` even though no
    // state field did.
    const previousOptions = committedOptions
    const nextOptions = options
    let next = rawNext

    // 1. Typing reopens a list the user has closed; refocusing on its own does not.
    if (next.query !== previous.query && next.query !== '') next = { ...next, isOpen: true }

    // 2. A fresh option list always starts highlighted at the top.
    if (!sameIds(flatOptions(previous, previousOptions), flatOptions(next, nextOptions))) {
      next = { ...next, activeIndex: 0 }
    }

    // 3. No-matches is announced on entry — read `loading` as the action left
    // it, before rule 4 (next) has a chance to change it.
    const prevStatus = status(previous, previousOptions)
    const nextStatus = status(next, nextOptions)
    const announceNoMatches = nextStatus?.kind === 'no-matches' && prevStatus?.kind !== 'no-matches'

    // 4. Value fetch.
    const plan = planValueFetch(previous, next, nextOptions)
    next = plan.state

    const tokensChanged = next.tokens !== previous.tokens

    state = next
    committedOptions = nextOptions
    notify()

    if (tokensChanged) nextOptions.onTokensChange?.(state.tokens)
    if (announceNoMatches) announce('No matches found.', { count: false })
    if (plan.announceLoading) announce('Loading suggestions.', { count: false })
    plan.run?.()

    // 5. Active option scrolls into view, once the adapter has re-rendered.
    if (previous.activeIndex !== state.activeIndex) dom.scrollActiveIntoView()
  }

  function applyEffects (effects: Effect[]): void {
    for (const effect of effects) {
      if (effect.type === 'announce') announce(effect.message, effect.opts)
      else if (effect.type === 'focusInput') dom.focusInput()
      else if (effect.type === 'restoreEditFocus') dom.restoreEditFocus(effect.id, effect.part)
      else if (effect.type === 'submit') options.onSubmit?.(effect.tokens)
    }
  }

  function run<T extends { state: SearchBuilderState, effects: Effect[] }> (transition: T): T {
    commit(transition.state)
    applyEffects(transition.effects)
    return transition
  }

  // One action list: the store's public actions and the ones `props.ts`'s
  // getters use internally (e.g. the listbox mouseover) are the same object.
  const actions: SearchBuilderStore['actions'] = {
    selectOption: (index) => { run(transitions.selectOption(state, options, index)) },
    applyDraft: () => { run(transitions.applyDraft(state, options)) },
    confirmDraft: () => run(transitions.confirmDraft(state, options)).ok,
    stepBack: () => run(transitions.stepBack(state, options)).ok,
    cancelDraft: () => { run(transitions.cancelDraft(state, options)) },
    startEdit: (id, part = 'operator') => run(transitions.startEdit(state, options, id, part)).ok,
    startEditPart: (id, part) => { run(transitions.startEditPart(state, options, id, part)) },
    commitToken: (value) => { run(transitions.commitToken(state, options, value)) },
    handleBackspace: (event) => { run(transitions.handleBackspace(state, options, event)) },
    removeToken: (id) => { run(transitions.removeToken(state, options, id)) },
    commitPendingText: () => run(transitions.commitPendingText(state)).ok,
    clearAll: () => { run(transitions.clearAll(state)) },
    submit: () => { run(transitions.submit(state)) },
    move: (delta) => { run(transitions.move(state, options, delta)) },
    jump: (edge) => { run(transitions.jump(state, options, edge)) },
    escape: () => { run(transitions.escape(state, options)) },
    discardDraft: () => { run(transitions.discardDraft(state, options)) },
    open: () => { run(transitions.open(state)) },
    close: () => { run(transitions.close(state)) },
    setQuery: (text) => { run(transitions.setQuery(state, text)) },
    setTokens: (tokens: Token[]) => { run(transitions.setTokens(state, tokens)) },
    carryValues: transitions.carryValues,
    focusInput: () => { dom.focusInput() },
    openAndFocus: () => { actions.open(); actions.focusInput() },
    resetDraft: () => { commit(transitions.resetDraft(state)) },
    scrollActiveIntoView: () => { dom.scrollActiveIntoView() },
    setActiveIndex: (index) => { run(transitions.setActiveIndex(state, index)) }
  }

  const api: PropApi = {
    get options () { return options },
    ids,
    optionId,
    getState: () => state,
    actions
  }

  return {
    getState: () => state,
    getOptions: () => options,
    subscribe (listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setOptions (partial) {
      // A new object, not a mutation: `commit` below still has `previous`'s
      // `committedOptions` to compare against (see Finding 1 in review round 1).
      options = { ...options, ...partial }
      // Forces a fresh state reference so memoised selectors re-derive even
      // though no state field actually changed.
      commit({ ...state })
    },
    connect: (root, schedule) => dom.connect(root, schedule),
    api,
    actions
  }
}
