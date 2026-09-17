// Mounts the unstyled example on its own, for tests/headless.mjs and for
// headless.html. The stylesheet is page furniture only (the nav, the page
// layout) — HeadlessSearch.vue itself stays unstyled either way.
import { createApp, h, ref, computed } from 'vue'
import HeadlessSearch from './components/HeadlessSearch.vue'
import { FILTERS, PLAIN } from './data/filters.js'
import { ISSUES, applyTokens } from './data/issues.js'
// Only the palette: tokens.css declares custom properties on `:root` and
// nothing else, so the bar stays unstyled while the page furniture
// (styles.css, which reads --fs-bg, --fs-sans, --fs-mono …) gets its values.
// Without this the shared nav renders in the browser default serif.
import './styles/tokens.css'
import './styles.css'

const tokens = ref([
  { id: 'seed-1', type: 'state', operator: 'equal', value: 'opened' },
  { id: 'seed-2', type: 'label', operator: PLAIN, value: ['a11y', 'regression'] }
])
const results = computed(() => applyTokens(ISSUES, tokens.value))

createApp({
  render: () => [
    h(HeadlessSearch, {
      modelValue: tokens.value,
      'onUpdate:modelValue': (value) => { tokens.value = value },
      filters: FILTERS,
      label: 'Search issues',
      resultCount: results.value.length
    }),
    h('ul', { id: 'results' }, results.value.map((issue) => h('li', { key: issue.id }, issue.title)))
  ]
}).mount('#app')
