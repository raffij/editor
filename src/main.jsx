import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const starterBlocks = [
  {
    id: 'intro',
    type: 'heading',
    html: 'A small idea, made legible.',
  },
  {
    id: 'lead',
    type: 'paragraph',
    html: 'Good documents do not just hold information. They give the reader a path through it. Papertrail lets you shape that path one clear block at a time.',
  },
  {
    id: 'quote',
    type: 'quote',
    html: 'The best writing feels inevitable in retrospect.',
  },
  {
    id: 'principles',
    type: 'bulleted-list',
    html: '<li>Start with the point</li><li>Give each thought room to breathe</li><li>Make the next step obvious</li>',
  },
  {
    id: 'closing',
    type: 'paragraph',
    html: 'This canvas is backed by a simple JSON document. Edit the writing here; the structure stays visible alongside it.',
  },
]

const typeMeta = {
  paragraph: { label: 'Text', icon: 'T', hint: 'Write something…' },
  heading: { label: 'Heading', icon: 'H', hint: 'Give this section a name…' },
  quote: { label: 'Quote', icon: '“', hint: 'Add a memorable line…' },
  'bulleted-list': { label: 'Bulleted list', icon: '•', hint: 'Add a list item…' },
  'numbered-list': { label: 'Numbered list', icon: '1', hint: 'Add a list item…' },
}

const makeBlockId = (type) => `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

function Icon({ name, size = 18, stroke = 1.8 }) {
  const paths = {
    plus: <><path d="M12 5v14M5 12h14" /></>,
    chevron: <><path d="m7 10 5 5 5-5" /></>,
    bold: <><path d="M7 5h5.3a3.2 3.2 0 0 1 0 6.4H7V5Zm0 6.4h6a3.3 3.3 0 0 1 0 6.6H7v-6.6Z" /></>,
    italic: <><path d="M10 5h7M7 19h7M14 5 10 19" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.1.1l1.2-1.2a5 5 0 0 0-7.1-7.1L10.5 5.5" /><path d="M14 11a5 5 0 0 0-7.1-.1l-1.2 1.2a5 5 0 0 0 7.1 7.1l.7-.7" /></>,
    bullet: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" /></>,
    ordered: <><path d="M10 6h10M10 12h10M10 18h10" /><path d="M3 4h1v4M3 4h1M3 12c0-1 2-1 2 0 0 1-2 1-2 2h2M3 17c2-1 2 2 0 2 0 0 2 0 2-1" /></>,
    quote: <><path d="M9 10H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a7 7 0 0 0-4-6" /><path d="M19 10h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a7 7 0 0 0-4-6" /></>,
    code: <><path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" /></>,
    undo: <><path d="M9 8 5 12l4 4" /><path d="M5 12h8a5 5 0 0 1 5 5v1" /></>,
    redo: <><path d="m15 8 4 4-4 4" /><path d="M19 12h-8a5 5 0 0 0-5 5v1" /></>,
    settings: <><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="m19.4 15 .1.1a2 2 0 0 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4v.2a2 2 0 0 1-4 0v-.2a2 2 0 0 0-3.4-1.4l-.1.1A2 2 0 0 1 3 15.1l.1-.1a2 2 0 0 0-1.4-3.4h-.2a2 2 0 0 1 0-4h.2A2 2 0 0 0 3.1 4.2L3 4.1A2 2 0 0 1 5.8 1.3l.1.1a2 2 0 0 0 3.4-1.4V0a2 2 0 0 1 4 0v.2a2 2 0 0 0 3.4 1.4l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a2 2 0 0 0 1.4 3.4h.2a2 2 0 0 1 0 4h-.2a2 2 0 0 0-1.4 3.4Z" transform="translate(1 1) scale(.83)" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    dots: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
    panel: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M15 4v16" /></>,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function ToolbarButton({ label, children, onClick, active = false, shortcut }) {
  return (
    <button className={`toolbar-button ${active ? 'is-active' : ''}`} title={shortcut ? `${label} (${shortcut})` : label} aria-label={label} onMouseDown={(event) => event.preventDefault()} onClick={onClick}>
      {children}
    </button>
  )
}

function BlockContent({ block, isActive, onFocus, onInput, onSplit, onBackspace, selectionAnchorRef }) {
  const ref = useRef(null)
  const lastHtmlRef = useRef(null)
  const lastTypeRef = useRef(block.type)
  const Tag = block.type === 'heading' ? 'h1' : block.type === 'quote' ? 'blockquote' : block.type === 'bulleted-list' ? 'ul' : block.type === 'numbered-list' ? 'ol' : 'p'
  const content = block.html || (block.type.includes('list') ? '<li></li>' : '')

  const splitAtCaret = (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    const selection = window.getSelection()
    if (!selection?.rangeCount || !ref.current?.contains(selection.anchorNode)) return

    const range = selection.getRangeAt(0)
    if (block.type.includes('list')) {
      const listItem = selection.anchorNode?.nodeType === Node.ELEMENT_NODE
        ? selection.anchorNode.closest('li')
        : selection.anchorNode?.parentElement?.closest('li')
      if (listItem && listItem.textContent.trim()) return

      event.preventDefault()
      const listClone = ref.current.cloneNode(true)
      const sourceItems = Array.from(ref.current.querySelectorAll('li'))
      const itemIndex = sourceItems.indexOf(listItem)
      if (itemIndex >= 0) listClone.querySelectorAll('li')[itemIndex]?.remove()
      onSplit(listClone.innerHTML, '')
      return
    }

    event.preventDefault()
    const beforeRange = document.createRange()
    beforeRange.selectNodeContents(ref.current)
    beforeRange.setEnd(range.startContainer, range.startOffset)
    const afterRange = document.createRange()
    afterRange.selectNodeContents(ref.current)
    afterRange.setStart(range.endContainer, range.endOffset)
    const before = document.createElement('div')
    const after = document.createElement('div')
    before.appendChild(beforeRange.cloneContents())
    after.appendChild(afterRange.cloneContents())
    onSplit(before.innerHTML, after.innerHTML)
  }

  const mergeAtStart = (event) => {
    if (event.key !== 'Backspace' || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return
    const selection = window.getSelection()
    if (!selection?.isCollapsed || !selection.rangeCount || !ref.current?.contains(selection.anchorNode)) return

    if (!isCaretAtBlockStart(ref.current, selection)) return

    event.preventDefault()
    onBackspace(ref.current.innerHTML)
  }

  useLayoutEffect(() => {
    if (!ref.current) return
    const htmlChangedOutsideEditor = lastHtmlRef.current !== content
    const typeChanged = lastTypeRef.current !== block.type
    if ((htmlChangedOutsideEditor || typeChanged) && ref.current.innerHTML !== content) {
      ref.current.innerHTML = content
    }
    lastHtmlRef.current = content
    lastTypeRef.current = block.type
  }, [block.type, content])

  return (
    <Tag
      ref={ref}
      className={`block-content content-${block.type}`}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={typeMeta[block.type].hint}
      data-block-id={block.id}
      onFocus={onFocus}
      onMouseDown={() => { selectionAnchorRef.current = null }}
      onInput={(event) => {
        const html = event.currentTarget.innerHTML
        lastHtmlRef.current = html
        selectionAnchorRef.current = null
        onInput(html)
      }}
      onKeyDown={(event) => {
        if (handleArrowNavigation(event, ref.current, selectionAnchorRef)) return
        if (!event.shiftKey) selectionAnchorRef.current = null
        mergeAtStart(event)
        if (!event.defaultPrevented) splitAtCaret(event)
      }}
    />
  )
}

function BlockRow({ block, index, isActive, onFocus, onInput, onSplit, onBackspace, onChangeType, onDelete, onAddAfter, onFormat, selectionAnchorRef }) {
  const [overlayOpen, setOverlayOpen] = useState(false)
  const focusBlock = () => {
    onFocus()
    setOverlayOpen(false)
  }
  const toggleOverlay = (event) => {
    event.stopPropagation()
    onFocus()
    setOverlayOpen((value) => !value)
  }
  const runOverlayAction = (action) => {
    setOverlayOpen(false)
    onFormat(action)
  }
  return (
    <div className={`block-row ${isActive ? 'is-active' : ''}`} onClick={focusBlock}>
      <div className="block-gutter">
        <button className={`block-marker-button ${overlayOpen && isActive ? 'is-open' : ''}`} aria-label={`${typeMeta[block.type].label} block options`} aria-expanded={overlayOpen && isActive} onClick={toggleOverlay}>
          <span className="block-marker">{typeMeta[block.type].icon}</span>
        </button>
        <span className="block-index">{String(index + 1).padStart(2, '0')}</span>
      </div>
      <div className="block-main">
        <BlockContent block={block} isActive={isActive} onFocus={focusBlock} onInput={onInput} onSplit={onSplit} onBackspace={onBackspace} selectionAnchorRef={selectionAnchorRef} />
      </div>
      {isActive && overlayOpen && (
        <div className="block-overlay" role="dialog" aria-label="Block options" onClick={(event) => event.stopPropagation()}>
          <div className="overlay-heading"><span>Block type</span><span>{String(index + 1).padStart(2, '0')}</span></div>
          <div className="overlay-type-grid">
            {Object.entries(typeMeta).map(([type, meta]) => (
              <button key={type} className={`overlay-type-button ${block.type === type ? 'is-selected' : ''}`} onClick={() => { onChangeType(type); setOverlayOpen(false) }}>
                <span className="overlay-type-icon">{meta.icon}</span><span>{meta.label}</span>{block.type === type && <Icon name="check" size={14} />}
              </button>
            ))}
          </div>
          <div className="overlay-divider" />
          <div className="overlay-actions">
            <span className="overlay-action-label">Arrange</span>
            <button className="overlay-action" title="Move block up" aria-label="Move block up" onClick={() => runOverlayAction('move-up')} disabled={index === 0}>↑</button>
            <button className="overlay-action" title="Move block down" aria-label="Move block down" onClick={() => runOverlayAction('move-down')}>↓</button>
            <button className="overlay-action danger" title="Delete block" aria-label="Delete block" onClick={() => { setOverlayOpen(false); onDelete() }}>⌫</button>
            <button className="overlay-action" title="Add block below" aria-label="Add block below" onClick={() => { setOverlayOpen(false); onAddAfter() }}><Icon name="plus" size={15} /></button>
          </div>
        </div>
      )}
    </div>
  )
}

function convertBlockContent(block, nextType) {
  const isList = block.type.includes('list')
  const nextIsList = nextType.includes('list')
  if (nextIsList && !isList) return `<li>${block.html || ''}</li>`
  if (!nextIsList && isList) return (block.html || '').replace(/<\/li>\s*<li>/gi, '<br>').replace(/<\/?li>/gi, '')
  return block.html
}

function hasReadableText(html) {
  const container = document.createElement('div')
  container.innerHTML = html || ''
  return container.textContent.replace(/\u00a0/g, '').trim().length > 0
}

function isCaretAtBlockStart(element, selection, node = selection.anchorNode, offset = selection.anchorOffset) {
  if (!node || (!element.contains(node) && node !== element)) return false
  const beforeCaret = document.createRange()
  beforeCaret.selectNodeContents(element)
  beforeCaret.setEnd(node, offset)
  const fragment = beforeCaret.cloneContents()
  const textBeforeCaret = fragment.textContent.replace(/[\u00a0\u200b]/g, '').trim()
  return !textBeforeCaret && !fragment.querySelector('br, img, hr, video, iframe')
}

function blockElementForNode(node) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement
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
      return nextTextNode ? { node: nextTextNode, offset: 0 } : { node: textNode, offset: textLength }
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
  const targetIndex = direction === 'previous' ? index - 1 : index + 1
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
  const candidates = rowPoints.length ? rowPoints : points
  return candidates.reduce((closest, point) => Math.abs(point.left - sourceX) < Math.abs(closest.left - sourceX) ? point : closest).offset
}

function moveToAdjacentBlock(element, direction, extendSelection, selectionAnchorRef, textOffset) {
  const target = adjacentBlockElement(element, direction)
  if (!target) return false

  const selection = window.getSelection()
  const targetOffset = textOffset ?? (direction === 'previous' ? htmlTextLength(target.innerHTML) : 0)

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

function handleArrowNavigation(event, element, selectionAnchorRef) {
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
    const node = collapseToStart ? range.startContainer : range.endContainer
    const offset = collapseToStart ? range.startOffset : range.endOffset
    const targetElement = collapseToStart ? startElement : endElement
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
    const step = event.key === 'ArrowLeft' ? -1 : 1
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

function listItemsAsInlineHtml(html) {
  const container = document.createElement('div')
  container.innerHTML = html || ''
  return Array.from(container.querySelectorAll('li')).map((item) => item.innerHTML).join('<br>')
}

function mergeBlockContent(previous, current) {
  if (previous.type.includes('list') && current.type.includes('list')) return `${previous.html || ''}${current.html || ''}`
  if (previous.type.includes('list')) return `${previous.html || ''}<li>${current.html || ''}</li>`
  if (current.type.includes('list')) return `${previous.html || ''}${previous.html ? '<br>' : ''}${listItemsAsInlineHtml(current.html)}`
  return `${previous.html || ''}${current.html || ''}`
}

function focusBlockStart(id) {
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

function htmlTextLength(html) {
  const container = document.createElement('div')
  container.innerHTML = html || ''
  return container.textContent.length
}

function focusBlockAtTextOffset(id, offset, attempt = 0) {
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

function scheduleCaretAtTextOffset(id, offset) {
  requestAnimationFrame(() => requestAnimationFrame(() => focusBlockAtTextOffset(id, offset)))
}

function focusBlockEnd(id) {
  focusBlockAtTextOffset(id, Number.MAX_SAFE_INTEGER)
}

function App() {
  const [blocks, setBlocks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('papertrail-document')) || starterBlocks } catch { return starterBlocks }
  })
  const [activeId, setActiveId] = useState('intro')
  const [saved, setSaved] = useState(true)
  const [jsonOpen, setJsonOpen] = useState(true)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [toast, setToast] = useState('')
  const selectionAnchorRef = useRef(null)

  const activeBlock = blocks.find((block) => block.id === activeId) || blocks[0]
  const characterCount = useMemo(() => blocks.reduce((sum, block) => sum + (block.html || '').replace(/<[^>]+>/g, '').length, 0), [blocks])

  useEffect(() => {
    setSaved(false)
    const timer = setTimeout(() => setSaved(true), 700)
    return () => clearTimeout(timer)
  }, [blocks])

  const updateBlock = (id, changes) => setBlocks((current) => current.map((block) => block.id === id ? { ...block, ...changes } : block))

  const addBlock = (type = 'paragraph', afterId = blocks[blocks.length - 1]?.id) => {
    const newBlock = {
      id: makeBlockId(type),
      type,
      html: type.includes('list') ? '<li></li>' : '',
    }
    setBlocks((current) => {
      const position = current.findIndex((block) => block.id === afterId)
      const next = [...current]
      next.splice(position < 0 ? next.length : position + 1, 0, newBlock)
      return next
    })
    setActiveId(newBlock.id)
    setShowAddMenu(false)
    setTimeout(() => focusBlockStart(newBlock.id), 0)
  }

  const deleteBlock = (id) => {
    if (blocks.length === 1) return
    const index = blocks.findIndex((block) => block.id === id)
    const nextActive = blocks[index - 1] || blocks[index + 1]
    setBlocks((current) => current.filter((block) => block.id !== id))
    setActiveId(nextActive?.id)
    if (nextActive) scheduleCaretAtTextOffset(nextActive.id, htmlTextLength(nextActive.html))
  }

  const moveBlock = (id, direction) => setBlocks((current) => {
    const index = current.findIndex((block) => block.id === id)
    const nextIndex = direction === 'move-up' ? index - 1 : index + 1
    if (nextIndex < 0 || nextIndex >= current.length) return current
    const next = [...current]
    ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
    return next
  })

  const splitBlock = (id, beforeHtml, afterHtml) => {
    const newBlock = { id: makeBlockId('paragraph'), type: 'paragraph', html: afterHtml }
    selectionAnchorRef.current = null
    setBlocks((current) => {
      const index = current.findIndex((block) => block.id === id)
      if (index < 0) return current
      const next = [...current]
      next[index] = { ...next[index], html: beforeHtml }
      next.splice(index + 1, 0, newBlock)
      return next
    })
    setActiveId(newBlock.id)
    setTimeout(() => focusBlockStart(newBlock.id), 0)
  }

  const mergeBlockAtStart = (id, currentHtml) => {
    const index = blocks.findIndex((block) => block.id === id)
    if (index < 0) return
    if (!hasReadableText(currentHtml)) {
      deleteBlock(id)
      return
    }
    if (index === 0) return

    const previous = blocks[index - 1]
    const current = { ...blocks[index], html: currentHtml }
    const previousTextLength = htmlTextLength(previous.html)
    selectionAnchorRef.current = null
    const next = [...blocks]
    next[index - 1] = { ...previous, html: mergeBlockContent(previous, current) }
    next.splice(index, 1)
    setBlocks(next)
    setActiveId(previous.id)
    scheduleCaretAtTextOffset(previous.id, previousTextLength)
  }

  const execFormat = (command, value = null) => {
    document.execCommand(command, false, value)
    const target = document.activeElement
    if (target?.isContentEditable) {
      const id = blocks.find((block) => target.closest('.block-row')?.querySelector('.block-marker')?.textContent === typeMeta[block.type].icon)?.id
      const row = target.closest('.block-row')
      const blockId = row ? blocks[Array.from(document.querySelectorAll('.block-row')).indexOf(row)]?.id : null
      if (blockId) updateBlock(blockId, { html: target.innerHTML })
    }
  }

  const addLink = () => {
    const url = window.prompt('Paste a link URL')
    if (url) execFormat('createLink', url)
  }

  const saveDocument = () => {
    localStorage.setItem('papertrail-document', JSON.stringify(blocks, null, 2))
    setSaved(true)
    setToast('Document saved locally')
    setTimeout(() => setToast(''), 2400)
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(blocks, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'papertrail-document.json'
    link.click()
    URL.revokeObjectURL(url)
    setToast('JSON downloaded')
    setTimeout(() => setToast(''), 2400)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><span></span><span></span><span></span></div>
          <span className="brand-name">papertrail</span>
          <span className="brand-slash">/</span>
          <span className="brand-context">visual editor</span>
        </div>
        <div className="topbar-actions">
          <div className="save-state"><span className={`save-dot ${saved ? 'saved' : ''}`} />{saved ? 'Saved just now' : 'Unsaved changes'}</div>
          <button className="icon-button" aria-label="Search" title="Search"><Icon name="search" size={18} /></button>
          <button className="icon-button" aria-label="Settings" title="Settings"><Icon name="settings" size={18} /></button>
          <div className="avatar">RS</div>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-top">
            <div className="eyebrow">Your workspace</div>
            <button className="new-doc" onClick={() => { setBlocks(starterBlocks); setActiveId('intro') }}><Icon name="plus" size={16} />New document</button>
          </div>
          <nav className="document-nav" aria-label="Documents">
            <div className="nav-label">Recent documents <span>3</span></div>
            <button className="document-item active"><span className="doc-icon">✦</span><span><strong>Untitled document</strong><small>Edited just now</small></span><Icon name="dots" size={16} /></button>
            <button className="document-item"><span className="doc-icon muted">◒</span><span><strong>Morning pages</strong><small>Yesterday</small></span></button>
            <button className="document-item"><span className="doc-icon muted">◒</span><span><strong>Product principles</strong><small>Aug 28</small></span></button>
          </nav>
          <div className="sidebar-bottom">
            <div className="storage-card"><div className="storage-head"><span>Local storage</span><span>12%</span></div><div className="storage-track"><span /></div><small>Everything stays in this browser.</small></div>
            <div className="sidebar-foot"><span className="keyboard-key">⌘</span><span>⌘ K</span><span className="foot-label">Quick actions</span></div>
          </div>
        </aside>

        <main className="editor-area">
          <div className="editor-header">
            <div><div className="breadcrumb"><span>Documents</span><span>/</span><strong>Untitled document</strong></div><div className="document-meta">Last edited today at 09:42 <span>·</span> {characterCount} characters</div></div>
            <div className="editor-header-actions"><button className="quiet-button" onClick={exportJson}><span className="export-symbol">↓</span> Export JSON</button><button className="primary-button" onClick={saveDocument}>Save document</button></div>
          </div>
          <div className="formatting-toolbar" aria-label="Formatting toolbar">
            <div className="toolbar-group"><ToolbarButton label="Bold" shortcut="⌘ B" onClick={() => execFormat('bold')}><Icon name="bold" size={17} /></ToolbarButton><ToolbarButton label="Italic" shortcut="⌘ I" onClick={() => execFormat('italic')}><Icon name="italic" size={17} /></ToolbarButton><ToolbarButton label="Add link" shortcut="⌘ K" onClick={addLink}><Icon name="link" size={17} /></ToolbarButton></div>
            <div className="toolbar-rule" />
            <div className="toolbar-group"><ToolbarButton label="Bulleted list" onClick={() => addBlock('bulleted-list', activeId)}><Icon name="bullet" size={17} /></ToolbarButton><ToolbarButton label="Numbered list" onClick={() => addBlock('numbered-list', activeId)}><Icon name="ordered" size={17} /></ToolbarButton><ToolbarButton label="Quote block" onClick={() => addBlock('quote', activeId)}><Icon name="quote" size={17} /></ToolbarButton><ToolbarButton label="Code" onClick={() => execFormat('formatBlock', 'pre')}><Icon name="code" size={17} /></ToolbarButton></div>
            <div className="toolbar-spacer" /><div className="toolbar-group"><ToolbarButton label="Undo" shortcut="⌘ Z" onClick={() => execFormat('undo')}><Icon name="undo" size={17} /></ToolbarButton><ToolbarButton label="Redo" shortcut="⌘ ⇧ Z" onClick={() => execFormat('redo')}><Icon name="redo" size={17} /></ToolbarButton></div>
          </div>

          <div className="editor-layout">
            <section className="document-canvas" aria-label="Document editor">
              <div className="canvas-kicker"><span className="kicker-line" />Draft / 01</div>
              <div className="block-list">
                {blocks.map((block, index) => <BlockRow key={block.id} block={block} index={index} isActive={activeId === block.id} onFocus={() => setActiveId(block.id)} onInput={(html) => updateBlock(block.id, { html })} onSplit={(beforeHtml, afterHtml) => splitBlock(block.id, beforeHtml, afterHtml)} onBackspace={(html) => mergeBlockAtStart(block.id, html)} onChangeType={(type) => updateBlock(block.id, { type, html: convertBlockContent(block, type) })} onDelete={() => deleteBlock(block.id)} onAddAfter={() => addBlock('paragraph', block.id)} onFormat={(action) => moveBlock(block.id, action)} selectionAnchorRef={selectionAnchorRef} />)}
              </div>
              <div className="add-block-wrap">
                <button className="add-block-button" onClick={() => setShowAddMenu((value) => !value)}><Icon name="plus" size={17} />Add block</button>
                {showAddMenu && <div className="add-menu"><div className="add-menu-label">Insert a block</div>{Object.entries(typeMeta).map(([type, meta]) => <button key={type} onClick={() => addBlock(type, activeId)}><span className="add-menu-icon">{meta.icon}</span><span><strong>{meta.label}</strong><small>{type === 'paragraph' ? 'A freeform text block' : type === 'heading' ? 'A section title' : type === 'quote' ? 'A pull quote or callout' : 'A structured list'}</small></span><span className="add-menu-key">{type === 'paragraph' ? 'P' : ''}</span></button>)}</div>}
              </div>
              <div className="canvas-footer"><span>Tip: select a block to see its structure controls</span><span>Markdown shortcuts supported</span></div>
            </section>

            <aside className={`json-panel ${jsonOpen ? 'open' : 'closed'}`}>
              <div className="json-header"><div><span className="panel-eyebrow">Document model</span><h2>Live JSON</h2></div><button className="panel-toggle" onClick={() => setJsonOpen((value) => !value)} aria-label={jsonOpen ? 'Collapse JSON panel' : 'Expand JSON panel'}><Icon name="panel" size={18} /></button></div>
              {jsonOpen && <>
                <div className="json-toolbar"><span className="json-file"><span className="json-dot" />document.json</span><button className="copy-button" onClick={() => { navigator.clipboard?.writeText(JSON.stringify(blocks, null, 2)); setToast('JSON copied') }}>Copy</button></div>
                <pre className="json-code"><code>{JSON.stringify(blocks, null, 2).split('\n').map((line, index) => <div key={index} className="json-line"><span className="line-number">{String(index + 1).padStart(2, '0')}</span><span dangerouslySetInnerHTML={{ __html: highlightJson(line) }} /></div>)}</code></pre>
                <div className="json-footer"><span><span className="live-dot" />Live sync</span><span>{blocks.length} blocks</span></div>
              </>}
            </aside>
          </div>
        </main>
      </div>
      {toast && <div className="toast"><span><Icon name="check" size={15} /></span>{toast}</div>}
    </div>
  )
}

function highlightJson(line) {
  const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const stringToken = '"(?:\\\\.|[^"\\\\])*"'
  return escaped.replace(new RegExp(`(${stringToken})(?=\\s*:)`, 'g'), '<em>$1</em>').replace(new RegExp(`(${stringToken})`, 'g'), '<strong>$1</strong>').replace(/\b(true|false|null)\b/g, '<i>$1</i>').replace(/\b(\d+)\b/g, '<b>$1</b>')
}

createRoot(document.getElementById('root')).render(<App />)
