import { htmlTextLength } from './document-model'

export function isCaretAtBlockStart(element, selection, node = selection.anchorNode, offset = selection.anchorOffset) {
  if (!node || (!element.contains(node) && node !== element)) return false
  const beforeCaret = document.createRange()
  beforeCaret.selectNodeContents(element)
  beforeCaret.setEnd(node, offset)
  const fragment = beforeCaret.cloneContents()
  const textBeforeCaret = fragment.textContent.replace(/[\u00a0\u200b]/g, '').trim()
  return !textBeforeCaret && !fragment.querySelector('br, img, hr, video, iframe')
}

function blockElementForNode(node) {
  if (!node) return null
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
  return element?.closest?.('[data-block-id]') || null
}

function textOffsetAtPoint(element, node, offset) {
  if (!node || (!element.contains(node) && node !== element)) return 0
  const range = document.createRange()
  range.selectNodeContents(element)
  range.setEnd(node, offset)
  return range.toString().length
}

function textPointAtOffset(element, offset) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let remaining = Math.max(0, offset)
  let textNode = walker.nextNode()

  while (textNode) {
    const textLength = textNode.textContent.length
    if (remaining < textLength) return { node: textNode, offset: remaining }
    if (remaining === textLength) {
      const nextTextNode = walker.nextNode()
      if (nextTextNode) return { node: nextTextNode, offset: 0 }
      return { node: textNode, offset: textLength }
    }
    remaining -= textLength
    textNode = walker.nextNode()
  }

  const caretTarget = element.querySelector('li') || element
  if (!htmlTextLength(element.innerHTML)) return { node: caretTarget, offset: 0 }
  return { node: element, offset: element.childNodes.length }
}

function setSelectionBetweenBlocks(anchor, focus) {
  const anchorElement = document.querySelector(`[data-block-id="${anchor.id}"]`)
  const focusElement = document.querySelector(`[data-block-id="${focus.id}"]`)
  if (!anchorElement || !focusElement) return

  const anchorPoint = textPointAtOffset(anchorElement, anchor.offset)
  const focusPoint = textPointAtOffset(focusElement, focus.offset)
  focusElement.focus()
  const selection = window.getSelection()

  if (selection.setBaseAndExtent) {
    selection.setBaseAndExtent(anchorPoint.node, anchorPoint.offset, focusPoint.node, focusPoint.offset)
    return
  }

  const range = document.createRange()
  const sameElement = anchorElement === focusElement
  const anchorBeforeFocus = sameElement
    ? anchor.offset <= focus.offset
    : Boolean(anchorElement.compareDocumentPosition(focusElement) & Node.DOCUMENT_POSITION_FOLLOWING)
  if (anchorBeforeFocus) {
    range.setStart(anchorPoint.node, anchorPoint.offset)
    range.setEnd(focusPoint.node, focusPoint.offset)
  } else {
    range.setStart(focusPoint.node, focusPoint.offset)
    range.setEnd(anchorPoint.node, anchorPoint.offset)
  }
  selection.removeAllRanges()
  selection.addRange(range)
}

function adjacentBlockElement(element, direction) {
  const blocks = [...document.querySelectorAll('.document-canvas [data-block-id]')]
  const index = blocks.indexOf(element)
  let targetIndex = index + 1
  if (direction === 'previous') targetIndex = index - 1
  return targetIndex >= 0 && targetIndex < blocks.length ? blocks[targetIndex] : null
}

function caretIsOnFirstLine(element, selection) {
  const range = document.createRange()
  range.setStart(selection.focusNode, selection.focusOffset)
  range.collapse(true)
  const caretRect = range.getBoundingClientRect()
  const blockRect = element.getBoundingClientRect()
  const lineHeight = parseFloat(getComputedStyle(element).lineHeight) || 24
  return caretRect.top <= blockRect.top + lineHeight * 0.7
}

function caretIsOnLastLine(element, selection) {
  const range = document.createRange()
  range.setStart(selection.focusNode, selection.focusOffset)
  range.collapse(true)
  const caretRect = range.getBoundingClientRect()
  const blockRect = element.getBoundingClientRect()
  const lineHeight = parseFloat(getComputedStyle(element).lineHeight) || 24
  return caretRect.bottom >= blockRect.bottom - lineHeight * 0.7
}

function caretRectAtPoint(node, offset) {
  if (!node) return null
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  return range.getBoundingClientRect()
}

function verticalTargetOffset(element, sourceX, direction) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const points = []
  let textNode = walker.nextNode()
  let baseOffset = 0

  while (textNode) {
    const textLength = textNode.textContent.length
    for (let offset = 0; offset <= textLength; offset += 1) {
      const rect = caretRectAtPoint(textNode, offset)
      if (rect?.height) points.push({ offset: baseOffset + offset, left: rect.left, top: rect.top })
    }
    baseOffset += textLength
    textNode = walker.nextNode()
  }

  if (!points.length) return 0

  const targetTop = direction === 'previous'
    ? Math.max(...points.map((point) => point.top))
    : Math.min(...points.map((point) => point.top))
  const lineHeight = parseFloat(getComputedStyle(element).lineHeight) || 24
  const rowPoints = points.filter((point) => Math.abs(point.top - targetTop) <= Math.max(2, lineHeight * 0.35))
  let candidates = rowPoints
  if (!candidates.length) candidates = points
  const closest = candidates.reduce((current, point) => {
    if (Math.abs(point.left - sourceX) < Math.abs(current.left - sourceX)) return point
    return current
  })
  return closest.offset
}

function moveToAdjacentBlock(element, direction, extendSelection, selectionAnchorRef, textOffset) {
  const target = adjacentBlockElement(element, direction)
  if (!target) return false

  const selection = window.getSelection()
  let targetOffset = textOffset
  if (targetOffset === undefined) {
    targetOffset = direction === 'previous' ? htmlTextLength(target.innerHTML) : 0
  }

  if (extendSelection) {
    if (!selectionAnchorRef.current) {
      const anchorElement = blockElementForNode(selection.anchorNode) || element
      selectionAnchorRef.current = {
        id: anchorElement.dataset.blockId,
        offset: textOffsetAtPoint(anchorElement, selection.anchorNode, selection.anchorOffset),
      }
    }
    setSelectionBetweenBlocks(selectionAnchorRef.current, { id: target.dataset.blockId, offset: targetOffset })
  } else {
    selectionAnchorRef.current = null
    focusBlockAtTextOffset(target.dataset.blockId, targetOffset)
  }
  return true
}

export function handleArrowNavigation(event, element, selectionAnchorRef) {
  if (!element || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || event.altKey || event.metaKey || event.ctrlKey) return false
  const selection = window.getSelection()
  if (!selection?.rangeCount || !selection.focusNode) return false

  const focusElement = blockElementForNode(selection.focusNode) || element
  const range = selection.getRangeAt(0)
  const startElement = blockElementForNode(range.startContainer)
  const endElement = blockElementForNode(range.endContainer)
  const crossesBlocks = startElement && endElement && startElement !== endElement

  if (crossesBlocks && !event.shiftKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    const collapseToStart = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    let node = range.endContainer
    let offset = range.endOffset
    let targetElement = endElement
    if (collapseToStart) {
      node = range.startContainer
      offset = range.startOffset
      targetElement = startElement
    }
    event.preventDefault()
    selectionAnchorRef.current = null
    focusBlockAtTextOffset(targetElement.dataset.blockId, textOffsetAtPoint(targetElement, node, offset))
    return true
  }

  const focusAtStart = isCaretAtBlockStart(focusElement, selection, selection.focusNode, selection.focusOffset)
  const focusOffset = textOffsetAtPoint(focusElement, selection.focusNode, selection.focusOffset)
  const focusAtEnd = focusOffset >= htmlTextLength(focusElement.innerHTML)
  const canCrossSelection = selection.isCollapsed || event.shiftKey
  if (!canCrossSelection) return false

  if (event.shiftKey && selectionAnchorRef.current && focusElement !== element && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    let step = 1
    if (event.key === 'ArrowLeft') step = -1
    const nextOffset = focusOffset + step
    if (nextOffset >= 0 && nextOffset <= htmlTextLength(focusElement.innerHTML)) {
      event.preventDefault()
      setSelectionBetweenBlocks(selectionAnchorRef.current, { id: focusElement.dataset.blockId, offset: nextOffset })
      return true
    }
  }

  let direction = null
  let targetOffset
  if (event.key === 'ArrowLeft' && focusAtStart) direction = 'previous'
  if (event.key === 'ArrowRight' && focusAtEnd) direction = 'next'
  if (event.key === 'ArrowUp' && caretIsOnFirstLine(focusElement, selection)) {
    direction = 'previous'
    const caretRect = caretRectAtPoint(selection.focusNode, selection.focusOffset)
    const target = adjacentBlockElement(focusElement, direction)
    targetOffset = target && caretRect ? verticalTargetOffset(target, caretRect.left, direction) : undefined
  }
  if (event.key === 'ArrowDown' && caretIsOnLastLine(focusElement, selection)) {
    direction = 'next'
    const caretRect = caretRectAtPoint(selection.focusNode, selection.focusOffset)
    const target = adjacentBlockElement(focusElement, direction)
    targetOffset = target && caretRect ? verticalTargetOffset(target, caretRect.left, direction) : undefined
  }
  if (!direction) return false

  event.preventDefault()
  return moveToAdjacentBlock(focusElement, direction, event.shiftKey, selectionAnchorRef, targetOffset)
}

export function focusBlockStart(id) {
  const element = document.querySelector(`[data-block-id="${id}"]`)
  if (!element) return
  const caretTarget = element.querySelector('li') || element
  caretTarget.focus()
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(caretTarget)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

export function focusBlockAtTextOffset(id, offset, attempt = 0) {
  const element = document.querySelector(`[data-block-id="${id}"]`)
  if (!element) {
    if (attempt < 4) requestAnimationFrame(() => focusBlockAtTextOffset(id, offset, attempt + 1))
    return
  }

  element.focus()
  const selection = window.getSelection()
  const range = document.createRange()
  const point = textPointAtOffset(element, offset)
  range.setStart(point.node, point.offset)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

export function scheduleCaretAtTextOffset(id, offset) {
  requestAnimationFrame(() => requestAnimationFrame(() => focusBlockAtTextOffset(id, offset)))
}
