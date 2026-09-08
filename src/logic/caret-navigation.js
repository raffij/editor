import { cleanBlockHtml, htmlTextLength, mergeBlockContent } from './document-model'

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
      // Stay at the end of the current text node instead of jumping to the
      // next node's offset 0. For a list, that keeps an offset equal to one
      // li's text length on that li's own line, so the caret still counts as
      // being on the first visual line and a single Shift+Up from there
      // crosses back out of the list.
      return { node: textNode, offset: textLength }
    }
    remaining -= textLength
    textNode = walker.nextNode()
  }

  const caretTarget = element.querySelector('li') || element
  if (!htmlTextLength(element.innerHTML)) return { node: caretTarget, offset: 0 }
  return { node: element, offset: element.childNodes.length }
}

function collapseCaretAt(node, offset) {
  const selection = window.getSelection()
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

// Places a real, engine-visible selection spanning [startOffset, endOffset]
// inside a single block element. Used when a keyboard-extended cross-block
// selection is brought back into the anchor's own block: the cross-block model
// ends and the browser renders the within-block selection natively again.
function placeNativeBlockSelection(element, startOffset, endOffset) {
  if (!element) return
  element.focus({ preventScroll: true })
  const selection = window.getSelection()
  const start = textPointAtOffset(element, Math.min(startOffset, endOffset))
  const end = textPointAtOffset(element, Math.max(startOffset, endOffset))
  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  selection.removeAllRanges()
  selection.addRange(range)
}

// ---------------------------------------------------------------------------
// Synthetic cross-block selection
// ---------------------------------------------------------------------------
// Some engines (WebKit/Safari) clamp a DOM Selection to a single editing host,
// so a selection can never cross blocks there. We track the intended
// cross-block selection ourselves as { anchor, focus } model points, keep the
// DOM caret collapsed at the focus edge, and paint the highlight from a
// standalone cross-host Range (which browsers do allow). This also keeps
// behaviour identical in Chromium, where the DOM selection *would* span.
// ---------------------------------------------------------------------------

const crossBlockListeners = new Set()
let crossBlockModel = null

export function subscribeCrossBlockSelection(listener) {
  crossBlockListeners.add(listener)
  return () => crossBlockListeners.delete(listener)
}

export function getCrossBlockSelection() {
  return crossBlockModel
}

function notifyCrossBlockSelection() {
  for (const listener of crossBlockListeners) listener(crossBlockModel)
}

export function setCrossBlockSelection(anchor, focus) {
  if (!anchor || !focus) {
    clearCrossBlockSelection()
    return
  }
  // Note: same-id models (anchor and focus inside one block) are allowed; the
  // rects and text helpers handle them. The drag path uses one to keep the
  // overlay painting live while a selection shrinks back into its origin block.
  crossBlockModel = { anchor: { ...anchor }, focus: { ...focus } }
  const focusElement = document.querySelector(`[data-block-id="${focus.id}"]`)
  if (focusElement) {
    const point = textPointAtOffset(focusElement, focus.offset)
    collapseCaretAt(point.node, point.offset)
  }
  notifyCrossBlockSelection()
}

export function clearCrossBlockSelection() {
  if (!crossBlockModel) return
  crossBlockModel = null
  notifyCrossBlockSelection()
}

// Client rects of the intended cross-block selection, computed from the text
// line boxes only (independent of selection clamping). A bare cross-host Range
// also yields the block-level boxes of partially-contained rows — including the
// 40px gutter cell on the left of each block — so instead of one big Range we
// walk the text nodes between the two endpoints and union their line rects,
// matching exactly how a native text selection paints.
export function crossBlockSelectionRects() {
  if (!crossBlockModel) return []
  const { anchor, focus } = crossBlockModel
  const anchorElement = document.querySelector(`[data-block-id="${anchor.id}"]`)
  const focusElement = document.querySelector(`[data-block-id="${focus.id}"]`)
  if (!anchorElement || !focusElement) return []

  const anchorPoint = textPointAtOffset(anchorElement, anchor.offset)
  const focusPoint = textPointAtOffset(focusElement, focus.offset)
  const anchorBeforeFocus = anchorElement === focusElement
    ? anchor.offset <= focus.offset
    : Boolean(anchorElement.compareDocumentPosition(focusElement) & Node.DOCUMENT_POSITION_FOLLOWING)
  const startPoint = anchorBeforeFocus ? anchorPoint : focusPoint
  const endPoint = anchorBeforeFocus ? focusPoint : anchorPoint
  const startNode = startPoint.node
  const endNode = endPoint.node
  const startLen = startNode.data?.length ?? 0
  const endLen = endNode.data?.length ?? 0
  const startOff = Math.min(startLen, Math.max(0, startPoint.offset))
  const endOff = Math.min(endLen, Math.max(0, endPoint.offset))

  const rects = []
  const container = document.querySelector('.document-canvas') || startNode.parentElement?.closest('[data-block-id]')?.parentElement
  if (!container) return []
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  let inside = false
  while (node) {
    if (node === startNode) inside = true
    if (inside) {
      const dataLen = node.data?.length ?? 0
      // Only text inside an editing host is selection content: the gutter cells
      // (block marker letter + index number) are also text nodes, and their
      // line boxes live in the leftmost column, so they must be excluded.
      const insideHost = !!node.parentElement?.closest?.('.block-content')
      if (dataLen > 0 && insideHost) {
        const range = document.createRange()
        let from = 0
        let to = dataLen
        if (node === startNode && node === endNode) {
          from = Math.min(startOff, endOff)
          to = Math.max(startOff, endOff)
        } else if (node === startNode) {
          from = startOff
        } else if (node === endNode) {
          to = endOff
        }
        if (to > from) {
          range.setStart(node, from)
          range.setEnd(node, to)
          for (const rect of range.getClientRects()) {
            rects.push({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
          }
        }
      }
    }
    if (node === endNode) break
    node = walker.nextNode()
  }
  return rects
}

// Text content of the intended cross-block selection, in document order.
function crossBlockSelectionText() {
  if (!crossBlockModel) return null
  const edges = selectionEdges(crossBlockModel)
  if (!edges) return null
  const { start, end } = edges
  const blocks = [...document.querySelectorAll('.document-canvas [data-block-id]')]
  const startIndex = blocks.findIndex((element) => element.dataset.blockId === start.id)
  const endIndex = blocks.findIndex((element) => element.dataset.blockId === end.id)
  if (startIndex < 0 || endIndex < 0) return null

  const selected = blocks.slice(startIndex, endIndex + 1)
  return selected.map((element, index) => {
    let text = element.textContent || ''
    if (index === 0) text = text.slice(start.offset)
    if (index === selected.length - 1) text = text.slice(0, end.offset)
    return text
  }).join('\n')
}

// The edges of a cross-block selection re-ordered into document order.
function selectionEdges(model) {
  if (!model) return null
  const blocks = [...document.querySelectorAll('.document-canvas [data-block-id]')]
  const anchorIndex = blocks.findIndex((element) => element.dataset.blockId === model.anchor.id)
  const focusIndex = blocks.findIndex((element) => element.dataset.blockId === model.focus.id)
  if (anchorIndex < 0 || focusIndex < 0) return null
  const anchorBefore = anchorIndex < focusIndex || (anchorIndex === focusIndex && model.anchor.offset <= model.focus.offset)
  return anchorBefore
    ? { start: model.anchor, end: model.focus }
    : { start: model.focus, end: model.anchor }
}

// ---------------------------------------------------------------------------
// Cross-block range deletion
// ---------------------------------------------------------------------------

// Split the single text node that contains `offset` (global text offset across
// the container) at that offset, and return { beforeNode, afterNode } — the two
// halves. Assumes `offset` is inside a text node. Also returns the walker.
function splitTextAtOffset(container, offset) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let textNode = walker.nextNode()
  while (textNode && remaining > textNode.textContent.length) {
    remaining -= textNode.textContent.length
    textNode = walker.nextNode()
  }
  if (!textNode) return { beforeNode: null, afterNode: null, atBoundary: true, boundaryNode: null }
  if (remaining === textNode.textContent.length) {
    return { beforeNode: textNode, afterNode: textNode.nextSibling, atBoundary: true, boundaryNode: textNode }
  }
  const afterNode = textNode.splitText(remaining)
  return { beforeNode: textNode, afterNode, atBoundary: false, boundaryNode: textNode }
}

// Return the part of `html`'s text before `offset` as a standalone fragment of
// DOM nodes. List blocks are handled at the list-item granularity: only whole
// items fully before the cut are kept (a straddling item is trimmed to its
// before-cut portion); non-list content is trimmed by walking text nodes.
function prefixFragment(html, offset) {
  const container = document.createElement('div')
  container.innerHTML = html || ''
  const frag = document.createDocumentFragment()

  if (offset >= container.textContent.length) {
    while (container.firstChild) frag.appendChild(container.firstChild)
    return frag
  }
  if (offset <= 0) return frag

  const items = Array.from(container.querySelectorAll('li'))
  if (items.length) {
    let consumed = 0
    for (const li of items) {
      const len = li.textContent.length
      if (consumed + len <= offset) {
        frag.appendChild(li)
        consumed += len
      } else if (consumed < offset) {
        // Item straddles the cut: keep only its before-cut part.
        li.textContent = li.textContent.slice(0, offset - consumed)
        frag.appendChild(li)
        break
      } else {
        break
      }
    }
    return frag
  }

  const { beforeNode, atBoundary, boundaryNode } = splitTextAtOffset(container, offset)
  if (atBoundary) {
    let node = boundaryNode
    while (node) {
      const next = node.nextSibling
      node.parentNode.removeChild(node)
      node = next
    }
  } else if (beforeNode) {
    let node = beforeNode.nextSibling
    while (node) {
      const next = node.nextSibling
      node.parentNode.removeChild(node)
      node = next
    }
  }
  while (container.firstChild) frag.appendChild(container.firstChild)
  return frag
}

// Return the part of `html`'s text at/after `offset` as a fragment. Nodes
// wholly before the cut are dropped; the node containing the cut keeps only its
// after-cut portion. List blocks are handled at item granularity.
function suffixFragment(html, offset) {
  const container = document.createElement('div')
  container.innerHTML = html || ''
  const frag = document.createDocumentFragment()

  if (offset >= container.textContent.length) return frag
  if (offset <= 0) {
    while (container.firstChild) frag.appendChild(container.firstChild)
    return frag
  }

  const items = Array.from(container.querySelectorAll('li'))
  if (items.length) {
    let consumed = 0
    let started = false
    for (const li of items) {
      const len = li.textContent.length
      if (started) {
        frag.appendChild(li)
        continue
      }
      if (consumed + len <= offset) {
        consumed += len
      } else {
        // First item at/after the cut: keep its after-cut part as an item.
        li.textContent = li.textContent.slice(offset - consumed)
        frag.appendChild(li)
        started = true
      }
    }
    return frag
  }

  const { beforeNode, atBoundary, boundaryNode } = splitTextAtOffset(container, offset)
  if (atBoundary) {
    let node = boundaryNode.previousSibling
    while (node) {
      const prev = node.previousSibling
      node.parentNode.removeChild(node)
      node = prev
    }
  } else if (beforeNode) {
    let node = beforeNode.previousSibling
    while (node) {
      const prev = node.previousSibling
      node.parentNode.removeChild(node)
      node = prev
    }
  }
  while (container.firstChild) frag.appendChild(container.firstChild)
  return frag
}

// Remove the cross-block selection (the range between the selection edges) from
// the document model. Returns { blocks, caretId, caretOffset } describing the
// resulting document and where the caret should land, or null if nothing was
// deleted. The returned `blocks` is the full new block list.
export function deleteCrossBlockRange(blocks, model) {
  if (!model) return null
  const edges = selectionEdges(model)
  if (!edges) return null
  const { start, end } = edges

  const startBlock = blocks.find((b) => b.id === start.id)
  const endBlock = blocks.find((b) => b.id === end.id)
  if (!startBlock || !endBlock) return null
  if (start.offset === end.offset && start.id === end.id) return null

  // Same-block selection: just delete the interior text.
  if (start.id === end.id) {
    const container = document.createElement('div')
    container.innerHTML = startBlock.html || ''
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    let remaining = Math.max(start.offset, 0)
    let startNode = walker.nextNode()
    while (startNode && remaining > 0) {
      const len = startNode.textContent.length
      if (remaining < len) { startNode.splitText(remaining); break }
      remaining -= len
      startNode = walker.nextNode()
    }
    if (startNode && end.offset > start.offset) {
      let endRemaining = end.offset - start.offset
      let endNode = startNode
      while (endNode && endRemaining > 0) {
        const len = endNode.textContent.length
        if (endRemaining < len) { endNode.splitText(endRemaining); break }
        endRemaining -= len
        endNode = walker.nextNode()
      }
      const range = document.createRange()
      range.setStart(startNode, remaining)
      if (endNode) range.setEnd(endNode, endRemaining); else range.setEndAfter(startNode)
      range.deleteContents()
    }
    const updated = blocks.map((b) => b.id === startBlock.id ? { ...b, html: cleanBlockHtml(container.innerHTML) } : b)
    return { blocks: updated, caretId: startBlock.id, caretOffset: Math.min(start.offset, end.offset) }
  }

  // Multi-block selection.
  const startIndex = blocks.findIndex((b) => b.id === start.id)
  const endIndex = blocks.findIndex((b) => b.id === end.id)

  const startFrag = prefixFragment(startBlock.html || '', start.offset)
  const endFrag = suffixFragment(endBlock.html || '', end.offset)
  const serialize = (frag) => {
    const out = document.createElement('div')
    out.appendChild(frag.cloneNode(true))
    return out.innerHTML
  }
  const startHtml = serialize(startFrag)
  const endHtml = serialize(endFrag)

  // Merge the surviving pieces (start prefix + end suffix) into a single block
  // using the same list-aware merge the Backspace-at-start path uses, so list
  // structure stays valid when lists straddle the cut. When one side is empty,
  // the survivor is just the other side (avoids appending an empty <li>).
  let mergedHtml
  if (startHtml && endHtml) {
    mergedHtml = mergeBlockContent(
      { html: startHtml, type: startBlock.type },
      { html: endHtml, type: endBlock.type },
    )
  } else {
    mergedHtml = startHtml || endHtml
  }

  // Remove the middle + end blocks and keep the start block (with the merged
  // survivors) in its original position. Keeping the start block guarantees at
  // least one block survives even if the selection covered the whole document.
  const deletedIds = new Set(blocks.slice(startIndex, endIndex + 1).map((b) => b.id))
  const remaining = blocks.filter((b) => !deletedIds.has(b.id))
  const survivor = { ...startBlock, html: cleanBlockHtml(mergedHtml) }
  const next = [...remaining.slice(0, startIndex), survivor, ...remaining.slice(startIndex)]

  return { blocks: next, caretId: startBlock.id, caretOffset: htmlTextLength(mergedHtml) }
}

let crossBlockDeleteHandler = null
export function setCrossBlockDeleteHandler(handler) {
  crossBlockDeleteHandler = handler
}

export function handleCrossBlockCopy(event) {
  if (!crossBlockModel) return false
  const text = crossBlockSelectionText()
  if (text === null) return false
  event.clipboardData.setData('text/plain', text)
  event.preventDefault()
  return true
}

export function handleCrossBlockCut(event) {
  if (!handleCrossBlockCopy(event)) return false
  // Preserve the document: collapse the selection to its start rather than
  // letting the browser mutate several editing hosts at once.
  const edges = selectionEdges(crossBlockModel)
  clearCrossBlockSelection()
  if (edges) {
    const element = document.querySelector(`[data-block-id="${edges.start.id}"]`)
    if (element) {
      element.focus({ preventScroll: true })
      const point = textPointAtOffset(element, edges.start.offset)
      collapseCaretAt(point.node, point.offset)
    }
  }
  return true
}

if (typeof document !== 'undefined') {
  document.addEventListener('copy', handleCrossBlockCopy)
  document.addEventListener('cut', handleCrossBlockCut)
  document.addEventListener('mousedown', () => clearCrossBlockSelection(), true)
  document.addEventListener('input', () => clearCrossBlockSelection(), true)

  // Keep the model's focus edge in sync with the live caret. While a
  // cross-block selection is active, native movement of the caret within the
  // focus block (e.g. Shift+Arrow up/down through its lines) must be reflected
  // in the model so the overlay and the copied text stay accurate.
  document.addEventListener('selectionchange', () => {
    if (!crossBlockModel) return
    const selection = window.getSelection()
    if (!selection?.focusNode) return
    const element = blockElementForNode(selection.focusNode)
    if (!element) return
    const blockId = element.dataset.blockId
    if (blockId === crossBlockModel.anchor.id) {
      // The focus edge moved back into the anchor's block (native arrow at a
      // block boundary): finish the selection natively inside that block.
      const anchorPoint = crossBlockModel.anchor
      const offset = textOffsetAtPoint(element, selection.focusNode, selection.focusOffset)
      if (crossBlockModel) clearCrossBlockSelection()
      placeNativeBlockSelection(element, anchorPoint.offset, offset)
      return
    }
    if (blockId !== crossBlockModel.focus.id) return
    const offset = textOffsetAtPoint(element, selection.focusNode, selection.focusOffset)
    if (offset === crossBlockModel.focus.offset) return
    crossBlockModel = { ...crossBlockModel, focus: { id: blockId, offset } }
    notifyCrossBlockSelection()
  })
}

// ---------------------------------------------------------------------------
// Mouse drag selection across blocks
// ---------------------------------------------------------------------------

export function pointFromClientPosition(clientX, clientY) {
  if (typeof document.caretRangeFromPoint === 'function') {
    const range = document.caretRangeFromPoint(clientX, clientY)
    if (range) return { node: range.startContainer, offset: range.startOffset }
  }
  if (typeof document.caretPositionFromPoint === 'function') {
    const position = document.caretPositionFromPoint(clientX, clientY)
    if (position?.offsetNode) return { node: position.offsetNode, offset: position.offset }
  }
  return null
}

let dragAnchor = null
let dragLastPoint = null
let dragActive = false

function onDragMouseMove(event) {
  updateBlockDragSelection(event)
}

function onDragMouseUp() {
  endBlockDragSelection()
}

function onDragBlur() {
  endBlockDragSelection()
}

// Begins a mouse drag selection session. Called on mousedown inside a block:
// the anchor point is resolved immediately from the pointer position, so the
// drag can extend into other blocks without relying on the native selection.
export function beginBlockDragSelection(event) {
  if (event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return
  const point = pointFromClientPosition(event.clientX, event.clientY)
  const element = point ? blockElementForNode(point.node) : null
  if (!point || !element?.isContentEditable || !element.contains(point.node)) return
  dragAnchor = { id: element.dataset.blockId, offset: textOffsetAtPoint(element, point.node, point.offset) }
  dragLastPoint = null
  if (dragActive) return
  dragActive = true
  document.addEventListener('mousemove', onDragMouseMove)
  document.addEventListener('mouseup', onDragMouseUp)
  window.addEventListener('blur', onDragBlur)
}

// Extends the drag selection to the block under the pointer on every mousemove.
export function updateBlockDragSelection(event) {
  if (!dragAnchor) return
  const point = pointFromClientPosition(event.clientX, event.clientY)
  if (!point) return
  const element = blockElementForNode(point.node)
  if (!element?.isContentEditable || !element.contains(point.node)) return
  const focus = { id: element.dataset.blockId, offset: textOffsetAtPoint(element, point.node, point.offset) }
  dragLastPoint = focus
  if (focus.id === dragAnchor.id) {
    if (crossBlockModel) {
      // The pointer is back inside the block the drag started in, after having
      // crossed into other blocks. Keep the overlay alive as a same-block model
      // so the shrinking selection paints live in every engine (a native
      // selection injected per mousemove is blanked by the browser's own drag
      // handling until release). The model is materialized into a real
      // within-block native selection on mouseup.
      setCrossBlockSelection(dragAnchor, focus)
    }
    // If the drag never left this block, do nothing: the browser's own native
    // drag selection paints live in either direction. Injecting a programmatic
    // range on every mousemove here makes backward drags render blank until
    // release, because the browser overrides the range with its drag caret.
    return
  }
  setCrossBlockSelection(dragAnchor, focus)
}

export function endBlockDragSelection() {
  const lastAnchor = dragAnchor
  const lastPoint = dragLastPoint
  dragAnchor = null
  dragLastPoint = null
  if (!dragActive) return
  dragActive = false
  document.removeEventListener('mousemove', onDragMouseMove)
  document.removeEventListener('mouseup', onDragMouseUp)
  window.removeEventListener('blur', onDragBlur)

  // If the drag finished inside the block it started in, materialize a real
  // within-block selection from where the drag began to where the pointer
  // released. During the drag this state is either handled natively by the
  // browser (never crossed blocks) or painted by the overlay (shrunk back
  // after crossing); on release, a same-block selection must be a live native
  // selection the browser owns.
  if (lastAnchor && lastPoint && lastPoint.id === lastAnchor.id) {
    if (crossBlockModel) clearCrossBlockSelection()
    const element = document.querySelector(`[data-block-id="${lastAnchor.id}"]`)
    if (element) placeNativeBlockSelection(element, lastAnchor.offset, lastPoint.offset)
  }
}

// ---------------------------------------------------------------------------
// Editing over a cross-block selection
// ---------------------------------------------------------------------------

let crossBlockSplitHandler = null
export function setCrossBlockSplitHandler(handler) {
  crossBlockSplitHandler = handler
}

// A key that would edit content (typing, Backspace, Delete, Enter) over a
// cross-block selection collapses the selection to one edge first. This keeps
// the browser from mutating several editing hosts at once — which would
// half-apply the edit and then get reverted by React — and falls back to
// ordinary single-block editing at that edge.
export function handleCrossBlockEditKey(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  const isDeletion = event.key === 'Backspace' || event.key === 'Delete'
  const isInsertion = event.key.length === 1 || event.key === 'Enter'
  if (!isDeletion && !isInsertion) return false
  if (!crossBlockModel) return false

  const edges = selectionEdges(crossBlockModel)
  if (!edges) return false

  // Enter over a cross-block selection: collapse to the start edge and split
  // that block right at the caret (like an ordinary Enter that replaces the
  // selected text).
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    const point = edges.start
    const element = document.querySelector(`[data-block-id="${point.id}"]`)
    clearCrossBlockSelection()
    if (!element) return true
    element.focus({ preventScroll: true })
    const caret = textPointAtOffset(element, point.offset)
    collapseCaretAt(caret.node, caret.offset)
    const selection = window.getSelection()
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null
    if (range) {
      const beforeRange = document.createRange()
      beforeRange.selectNodeContents(element)
      beforeRange.setEnd(range.startContainer, range.startOffset)
      const afterRange = document.createRange()
      afterRange.selectNodeContents(element)
      afterRange.setStart(range.endContainer, range.endOffset)
      const before = document.createElement('div')
      const after = document.createElement('div')
      before.appendChild(beforeRange.cloneContents())
      after.appendChild(afterRange.cloneContents())
      crossBlockSplitHandler?.(point.id, before.innerHTML, after.innerHTML)
    }
    return true
  }

  // Backspace / Delete over a cross-block selection: remove the selected range
  // from the document model rather than collapsing and deleting one character.
  if (isDeletion && crossBlockDeleteHandler) {
    const result = deleteCrossBlockRange(crossBlockDeleteHandler._getBlocks(), crossBlockModel)
    if (result) {
      event.preventDefault()
      clearCrossBlockSelection()
      crossBlockDeleteHandler(result)
      return true
    }
  }

  // Collapse to the selection start for Backspace (delete before the selection)
  // and to the selection end for Delete/typing.
  const collapseToStart = event.key === 'Backspace'
  const point = collapseToStart ? edges.start : edges.end
  const element = point ? document.querySelector(`[data-block-id="${point.id}"]`) : null
  clearCrossBlockSelection()
  if (!element) return false
  element.focus({ preventScroll: true })
  const caret = textPointAtOffset(element, point.offset)
  collapseCaretAt(caret.node, caret.offset)
  return true
}

// ---------------------------------------------------------------------------
// Caret geometry and vertical navigation
// ---------------------------------------------------------------------------

function caretRectAtPoint(node, offset) {
  if (!node) return null
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  const rect = range.getBoundingClientRect()
  if (rect && (rect.width > 0 || rect.height > 0)) return rect
  for (const candidate of range.getClientRects()) {
    if (candidate.width > 0 || candidate.height > 0) return candidate
  }
  return rect
}

function adjacentBlockElement(element, direction) {
  const blocks = [...document.querySelectorAll('.document-canvas [data-block-id]')]
  const index = blocks.indexOf(element)
  let targetIndex = index + 1
  if (direction === 'previous') targetIndex = index - 1
  return targetIndex >= 0 && targetIndex < blocks.length ? blocks[targetIndex] : null
}

function caretIsOnFirstLine(element, selection) {
  const caretRect = caretRectAtPoint(selection.focusNode, selection.focusOffset)
  if (!caretRect?.height) return false
  const blockRect = element.getBoundingClientRect()
  const lineHeight = parseFloat(getComputedStyle(element).lineHeight) || 24
  return caretRect.top <= blockRect.top + lineHeight * 0.7
}

function caretIsOnLastLine(element, selection) {
  const caretRect = caretRectAtPoint(selection.focusNode, selection.focusOffset)
  if (!caretRect?.height) return false
  const blockRect = element.getBoundingClientRect()
  const lineHeight = parseFloat(getComputedStyle(element).lineHeight) || 24
  return caretRect.bottom >= blockRect.bottom - lineHeight * 0.7
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
    const focusPoint = { id: target.dataset.blockId, offset: targetOffset }
    if (focusPoint.id === selectionAnchorRef.current.id) {
      // The focus edge moved back into the anchor's own block: end the
      // cross-block model and materialize a real within-block selection from
      // the anchor point to the new focus point, so the selection visibly
      // shrinks into the first block instead of breaking.
      const anchorPoint = selectionAnchorRef.current
      selectionAnchorRef.current = null
      clearCrossBlockSelection()
      const anchorElement = document.querySelector(`[data-block-id="${anchorPoint.id}"]`)
      if (anchorElement) placeNativeBlockSelection(anchorElement, anchorPoint.offset, focusPoint.offset)
    } else {
      setCrossBlockSelection(selectionAnchorRef.current, focusPoint)
    }
  } else {
    selectionAnchorRef.current = null
    clearCrossBlockSelection()
    focusBlockAtTextOffset(target.dataset.blockId, targetOffset)
  }
  return true
}

export function handleArrowNavigation(event, element, selectionAnchorRef) {
  if (!element || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || event.altKey || event.metaKey || event.ctrlKey) return false
  const selection = window.getSelection()
  if (!selection?.rangeCount || !selection.focusNode) return false

  // Collapsing an existing cross-block selection with the arrows.
  if (crossBlockModel && !event.shiftKey) {
    event.preventDefault()
    const collapseToStart = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    const edges = selectionEdges(crossBlockModel)
    const point = collapseToStart ? edges?.start : edges?.end
    const targetElement = point ? document.querySelector(`[data-block-id="${point.id}"]`) : null
    clearCrossBlockSelection()
    if (targetElement) {
      targetElement.focus({ preventScroll: true })
      const caret = textPointAtOffset(targetElement, point.offset)
      collapseCaretAt(caret.node, caret.offset)
    }
    return true
  }

  const focusElement = blockElementForNode(selection.focusNode) || element
  const focusOffset = textOffsetAtPoint(focusElement, selection.focusNode, selection.focusOffset)
  const focusAtStart = isCaretAtBlockStart(focusElement, selection, selection.focusNode, selection.focusOffset)
  const focusAtEnd = focusOffset >= htmlTextLength(focusElement.innerHTML)
  const canCrossSelection = selection.isCollapsed || event.shiftKey
  if (!canCrossSelection) return false

  // The focus edge has been nudged back into the anchor's own block while the
  // cross-block model is still active (e.g. Shift+ArrowLeft at the boundary).
  // End the model and materialize the within-block selection natively.
  if (crossBlockModel && event.shiftKey && focusElement.dataset.blockId === crossBlockModel.anchor.id) {
    event.preventDefault()
    const anchorPoint = crossBlockModel.anchor
    selectionAnchorRef.current = null
    clearCrossBlockSelection()
    placeNativeBlockSelection(focusElement, anchorPoint.offset, focusOffset)
    return true
  }

  if (event.shiftKey && selectionAnchorRef.current && focusElement !== element && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    let step = 1
    if (event.key === 'ArrowLeft') step = -1
    const nextOffset = focusOffset + step
    if (nextOffset >= 0 && nextOffset <= htmlTextLength(focusElement.innerHTML)) {
      event.preventDefault()
      setCrossBlockSelection(selectionAnchorRef.current, { id: focusElement.dataset.blockId, offset: nextOffset })
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