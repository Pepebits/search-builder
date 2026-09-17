# ADR-0004 — Repository layout: folders now, workspaces later

Status: accepted, 2026-09-16.

## Context

The end state is several npm packages (core, vue, react, apiable, styles). Setting up
workspaces before the core exists would multiply the churn of Phase 1 (paths, Vite configs,
test bundles) for no benefit while everything is still one app.

## Decision

Phase 1–3 layout, single package, folders by role:

```
src/
  core/          framework-agnostic behaviour + ARIA (TypeScript, no imports from outside core)
    index.ts     public entry: createFilteredSearch, prop getters, types, toneHue
    state.ts     state shape, initial state, transitions
    derive.ts    groups, flatOptions, status, placeholder, spoken names
    props.ts     prop getters as pure functions of state
    announce.ts  live-region sequencing
    connect.ts   DOM lifecycle (document pointerdown capture, focus, scrollIntoView)
  vue/
    index.ts     useFilteredSearch(options) — same public API as the composable today
    normalize.ts core prop dialect -> Vue attrs/handlers
  react/         Phase 2
  apiable/       Phase 3 (flex-url helpers, moved from src/lib/)
  styles/        unchanged (tokens.css, filtered-search.css, tailwind.css)
  components/    the two demo consumers (unchanged, import path updated)
  data/          demo data (unchanged)
  App.vue, main.js, headless-entry.js   demo (unchanged)
tests/
  core.mjs       new: unit tests against src/core, no DOM
  url.mjs, interaction.mjs, browser.mjs, headless.mjs   unchanged
docs/
  plan/ adr/ handoff/   this material
```

`src/composables/` is removed in Phase 1; its three importers switch to `src/vue`.

Phase 4 (as amended by ADR-0006) maps each `src/<role>/` folder to an entry point of one package
(`search-builder`, `/vue`, `/react`, `/apiable`, `/styles.css`); no workspaces. The
folder split above is what makes that mapping one line per entry.

## Consequences

- Phase 1 touches import paths in three demo files and nothing in the Vite configs.
- The "no imports from outside `src/core`" rule is what makes the Phase 4 split trivial; the
  review enforces it.
