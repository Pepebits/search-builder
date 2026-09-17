<script setup>
/**
 * The same search bar with none of the design.
 *
 * Different tags, different structure, no stylesheet of its own: a `<section>`
 * instead of a `<div>`, an `<ol>` for the chips, `<div>`s for the options.
 * Every ARIA attribute, every key, the live region and the outside-click
 * behaviour come from the composable's prop getters, so this file is 60 lines
 * of markup and still passes the same accessibility tests as the styled one.
 *
 * headless.html dresses it with ~50 lines of CSS written for that page alone
 * (src/headless-starter.css); tests/headless.mjs runs it with no CSS at all.
 */
import { computed } from 'vue'
import { useSearchBuilder } from '../vue/index.ts'

const props = defineProps({
  filters: { type: Array, required: true },
  label: { type: String, default: 'Search' },
  resultCount: { type: Number, default: null }
})

const tokens = defineModel({ type: Array, default: () => [] })

const s = useSearchBuilder({
  tokens,
  filters: computed(() => props.filters),
  label: computed(() => props.label),
  resultCount: computed(() => props.resultCount)
})
</script>

<template>
  <section v-bind="s.getRootProps()">
    <label v-bind="s.getLabelProps()">{{ label }}</label>

    <div v-bind="s.getFieldsetProps()">
      <ol v-bind="s.getTokenListProps()">
        <li v-for="token in tokens" v-bind="s.getTokenProps(token)" :key="token.id">
          <template v-if="token.type !== 'text'">
            <span>{{ s.tokenLabel(token) }}</span>
            <button v-if="s.hasOperatorChoice(token)" v-bind="s.getOperatorProps(token)">
              {{ s.chipOperator(token) }}
            </button>
            <span v-else data-fs="operator">{{ s.chipOperator(token) }}</span>
            <button v-bind="s.getValueProps(token)">{{ s.chipValues(token) }}</button>
          </template>
          <span v-else>{{ token.value }}</span>
          <button v-bind="s.getRemoveProps(token)">x</button>
        </li>
      </ol>

      <input v-bind="s.getInputProps()">

      <button v-if="s.canApply.value" v-bind="s.getApplyProps()">Apply</button>
      <button v-bind="s.getSubmitProps()">Search</button>
    </div>

    <div v-bind="s.getListboxProps()">
      <div v-for="group in s.indexedGroups.value" v-bind="s.getGroupProps(group)" :key="group.id">
        <b aria-hidden="true">{{ group.label }}</b>
        <!-- Block elements: one option per line even before any CSS arrives. -->
        <div v-for="option in group.options" v-bind="s.getOptionProps(option)" :key="option.id">
          {{ option.label }}
        </div>
      </div>
      <p v-if="s.status.value" v-bind="s.getStatusRowProps()">{{ s.status.value.text }}</p>
    </div>

    <p v-bind="s.getHintProps()">Arrow keys browse, Enter selects, Escape steps back.</p>
    <p v-bind="s.getAppliedProps()">{{ s.appliedSummary.value }}</p>
    <p v-bind="s.getLiveRegionProps()">{{ s.announcement.value }}</p>
  </section>
</template>
