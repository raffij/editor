import { test, expect } from '@playwright/test'
import { openApp, collectPageErrors, selectionState, setCaret, fireClipboard, readDoc, waitForStable } from './_helpers.js'

// List keyboard-selection flows: crossing in/out of the bulleted list, falling
// back to the anchor block, and clean copy/type over cross-block selections.

const caretQuoteEnd = (page) => setCaret(page, 3, 9999)
const caretQuoteMid = (page) => setCaret(page, 3, 10)

async function caretLastLi(page) {
  await page.evaluate(() => {
    const el = document.querySelector('.block-row:nth-child(4) .block-content')
    el.focus()
    const items = el.querySelectorAll('li')
    const last = items[items.length - 1]
    const walker = document.createTreeWalker(last, NodeFilter.SHOW_TEXT)
    let tn = null
    while (walker.nextNode()) tn = walker.currentNode
    const o = tn.textContent.length
    const r = document.createRange()
    r.setStart(tn, o)
    r.collapse(true)
    const s = window.getSelection()
    s.removeAllRanges()
    s.addRange(r)
  })
}

async function caretFirstLi(page) {
  await page.evaluate(() => {
    const el = document.querySelector('.block-row:nth-child(4) .block-content')
    el.focus()
    const tn = el.querySelector('li').firstChild
    const r = document.createRange()
    r.setStart(tn, 0)
    r.collapse(true)
    const s = window.getSelection()
    s.removeAllRanges()
    s.addRange(r)
  })
}

async function caretIntroEnd(page) {
  await setCaret(page, 1, 9999)
}

test.describe('list keyboard selection', () => {
  test('L1: plain ArrowDown at quote end crosses into the list', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    await caretQuoteEnd(page)
    await page.keyboard.press('ArrowDown')
    await waitForStable(page)
    const i = await selectionState(page)
    expect(i.focusBlock, JSON.stringify(i)).toBe('principles')
    expect(i.collapsed, JSON.stringify(i)).toBe(true)
    expect(errors).toEqual([])
  })

  test('L2: Shift+ArrowDown from quote end enters the list with overlay, no gutter bleed', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    await caretQuoteEnd(page)
    await page.keyboard.press('Shift+ArrowDown')
    await waitForStable(page)
    let i = await selectionState(page)
    // Anchor sits at the end of the quote (zero selected chars), so the overlay
    // paints the line the focus landed on in the list — the cross-block model
    // is live and must never bleed into the 40px control gutter.
    expect(i.focusBlock, JSON.stringify(i)).toBe('principles')
    expect(i.textLen, JSON.stringify(i)).toBe(0)
    expect(i.count, JSON.stringify(i)).toBeGreaterThanOrEqual(1)
    expect(i.bleed, JSON.stringify(i)).toBe(false)
    // within-list line movement keeps the overlay live
    await page.keyboard.press('Shift+ArrowDown')
    await waitForStable(page)
    i = await selectionState(page)
    expect(i.focusBlock, JSON.stringify(i)).toBe('principles')
    expect(i.count, JSON.stringify(i)).toBeGreaterThanOrEqual(1)
    expect(i.bleed, JSON.stringify(i)).toBe(false)
    expect(errors).toEqual([])
  })

  test('L3: Shift+ArrowDown from the last li crosses into closing', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    await caretLastLi(page)
    await page.keyboard.press('Shift+ArrowDown')
    await waitForStable(page)
    const i = await selectionState(page)
    expect(i.focusBlock, JSON.stringify(i)).toBe('closing')
    expect(i.count, JSON.stringify(i)).toBeGreaterThanOrEqual(1)
    expect(i.bleed, JSON.stringify(i)).toBe(false)
    expect(errors).toEqual([])
  })

  test('L4: quote end -> Shift+Down -> Shift+Up limits back into the quote block', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    await caretQuoteEnd(page)
    await page.keyboard.press('Shift+ArrowDown')
    await waitForStable(page)
    await page.keyboard.press('Shift+ArrowUp')
    await waitForStable(page)
    let i = await selectionState(page)
    expect(i.anchorBlock, JSON.stringify(i)).toBe('quote')
    expect(i.focusBlock, JSON.stringify(i)).toBe('quote')
    expect(i.collapsed, JSON.stringify(i)).toBe(false)
    expect(i.count, JSON.stringify(i)).toBe(0)
    expect(i.textLen, JSON.stringify(i)).toBeGreaterThan(0)
    // and re-extends again
    await page.keyboard.press('Shift+ArrowDown')
    await waitForStable(page)
    i = await selectionState(page)
    expect(i.focusBlock, JSON.stringify(i)).toBe('principles')
    expect(i.count, JSON.stringify(i)).toBeGreaterThanOrEqual(2)
    expect(i.bleed, JSON.stringify(i)).toBe(false)
    expect(errors).toEqual([])
  })

  test('L5: intro end -> Shift+Down -> Shift+Up collapses back at the intro anchor', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    await caretIntroEnd(page)
    await page.keyboard.press('Shift+ArrowDown')
    await waitForStable(page)
    await page.keyboard.press('Shift+ArrowUp')
    await waitForStable(page)
    // Anchor was intro@end, so limiting back collapses exactly at the anchor —
    // a within-intro selection would be wrong here.
    let i = await selectionState(page)
    expect(i.anchorBlock, JSON.stringify(i)).toBe('intro')
    expect(i.focusBlock, JSON.stringify(i)).toBe('intro')
    expect(i.count, JSON.stringify(i)).toBe(0)
    expect(i.collapsed, JSON.stringify(i)).toBe(true)
    // Shift+Up again inside intro stays in intro
    await page.keyboard.press('Shift+ArrowUp')
    await waitForStable(page)
    i = await selectionState(page)
    expect(i.focusBlock, JSON.stringify(i)).toBe('intro')
    expect(errors).toEqual([])
  })

  test('L6: ArrowUp from the list first li crosses back into the quote', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    await caretFirstLi(page)
    await page.keyboard.press('ArrowUp')
    await waitForStable(page)
    const i = await selectionState(page)
    expect(i.focusBlock, JSON.stringify(i)).toBe('quote')
    expect(i.collapsed, JSON.stringify(i)).toBe(true)
    expect(errors).toEqual([])
  })

  test('L7: ArrowDown within the list stays in the list', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    await page.evaluate(() => {
      const el = document.querySelector('.block-row:nth-child(4) .block-content')
      el.focus()
      const tn = el.querySelector('li').firstChild
      const o = 5
      const r = document.createRange()
      r.setStart(tn, o)
      r.collapse(true)
      const s = window.getSelection()
      s.removeAllRanges()
      s.addRange(r)
    })
    await page.keyboard.press('ArrowDown')
    await waitForStable(page)
    const i = await selectionState(page)
    expect(i.focusBlock, JSON.stringify(i)).toBe('principles')
    expect(errors).toEqual([])
  })

  test('L8: copy over quote->list selection is clean (no bullet glyphs)', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    await caretQuoteMid(page)
    await page.keyboard.press('Shift+ArrowDown')
    await waitForStable(page)
    const copy = await fireClipboard(page, 'copy')
    expect(copy.handled).toBe(true)
    expect(copy.text.includes('feels inevitable in retrospect'), copy.text.slice(0, 120)).toBe(true)
    expect(copy.text.includes('Start with'), copy.text.slice(0, 120)).toBe(true)
    expect(copy.text.includes('•'), copy.text.slice(0, 120)).toBe(false)
    expect(errors).toEqual([])
  })

  test('L9: typing over a quote->list selection deletes it and inserts the char', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    await caretQuoteEnd(page)
    await page.keyboard.press('Shift+ArrowDown')
    await waitForStable(page)
    const before = await readDoc(page)
    const copied = await fireClipboard(page, 'copy')
    expect((copied.text || '').length, JSON.stringify(copied.text)).toBeGreaterThan(0)
    await page.keyboard.press('Z')
    await waitForStable(page)
    const after = await readDoc(page)
    const ov = await selectionState(page)
    // The selected content is deleted and replaced by a single character.
    expect(ov.count, JSON.stringify(ov)).toBe(0)
    // The selected content is deleted (length shrinks), replaced by one char.
    expect(after.length, `${before.length} -> ${after.length}`).toBeLessThan(before.length - 5)
    expect((after.match(/Z/g) || []).length).toBe(1)
    expect(errors).toEqual([])
  })
})