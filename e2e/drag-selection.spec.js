import { test, expect } from '@playwright/test'
import { openApp, collectPageErrors, selectionState, coords, dragPoints } from './_helpers.js'

// Mouse-drag selection: shrink-back into the anchor block, and zigzag drags
// that must never stick at the next block's edge or jump to stale content.

test.describe('mouse drag selection', () => {
  test('T1: drag into lead then back into intro -> native within-intro selection', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const a = await coords(page, 'intro', 20)
    const b = await coords(page, 'lead', 60)
    const c = await coords(page, 'intro', 10)
    await dragPoints(page, [a, b, c], 10)
    const s = await selectionState(page)
    expect(s.overlay, JSON.stringify(s)).toBe(0)
    expect(s.collapsed, JSON.stringify(s)).toBe(false)
    expect(s.anchorBlock, JSON.stringify(s)).toBe('intro')
    expect(s.focusBlock, JSON.stringify(s)).toBe('intro')
    expect(!!s.text, JSON.stringify(s)).toBe(true)
    expect(errors).toEqual([])
  })

  test('T2: drag into lead, back to intro, then further left within intro', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const a = await coords(page, 'intro', 20)
    const b = await coords(page, 'lead', 60)
    const c = await coords(page, 'intro', 10)
    const d = await coords(page, 'intro', 4)
    await dragPoints(page, [a, b, c, d], 8)
    const s = await selectionState(page)
    expect(s.overlay, JSON.stringify(s)).toBe(0)
    expect(s.collapsed, JSON.stringify(s)).toBe(false)
    expect(s.anchorBlock, JSON.stringify(s)).toBe('intro')
    expect(s.focusBlock, JSON.stringify(s)).toBe('intro')
    expect(!!s.text, JSON.stringify(s)).toBe(true)
    expect(s.anchorOff === 4 || s.focusOff === 4, JSON.stringify(s)).toBe(true)
    expect(errors).toEqual([])
  })

  test('T3: pure same-block drag leaves a native selection after release', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const a = await coords(page, 'intro', 5)
    const b = await coords(page, 'intro', 20)
    await dragPoints(page, [a, b], 10)
    const s = await selectionState(page)
    expect(s.collapsed, JSON.stringify(s)).toBe(false)
    expect(s.anchorBlock, JSON.stringify(s)).toBe('intro')
    expect(s.focusBlock, JSON.stringify(s)).toBe('intro')
    expect(!!s.text, JSON.stringify(s)).toBe(true)
    expect(errors).toEqual([])
  })

  test('T4: zigzag ends with the cross-block model live in lead, no gutter bleed', async ({ page }) => {
    const errors = collectPageErrors(page)
    await openApp(page)
    const a = await coords(page, 'intro', 20)
    const b = await coords(page, 'lead', 60)
    const c = await coords(page, 'intro', 10)
    const d = await coords(page, 'lead', 40)
    await dragPoints(page, [a, b, c, d], 10)
    const s = await selectionState(page)
    expect(s.overlay, JSON.stringify(s)).toBeGreaterThan(0)
    expect(s.focusBlock, JSON.stringify(s)).toBe('lead')
    expect(s.anchorBlock, JSON.stringify(s)).toBe('lead')
    expect(s.collapsed, JSON.stringify(s)).toBe(true)
    expect(s.bleed, JSON.stringify(s)).toBe(false)
    expect(errors).toEqual([])
  })
})