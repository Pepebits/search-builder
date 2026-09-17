// Drives the built app in a real browser. jsdom cannot catch pointer and focus
// behaviour — it does not run a microtask checkpoint between event listeners,
// which is exactly where the mouse-selection bug lived.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../.tmp/test-build/app.js', import.meta.url), 'utf8')
const css = readFileSync(new URL('../.tmp/test-build/search-builder.css', import.meta.url), 'utf8')

let pass = 0, fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`)
}

/** Click with one retry on a shorter timeout; see the note in the option helper. */
async function clickWithRetry (locator) {
  try { await locator.click({ timeout: 10000 }) } catch { await locator.click({ timeout: 20000 }) }
}

const browser = await chromium.launch()

async function fresh () {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="app"></div><script>${app}<\/script></body></html>`)
  await page.waitForSelector('[role=combobox]')
  const settle = () => page.waitForTimeout(140)
  return {
    page, errors, settle,
    state: () => page.evaluate(() => {
      const box = document.querySelector('[role=listbox]')
      const input = document.querySelector('[role=combobox]')
      return {
        open: !box.hasAttribute('hidden'),
        expanded: input.getAttribute('aria-expanded'),
        listbox: box.getAttribute('aria-label'),
        multi: box.getAttribute('aria-multiselectable'),
        options: [...box.querySelectorAll('[role=option]')].map((o) => o.textContent.replace(/\s+/g, ' ').trim()),
        chosen: [...box.querySelectorAll('[role=option][aria-selected=true]')].map((o) => o.textContent.replace(/\s+/g, ' ').trim()),
        pending: document.querySelector("[data-fs='token'][data-pending]")?.textContent.replace(/\s+/g, ' ').trim() ?? null,
        chips: [...document.querySelectorAll('[role=listitem]')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()),
        results: document.querySelector('.res-head')?.textContent.replace(/\s+/g, ' ').trim(),
        focusIsInput: document.activeElement === input,
        live: document.querySelector('[role=status]')?.textContent.trim()
      }
    }),
    clickOption: async (text) => {
      // Two attempts: under CPU load the actionability check ("stable") can time
      // out once even though the option is there; a retry is cheaper than a red release.
      await clickWithRetry(page.locator('[role=option]', { hasText: text }).first())
      await page.waitForTimeout(140)
    },
    clickAction: async (text) => {
      await clickWithRetry(page.locator("[data-fs='apply'], [data-fs='clear'], [data-fs='submit']", { hasText: text }).first())
      await page.waitForTimeout(140)
    }
  }
}

// ---- the reported bug: chaining the three stages with the mouse ----
{
  const t = await fresh()
  await t.page.click('[role=combobox]'); await t.settle()
  check('M1. clicking the field opens the list', (await t.state()).open, true)

  await t.clickOption('Milestone')
  let s = await t.state()
  check('M2. clicking a filter keeps the list open', s.open, true)
  check('M3. it advances to the operators', s.listbox, 'Operators for Milestone')
  check('M4. the pending chip shows the choice', s.pending, 'Milestone…×')
  check('M5. focus never leaves the input', s.focusIsInput, true)

  await t.clickOption('is any of')
  s = await t.state()
  check('M6. clicking an operator keeps the list open', s.open, true)
  check('M7. it advances to the values', s.listbox, 'Values for Milestone')
  check('M8. multi-value operator marks the listbox', s.multi, 'true')

  await t.clickOption('v4.2')
  s = await t.state()
  check('M9. the value is chosen, not committed', s.chosen, ['v4.2✓'])
  check('M10. the list stays open for the next value', s.open, true)
  await t.clickOption('v4.3')
  check('M11. a second value toggles on', (await t.state()).chosen.length, 2)

  await t.clickAction('Apply')
  s = await t.state()
  check('M12. Apply commits one chip', s.chips.some((c) => c.includes('v4.2, v4.3')), true)
  check('M13. the pending chip is gone', s.pending, null)
  check('M14. back to the filter list, still open', s.listbox, 'Filters')
  check('M15. no console errors', t.errors, [])
  await t.page.close()
}

// ---- single-value path with the mouse ----
{
  const t = await fresh()
  await t.page.click('[role=combobox]'); await t.settle()
  await t.clickOption('Confidential')
  check('N1. a one-operator filter skips to the values', (await t.state()).listbox, 'Values for Confidential')
  await t.clickOption('Yes')
  const s = await t.state()
  check('N2. the chip is committed', s.chips.some((c) => c.includes('Confidential')), true)
  check('N3. the list reopens on the filter list', [s.open, s.listbox], [true, 'Filters'])
  check('N4. results narrowed', s.results, '1 issue3 filters applied')
  await t.page.close()
}

// ---- closing rules ----
{
  const t = await fresh()
  await t.page.click('[role=combobox]'); await t.settle()
  await t.clickAction('Search')
  check('O1. Search closes the list', (await t.state()).open, false)

  await t.page.click('[role=combobox]'); await t.settle()
  await t.page.click('#issue-sort'); await t.settle()
  check('O2. the sort control closes it', (await t.state()).open, false)
  await t.page.keyboard.press('Escape')

  // The open list covers the first rows, so click a heading — the point is that
  // an element which takes no focus still closes the list.
  await t.page.click('[role=combobox]'); await t.settle()
  await t.page.locator('h1').click(); await t.settle()
  check('O3. clicking unfocusable page furniture closes it', (await t.state()).open, false)
  await t.page.close()
}

// ---- refocus must not reopen ----
{
  const t = await fresh()
  await t.page.locator('[aria-label^="Remove filter"]').first().click(); await t.settle()
  let s = await t.state()
  check('P1. the chip is removed', s.chips.length, 1)
  check('P2. removing a chip does not open the list', s.open, false)
  check('P3. focus returns to the input', s.focusIsInput, true)

  await t.clickAction('Clear all')
  s = await t.state()
  check('P4. Clear all empties the bar', s.chips, [])
  check('P5. Clear all reopens on purpose', s.open, true)
  await t.page.close()
}

// ---- discarding a half-built filter with the mouse ----
{
  const t = await fresh()
  await t.page.click('[role=combobox]'); await t.settle()
  await t.clickOption('Assignee')
  await t.page.waitForTimeout(500)
  check('Q1. async values arrive', (await t.state()).listbox, 'Operators for Assignee')
  await t.page.locator("[data-fs='token'][data-pending] [data-fs='discard']").click(); await t.settle()
  const s = await t.state()
  check('Q2. discard clears the pending chip', s.pending, null)
  check('Q3. the list stays open to pick again', s.open, true)
  await t.page.close()
}

// ---- keyboard still works end to end ----
{
  const t = await fresh()
  // Chips come before the field in reading order, so Tab reaches their remove
  // buttons first — the same order a pointer user sees.
  await t.page.keyboard.press('Tab')
  check('R1. Tab lands on the first editable part of the first chip',
    await t.page.evaluate(() => document.activeElement.getAttribute('aria-label')),
    'Change value for Status, currently Open')
  check('R2. tabbing in does not open the list', (await t.state()).open, false)

  await t.page.focus('[role=combobox]')
  check('R3. focusing the field does not open it either', (await t.state()).open, false)
  await t.page.keyboard.press('ArrowDown'); await t.settle()
  check('R4. ArrowDown opens', (await t.state()).open, true)
  await t.page.keyboard.type('label'); await t.settle()
  await t.page.keyboard.press('Enter'); await t.settle()
  check('R5. Enter picks the filter', (await t.state()).listbox, 'Operators for Label')
  await t.page.keyboard.press('Escape'); await t.settle()
  check('R6. Escape steps back to the filters', (await t.state()).listbox, 'Filters')
  await t.page.keyboard.press('Backspace'); await t.settle()
  check('R7. Backspace removes the last chip', (await t.state()).chips.length, 1)
  check('R8. no console errors', t.errors, [])
  await t.page.close()
}

// ---- changing only the operator is one step ----
{
  const t = await fresh()
  // Build a single-value chip through the UI: Milestone is v4.2.
  await t.page.click('[role=combobox]'); await t.settle()
  await t.clickOption('Milestone')
  await t.clickOption('is')
  await t.clickOption('v4.2')
  let s = await t.state()
  check('S1. the chip is there', s.chips[2].includes('v4.2'), true)

  const operatorButton = t.page.locator('[data-token][data-edit=operator]').last()
  check('S2. the operator is its own button, named for what it changes',
    await operatorButton.getAttribute('aria-label'),
    'Change operator for Milestone, currently is')

  await operatorButton.focus()
  await t.page.keyboard.press('Space'); await t.settle()
  s = await t.state()
  check('S3. Space opens only the operators', [s.open, s.listbox], [true, 'Operators for Milestone'])

  await t.clickOption('is any of')
  s = await t.state()
  check('S4. picking one commits there and then — no value step', s.listbox, 'Filters')
  check('S5. the value it already had is untouched', s.chips[2].includes('v4.2'), true)
  check('S6. still three chips, same position', s.chips.length, 3)
  check('S7. announced as an update', s.live.startsWith('Filter updated, Milestone is any of v4.2'), true)
  check('S8. no console errors', t.errors, [])
  await t.page.close()
}

// ---- the value stage opens only when the value genuinely cannot carry ----
{
  const t = await fresh()
  // The seeded Label chip holds two values under "is any of".
  await t.page.locator('[data-token][data-edit=operator]').first().focus()
  await t.page.keyboard.press('Space'); await t.settle()
  check('T1. the Label chip opens on its operators', (await t.state()).listbox, 'Operators for Label')
  await t.clickOption('is')
  check('T2. two values cannot become one, so it asks', (await t.state()).listbox, 'Values for Label')
  await t.clickOption('regression')
  const s = await t.state()
  check('T3. the answer commits the chip', s.chips[1].includes('regression'), true)
  check('T4. and drops the value that could not carry', s.chips[1].includes('a11y,'), false)
  check('T5. still two chips', s.chips.length, 2)
  await t.page.close()
}

// ---- the value is its own button ----
{
  const t = await fresh()
  const valueButton = t.page.locator('[data-token][data-edit=value]').nth(1)
  check('U1. named for what it changes',
    await valueButton.getAttribute('aria-label'),
    'Change value for Label, currently a11y and regression')
  await valueButton.focus()
  await t.page.keyboard.press('Space'); await t.settle()
  let s = await t.state()
  check('U2. Space opens the values, not the operators', s.listbox, 'Values for Label')
  check('U3. what it already holds is ticked', s.chosen.length, 2)
  await t.clickOption('needs-review')
  await t.clickAction('Apply')
  s = await t.state()
  check('U4. the chip is updated in place', s.chips[1].includes('needs-review'), true)
  check('U5. operator untouched', s.chips.length, 2)
  await t.page.close()
}

// ---- cancelling returns focus to the part you started from ----
{
  const t = await fresh()
  const before = (await t.state()).chips
  await t.page.locator('[data-token][data-edit=value]').nth(1).focus()
  await t.page.keyboard.press('Space'); await t.settle()
  await t.page.keyboard.press('Escape'); await t.settle()
  const s = await t.state()
  check('V1. the chip is untouched', s.chips, before)
  check('V2. focus is back on the value button, not the operator',
    await t.page.evaluate(() => document.activeElement.getAttribute('data-edit')), 'value')
  await t.page.close()
}

// ---- a filter with one operator offers no operator button ----
{
  const t = await fresh()
  check('W1. the Status chip has no operator button',
    await t.page.locator('[data-token][data-edit=operator]').count(), 1)
  check('W2. but its value is still editable',
    await t.page.locator('[data-token][data-edit=value]').first().getAttribute('aria-label'),
    'Change value for Status, currently Open')
  await t.page.locator('[data-token][data-edit=value]').first().focus()
  await t.page.keyboard.press('Space'); await t.settle()
  check('W3. Space opens its values', (await t.state()).listbox, 'Values for Status')
  await t.clickOption('Closed')
  const s = await t.state()
  check('W4. committed in place', s.chips[0].includes('Closed'), true)
  check('W5. no console errors', t.errors, [])
  await t.page.close()
}

// ---- auto-confirm: a real Tab, a real click outside ----
{
  const t = await fresh()
  await t.page.click('[role=combobox]'); await t.settle()
  await t.clickOption('Milestone')
  await t.clickOption('is any of')
  await t.clickOption('v4.2')
  check('X1. one value ticked, nothing committed', (await t.state()).chips.length, 2)
  // Tab fires keydown and then the focusout it causes: one commit, not two.
  await t.page.keyboard.press('Tab'); await t.settle()
  let s = await t.state()
  check('X2. Tab commits the draft', s.chips.some((c) => c.includes('v4.2')), true)
  check('X3. exactly one new chip', s.chips.length, 3)
  check('X4. the list is closed', s.open, false)
  check('X5. focus moved on', s.focusIsInput, false)

  await t.page.click('[role=combobox]'); await t.settle()
  await t.clickOption('Label')
  await t.clickOption('is any of')
  await t.clickOption('needs-review')
  await t.page.locator('h1').click(); await t.settle()
  s = await t.state()
  check('X6. clicking outside commits the draft', s.chips.some((c) => c.includes('needs-review')), true)
  check('X7. and closes the list', s.open, false)

  await t.page.click('[role=combobox]'); await t.settle()
  await t.clickOption('Confidential')
  check('X8. a single-value stage has nothing to confirm', (await t.state()).pending, 'Confidential=…×')
  await t.page.keyboard.press('Tab'); await t.settle()
  s = await t.state()
  check('X9. Tab leaves an empty draft alone', [s.chips.length, s.pending], [4, 'Confidential=…×'])
  check('X10. no console errors', t.errors, [])
  await t.page.close()
}
{
  const t = await fresh()
  await t.page.click('[role=combobox]'); await t.settle()
  await t.clickOption('Milestone')
  await t.clickOption('is any of')
  await t.clickOption('v4.2')
  await t.page.keyboard.type('v4'); await t.settle()
  await t.page.keyboard.press('ArrowRight'); await t.settle()
  check('Y1. ArrowRight while typing does not commit', (await t.state()).chips.length, 2)
  await t.page.keyboard.press('Backspace'); await t.page.keyboard.press('Backspace'); await t.settle()
  await t.page.keyboard.press('ArrowRight'); await t.settle()
  const s = await t.state()
  check('Y2. ArrowRight on an empty field commits', s.chips.some((c) => c.includes('v4.2')), true)
  check('Y3. focus stays in the input', s.focusIsInput, true)
  check('Y4. back on the filter list', s.listbox, 'Filters')
  await t.page.close()
}

// ---- restyled chips: negation colours the operator cell only ----
{
  const t = await fresh()
  // No operator in the demo data is negated, so force the attribute directly
  // on the second chip (Label) to exercise the styling.
  await t.page.evaluate(() => document.querySelectorAll('[data-fs=token]')[1].setAttribute('data-negated', 'true'))
  await t.page.waitForTimeout(50)

  const styles = await t.page.evaluate(() => {
    const read = (chip) => {
      const key = chip.querySelector(':scope > span:first-child')
      const op = chip.querySelector('[data-fs=operator]')
      const remove = chip.querySelector('[data-fs=remove]')
      const cs = (el) => el && getComputedStyle(el)
      const chipCs = cs(chip), keyCs = cs(key), opCs = cs(op), removeCs = cs(remove)
      return {
        chipBorderTopColor: chipCs.borderTopColor,
        keyBg: keyCs?.backgroundColor,
        keyColor: keyCs?.color,
        opBg: opCs?.backgroundColor,
        opColor: opCs?.color,
        opBorderRightWidth: opCs?.borderRightWidth,
        opBorderRightStyle: opCs?.borderRightStyle,
        opBorderRightColor: opCs?.borderRightColor,
        opFontWeight: opCs?.fontWeight,
        removeBorderLeftColor: removeCs?.borderLeftColor
      }
    }
    const chips = document.querySelectorAll('[data-fs=token]')
    return { neutral: read(chips[0]), negated: read(chips[1]) }
  })

  check('Z1a. neutral chip operator has a 1px solid right border',
    [styles.neutral.opBorderRightWidth, styles.neutral.opBorderRightStyle], ['1px', 'solid'])
  check('Z1b. negated chip operator has a 1px solid right border',
    [styles.negated.opBorderRightWidth, styles.negated.opBorderRightStyle], ['1px', 'solid'])
  check('Z2. the negated chip outer border colour equals the neutral chip',
    styles.negated.chipBorderTopColor, styles.neutral.chipBorderTopColor)
  check('Z3. the negated key background and colour equal the neutral key',
    [styles.negated.keyBg, styles.negated.keyColor], [styles.neutral.keyBg, styles.neutral.keyColor])
  check('Z4a. the negated operator background differs from the neutral operator',
    styles.negated.opBg !== styles.neutral.opBg, true)
  check('Z4b. the negated operator colour differs from the neutral operator',
    styles.negated.opColor !== styles.neutral.opColor, true)
  check('Z5. the negated operator is bold (font-weight >= 600)',
    parseInt(styles.negated.opFontWeight, 10) >= 600, true)
  check('Z6. the negated chip remove-button left border equals the neutral chip',
    styles.negated.removeBorderLeftColor, styles.neutral.removeBorderLeftColor)
  check('Z7. no console errors', t.errors, [])
  await t.page.close()
}

// ---- the pending chip's operator gets a dashed right border too ----
{
  const t = await fresh()
  await t.page.click('[role=combobox]'); await t.settle()
  await t.clickOption('Milestone')
  await t.clickOption('is any of')
  const opBorderStyle = await t.page.evaluate(() => {
    const op = document.querySelector("[data-fs='token'][data-pending] [data-fs='operator']")
    return op && getComputedStyle(op).borderRightStyle
  })
  check('Z8. the pending chip operator has a dashed right border', opBorderStyle, 'dashed')
  await t.page.close()
}

// ---- the person picker: handle beside the name, tinted avatars, trailing check ----
{
  const t = await fresh()
  await t.page.click('[role=combobox]'); await t.settle()
  await t.clickOption('Assignee')
  await t.clickOption('is any of')
  await t.page.waitForTimeout(500)
  const rows = await t.page.evaluate(() => {
    const box = document.querySelector('[role=listbox]')
    const bar = document.querySelector("[data-fs='bar']")
    return {
      listWidth: box.getBoundingClientRect().width,
      barWidth: bar.getBoundingClientRect().width,
      people: [...box.querySelectorAll('[role=option]')].map((o) => {
        // A person row is avatar, name, handle, check — in that order.
        const kids = [...o.children]
        const [avatar, name, sub] = kids
        const check = kids[kids.length - 1]
        const cs = getComputedStyle(avatar)
        return {
          avatarSize: cs.width,
          avatarBg: cs.backgroundColor,
          subFollowsName: name?.nextElementSibling === sub,
          subFlushRight: sub ? o.getBoundingClientRect().right - sub.getBoundingClientRect().right < 40 : null,
          checkIsLast: check.textContent.trim() === '' || check.textContent.trim() === '✓',
          checkAtRight: o.getBoundingClientRect().right - check.getBoundingClientRect().right < 20
        }
      })
    }
  })
  check('AA1. the list is a menu, narrower than the bar', rows.listWidth <= 520 && rows.listWidth < rows.barWidth, true)
  check('AA2. avatars are 22px', rows.people.every((p) => p.avatarSize === '22px'), true)
  // Me is the current user, Nadia, and is tinted like her on purpose; the other four all differ.
  check('AA3. Me shares the current user\'s tint and everyone else differs',
    [rows.people[0].avatarBg === rows.people[1].avatarBg, new Set(rows.people.slice(1).map((p) => p.avatarBg)).size],
    [true, rows.people.length - 1])
  check('AA4. the handle sits right after the name', rows.people.every((p) => p.subFollowsName), true)
  check('AA5. the handle is not pushed to the far edge', rows.people.every((p) => p.subFlushRight === false), true)
  check('AA6. the check is the last, right-aligned cell', rows.people.every((p) => p.checkIsLast && p.checkAtRight), true)
  await t.clickOption('Rin Tanaka')
  check('AA7. the chosen row reads name, handle, check', (await t.state()).chosen, ['RTRin Tanaka@rin.tanaka✓'])
  check('AA8. no console errors', t.errors, [])
  await t.page.close()
}

// ---- negation for real: Title does not contain, typed with the mouse and keyboard ----
{
  const t = await fresh()
  await t.page.click('[role=combobox]'); await t.settle()
  await t.clickOption('Title')
  await t.clickOption('does not contain')
  await t.page.keyboard.type('focus'); await t.settle()
  await t.page.keyboard.press('Enter'); await t.settle()
  const s = await t.page.evaluate(() => {
    const chip = [...document.querySelectorAll("[data-fs='token']")].find((c) => c.textContent.includes('focus'))
    const neutral = document.querySelector("[data-fs='token']")
    const op = (c) => getComputedStyle(c.querySelector("[data-fs='operator']"))
    return {
      negated: chip.getAttribute('data-negated'),
      symbol: chip.querySelector("[data-fs='operator']").textContent.trim(),
      tinted: op(chip).backgroundColor !== op(neutral).backgroundColor,
      keyNeutral: getComputedStyle(chip.firstElementChild).backgroundColor === getComputedStyle(neutral.firstElementChild).backgroundColor,
      wire: document.querySelector('.compiled code')?.textContent ?? ''
    }
  })
  check('AB1. the chip is negated', s.negated, 'true')
  check('AB2. and shows !~', s.symbol, '!~')
  check('AB3. only the operator cell is tinted', [s.tinted, s.keyNeutral], [true, true])
  check('AB4. flex-url 3 puts not_like on the wire', s.wire.includes('filter[title][not_like]=focus'), true)
  check('AB5. no console errors', t.errors, [])
  await t.page.close()
}

// ---- the debug panel's copy buttons, with a real clipboard ----
{
  const t = await fresh()
  // `setContent` renders on about:blank, which is not a secure context, so the
  // page has no `navigator.clipboard`. Stand one in to exercise the success path;
  // the jsdom suite covers the fallback.
  await t.page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text) => { window.__copied = text; return Promise.resolve() } }
    })
  })
  await t.page.locator('[data-debug-tab=tokens]').click(); await t.settle()
  await t.page.locator("[data-debug='tokens'] [data-debug-copy]").click(); await t.settle()
  const s = await t.page.evaluate(() => ({
    clipboard: window.__copied,
    label: document.querySelector("[data-debug='tokens'] [data-debug-copy]").textContent.trim(),
    status: document.querySelector('.debug-vh')?.textContent
  }))
  check('AC1. the panel text lands on the clipboard', s.clipboard.includes('"seed-1"') && s.clipboard.includes('"seed-2"'), true)
  check('AC2. the button confirms', s.label, 'Copied')
  check('AC3. and the live region says so', s.status, 'Tokens copied to the clipboard.')
  await t.page.waitForTimeout(2200)
  check('AC4. the confirmation clears', await t.page.locator("[data-debug='tokens'] [data-debug-copy]").textContent(), 'Copy')
  check('AC5. no console errors', t.errors, [])
  await t.page.close()
}

await browser.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
