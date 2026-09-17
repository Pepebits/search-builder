# ADR-0001 — A framework-agnostic core with thin adapters

Status: accepted, 2026-09-16.

## Context

The filtered search is a Vue composable. The goal is a package usable from Vue, React and
other frameworks. Three ways to get there were considered:

1. **Reimplement per framework** (Headless UI's approach): one codebase per framework, kept in
   sync by hand.
2. **Build on a portable reactivity layer** (`@vue/reactivity` standalone, or signals): one
   codebase, but every adapter inherits that layer as a dependency and React integration is
   awkward.
3. **Framework-agnostic core + adapters** (TanStack Table/Form, Zag/Ark): the core is a plain
   store with `getState` / `subscribe` / actions and pure prop getters; each adapter is a few
   dozen lines that bind the store to the framework's rendering.

## Decision

Option 3. The core lives in `src/core/`, has **zero runtime dependencies and no framework
imports**, and exposes:

```ts
createFilteredSearch(options): FilteredSearchStore
// store.getState(), store.subscribe(listener), store.setOptions(partial)
// store.actions.* (every action the composable returns today)
// store.connect(root: HTMLElement): () => void   (DOM lifecycle; see ADR-0005)
// getRootProps(state), getInputProps(state, api), ... (pure functions, see ADR-0005)
```

Adapters (`src/vue/`, later `src/react/`) subscribe to the store, re-render on change, call
`connect` on mount and `disconnect` on unmount, and normalise prop names for their framework.

## Consequences

- One behaviour implementation, one test suite for it (`tests/core.mjs`, no DOM), plus the
  DOM suites per adapter.
- The core can be unit-tested in Node with no DOM at all, which is not possible today.
- Adapters must handle two-way token sync and prop normalisation; both are specified in
  ADR-0005 so they are done the same way everywhere.
- Slightly more ceremony than a composable for the Vue-only user; hidden behind the adapter,
  whose public API stays what it is today.
