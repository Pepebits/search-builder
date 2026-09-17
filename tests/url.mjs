// The flex-url boundary: tokens -> wire -> tokens. No DOM needed.
import { requestParams, requestUri, schemaFor, tokensToUrl, urlToTokens } from '../src/lib/apiable.js'
import { PLAIN, daysAgo } from '../src/data/filters.js'

let pass = 0, fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`)
}
const shape = (tokens) => tokens.map((t) => [t.type, t.operator, t.value])

// --- each operator reaches the wire in apiable's own form ---
check('equal is bracketed',
  requestUri([{ id: '1', type: 'state', operator: 'equal', value: 'opened' }]),
  '/api/v1/issues?filter[status][equal]=opened')

check('the plain entry carries a comma list',
  requestUri([{ id: '1', type: 'label', operator: PLAIN, value: ['a11y', 'regression'] }]),
  '/api/v1/issues?filter[labels]=a11y,regression')

check('like is bracketed',
  requestUri([{ id: '1', type: 'title', operator: 'like', value: 'combobox' }]),
  '/api/v1/issues?filter[title][like]=combobox')

check('not_like is bracketed too — negation is part of the grammar since flex-url 3',
  requestUri([{ id: '1', type: 'title', operator: 'not_like', value: 'focus' }]),
  '/api/v1/issues?filter[title][not_like]=focus')

check('and parses straight back',
  shape(urlToTokens('/api/v1/issues?filter[title][not_like]=focus').tokens), [['title', 'not_like', 'focus']])

check('a date comparison is bracketed',
  requestUri([{ id: '1', type: 'updated', operator: 'gte', value: '2026-09-03' }]),
  '/api/v1/issues?filter[updated_at][gte]=2026-09-03')

check('free text becomes q',
  requestUri([{ id: '1', type: 'text', operator: 'like', value: 'hydration mismatch' }]),
  '/api/v1/issues?q=hydration%20mismatch')

check('sort direction maps to the - prefix',
  requestUri([], { sort: 'updated_desc' }),
  '/api/v1/issues?sort=-updated_at')
check('ascending has no prefix',
  requestUri([], { sort: 'updated_asc' }),
  '/api/v1/issues?sort=updated_at')

// --- round trip ---
{
  const tokens = [
    { id: '1', type: 'state', operator: 'equal', value: 'opened' },
    { id: '2', type: 'label', operator: PLAIN, value: ['a11y', 'regression'] },
    { id: '3', type: 'title', operator: 'like', value: 'combobox' },
    { id: '4', type: 'updated', operator: 'gte', value: daysAgo(7) },
    { id: '5', type: 'text', operator: 'like', value: 'hydration' }
  ]
  const uri = requestUri(tokens, { sort: 'comments_desc' })
  const back = urlToTokens(uri)
  check('every token survives the round trip', shape(back.tokens), shape(tokens))
  check('and so does the sort', back.sort, 'comments_desc')
  check('re-serialising is stable', requestUri(back.tokens, { sort: back.sort }), uri)
}

// --- parsing tolerates what it should ---
check('a percent-encoded bracket parses (apiable pagination links use them)',
  shape(urlToTokens('/api/v1/issues?filter%5Bstatus%5D%5Bequal%5D=closed').tokens),
  [['state', 'equal', 'closed']])

check('a filter this bar does not know is ignored, not crashed on',
  shape(urlToTokens('/api/v1/issues?filter[nonsense][equal]=1&filter[status][equal]=opened').tokens),
  [['state', 'equal', 'opened']])

check('an operator the filter does not declare is ignored',
  shape(urlToTokens('/api/v1/issues?filter[status][like]=open').tokens), [])

check('a plain entry with one value comes back as equal',
  shape(urlToTokens('/api/v1/issues?filter[labels]=a11y').tokens), [['label', 'equal', 'a11y']])

// --- encoding contract (flex-url 3): a comma is always a list separator ---
// apiable explodes on ',' after decoding, so '%2C' never meant anything else
// server-side; flex-url 3 stopped pretending it did. A comma inside one value
// is not representable — it comes back as two values, which `like` still
// handles as "contains either".
{
  const uri = requestUri([{ id: '1', type: 'title', operator: 'like', value: 'a,b' }])
  check('a comma in a value is emitted raw', uri, '/api/v1/issues?filter[title][like]=a,b')
  check('and comes back as a list', shape(urlToTokens(uri).tokens), [['title', 'like', ['a', 'b']]])
}

// --- immutability: the builder never mutates what it was given ---
{
  const base = tokensToUrl([{ id: '1', type: 'state', operator: 'equal', value: 'opened' }])
  const more = base.filter('labels', ['a11y'])
  check('the original builder is untouched', base.toRequestUri(), '/api/v1/issues?filter[status][equal]=opened')
  check('the derived one has both', more.toRequestUri(),
    '/api/v1/issues?filter[status][equal]=opened&filter[labels]=a11y')
}

// --- the schema a backend would publish, derived from the same definitions ---
{
  const schema = schemaFor()
  check('schema names the endpoint', [schema.resource, schema.path], ['issues', '/api/v1/issues'])
  check('a closed value set is listed under its wire attribute',
    schema.filters.status, { operators: ['equal'], values: ['opened', 'closed'] })
  check('the plain entry is reported as equal, once',
    schema.filters.labels.operators, ['equal'])
  check('negation is part of the contract', schema.filters.title.operators, ['like', 'not_like'])
  check('a free-value filter publishes no value set', 'values' in schema.filters.title, false)
  check('sorts are wire attributes, deduplicated', schema.sorts, ['updated_at', 'created_at', 'comments_count'])
  check('the default sort is the first one, signed', schema.defaultSort, '-updated_at')
  check('params mirror the bracket structure',
    requestParams([{ id: '1', type: 'title', operator: 'not_like', value: 'focus' }], { sort: 'updated_desc' }),
    { filter: { title: { not_like: 'focus' } }, sort: '-updated_at' })
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
