# Plan — from a Vue composable to a framework-agnostic headless package

**Name:** `search-builder` — *Headless tools for building advanced search experiences.*
Repo https://github.com/Pepebits/search-builder; npm package `@pepebits/search-builder` (published
0.1.0 on 2026-09-17). The unscoped name is an npm placeholder left by a package unpublished in 2021
and cannot be reused by another account; `searchbuilder` is blocked as too similar.

Status: approved 2026-09-16. Owner: Daniel. Decisions are recorded as ADRs in `docs/adr/`;
each phase has a hand-off in `docs/handoff/`.

## Goal

Ship the filtered search as a "raw UI" package in the Headless UI / Radix / Ark sense: the
behaviour and the ARIA contract, with no markup and no styling of its own, usable from Vue,
React and anything else that can spread attributes onto elements. `flex-url` becomes an
optional peer dependency — it is the apiable URL boundary, not part of the component.

## What we already have

- A single Vue composable, `src/composables/useFilteredSearch.js` (~900 lines), that owns the
  behaviour, the ARIA and the live region, and hands back prop getters.
- Two consumers proving the getters carry everything: the styled bar
  (`src/components/FilteredSearch.vue`, Tailwind) and the unstyled one
  (`src/components/HeadlessSearch.vue`, no stylesheet).
- Four test suites (`tests/url.mjs`, `tests/interaction.mjs` in jsdom, `tests/browser.mjs` and
  `tests/headless.mjs` in Chromium). Three of them drive the DOM, not Vue, so they double as
  the regression net for any adapter.
- `flex-url` used in exactly one file, `src/lib/apiable.js`.

## Phases

| Phase | Deliverable | Gate |
| --- | --- | --- |
| 0 | `flex-url` as optional peer dependency; `typescript` + `vue-tsc` tooling; `tsconfig.json`; `npm run typecheck` | `npm test` green, typecheck green |
| 1 | TypeScript core (`src/core/`) with no framework imports; Vue adapter (`src/vue/`) exposing the **same public API** the composable has today; the old composable path removed and imports updated; `tests/core.mjs` unit suite without DOM | all five suites green; the two demos unchanged in behaviour |
| 2 | React adapter (`src/react/`) + a React demo styled with the plain stylesheet, a Playwright suite driving it (parametrised copy of `tests/headless.mjs`), and the demo site as a Vite multi-page build (styled Vue, headless Vue, React) deployable to GitHub Pages | React suite green with the same assertions as the Vue headless suite; `npm run build` produces the three pages |
| 3 | Folded into Phase 4 (2026-09-17): the apiable bridge becomes `src/apiable/index.ts`, a factory with no demo data; the consumer README replaces the docs restructure for now | — |
| 4 | Packaging as `@pepebits/search-builder` 0.1.0: library build (`dist-lib`) with `d.ts`, entry points per ADR-0006, rename to `SearchBuilder`/`useSearchBuilder`/`createSearchBuilder`, consumer README, CHANGELOG, `ci.yml` + `release.yml` (trusted publishing) | `npm test` includes `test:pack`: the tarball installs and runs in a scratch Vue app and a scratch React app, types resolve |

Phase 1 is the one that decides everything else. Phases 2–4 are mechanical once the core exists.

## Phase 1 in one paragraph

Extract every piece of the composable that is not Vue into `src/core/`: the state shape, the
transitions (stage changes, commit, step back, toggle, edit), the derived data (groups, flat
options, status, placeholder, spoken names), the announcements, the async value fetch, and the
prop getters as pure functions of state. The Vue reactivity (`ref`, `computed`, `watch`) is
replaced by an immutable state object, a `subscribe` function and one `commit` that runs the
post-transition rules the `watch`es used to run. The DOM work (document `pointerdown` in the
capture phase, focus, `scrollIntoView`) moves into a `connect(root)` lifecycle the adapter calls
on mount. The Vue adapter is then a thin composable over the store that keeps today's return
shape, so `FilteredSearch.vue` and `HeadlessSearch.vue` only change their import path.

## Out of scope for now

- Changing behaviour. Every observable behaviour, announcement string, attribute and id format
  stays as it is; the tests are the specification.
- Publishing to npm. Phase 4.
- Server-side rendering guarantees. Phase 1 accepts an optional `id` in options so SSR is
  *possible*; making it *tested* is later.

## Risks

- **The `watch` semantics.** Vue batches and orders watchers in a specific way; the core has to
  reproduce the observable result, not the mechanism. ADR-0005 spells out the rules.
- **Two-way tokens.** `v-model` today; the core must own tokens internally and notify, and the
  adapter must sync both ways without loops. ADR-0005.
- **Event name normalisation.** Vue wants `onKeydown`, React `onKeyDown`. Decided in ADR-0005;
  the core speaks one dialect and each adapter normalises.
- **Scope creep during extraction.** The hand-off forbids behaviour changes; the review checks
  for them.

## Working agreement

- Implementation by a Sonnet 5 agent following `docs/handoff/phase-1-implementation.md`.
- Review by an Opus 5 agent following `docs/handoff/phase-1-review.md`, on the code alone,
  without the implementer's summary.
- Daniel merges. Nothing is committed by agents (the repo is not under git yet).
