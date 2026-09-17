# ADR-0006 — One package, subpath exports (supersedes the multi-package part of 0003/0004)

Status: accepted, 2026-09-17. Supersedes the multi-package layout in ADR-0003 (consequences) and
ADR-0004 (Phase 4).

## Context

ADR-0003 and ADR-0004 planned five npm packages (core, vue, react, apiable, styles). The apiable
bridge (`tokensToUrl`, `urlToTokens`, `requestParams`, `schemaFor`) is about a hundred lines whose
only reason to be separate was isolating the `flex-url` dependency. An optional peer dependency
plus a subpath export isolates it just as well, with one version number and no workspaces.

## Decision

Publish a single package, `search-builder`, with these entry points:

| Import | Contents | Peer dependency |
| --- | --- | --- |
| `search-builder` | the framework-agnostic core | none |
| `search-builder/vue` | the Vue adapter | `vue` (optional) |
| `search-builder/react` | the React adapter | `react` (optional) |
| `search-builder/apiable` | tokens ↔ flex-url, `schemaFor` | `flex-url` (optional) |
| `search-builder/styles.css` | design tokens + plain stylesheet | none |

The entries compose: Vue + apiable is `/vue` plus `/apiable`; the apiable entry is pure functions
over tokens and knows nothing about any framework. Framework-specific conveniences that need
both (e.g. a `useApiableUrl` composable) live in the framework entry and import `/apiable`.

All peers are declared in `peerDependenciesMeta` as optional. Each entry has its own `d.ts`.

## Consequences

- Phase 4 drops npm workspaces; the `src/<role>/` folders map one-to-one to entry points, so the
  Phase 1–3 layout is unchanged.
- Consumers who never import `/apiable` never install `flex-url`; same for `/vue` and `/react`.
- One changelog, one version. A breaking change in any entry bumps the whole package.
