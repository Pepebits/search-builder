import { JSDOM, VirtualConsole } from 'jsdom'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../.tmp/test-build/app.js', import.meta.url), 'utf8')
const css = readFileSync(new URL('../.tmp/test-build/search-builder.css', import.meta.url), 'utf8')

let pass = 0, fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`)
}

async function fresh () {
  const errors = []
  const vc = new VirtualConsole()
  vc.on('jsdomError', (e) => errors.push(String(e.stack || e.message)))
  vc.on('error', (...a) => errors.push(a.join(' ')))
  const dom = new JSDOM(
    `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="app"></div><script>${app}<\/script></body></html>`,
    {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole: vc,
      // jsdom does not put TextDecoder/TextEncoder on the window; flex-url uses
      // them for its UTF-8 decoding contract. Every real browser has them.
      beforeParse (window) {
        window.TextDecoder = TextDecoder
        window.TextEncoder = TextEncoder
      }
    })
  const { window } = dom
  await new Promise((r) => setTimeout(r, 300))
  const d = window.document
  const input = d.querySelector('[role=combobox]')
  const box = () => d.querySelector('[role=listbox]')
  return {
    dom, window, d, input, errors,
    open: () => !box().hasAttribute('hidden'),
    expanded: () => input.getAttribute('aria-expanded'),
    busy: () => box().getAttribute('aria-busy'),
    multi: () => box().getAttribute('aria-multiselectable'),
    controlsResolves: () => !!d.getElementById(input.getAttribute('aria-controls')),
    describedResolves: () => input.getAttribute('aria-describedby').split(' ').every((id) => !!d.getElementById(id)),
    activeResolves: () => { const a = input.getAttribute('aria-activedescendant'); return a ? !!d.getElementById(a) : 'none' },
    groups: () => [...box().querySelectorAll('[role=group]')].map((g) => g.getAttribute('aria-label')),
    opts: () => [...box().querySelectorAll('[role=option]')].map((o) => o.textContent.replace(/\s+/g, ' ').trim()),
    chips: () => [...d.querySelectorAll('[role=listitem]')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()),
    chipNames: () => [...d.querySelectorAll('[aria-label^=\"Remove filter\"]')].map((b) => b.getAttribute('aria-label')),
    partNames: (part) =>
      [...d.querySelectorAll(`[data-edit="${part}"]`)].map((b) => b.getAttribute('aria-label')),
    pending: () => d.querySelector("[data-fs='token'][data-pending]")?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    count: () => d.querySelector('.res-head')?.textContent.replace(/\s+/g, ' ').trim(),
    live: () => d.querySelector('[role=status]')?.textContent.trim(),
    applied: () => d.querySelector("[data-fs='applied']")?.textContent.trim(),
    btn: (text) => [...d.querySelectorAll("[data-fs='apply'], [data-fs='clear'], [data-fs='submit']")].find((b) => b.textContent.trim().startsWith(text)),
    key: (k) => input.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })),
    type: (t) => { input.value = t; input.dispatchEvent(new window.Event('input', { bubbles: true })) },
    clickInput: () => input.dispatchEvent(new window.MouseEvent('click', { bubbles: true })),
    // Real pointers fire pointerdown before mousedown; the outside-click check
    // listens for pointerdown, so the tests have to send it too.
    down: (el) => {
      el.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
      el.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    },
    click: (el) => {
      el.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
      el.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    },
    tick: (ms = 60) => new Promise((r) => setTimeout(r, ms))
  }
}

{
  const t = await fresh()
  check('A1. mounts', !!t.input, true)
  check('A2. aria-controls resolves while closed', t.controlsResolves(), true)
  check('A3. aria-describedby resolves', t.describedResolves(), true)
  check('A4. no activedescendant while closed', t.activeResolves(), 'none')
  check('A5. seeded chips', t.chips().length, 2)
  check('A6. chip names spell the operator', t.chipNames()[1], 'Remove filter: Label is any of a11y and regression')
  // Status has one operator, so it offers no operator button — only Label does.
  check('A8. the operator is its own button', t.partNames('operator'),
    ['Change operator for Label, currently is any of'])
  check('A9. so is every value', t.partNames('value'),
    ['Change value for Status, currently Open', 'Change value for Label, currently a11y and regression'])
  check('A7. results filtered on load', t.count(), '6 issues2 filters applied')
  t.dom.window.close()
}
{
  const t = await fresh()
  t.clickInput(); await t.tick()
  check('B1. click opens', t.open(), true)
  check('B2. activedescendant resolves when open', t.activeResolves(), true)
  t.click(t.btn('Search')); await t.tick(120)
  check('B3. Search closes the list', t.open(), false)
  check('B4. aria-expanded false', t.expanded(), 'false')
  t.dom.window.close()
}
{
  const t = await fresh()
  t.clickInput(); t.type('hydration'); await t.tick()
  t.click(t.btn('Search')); await t.tick(150)
  check('C1. typed term becomes a chip', t.chips().some((c) => c.includes('hydration')), true)
  check('C2. list closed', t.open(), false)
  t.dom.window.close()
}
{
  const t = await fresh()
  t.clickInput(); await t.tick()
  t.down(t.d.getElementById('issue-sort')); await t.tick()
  check('D1. the sort control closes the list', t.open(), false)
  t.clickInput(); await t.tick()
  t.down(t.d.querySelector('.issue-body h3')); await t.tick()
  check('D2. a result row closes the list', t.open(), false)
  t.dom.window.close()
}
{
  const t = await fresh()
  t.click(t.d.querySelector('[aria-label^="Remove filter"]')); await t.tick(150)
  check('E1. chip removed', t.chips().length, 1)
  check('E2. does not reopen the list', t.open(), false)
  check('E3. announced with the count', /Filter removed, Status is Open\. \d+ results\./.test(t.live()), true)
  t.dom.window.close()
}
{
  const t = await fresh()
  t.click(t.btn('Clear all')); await t.tick(150)
  check('F1. chips gone', t.chips(), [])
  check('F2. Clear all reopens', t.open(), true)
  check('F3. all issues back', t.count(), '12 issues')
  check('F4. applied summary updated', t.applied(), 'No filters applied.')
  t.dom.window.close()
}
{
  const t = await fresh()
  check('G1. starts closed', t.open(), false)
  t.key('ArrowDown'); await t.tick()
  check('G2. ArrowDown opens', t.open(), true)
  t.key('Escape'); await t.tick()
  check('G3. Escape closes', t.open(), false)
  t.type('lab'); await t.tick()
  check('G4. typing reopens', t.open(), true)
  t.key('Tab'); await t.tick()
  check('G5. Tab closes', t.open(), false)
  t.dom.window.close()
}
{
  const t = await fresh()
  t.clickInput(); t.type('mile'); await t.tick()
  t.key('Enter'); await t.tick()
  check('H1. pending chip appears', t.pending()?.startsWith('Milestone'), true)
  t.key('ArrowDown'); t.key('Enter'); await t.tick()
  check('H2. multi operator turns on aria-multiselectable', t.multi(), 'true')
  t.key('Enter'); await t.tick(80)
  check('H3. value toggles, aria-selected marks chosen', t.opts().filter((o) => o.includes('v4.2')).length, 1)
  const apply = t.btn('Apply')
  check('H4. Apply appears', !!apply, true)
  check('H5. Apply is named in full', apply.getAttribute('aria-label'), 'Apply filter: Milestone is any of v4.2')
  t.click(apply); await t.tick(150)
  check('H6. chip committed', t.chips().some((c) => c.includes('v4.2')), true)
  check('H7. pending cleared', t.pending(), null)
  t.dom.window.close()
}
{
  const t = await fresh()
  t.clickInput(); t.type('assign'); await t.tick()
  t.key('Enter'); await t.tick()
  t.key('Enter'); await t.tick(20)
  check('I1. aria-busy while fetching', t.busy(), 'true')
  await t.tick(500)
  check('I2. busy clears', t.busy(), 'false')
  check('I3. grouped values arrived', t.groups(), ['Any or none', 'Assignee'])
  t.click(t.d.querySelector("[data-fs='token'][data-pending] [data-fs='discard']")); await t.tick(120)
  check('I4. discard clears the pending chip', t.pending(), null)
  check('I5. list stays open after discard', t.open(), true)
  t.dom.window.close()
}
{
  const t = await fresh()
  // In the filter stage a stray term is still offered as free text — that is correct.
  t.clickInput(); t.type('zzzz'); await t.tick(80)
  check('J0. free text is offered in the filter stage', t.opts(), ['Search for \u201Czzzz\u201D'])
  // The empty state belongs to the value stage.
  t.type('mile'); await t.tick()
  t.key('Enter'); await t.tick()
  t.key('Enter'); await t.tick()
  t.type('zzzz'); await t.tick(120)
  check('J1. empty state is not an option', t.opts(), [])
  check('J2. status row shown', t.d.querySelector("[data-fs='status']")?.textContent.trim(), 'No matches found')
  check('J3. no activedescendant on an empty list', t.activeResolves(), 'none')
  check('J4. announced', t.live(), 'No matches found.')
  t.dom.window.close()
}
{
  const t = await fresh()
  t.clickInput(); await t.tick()
  t.key('ArrowDown'); t.key('Enter'); await t.tick(400)
  t.key('Escape'); t.key('Escape'); t.key('Backspace'); await t.tick(150)
  check('K1. no console errors across a full run', t.errors, [])
  t.dom.window.close()
}
// ---- auto-confirm of a multi-value draft ----
// Reaches "Milestone is any of" with one value ticked, the state every case starts from.
async function multiDraft (t, ...values) {
  t.clickInput(); t.type('mile'); await t.tick()
  t.key('Enter'); await t.tick()                 // Milestone
  t.key('ArrowDown'); t.key('Enter'); await t.tick()   // is any of
  for (const v of values) {
    t.type(v); await t.tick()
    t.key('Enter'); await t.tick(80)             // toggle the highlighted match
  }
}
const outsideFocus = (t, el) =>
  t.input.dispatchEvent(new t.window.FocusEvent('focusout', { bubbles: true, relatedTarget: el }))
{
  const t = await fresh()
  await multiDraft(t, 'v4.2')
  check('L1. draft is pending before the gesture', t.pending(), 'Milestone=v4.2×')
  t.key('ArrowRight'); await t.tick(150)
  check('L2. ArrowRight on an empty field commits the draft', t.chips().some((c) => c.includes('v4.2')), true)
  check('L3. pending chip cleared', t.pending(), null)
  t.dom.window.close()
}
{
  const t = await fresh()
  await multiDraft(t, 'v4.2')
  t.type('v4'); await t.tick()
  t.key('ArrowRight'); await t.tick(150)
  check('L4. ArrowRight with text typed does not commit', t.chips().length, 2)
  check('L5. the draft keeps its values', t.pending(), 'Milestone=v4.2×')
  t.dom.window.close()
}
{
  const t = await fresh()
  await multiDraft(t, 'v4.2')
  t.key('Tab'); await t.tick(150)
  check('L6. Tab commits the draft', t.chips().some((c) => c.includes('v4.2')), true)
  check('L7. and closes the list', t.open(), false)
  t.dom.window.close()
}
{
  const t = await fresh()
  await multiDraft(t, 'v4.2')
  t.down(t.d.getElementById('issue-sort')); await t.tick(150)
  check('L8. pointer down outside commits the draft', t.chips().some((c) => c.includes('v4.2')), true)
  check('L9. and closes the list', t.open(), false)
  t.dom.window.close()
}
{
  const t = await fresh()
  await multiDraft(t, 'v4.2')
  outsideFocus(t, t.d.getElementById('issue-sort')); await t.tick(150)
  check('L10. focus leaving the bar commits the draft', t.chips().some((c) => c.includes('v4.2')), true)
  check('L11. and closes the list', t.open(), false)
  t.dom.window.close()
}
{
  const t = await fresh()
  await multiDraft(t)   // value stage reached, nothing ticked: canApply is false
  check('L12. nothing chosen yet', [t.pending(), !!t.btn('Apply')], ['Milestone=…×', false])
  t.key('ArrowRight'); t.key('Tab')
  t.down(t.d.getElementById('issue-sort'))
  outsideFocus(t, t.d.getElementById('issue-sort'))
  await t.tick(150)
  check('L13. no gesture commits an empty draft', t.chips().length, 2)
  check('L14. the draft is left in place', t.pending(), 'Milestone=…×')
  t.dom.window.close()
}
{
  const t = await fresh()
  await multiDraft(t, 'v4.2')
  // What a real Tab does: keydown on the input, then the focusout it causes.
  t.key('Tab')
  outsideFocus(t, t.btn('Search'))
  await t.tick(150)
  check('L15. Tab then focusout commits exactly once', t.chips().filter((c) => c.includes('v4.2')).length, 1)
  check('L16. three chips, no duplicate', t.chips().length, 3)
  check('L17. announced once as added', t.live().startsWith('Filter added, Milestone is any of v4.2'), true)
  check('L18. no console errors', t.errors, [])
  t.dom.window.close()
}
// ---- a free-value filter: type the text, choose contains or does not contain ----
{
  const t = await fresh()
  t.clickInput(); t.type('title'); await t.tick()
  t.key('Enter'); await t.tick()
  check('N1. Title now offers two operators', t.opts(), ['~containslike', '!~does not containnot_like'])
  t.key('Enter'); await t.tick()              // contains
  t.type('hydration'); await t.tick(80)
  check('N2. the typed text is offered as a value', t.opts(), ['Use “hydration”'])
  check('N3. so there is no empty state', t.d.querySelector("[data-fs='status']"), null)
  t.key('Enter'); await t.tick(150)
  check('N4. Enter commits the typed text', t.chips().some((c) => c.includes('hydration')), true)
  check('N5. announced in words', t.live().startsWith('Filter added, Title contains hydration'), true)
  t.dom.window.close()
}
{
  const t = await fresh()
  t.clickInput(); t.type('title'); await t.tick()
  t.key('Enter'); await t.tick()
  t.type('fo'); await t.tick(80)
  // Still on the operator stage: typing filters operators, not values.
  t.type(''); t.key('ArrowDown'); t.key('Enter'); await t.tick()   // does not contain
  t.type('fo'); await t.tick(80)
  check('N6. typed text comes first, matching suggestions after', t.opts(), ['Use “fo”', 'focus'])
  t.type('focus'); await t.tick(80)
  check('N7. an exact match is not offered twice', t.opts(), ['focus'])
  const before = t.count()
  t.key('Enter'); await t.tick(150)
  const chip = [...t.d.querySelectorAll("[data-fs='token']")].find((c) => c.textContent.includes('focus'))
  check('N8. the chip is marked as excluding', chip?.getAttribute('data-negated'), 'true')
  check('N9. the operator cell shows the negated symbol', chip?.querySelector("[data-fs='operator']")?.textContent.trim(), '!~')
  check('N10. results narrowed the other way', t.count() !== before, true)
  check('N11. no console errors', t.errors, [])
  t.dom.window.close()
}
// ---- the debug panel reflects what the bar exchanges ----
{
  const t = await fresh()
  const panel = (id) => t.d.querySelector(`[data-debug='${id}']`)
  const tab = (id) => t.d.querySelector(`[data-debug-tab='${id}']`)
  check('Q1. the schema tab is selected first', tab('schema').getAttribute('aria-selected'), 'true')
  check('Q2. it shows the backend contract with negation', panel('schema').textContent.includes('"not_like"'), true)
  check('Q3. other panels are hidden', panel('tokens').hasAttribute('hidden'), true)
  t.click(tab('tokens')); await t.tick()
  check('Q4. clicking a tab shows its panel', [tab('tokens').getAttribute('aria-selected'), panel('tokens').hasAttribute('hidden')], ['true', false])
  check('Q5. tokens show the seeded chips', panel('tokens').textContent.includes('"seed-2"'), true)
  t.click(t.d.querySelector('[aria-label^="Remove filter"]')); await t.tick(150)
  check('Q6. and follow the v-model', panel('tokens').textContent.includes('"seed-1"'), false)
  check('Q7. announcements are logged', panel('live').textContent.includes('Filter removed, Status is Open.'), true)
  check('Q8. core state is exposed', panel('state').textContent.includes('"stage": "filter"'), true)
  check('Q9. no console errors', t.errors, [])
  const copyButtons = [...t.d.querySelectorAll('[data-debug-copy]')]
  check('Q10. every panel has a copy button, named after it', copyButtons.map((b) => b.getAttribute('aria-label')),
    ['Copy backend schema', 'Copy filter definitions', 'Copy tokens', 'Copy request', 'Copy core state', 'Copy announcements'])
  // jsdom has no clipboard: the fallback selects the panel text and says so.
  t.click(panel('tokens').querySelector('[data-debug-copy]')); await t.tick(80)
  const selected = t.window.getSelection().toString()
  check('Q11. without a clipboard the text is selected for a manual copy', selected.includes('"seed-2"'), true)
  check('Q12. and the outcome is announced', t.d.querySelector('.debug-vh')?.textContent.startsWith('Could not copy. Tokens is selected'), true)
  t.dom.window.close()
}

// ---- an assignee keeps her name on the chip ----
{
  const t = await fresh()
  t.clickInput(); t.type('assign'); await t.tick()
  t.key('Enter'); await t.tick()
  t.key('Enter'); await t.tick(500)          // "is", then the fetch lands
  t.type('rin'); await t.tick(500)
  t.key('Enter'); await t.tick(150)
  const chip = t.chips().find((c) => c.includes('Assignee'))
  check('R1. the chip shows the label of a fetched value', chip?.includes('Rin Tanaka'), true)
  check('R2. the announcement agrees', t.live().startsWith('Filter added, Assignee is Rin Tanaka'), true)
  check('R3. and so does the applied summary', t.applied().includes('Assignee is Rin Tanaka'), true)
  t.dom.window.close()
}

// ---- the matched part of a label is marked ----
{
  const t = await fresh()
  t.clickInput(); t.type('mile'); await t.tick()
  const hits = [...t.d.querySelectorAll("[role=option] [data-fs='hit']")].map((h) => h.textContent)
  check('T1. the typed text is marked inside the matching option', hits, ['Mile'])
  check('T2. the free-text row is left alone', t.d.querySelector("[role=option][data-kind='text'] [data-fs='hit']"), null)
  t.type(''); await t.tick()
  check('T3. nothing is marked with an empty query', t.d.querySelectorAll("[data-fs='hit']").length, 0)
  t.dom.window.close()
}

// ---- skeleton rows while an async list loads ----
{
  const t = await fresh()
  t.clickInput(); t.type('assign'); await t.tick()
  t.key('Enter'); await t.tick()
  t.key('Enter'); await t.tick(20)
  check('U1. three placeholder rows while fetching', t.d.querySelectorAll("[data-fs='skeleton']").length, 3)
  check('U2. hidden from assistive tech', [...t.d.querySelectorAll("[data-fs='skeleton']")].every((el) => el.getAttribute('aria-hidden') === 'true'), true)
  check('U3. the status text is still in the row for the DOM', t.d.querySelector("[data-fs='status']").textContent.includes('Loading suggestions'), true)
  await t.tick(500)
  check('U4. gone once the list lands', t.d.querySelectorAll("[data-fs='skeleton']").length, 0)
  t.dom.window.close()
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
