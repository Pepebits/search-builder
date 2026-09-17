// The core speaks one dialect (React-cased handlers already, see ADR-0005
// §5); what is left for React is the handful of attributes DOM prop getters
// spell in HTML terms but JSX wants in its own casing. `onKeyDown`,
// `onClick`, `onMouseDown`, `onMouseMove`, `onPointerDown` already match and
// need no entry here. `onFocusOut` becomes `onBlur`: React's `onBlur` bubbles
// (unlike the native event), so it is the focusout equivalent the root
// getter was written against.
const RENAME: Record<string, string> = {
  onInput: 'onChange',
  onFocusOut: 'onBlur',
  for: 'htmlFor',
  spellcheck: 'spellCheck',
  autocomplete: 'autoComplete'
}

export function normalizeProps (props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key in props) {
    out[RENAME[key] ?? key] = props[key]
  }
  return out
}
