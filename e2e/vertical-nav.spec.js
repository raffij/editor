import { test, expect } from '@playwright/test'
import { openApp, collectPageErrors, selectionState, setCaret, readDoc, readBlocks, fireClipboard, fireInsertParagraph, fireDeleteBackward, box, drag } from './_helpers.js'

// Vertical navigation, overwrite/copy/cut/split over cross-block selections,
// and same-block native selection behaviors across both engines.

test.describe('vertical navigation + cross-block editing', () => {
  test('g1: cross-block drag renders overlay with DOM caret collapsed at the focus', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const i1 = await box(page, 1)
    const c1 = await box(page, 5)
    await drag(page, i1, c1)
    const ov = await selectionState(page)
    expect(ov.count, JSON.stringify(ov)).toBeGreaterThanOrEqual(3)
    expect(ov.ySpan, JSON.stringify(ov)).toBeGreaterThanOrEqual(150)
    expect(ov.collapsed, JSON.stringify(ov)).toBe(true)
    expect(ov.focusBlock, JSON.stringify(ov)).toBe('closing')
    expect(ov.bleed, JSON.stringify(ov)).toBe(false)
    expect(errors).toEqual([])
  })

  test('g2: copy/cut over a full cross-block selection is clean', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const i2 = await box(page, 1)
    const c2 = await box(page, 5)
    await drag(page, i2, c2)
    const copy = await fireClipboard(page, 'copy')
    const lines = (copy.text || '').split('\n')
    expect(copy.handled).toBe(true)
    expect(copy.text.length).toBeGreaterThan(120)
    expect(lines.some((l) => /^\d{2}$/.test(l.trim())), JSON.stringify(lines.slice(0, 3))).toBe(false)
    expect(copy.text.includes('made legible') && copy.text.includes('Good documents'), copy.text.slice(0, 60)).toBe(true)
    const cut = await fireClipboard(page, 'cut')
    expect(cut.handled).toBe(true)
    expect(cut.text).toBe(copy.text)
    expect(errors).toEqual([])
  })

  test('g3: typing over the selection inserts exactly one char and clears the overlay', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const before3 = await readDoc(page)
    const f3 = await box(page, 1)
    const p3 = await box(page, 4)
    await drag(page, f3, p3)
    await page.keyboard.press('Z')
    await page.waitForTimeout(300)
    const after3 = await readDoc(page)
    const ov3 = await selectionState(page)
    expect(ov3.count, JSON.stringify(ov3)).toBe(0)
    expect(after3.length, `${before3.length} -> ${after3.length}`).toBe(before3.length + 1)
    expect((after3.match(/Z/g) || []).length).toBe(1)
    expect(errors).toEqual([])
  })

  test('g4: backspace over the selection removes exactly one char, no corruption', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const before4 = await readDoc(page)
    const f4 = await box(page, 1)
    const c4 = await box(page, 5)
    await drag(page, f4, c4)
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(300)
    const after4 = await readDoc(page)
    const ov4 = await selectionState(page)
    expect(after4.length, `${before4.length} -> ${after4.length}`).toBe(before4.length - 1)
    expect(ov4.count, JSON.stringify(ov4)).toBe(0)
    expect(errors).toEqual([])
  })

  test('g5: delete over the selection removes exactly one char', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const before5 = await readDoc(page)
    const f5 = await box(page, 1)
    const c5 = await box(page, 5)
    await drag(page, f5, c5)
    await page.keyboard.press('Delete')
    await page.waitForTimeout(300)
    const after5 = await readDoc(page)
    expect(after5.length, `${before5.length} -> ${after5.length}`).toBe(before5.length - 1)
    expect(errors).toEqual([])
  })

  test('g6: enter over the selection creates a clean split', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const blocksBefore6 = await readBlocks(page)
    const f6 = await box(page, 1)
    const p6 = await box(page, 3)
    await drag(page, f6, p6)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(400)
    const blocksAfter6 = await readBlocks(page)
    const textBefore6 = blocksBefore6.map((b) => b.text).join('')
    const textAfter6 = blocksAfter6.map((b) => b.text).join('')
    expect(blocksAfter6.length, `${blocksBefore6.length} -> ${blocksAfter6.length}`).toBe(blocksBefore6.length + 1)
    expect(textAfter6.includes(textBefore6) && textAfter6.length === textBefore6.length, `${textBefore6.length} vs ${textAfter6.length}`).toBe(true)
    expect(errors).toEqual([])
  })

  test('g14: mobile beforeinput (insertParagraph) creates a new block, not a stray <br>', async ({ page }) => {
    // iOS/Android fire beforeinput instead of keydown for Enter; the split must
    // run and produce a clean new paragraph block.
    const errors = collectPageErrors(page)
    await openApp(page)
    await setCaret(page, 2, 20)
    const blocksBefore = await readBlocks(page)
    const res = await fireInsertParagraph(page, 2)
    await page.waitForTimeout(400)
    const blocksAfter = await readBlocks(page)
    expect(res.handled, JSON.stringify(res)).toBe(true)
    expect(blocksAfter.length, `${blocksBefore.length} -> ${blocksAfter.length}`).toBe(blocksBefore.length + 1)
    const lead = blocksAfter[1]
    const newBlock = blocksAfter[2]
    expect(lead.text.length < 30, `lead not split: ${lead.text}`).toBe(true)
    expect(newBlock.text.length > 0, `new block empty: ${newBlock.text}`).toBe(true)
    expect(errors).toEqual([])
  })

  test('g15: mobile beforeinput (deleteContentBackward) at block start merges into previous', async ({ page }) => {
    // iOS/Android fire beforeinput instead of keydown for Backspace; backspace
    // at the start of a block must merge it into the previous block.
    const errors = collectPageErrors(page)
    await openApp(page)
    const blocksBefore = await readBlocks(page)
    const res = await fireDeleteBackward(page, 2)
    await page.waitForTimeout(400)
    const blocksAfter = await readBlocks(page)
    expect(res.handled, JSON.stringify(res)).toBe(true)
    expect(blocksAfter.length, `${blocksBefore.length} -> ${blocksAfter.length}`).toBe(blocksBefore.length - 1)
    expect(blocksAfter[0].text, JSON.stringify(blocksAfter[0])).toBe(blocksBefore[0].text + blocksBefore[1].text)
    expect(errors).toEqual([])
  })

  test('g7: clicking elsewhere clears the overlay', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const f7 = await box(page, 1)
    const c7 = await box(page, 5)
    await drag(page, f7, c7)
    await page.mouse.click(400, 950)
    await page.waitForTimeout(150)
    const ov7 = await selectionState(page)
    expect(ov7.count, JSON.stringify(ov7)).toBe(0)
    expect(errors).toEqual([])
  })

  test('g8: ArrowDown at the intro end crosses into lead mid-text (no jump to start)', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    await setCaret(page, 1, 9999)
    const leadLen = await page.evaluate(() => document.querySelector('.block-row:nth-child(2) .block-content').textContent.length)
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(200)
    const g8 = await selectionState(page)
    expect(g8.focusBlock, JSON.stringify(g8)).toBe('lead')
    expect(g8.focusOffset > 3 && g8.focusOffset < leadLen - 1, `offset=${g8.focusOffset} leadLen=${leadLen}`).toBe(true)
    expect(g8.count, JSON.stringify(g8)).toBe(0)
    expect(errors).toEqual([])
  })

  test('g9: ArrowDown stays in lead on the first press, crosses to quote on the second', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    await setCaret(page, 2, 20)
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(150)
    const g9a = await selectionState(page)
    expect(g9a.focusBlock, JSON.stringify(g9a)).toBe('lead')
    expect(g9a.focusOffset > 20, `offset=${g9a.focusOffset}`).toBe(true)
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(150)
    const g9b = await selectionState(page)
    expect(g9b.focusBlock, JSON.stringify(g9b)).toBe('quote')
    expect(g9b.focusOffset > 3, JSON.stringify(g9b)).toBe(true)
    expect(errors).toEqual([])
  })

  test('g10: Shift+ArrowDown chains intro -> lead -> quote without gutter bleed', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    await setCaret(page, 1, 9999)
    await page.keyboard.press('Shift+ArrowDown')
    await page.waitForTimeout(200)
    const g10a = await selectionState(page)
    // Anchor at intro-end, focus on lead@0: an empty selection that still
    // paints the landing line — and never the control gutter.
    expect(g10a.focusBlock, JSON.stringify(g10a)).toBe('lead')
    expect(g10a.textLen, JSON.stringify(g10a)).toBe(0)
    expect(g10a.count, JSON.stringify(g10a)).toBeGreaterThanOrEqual(1)
    expect(g10a.bleed, JSON.stringify(g10a)).toBe(false)
    await setCaret(page, 2, 9999)
    await page.keyboard.press('Shift+ArrowDown')
    await page.waitForTimeout(200)
    const g10b = await selectionState(page)
    expect(g10b.focusBlock, JSON.stringify(g10b)).toBe('quote')
    expect(g10b.bleed, JSON.stringify(g10b)).toBe(false)
    expect(errors).toEqual([])
  })

  test('g11: ArrowUp from the lead first line crosses back to intro', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    await setCaret(page, 2, 5)
    await page.keyboard.press('ArrowUp')
    await page.waitForTimeout(200)
    const g11 = await selectionState(page)
    expect(g11.focusBlock, JSON.stringify(g11)).toBe('intro')
    expect(errors).toEqual([])
  })

  test('g12: double-click still selects a word in lead', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const l12 = await box(page, 2)
    await page.mouse.dblclick(l12.x + 120, l12.y + l12.height / 2)
    await page.waitForTimeout(200)
    const g12 = await selectionState(page)
    expect(g12.collapsed, JSON.stringify(g12)).toBe(false)
    expect(g12.anchorBlock, JSON.stringify(g12)).toBe('lead')
    expect(g12.focusBlock, JSON.stringify(g12)).toBe('lead')
    expect(g12.textLen, JSON.stringify(g12)).toBeGreaterThan(0)
    expect(errors).toEqual([])
  })

  test('g13: same-block drag selects natively with no overlay', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const l13 = await box(page, 2)
    await drag(
      page,
      { x: l13.x, y: l13.y, width: 40, height: l13.height },
      { x: l13.x + 200, y: l13.y, width: 10, height: l13.height },
      5,
    )
    const g13 = await selectionState(page)
    expect(g13.collapsed, JSON.stringify(g13)).toBe(false)
    expect(g13.anchorBlock, JSON.stringify(g13)).toBe('lead')
    expect(g13.focusBlock, JSON.stringify(g13)).toBe('lead')
    expect(g13.count, JSON.stringify(g13)).toBe(0)
    expect(errors).toEqual([])
  })
})