import { test, expect } from '@playwright/test'
import { openApp, collectPageErrors, selectRange, storedHtml, jsonPanelText } from './_helpers.js'

// Block HTML must stay clean: no empty style attributes (<i style="">), no
// execCommand toggle-off wrappers (<b style="font-weight: normal">), no inert
// <span> leftovers. Checks the live DOM (which must equal stored state) and the
// JSON panel text.

test.describe('block html cleaning', () => {
  test('C1: italic toggle never stores <i style=""> and unwraps on toggle-off', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const heading = 'A small idea, made legible.'

    await selectRange(page, 'intro', 8, 18)
    await page.getByRole('button', { name: 'Italic' }).click()
    await page.waitForTimeout(120)
    let html = await storedHtml(page, 'intro')
    expect(html, JSON.stringify(html)).not.toContain('style')
    expect(html, JSON.stringify(html)).toMatch(/<(i|em)>idea, made<\/(i|em)>/)

    await selectRange(page, 'intro', 8, 18)
    await page.getByRole('button', { name: 'Italic' }).click()
    await page.waitForTimeout(120)
    html = await storedHtml(page, 'intro')
    expect(html, JSON.stringify(html)).toBe(heading)
    expect(await jsonPanelText(page), 'json panel').not.toContain('style')
    expect(errors).toEqual([])
  })

  test('C2: bold toggle-off removes the font-weight: normal wrapper', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const lead = 'Good documents do not just hold information. They give the reader a path through it. Papertrail lets you shape that path one clear block at a time.'

    await selectRange(page, 'lead', 5, 14)
    await page.getByRole('button', { name: 'Bold' }).click()
    await page.waitForTimeout(120)
    let html = await storedHtml(page, 'lead')
    expect(html, JSON.stringify(html)).not.toContain('style')
    expect(html, JSON.stringify(html)).toMatch(/<(b|strong)>documents<\/(b|strong)>/)

    await selectRange(page, 'lead', 5, 14)
    await page.getByRole('button', { name: 'Bold' }).click()
    await page.waitForTimeout(120)
    html = await storedHtml(page, 'lead')
    expect(html, JSON.stringify(html)).toBe(lead)
    expect(await jsonPanelText(page), 'json panel').not.toContain('style')
    expect(errors).toEqual([])
  })

  test('C3: dirty markup written into a block is cleaned on input', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const dirty = '<i style="">dirty</i> <b style="font-weight: normal">off</b> <span>sp</span>'
    await page.evaluate((html) => {
      const el = document.querySelector('[data-block-id="closing"]')
      el.innerHTML = html
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, dirty)
    await page.waitForTimeout(120)
    const html = await storedHtml(page, 'closing')
    expect(html, JSON.stringify(html)).toBe('<i>dirty</i> off sp')
    expect(await jsonPanelText(page), 'json panel').not.toContain('style')
    expect(errors).toEqual([])
  })
})