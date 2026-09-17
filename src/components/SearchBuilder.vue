<script setup>
/**
 * The styled bar, in Tailwind.
 *
 * Every behaviour and every ARIA attribute comes from `useSearchBuilder`
 * through its prop getters; this file contributes tags and utilities. The
 * state variants below — `state-active:`, `state-editing:`, `in-negated:` —
 * read the same `data-*` attributes the getters set for the accessibility
 * tree, so nothing is duplicated to make styling work.
 *
 * Not using Tailwind? Drop these classes and import
 * `../styles/filtered-search.css` instead: it targets the same attributes.
 */
import { computed, toRef } from 'vue'
import { useSearchBuilder } from '../vue/index.ts'
import { toneHue } from '../core/index.ts'

const props = defineProps({
  /** Filter definitions — see src/data/filters.js */
  filters: { type: Array, required: true },
  /** Accessible name for the search landmark and the text input. */
  label: { type: String, default: 'Search or filter results' },
  /** Show the "Clear all" affordance once filters exist. */
  clearable: { type: Boolean, default: true },
  /** Render operators as words ("is any of") instead of symbols. */
  friendlyOperators: { type: Boolean, default: false },
  /** Optional. When given, announcements end with the new result count. */
  resultCount: { type: Number, default: null }
})

const emit = defineEmits(['submit', 'announce'])

/** Two-way array of { id, type, operator, value }. */
const tokens = defineModel({ type: Array, default: () => [] })

const search = useSearchBuilder({
  tokens,
  filters: computed(() => props.filters),
  label: toRef(props, 'label'),
  resultCount: toRef(props, 'resultCount'),
  friendlyOperators: toRef(props, 'friendlyOperators'),
  onSubmit: (value) => emit('submit', value),
  onAnnounce: (text) => emit('announce', text)
})

const {
  stage, indexedGroups, status, placeholder, appliedSummary, announcement, canApply,
  draftDef, draftOperator, draftValues, isMultiSelect, isChosen, editingId,
  focusInput, tokenLabel, hasOperatorChoice, chipOperator, chipValues, operatorText,
  getRootProps, getLabelProps, getInputProps, getFieldsetProps,
  getTokenListProps, getTokenProps, getPendingProps, getOperatorProps, getValueProps, getRemoveProps,
  getListboxProps, getGroupProps, getOptionProps, getStatusRowProps,
  getHintProps, getAppliedProps, getLiveRegionProps,
  getApplyProps, getDiscardProps, getClearProps, getSubmitProps
} = search

defineExpose({ focus: focusInput, search })

/* Repeated utility runs, named once so the template stays readable. */
const SR_ONLY = 'absolute -m-px h-px w-px overflow-hidden border-0 p-0 whitespace-nowrap [clip:rect(0,0,0,0)]'
/*
 * On each control rather than once on the container: a descendant rule and the
 * input's own `outline-none` land on the same specificity, and then sheet order
 * decides who wins. The input deliberately has none — the bar already draws a
 * focus ring around the whole field.
 */
const FOCUS_RING = 'focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
const CHIP =
  'flex max-w-full items-center overflow-hidden rounded border border-chip-line bg-chip text-[13px] ' +
  'state-editing:border-dashed state-editing:border-accent ' +
  'state-pending:border-dashed state-pending:bg-surface-3'
const CHIP_KEY =
  'flex items-center self-stretch border-r border-chip-line bg-chip-key px-2 py-[3px] font-semibold ' +
  'whitespace-nowrap text-chip-key-ink ' +
  'in-negated:border-chip-not-line ' +
  'in-editing:border-accent-line in-editing:bg-accent-soft in-editing:text-accent-ink ' +
  'in-pending:border-dashed in-pending:bg-transparent'
const CHIP_OP =
  'border-r border-chip-line px-1.5 py-[3px] font-mono text-xs whitespace-nowrap text-chip-op ' +
  'in-negated:border-chip-not-line in-negated:bg-chip-not in-negated:font-semibold in-negated:text-chip-not-ink ' +
  // Outranks the button's hover, so a negated operator keeps its tint under the pointer.
  '[[data-negated]_&:hover]:bg-chip-not ' +
  'in-editing:border-accent-line in-editing:text-accent-ink ' +
  'in-pending:border-dashed'
const CHIP_VALUE =
  'max-w-[24ch] overflow-hidden px-2 py-[3px] font-mono text-[12.5px] text-ellipsis ' +
  'whitespace-nowrap text-chip-ink in-editing:text-ink-3 in-pending:text-ink-3'
const CHIP_BUTTON =
  'flex min-w-0 items-center self-stretch border-0 bg-transparent font-[inherit] text-inherit ' +
  'hover:bg-chip-hover [&>span]:overflow-hidden [&>span]:text-ellipsis [&>span]:whitespace-nowrap ' +
  FOCUS_RING
const CHIP_REMOVE =
  'flex flex-none items-center self-stretch border-0 border-l border-chip-line bg-transparent ' +
  'px-[7px] py-[3px] text-sm leading-none text-chip-op hover:bg-chip-hover hover:text-chip-ink ' +
  'in-editing:border-accent-line in-pending:border-dashed ' +
  FOCUS_RING
const ACTION = 'rounded px-2.5 py-[5px] font-[inherit] text-[12.5px] ' + FOCUS_RING
/* Tinted initials. `--fs-tone-h` is set per person; the rest comes from the theme. */
const AVATAR =
  'grid h-[22px] w-[22px] flex-none place-items-center rounded-full font-mono text-[10px] font-semibold ' +
  'bg-[oklch(var(--fs-av-l)_var(--fs-av-c)_var(--fs-tone-h))] text-[oklch(var(--fs-av-ink-l)_var(--fs-av-ink-c)_var(--fs-tone-h))]'
</script>

<template>
  <div
    v-bind="getRootProps()"
    class="relative"
  >
    <label v-bind="getLabelProps()" :class="SR_ONLY">{{ label }}</label>

    <div class="relative">
      <div
        v-bind="getFieldsetProps()"
        class="flex cursor-text flex-wrap items-center gap-1.5 rounded-md border border-line-strong bg-surface-3 px-1.5 py-[5px] focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--fs-accent-soft)]"
      >
        <svg
          class="mr-0.5 ml-1 flex-none text-ink-3"
          width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"
          fill="none" stroke="currentColor" stroke-width="1.7"
        >
          <circle cx="7" cy="7" r="4.4" />
          <path d="M10.4 10.4 14 14" stroke-linecap="round" />
        </svg>

        <ul v-bind="getTokenListProps()" class="contents">
          <li v-for="token in tokens" v-bind="getTokenProps(token)" :key="token.id" :class="CHIP">
            <template v-if="token.type === 'text'">
              <span class="px-2 py-[3px] text-chip-ink">&ldquo;{{ token.value }}&rdquo;</span>
            </template>
            <!--
              The operator and the value are separate buttons: wanting a
              different operator is not wanting a different value.
            -->
            <template v-else>
              <span :class="CHIP_KEY">{{ tokenLabel(token) }}</span>
              <button
                v-if="hasOperatorChoice(token)"
                v-bind="getOperatorProps(token)"
                :class="[CHIP_BUTTON, CHIP_OP]"
              >
                <span aria-hidden="true">{{ chipOperator(token) }}</span>
              </button>
              <span v-else data-fs="operator" :class="CHIP_OP" aria-hidden="true">
                {{ chipOperator(token) }}
              </span>
              <button v-bind="getValueProps(token)" :class="[CHIP_BUTTON, CHIP_VALUE]">
                <span aria-hidden="true">{{ chipValues(token) }}</span>
              </button>
            </template>
            <button v-bind="getRemoveProps(token)" :class="CHIP_REMOVE">&times;</button>
          </li>
        </ul>

        <!-- Only for a new filter: an edit shows its progress in the chip itself. -->
        <div v-if="stage !== 'filter' && !editingId" v-bind="getPendingProps()" :class="CHIP">
          <span :class="CHIP_KEY">{{ draftDef.label }}</span>
          <span v-if="draftOperator" data-fs="operator" :class="CHIP_OP" aria-hidden="true">
            {{ operatorText(draftDef.key, draftOperator) }}
          </span>
          <span data-fs="value" :class="CHIP_VALUE" aria-hidden="true">
            {{ draftValues.length ? draftValues.map((v) => search.valueLabel(draftDef.key, v)).join(', ') : '…' }}
          </span>
          <button v-bind="getDiscardProps()" :class="CHIP_REMOVE">&times;</button>
        </div>

        <div class="flex min-w-[110px] flex-1 basis-[150px]">
          <input
            v-bind="getInputProps()"
            :placeholder="placeholder"
            class="min-h-[30px] w-full border-0 bg-transparent px-1 py-1.5 font-[inherit] text-[14.5px] text-ink placeholder:text-ink-3 focus-visible:outline-none"
          >
        </div>

        <div class="ml-auto flex items-center gap-1">
          <button
            v-if="canApply"
            v-bind="getApplyProps()"
            :class="[ACTION, 'border border-accent bg-accent-soft font-semibold text-accent-ink']"
          >
            Apply {{ draftValues.length }}
          </button>
          <button
            v-if="clearable && tokens.length"
            v-bind="getClearProps()"
            :class="[ACTION, 'border-0 bg-transparent text-ink-3 hover:bg-surface-2 hover:text-ink']"
          >
            Clear all
          </button>
          <button
            v-bind="getSubmitProps()"
            :class="[ACTION, 'border border-line-strong bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink']"
          >
            Search
          </button>
        </div>
      </div>

      <!-- Never removed from the DOM: aria-controls has to resolve while closed. -->
      <ul
        v-bind="getListboxProps()"
        class="absolute top-[calc(100%+6px)] left-0 z-20 m-0 max-h-[300px] w-[min(100%,520px)] list-none overflow-y-auto rounded-md border border-line-strong bg-surface p-[5px] shadow-pop state-busy:opacity-70"
      >
        <li
          v-for="group in indexedGroups"
          v-bind="getGroupProps(group)"
          :key="group.id"
          class="[&+&]:mt-1 [&+&]:border-t [&+&]:border-line [&+&]:pt-1"
        >
          <p class="m-0 px-2.5 pt-1.5 pb-1 font-mono text-[10.5px] tracking-[0.12em] text-ink-3 uppercase" aria-hidden="true">
            {{ group.label }}
          </p>
          <div
            v-for="option in group.options"
            v-bind="getOptionProps(option)"
            :key="option.id"
            class="flex cursor-pointer items-center gap-2.5 rounded px-2.5 py-[7px] text-sm state-active:bg-accent-soft"
          >
            <span v-if="option.kind === 'operator'" class="min-w-[22px] font-mono text-xs text-clay" aria-hidden="true">
              {{ option.symbol }}
            </span>
            <span v-else-if="option.color" class="h-2.5 w-2.5 flex-none rounded-full" :style="{ background: option.color }" aria-hidden="true" />
            <!--
              A person: a picture when there is one, tinted initials when not.
              The hue is per person, the lightness and chroma per theme.
            -->
            <img
              v-else-if="option.avatar"
              :src="option.avatar"
              alt=""
              class="h-[22px] w-[22px] flex-none rounded-full object-cover"
            >
            <span
              v-else-if="option.initials"
              :class="AVATAR"
              :style="{ '--fs-tone-h': toneHue(option.payload) }"
              aria-hidden="true"
            >{{ option.initials }}</span>
            <span class="truncate">{{ option.label }}</span>
            <!-- The handle sits next to the name, where the eye already is. -->
            <span v-if="option.sub" class="truncate font-mono text-[12px] text-ink-3">{{ option.sub }}</span>
            <span v-if="option.hint" class="ml-auto font-mono text-[11.5px] text-ink-3">{{ option.hint }}</span>
            <!-- Trailing, like a menu: the left edge stays aligned whether or not a row is chosen. -->
            <span
              v-if="isMultiSelect"
              class="ml-auto w-3.5 flex-none text-[13px] text-transparent [[aria-selected=true]_&]:text-accent-ink"
              aria-hidden="true"
            >{{ isChosen(option) ? '✓' : '' }}</span>
          </div>
        </li>
        <!-- Outside the option set, so an empty list never reads "1 of 1". -->
        <li v-if="status" v-bind="getStatusRowProps()" class="px-2.5 py-2.5 text-[13px] text-ink-3">
          {{ status.text }}
        </li>
      </ul>
    </div>

    <p
      v-bind="getHintProps()"
      class="m-0 px-1 pt-1.5 pb-0.5 text-xs text-ink-3 [&_kbd]:rounded-sm [&_kbd]:border [&_kbd]:border-b-2 [&_kbd]:border-line [&_kbd]:bg-surface-2 [&_kbd]:px-1 [&_kbd]:py-px [&_kbd]:font-mono [&_kbd]:text-[11px] [&_kbd]:text-ink-2"
    >
      <kbd>&darr;</kbd><kbd>&uarr;</kbd> browse &middot;
      <template v-if="isMultiSelect && stage === 'value'">
        <kbd>Enter</kbd> choose &middot; <kbd>Tab</kbd> or <kbd>&rarr;</kbd> to apply &middot;
        <kbd>Esc</kbd> {{ editingId ? 'cancel the edit' : 'discard' }}
      </template>
      <template v-else-if="stage !== 'filter'">
        <kbd>Enter</kbd> {{ editingId ? 'keep the value' : 'add' }} &middot;
        <kbd>Esc</kbd> {{ editingId ? 'cancel the edit' : 'discard the filter you are adding' }}
      </template>
      <template v-else>
        <kbd>Enter</kbd> add &middot; <kbd>Space</kbd> on a filter edits it &middot;
        <kbd>Backspace</kbd> remove the last filter
      </template>
    </p>

    <p v-bind="getAppliedProps()" :class="SR_ONLY">{{ appliedSummary }}</p>
    <p v-bind="getLiveRegionProps()" :class="SR_ONLY">{{ announcement }}</p>
  </div>
</template>
