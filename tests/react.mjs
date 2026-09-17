// The React proof: a parametrised copy of tests/headless.mjs against the
// React build instead of the Vue one. Same ARIA contract, same assertions
// (renumbered with an R prefix), plus a few React-specific ones at the end.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../.tmp/react-build/app.js', import.meta.url), 'utf8')

let pass = 0, fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`)
}

const browser = await chromium.launch()
async function fresh () {
  const page = await browser.newPage({ viewport: { width: 900, height: 800 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script>${app}<\/script></body></html>`)
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
        controlsResolves: !!document.getElementById(input.getAttribute('aria-controls')),
        describedResolves: input.getAttribute('aria-describedby').split(' ').every((id) => !!document.getElementById(id)),
        activeResolves: (() => {
          const a = input.getAttribute('aria-activedescendant')
          return a ? !!document.getElementById(a) : 'none'
        })(),
        groups: [...box.querySelectorAll('[role=group]')].map((g) => g.getAttribute('aria-label')),
        options: [...box.querySelectorAll('[role=option]')].map((o) => o.textContent.trim()),
        multi: box.getAttribute('aria-multiselectable'),
        busy: box.getAttribute('aria-busy'),
        landmark: document.querySelector('[role=search]')?.getAttribute('aria-label'),
        chips: [...document.querySelectorAll('[role=listitem]')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()),
        live: document.querySelector('[role=status]')?.textContent.trim(),
        applied: document.querySelector('[role=combobox]').getAttribute('aria-describedby').split(' ')
          .map((id) => document.getElementById(id).textContent.trim()).join(' | '),
        focusIsInput: document.activeElement === input,
        results: document.querySelectorAll('#results li').length,
        query: input.value
      }
    }),
    clickOption: async (text) => {
      await page.locator('[role=option]', { hasText: text }).first().click()
      await page.waitForTimeout(140)
    }
  }
}

// --- the ARIA contract holds with the React tree instead of the Vue one ---
{
  const t = await fresh()
  const s = await t.state()
  check('R1. the landmark is named', s.landmark, 'Search issues')
  check('R2. aria-controls resolves while closed', s.controlsResolves, true)
  check('R3. aria-describedby resolves', s.describedResolves, true)
  check('R4. no activedescendant while closed', s.activeResolves, 'none')
  check('R5. the applied summary is in the description', s.applied.includes('2 filters applied'), true)
  check('R6. chips render as list items', s.chips.length, 2)
  check('R7. results reflect the seeded filters', s.results, 6)
  check('R8. no console errors', t.errors, [])
  await t.page.close()
}

// --- the whole flow works with the mouse ---
{
  const t = await fresh()
  await t.page.click('[role=combobox]'); await t.settle()
  check('R9. clicking opens', (await t.state()).open, true)
  check('R10. activedescendant resolves when open', (await t.state()).activeResolves, true)
  await t.clickOption('Milestone')
  check('R11. it advances to the operators, still open', (await t.state()).listbox, 'Operators for Milestone')
  await t.clickOption('is any of')
  let s = await t.state()
  check('R12. the multi operator marks the listbox', s.multi, 'true')
  check('R13. values are grouped', s.groups, ['Milestone'])
  await t.clickOption('v4.2')
  check('R14. the list stays open to keep choosing', (await t.state()).open, true)
  await t.page.locator('button', { hasText: 'Apply' }).click(); await t.settle()
  s = await t.state()
  check('R15. Apply commits a chip', s.chips.length, 3)
  check('R16. focus never left the input', s.focusIsInput, true)
  check('R17. the change was announced with a count', /Filter added, Milestone is any of v4\.2\. \d+ results\./.test(s.live), true)
  await t.page.close()
}

// --- the keyboard contract, including a controlled input ---
{
  const t = await fresh()
  await t.page.focus('[role=combobox]')
  check('R18. focusing alone does not open', (await t.state()).open, false)
  await t.page.keyboard.press('ArrowDown'); await t.settle()
  check('R19. ArrowDown opens', (await t.state()).open, true)
  await t.page.keyboard.type('assign'); await t.settle()
  // R20 is the controlled-input proof: onInput -> onChange is what lets a
  // keystroke reach `state.query` at all. A broken mapping either freezes
  // the field or leaves React complaining about a value with no onChange
  // (caught separately by R33's error check).
  check('R20. typing reaches the controlled input', (await t.state()).query, 'assign')
  await t.page.keyboard.press('Enter'); await t.settle()   // Assignee
  await t.page.keyboard.press('Enter'); await t.page.waitForTimeout(60)   // its first operator
  check('R21. an async filter reports busy', (await t.state()).busy, 'true')
  await t.page.waitForTimeout(500)
  check('R22. then the values arrive', (await t.state()).groups, ['Any or none', 'Assignee'])
  await t.page.keyboard.press('Escape'); await t.settle()
  check('R23. Escape unwinds one stage', (await t.state()).listbox, 'Operators for Assignee')
  await t.page.keyboard.press('Escape'); await t.settle()
  check('R24. and again, back to the filters', (await t.state()).listbox, 'Filters')
  await t.page.keyboard.press('Backspace'); await t.settle()
  check('R25. Backspace removes the last chip', (await t.state()).chips.length, 1)
  await t.page.close()
}

// --- editing a chip part ---
{
  const t = await fresh()
  const operator = t.page.locator('[data-token][data-edit=operator]').first()
  check('R26. the operator part is named',
    await operator.getAttribute('aria-label'), 'Change operator for Label, currently is any of')
  await operator.focus()
  await t.page.keyboard.press('Space'); await t.settle()
  check('R27. Space opens just the operators', (await t.state()).listbox, 'Operators for Label')
  await t.page.keyboard.press('Escape'); await t.settle()
  check('R28. Escape puts focus back on the part',
    await t.page.evaluate(() => document.activeElement.getAttribute('data-edit')), 'operator')
  const value = t.page.locator('[data-token][data-edit=value]').first()
  await value.focus(); await t.page.keyboard.press('Space'); await t.settle()
  check('R29. and the value part opens the values', (await t.state()).listbox, 'Values for Status')
  await t.clickOption('Closed')
  check('R30. committed in place', (await t.state()).chips[0].includes('Closed'), true)
  await t.page.close()
}

// --- a pointer down outside still closes it ---
{
  const t = await fresh()
  await t.page.click('[role=combobox]'); await t.settle()
  await t.page.locator('#results li').first().click(); await t.settle()
  check('R31. clicking outside closes the list', (await t.state()).open, false)
  check('R32. aria-expanded follows', (await t.state()).expanded, 'false')
  check('R33. no console errors', t.errors, [])
  await t.page.close()
}

// --- Tab auto-confirms a multi-value draft exactly once ---
{
  const t = await fresh()
  await t.page.click('[role=combobox]'); await t.settle()
  await t.clickOption('Type')
  await t.clickOption('is any of')
  await t.clickOption('Bug')
  await t.page.keyboard.press('Tab')
  await t.settle()
  const s = await t.state()
  check('R34. Tab commits the draft once (not twice)', s.chips.length, 3)
  check('R35. and only one of them mentions Type', s.chips.filter((c) => c.includes('Type')).length, 1)
  await t.page.close()
}

// --- an external token replacement from the host empties the chips ---
{
  const t = await fresh()
  await t.page.evaluate(() => window.__setTokens([]))
  await t.settle()
  const s = await t.state()
  check('R36. an external setTokens call empties the chips', s.chips.length, 0)
  // The chips are rendered from the host's own `tokens` prop, so R36 alone
  // would still pass if the store never heard about the replacement. The
  // applied summary is derived from `state.tokens` inside the core, so this
  // is the assertion that the controlled effect really reached it.
  check('R37. and the core knows: the applied summary is derived from state.tokens',
    s.applied.includes('No filters applied.'), true)
  check('R38. no console errors after an external update', t.errors, [])
  await t.page.close()
}

// --- an inline `filters` array must not drive an endless render loop ---
// `setOptions` always commits and every commit re-renders, so an effect keyed
// on array identity alone would loop until React throws "Maximum update depth
// exceeded" — which surfaces here as a page error, not a failed assertion.
{
  const t = await fresh()
  await t.page.evaluate(() => window.__mountInlineFilters())
  await t.page.waitForTimeout(600)
  check('R39. the inline-filters instance settles instead of looping',
    await t.page.evaluate(() => !!document.querySelector('#inline-probe [role=combobox]')), true)
  check('R40. no console errors from the inline-filters instance', t.errors, [])
  await t.page.close()
}

await browser.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
