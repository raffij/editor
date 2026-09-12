import { test, expect } from '@playwright/test'
import { openApp, collectPageErrors, storedHtml, jsonPanelText, waitForStable } from './_helpers.js'

// Pasted content is sanitized down to the editor's own small HTML vocabulary
// (document-model.js: sanitizePastedHtml) before it reaches the block/JSON
// model — see block-editor.jsx's onPaste handler.

async function firePaste(page, blockId, { html, text } = {}) {
  await page.evaluate(({ blockId, html, text }) => {
    const el = document.querySelector(`[data-block-id="${blockId}"]`)
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)

    const clipboardData = new DataTransfer()
    if (html != null) clipboardData.setData('text/html', html)
    if (text != null) clipboardData.setData('text/plain', text)
    const event = new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })
    el.dispatchEvent(event)
  }, { blockId, html, text })
  await waitForStable(page)
}

test.describe('paste sanitization', () => {
  test('P1: table/div/styled span/image/script are stripped, basic formatting and links survive', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const dirty = '<table><tr><td>Cell</td></tr></table>'
      + '<div style="color:red">Styled</div>'
      + '<img src="x.png">'
      + '<script>window.__pwned = true</script>'
      + '<b>Bold</b> and <a href="https://example.com">a link</a>'

    await firePaste(page, 'closing', { html: dirty })

    const html = await storedHtml(page, 'closing')
    expect(html, JSON.stringify(html)).not.toMatch(/<table|<tr|<td|<div|<img|<script|style=/i)
    expect(html, JSON.stringify(html)).toMatch(/<(b|strong)>Bold<\/(b|strong)>/)
    expect(html, JSON.stringify(html)).toContain('<a href="https://example.com">a link</a>')
    expect(html, JSON.stringify(html)).toContain('Cell')

    const panel = await jsonPanelText(page)
    expect(panel).not.toMatch(/<table|<script|style=/i)
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined()
    expect(errors).toEqual([])
  })

  test('P2: multiple pasted paragraphs are flattened with line breaks, not concatenated', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const html = '<p>First paragraph</p><p>Second paragraph</p>'

    await firePaste(page, 'closing', { html })

    const stored = await storedHtml(page, 'closing')
    expect(stored, JSON.stringify(stored)).not.toMatch(/<p[ >]|<div/i)
    expect(stored, JSON.stringify(stored)).toContain('First paragraph')
    expect(stored, JSON.stringify(stored)).toContain('Second paragraph')
    expect(stored, JSON.stringify(stored)).toMatch(/First paragraph<br>Second paragraph/)
    expect(errors).toEqual([])
  })

  test('P3: pasted list items land as list items inside a list block', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const html = '<ul><li>Pasted one</li><li>Pasted two</li></ul>'

    await firePaste(page, 'principles', { html })

    const stored = await storedHtml(page, 'principles')
    expect(stored, JSON.stringify(stored)).toContain('<li>Pasted one</li>')
    expect(stored, JSON.stringify(stored)).toContain('<li>Pasted two</li>')
    expect(errors).toEqual([])
  })

  test('P4: plain-text paste with no HTML preserves newlines as line breaks and escapes any angle brackets', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    await firePaste(page, 'closing', { text: 'line one\nline two <not a tag>' })

    const stored = await storedHtml(page, 'closing')
    expect(stored, JSON.stringify(stored)).toContain('line one<br>line two')
    expect(stored, JSON.stringify(stored)).not.toContain('<not')
    expect(errors).toEqual([])
  })
})
