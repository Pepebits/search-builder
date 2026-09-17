# Hand-off — Phase 1 review

For: the reviewing agent (Opus 5). You review the **code**, not the implementer's summary; you
will not be shown it. Read `docs/adr/0005-state-and-props-contract.md` first, then
`docs/handoff/phase-1-implementation.md` for the acceptance criteria, then the code under
`src/core/` and `src/vue/`, then the consumers `src/components/FilteredSearch.vue` and
`src/components/HeadlessSearch.vue`.

Reference for "what it did before": there is no git history. The previous composable is
described in `docs/headless-filtered-search.md` (sections 6, 7 and 15 quote its keydown,
outside-click and focus rules verbatim) and its observable behaviour is pinned by the four DOM
test suites.

## Run first

```
npm run typecheck
npm test
```

Report the counts per suite. A red suite is finding #1.

## What to look for, in priority order

1. **Behaviour drift.** Anything a user or a screen reader would notice: a changed attribute,
   id, announcement, focus target, open/close decision. Cross-check ADR-0005 §2 rules against
   `commit`: order, and that rules 1–3 mutate `next` before it is stored rather than
   re-entering `commit`. Check the fetch sequence guard against a stale response. Check that
   `focusInput` is synchronous when the element exists. Check `onPointerDownCapture` is
   registered with `capture: true` and calls `confirmDraft` before closing.
2. **Boundary violations.** `grep -rn "from 'vue'" src/core`, `grep -rn "flex-url" src/core
   src/vue`, any `document`/`window` access at store creation time rather than inside
   `connect`, any `data`/demo import inside `src/core`.
3. **Two-way token sync.** Trace the Vue adapter: model → `setTokens` → commit → `onTokensChange`
   → emit → model. Is there a loop? Is the same-reference no-op in place? Does an external
   replacement of the model (e.g. `Clear all` from the demo, URL restore) reach the core?
4. **Prop dialect and normalisation.** Core getters: React casing, no `ref`. Vue `normalizeProps`
   maps every handler the core emits; a handler that is not mapped is a silent no-op in Vue, so
   list the core's handler names and confirm each is covered. `hidden: false` must not render.
5. **Memoisation and identity.** Rule 2 compares flat option ids across commits; check that the
   comparison is on ids, not object identity, and that it does not reset `activeIndex` on
   commits that leave the list unchanged (e.g. `move`).
6. **Types.** `strict` violations papered over with `as` or `!`; `any` in the public surface;
   erasable-only syntax in `src/core` (no `enum`, no parameter properties) — verify
   `node tests/core.mjs` runs without a build.
7. **Tests.** Were any of the four DOM suites changed beyond an import path? Does
   `tests/core.mjs` cover the list in the implementation hand-off? Add a failing test for any
   drift you find rather than describing it only.
8. **Simplifications** you would make before Phase 2, with a sentence each. Do not apply them.

## Do not

- Do not refactor. Fix only what is required to make a suite green or to remove a boundary
  violation, and say exactly what you changed.
- Do not touch `docs/**`.

## Report format

Findings first, most severe first, each with file:line, what happens, and how you verified
it (a failing test, a grep, a trace). Then the suite counts after your changes. Then the
simplification list. Then a one-line verdict: ready for Phase 2, or not, and why.
