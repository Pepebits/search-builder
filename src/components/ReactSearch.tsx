/**
 * The same search bar as `HeadlessSearch.vue`, in React, over the plain
 * stylesheet instead of no stylesheet at all: different framework, same
 * `src/styles/filtered-search.css` contract. The class hooks below
 * (`fs-combo`, `fs-icon`, `fs-key`, `fs-field`, `fs-actions`, `fs-check`,
 * `fs-sym`, `fs-dot`, `fs-av`, `fs-name`, `fs-sub`, `fs-hint-x`,
 * `fs-group-name`) are what that stylesheet's "bar's own decoration"
 * section targets — everything else comes from the `data-fs`/`aria-*`
 * attributes the prop getters already set, same as the headless demo.
 */
import type { CSSProperties } from 'react'
import { toneHue } from '../core/index.ts'
import type { FilterDef, IndexedOption, Token } from '../core/index.ts'
import { useSearchBuilder } from '../react/index.ts'
// The proof this component needs no Tailwind and no Vue: the same design
// tokens and the same plain stylesheet the unstyled Vue demo leaves unused.
import '../styles/tokens.css'
import '../styles/filtered-search.css'

export interface ReactSearchProps {
  filters: FilterDef[]
  label?: string
  resultCount?: number | null
  tokens: Token[]
  onTokensChange: (tokens: Token[]) => void
  onSubmit?: (tokens: Token[]) => void
  onAnnounce?: (text: string) => void
}

/** A person's tinted initials need `--fs-tone-h`, which CSSType does not know about. */
type ToneStyle = CSSProperties & { '--fs-tone-h'?: number }

/** The glyph (or none) leading an option row: an operator's symbol, a label's
 * dot, a real avatar, or tinted initials — in that order, same as the
 * styled Vue bar. */
function OptionLead ({ option }: { option: IndexedOption }) {
  if (option.kind === 'operator') return <span className="fs-sym" aria-hidden="true">{option.symbol}</span>
  if (option.color) return <span className="fs-dot" style={{ background: option.color }} aria-hidden="true" />
  if (option.avatar) return <img className="fs-av" src={option.avatar} alt="" />
  if (option.initials) {
    return (
      <span className="fs-av" style={{ '--fs-tone-h': toneHue(option.tone ?? option.payload) } as ToneStyle} aria-hidden="true">
        {option.initials}
      </span>
    )
  }
  return null
}

export function ReactSearch ({
  filters, label = 'Search or filter results', resultCount = null,
  tokens, onTokensChange, onSubmit, onAnnounce
}: ReactSearchProps) {
  const s = useSearchBuilder({ filters, tokens, onTokensChange, label, resultCount, onSubmit, onAnnounce })

  return (
    <section {...s.getRootProps()}>
      <label {...s.getLabelProps()}>{label}</label>

      <div className="fs-combo">
        <div {...s.getFieldsetProps()}>
          <svg
            className="fs-icon" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"
            fill="none" stroke="currentColor" strokeWidth="1.7"
          >
            <circle cx="7" cy="7" r="4.4" />
            <path d="M10.4 10.4 14 14" strokeLinecap="round" />
          </svg>

          <ol {...s.getTokenListProps()}>
            {tokens.map((token) => (
              <li {...s.getTokenProps(token)} key={token.id}>
                {token.type !== 'text'
                  ? (
                    <>
                      <span className="fs-key">{s.tokenLabel(token)}</span>
                      {s.hasOperatorChoice(token)
                        ? <button {...s.getOperatorProps(token)}>{s.chipOperator(token)}</button>
                        : <span data-fs="operator" aria-hidden="true">{s.chipOperator(token)}</span>}
                      <button {...s.getValueProps(token)}>{s.chipValues(token)}</button>
                    </>
                    )
                  : <span>{token.value}</span>}
                <button {...s.getRemoveProps(token)}>&times;</button>
              </li>
            ))}
          </ol>

          <div className="fs-field">
            <input {...s.getInputProps()} />
          </div>

          <div className="fs-actions">
            {s.canApply && <button {...s.getApplyProps()}>Apply</button>}
            <button {...s.getSubmitProps()}>Search</button>
          </div>
        </div>

        <div {...s.getListboxProps()}>
          {s.indexedGroups.map((group) => (
            <div {...s.getGroupProps(group)} key={group.id}>
              <b className="fs-group-name" aria-hidden="true">{group.label}</b>
              {group.options.map((option) => (
                <span {...s.getOptionProps(option)} key={option.id}>
                  <OptionLead option={option} />
                  <span className="fs-name">{option.label}</span>
                  {option.sub && <span className="fs-sub">{option.sub}</span>}
                  {option.hint && <span className="fs-hint-x">{option.hint}</span>}
                  {s.isMultiSelect && (
                    <span className="fs-check" aria-hidden="true">{s.isChosen(option) ? '✓' : ''}</span>
                  )}
                </span>
              ))}
            </div>
          ))}
          {s.status && <p {...s.getStatusRowProps()}>{s.status.text}</p>}
        </div>
      </div>

      <p {...s.getHintProps()}>Arrow keys browse, Enter selects, Escape steps back.</p>
      <p {...s.getAppliedProps()}>{s.appliedSummary}</p>
      <p {...s.getLiveRegionProps()}>{s.announcement}</p>
    </section>
  )
}
