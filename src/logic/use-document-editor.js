import { useEffect, useMemo, useRef, useState } from 'react'
import { focusBlockStart, scheduleCaretAtTextOffset } from './caret-navigation'
import { cleanBlockHtml, cleanElement, convertBlockContent, emptyBlockHtml, hasReadableText, htmlTextLength, makeBlockId, mergeBlockContent, starterBlocks } from './document-model'

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
    setTimeout(() => focusBlockStart(newBlock.id), 0)
  }

  const deleteBlock = (id) => {
    if (blocks.length === 1) return
    const index = blocks.findIndex((block) => block.id === id)
    const nextActive = blocks[index - 1] || blocks[index + 1]
    commitBlocks((current) => current.filter((block) => block.id !== id))
    setActiveId(nextActive?.id)
    if (nextActive) scheduleCaretAtTextOffset(nextActive.id, htmlTextLength(nextActive.html))
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
    if (focusBlock) setTimeout(() => focusBlockStart(focusBlock.id), 0)
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
    commitBlocks(next)
    setActiveId(previous.id)
    scheduleCaretAtTextOffset(previous.id, previousTextLength)
  }

  const execFormat = (command, value = null) => {
    document.execCommand(command, false, value)
    const target = document.activeElement
    if (!target?.isContentEditable) return
    cleanElement(target)
    const row = target.closest('.block-row')
    if (!row) return
    const rowIndex = Array.from(document.querySelectorAll('.block-row')).indexOf(row)
    const blockId = blocks[rowIndex]?.id
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
    updateBlock,
    addBlock,
    deleteBlock,
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
