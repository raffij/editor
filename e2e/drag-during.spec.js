import { test, expect } from '@playwright/test'
import { openApp, selectionState, coords, waitForStable } from './_helpers.js'

// Live highlighting DURING a drag, sampled while the mouse is still down.
// Headless Chromium cannot extend a live native drag selection, so this spec
// only runs in headed mode: `EDITOR_E2E_HEADED=1 npm run test:e2e:headed`.

const headed = !!process.env.EDITOR_E2E_HEADED

const midState = async (page, points) => {
  await page.mouse.move(points[0].x, points[0].y)
  await page.mouse.down()
  await page.mouse.move(points[1].x, points[1].y, { steps: 3 })
  await waitForStable(page)
  const mid = await selectionState(page)
  await page.mouse.up()
  await waitForStable(page)
  const end = await selectionState(page)
  return { mid, end }
}

test.describe('during-drag live highlighting (headed)', () => {
  test.skip(!headed, 'requires headed browsers (headless Chromium cannot extend live drag selections); run with EDITOR_E2E_HEADED=1')

  test('A: same-block backward drag highlights live while the mouse is down', async ({ page }) => {
    await openApp(page)
    const a = await coords(page, 'lead', 60)
    const b = await coords(page, 'lead', 20)
    const { mid, end } = await midState(page, [a, b])
    expect(mid.collapsed, JSON.stringify(mid)).toBe(false)
    expect(end.collapsed, JSON.stringify(end)).toBe(false)
  })

  test('B: cross-block backward drag paints the overlay live, no gutter bleed', async ({ page }) => {
    await openApp(page)
    const a = await coords(page, 'lead', 60)
    const b = await coords(page, 'intro', 10)
    const { mid, end } = await midState(page, [a, b])
    // The app collapses the DOM caret at the focus during a cross-block drag —
    // the overlay is the live highlight, so what must hold mid-drag is the
    // overlay being painted (text lines only, never the control gutter) and
    // the focus having reached the intro block.
    expect(mid.overlay, JSON.stringify(mid)).toBeGreaterThan(0)
    expect(mid.focusBlock, JSON.stringify(mid)).toBe('intro')
    expect(mid.bleed, JSON.stringify(mid)).toBe(false)
    expect(end.overlay, JSON.stringify(end)).toBeGreaterThan(0)
    expect(end.focusBlock, JSON.stringify(end)).toBe('intro')
  })

  test('C: same-block forward drag highlights live while the mouse is down', async ({ page }) => {
    await openApp(page)
    const a = await coords(page, 'lead', 10)
    const b = await coords(page, 'lead', 50)
    const { mid, end } = await midState(page, [a, b])
    expect(mid.collapsed, JSON.stringify(mid)).toBe(false)
    expect(end.collapsed, JSON.stringify(end)).toBe(false)
  })

  test('D: shrink-back into the anchor block materializes a live native selection', async ({ page }) => {
    await openApp(page)
    const a = await coords(page, 'intro', 20)
    const b = await coords(page, 'lead', 60)
    const c = await coords(page, 'intro', 10)
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move(b.x, b.y, { steps: 6 })
    await page.mouse.move(c.x, c.y, { steps: 5 })
    await waitForStable(page)
    const mid = await selectionState(page)
    await page.mouse.up()
    await waitForStable(page)
    const end = await selectionState(page)
    expect(mid.collapsed, JSON.stringify(mid)).toBe(false)
    expect(mid.anchorBlock, JSON.stringify(mid)).toBe('intro')
    expect(end.overlay, JSON.stringify(end)).toBe(0)
    expect(end.collapsed, JSON.stringify(end)).toBe(false)
    expect(end.anchorBlock, JSON.stringify(end)).toBe('intro')
  })
})