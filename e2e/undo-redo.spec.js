import { test, expect } from '@playwright/test'
import { openApp, collectPageErrors, storedHtml, waitForStable } from './_helpers.js'

// Real undo/redo over the block-array history (src/logic/use-document-editor.js),
// replacing the old document.execCommand('undo'/'redo') which only replayed the
// focused block's native text-edit history and knew nothing about structural
// edits (add/delete/move/split/merge).

const blockCount = (page) => page.evaluate(() => document.querySelectorAll('.block-row').length)

async function collapseCaretAtEnd(page, blockId) {
  await page.evaluate((id) => {
    const el = document.querySelector(`[data-block-id="${id}"]`)
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  }, blockId)
}

test.describe('undo / redo', () => {
  test('U1: a run of typed characters undoes as a single step, not one character at a time', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const original = await storedHtml(page, 'closing')

    await collapseCaretAtEnd(page, 'closing')
    await page.keyboard.type('abcde')
    await waitForStable(page)
    expect(await storedHtml(page, 'closing')).toContain('abcde')

    await page.keyboard.press('Meta+z')
    await waitForStable(page)
    let html = await storedHtml(page, 'closing')
    if (html === original + 'abcde') {
      // Not Mac (Meta didn't register as the modifier) — retry with Control.
      await page.keyboard.press('Control+z')
      await waitForStable(page)
      html = await storedHtml(page, 'closing')
    }
    expect(html, JSON.stringify(html)).toBe(original)
    expect(errors).toEqual([])
  })

  test('U2: undo reverts adding a block; redo restores it', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const before = await blockCount(page)

    await page.click('.add-block-button')
    await page.locator('.add-menu button').first().click()
    await waitForStable(page)
    expect(await blockCount(page)).toBe(before + 1)

    await page.keyboard.press('Control+z')
    await page.keyboard.press('Meta+z')
    await waitForStable(page)
    expect(await blockCount(page)).toBe(before)

    await page.keyboard.press('Control+Shift+z')
    await page.keyboard.press('Meta+Shift+z')
    await waitForStable(page)
    expect(await blockCount(page)).toBe(before + 1)
    expect(errors).toEqual([])
  })

  test('U3: undo reverts a Backspace merge; redo restores the merged state', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const before = await blockCount(page)
    const leadBefore = await storedHtml(page, 'lead')

    await page.evaluate(() => {
      const el = document.querySelector('[data-block-id="quote"]')
      el.focus()
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      const textNode = walker.nextNode()
      const range = document.createRange()
      range.setStart(textNode, 0)
      range.collapse(true)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
    })
    await page.keyboard.press('Backspace')
    await waitForStable(page)
    expect(await blockCount(page)).toBe(before - 1)

    await page.keyboard.press('Control+z')
    await page.keyboard.press('Meta+z')
    await waitForStable(page)
    expect(await blockCount(page)).toBe(before)
    expect(await storedHtml(page, 'lead')).toBe(leadBefore)

    await page.keyboard.press('Control+Shift+z')
    await page.keyboard.press('Meta+Shift+z')
    await waitForStable(page)
    expect(await blockCount(page)).toBe(before - 1)
    expect(errors).toEqual([])
  })

  test('U4: the toolbar undo/redo buttons are disabled with nothing to undo/redo, and enable once there is', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const undoButton = page.getByRole('button', { name: 'Undo' })
    const redoButton = page.getByRole('button', { name: 'Redo' })
    await expect(undoButton).toBeDisabled()
    await expect(redoButton).toBeDisabled()

    await collapseCaretAtEnd(page, 'closing')
    await page.keyboard.type('x')
    await waitForStable(page)
    await expect(undoButton).toBeEnabled()
    await expect(redoButton).toBeDisabled()

    await undoButton.click()
    await waitForStable(page)
    await expect(undoButton).toBeDisabled()
    await expect(redoButton).toBeEnabled()
    expect(errors).toEqual([])
  })
})
