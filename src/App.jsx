import React, { useEffect, useMemo, useRef, useState } from 'react'
import { BlockRow } from './components/block-editor'
import { Icon, ToolbarButton } from './components/editor-controls'
import { focusBlockStart, scheduleCaretAtTextOffset } from './logic/caret-navigation'
import { blockDescription, convertBlockContent, emptyBlockHtml, hasReadableText, highlightJson, htmlTextLength, makeBlockId, mergeBlockContent, starterBlocks, typeMeta } from './logic/document-model'

export default function App() {
  const [blocks, setBlocks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('papertrail-document')) || starterBlocks } catch { return starterBlocks }
  })
  const [activeId, setActiveId] = useState('intro')
  const [saved, setSaved] = useState(true)
  const [jsonOpen, setJsonOpen] = useState(true)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [toast, setToast] = useState('')
  const selectionAnchorRef = useRef(null)

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
      html: emptyBlockHtml(type),
    }
    setBlocks((current) => {
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
    setBlocks((current) => current.filter((block) => block.id !== id))
    setActiveId(nextActive?.id)
    if (nextActive) scheduleCaretAtTextOffset(nextActive.id, htmlTextLength(nextActive.html))
  }

  const moveBlock = (id, direction) => setBlocks((current) => {
    const index = current.findIndex((block) => block.id === id)
    let nextIndex = index + 1
    if (direction === 'move-up') nextIndex = index - 1
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
      const row = target.closest('.block-row')
      let blockId = null
      if (row) {
        const rowIndex = Array.from(document.querySelectorAll('.block-row')).indexOf(row)
        blockId = blocks[rowIndex]?.id || null
      }
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

  const saveLabel = saved ? 'Saved just now' : 'Unsaved changes'
  const saveDotClass = saved ? 'saved' : ''
  const jsonPanelClass = jsonOpen ? 'open' : 'closed'

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
          <div className="save-state"><span className={`save-dot ${saveDotClass}`} />{saveLabel}</div>
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
                {showAddMenu && <div className="add-menu"><div className="add-menu-label">Insert a block</div>{Object.entries(typeMeta).map(([type, meta]) => <button key={type} onClick={() => addBlock(type, activeId)}><span className="add-menu-icon">{meta.icon}</span><span><strong>{meta.label}</strong><small>{blockDescription(type)}</small></span><span className="add-menu-key">{type === 'paragraph' ? 'P' : ''}</span></button>)}</div>}
              </div>
              <div className="canvas-footer"><span>Tip: select a block to see its structure controls</span><span>Markdown shortcuts supported</span></div>
            </section>

            <aside className={`json-panel ${jsonPanelClass}`}>
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
