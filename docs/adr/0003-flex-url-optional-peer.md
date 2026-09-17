# ADR-0003 — `flex-url` is an optional peer dependency

Status: accepted, 2026-09-16.

## Context

`flex-url` builds and parses the Laravel Apiable query grammar. In this repo it is used only by
`src/lib/apiable.js` (`tokensToUrl`, `urlToTokens`, `requestUri`). The composable never imports
it. A consumer whose API is not apiable has no use for it, and a headless component must not
drag in a URL library.

## Decision

- `package.json`: `flex-url` moves from `dependencies` to `peerDependencies` (`^3.1.0`) with
  `peerDependenciesMeta: { "flex-url": { "optional": true } }`, and is added to
  `devDependencies` so the demo and `tests/url.mjs` keep working.
- The apiable helpers move to `src/apiable/` (Phase 3; Phase 1 may leave them in `src/lib/`)
  and are the **only** module allowed to import `flex-url`. A lint-level guard is acceptable
  later; for now the review checks it.
- In Phase 4 the helpers become the `/apiable` entry point of the single package (ADR-0006),
  the only entry that imports `flex-url`, declared as an optional peer dependency.

## Consequences

- Installing the core or an adapter never installs `flex-url`.
- The token shape stays wire-neutral: `operator` is a string the consumer maps to their API.
  The apiable package is one such mapping, kept as the reference.
- `tests/url.mjs` continues to run against the helpers with the dev-installed `flex-url`.
