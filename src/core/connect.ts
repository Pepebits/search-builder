// DOM lifecycle. The core never touches `document` or `window` at creation —
// only from here, and only once an adapter calls `connect(root)`.
export interface DomController {
  connect (root: HTMLElement, schedule?: (fn: () => void) => void): () => void
  focusInput (): void
  restoreEditFocus (id: string, part: 'operator' | 'value'): void
  scrollActiveIntoView (): void
}

export interface ConnectActions {
  confirmDraft (): boolean
  close (): void
}

/**
 * `actions` is read lazily (only when the pointerdown handler actually
 * fires), so the store can build this controller before its own `actions`
 * object exists and wire the two together afterwards.
 */
export function createDomController (actions: ConnectActions): DomController {
  let root: HTMLElement | null = null
  // Default schedule for a bare (non-Vue) consumer: the next microtask, which
  // runs after any DOM patch already queued in this turn. An adapter that has
  // its own "wait for render" primitive (Vue's `nextTick`) should pass it in.
  let schedule: (fn: () => void) => void = (fn) => queueMicrotask(fn)

  // A pointer down outside confirms a multi-value draft and closes the list.
  // Capture phase, deliberately: in the bubble phase this runs after an
  // option's own handler, by which point the clicked node has been
  // re-rendered away and contains() reports "outside".
  const onPointerDownCapture = (event: Event) => {
    if (!root || root.contains(event.target as Node | null)) return
    actions.confirmDraft()
    actions.close()
  }

  // Resolved fresh from `root` on every use (ADR-0005 §4), never cached: a
  // consumer that re-renders its input (or its listbox) must not get a
  // detached node focused or measured.
  const input = (): HTMLElement | null => root?.querySelector('[data-fs="input"]') ?? null
  const listbox = (): HTMLElement | null => root?.querySelector('[data-fs="listbox"]') ?? null

  return {
    connect (rootEl, scheduleFn) {
      root = rootEl
      if (scheduleFn) schedule = scheduleFn
      document.addEventListener('pointerdown', onPointerDownCapture, true)
      return () => {
        document.removeEventListener('pointerdown', onPointerDownCapture, true)
        root = null
      }
    },
    // Synchronous when the element exists: several buttons remove themselves
    // as a result of being pressed (Clear all, the discard ×), and deferring
    // the focus to the next tick loses it to the vanishing button.
    focusInput () {
      if (!root) return
      const el = input()
      if (el) { el.focus(); return }
      schedule(() => { input()?.focus() })
    },
    restoreEditFocus (id, part) {
      if (!root) return
      const scope = root
      schedule(() => { scope.querySelector<HTMLElement>(`[data-token="${id}"][data-edit="${part}"]`)?.focus() })
    },
    scrollActiveIntoView () {
      if (!root) return
      schedule(() => {
        const active = listbox()?.querySelector('[data-active="true"]') as (Element & { scrollIntoView?: (arg: ScrollIntoViewOptions) => void }) | null
        // Guarded: jsdom and other test environments do not implement it.
        active?.scrollIntoView?.({ block: 'nearest' })
      })
    }
  }
}
