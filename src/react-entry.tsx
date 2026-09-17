// Mounts the React example on its own, for tests/react.mjs. Same seeded
// tokens and the same result list as src/headless-entry.js — this is the
// proof the two adapters agree, not just the two Vue demos.
import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ReactSearch } from './components/ReactSearch.tsx'
import { useSearchBuilder } from './react/index.ts'
import { FILTERS, PLAIN } from './data/filters.js'
import { ISSUES, applyTokens } from './data/issues.js'
import type { Token } from './core/index.ts'
// Page furniture only (the nav, the page layout) — ReactSearch itself pulls
// in the tokens + plain stylesheet it needs.
import './styles.css'

declare global {
  interface Window {
    /** A host replacing tokens from the outside — tests/react.mjs uses this. */
    __setTokens?: (tokens: Token[]) => void
    /**
     * Mounts a second, throwaway instance whose `filters` prop is a fresh
     * array on every render — the idiomatic React mistake the adapter has to
     * survive. tests/react.mjs uses it; nothing on the demo page calls it.
     */
    __mountInlineFilters?: () => void
  }
}

function InlineFiltersProbe () {
  const s = useSearchBuilder({ filters: [...FILTERS], label: 'Inline filters probe' })
  return (
    <div {...s.getRootProps()}>
      <input {...s.getInputProps()} />
      <div {...s.getListboxProps()} />
    </div>
  )
}

window.__mountInlineFilters = () => {
  const host = document.createElement('div')
  host.id = 'inline-probe'
  document.body.append(host)
  createRoot(host).render(<InlineFiltersProbe />)
}

const SEED: Token[] = [
  { id: 'seed-1', type: 'state', operator: 'equal', value: 'opened' },
  { id: 'seed-2', type: 'label', operator: PLAIN, value: ['a11y', 'regression'] }
]

function Demo () {
  const [tokens, setTokens] = useState(SEED)
  // `issues.js` is plain JS (see src/data/issues.js); an explicit `any[]`
  // here is the same boundary src/App.vue crosses without a cast, just
  // spelled out for a checked .tsx file.
  const results = useMemo<any[]>(() => applyTokens(ISSUES, tokens), [tokens])

  // Exposed for the Playwright suite: an external token replacement from the
  // host must be reflected the same way a controlled `value` prop would be.
  useEffect(() => { window.__setTokens = setTokens }, [])

  return (
    <>
      <ReactSearch
        filters={FILTERS}
        label="Search issues"
        resultCount={results.length}
        tokens={tokens}
        onTokensChange={setTokens}
      />
      <ul id="results">
        {results.map((issue) => <li key={issue.id}>{issue.title}</li>)}
      </ul>
    </>
  )
}

createRoot(document.getElementById('app')!).render(<Demo />)
