<script setup>
import { ref, computed, watch } from 'vue'
import SearchBuilder from './components/SearchBuilder.vue'
import IssueList from './components/IssueList.vue'
import DebugPanel from './components/DebugPanel.vue'
import { FILTERS, PLAIN } from './data/filters.js'
import { ISSUES, SORTS, applyTokens } from './data/issues.js'
import { createApiable } from './apiable/index.ts'

const apiable = createApiable({ filters: FILTERS, path: '/api/v1/issues', sorts: SORTS, resource: 'issues' })
const { requestParams, schema, tokensToUrl, urlToTokens } = apiable

// Opens in a realistic working state — unless the address bar already carries
// filters, in which case flex-url parses them straight back into chips.
const DEFAULT_TOKENS = [
  { id: 'seed-1', type: 'state', operator: 'equal', value: 'opened' },
  { id: 'seed-2', type: 'label', operator: PLAIN, value: ['a11y', 'regression'] }
]

const restored = urlToTokens(typeof window === 'undefined' ? '/' : window.location.href)
const tokens = ref(restored.tokens.length ? restored.tokens : DEFAULT_TOKENS)
const sort = ref(restored.sort ?? 'updated_desc')
const searchRef = ref(null)

const results = computed(() => {
  const compare = SORTS.find((s) => s.value === sort.value).compare
  return applyTokens(ISSUES, tokens.value).slice().sort(compare)
})

// One builder, two destinations: the request the API would receive, and the
// address bar, which differs only in its path.
const requestUrl = computed(() => `GET ${tokensToUrl(tokens.value, { sort: sort.value }).toRequestUri()}`)
const browserUrl = computed(() =>
  tokensToUrl(tokens.value, {
    path: typeof window === 'undefined' ? '/' : window.location.pathname,
    sort: sort.value
  })
)

watch(browserUrl, (next) => {
  // Not every host allows it (a sandboxed frame, about:blank), and a search bar
  // is not worth an exception.
  try {
    window.history?.replaceState(null, '', next.toRelativeUrl())
  } catch {
    /* the URL strip above still shows what would be sent */
  }
})

function clear () {
  tokens.value = []
  searchRef.value?.focus()
}

/* ---- the debug panel: what the bar exchanges with the rest of the app ---- */

const json = (value) => JSON.stringify(value, (key, v) => (typeof v === 'function' ? '[function]' : v), 2)

/** The live region, kept: a screen reader hears these one at a time, this shows the sequence. */
const spoken = ref([])
const onAnnounce = (text) => { spoken.value = [...spoken.value.slice(-19), text] }

/** The core's state, read through the refs the Vue adapter exposes. */
const coreState = computed(() => {
  const s = searchRef.value?.search
  if (!s) return null
  return {
    stage: s.stage.value,
    isOpen: s.isOpen.value,
    activeIndex: s.activeIndex.value,
    draft: { key: s.draftDef.value?.key ?? null, operator: s.draftOperator.value, values: s.draftValues.value },
    editingId: s.editingId.value,
    loading: s.loading.value,
    isMultiSelect: s.isMultiSelect.value,
    canApply: s.canApply.value,
    options: s.flatOptions.value.length,
    listboxLabel: s.listboxLabel.value,
    placeholder: s.placeholder.value,
    status: s.status.value
  }
})

const debugTabs = computed(() => [
  {
    id: 'schema',
    label: 'Backend schema',
    hint: 'What apiable\'s `apiable:types` exporter publishes for this endpoint — the contract the client builds on.',
    text: json(schema())
  },
  {
    id: 'filters',
    label: 'Filter definitions',
    hint: 'What the bar consumes: the schema plus presentation — labels, symbols, colours, avatars, async lookups.',
    text: json(FILTERS)
  },
  {
    id: 'tokens',
    label: 'Tokens',
    hint: 'The v-model. Operator is the wire key; value is a string, or a list under a multi-value operator.',
    text: json(tokens.value)
  },
  {
    id: 'request',
    label: 'Request',
    hint: 'The same tokens through flex-url: the request URI, and its nested params form.',
    text: `${requestUrl.value}\n\n${json(requestParams(tokens.value, { sort: sort.value }))}`
  },
  {
    id: 'state',
    label: 'Core state',
    hint: 'The framework-agnostic store, as the Vue adapter sees it right now.',
    text: json(coreState.value)
  },
  {
    id: 'live',
    label: 'Announcements',
    hint: 'Every sentence written to the role="status" live region, oldest first. Last 20.',
    text: spoken.value.length ? spoken.value.map((line, i) => `${String(i + 1).padStart(2, ' ')}  ${line}`).join('\n') : '(nothing announced yet)'
  }
])
</script>

<template>
  <main class="page">
    <header>
      <p class="eyebrow">Vue 3 · Composition API · WAI-ARIA 1.2 combobox</p>
      <h1>Filtered Search</h1>
    </header>

    <div class="workbench">
      <div class="wb-head">
        <div class="wb-search">
          <SearchBuilder
            ref="searchRef"
            v-model="tokens"
            :filters="FILTERS"
            label="Search issues"
            :result-count="results.length"
            @submit="() => {}"
            @announce="onAnnounce"
          />
        </div>
        <div class="wb-sort">
          <label for="issue-sort">Sort by</label>
          <select id="issue-sort" v-model="sort">
            <option v-for="option in SORTS" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </div>
      </div>

      <p class="compiled"><span class="lb">Request</span><code>{{ requestUrl }}</code></p>

      <p class="res-head">
        <span>{{ results.length }} {{ results.length === 1 ? 'issue' : 'issues' }}</span>
        <span v-if="tokens.length">{{ tokens.length }} {{ tokens.length === 1 ? 'filter' : 'filters' }} applied</span>
      </p>

      <IssueList v-if="results.length" :issues="results" />
      <div v-else class="empty">
        <p>No issues match all {{ tokens.length }} filters. Remove one to widen the search — <strong>Backspace</strong> in the bar drops the last one.</p>
        <button type="button" @click="clear">Clear all filters</button>
      </div>
    </div>

    <DebugPanel :tabs="debugTabs" />
  </main>
</template>
