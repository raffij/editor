import React, { useLayoutEffect, useRef } from 'react'
import { beginBlockDragSelection, handleArrowNavigation, handleCrossBlockEditKey, isCaretAtBlockStart } from '../logic/caret-navigation'
import { blockTagName, cleanBlockHtml, cleanElement, emptyBlockHtml, isListType, typeMeta } from '../logic/document-model'
import { Icon } from './editor-controls'

function BlockContent({ block, onFocus, onInput, onSplit, onBackspace, selectionAnchorRef }) {
  const ref = useRef(null)
  const lastHtmlRef = useRef(null)
  const lastTypeRef = useRef(block.type)
  const Tag = blockTagName(block.type)
  const content = block.html || emptyBlockHtml(block.type)

  const performSplit = () => {
    const selection = window.getSelection()
    if (!selection?.rangeCount || !ref.current?.contains(selection.anchorNode)) return false

    const range = selection.getRangeAt(0)
    if (isListType(block.type)) {
      let listItem = null
      if (selection.anchorNode?.nodeType === Node.ELEMENT_NODE) listItem = selection.anchorNode.closest('li')
      else listItem = selection.anchorNode?.parentElement?.closest('li')
      if (listItem && listItem.textContent.trim()) return false

      const listClone = ref.current.cloneNode(true)
      const sourceItems = Array.from(ref.current.querySelectorAll('li'))
      const itemIndex = sourceItems.indexOf(listItem)
      if (itemIndex >= 0) listClone.querySelectorAll('li')[itemIndex]?.remove()
      onSplit(cleanBlockHtml(listClone.innerHTML), '')
      return true
    }

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
    onSplit(cleanBlockHtml(before.innerHTML), cleanBlockHtml(after.innerHTML))
    return true
  }

  const splitAtCaret = (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    if (performSplit()) event.preventDefault()
  }

  const performMergeAtStart = () => {
    const selection = window.getSelection()
    if (!selection?.isCollapsed || !selection.rangeCount || !ref.current?.contains(selection.anchorNode)) return false
    if (!isCaretAtBlockStart(ref.current, selection)) return false

    onBackspace(cleanBlockHtml(ref.current.innerHTML))
    return true
  }

  const mergeAtStart = (event) => {
    if (event.key !== 'Backspace' || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return
    if (performMergeAtStart()) event.preventDefault()
  }

  useLayoutEffect(() => {
    if (!ref.current) return
    const cleanedContent = cleanBlockHtml(content)
    const htmlChangedOutsideEditor = lastHtmlRef.current !== cleanedContent
    const typeChanged = lastTypeRef.current !== block.type
    if ((htmlChangedOutsideEditor || typeChanged) && ref.current.innerHTML !== cleanedContent) ref.current.innerHTML = cleanedContent
    lastHtmlRef.current = cleanedContent
    lastTypeRef.current = block.type
  }, [block.type, content])

  // iOS/Android software keyboards fire beforeinput instead of keydown.
  // Enter -> insertParagraph; Backspace -> deleteContentBackward.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const handleBeforeInput = (event) => {
      if (event.inputType === 'insertParagraph') {
        if (performSplit()) event.preventDefault()
      } else if (event.inputType === 'deleteContentBackward' || event.inputType === 'deleteContent') {
        if (performMergeAtStart()) event.preventDefault()
      }
    }
    el.addEventListener('beforeinput', handleBeforeInput)
    return () => el.removeEventListener('beforeinput', handleBeforeInput)
  }, [block.type])

  return (
    <Tag
      ref={ref}
      className={`block-content content-${block.type}`}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={typeMeta[block.type].hint}
      data-block-id={block.id}
      onFocus={onFocus}
      onMouseDown={(event) => {
        selectionAnchorRef.current = null
        beginBlockDragSelection(event)
      }}
      onInput={(event) => {
        cleanElement(event.currentTarget)
        const html = event.currentTarget.innerHTML
        lastHtmlRef.current = html
        selectionAnchorRef.current = null
        onInput(html)
      }}
      onKeyDown={(event) => {
        if (handleArrowNavigation(event, ref.current, selectionAnchorRef)) return
        handleCrossBlockEditKey(event)
        if (!event.shiftKey) selectionAnchorRef.current = null
        mergeAtStart(event)
        if (!event.defaultPrevented) splitAtCaret(event)
      }}
    />
  )
}

export function BlockRow({ block, index, isActive, onFocus, onInput, onSplit, onBackspace, onChangeType, onDelete, onAddAfter, onFormat, selectionAnchorRef }) {
  const [overlayOpen, setOverlayOpen] = React.useState(false)
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
          <span className="block-marker"><Icon name="dots" size={15} /></span>
        </button>
      </div>
      <div className="block-main">
        <BlockContent block={block} onFocus={focusBlock} onInput={onInput} onSplit={onSplit} onBackspace={onBackspace} selectionAnchorRef={selectionAnchorRef} />
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
