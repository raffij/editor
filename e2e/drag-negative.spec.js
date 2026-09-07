import { test, expect } from '@playwright/test'
import { openApp, collectPageErrors, selectionState, coords, fireClipboard, dragPoints } from './_helpers.js'

// Negative (backward) drags: selection still highlights, copy stays
// document-ordered, and dragging back into the anchor block collapses to a
// native within-block selection.

const drag = async (page, points) => dragPoints(page, points)

test.describe('negative (backward) drags', () => {
  test('N1: same-block backward drag highlights', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const a20 = await coords(page, 'intro', 20)
    const a4 = await coords(page, 'intro', 4)
    const s = await drag(page, [a20, a4])
    expect(s.collapsed, JSON.stringify(s)).toBe(false)
    expect(s.anchorBlock, JSON.stringify(s)).toBe('intro')
    expect(s.focusBlock, JSON.stringify(s)).toBe('intro')
    expect(!!s.text, JSON.stringify(s)).toBe(true)
    expect(errors).toEqual([])
  })

  test('N2: backward cross-block drag shows overlay + document-ordered copy, no bleed', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const l60 = await coords(page, 'lead', 60)
    const i10 = await coords(page, 'intro', 10)
    const s = await drag(page, [l60, i10])
    expect(s.overlay, JSON.stringify(s)).toBeGreaterThan(0)
    expect(s.focusBlock, JSON.stringify(s)).toBe('intro')
    expect(s.bleed, JSON.stringify(s)).toBe(false)
    const copy = await fireClipboard(page, 'copy')
    expect(copy.handled).toBe(true)
    expect(copy.text.startsWith('ea, made legible.'), JSON.stringify(copy.text.slice(0, 60))).toBe(true)
    expect(copy.text.includes('Good documents'), JSON.stringify(copy.text.slice(0, 60))).toBe(true)
    expect(copy.text.includes('\n\n'), JSON.stringify(copy.text.slice(0, 60))).toBe(false)
    expect(errors).toEqual([])
  })

  test('N3: backward drag returning to the anchor block -> native selection in lead', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const l60 = await coords(page, 'lead', 60)
    const i10 = await coords(page, 'intro', 10)
    const l70 = await coords(page, 'lead', 70)
    const s = await drag(page, [l60, i10, l70])
    expect(s.overlay, JSON.stringify(s)).toBe(0)
    expect(s.collapsed, JSON.stringify(s)).toBe(false)
    expect(s.anchorBlock, JSON.stringify(s)).toBe('lead')
    expect(s.focusBlock, JSON.stringify(s)).toBe('lead')
    expect(!!s.text, JSON.stringify(s)).toBe(true)
    expect(errors).toEqual([])
  })

  test('N4: backward drag into the list shows overlay + clean ordered copy', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const c40 = await coords(page, 'closing', 40)
    const p35 = await coords(page, 'principles', 35)
    const s = await drag(page, [c40, p35])
    expect(s.overlay, JSON.stringify(s)).toBeGreaterThan(0)
    expect(s.focusBlock, JSON.stringify(s)).toBe('principles')
    expect(s.bleed, JSON.stringify(s)).toBe(false)
    const copy2 = await fireClipboard(page, 'copy')
    expect(copy2.handled).toBe(true)
    expect(copy2.text.includes('room to breathe'), JSON.stringify(copy2.text.slice(0, 80))).toBe(true)
    expect(copy2.text.includes('This canvas is backed'), JSON.stringify(copy2.text.slice(0, 80))).toBe(true)
    expect(copy2.text.includes('•'), JSON.stringify(copy2.text.slice(0, 80))).toBe(false)
    expect(errors).toEqual([])
  })

  test('N5: within-list backward drag highlights', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const p55 = await coords(page, 'principles', 55)
    const p5 = await coords(page, 'principles', 5)
    const s = await drag(page, [p55, p5])
    expect(s.collapsed, JSON.stringify(s)).toBe(false)
    expect(s.anchorBlock, JSON.stringify(s)).toBe('principles')
    expect(s.focusBlock, JSON.stringify(s)).toBe('principles')
    expect(!!s.text, JSON.stringify(s)).toBe(true)
    expect(errors).toEqual([])
  })
})