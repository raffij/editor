import { test, expect } from '@playwright/test'
import { waitForStable } from './_helpers.js'

// Regression coverage for the multi-instance selection-state fix in
// caret-navigation.js: every editor instance's DOM root is flagged with
// data-papertrail-root, and every block lookup is scoped to it. Both
// instances on this fixture page use the default starterBlocks, which use
// fixed ids ('intro', 'lead', ...) — a lookup that isn't root-scoped would
// silently resolve to whichever instance is first in the DOM.

const instanceSelector = (instance) => `[data-instance="${instance}"]`

async function openTwoInstances(page) {
  // The app's own base path varies: '/' locally, '/editor/' in CI (vite.config.js
  // sets base '/editor/' whenever GITHUB_ACTIONS is set, matching the GitHub
  // Pages deploy path, and vite preview mounts the whole built app there).
  // Discover it by following the root's own redirect rather than hardcoding
  // either path, then resolve the fixture page against it.
  await page.goto('/')
  await page.goto(new URL('two-instances.html', page.url()).toString())
  await page.waitForSelector('[data-instance="a"] .block-row')
  await page.waitForSelector('[data-instance="b"] .block-row')
  await waitForStable(page)
}

const blockCount = (page, instance) =>
  page.evaluate((sel) => document.querySelectorAll(`${sel} .block-row`).length, instanceSelector(instance))

const blockText = (page, instance, column) =>
  page.evaluate(({ sel, col }) => document.querySelector(`${sel} .block-row:nth-child(${col}) .block-content`)?.textContent ?? null, { sel: instanceSelector(instance), col: column })

const collapseCaretAtEnd = (page, instance, column) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel)
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  }, `${instanceSelector(instance)} .block-row:nth-child(${column}) .block-content`)

const collapseCaretAtStart = (page, instance, column) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel)
    el.focus()
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const textNode = walker.nextNode()
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.collapse(true)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  }, `${instanceSelector(instance)} .block-row:nth-child(${column}) .block-content`)

test.describe('multiple editor instances on one page', () => {
  test('I1: typing in one instance never changes the other, even with identical starter block ids', async ({ page }) => {
    await openTwoInstances(page)
    const beforeB = await blockText(page, 'b', 1)
    await collapseCaretAtEnd(page, 'a', 1)
    await page.keyboard.type(' EDITED-A')
    await waitForStable(page)
    expect(await blockText(page, 'a', 1)).toContain('EDITED-A')
    expect(await blockText(page, 'b', 1)).toBe(beforeB)
  })

  test('I2: Enter-split in one instance does not add a block to the other', async ({ page }) => {
    await openTwoInstances(page)
    const aBefore = await blockCount(page, 'a')
    const bBefore = await blockCount(page, 'b')

    await collapseCaretAtEnd(page, 'a', 2)
    await page.keyboard.press('Enter')
    await waitForStable(page)

    expect(await blockCount(page, 'a')).toBe(aBefore + 1)
    expect(await blockCount(page, 'b')).toBe(bBefore)
  })

  test('I3: Backspace-merge at a block start in one instance does not touch the other', async ({ page }) => {
    await openTwoInstances(page)
    const aBefore = await blockCount(page, 'a')
    const bBefore = await blockCount(page, 'b')

    await collapseCaretAtStart(page, 'a', 2)
    await page.keyboard.press('Backspace')
    await waitForStable(page)

    expect(await blockCount(page, 'a')).toBe(aBefore - 1)
    expect(await blockCount(page, 'b')).toBe(bBefore)
  })

  test('I4: a cross-block drag selection overlay only ever appears in the instance being dragged in', async ({ page }) => {
    await openTwoInstances(page)
    const boxFor = (instance, column) => page.locator(`${instanceSelector(instance)} .block-row:nth-child(${column}) .block-content`).boundingBox()
    const fromA = await boxFor('a', 1)
    const toA = await boxFor('a', 2)

    await page.mouse.move(fromA.x + Math.min(80, fromA.width - 10), fromA.y + fromA.height / 2)
    await page.mouse.down()
    await page.mouse.move(toA.x + Math.min(80, toA.width - 10), toA.y + toA.height / 2, { steps: 10 })
    await page.mouse.up()
    await waitForStable(page)

    const overlayCount = (instance) => page.evaluate((sel) => document.querySelectorAll(`${sel} .cross-selection-overlay span`).length, instanceSelector(instance))
    expect(await overlayCount('a')).toBeGreaterThan(0)
    expect(await overlayCount('b')).toBe(0)
  })
})
