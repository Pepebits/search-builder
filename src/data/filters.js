/**
 * Filter definitions.
 *
 * Operators are the ones `flex-url` puts on the wire for the Laravel Apiable
 * grammar — `equal`, `like`, `gt`, `gte`, `lt`, `lte`, `not_equal`, `not_like`
 * — plus `in`, our marker for apiable's bracket-less multi-value entry
 * (`filter[labels]=a,b`). The `description` is what a screen reader reads;
 * `symbol` is what the chip shows.
 *
 *   value       the apiable operator key, or 'in' for the plain entry
 *   symbol      short form drawn in the chip
 *   description the words used in every accessible name
 *   multiple    the value stage accumulates values into one token
 *   negated     styles the chip as excluding: the operator cell takes the
 *               plum tint (the backend has to register the operator too)
 */

export const IS = { value: 'equal', symbol: '=', description: 'is' }
export const ANY_OF = { value: 'in', symbol: '=', description: 'is any of', multiple: true }
export const CONTAINS = { value: 'like', symbol: '~', description: 'contains' }
export const NOT_CONTAINS = { value: 'not_like', symbol: '!~', description: 'does not contain', negated: true }
export const ON_OR_AFTER = { value: 'gte', symbol: '\u2265', description: 'on or after' }
export const BEFORE = { value: 'lt', symbol: '<', description: 'before' }

/** apiable's plain, bracket-less entry: `filter[attribute]=a,b`. */
export const PLAIN = 'in'

/** Values that mean "unset" or "set to anything". */
export const NONE = { value: 'None', label: 'None', special: true }
export const ANY = { value: 'Any', label: 'Any', special: true }
export const ME = { value: 'Me', label: 'Me', special: true }

export const CURRENT_USER = 'nadia.okonkwo'

/** ISO day, n days back — apiable date filters compare real dates. */
export const daysAgo = (n) => {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - n)
  return date.toISOString().slice(0, 10)
}

export const PEOPLE = [
  { value: 'nadia.okonkwo', label: 'Nadia Okonkwo', sub: '@nadia.okonkwo', initials: 'NO' },
  { value: 'jules.paquet', label: 'Jules Paquet', sub: '@jules.paquet', initials: 'JP' },
  { value: 'rin.tanaka', label: 'Rin Tanaka', sub: '@rin.tanaka', initials: 'RT' },
  { value: 'sam.oyelaran', label: 'Sam Oyelaran', sub: '@sam.oyelaran', initials: 'SO' }
]

export const LABELS = [
  { value: 'a11y', label: 'a11y', color: '#0B6E5F' },
  { value: 'regression', label: 'regression', color: '#C0392B' },
  { value: 'needs-review', label: 'needs-review', color: '#B7791F' },
  { value: 'performance', label: 'performance', color: '#3A6EA5' },
  { value: 'blocked', label: 'blocked', color: '#7A5AA8' },
  { value: 'good-first-issue', label: 'good-first-issue', color: '#2E7D32' }
]

/** Stands in for the network call a real token would make. */
const resolveAfter = (values, ms = 260) =>
  new Promise((resolve) => setTimeout(() => resolve(values), ms))

export const FILTERS = [
  {
    key: 'state',
    label: 'Status',
    param: 'status',
    // One operator: "is any of open, closed" would just mean "no filter".
    operators: [IS],
    values: [
      { value: 'opened', label: 'Open' },
      { value: 'closed', label: 'Closed' }
    ]
  },
  {
    key: 'type',
    label: 'Type',
    param: 'type',
    operators: [IS, ANY_OF],
    values: [
      { value: 'bug', label: 'Bug' },
      { value: 'feature', label: 'Feature' },
      { value: 'chore', label: 'Chore' }
    ]
  },
  {
    key: 'label',
    label: 'Label',
    param: 'labels',
    operators: [IS, ANY_OF],
    specialValues: [NONE, ANY],
    values: LABELS,
    kind: 'label',
    repeatable: true
  },
  {
    key: 'assignee',
    label: 'Assignee',
    param: 'assignee',
    operators: [IS, ANY_OF],
    specialValues: [NONE, ANY, ME],
    kind: 'person',
    // Async, so the listbox exercises aria-busy and the loading announcement.
    fetchValues: (query) =>
      resolveAfter(PEOPLE.filter((p) => p.label.toLowerCase().includes(query.toLowerCase())))
  },
  {
    key: 'author',
    label: 'Author',
    param: 'author',
    operators: [IS],
    specialValues: [ME],
    kind: 'person',
    fetchValues: (query) =>
      resolveAfter(PEOPLE.filter((p) => p.label.toLowerCase().includes(query.toLowerCase())))
  },
  {
    key: 'milestone',
    label: 'Milestone',
    param: 'milestone',
    operators: [IS, ANY_OF],
    specialValues: [NONE, ANY],
    values: [
      { value: 'v4.2', label: 'v4.2' },
      { value: 'v4.3', label: 'v4.3' },
      { value: 'backlog', label: 'Backlog' }
    ]
  },
  {
    key: 'title',
    label: 'Title',
    param: 'title',
    // apiable's `like` and its negation: filter[title][like]=hydration,
    // filter[title][not_like]=hydration. `freeValue` lets the text be typed —
    // the suggestions below are only a head start.
    operators: [CONTAINS, NOT_CONTAINS],
    freeValue: true,
    values: [
      { value: 'combobox', label: 'combobox' },
      { value: 'filter', label: 'filter' },
      { value: 'focus', label: 'focus' }
    ]
  },
  {
    key: 'confidential',
    label: 'Confidential',
    param: 'confidential',
    operators: [IS],
    values: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' }
    ]
  },
  {
    key: 'updated',
    label: 'Updated',
    param: 'updated_at',
    operators: [ON_OR_AFTER, BEFORE],
    values: [
      { value: daysAgo(2), label: '2 days ago' },
      { value: daysAgo(7), label: '7 days ago' },
      { value: daysAgo(30), label: '30 days ago' }
    ]
  }
]

export function findFilter (key) {
  return FILTERS.find((f) => f.key === key) ?? null
}

export function findOperator (key, symbol) {
  return findFilter(key)?.operators.find((o) => o.value === symbol) ?? null
}

export function findValue (key, value) {
  const def = findFilter(key)
  if (!def) return null
  const pool = [...(def.specialValues ?? []), ...(def.values ?? []), ...PEOPLE]
  return pool.find((v) => v.value === value) ?? null
}

export function labelColor (value) {
  return LABELS.find((l) => l.value === value)?.color ?? '#8A9995'
}

export function findPerson (value) {
  return PEOPLE.find((p) => p.value === value) ?? null
}
