# ADR-0002 — The core and the adapters are written in TypeScript

Status: accepted, 2026-09-16.

## Context

The code is JavaScript with JSDoc. For a package consumed by third parties, the types of
`FilterDef`, `Operator`, `Value`, `Token`, the options and the returned API are part of the
product, and `flex-url` 3 already exports typed schemas (`EndpointSchema`) the apiable helpers
can lean on. Phase 1 rewrites the composable anyway; converting later would mean touching the
same lines twice.

## Decision

- `src/core/`, `src/vue/`, `src/react/` and `src/apiable/` are `.ts`. Vue SFCs that need types
  use `<script setup lang="ts">`. Demo data (`src/data/*.js`) may stay JavaScript in Phase 1.
- `tsconfig.json` with `strict: true`, `verbatimModuleSyntax: true`, `isolatedModules: true`,
  `moduleResolution: "bundler"`, `noEmit: true`. Type-checking via `vue-tsc --noEmit`
  (`npm run typecheck`), so `.vue` files are covered too.
- **Erasable syntax only** in `src/core/` (no `enum`, no parameter properties, no namespaces,
  `import type` for types). Node 24 strips types natively, so `tests/core.mjs` can import
  `../src/core/index.ts` directly and run without a build step.
- Public types are exported from `src/core/index.ts`: `FilterDef`, `Operator`, `Value`, `Token`,
  `TextToken`, `FilterToken`, `Stage`, `Option`, `OptionGroup`, `FilteredSearchOptions`,
  `FilteredSearchState`, `FilteredSearchStore`, `PropGetters`.

## Consequences

- `typescript` and `vue-tsc` join `devDependencies`. Vite already handles `.ts` and
  `lang="ts"`; no bundler change.
- Consumers get `.d.ts` in Phase 4 from the same sources.
- The test files stay `.mjs`; they exercise the DOM and do not need types.
