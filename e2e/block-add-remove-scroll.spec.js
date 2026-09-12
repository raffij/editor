import { test, expect } from '@playwright/test'
import { openApp, collectPageErrors, waitForStable } from './_helpers.js'

// Adding or splitting a block must keep the new caret on screen with minimal
// movement. The old scrollCaretIntoView bailed out on empty blocks (a
// collapsed range there reports a 0x0 rect, treated as "nothing to scroll"),
// so a newly added empty paragraph at the end of a long document stayed
// below the fold; and when it did scroll it re-centred
// (range.scrollIntoView({ block: 'center' })), jumping the page by hundreds
// of pixels. Placement now falls back to the block box for empty carets and
// scrolls only the clipped distance.

let seedCounter = 0
const NID = () => `seed-addscroll-${++seedCounter}`
const P = (extra = {}) => ({ id: NID(), type: 'paragraph', html: '', ...extra })

async function openDoc(page, blocks) {
  await page.addInitScript((b) => {
    localStorage.setItem('papertrail-document', JSON.stringify(b))
  }, blocks)
  await openApp(page)
}

const caretState = (page) =>
  page.evaluate(() => {
    const sel = window.getSelection()
    const anchor = sel?.anchorNode
    const caretBlock = anchor ? (anchor.nodeType === 1 ? anchor : anchor.parentElement)?.closest('[data-block-id]') : null
    let top = null
    let bottom = null
    if (sel?.rangeCount) {
      const r = sel.getRangeAt(0).getBoundingClientRect()
      top = r.top
      bottom = r.bottom
      // Empty blocks report a 0x0 caret rect: fall back to the focused block
      // box, mirroring the editor's own scroll logic.
      if ((!r.width && !r.height) || top === 0) {
        const host = caretBlock || document.activeElement?.closest?.('[data-block-id]')
        if (host) {
          const b = host.getBoundingClientRect()
          top = b.top
          bottom = b.bottom
        }
      }
    }
    return { caretBlock: caretBlock?.dataset.blockId ?? null, active: document.activeElement?.dataset?.blockId ?? null, top, bottom, vh: window.innerHeight, scrollY: window.scrollY }
  })

function tallDoc(count = 30) {
  return Array.from({ length: count }, (_, i) => P({ html: `Filler paragraph ${i} with enough text to make the document tall enough to scroll well past the viewport.` }))
}

test.describe('adding or splitting a block keeps the caret on screen', () => {
  test('adding an empty block at the end scrolls it into view', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openDoc(page, tallDoc())
    await waitForStable(page)

    await page.click('.add-block-button')
    await page.locator('.add-menu button').first().click()
    await waitForStable(page)

    const caret = await caretState(page)
    const blockCount = await page.evaluate(() => document.querySelectorAll('.block-row').length)
    expect(blockCount).toBe(31)
    // Focus landed in the new trailing block...
    const lastId = await page.evaluate(() => document.querySelector('.block-row:last-child .block-content').dataset.blockId)
    expect(caret.active, JSON.stringify(caret)).toBe(lastId)
    // ...and it is on screen, not stranded below the fold.
    expect(caret.top, JSON.stringify(caret)).toBeGreaterThanOrEqual(0)
    expect(caret.bottom, JSON.stringify(caret)).toBeLessThanOrEqual(caret.vh)
    expect(errors).toEqual([])
  })

  test('splitting at the end of the last block keeps the new caret visible without recentring', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openDoc(page, tallDoc(24))
    await waitForStable(page)

    // Put the caret at the end of the last block's text.
    await page.evaluate(() => {
      const el = document.querySelector('.block-row:last-child .block-content')
      el.focus({ preventScroll: true })
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      const tn = walker.nextNode()
      const r = document.createRange()
      r.setStart(tn, tn.textContent.length)
      r.collapse(true)
      const s = window.getSelection()
      s.removeAllRanges()
      s.addRange(r)
    })
    await waitForStable(page)
    const beforeScrollY = await page.evaluate(() => window.scrollY)

    await page.keyboard.press('Enter')
    await waitForStable(page)

    const caret = await caretState(page)
    const afterScrollY = await page.evaluate(() => window.scrollY)
    const blockCount = await page.evaluate(() => document.querySelectorAll('.block-row').length)
    expect(blockCount).toBe(25)
    // New empty block took focus and is visible...
    const lastId = await page.evaluate(() => document.querySelector('.block-row:last-child .block-content').dataset.blockId)
    expect(caret.active, JSON.stringify(caret)).toBe(lastId)
    expect(caret.top, JSON.stringify(caret)).toBeGreaterThanOrEqual(0)
    expect(caret.bottom, JSON.stringify(caret)).toBeLessThanOrEqual(caret.vh)
    // ...without a full-page recentre: the scroll moved by at most one
    // viewport plus the new row, never by whole document heights.
    expect(Math.abs(afterScrollY - beforeScrollY), JSON.stringify({ beforeScrollY, afterScrollY })).toBeLessThanOrEqual(caret.vh + 120)
    expect(errors).toEqual([])
  })

  test('mobile viewport: adding a block keeps the caret on screen', async ({ page }) => {
    const errors = collectPageErrors(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await openDoc(page, tallDoc())
    await waitForStable(page)

    await page.click('.add-block-button')
    await page.locator('.add-menu button').first().click()
    await waitForStable(page)

    const caret = await caretState(page)
    expect(caret.top, JSON.stringify(caret)).toBeGreaterThanOrEqual(0)
    expect(caret.bottom, JSON.stringify(caret)).toBeLessThanOrEqual(caret.vh)
    expect(errors).toEqual([])
  })
})
