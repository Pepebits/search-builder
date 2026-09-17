# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/) — pre-1.0, so the public API can still move.

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
