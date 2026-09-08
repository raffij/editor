import { test, expect } from '@playwright/test'
import { openApp, collectPageErrors, waitForStable } from './_helpers.js'

// List block split (Enter) and merge (Backspace) permutations. Each test seeds
// a controlled document via localStorage (the workspace demo reads
// 'papertrail-document' on load) so every case is reproducible across engines.

let seedCounter = 0
const NID = () => `seed-${++seedCounter}`

const P = (extra = {}) => ({ id: NID(), type: 'paragraph', html: '', ...extra })
const LIST = (type, items, extra = {}) => ({ id: NID(), type, html: items.map((t) => `<li>${t}</li>`).join(''), ...extra })

async function openDoc(page, blocks) {
  await page.addInitScript((b) => {
    localStorage.setItem('papertrail-document', JSON.stringify(b))
  }, blocks)
  await openApp(page)
}

// Reads the rendered block model (type + li texts + flat text) per block row.
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

const caretAtLiOffset = (page, row, liIndex, offset = 0) =>
  page.evaluate(({ row, liIndex, offset }) => {
    const el = document.querySelector(`.block-row:nth-child(${row}) .block-content`)
    el.focus()
    const li = el.querySelectorAll('li')[liIndex]
    const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT)
    const tn = walker.nextNode()
    if (!tn) {
      const r = document.createRange()
      r.setStart(li, 0)
      r.collapse(true)
      const s = window.getSelection()
      s.removeAllRanges()
      s.addRange(r)
      return
    }
    const o = Math.max(0, Math.min(offset, tn.textContent.length))
    const r = document.createRange()
    r.setStart(tn, o)
    r.collapse(true)
    const s = window.getSelection()
    s.removeAllRanges()
    s.addRange(r)
  }, { row, liIndex, offset })

// Caret at the very start of an li (element boundary — works for empty li too).
const caretAtLiStart = (page, row, liIndex) =>
  page.evaluate(({ row, liIndex }) => {
    const el = document.querySelector(`.block-row:nth-child(${row}) .block-content`)
    el.focus()
    const li = el.querySelectorAll('li')[liIndex]
    const r = document.createRange()
    r.setStart(li, 0)
    r.collapse(true)
    const s = window.getSelection()
    s.removeAllRanges()
    s.addRange(r)
  }, { row, liIndex })

const caretAtLiEnd = (page, row, liIndex) =>
  page.evaluate(({ row, liIndex }) => {
    const el = document.querySelector(`.block-row:nth-child(${row}) .block-content`)
    el.focus()
    const li = el.querySelectorAll('li')[liIndex]
    const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT)
    let tn = null
    while (walker.nextNode()) tn = walker.currentNode
    const o = tn ? tn.textContent.length : 0
    const r = document.createRange()
    r.setStart(tn || li, o)
    r.collapse(true)
    const s = window.getSelection()
    s.removeAllRanges()
    s.addRange(r)
  }, { row, liIndex })

const pressEnter = async (page) => {
  await page.keyboard.press('Enter')
  await waitForStable(page)
}
const pressBackspace = async (page) => {
  await page.keyboard.press('Backspace')
  await waitForStable(page)
}

const summarize = (m) => m.map((b) => `${b.type}[${b.liTexts.join('|')}](text=${b.text})`).join(' → ')

test.describe('list split permutations (Enter)', () => {
  test('S1: Enter mid-item splits the item into two items in the same block', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openDoc(page, [LIST('bulleted-list', ['foobar'])])
    await caretAtLiOffset(page, 1, 0, 3)
    await pressEnter(page)
    const m = await readModel(page)
    expect(summarize(m)).toBe('bulleted-list[foo|bar](text=foobar)')
    expect(m.length, JSON.stringify(m)).toBe(1)
    expect(m[0].liTexts.length, JSON.stringify(m)).toBe(2)
    expect(errors).toEqual([])
  })

  test('S2: Enter at end of item appends a new empty item below', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openDoc(page, [LIST('bulleted-list', ['foobar'])])
    await caretAtLiEnd(page, 1, 0)
    await pressEnter(page)
    const m = await readModel(page)
    expect(m[0].liTexts, JSON.stringify(m)).toEqual(['foobar', ''])
    expect(m.length, JSON.stringify(m)).toBe(1)
    expect(errors).toEqual([])
  })

  test('S3: Enter at start of a text item inserts a new empty item above', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openDoc(page, [LIST('bulleted-list', ['foobar'])])
    await caretAtLiOffset(page, 1, 0, 0)
    await pressEnter(page)
    const m = await readModel(page)
    expect(m[0].liTexts, JSON.stringify(m)).toEqual(['', 'foobar'])
    expect(m.length, JSON.stringify(m)).toBe(1)
    expect(errors).toEqual([])
  })

  test('S4: Enter on the empty LAST item breaks out into a new paragraph after the list', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openDoc(page, [LIST('bulleted-list', ['A', 'B', ''])])
    await caretAtLiStart(page, 1, 2)
    await pressEnter(page)
    const m = await readModel(page)
    expect(summarize(m), JSON.stringify(m)).toBe('bulleted-list[A|B](text=AB) → paragraph[](text=)')
    expect(m[0].liTexts, JSON.stringify(m)).toEqual(['A', 'B'])
    expect(m[1].type, JSON.stringify(m)).toBe('paragraph')
    expect(errors).toEqual([])
  })

  test('S5: Enter on an empty MIDDLE item splits the list, paragraph between halves', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openDoc(page, [LIST('bulleted-list', ['A', '', 'B'])])
    await caretAtLiStart(page, 1, 1)
    await pressEnter(page)
    const m = await readModel(page)
    expect(summarize(m), JSON.stringify(m)).toBe('bulleted-list[A](text=A) → paragraph[](text=) → bulleted-list[B](text=B)')
    expect(errors).toEqual([])
  })

  test('S6: Enter on a single empty item converts it to an empty paragraph', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openDoc(page, [LIST('bulleted-list', [''])])
    await caretAtLiStart(page, 1, 0)
    await pressEnter(page)
    const m = await readModel(page)
    expect(summarize(m), JSON.stringify(m)).toBe('paragraph[](text=)')
    expect(m.length, JSON.stringify(m)).toBe(1)
    expect(errors).toEqual([])
  })

  test('S7: Enter on an empty FIRST item breaks out above into a paragraph, list follows', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openDoc(page, [LIST('bulleted-list', ['', 'B', 'C'])])
    await caretAtLiStart(page, 1, 0)
    await pressEnter(page)
    const m = await readModel(page)
    expect(summarize(m), JSON.stringify(m)).toBe('paragraph[](text=) → bulleted-list[B|C](text=BC)')
    expect(errors).toEqual([])
  })

  test('S8: numbered list behaves like bulleted for mid-item split', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openDoc(page, [LIST('numbered-list', ['foobar'])])
    await caretAtLiOffset(page, 1, 0, 3)
    await pressEnter(page)
    const m = await readModel(page)
    expect(m[0].type, JSON.stringify(m)).toBe('numbered-list')
    expect(m[0].liTexts, JSON.stringify(m)).toEqual(['foo', 'bar'])
    expect(errors).toEqual([])
  })

  test('S9: plain paragraph mid-split still yields one clean split (no stray blocks)', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openDoc(page, [P({ html: 'foobar' })])
    await page.evaluate(() => {
      const el = document.querySelector('.block-row:nth-child(1) .block-content')
      el.focus()
      const tn = el.firstChild
      const r = document.createRange()
      r.setStart(tn, 3)
      r.collapse(true)
      const s = window.getSelection()
      s.removeAllRanges()
      s.addRange(r)
    })
    await pressEnter(page)
    const m = await readModel(page)
    expect(summarize(m)).toBe('paragraph[](text=foo) → paragraph[](text=bar)')
    expect(m.length, JSON.stringify(m)).toBe(2)
    expect(m[0].text, JSON.stringify(m)).toBe('foo')
    expect(m[1].text, JSON.stringify(m)).toBe('bar')
    expect(errors).toEqual([])
  })
})

test.describe('list merge permutations (Backspace)', () => {
  test('M1: Backspace at start of list merges previous paragraph INTO the list as first item', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openDoc(page, [P({ html: 'Hello' }), LIST('bulleted-list', ['A', 'B'])])
    await caretAtLiStart(page, 2, 0)
    await pressBackspace(page)
    const m = await readModel(page)
    expect(summarize(m), JSON.stringify(m)).toBe('bulleted-list[Hello|A|B](text=HelloAB)')
    expect(m.length, JSON.stringify(m)).toBe(1)
    expect(errors).toEqual([])
  })

  test('M2: Backspace at start of a list after another list concatenates items', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openDoc(page, [LIST('bulleted-list', ['A', 'B']), LIST('bulleted-list', ['C', 'D'])])
    await caretAtLiStart(page, 2, 0)
    await pressBackspace(page)
    const m = await readModel(page)
    expect(summarize(m), JSON.stringify(m)).toBe('bulleted-list[A|B|C|D](text=ABCD)')
    expect(m.length, JSON.stringify(m)).toBe(1)
    expect(errors).toEqual([])
  })

  test('M3: Backspace on an empty middle item removes that item natively', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openDoc(page, [LIST('bulleted-list', ['A', '', 'B'])])
    await caretAtLiStart(page, 1, 1)
    await pressBackspace(page)
    const m = await readModel(page)
    expect(m[0].liTexts, JSON.stringify(m)).toEqual(['A', 'B'])
    expect(errors).toEqual([])
  })

  test('M4: Backspace at start of an empty paragraph after a list deletes it', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openDoc(page, [LIST('bulleted-list', ['A', 'B']), P()])
    await setCaretPlain(page, 2, 0)
    await pressBackspace(page)
    const m = await readModel(page)
    expect(m.length, JSON.stringify(m)).toBe(1)
    expect(m[0].liTexts, JSON.stringify(m)).toEqual(['A', 'B'])
    expect(errors).toEqual([])
  })

  test('M5: Backspace at start of a text paragraph after a list makes it the last item', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openDoc(page, [LIST('bulleted-list', ['A', 'B']), P({ html: 'Tail' })])
    await setCaretPlain(page, 2, 0)
    await pressBackspace(page)
    const m = await readModel(page)
    expect(summarize(m), JSON.stringify(m)).toBe('bulleted-list[A|B|Tail](text=ABTail)')
    expect(m.length, JSON.stringify(m)).toBe(1)
    expect(errors).toEqual([])
  })

  test('M6: Backspace at start of the first block does nothing', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openDoc(page, [LIST('bulleted-list', ['A', 'B'])])
    await caretAtLiStart(page, 1, 0)
    await pressBackspace(page)
    const m = await readModel(page)
    expect(summarize(m), JSON.stringify(m)).toBe('bulleted-list[A|B](text=AB)')
    expect(errors).toEqual([])
  })

  test('M7: Backspace at start of a list after a heading/quote inlines into previous (no crash, text kept)', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openDoc(page, [{ id: NID(), type: 'quote', html: 'Q' }, LIST('bulleted-list', ['A'])])
    await caretAtLiStart(page, 2, 0)
    await pressBackspace(page)
    const m = await readModel(page)
    expect(m.length, JSON.stringify(m)).toBe(1)
    expect(m[0].text, JSON.stringify(m)).toBe('QA')
    expect(errors).toEqual([])
  })

  test('M8: Backspace at start of the second item joins it into the first item', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openDoc(page, [LIST('bulleted-list', ['A', 'B'])])
    await caretAtLiStart(page, 1, 1)
    await pressBackspace(page)
    const m = await readModel(page)
    expect(m[0].liTexts, JSON.stringify(m)).toEqual(['AB'])
    expect(m[0].liTexts.length, JSON.stringify(m)).toBe(1)
    expect(errors).toEqual([])
  })

  test('M9: numbered -> bulleted merge keeps text and takes the previous block type', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openDoc(page, [LIST('bulleted-list', ['A']), LIST('numbered-list', ['B'])])
    await caretAtLiStart(page, 2, 0)
    await pressBackspace(page)
    const m = await readModel(page)
    expect(m.length, JSON.stringify(m)).toBe(1)
    expect(m[0].type, JSON.stringify(m)).toBe('bulleted-list')
    expect(m[0].liTexts, JSON.stringify(m)).toEqual(['A', 'B'])
    expect(errors).toEqual([])
  })
})

// Plain-paragraph caret placement (non-list block), mirroring _helpers setCaret.
async function setCaretPlain(page, column, offset = 0) {
  await page.evaluate(({ col, off }) => {
    const el = document.querySelector(`.block-row:nth-child(${col}) .block-content`)
    el.focus()
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const tn = walker.nextNode()
    if (!tn) return
    const o = Math.max(0, Math.min(off ?? 0, tn.textContent.length))
    const r = document.createRange()
    r.setStart(tn, o)
    r.collapse(true)
    const s = window.getSelection()
    s.removeAllRanges()
    s.addRange(r)
  }, { col: column, off: offset })
}