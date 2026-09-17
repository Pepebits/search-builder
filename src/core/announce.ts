// Live-region sequencing. Per ADR-0005 §7: bump a sequence, clear the live
// text, and write on the next animation frame (or a microtask when
// `requestAnimationFrame` is missing, e.g. tests/core.mjs's plain Node).
import type { SearchBuilderOptions } from './types.ts'

export interface AnnounceOpts { count?: boolean }
export type Announce = (message: string, opts?: AnnounceOpts) => void
export type AnnounceSchedule = (fn: () => void) => void

/**
 * Checked per call, not cached at module load: a store created before some
 * later polyfill or environment swap (or simply a different store instance
 * under test) should not be stuck with whatever was true the first time any
 * announcer was built.
 */
export const defaultAnnounceSchedule: AnnounceSchedule = (fn) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn)
  else queueMicrotask(fn)
}

/**
 * `setAnnouncement` bypasses the commit/post-transition-rule pipeline on
 * purpose: it only ever touches `state.announcement`, which no rule reads,
 * so routing it through the full `commit` would risk a reentrant commit
 * (this fires from inside a rule that is itself still building the next
 * state) for no behavioural benefit.
 */
export function createAnnouncer (
  setAnnouncement: (text: string) => void,
  getOptions: () => SearchBuilderOptions,
  schedule: AnnounceSchedule = defaultAnnounceSchedule
): Announce {
  let seq = 0
  return function announce (message, { count = true } = {}) {
    const mySeq = ++seq
    setAnnouncement('')
    schedule(() => {
      if (mySeq !== seq) return
      // Read after the change, once the consumer has re-filtered.
      const options = getOptions()
      const total = options.resultCount
      const tail = count && total !== null && total !== undefined
        ? ` ${total} ${total === 1 ? 'result' : 'results'}.`
        : ''
      const text = message + tail
      setAnnouncement(text)
      options.onAnnounce?.(text)
    })
  }
}
