# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/) — pre-1.0, so the public API can still move.

## [0.2.0] — 2026-09-17

### Added

- Placeholder rows while an async filter loads, in both demos and the plain stylesheet
  (`data-fs="skeleton"`), so the list keeps its shape until the values land.
- `matchSegments(text, query)` in the core: a label split around the part that matched what was
  typed. Both demos wrap that part in a `data-fs="hit"` span; the plain stylesheet emphasises it.

### Changed

- Special values come in two kinds. Wildcards (`special: true`, None / Any) behave as before;
  pinned values (`pinned: true`, Me) lead the main group even before an async list returns, are
  allowed under multi-value operators, and carry across an operator change. Typing now matches a
  value's `sub` (its @handle) as well as its label, and a `tone` seed lets an avatar take another
  identity's tint.

## [0.1.1] — 2026-09-17

### Fixed

- A value picked from a fetched list (an assignee, say) kept its label, avatar and initials after
  the token was committed. Chips, the applied summary and the live region used to fall back to
  the raw value once the fetched list was discarded, and "Recently used" could not offer it again
  until a new fetch returned it.

### Changed

- The React test build is a development build under `<StrictMode>`, so React's own warnings and
  its double-invoked effects now run under the suite.

## [0.1.0] — 2026-09-17

First published release.

### Added

- `@pepebits/search-builder` — the framework-agnostic core: a `createSearchBuilder` store, derived-data and
  prop-getter functions, and the `FilterDef`/`Operator`/`Value`/`Token` types.
- `@pepebits/search-builder/vue` — a `useSearchBuilder` composable adapter (`vue` optional peer).
- `@pepebits/search-builder/react` — a `useSearchBuilder` hook adapter (`react`/`react-dom` optional peers).
- `@pepebits/search-builder/apiable` — `createApiable`, mapping tokens to and from a `flex-url` query string
  (`flex-url` optional peer), plus the `EndpointSchema` a backend would publish.
- `@pepebits/search-builder/styles.css` and `@pepebits/search-builder/tokens.css` — the plain stylesheet and the
  `--fs-*` design tokens, for a project not using Tailwind.
- Type declarations for every entry, built from the TypeScript sources.
