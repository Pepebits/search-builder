// The headless proof: different tags, no stylesheet, same accessibility.
// If an ARIA invariant lives in the styled markup rather than in the
// composable, it breaks here.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../.tmp/headless-build/app.js', import.meta.url), 'utf8')

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
        results: document.querySelectorAll('#results li').length
      }
    }),
    clickOption: async (text) => {
      // Two attempts: under CPU load the actionability check ("stable") can time
      // out once even though the option is there; a retry is cheaper than a red release.
      await clickWithRetry(page.locator('[role=option]', { hasText: text }).first())
      await page.waitForTimeout(140)
    }
  }
}

// --- the ARIA contract holds with none of the styled markup ---
{
  const t = await fresh()
  const s = await t.state()
  check('H1. the landmark is named', s.landmark, 'Search issues')
  check('H2. aria-controls resolves while closed', s.controlsResolves, true)
  check('H3. aria-describedby resolves', s.describedResolves, true)
  check('H4. no activedescendant while closed', s.activeResolves, 'none')
  check('H5. the applied summary is in the description', s.applied.includes('2 filters applied'), true)
  check('H6. chips render as list items', s.chips.length, 2)
  check('H7. results reflect the seeded filters', s.results, 6)
  check('H8. no console errors', t.errors, [])
  await t.page.close()
}

// --- the whole flow works with the mouse ---
{
  const t = await fresh()
  await t.page.click('[role=combobox]'); await t.settle()
  check('I1. clicking opens', (await t.state()).open, true)
  check('I2. activedescendant resolves when open', (await t.state()).activeResolves, true)
  await t.clickOption('Milestone')
  check('I3. it advances to the operators, still open', (await t.state()).listbox, 'Operators for Milestone')
  await t.clickOption('is any of')
  let s = await t.state()
  check('I4. the multi operator marks the listbox', s.multi, 'true')
  check('I5. values are grouped', s.groups, ['Milestone'])
  await t.clickOption('v4.2')
  check('I6. the list stays open to keep choosing', (await t.state()).open, true)
  await t.page.locator('button', { hasText: 'Apply' }).click(); await t.settle()
  s = await t.state()
  check('I7. Apply commits a chip', s.chips.length, 3)
  check('I8. focus never left the input', s.focusIsInput, true)
  check('I9. the change was announced with a count', /Filter added, Milestone is any of v4\.2\. \d+ results\./.test(s.live), true)
  await t.page.close()
}

// --- the keyboard contract ---
{
  const t = await fresh()
  await t.page.focus('[role=combobox]')
  check('J1. focusing alone does not open', (await t.state()).open, false)
  await t.page.keyboard.press('ArrowDown'); await t.settle()
  check('J2. ArrowDown opens', (await t.state()).open, true)
  await t.page.keyboard.type('assign'); await t.settle()
  await t.page.keyboard.press('Enter'); await t.settle()   // Assignee
  await t.page.keyboard.press('Enter'); await t.page.waitForTimeout(60)   // its first operator
  check('J3. an async filter reports busy', (await t.state()).busy, 'true')
  await t.page.waitForTimeout(500)
  check('J4. then the values arrive', (await t.state()).groups, ['Any or none', 'Assignee'])
  await t.page.keyboard.press('Escape'); await t.settle()
  check('J5. Escape unwinds one stage', (await t.state()).listbox, 'Operators for Assignee')
  await t.page.keyboard.press('Escape'); await t.settle()
  check('J6. and again, back to the filters', (await t.state()).listbox, 'Filters')
  await t.page.keyboard.press('Backspace'); await t.settle()
  check('J7. Backspace removes the last chip', (await t.state()).chips.length, 1)
  await t.page.close()
}

// --- editing a chip part, unstyled ---
{
  const t = await fresh()
  const operator = t.page.locator('[data-token][data-edit=operator]').first()
  check('K1. the operator part is named',
    await operator.getAttribute('aria-label'), 'Change operator for Label, currently is any of')
  await operator.focus()
  await t.page.keyboard.press('Space'); await t.settle()
  check('K2. Space opens just the operators', (await t.state()).listbox, 'Operators for Label')
  await t.page.keyboard.press('Escape'); await t.settle()
  check('K3. Escape puts focus back on the part',
    await t.page.evaluate(() => document.activeElement.getAttribute('data-edit')), 'operator')
  const value = t.page.locator('[data-token][data-edit=value]').first()
  await value.focus(); await t.page.keyboard.press('Space'); await t.settle()
  check('K4. and the value part opens the values', (await t.state()).listbox, 'Values for Status')
  await t.clickOption('Closed')
  check('K5. committed in place', (await t.state()).chips[0].includes('Closed'), true)
  await t.page.close()
}

// --- a pointer down outside still closes it, with no wrapper of our own ---
{
  const t = await fresh()
  await t.page.click('[role=combobox]'); await t.settle()
  await t.page.locator('#results li').first().click(); await t.settle()
  check('L1. clicking outside closes the list', (await t.state()).open, false)
  check('L2. aria-expanded follows', (await t.state()).expanded, 'false')
  check('L3. no console errors', t.errors, [])
  await t.page.close()
}

await browser.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
