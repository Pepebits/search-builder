// Part of `npm run build:lib`: copies the design tokens verbatim, and
// concatenates tokens + the plain stylesheet into one drop-in file, so a
// consumer who wants the whole look imports one path
// (`search-builder/styles.css`) while one who wants only the palette
// (`search-builder/tokens.css`) can re-theme without the plain CSS at all.
import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const path = (...parts) => join(root, ...parts)

mkdirSync(path('dist-lib'), { recursive: true })

const tokensPath = path('src/styles/tokens.css')
const plainPath = path('src/styles/filtered-search.css')

copyFileSync(tokensPath, path('dist-lib/tokens.css'))

const tokens = readFileSync(tokensPath, 'utf8')
const plain = readFileSync(plainPath, 'utf8')
writeFileSync(path('dist-lib/styles.css'), `${tokens}\n${plain}`)

console.log('styles: dist-lib/tokens.css, dist-lib/styles.css')
