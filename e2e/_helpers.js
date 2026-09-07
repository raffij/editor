// Shared helpers for the cross-block selection e2e suites.
// The document model (src/logic/document-model.js) seeds five blocks:
//   1. intro      h1 heading        - "A small idea, made legible."
//   2. lead       paragraph         - multi-line paragraph
//   3. quote      blockquote        - "Great minds like ours..."
//   4. principles bulleted-list (3 li) - "Start with a specific problem", ...
//   5. closing    paragraph         - "This canvas is backed..."

// Same-block selections are native `::selection`; cross-block selections are
// painted by the `.cross-selection-overlay` spans. A highlight must cover the
// text column only — never the 40px control gutter on the left of each block.

export async function openApp(page) {
  await page.goto('/')
  await page.waitForSelector('.block-row')
  await page.waitForTimeout(400)
}

export function collectPageErrors(page) {
  const errors = []
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push('CONSOLE: ' + m.text())
  })
  return errors
}

// Vertical centre of a text offset inside a block (drive mouse drags).
export const coords = (page, blockId, offset) =>
  page.evaluate(({ blockId, offset }) => {
    const el = document.querySelector(`[data-block-id="${blockId}"]`)
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let tn = walker.nextNode()
    let base = 0
    while (tn) {
      if (offset <= base + tn.textContent.length) {
        const o = Math.max(0, Math.min(tn.textContent.length, offset - base))
        const r = document.createRange()
        r.setStart(tn, o)
        r.setEnd(tn, o)
        const b = r.getBoundingClientRect()
        return { x: b.left, y: b.top + b.height / 2 }
      }
      base += tn.textContent.length
      tn = walker.nextNode()
    }
    const r = document.createRange()
    r.selectNodeContents(el)
    r.collapse(false)
    const b = r.getBoundingClientRect()
    return { x: b.right - 2, y: b.top + b.height / 2 }
  }, { blockId, offset })

// Place a collapsed caret at a text offset in block `column` (1-based row).
export const setCaret = (page, column, offset = 0) =>
  page.evaluate(({ col, off }) => {
    const el = document.querySelector(`.block-row:nth-child(${col}) .block-content`)
    el.focus()
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const tn = walker.nextNode()
    const o = Math.max(0, Math.min(off ?? 0, tn.textContent.length))
    const r = document.createRange()
    r.setStart(tn, o)
    r.collapse(true)
    const s = window.getSelection()
    s.removeAllRanges()
    s.addRange(r)
    return { id: el.dataset.blockId, offset: o }
  }, { col: column, off: offset })

// Selection + overlay state, including whether any highlight bleeds into the
// 40px control gutter column (the bug this suite guards: highlights must cover
// text only, never the block marker / index cells on the left).
export const selectionState = (page) =>
  page.evaluate(() => {
    const blockOf = (n) => {
      const el = n && (n.nodeType === 1 ? n : n.parentElement)
      return el?.closest?.('[data-block-id]')?.dataset.blockId ?? null
    }
    const selOff = (n, o) => {
      const b = blockOf(n)
      const E = b ? document.querySelector(`[data-block-id="${b}"]`) : null
      if (!E || !E.contains(n)) return null
      const r = document.createRange()
      r.selectNodeContents(E)
      r.setEnd(n, o)
      return r.toString().length
    }
    const sel = window.getSelection()
    const spans = [...document.querySelectorAll('.cross-selection-overlay span')].map((s) => {
      const r = s.getBoundingClientRect()
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) }
    })
    const contentLeft = Math.min(...[...document.querySelectorAll('.block-content')].map((el) => el.getBoundingClientRect().left))
    return {
      count: spans.length,
      ySpan: spans.length ? Math.round(Math.max(...spans.map((s) => s.bottom)) - Math.min(...spans.map((s) => s.top))) : 0,
      topRows: spans.slice(0, 3),
      bleed: spans.some((s) => s.left < contentLeft - 1),
      collapsed: sel.isCollapsed,
      anchorBlock: blockOf(sel.anchorNode),
      focusBlock: blockOf(sel.focusNode),
      anchorOff: selOff(sel.anchorNode, sel.anchorOffset),
      focusOff: selOff(sel.focusNode, sel.focusOffset),
      focusOffset: sel.focusOffset ?? null,
      textLen: sel.toString().length,
      text: sel.isCollapsed ? null : sel.toString().slice(0, 60),
      overlay: spans.length,
    }
  })

export const readDoc = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.block-row .block-content')].map((el) => el.textContent || '').join('\u0001'),
  )

export const readBlocks = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.block-row .block-content')].map((el) => ({ id: el.dataset.blockId, text: el.textContent || '' })),
  )

// Synthetic ClipboardEvent on document; `defaultPrevented` means our handler ran.
export const fireClipboard = (page, type) =>
  page.evaluate((t) => {
    try {
      const dt = new DataTransfer()
      const ev = new ClipboardEvent(t, { clipboardData: dt, bubbles: true, cancelable: true })
      document.dispatchEvent(ev)
      return { handled: ev.defaultPrevented, text: dt.getData('text/plain') }
    } catch (err) {
      return { handled: false, text: '', error: String(err) }
    }
  }, type)

export const box = (page, column) =>
  page.locator(`.block-row:nth-child(${column}) .block-content`).boundingBox()

export async function drag(page, fromBox, toBox, steps = 10) {
  await page.mouse.move(fromBox.x + Math.min(80, fromBox.width - 10), fromBox.y + fromBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(toBox.x + Math.min(80, toBox.width - 10), toBox.y + toBox.height / 2, { steps })
  await page.mouse.up()
  await page.waitForTimeout(150)
}

export async function dragPoints(page, points, steps = 8) {
  await page.mouse.move(points[0].x, points[0].y)
  await page.mouse.down()
  for (let i = 1; i < points.length; i++) await page.mouse.move(points[i].x, points[i].y, { steps })
  await page.mouse.up()
  await page.waitForTimeout(250)
  return selectionState(page)
}