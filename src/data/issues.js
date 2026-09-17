import { CURRENT_USER, PLAIN, daysAgo } from './filters.js'

// Sample content so the component opens in a realistic working state.
export const ISSUES = [
  { id: 4821, title: 'Combobox loses aria-activedescendant after the option list filters', state: 'opened', type: 'bug', labels: ['a11y', 'needs-review'], assignee: 'nadia.okonkwo', author: 'rin.tanaka', milestone: 'v4.2', confidential: 'no', days: 2, comments: 6 },
  { id: 4809, title: 'Filter chips overflow the bar below 360px instead of wrapping', state: 'opened', type: 'bug', labels: ['regression', 'a11y'], assignee: 'jules.paquet', author: 'nadia.okonkwo', milestone: 'v4.2', confidential: 'no', days: 5, comments: 3 },
  { id: 4794, title: 'Add the != operator to the milestone filter', state: 'opened', type: 'feature', labels: ['needs-review'], assignee: 'rin.tanaka', author: 'sam.oyelaran', milestone: 'v4.3', confidential: 'no', days: 1, comments: 11 },
  { id: 4780, title: 'Hydration mismatch when tokens are restored from the URL', state: 'closed', type: 'bug', labels: ['regression', 'performance'], assignee: 'sam.oyelaran', author: 'jules.paquet', milestone: 'v4.2', confidential: 'no', days: 12, comments: 9 },
  { id: 4771, title: 'Announce the result count when a filter is added or removed', state: 'opened', type: 'feature', labels: ['a11y'], assignee: 'nadia.okonkwo', author: 'nadia.okonkwo', milestone: 'v4.2', confidential: 'no', days: 3, comments: 4 },
  { id: 4762, title: 'Escape should step back one stage, not close the whole list', state: 'opened', type: 'bug', labels: ['a11y'], assignee: 'none', author: 'rin.tanaka', milestone: 'backlog', confidential: 'no', days: 8, comments: 2 },
  { id: 4750, title: 'Debounce the value suggestion request to 180ms', state: 'closed', type: 'chore', labels: ['performance'], assignee: 'jules.paquet', author: 'jules.paquet', milestone: 'v4.3', confidential: 'no', days: 21, comments: 1 },
  { id: 4744, title: 'Document the keyboard map next to the component story', state: 'opened', type: 'chore', labels: ['good-first-issue'], assignee: 'none', author: 'sam.oyelaran', milestone: 'backlog', confidential: 'no', days: 6, comments: 0 },
  { id: 4731, title: 'Suggestion list traps focus in Safari 17 after a chip is removed', state: 'opened', type: 'bug', labels: ['a11y', 'blocked'], assignee: 'rin.tanaka', author: 'nadia.okonkwo', milestone: 'v4.3', confidential: 'no', days: 4, comments: 14 },
  { id: 4720, title: 'Support saved searches shared across a project', state: 'opened', type: 'feature', labels: [], assignee: 'sam.oyelaran', author: 'sam.oyelaran', milestone: 'backlog', confidential: 'no', days: 30, comments: 22 },
  { id: 4712, title: 'Sort by recently updated ignores comment activity', state: 'closed', type: 'bug', labels: ['performance'], assignee: 'nadia.okonkwo', author: 'jules.paquet', milestone: 'v4.1', confidential: 'no', days: 45, comments: 5 },
  { id: 4705, title: 'Confidential issues appear in the value suggestion list', state: 'opened', type: 'bug', labels: ['regression', 'a11y'], assignee: 'jules.paquet', author: 'rin.tanaka', milestone: 'v4.2', confidential: 'yes', days: 2, comments: 8 }
]

const asArray = (value) => (Array.isArray(value) ? value : [value])

/** Each issue carries the real date apiable would filter on. */
export const withDates = (issues) => issues.map((i) => ({ ...i, updated_at: daysAgo(i.days) }))

/** Resolve one filter value against one issue. Handles None / Any / Me. */
function valueMatches (issue, type, value) {
  if (value === 'Me') return String(issue[type]) === CURRENT_USER
  if (type === 'label') {
    if (value === 'None') return issue.labels.length === 0
    if (value === 'Any') return issue.labels.length > 0
    return issue.labels.includes(value)
  }
  if (value === 'None') return !issue[type] || issue[type] === 'none'
  if (value === 'Any') return Boolean(issue[type]) && issue[type] !== 'none'
  return String(issue[type]) === value
}

/**
 * Apply a token list. The operators are apiable's, so this reads the same way
 * the backend's query would: `equal`, `in` (any of), `like`, `not_like`,
 * `gte`, `lt`.
 */
export function applyTokens (issues, tokens) {
  return withDates(issues).filter((issue) =>
    tokens.every((token) => {
      if (token.type === 'text') {
        return issue.title.toLowerCase().includes(token.value.toLowerCase())
      }
      const values = asArray(token.value)

      if (token.operator === 'like' || token.operator === 'not_like') {
        const field = token.type === 'title' ? issue.title : String(issue[token.type] ?? '')
        const contains = values.some((v) => field.toLowerCase().includes(String(v).toLowerCase()))
        return token.operator === 'like' ? contains : !contains
      }
      if (token.operator === 'gte') return issue.updated_at >= values[0]
      if (token.operator === 'lt') return issue.updated_at < values[0]

      // 'equal' and 'in' differ only in how many values they carry.
      const hit = (value) => valueMatches(issue, token.type, value)
      return token.operator === PLAIN ? values.some(hit) : hit(values[0])
    })
  )
}

/** `attribute` and `direction` are what flex-url puts in `sort=`. */
export const SORTS = [
  { value: 'updated_desc', label: 'Last updated', attribute: 'updated_at', direction: 'desc', compare: (a, b) => a.days - b.days },
  { value: 'updated_asc', label: 'Least recently updated', attribute: 'updated_at', direction: 'asc', compare: (a, b) => b.days - a.days },
  { value: 'created_desc', label: 'Newest first', attribute: 'created_at', direction: 'desc', compare: (a, b) => b.id - a.id },
  { value: 'comments_desc', label: 'Most comments', attribute: 'comments_count', direction: 'desc', compare: (a, b) => b.comments - a.comments }
]
