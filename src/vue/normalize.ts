// The core speaks one dialect (React-cased handlers, see ADR-0005 §5); Vue
// wants its own casing for `v-bind` to wire listeners up correctly. This is
// the only place that translates between the two.
const RENAME: Record<string, string> = {
  onKeyDown: 'onKeydown',
  onFocusOut: 'onFocusout',
  onMouseDown: 'onMousedown',
  onMouseMove: 'onMousemove',
  onPointerDown: 'onPointerdown'
}

export function normalizeProps (props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key in props) {
    out[RENAME[key] ?? key] = props[key]
  }
  return out
}
