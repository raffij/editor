import { test, expect } from '@playwright/test'
import { openApp, collectPageErrors, selectionState } from './_helpers.js'

// Deleting a cross-block selection (Backspace / Delete) must remove the whole
// selected range — every selected list item included — from the document model,
// rather than collapsing the selection and deleting a single character. This
// guards the regression where a paragraph -> list selection left the list
// items behind.

let seedCounter = 0
const NID = () => `seed-${++seedCounter}`

const P = (html, id) => ({ id: id || NID(), type: 'paragraph', html })
const LIST = (type, items, id) => ({ id: id || NID(), type, html: items.map((t) => `<li>${t}</li>`).join('') })

async function openDoc(page, blocks) {
  await page.addInitScript((b) => {
    localStorage.setItem('papertrail-document', JSON.stringify(b))
  }, blocks)
  await openApp(page)
}

// Reads the rendered block model: type + li texts + flat text per row.
async function readModel(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.block-row .block-content')].map((el) => {
      const type = [...el.classList].find((c) => c.startsWith('content-'))?.slice('content-'.length) || ''
      return {
        id: el.dataset.blockId,
        type,
        text: el.textContent || '',
        liTexts: [...el.querySelectorAll('li')].map((li) => li.textContent || ''),
      }
    }),
  )
}

const summarize = (m) => m.map((b) => `${b.type}${b.liTexts.length ? `[${b.liTexts.join('|')}]` : `(${b.text})`}`).join(' → ')

const countLis = (m) => m.reduce((sum, b) => sum + b.liTexts.length, 0)

const pressBackspace = async (page) => {
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(400)
}
const pressDelete = async (page) => {
  await page.keyboard.press('Delete')
  await page.waitForTimeout(400)
}

// Drag-select from one block-row box to another (both 1-based rows). Mirrors
// the cross-block drag used everywhere else in the suite; ends on the target
// row's box, so dragging from row 1 to row 3 covers the whole middle block.
async function dragRows(page, fromRow, toRow) {
  const from = await page.locator(`.block-row:nth-child(${fromRow}) .block-content`).boundingBox()
  const to = await page.locator(`.block-row:nth-child(${toRow}) .block-content`).boundingBox()
  await page.mouse.move(from.x + Math.min(80, from.width - 10), from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + Math.min(80, to.width - 10), to.y + to.height / 2, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(250)
}

test.describe('cross-block range deletion', () => {
  test('D1: Backspace over a paragraph -> list -> paragraph selection removes all list items', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openDoc(page, [
      P('Alpha beta', 'intro'),
      LIST('bulleted-list', ['one', 'two', 'three'], 'list'),
      P('Gamma', 'closing'),
    ])
    // Select from the intro through the trailing paragraph, covering the whole
    // list, then delete.
    await dragRows(page, 1, 3)
    const ov = await selectionState(page)
    expect(ov.overlay, JSON.stringify(ov)).toBeGreaterThan(0)
    await pressBackspace(page)
    const m = await readModel(page)
    // Every list item must be gone (no <li> left in any block).
    expect(countLis(m), summarize(m)).toBe(0)
    expect(m.some((b) => b.type.includes('list')), summarize(m)).toBe(false)
    expect(errors).toEqual([])
  })

  test('D2: Delete over a paragraph -> numbered-list selection removes the whole numbered list', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openDoc(page, [
      P('Top text', 'top'),
      LIST('numbered-list', ['first', 'second', 'third'], 'list'),
      P('Bottom', 'bottom'),
    ])
    await dragRows(page, 1, 3)
    const ov = await selectionState(page)
    expect(ov.overlay, JSON.stringify(ov)).toBeGreaterThan(0)
    await pressDelete(page)
    const m = await readModel(page)
    expect(countLis(m), summarize(m)).toBe(0)
    expect(m.some((b) => b.type.includes('list')), summarize(m)).toBe(false)
    expect(errors).toEqual([])
  })

  test('D3: selection that starts inside the list removes the selected list items', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openDoc(page, [
      P('Intro text', 'intro'),
      LIST('bulleted-list', ['one', 'two', 'three'], 'list'),
      P('Bottom', 'bottom'),
    ])
    // Drag from the list to the trailing paragraph: the selection covers part
    // of the list (from mid-list onward), so some items must be removed while
    // the unselected leading items survive.
    await dragRows(page, 2, 3)
    const ov = await selectionState(page)
    expect(ov.overlay, JSON.stringify(ov)).toBeGreaterThan(0)
    await pressBackspace(page)
    const m = await readModel(page)
    // Fewer than the original 3 items remain, and no leftover empty items.
    expect(countLis(m), summarize(m)).toBeLessThan(3)
    expect(m.some((b) => b.liTexts.some((t) => t.trim() === '')), summarize(m)).toBe(false)
    expect(errors).toEqual([])
  })

  test('D4: typing over a paragraph -> list selection still collapses (does not delete the list)', async ({ page }) => {
    // Guard the insertion path: typing over a cross-block selection must keep
    // the collapse-and-type behaviour (the list is not deleted by typing).
    const errors = collectPageErrors(page)
    await openDoc(page, [
      P('Alpha beta', 'intro'),
      LIST('bulleted-list', ['one', 'two', 'three'], 'list'),
      P('Gamma', 'closing'),
    ])
    await dragRows(page, 1, 3)
    const ov = await selectionState(page)
    expect(ov.overlay, JSON.stringify(ov)).toBeGreaterThan(0)
    await page.keyboard.press('Z')
    await page.waitForTimeout(300)
    const after = await selectionState(page)
    const m = await readModel(page)
    expect(after.count, JSON.stringify(after)).toBe(0)
    // The list items must still exist (typing collapses, it doesn't delete).
    expect(countLis(m), summarize(m)).toBe(3)
    expect((m.map((b) => b.text).join('').match(/Z/g) || []).length).toBe(1)
    expect(errors).toEqual([])
  })
})
