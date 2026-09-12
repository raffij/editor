import { useEffect, useMemo, useRef, useState } from 'react'
import { scheduleCaretAtStartOfListItem, scheduleCaretAtTextOffset, scheduleFocusBlockStart } from './caret-navigation'
import { cleanBlockHtml, cleanElement, convertBlockContent, countListItems, emptyBlockHtml, hasReadableText, htmlTextLength, makeBlockId, mergeBlockContent, starterBlocks } from './document-model'

function cloneBlocks(blocks) {
  return blocks.map((block) => ({ ...block }))
}

function readInitialBlocks(initialBlocks, storageKey) {
  if (storageKey) {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey))
      if (Array.isArray(stored)) return stored
    } catch {
      // Fall through to the supplied initial document.
    }
  }
  return cloneBlocks(initialBlocks || starterBlocks)
}

export function useDocumentEditor({ initialBlocks = starterBlocks, value, onChange, storageKey = null, onSave } = {}) {
  const controlled = Array.isArray(value)
  const [internalBlocks, setInternalBlocks] = useState(() => controlled ? cloneBlocks(value) : readInitialBlocks(initialBlocks, storageKey))
  const blocks = controlled ? value : internalBlocks
  const [activeId, setActiveId] = useState(() => blocks[0]?.id || null)
  const [saved, setSaved] = useState(true)
  const [jsonOpen, setJsonOpen] = useState(true)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [toast, setToast] = useState('')
  const selectionAnchorRef = useRef(null)
  // The DOM root of this editor instance (attached by EditorSurface). Caret
  // placement and cross-block selection lookups are scoped to it so that two
  // mounted instances on one page never resolve each other's blocks — see
  // caret-navigation.js.
  const rootRef = useRef(null)

  useEffect(() => {
    if (!controlled) onChange?.(blocks)
    setSaved(false)
    const timer = setTimeout(() => setSaved(true), 700)
    return () => clearTimeout(timer)
  }, [blocks, controlled, onChange])

  const characterCount = useMemo(() => blocks.reduce((sum, block) => sum + (block.html || '').replace(/<[^>]+>/g, '').length, 0), [blocks])

  const commitBlocks = (updater) => {
    const next = typeof updater === 'function' ? updater(blocks) : updater
    if (controlled) onChange?.(next)
    else setInternalBlocks(next)
  }

  const updateBlock = (id, changes) => commitBlocks((current) => current.map((block) => block.id === id ? { ...block, ...changes, ...(changes.html != null ? { html: cleanBlockHtml(changes.html) } : {}) } : block))

  // Replaces the whole block list with a new array (used for edits that span
  // many blocks at once, e.g. deleting across a cross-block selection).
  const replaceBlocks = (nextBlocks) => {
    selectionAnchorRef.current = null
    commitBlocks(nextBlocks)
  }

  const addBlock = (type = 'paragraph', afterId = blocks[blocks.length - 1]?.id) => {
    const newBlock = { id: makeBlockId(type), type, html: emptyBlockHtml(type) }
    commitBlocks((current) => {
      const position = current.findIndex((block) => block.id === afterId)
      const next = [...current]
      const insertAt = position < 0 ? next.length : position + 1
      next.splice(insertAt, 0, newBlock)
      return next
    })
    setActiveId(newBlock.id)
    setShowAddMenu(false)
    // Double-rAF with retries: the new row may not be committed yet when this
    // runs, and a single setTimeout can fire before React mounts it — leaving
    // focus (and the scroll) behind on the old block while the new one sits
    // off-screen.
    scheduleFocusBlockStart(rootRef.current, newBlock.id)
  }

  const deleteBlock = (id) => {
    if (blocks.length === 1) return
    const index = blocks.findIndex((block) => block.id === id)
    const nextActive = blocks[index - 1] || blocks[index + 1]
    commitBlocks((current) => current.filter((block) => block.id !== id))
    setActiveId(nextActive?.id)
    if (nextActive) scheduleCaretAtTextOffset(rootRef.current, nextActive.id, htmlTextLength(nextActive.html))
  }

  const moveBlock = (id, direction) => commitBlocks((current) => {
    const index = current.findIndex((block) => block.id === id)
    let nextIndex = index + 1
    if (direction === 'move-up') nextIndex = index - 1
    if (nextIndex < 0 || nextIndex >= current.length) return current
    const next = [...current]
    ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
    return next
  })

  const splitBlock = (id, beforeHtml, afterHtml, { currentType = null, insertParagraph = false, afterType = 'paragraph' } = {}) => {
    selectionAnchorRef.current = null
    const inserted = []
    if (insertParagraph) inserted.push({ id: makeBlockId('paragraph'), type: 'paragraph', html: '' })
    if (afterType) inserted.push({ id: makeBlockId(afterType), type: afterType, html: afterHtml })
    commitBlocks((current) => {
      const index = current.findIndex((block) => block.id === id)
      if (index < 0) return current
      const next = [...current]
      next[index] = currentType
        ? { ...next[index], type: currentType, html: beforeHtml || '' }
        : { ...next[index], html: beforeHtml }
      next.splice(index + 1, 0, ...inserted)
      return next
    })
    // The list-empty split converts the current block to a paragraph (S6/S7);
    // focus stays there. Every other split focuses the first inserted block.
    const focusBlock = insertParagraph || !currentType
      ? inserted[0]
      : blocks.find((b) => b.id === id)
    setActiveId(focusBlock?.id)
    if (focusBlock) scheduleFocusBlockStart(rootRef.current, focusBlock.id)
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
    const mergedHtml = mergeBlockContent(previous, current)
    selectionAnchorRef.current = null
    const next = [...blocks]
    next[index - 1] = { ...previous, html: mergedHtml }
    next.splice(index, 1)
    commitBlocks(next)
    setActiveId(previous.id)
    if (previous.type.includes('list')) {
      // The paragraph merges in as the first new item of the (now larger)
      // list: first item at index = the previous list's item count. Place the
      // caret at the start of that joined item, structurally, so spans/<br>/
      // empty items in the source don't shift where the caret lands.
      scheduleCaretAtStartOfListItem(rootRef.current, previous.id, countListItems(previous.html))
    } else {
      // Paragraph->paragraph or paragraph->list: single flattened text run, so
      // the numeric junction (end of the previous text) is reliable.
      scheduleCaretAtTextOffset(rootRef.current, previous.id, htmlTextLength(previous.html))
    }
  }

  const execFormat = (command, value = null) => {
    document.execCommand(command, false, value)
    const target = document.activeElement
    if (!target?.isContentEditable) return
    cleanElement(target)
    const blockId = target.dataset.blockId ?? target.closest('[data-block-id]')?.dataset.blockId
    if (blockId) updateBlock(blockId, { html: target.innerHTML })
  }

  const addLink = () => {
    const url = window.prompt('Paste a link URL')
    if (url) execFormat('createLink', url)
  }

  const saveDocument = () => {
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(blocks, null, 2))
    onSave?.(blocks)
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

  const copyJson = () => {
    navigator.clipboard?.writeText(JSON.stringify(blocks, null, 2))
    setToast('JSON copied')
    setTimeout(() => setToast(''), 2400)
  }

  const resetDocument = () => {
    commitBlocks(cloneBlocks(initialBlocks || starterBlocks))
    setActiveId(initialBlocks?.[0]?.id || starterBlocks[0].id)
    selectionAnchorRef.current = null
  }

  return {
    blocks,
    activeId,
    setActiveId,
    saved,
    jsonOpen,
    setJsonOpen,
    showAddMenu,
    setShowAddMenu,
    toast,
    characterCount,
    selectionAnchorRef,
    rootRef,
    updateBlock,
    addBlock,
    deleteBlock,
    replaceBlocks,
    moveBlock,
    splitBlock,
    mergeBlockAtStart,
    execFormat,
    addLink,
    saveDocument,
    exportJson,
    copyJson,
    resetDocument,
    convertBlockContent,
  }
}
