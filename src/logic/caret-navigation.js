import { cleanBlockHtml, htmlTextLength } from './document-model'

// ---------------------------------------------------------------------------
// Per-editor-instance state
// ---------------------------------------------------------------------------
// Every mounted editor surface is flagged with data-papertrail-root. Two
// instances on one host page (the embed API supports mounting more than one)
// must never share selection/drag state, and must never resolve each other's
// blocks by id — starterBlocks uses fixed ids ('intro', 'lead', ...), so two
// default-content instances have identical block ids, and a bare
// `document.querySelector('[data-block-id=...]')` would silently resolve to
// whichever instance happens to be first in the DOM. Every lookup below is
// scoped to the root the interaction is actually happening in.
// ---------------------------------------------------------------------------

const ROOT_SELECTOR = '[data-papertrail-root]'
const rootRegistry = new Set()
const rootStates = new Map()

function createState() {
  return {
    crossBlockModel: null,
    listeners: new Set(),
    dragAnchor: null,
    dragLastPoint: null,
    dragActive: false,
    dragCleanup: null,
    splitHandler: null,
    deleteHandler: null,
  }
}

// Called from the owning EditorSurface's mount/unmount effect. React fires a
// child's effects before its parent's in the same commit, so a descendant
// (e.g. the cross-block overlay) can call stateFor() and lazily create state
// — with a listener already attached — before this ever runs. Only create
// state here if none exists yet, so that isn't clobbered.
export function registerSelectionRoot(root) {
  if (!root || rootRegistry.has(root)) return
  rootRegistry.add(root)
  if (!rootStates.has(root)) rootStates.set(root, createState())
}

export function unregisterSelectionRoot(root) {
  rootRegistry.delete(root)
  rootStates.delete(root)
}

// Defensive fallback for a root that hasn't been registered yet (e.g. an
// interaction fired before the registration effect ran) — creates state on
// demand rather than throwing.
function stateFor(root) {
  if (!root) return null
  let state = rootStates.get(root)
  if (!state) {
    state = createState()
    rootStates.set(root, state)
  }
  return state
}

function resolveRoot(nodeOrElement) {
  if (!nodeOrElement) return null
  const element = nodeOrElement.nodeType === Node.ELEMENT_NODE ? nodeOrElement : nodeOrElement.parentElement
  return element?.closest?.(ROOT_SELECTOR) || null
}

export function isCaretAtBlockStart(element, selection, node = selection.anchorNode, offset = selection.anchorOffset) {
  if (!node || (!element.contains(node) && node !== element)) return false
  const beforeCaret = document.createRange()
  beforeCaret.selectNodeContents(element)
  beforeCaret.setEnd(node, offset)
  const fragment = beforeCaret.cloneContents()
  const textBeforeCaret = fragment.textContent.replace(/[ ​]/g, '').trim()
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

export function subscribeCrossBlockSelection(root, listener) {
  const state = stateFor(root)
  if (!state) return () => {}
  state.listeners.add(listener)
  return () => state.listeners.delete(listener)
}

export function getCrossBlockSelection(root) {
  return stateFor(root)?.crossBlockModel ?? null
}

function notifyCrossBlockSelection(state) {
  for (const listener of state.listeners) listener(state.crossBlockModel)
}

export function setCrossBlockSelection(root, anchor, focus) {
  const state = stateFor(root)
  if (!state) return
  if (!anchor || !focus) {
    clearCrossBlockSelection(root)
    return
  }
  // Note: same-id models (anchor and focus inside one block) are allowed; the
  // rects and text helpers handle them. The drag path uses one to keep the
  // overlay painting live while a selection shrinks back into its origin block.
  state.crossBlockModel = { anchor: { ...anchor }, focus: { ...focus } }
  const focusElement = root.querySelector(`[data-block-id="${focus.id}"]`)
  if (focusElement) {
    const point = textPointAtOffset(focusElement, focus.offset)
    collapseCaretAt(point.node, point.offset)
  }
  notifyCrossBlockSelection(state)
}

export function clearCrossBlockSelection(root) {
  const state = stateFor(root)
  if (!state?.crossBlockModel) return
  state.crossBlockModel = null
  notifyCrossBlockSelection(state)
}

// Client rects of the intended cross-block selection, computed from the text
// line boxes only (independent of selection clamping). A bare cross-host Range
// also yields the block-level boxes of partially-contained rows — including the
// 40px gutter cell on the left of each block — so instead of one big Range we
// walk the text nodes between the two endpoints and union their line rects,
// matching exactly how a native text selection paints.
export function crossBlockSelectionRects(root) {
  const state = stateFor(root)
  if (!state?.crossBlockModel || !root) return []
  const { anchor, focus } = state.crossBlockModel
  const anchorElement = root.querySelector(`[data-block-id="${anchor.id}"]`)
  const focusElement = root.querySelector(`[data-block-id="${focus.id}"]`)
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
  const container = root.querySelector('.document-canvas') || startNode.parentElement?.closest('[data-block-id]')?.parentElement
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
function crossBlockSelectionText(root) {
  const state = stateFor(root)
  if (!state?.crossBlockModel) return null
  const edges = selectionEdges(root, state.crossBlockModel)
  if (!edges) return null
  const { start, end } = edges
  const blocks = [...root.querySelectorAll('.document-canvas [data-block-id]')]
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
function selectionEdges(root, model) {
  if (!model || !root) return null
  const blocks = [...root.querySelectorAll('.document-canvas [data-block-id]')]
  const anchorIndex = blocks.findIndex((element) => element.dataset.blockId === model.anchor.id)
  const focusIndex = blocks.findIndex((element) => element.dataset.blockId === model.focus.id)
  if (anchorIndex < 0 || focusIndex < 0) return null
  const anchorBefore = anchorIndex < focusIndex || (anchorIndex === focusIndex && model.anchor.offset <= model.focus.offset)
  return anchorBefore
    ? { start: model.anchor, end: model.focus }
    : { start: model.focus, end: model.anchor }
}

export function handleCrossBlockCopy(event) {
  const root = resolveRoot(event.target) || resolveRoot(document.activeElement)
  const state = stateFor(root)
  if (!root || !state?.crossBlockModel) return false
  const text = crossBlockSelectionText(root)
  if (text === null) return false
  event.clipboardData.setData('text/plain', text)
  event.preventDefault()
  return true
}

export function handleCrossBlockCut(event) {
  const root = resolveRoot(event.target) || resolveRoot(document.activeElement)
  if (!handleCrossBlockCopy(event)) return false
  // Preserve the document: collapse the selection to its start rather than
  // letting the browser mutate several editing hosts at once.
  const state = stateFor(root)
  const edges = selectionEdges(root, state?.crossBlockModel)
  clearCrossBlockSelection(root)
  if (edges) {
    const element = root?.querySelector(`[data-block-id="${edges.start.id}"]`)
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

  // A click clears the cross-block selection of whichever editor it landed
  // in; a click outside every editor (e.g. elsewhere on a host page) clears
  // all of them, mirroring the old single-instance "any mousedown deselects"
  // behavior.
  document.addEventListener('mousedown', (event) => {
    const root = resolveRoot(event.target)
    if (root) {
      clearCrossBlockSelection(root)
      return
    }
    for (const registeredRoot of rootRegistry) clearCrossBlockSelection(registeredRoot)
  }, true)

  document.addEventListener('input', (event) => {
    const root = resolveRoot(event.target)
    if (root) clearCrossBlockSelection(root)
  }, true)

  // Keep the model's focus edge in sync with the live caret. While a
  // cross-block selection is active, native movement of the caret within the
  // focus block (e.g. Shift+Arrow up/down through its lines) must be reflected
  // in the model so the overlay and the copied text stay accurate.
  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection()
    if (!selection?.focusNode) return
    const root = resolveRoot(selection.focusNode)
    const state = stateFor(root)
    if (!root || !state?.crossBlockModel) return
    const element = blockElementForNode(selection.focusNode)
    if (!element) return
    const blockId = element.dataset.blockId
    if (blockId === state.crossBlockModel.anchor.id) {
      // The focus edge moved back into the anchor's block (native arrow at a
      // block boundary): finish the selection natively inside that block.
      const anchorPoint = state.crossBlockModel.anchor
      const offset = textOffsetAtPoint(element, selection.focusNode, selection.focusOffset)
      clearCrossBlockSelection(root)
      placeNativeBlockSelection(element, anchorPoint.offset, offset)
      return
    }
    if (blockId !== state.crossBlockModel.focus.id) return
    const offset = textOffsetAtPoint(element, selection.focusNode, selection.focusOffset)
    if (offset === state.crossBlockModel.focus.offset) return
    state.crossBlockModel = { ...state.crossBlockModel, focus: { id: blockId, offset } }
    notifyCrossBlockSelection(state)
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

// Begins a mouse drag selection session. Called on mousedown inside a block:
// the anchor point is resolved immediately from the pointer position, so the
// drag can extend into other blocks without relying on the native selection.
// The per-session mousemove/mouseup/blur listeners close over this drag's own
// root, so two instances dragging independently never interfere.
export function beginBlockDragSelection(event) {
  if (event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return
  const point = pointFromClientPosition(event.clientX, event.clientY)
  const element = point ? blockElementForNode(point.node) : null
  if (!point || !element?.isContentEditable || !element.contains(point.node)) return
  const root = resolveRoot(element)
  const state = stateFor(root)
  if (!root || !state) return
  state.dragAnchor = { id: element.dataset.blockId, offset: textOffsetAtPoint(element, point.node, point.offset) }
  state.dragLastPoint = null
  if (state.dragActive) return
  state.dragActive = true
  const onMouseMove = (moveEvent) => updateBlockDragSelection(root, moveEvent)
  const onMouseUp = () => endBlockDragSelection(root)
  const onBlur = () => endBlockDragSelection(root)
  state.dragCleanup = () => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    window.removeEventListener('blur', onBlur)
  }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  window.addEventListener('blur', onBlur)
}

// Extends the drag selection to the block under the pointer on every mousemove.
export function updateBlockDragSelection(root, event) {
  const state = stateFor(root)
  if (!state?.dragAnchor) return
  const point = pointFromClientPosition(event.clientX, event.clientY)
  if (!point) return
  const element = blockElementForNode(point.node)
  if (!element?.isContentEditable || !element.contains(point.node)) return
  const focus = { id: element.dataset.blockId, offset: textOffsetAtPoint(element, point.node, point.offset) }
  state.dragLastPoint = focus
  if (focus.id === state.dragAnchor.id) {
    if (state.crossBlockModel) {
      // The pointer is back inside the block the drag started in, after having
      // crossed into other blocks. Keep the overlay alive as a same-block model
      // so the shrinking selection paints live in every engine (a native
      // selection injected per mousemove is blanked by the browser's own drag
      // handling until release). The model is materialized into a real
      // within-block native selection on mouseup.
      setCrossBlockSelection(root, state.dragAnchor, focus)
    }
    // If the drag never left this block, do nothing: the browser's own native
    // drag selection paints live in either direction. Injecting a programmatic
    // range on every mousemove here makes backward drags render blank until
    // release, because the browser overrides the range with its drag caret.
    return
  }
  setCrossBlockSelection(root, state.dragAnchor, focus)
}

export function endBlockDragSelection(root) {
  const state = stateFor(root)
  if (!state) return
  const lastAnchor = state.dragAnchor
  const lastPoint = state.dragLastPoint
  state.dragAnchor = null
  state.dragLastPoint = null
  if (!state.dragActive) return
  state.dragActive = false
  state.dragCleanup?.()
  state.dragCleanup = null

  // If the drag finished inside the block it started in, materialize a real
  // within-block selection from where the drag began to where the pointer
  // released. During the drag this state is either handled natively by the
  // browser (never crossed blocks) or painted by the overlay (shrunk back
  // after crossing); on release, a same-block selection must be a live native
  // selection the browser owns.
  if (lastAnchor && lastPoint && lastPoint.id === lastAnchor.id) {
    if (state.crossBlockModel) clearCrossBlockSelection(root)
    const element = root?.querySelector(`[data-block-id="${lastAnchor.id}"]`)
    if (element) placeNativeBlockSelection(element, lastAnchor.offset, lastPoint.offset)
  }
}

// ---------------------------------------------------------------------------
// Editing over a cross-block selection
// ---------------------------------------------------------------------------

export function setCrossBlockSplitHandler(root, handler) {
  const state = stateFor(root)
  if (state) state.splitHandler = handler
}

export function setCrossBlockDeleteHandler(root, handler) {
  const state = stateFor(root)
  if (state) state.deleteHandler = handler
}

// Deletes the content within a cross-block selection from the document model.
// Returns an object with:
//   - fromBlock, fromOffset: the (blockId, textOffset) at the selection start
//   - toBlock: the blockId at the selection end (equal to fromBlock for a
//     within-block selection)
//   - updates: an array of { id, html } plain objects where `html === undefined`
//     means the block should be removed entirely; otherwise `html` is the block's
//     new innerHTML.
// Returns null if the selection cannot be resolved.
export function deleteCrossBlockSelection(root, blocks) {
  const state = stateFor(root)
  if (!state?.crossBlockModel) return null
  const edges = selectionEdges(root, state.crossBlockModel)
  if (!edges) return null
  const { start, end } = edges

  const blockElements = [...root.querySelectorAll('.document-canvas [data-block-id]')]
  const startBlockIndex = blockElements.findIndex((el) => el.dataset.blockId === start.id)
  const endBlockIndex = blockElements.findIndex((el) => el.dataset.blockId === end.id)
  if (startBlockIndex < 0 || endBlockIndex < 0) return null

  const updates = []
  const fromBlock = start.id
  const fromOffset = start.offset
  const startBlockEl = blockElements[startBlockIndex]
  const endBlockEl = blockElements[endBlockIndex]
  const startBlockData = blocks.find((b) => b.id === start.id)
  const endBlockData = blocks.find((b) => b.id === end.id)
  if (!startBlockEl || !endBlockEl || !startBlockData || !endBlockData) return null

  // Same block: delete the selected range within it.
  if (start.id === end.id) {
    const tmp = document.createElement('div')
    tmp.innerHTML = startBlockEl.innerHTML
    const walker = document.createTreeWalker(tmp, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    let offset = 0
    let startNode = null, startOff = 0, endNode = null, endOff = 0

    while (node) {
      const len = node.textContent.length
      if (!startNode && start.offset <= offset + len) {
        startNode = node
        startOff = start.offset - offset
      }
      if (end.offset <= offset + len) {
        endNode = node
        endOff = end.offset - offset
        break
      }
      offset += len
      node = walker.nextNode()
    }

    if (startNode && endNode) {
      const range = document.createRange()
      range.setStart(startNode, startOff)
      range.setEnd(endNode, endOff)
      range.deleteContents()
    }

    updates.push({ id: start.id, html: cleanBlockHtml(tmp.innerHTML) })
    return { fromBlock, fromOffset, toBlock: end.id, updates }
  }

  // Cross-block: delete fully-selected blocks in the middle.
  for (let i = startBlockIndex + 1; i < endBlockIndex; i++) {
    updates.push({ id: blockElements[i].dataset.blockId })
  }

  // Start block: keep content before the selection start (or delete the block).
  if (start.offset === 0) {
    updates.push({ id: start.id })
  } else {
    const tmp = document.createElement('div')
    tmp.innerHTML = startBlockEl.innerHTML
    const walker = document.createTreeWalker(tmp, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    let remaining = start.offset
    while (node && remaining > 0) {
      if (remaining <= node.textContent.length) {
        // Delete from the selection start to the end of the block: the rest of
        // this text node, plus every following node (later list items, trailing
        // spans/<br>). Anchoring the range end at `tmp` rather than at this one
        // node is what removes those siblings.
        const range = document.createRange()
        if (remaining === node.textContent.length) range.setStartAfter(node)
        else range.setStart(node, remaining)
        range.setEnd(tmp, tmp.childNodes.length)
        range.deleteContents()
        break
      }
      remaining -= node.textContent.length
      node = walker.nextNode()
    }
    updates.push({ id: start.id, html: cleanBlockHtml(tmp.innerHTML) })
  }

  // End block: keep content after the selection end (or delete the block).
  const endTextLen = htmlTextLength(endBlockData.html)
  if (end.offset >= endTextLen) {
    updates.push({ id: end.id })
  } else {
    const tmp = document.createElement('div')
    tmp.innerHTML = endBlockEl.innerHTML
    const walker = document.createTreeWalker(tmp, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    let remaining = end.offset
    while (node && remaining > 0) {
      if (remaining < node.textContent.length) {
        const range = document.createRange()
        range.setStart(node, 0)
        range.setEnd(node, remaining)
        range.deleteContents()
        break
      }
      if (remaining === node.textContent.length) {
        const range = document.createRange()
        range.setStart(tmp, 0)
        range.setEnd(node, node.textContent.length)
        range.deleteContents()
        break
      }
      remaining -= node.textContent.length
      node = walker.nextNode()
    }
    updates.push({ id: end.id, html: cleanBlockHtml(tmp.innerHTML) })
  }

  return { fromBlock, fromOffset, toBlock: end.id, updates }
}

// Applies a cross-block selection deletion for Backspace/Delete/typing. Runs
// the registered handler to update the React model; returns true if handled.
// There is no live element/event to derive the root from here (mobile
// beforeinput calls this with just the blocks array), so the root is resolved
// from the currently focused element, which is reliably the block being
// edited whenever this fires.
export function applyCrossBlockDeletion(blocks, key) {
  const root = resolveRoot(document.activeElement)
  const state = stateFor(root)
  if (!root || !state?.crossBlockModel || !state.deleteHandler) return false
  const deletion = deleteCrossBlockSelection(root, blocks)
  clearCrossBlockSelection(root)
  if (!deletion) return false
  state.deleteHandler(deletion, key)
  return true
}

// A key that would edit content (typing, Backspace, Delete, Enter) over a
// cross-block selection deletes the selected content first, then handles the
// key. This keeps the browser from mutating several editing hosts at once —
// which would half-apply the edit and then get reverted by React.
export function handleCrossBlockEditKey(event, blocks) {
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  const isDeletion = event.key === 'Backspace' || event.key === 'Delete'
  const isInsertion = event.key.length === 1 || event.key === 'Enter'
  if (!isDeletion && !isInsertion) return false
  const root = resolveRoot(event.target) || resolveRoot(document.activeElement)
  const state = stateFor(root)
  if (!root || !state?.crossBlockModel) return false

  const edges = selectionEdges(root, state.crossBlockModel)
  if (!edges) return false

  // Enter over a cross-block selection: collapse to the start edge and split
  // that block right at the caret (like an ordinary Enter that replaces the
  // selected text).
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    const point = edges.start
    const element = root.querySelector(`[data-block-id="${point.id}"]`)
    clearCrossBlockSelection(root)
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
      state.splitHandler?.(point.id, before.innerHTML, after.innerHTML)
    }
    return true
  }

  // For Backspace, Delete, and character input: delete the selected content
  // from the document model via the React handler, then prevent the browser
  // from mutating several editing hosts at once.
  if (applyCrossBlockDeletion(blocks, event.key)) {
    event.preventDefault()
    return true
  }

  // Fallback when blocks data is unavailable: collapse to one edge.
  const collapseToStart = event.key === 'Backspace'
  const point = collapseToStart ? edges.start : edges.end
  const element = point ? root.querySelector(`[data-block-id="${point.id}"]`) : null
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
  const root = resolveRoot(element)
  if (!root) return null
  const blocks = [...root.querySelectorAll('.document-canvas [data-block-id]')]
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
  const root = resolveRoot(element)

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
      clearCrossBlockSelection(root)
      const anchorElement = root?.querySelector(`[data-block-id="${anchorPoint.id}"]`)
      if (anchorElement) placeNativeBlockSelection(anchorElement, anchorPoint.offset, focusPoint.offset)
    } else {
      setCrossBlockSelection(root, selectionAnchorRef.current, focusPoint)
    }
  } else {
    selectionAnchorRef.current = null
    clearCrossBlockSelection(root)
    focusBlockAtTextOffset(root, target.dataset.blockId, targetOffset)
  }
  return true
}

export function handleArrowNavigation(event, element, selectionAnchorRef) {
  if (!element || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || event.altKey || event.metaKey || event.ctrlKey) return false
  const selection = window.getSelection()
  if (!selection?.rangeCount || !selection.focusNode) return false
  const root = resolveRoot(element)
  const state = stateFor(root)

  // Collapsing an existing cross-block selection with the arrows.
  if (state?.crossBlockModel && !event.shiftKey) {
    event.preventDefault()
    const collapseToStart = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    const edges = selectionEdges(root, state.crossBlockModel)
    const point = collapseToStart ? edges?.start : edges?.end
    const targetElement = point ? root.querySelector(`[data-block-id="${point.id}"]`) : null
    clearCrossBlockSelection(root)
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
  if (state?.crossBlockModel && event.shiftKey && focusElement.dataset.blockId === state.crossBlockModel.anchor.id) {
    event.preventDefault()
    const anchorPoint = state.crossBlockModel.anchor
    selectionAnchorRef.current = null
    clearCrossBlockSelection(root)
    placeNativeBlockSelection(focusElement, anchorPoint.offset, focusOffset)
    return true
  }

  if (event.shiftKey && selectionAnchorRef.current && focusElement !== element && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    let step = 1
    if (event.key === 'ArrowLeft') step = -1
    const nextOffset = focusOffset + step
    if (nextOffset >= 0 && nextOffset <= htmlTextLength(focusElement.innerHTML)) {
      event.preventDefault()
      setCrossBlockSelection(root, selectionAnchorRef.current, { id: focusElement.dataset.blockId, offset: nextOffset })
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

// The embed surface (papertrail-embed) scrolls inside its own fixed-height
// box (.editor-layout has overflow-y: auto) rather than the page/window —
// that's what makes it embeddable at a fixed size in a host page. Checking
// the caret against window.innerHeight there is meaningless: the window can
// be much taller than the little box the editor actually renders in, so the
// check reports "visible" for a caret that's really hidden below the box's
// own clipped bottom edge. Walk up from the caret to the nearest ancestor
// that actually scrolls, and use its bounds instead; only fall back to the
// window when nothing between the caret and <body> scrolls on its own.
function nearestScroller(node) {
  let element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement
  while (element && element !== document.body) {
    const style = getComputedStyle(element)
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && element.scrollHeight > element.clientHeight + 1) {
      return element
    }
    element = element.parentElement
  }
  return null
}

// Visible height of the window, accounting for the mobile software keyboard.
// With the keyboard open, window.innerHeight still reports the full layout
// viewport while the caret disappears behind the keyboard; visualViewport
// shrinks to what is actually visible, so a caret below its bottom edge must
// count as off-screen and be scrolled up above the keyboard.
function windowVisibleBottom() {
  if (window.visualViewport && Number.isFinite(window.visualViewport.height)) return window.visualViewport.height
  return window.innerHeight
}

// Geometry for the collapsed caret. In an empty block there are no text nodes
// and the collapsed range reports a 0x0 rect at the origin, which the old
// check treated as "nothing to scroll" — so a newly added empty block at the
// end of a long document never scrolled into view and stayed off-screen.
// Fall back to the block element's own box (an empty block still occupies its
// min-height line), so empty blocks scroll exactly like non-empty ones.
function caretGeometry(range) {
  const rect = range.getBoundingClientRect()
  if (rect && (rect.width > 0 || rect.height > 0)) return { top: rect.top, bottom: rect.bottom }
  const host = blockElementForNode(range.startContainer) || document.activeElement?.closest?.('[data-block-id]')
  if (host) {
    const box = host.getBoundingClientRect()
    // Empty blocks are one line tall; anchor to the top line rather than the
    // whole box so a tall element can never count as "visible" while its
    // first line is clipped.
    const lineHeight = parseFloat(getComputedStyle(host).lineHeight) || 24
    const top = box.top
    return { top, bottom: Math.min(box.bottom, top + lineHeight) }
  }
  if (rect) return { top: rect.top, bottom: rect.bottom }
  return null
}

// Scrolls the caret into view only when it is off-screen, moving the minimum
// distance needed with breathing room around the caret. The previous
// range.scrollIntoView({ block: 'center' }) re-centred the page on every
// merge/add/delete even when the caret only just clipped the edge — and when
// the target block was taller than the viewport it scrolled by hundreds of
// pixels, which reads as the page or keyboard jumping. Manual scrollTop
// adjustment is a no-op while the caret is fully visible and otherwise moves
// only the clipped distance, never to the viewport centre.
function scrollCaretIntoView() {
  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null
  if (!range || !range.collapsed) return
  const caret = caretGeometry(range)
  if (!caret || !Number.isFinite(caret.top) || !Number.isFinite(caret.bottom)) return
  const margin = 24
  const scroller = nearestScroller(range.startContainer)
  if (scroller) {
    const box = scroller.getBoundingClientRect()
    // The scroller box itself can extend behind the mobile keyboard; clamp to
    // what is actually visible so a caret inside the scroller but behind the
    // keyboard still scrolls up.
    const visibleBottom = Math.min(box.bottom, windowVisibleBottom())
    const visibleTop = Math.max(box.top, 0)
    if (caret.top >= visibleTop + margin && caret.bottom <= visibleBottom - margin) return
    if (caret.top < visibleTop + margin) scroller.scrollTop += caret.top - visibleTop - margin
    else scroller.scrollTop += caret.bottom - visibleBottom + margin
    return
  }
  const bottom = windowVisibleBottom()
  if (caret.top >= margin && caret.bottom <= bottom - margin) return
  if (caret.top < margin) window.scrollBy(0, caret.top - margin)
  else window.scrollBy(0, caret.bottom - bottom + margin)
}

export function focusBlockStart(root, id, attempt = 0) {
  const element = root?.querySelector(`[data-block-id="${id}"]`)
  if (!element) {
    if (attempt < 4) requestAnimationFrame(() => focusBlockStart(root, id, attempt + 1))
    return
  }
  const caretTarget = element.querySelector('li') || element
  caretTarget.focus({ preventScroll: true })
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(caretTarget)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  scrollCaretIntoView()
}

export function focusBlockAtTextOffset(root, id, offset, attempt = 0) {
  const element = root?.querySelector(`[data-block-id="${id}"]`)
  if (!element) {
    if (attempt < 4) requestAnimationFrame(() => focusBlockAtTextOffset(root, id, offset, attempt + 1))
    return
  }

  element.focus({ preventScroll: true })
  const selection = window.getSelection()
  const range = document.createRange()
  const point = textPointAtOffset(element, offset)
  range.setStart(point.node, point.offset)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  scrollCaretIntoView()
}

export function scheduleCaretAtTextOffset(root, id, offset) {
  requestAnimationFrame(() => requestAnimationFrame(() => focusBlockAtTextOffset(root, id, offset)))
}

export function scheduleFocusBlockStart(root, id) {
  requestAnimationFrame(() => requestAnimationFrame(() => focusBlockStart(root, id)))
}

// Place the caret at the start of a specific list item (0-based index). Used
// after a merge joins a paragraph into a list as a new item: the caret should
// land at the start of that joined item's text (e.g. the start of "kkkk"), not
// at a numeric text offset that the contenteditable DOM (spans, <br>, empty
// items) can shift or swallow.
export function scheduleCaretAtStartOfListItem(root, id, itemIndex, attempt = 0) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const element = root?.querySelector(`[data-block-id="${id}"]`)
    if (!element) {
      if (attempt < 4) scheduleCaretAtStartOfListItem(root, id, itemIndex, attempt + 1)
      return
    }
    const items = element.querySelectorAll('li')
    const li = items[itemIndex] || items[items.length - 1]
    if (!li) {
      element.focus({ preventScroll: true })
      const fallback = document.createRange()
      fallback.selectNodeContents(element)
      fallback.collapse(true)
      const fallbackSelection = window.getSelection()
      fallbackSelection.removeAllRanges()
      fallbackSelection.addRange(fallback)
      scrollCaretIntoView()
      return
    }
    element.focus({ preventScroll: true })
    const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT)
    const firstText = walker.nextNode()
    const point = firstText ? { node: firstText, offset: 0 } : { node: li, offset: 0 }
    const range = document.createRange()
    range.setStart(point.node, point.offset)
    range.collapse(true)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    scrollCaretIntoView()
  }))
}
