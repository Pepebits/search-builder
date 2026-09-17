/**
 * The bridge between a search bar's tokens and `flex-url`.
 *
 * flex-url is the single source of truth for the query string: nothing here
 * hand-builds a URL. Tokens go in, a FlexUrl comes out, and the same URL
 * parses straight back into tokens — which is what lets a bar restore itself
 * from the address bar on load.
 *
 * This module imports only `flex-url` (values) and `../core` (types) — never
 * demo data. Everything it needs about a project's filters comes in through
 * `createApiable(options)`.
 *
 * Operator mapping (apiable's grammar, see README):
 *   'equal'    -> filter[attr][equal]=v
 *   'like'     -> filter[attr][like]=v
 *   'not_like' -> filter[attr][not_like]=v   (flex-url 3 / apiable negation)
 *   'gte'      -> filter[attr][gte]=v
 *   'lt'       -> filter[attr][lt]=v
 *   'in'       -> filter[attr]=a,b        (the plain, bracket-less entry)
 *   free text  -> q=term
 */
import { flexUrl, type EndpointSchema, type FilterOperator, type FilterOperatorInput, type FlexUrl, type ScalarValue } from 'flex-url'
import type { FilterDef, Token } from '../core/index.ts'

export interface SortDef { value: string; attribute: string; direction: 'asc' | 'desc' }

export interface ApiableOptions {
  filters: FilterDef[]
  /** Defaults to `'/'`. */
  path?: string
  sorts?: SortDef[]
  /** Defaults to the last path segment of `path`. */
  resource?: string
}

/** apiable's plain, bracket-less entry: `filter[attribute]=a,b`. Not exported — this is the wire protocol, not a filter definition. */
const PLAIN = 'in'

const asArray = <T> (value: T | T[]): T[] => (Array.isArray(value) ? value : [value])

let uid = 0
const nextId = (): string => `url-${++uid}`

const resourceFromPath = (path: string): string => path.split('/').filter(Boolean).pop() ?? path

/** flex-url reports the plain entry with an empty operator; we call it 'in'. */
const fromWireOperator = (operator: string, values: string[]): string => {
  if (operator) return operator
  return values.length > 1 ? PLAIN : 'equal'
}

export function createApiable (options: ApiableOptions) {
  const { filters } = options
  const defaultPath = options.path ?? '/'
  const sorts = options.sorts ?? []
  const resource = options.resource ?? resourceFromPath(defaultPath)

  const findFilter = (key: string): FilterDef | null => filters.find((f) => f.key === key) ?? null
  const findFilterByParam = (param: string): FilterDef | null => filters.find((f) => (f.param ?? f.key) === param) ?? null

  /** Build the request URL for a set of tokens. Returns a FlexUrl (immutable). */
  function tokensToUrl (tokens: Token[], { path = defaultPath, sort }: { path?: string, sort?: string } = {}): FlexUrl {
    let url = flexUrl(path)

    for (const token of tokens) {
      if (token.type === 'text') {
        url = url.search(token.value as string)
        continue
      }
      const def = findFilter(token.type)
      if (!def) continue
      const param = def.param ?? def.key
      const values = asArray(token.value)

      if (token.operator === PLAIN) {
        // The bracket-less entry is the only one that takes a value list.
        url = url.filter(param, values)
      } else {
        const value: ScalarValue | ScalarValue[] = values.length > 1 ? values : values[0]
        url = url.filter(param, token.operator as FilterOperatorInput, value)
      }
    }

    const order = sorts.find((s) => s.value === sort)
    if (order) url = order.direction === 'desc' ? url.sortDesc(order.attribute) : url.sort(order.attribute)

    return url
  }

  /** Read tokens (and the sort) back out of a URL the bar produced. */
  function urlToTokens (input: string | URL): { tokens: Token[], sort?: string, url: FlexUrl } {
    const url = flexUrl(input)
    const tokens: Token[] = []

    for (const { attribute, operator, values } of url.getFilters()) {
      const def = findFilterByParam(attribute)
      if (!def) continue
      const key = fromWireOperator(operator, values)
      // Only offer operators this filter actually declares.
      const matchedOperator = def.operators.find((o) => o.value === key)
      if (!matchedOperator) continue
      const multiple = matchedOperator.multiple
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
      ? sorts.find((s) => s.attribute === first.attribute && s.direction === first.direction)?.value
      : undefined

    return { tokens, sort, url }
  }

  /** What the compiled-query strip shows: pathname + query, no origin. */
  const requestUri = (tokens: Token[], opts?: { path?: string, sort?: string }): string =>
    tokensToUrl(tokens, opts).toRequestUri()

  /** The same request as flex-url's nested object — the bracket structure made visible. */
  const requestParams = (tokens: Token[], opts?: { path?: string, sort?: string }): Record<string, unknown> =>
    tokensToUrl(tokens, opts).toParams()

  /**
   * The `EndpointSchema` apiable's `apiable:types` exporter would publish for
   * this endpoint, derived from the filter definitions passed to
   * `createApiable`. This is the contract a backend hands a client: attribute
   * names, the operators each one registers, and the closed value sets.
   * Everything the UI adds on top — labels, colours, avatars, async lookups —
   * is presentation, and is not here.
   *
   * `in` is not an operator on the wire (it is the plain `filter[attr]=a,b`
   * entry), so a filter offering it is reported through the operator apiable
   * matches first for that attribute: `equal`.
   */
  function schema (): EndpointSchema {
    const out: Record<string, { operators: FilterOperator[], values?: string[] }> = {}
    for (const def of filters) {
      const operators = [...new Set(def.operators.map((o) => (o.value === PLAIN ? 'equal' : o.value)))] as FilterOperator[]
      const values = def.values && !def.freeValue ? def.values.map((v) => v.value) : undefined
      out[def.param ?? def.key] = values ? { operators, values } : { operators }
    }
    return {
      resource,
      path: defaultPath,
      filters: out,
      sorts: [...new Set(sorts.map((s) => s.attribute))],
      includes: [],
      fields: {},
      appends: {},
      defaultSort: sorts[0] ? `${sorts[0].direction === 'desc' ? '-' : ''}${sorts[0].attribute}` : undefined
    }
  }

  return { tokensToUrl, urlToTokens, requestUri, requestParams, schema }
}
