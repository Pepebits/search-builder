// Part of `npm run build:lib`, run right after the declaration-only `tsc`
// step. The sources import each other with explicit `.ts` extensions on
// purpose (ADR-0002: Node's native type-stripping needs them so
// `tests/core.mjs` can run `src/core/index.ts` directly, with no build
// step) — but `tsc` copies that specifier verbatim into the emitted
// `.d.ts` re-exports, and a `.ts` extension is not something a consumer's
// module resolution (bundler/node16/nodenext) knows how to follow: there is
// no `.ts` file next to the shipped `.d.ts`, only its sibling `.d.ts`
// itself. Rewriting `./store.ts` -> `./store.js` fixes that the standard
// way: those resolvers already know a relative `.js` specifier can resolve
// to a co-located `.d.ts` file.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const typesDir = join(root, 'dist-lib', 'types')

function walk (dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry.endsWith('.d.ts')) out.push(full)
  }
  return out
}

const specifier = /((?:from|import)\s*\(?\s*['"])(\.[^'"]+?)\.ts(['"])/g

let changed = 0
for (const file of walk(typesDir)) {
  const text = readFileSync(file, 'utf8')
  const next = text.replace(specifier, '$1$2.js$3')
  if (next !== text) {
    writeFileSync(file, next)
    changed++
  }
}
console.log(`fix-dts-extensions: rewrote .ts -> .js in ${changed} declaration file(s)`)
