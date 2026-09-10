import { test, expect } from '@playwright/test'
import { openApp, collectPageErrors, waitForStable } from './_helpers.js'

// Backspace block removal/merge must not re-centre the page. Post-merge caret
// placement used to scroll the WHOLE previous block to the vertical centre of
// the viewport (element.scrollIntoView({ block: 'center' })). When the previous
// block is taller than the viewport — or simply when the caret was already on
// screen — that re-centred the document by hundreds of pixels, the "keyboard
// jump" you see when backspacing a block away. Placement now scrolls only when
// the caret itself is off-screen and never moves a page where it already is.

let seedCounter = 0
const NID = () => `seed-scroll-${++seedCounter}`
const P = (extra = {}) => ({ id: NID(), type: 'paragraph', html: '', ...extra })
const Q = (extra = {}) => ({ id: NID(), type: 'quote', html: 'Tail block under the tall paragraph', ...extra })

async function openDoc(page, blocks) {
  await page.addInitScript((b) => {
    localStorage.setItem('papertrail-document', JSON.stringify(b))
  }, blocks)
  await openApp(page)
}

// Collapsed caret at text offset 0 of `row` (1-based), without scrolling.
async function caretAtStart(page, row) {
  await page.evaluate(({ col }) => {
    const el = document.querySelector(`.block-row:nth-child(${col}) .block-content`)
    el.focus({ preventScroll: true })
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const tn = walker.nextNode() || el
    const r = document.createRange()
    r.setStart(tn, 0)
    r.collapse(true)
    const s = window.getSelection()
    s.removeAllRanges()
    s.addRange(r)
  }, { col: row })
}

// Vertical centre of block `row` relative to the viewport centre. A forced
// re-centre (the old bug) drives this towards 0 from wherever it started.
const blockCenterOff = (page, row) =>
  page.evaluate((col) => {
    const el = document.querySelector(`.block-row:nth-child(${col}) .block-content`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return r.top + r.height / 2 - window.innerHeight / 2
  }, row)

// Outer height of a block row, including its vertical margins.
const rowOuterHeight = (page, row) =>
  page.evaluate((col) => {
    const el = document.querySelector(`.block-row:nth-child(${col})`)
    const cs = getComputedStyle(el)
    return el.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom)
  }, row)

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
    }
    return { caretBlock: caretBlock?.dataset.blockId ?? null, top, bottom, vh: window.innerHeight }
  })

test.describe('backspace block removal does not jump the page', () => {
  test('merging into a block taller than the viewport leaves the scroll position alone', async ({ page }) => {
    const errors = collectPageErrors(page)
    const tallText = 'A very long sentence that wraps into many lines so the paragraph grows taller than the whole viewport. '.repeat(70)
    await openDoc(page, [P({ html: tallText }), Q(), P({ html: 'Content below keeps the document scrollable' })])
    // Park the tail block in the lower half of the viewport, clearly not centred.
    await page.evaluate(() => {
      document.querySelector('.block-row:nth-child(2) .block-content').scrollIntoView({ block: 'end' })
    })
    await waitForStable(page)
    await caretAtStart(page, 2)
    await waitForStable(page)

    const removedRowH = await rowOuterHeight(page, 2)
    const beforeCenterOff = await blockCenterOff(page, 1)
    const beforeScrollY = await page.evaluate(() => window.scrollY)
    const leadId = await page.evaluate(() => document.querySelector('.block-row:nth-child(1) .block-content').dataset.blockId)

    await page.keyboard.press('Backspace')
    await waitForStable(page)

    const afterCenterOff = await blockCenterOff(page, 1)
    const afterScrollY = await page.evaluate(() => window.scrollY)
    const caret = await caretState(page)

    // The tail block merged into the tall paragraph above it...
    expect(caret.caretBlock, JSON.stringify(caret)).toBe(leadId)
    // ...and the page did not re-centre: the tall block's viewport offset moved
    // by at most the height of the removed row (content shrink), never by the
    // hundreds of pixels a forced `block: 'center'` scroll used to cause.
    expect(Math.abs(afterCenterOff - beforeCenterOff), JSON.stringify(afterCenterOff)).toBeLessThanOrEqual(removedRowH + 20)
    expect(Math.abs(afterScrollY - beforeScrollY), JSON.stringify(afterScrollY)).toBeLessThanOrEqual(removedRowH + 20)
    // The caret stays fully on screen.
    expect(caret.top, JSON.stringify(caret)).toBeGreaterThanOrEqual(0)
    expect(caret.bottom, JSON.stringify(caret)).toBeLessThanOrEqual(caret.vh)
    expect(errors).toEqual([])
  })

  test('deleting an empty block with the caret already visible does not scroll', async ({ page }) => {
    const errors = collectPageErrors(page)
    const empties = Array.from({ length: 24 }, () => P())
    await openDoc(page, [P({ html: 'Anchor paragraph above' }), ...empties])
    // Park an empty paragraph low in the viewport (not centred) so the rows
    // above it sit well clear of the middle, where a re-centre would drag them.
    const caretRow = 22
    await page.evaluate((row) => {
      document.querySelector(`.block-row:nth-child(${row}) .block-content`).scrollIntoView({ block: 'end' })
    }, caretRow)
    await waitForStable(page)
    await caretAtStart(page, caretRow)
    await waitForStable(page)

    const removedRowH = await rowOuterHeight(page, caretRow)
    const beforeCenterOff = await blockCenterOff(page, caretRow - 1)
    const beforeScrollY = await page.evaluate(() => window.scrollY)
    const beforeBlocks = await page.evaluate(() => document.querySelectorAll('.block-row').length)

    await page.keyboard.press('Backspace')
    await waitForStable(page)

    const afterScrollY = await page.evaluate(() => window.scrollY)
    const afterBlocks = await page.evaluate(() => document.querySelectorAll('.block-row').length)
    const caret = await caretState(page)

    expect(afterBlocks, JSON.stringify(afterBlocks)).toBe(beforeBlocks - 1)
    // The caret sits in the paragraph above the removed block...
    const prevId = await page.evaluate((row) => document.querySelector(`.block-row:nth-child(${row}) .block-content`).dataset.blockId, caretRow - 1)
    expect(caret.caretBlock, JSON.stringify(caret)).toBe(prevId)
    // ...which has not been re-centred and the page has not scrolled.
    const afterCenterOff = await blockCenterOff(page, caretRow - 1)
    expect(Math.abs(afterCenterOff - beforeCenterOff), JSON.stringify(afterCenterOff)).toBeLessThanOrEqual(removedRowH + 20)
    expect(Math.abs(afterScrollY - beforeScrollY), JSON.stringify(afterScrollY)).toBeLessThanOrEqual(removedRowH + 20)
    // The caret stays fully on screen.
    expect(caret.top, JSON.stringify(caret)).toBeGreaterThanOrEqual(0)
    expect(caret.bottom, JSON.stringify(caret)).toBeLessThanOrEqual(caret.vh)
    expect(errors).toEqual([])
  })
})