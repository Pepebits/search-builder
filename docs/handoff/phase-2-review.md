# Hand-off — Phase 2 review: React adapter + demo site

For: the reviewing agent (Opus 5). Code only; the implementer's summary is withheld. Read
`docs/adr/0005-state-and-props-contract.md` (§3–§5), `docs/handoff/phase-2-implementation.md`,
then `src/react/`, `src/components/ReactSearch.tsx`, `src/react-entry.tsx`, the three HTML pages,
`vite.config.js`, `vite.react.config.mjs`, `tests/react.mjs`, `package.json`, `tsconfig.json`.
For "what it must match": `src/vue/index.ts` is the reference adapter and `tests/headless.mjs`
the reference contract.

## Run first

```
npm run typecheck
npm test
BASE_PATH=/search-builder/ npm run build && ls dist
```

Report counts per suite; confirm `dist/` contains the three pages and that their asset URLs
carry the base path.

## Priority list

1. **Frozen surfaces.** `src/core/**`, `src/vue/**`, `src/styles/**` and the five pre-existing
   test files must be unchanged. Any diff there is finding #1 unless it is a justified core bug
   fix written up in the report you cannot see — in which case flag it as unverified.
2. **React correctness.**
   - Store created exactly once (`useState(() => …)` or equivalent), including under
     `StrictMode` double-invocation; connect/disconnect symmetrical under StrictMode's
     mount–unmount–mount.
   - `useSyncExternalStore` snapshot identity: `getState` must return the same reference until
     a commit, or React re-renders forever. Check `setAnnouncement`'s new-object-per-write does
     not cause a render loop.
   - Effects that call `setOptions`: one per option, deps correct, no effect that runs every
     render (an inline `filters` array from the consumer would then commit on every render —
     acceptable, but must not loop).
   - Token sync both ways with no loop; external replacement reaches the core (the test with
     `window.__setTokens` covers it — verify the test actually asserts it).
   - `schedule`: does the callback run after React's commit? Trace `restoreEditFocus` after
     Escape on an edit and `focusInput` after removing a chip; both are DOM-visible in the suite.
3. **Prop normalisation coverage.** Enumerate every handler and attribute the core emits
   (`src/core/props.ts`) and confirm `src/react/normalize.ts` maps each; a controlled `value`
   without `onChange` is a React warning that `errors` must catch — confirm the suite asserts
   `errors` empty and that a production build does not hide the warning you care about.
4. **Plain-CSS contract.** `ReactSearch.tsx` must use the stylesheet's class hooks as they are;
   look for any style added to the component to compensate for a missing hook — that is the
   stylesheet's bug or the markup's, not something to paper over.
5. **Demo site.** Three pages, shared nav with relative links, `base` from `BASE_PATH`, no
   absolute `/src/...` links left in HTML that would break under the base path.
6. **Types.** No `any` in the public surface of `src/react/index.ts`; the return type is
   explicit or inferred cleanly; `tsc` covers the `.tsx` files.
7. **Tests.** `tests/react.mjs` mirrors `tests/headless.mjs` assertion for assertion (diff them),
   plus the four additions in the implementation hand-off. Add a failing test for any drift.
8. **Simplifications** before Phase 3, one sentence each, not applied.

## Do not

- Do not refactor; fix only to make a suite green or remove a frozen-surface violation, and say
  exactly what you changed. Do not touch `docs/**`.

## Report format

Findings first, most severe first, with file:line and how you verified. Suite counts after your
changes. Simplification list. One-line verdict: ready for Phase 3 or not, and why.
