// Prop getters: pure functions of (state, api) that hand back plain objects
// in one dialect (ADR-0005 §5) — HTML attribute names, React-cased handlers,
// no `ref`, no `class`, no `style`. Each adapter normalises the dialect to
// its own framework; `event.currentTarget` (never a stored ref) is how
// `getRootProps`'s focusout handler finds "its own" root element, which is
// what keeps this file framework-agnostic.
import type { SearchBuilderOptions, SearchBuilderState, IndexedOption, Option, OptionGroup, Token } from './types.ts'
import {
  draftSpoken, flatOptions, isChosen, isMultiSelect, isNegated, listboxLabel,
  operatorFor, partName, placeholder, spokenToken, status
} from './derive.ts'

export interface PropApi {
  options: SearchBuilderOptions
  ids: { input: string, listbox: string, hint: string, applied: string }
  optionId (index: number): string
  /**
   * The live state, read at the moment a handler fires — not the snapshot a
   * getter was built from. A render can be stale by the time a user acts on
   * it (a fast keystroke queued behind an async re-render, a handler kept
   * past its snapshot's lifetime); `state` above is for building props to
   * *display*, `getState()` is for handlers that decide what to *do*.
   */
  getState (): SearchBuilderState
  actions: {
    setQuery (text: string): void
    open (): void
    close (): void
    confirmDraft (): boolean
    move (delta: number): void
    jump (edge: 'start' | 'end'): void
    escape (): void
    handleBackspace (event: { preventDefault (): void }): void
    selectOption (index?: number): void
    setActiveIndex (index: number): void
    startEditPart (id: string, part: 'operator' | 'value'): void
    removeToken (id: string): void
    focusInput (): void
    openAndFocus (): void
    applyDraft (): void
    discardDraft (): void
    clearAll (): void
    submit (): void
  }
}

type Props = Record<string, unknown>

/**
 * Reads `api.getState()` at the moment each key fires, not the `state` the
 * getter closed over: a key can land after the state has already moved on
 * (an async re-render, a handler that outlives the snapshot it was built
 * with), and the original composable's plain refs always read current.
 */
const onKeydown = (api: PropApi) => (event: KeyboardEvent): void => {
  switch (event.key) {
    case 'ArrowDown': event.preventDefault(); api.actions.move(1); break
    case 'ArrowUp': event.preventDefault(); api.actions.move(-1); break
    case 'Home': event.preventDefault(); api.actions.jump('start'); break
    case 'End': event.preventDefault(); api.actions.jump('end'); break
    case 'Escape': event.preventDefault(); api.actions.escape(); break
    case 'Tab': api.actions.confirmDraft(); api.actions.close(); break
    case 'ArrowRight':
      // Only on an empty field: with text in it the caret is what moves.
      if (api.getState().query === '' && api.actions.confirmDraft()) event.preventDefault()
      break
    case 'Backspace': api.actions.handleBackspace(event); break
    case 'Enter': {
      event.preventDefault()
      const live = api.getState()
      if (live.isOpen && flatOptions(live, api.options).length) api.actions.selectOption()
      else if (isMultiSelect(live, api.options) && live.draftValues.length) api.actions.applyDraft()
      else api.actions.submit()
      break
    }
  }
}

export const getRootProps = (state: SearchBuilderState, api: PropApi): Props => ({
  'data-fs': 'root',
  'data-stage': state.stage,
  'data-open': state.isOpen ? 'true' : 'false',
  role: 'search',
  'aria-label': api.options.label,
  // Focus leaving the search area confirms a multi-value draft, then closes.
  // `currentTarget` is the element this got spread onto — the root — so no
  // stored ref is needed to tell "still inside" from "left".
  onFocusOut: (event: FocusEvent) => {
    const root = event.currentTarget as HTMLElement | null
    if (root?.contains(event.relatedTarget as Node | null)) return
    api.actions.confirmDraft()
    api.actions.close()
  }
})

export const getLabelProps = (api: PropApi): Props => ({ 'data-fs': 'label', for: api.ids.input })

export const getInputProps = (state: SearchBuilderState, api: PropApi): Props => ({
  'data-fs': 'input',
  id: api.ids.input,
  type: 'text',
  autocomplete: 'off',
  spellcheck: 'false',
  role: 'combobox',
  'aria-autocomplete': 'list',
  'aria-expanded': state.isOpen ? 'true' : 'false',
  'aria-controls': api.ids.listbox,
  'aria-describedby': `${api.ids.hint} ${api.ids.applied}`,
  'aria-activedescendant':
    state.isOpen && flatOptions(state, api.options).length ? api.optionId(state.activeIndex) : null,
  placeholder: placeholder(state, api.options),
  value: state.query,
  onInput: (event: Event) => { api.actions.setQuery((event.target as HTMLInputElement).value) },
  // Opening on click and on keys, never on focus: refocusing the input after
  // Search or after removing a chip must not reopen the list.
  onClick: () => { api.actions.open() },
  onKeyDown: onKeydown(api)
})

/** For the element wrapping the chips. `display: contents` drops list roles. */
export const getTokenListProps = (): Props => ({ 'data-fs': 'tokens', role: 'list' })

export const getTokenProps = (state: SearchBuilderState, api: PropApi, token: Token): Props => ({
  'data-fs': 'token',
  'data-type': token.type === 'text' ? 'text' : 'filter',
  // The two states a chip can be in, so CSS never needs to be told twice.
  'data-editing': state.editingId === token.id ? 'true' : null,
  'data-negated': isNegated(state, api.options, token) ? 'true' : null,
  role: 'listitem'
})

/** The chip being built, which has no token to hang state off yet. */
export const getPendingProps = (state: SearchBuilderState, api: PropApi): Props => ({
  'data-fs': 'token',
  'data-pending': 'true',
  'data-negated': operatorFor(api.options, state.draftKey, state.draftOperator)?.negated ? 'true' : null
})

export const getOperatorProps = (state: SearchBuilderState, api: PropApi, token: Token): Props => ({
  'data-fs': 'operator',
  type: 'button',
  'data-token': token.id,
  'data-edit': 'operator',
  'aria-label': partName(state, api.options, token, 'operator'),
  onClick: () => { api.actions.startEditPart(token.id, 'operator') }
})

export const getValueProps = (state: SearchBuilderState, api: PropApi, token: Token): Props => ({
  'data-fs': 'value',
  type: 'button',
  'data-token': token.id,
  'data-edit': 'value',
  'aria-label': partName(state, api.options, token, 'value'),
  onClick: () => { api.actions.startEditPart(token.id, 'value') }
})

export const getRemoveProps = (state: SearchBuilderState, api: PropApi, token: Token): Props => ({
  'data-fs': 'remove',
  type: 'button',
  'aria-label': `Remove filter: ${spokenToken(state, api.options, token)}`,
  onClick: () => { api.actions.removeToken(token.id); api.actions.focusInput() }
})

export const getListboxProps = (state: SearchBuilderState, api: PropApi): Props => ({
  'data-fs': 'listbox',
  'data-stage': state.stage,
  id: api.ids.listbox,
  role: 'listbox',
  // Never removed from the DOM: aria-controls has to resolve while closed.
  hidden: !state.isOpen,
  'aria-label': listboxLabel(state, api.options),
  'aria-multiselectable': isMultiSelect(state, api.options) ? 'true' : null,
  'aria-busy': state.loading ? 'true' : 'false'
})

export const getGroupProps = (group: OptionGroup): Props => ({ 'data-fs': 'group', role: 'group', 'aria-label': group.label })

export const getOptionProps = (state: SearchBuilderState, api: PropApi, option: IndexedOption): Props => ({
  'data-fs': 'option',
  'data-kind': option.kind,
  id: api.optionId(option.index),
  role: 'option',
  'data-active': option.index === state.activeIndex ? 'true' : 'false',
  'aria-selected': isMultiSelect(state, api.options)
    ? (isChosen(state, api.options, option as Option) ? 'true' : 'false')
    : (option.index === state.activeIndex ? 'true' : 'false'),
  onMouseMove: () => { api.actions.setActiveIndex(option.index) },
  onMouseDown: (event: Event) => {
    // Keeps focus in the input, which is where the combobox pattern needs it.
    event.preventDefault()
    api.actions.selectOption(option.index)
    api.actions.open()
    api.actions.focusInput()
  }
})

/** Loading and empty rows sit outside the option set on purpose. */
export const getStatusRowProps = (state: SearchBuilderState, api: PropApi): Props => ({
  'data-fs': 'status',
  'data-kind': status(state, api.options)?.kind ?? null,
  role: 'presentation'
})

export const getHintProps = (api: PropApi): Props => ({ 'data-fs': 'hint', id: api.ids.hint })
export const getAppliedProps = (api: PropApi): Props => ({ 'data-fs': 'applied', id: api.ids.applied })
export const getLiveRegionProps = (): Props => ({ 'data-fs': 'live', role: 'status', 'aria-live': 'polite' })

export const getApplyProps = (state: SearchBuilderState, api: PropApi): Props => ({
  'data-fs': 'apply',
  type: 'button',
  'aria-label': `Apply filter: ${draftSpoken(state, api.options)}`,
  onClick: () => { api.actions.applyDraft(); api.actions.focusInput() }
})

export const getDiscardProps = (state: SearchBuilderState, api: PropApi): Props => ({
  'data-fs': 'discard',
  type: 'button',
  'aria-label': `Discard the filter being added: ${draftSpoken(state, api.options)}`,
  onClick: () => { api.actions.discardDraft() }
})

export const getClearProps = (api: PropApi): Props => ({
  'data-fs': 'clear',
  type: 'button',
  onClick: () => { api.actions.clearAll(); api.actions.openAndFocus() }
})

export const getSubmitProps = (api: PropApi): Props => ({ 'data-fs': 'submit', type: 'button', onClick: () => { api.actions.submit() } })

/** For the bar itself, so clicking its padding focuses the field. */
export const getFieldsetProps = (api: PropApi): Props => ({
  'data-fs': 'bar',
  onMouseDown: (event: Event) => {
    if (event.target !== event.currentTarget) return
    event.preventDefault()
    api.actions.openAndFocus()
  }
})
