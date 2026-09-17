/**
 * The bridge between the search bar's tokens and `flex-url`.
 *
 * flex-url is the single source of truth for the query string: nothing in this
 * project hand-builds a URL. Tokens go in, a FlexUrl comes out, and the same
 * URL parses straight back into tokens — which is what lets the bar restore
 * itself from the address bar on load.
 *
 * Operator mapping (apiable's grammar, see README):
 *   'equal'  -> filter[attr][equal]=v
 *   'like'   -> filter[attr][like]=v
 *   'not_like' -> filter[attr][not_like]=v   (flex-url 3 / apiable negation)
 *   'gte'    -> filter[attr][gte]=v
 *   'lt'     -> filter[attr][lt]=v
 *   'in'     -> filter[attr]=a,b        (the plain, bracket-less entry)
 *   free text-> q=term
 */
import { flexUrl } from 'flex-url'
import { FILTERS, PLAIN, findFilter } from '../data/filters.js'
import { SORTS } from '../data/issues.js'

export const ENDPOINT = '/api/v1/issues'

const asArray = (value) => (Array.isArray(value) ? value : [value])

let uid = 0
const nextId = () => `url-${++uid}`

/** flex-url reports the plain entry with an empty operator; we call it 'in'. */
const fromWireOperator = (operator, values) => {
  if (operator) return operator
  return values.length > 1 ? PLAIN : 'equal'
}

/** Build the request URL for a set of tokens. Returns a FlexUrl (immutable). */
export function tokensToUrl (tokens, { path = ENDPOINT, sort } = {}) {
  let url = flexUrl(path)

  for (const token of tokens) {
    if (token.type === 'text') {
      url = url.search(token.value)
      continue
    }
    const def = findFilter(token.type)
    if (!def) continue
    const values = asArray(token.value)

    if (token.operator === PLAIN) {
      // The bracket-less entry is the only one that takes a value list.
      url = url.filter(def.param, values)
    } else {
      url = url.filter(def.param, token.operator, values.length > 1 ? values : values[0])
    }
  }

  const order = SORTS.find((s) => s.value === sort)
  if (order) url = order.direction === 'desc' ? url.sortDesc(order.attribute) : url.sort(order.attribute)

  return url
}

/** Read tokens (and the sort) back out of a URL the bar produced. */
export function urlToTokens (input) {
  const url = flexUrl(input)
  const tokens = []

  for (const { attribute, operator, values } of url.getFilters()) {
    const def = FILTERS.find((f) => f.param === attribute)
    if (!def) continue
    const key = fromWireOperator(operator, values)
    // Only offer operators this filter actually declares.
    if (!def.operators.some((o) => o.value === key)) continue
    const multiple = def.operators.find((o) => o.value === key)?.multiple
    tokens.push({
      id: nextId(),
      type: def.key,
      operator: key,
      value: multiple || values.length > 1 ? values : values[0]
    })
  }

  const search = url.getSearch()
  if (search) tokens.push({ id: nextId(), type: 'text', operator: 'like', value: search })

  const [first] = url.getSorts()
  const sort = first
    ? SORTS.find((s) => s.attribute === first.attribute && s.direction === first.direction)?.value
    : undefined

  return { tokens, sort, url }
}

/** What the compiled-query strip shows: pathname + query, no origin. */
export const requestUri = (tokens, options) => tokensToUrl(tokens, options).toRequestUri()

/** The same request as flex-url's nested object — the bracket structure made visible. */
export const requestParams = (tokens, options) => tokensToUrl(tokens, options).toParams()

/**
 * The `EndpointSchema` apiable's `apiable:types` exporter would publish for
 * this endpoint, derived from the filter definitions the bar runs on. This is
 * the contract a backend hands a client: attribute names, the operators each
 * one registers, and the closed value sets. Everything the UI adds on top —
 * labels, colours, avatars, async lookups — is presentation, and is not here.
 *
 * `in` is not an operator on the wire (it is the plain `filter[attr]=a,b`
 * entry), so a filter offering it is reported through the operator apiable
 * matches first for that attribute: `equal`.
 */
export function schemaFor (filters = FILTERS, { resource = 'issues', path = ENDPOINT, sorts = SORTS } = {}) {
  const out = {}
  for (const def of filters) {
    const operators = [...new Set(def.operators.map((o) => (o.value === PLAIN ? 'equal' : o.value)))]
    const values = def.values && !def.freeValue ? def.values.map((v) => v.value) : undefined
    out[def.param] = values ? { operators, values } : { operators }
  }
  return {
    resource,
    path,
    filters: out,
    sorts: [...new Set(sorts.map((s) => s.attribute))],
    includes: [],
    fields: {},
    appends: {},
    defaultSort: sorts[0] ? `${sorts[0].direction === 'desc' ? '-' : ''}${sorts[0].attribute}` : undefined
  }
}
