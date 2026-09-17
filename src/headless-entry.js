// Mounts the headless example on its own, for tests/headless.mjs and for
// headless.html. The page dresses it with src/headless-starter.css — about
// fifty lines written for this page alone, shown in full below the results so
// the point is visible: the behaviour comes from the getters, the look from
// whatever you write. The test build never injects that CSS, so the suite
// still runs the bar with no styles at all.
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
import './headless-starter.css'
import starterCss from './headless-starter.css?raw'

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
    h('ul', { id: 'results' }, results.value.map((issue) => h('li', { key: issue.id }, issue.title))),
    h('details', { class: 'css-source' }, [
      h('summary', `The ${starterCss.split('\n').filter((l) => l.includes('{')).length} CSS rules on this page, in full`),
      h('pre', h('code', starterCss))
    ])
  ]
}).mount('#app')
