// Public entry point: the store factory, every derived-data and prop-getter
// function, `toneHue`, `nextTokenId`, and the types. Nothing here imports a
// UI framework or the apiable URL library — see ADR-0001 and ADR-0003.
export { createSearchBuilder } from './store.ts'
export type { CreateSearchBuilderConfig } from './store.ts'
export { nextTokenId } from './state.ts'
export { toneHue, TONE_HUES } from './tone.ts'

export {
  defOf, operatorFor, operatorWords, operatorSymbol, isMultiSelect, valuePool, valueLabel,
  spokenToken, draftSpoken, usedKeys, groups, flatOptions, indexedGroups, listboxLabel,
  placeholder, status, canApply, isChosen, appliedSummary, tokenLabel, tokenValues, isEditing,
  hasOperatorChoice, operatorText, chipOperator, chipValues, isNegated, partName, matchSegments
} from './derive.ts'

export {
  getRootProps, getLabelProps, getInputProps, getFieldsetProps, getTokenListProps, getTokenProps,
  getPendingProps, getOperatorProps, getValueProps, getRemoveProps, getListboxProps, getGroupProps,
  getOptionProps, getStatusRowProps, getHintProps, getAppliedProps, getLiveRegionProps,
  getApplyProps, getDiscardProps, getClearProps, getSubmitProps
} from './props.ts'
export type { PropApi } from './props.ts'

export type {
  Value, Operator, FilterDef, TextToken, FilterToken, Token, Stage, Option, OptionGroup,
  IndexedOption, IndexedGroup, Status, SearchBuilderState, SearchBuilderOptions,
  SearchBuilderStore
} from './types.ts'
