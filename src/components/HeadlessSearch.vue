<script setup>
/**
 * The same search bar with none of the design.
 *
 * Different tags, different structure, no stylesheet: a `<section>` instead of
 * a `<div>`, an `<ol>` for the chips, `<span>`s for the options. Every ARIA
 * attribute, every key, the live region and the outside-click behaviour come
 * from the composable's prop getters, so this file is 60 lines of markup and
 * still passes the same accessibility tests as the styled one.
 */
import { computed } from 'vue'
import { useFilteredSearch } from '../vue/index.ts'

const props = defineProps({
  filters: { type: Array, required: true },
  label: { type: String, default: 'Search' },
  resultCount: { type: Number, default: null }
})

const tokens = defineModel({ type: Array, default: () => [] })

const s = useFilteredSearch({
  tokens,
  filters: computed(() => props.filters),
  label: computed(() => props.label),
  resultCount: computed(() => props.resultCount)
})
</script>

<template>
  <section v-bind="s.getRootProps()">
    <label v-bind="s.getLabelProps()">{{ label }}</label>

    <ol v-bind="s.getTokenListProps()">
      <li v-for="token in tokens" v-bind="s.getTokenProps(token)" :key="token.id">
        <template v-if="token.type !== 'text'">
          {{ s.tokenLabel(token) }}
          <button v-if="s.hasOperatorChoice(token)" v-bind="s.getOperatorProps(token)">
            {{ s.chipOperator(token) }}
          </button>
          <span v-else>{{ s.chipOperator(token) }}</span>
          <button v-bind="s.getValueProps(token)">{{ s.chipValues(token) }}</button>
        </template>
        <span v-else>{{ token.value }}</span>
        <button v-bind="s.getRemoveProps(token)">x</button>
      </li>
    </ol>

    <input v-bind="s.getInputProps()">

    <button v-if="s.canApply.value" v-bind="s.getApplyProps()">Apply</button>
    <button v-bind="s.getSubmitProps()">Search</button>

    <div v-bind="s.getListboxProps()">
      <div v-for="group in s.indexedGroups.value" v-bind="s.getGroupProps(group)" :key="group.id">
        <b aria-hidden="true">{{ group.label }}</b>
        <span v-for="option in group.options" v-bind="s.getOptionProps(option)" :key="option.id">
          {{ option.label }}
        </span>
      </div>
      <p v-if="s.status.value" v-bind="s.getStatusRowProps()">{{ s.status.value.text }}</p>
    </div>

    <p v-bind="s.getHintProps()">Arrow keys browse, Enter selects, Escape steps back.</p>
    <p v-bind="s.getAppliedProps()">{{ s.appliedSummary.value }}</p>
    <p v-bind="s.getLiveRegionProps()">{{ s.announcement.value }}</p>
  </section>
</template>
