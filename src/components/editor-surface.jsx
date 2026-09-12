import React from 'react'
import { BlockRow } from './block-editor'
import { Icon, ToolbarButton } from './editor-controls'
import { blockDescription, highlightJson, joinAcrossDeletedBoundary, typeMeta } from '../logic/document-model'
import { crossBlockSelectionRects, scheduleCaretAtTextOffset, setCrossBlockDeleteHandler, setCrossBlockSplitHandler, subscribeCrossBlockSelection } from '../logic/caret-navigation'

// Paints the highlight for a cross-block selection. Some engines (WebKit/Safari)
// clamp a DOM Selection to a single editing host, so the cross-block selection
// is tracked separately and this overlay renders its line rects.
function CrossBlockSelectionOverlay() {
  const [model, setModel] = React.useState(null)
  const [rects, setRects] = React.useState([])

  React.useEffect(() => subscribeCrossBlockSelection(setModel), [])

  React.useEffect(() => {
    const update = () => setRects(model ? crossBlockSelectionRects() : [])
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [model])

  if (!model || !rects.length || model.anchor.id === model.focus.id) return null
  return (
    <div className="cross-selection-overlay" aria-hidden="true">
      {rects.map((rect, index) => (
        <span key={index} style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />
      ))}
    </div>
  )
}

export function EditorSurface({
  editor,
  documentTitle = 'Untitled document',
  showHeader = true,
  showActions = true,
  showToolbar = true,
  showJson = true,
}) {
  const {
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
    addBlock,
    updateBlock,
    replaceBlocks,
    splitBlock,
    mergeBlockAtStart,
    deleteBlock,
    moveBlock,
    convertBlockContent,
    execFormat,
    addLink,
    saveDocument,
    exportJson,
    copyJson,
  } = editor

  const saveLabel = saved ? 'Saved just now' : 'Unsaved changes'
  const saveDotClass = saved ? 'saved' : ''
  const jsonPanelClass = jsonOpen ? 'open' : 'closed'
  const layoutClass = showJson ? '' : 'without-json'

  React.useEffect(() => {
    setCrossBlockSplitHandler((blockId, beforeHtml, afterHtml) => splitBlock(blockId, beforeHtml, afterHtml))
  }, [splitBlock])

  // Handles deleting a cross-block selection (Backspace/Delete/typing over it).
  // Applies the computed block updates to the model, collapses the boundary
  // between the start and end fragments, and refocuses the caret.
  const handleCrossBlockDelete = (deletion, key) => {
    const { fromBlock, fromOffset, toBlock, updates } = deletion

    // Build the next blocks array: remove fully-deleted blocks, update the rest.
    const byId = new Map(blocks.map((b) => [b.id, { ...b }]))
    for (const update of updates) {
      if (update.html === undefined) {
        byId.delete(update.id)
      } else {
        const existing = byId.get(update.id)
        if (existing) byId.set(update.id, { ...existing, html: update.html })
      }
    }
    const nextBlocks = blocks.filter((b) => byId.has(b.id)).map((b) => byId.get(b.id))

    // After deletion the trimmed start and end fragments of the selection sit
    // next to each other. Collapse the boundary the selection spanned: the end
    // fragment's first line/item folds onto the start block (keeping the start
    // block's type); same-type edges fold together entirely, while a different
    // end type keeps its remaining lines/items as its own block.
    if (nextBlocks.length >= 2 && toBlock && toBlock !== fromBlock) {
      const startIdx = nextBlocks.findIndex((b) => b.id === fromBlock)
      const endBlock = startIdx >= 0 ? nextBlocks[startIdx + 1] : null
      if (endBlock && endBlock.id === toBlock) {
        const { mergedHtml, remainderHtml } = joinAcrossDeletedBoundary(nextBlocks[startIdx], endBlock)
        nextBlocks[startIdx] = { ...nextBlocks[startIdx], html: mergedHtml }
        if (remainderHtml === null) nextBlocks.splice(startIdx + 1, 1)
        else nextBlocks[startIdx + 1] = { ...endBlock, html: remainderHtml }
      }
    }

    // Track a typed replacement so the caret lands after it.
    let caretOffset = fromOffset
    if (key && key.length === 1) {
      const target = nextBlocks.find((b) => b.id === fromBlock)
      if (target) {
        const node = document.createElement('div')
        node.innerHTML = target.html || ''
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
        let tn = walker.nextNode()
        let remaining = fromOffset
        let insertNode = null
        while (tn && remaining >= 0) {
          if (remaining <= tn.textContent.length) {
            insertNode = { node: tn, offset: remaining }
            break
          }
          remaining -= tn.textContent.length
          tn = walker.nextNode()
        }
        if (insertNode) {
          const text = document.createTextNode(key)
          insertNode.node.parentNode.insertBefore(text, insertNode.node.splitText(insertNode.offset))
          target.html = node.innerHTML
        }
        caretOffset = fromOffset + key.length
      }
    }

    replaceBlocks(nextBlocks)
    const survives = nextBlocks.some((b) => b.id === fromBlock)
    const focusId = survives ? fromBlock : (nextBlocks[0]?.id || null)
    setActiveId(focusId)
    if (survives) scheduleCaretAtTextOffset(fromBlock, caretOffset)
    else if (nextBlocks[0]) scheduleCaretAtTextOffset(nextBlocks[0].id, 0)
  }

  React.useEffect(() => {
    setCrossBlockDeleteHandler(handleCrossBlockDelete)
  })

  return (
    <div className="papertrail-editor-surface">
      {showHeader && <div className="editor-header">
        <div><div className="breadcrumb"><span>Documents</span><span>/</span><strong>{documentTitle}</strong></div><div className="document-meta">Last edited today at 09:42 <span>·</span> {characterCount} characters</div></div>
        {showActions && <div className="editor-header-actions"><button className="quiet-button" onClick={exportJson}><span className="export-symbol">↓</span> Export JSON</button><button className="primary-button" onClick={saveDocument}>Save document</button></div>}
      </div>}

      {showToolbar && <div className="formatting-toolbar" aria-label="Formatting toolbar">
        <div className="toolbar-group"><ToolbarButton label="Bold" shortcut="⌘ B" onClick={() => execFormat('bold')}><Icon name="bold" size={17} /></ToolbarButton><ToolbarButton label="Italic" shortcut="⌘ I" onClick={() => execFormat('italic')}><Icon name="italic" size={17} /></ToolbarButton><ToolbarButton label="Add link" shortcut="⌘ K" onClick={addLink}><Icon name="link" size={17} /></ToolbarButton></div>
        <div className="toolbar-rule" />
        <div className="toolbar-group"><ToolbarButton label="Bulleted list" onClick={() => addBlock('bulleted-list', activeId)}><Icon name="bullet" size={17} /></ToolbarButton><ToolbarButton label="Numbered list" onClick={() => addBlock('numbered-list', activeId)}><Icon name="ordered" size={17} /></ToolbarButton><ToolbarButton label="Quote block" onClick={() => addBlock('quote', activeId)}><Icon name="quote" size={17} /></ToolbarButton><ToolbarButton label="Code" onClick={() => execFormat('formatBlock', 'pre')}><Icon name="code" size={17} /></ToolbarButton></div>
        <div className="toolbar-spacer" /><div className="toolbar-group"><ToolbarButton label="Undo" shortcut="⌘ Z" onClick={() => execFormat('undo')}><Icon name="undo" size={17} /></ToolbarButton><ToolbarButton label="Redo" shortcut="⌘ ⇧ Z" onClick={() => execFormat('redo')}><Icon name="redo" size={17} /></ToolbarButton></div>
      </div>}

      <div className={`editor-layout ${layoutClass}`}>
        <section className="document-canvas" aria-label="Document editor">
          <div className="block-list">
            {blocks.map((block, index) => <BlockRow key={block.id} block={block} blocks={blocks} index={index} isActive={activeId === block.id} onFocus={() => setActiveId(block.id)} onInput={(html) => updateBlock(block.id, { html })} onSplit={(beforeHtml, afterHtml, options) => splitBlock(block.id, beforeHtml, afterHtml, options)} onBackspace={(html) => mergeBlockAtStart(block.id, html)} onChangeType={(type) => updateBlock(block.id, { type, html: convertBlockContent(block, type) })} onDelete={() => deleteBlock(block.id)} onAddAfter={() => addBlock('paragraph', block.id)} onFormat={(action) => moveBlock(block.id, action)} selectionAnchorRef={selectionAnchorRef} />)}
          </div>
          <div className="add-block-wrap">
            <button className="add-block-button" onClick={() => setShowAddMenu((value) => !value)}><Icon name="plus" size={17} />Add block</button>
            {showAddMenu && <div className="add-menu"><div className="add-menu-label">Insert a block</div>{Object.entries(typeMeta).map(([type, meta]) => <button key={type} onClick={() => addBlock(type)}><span className="add-menu-icon">{meta.icon}</span><span><strong>{meta.label}</strong><small>{blockDescription(type)}</small></span><span className="add-menu-key">{type === 'paragraph' ? 'P' : ''}</span></button>)}</div>}
          </div>
          <div className="canvas-footer"><span>Tip: select a block to see its structure controls</span><span>Markdown shortcuts supported</span></div>
        </section>

        {showJson && <aside className={`json-panel ${jsonPanelClass}`}>
          <div className="json-header"><div><span className="panel-eyebrow">Document model</span><h2>Live JSON</h2></div><button className="panel-toggle" onClick={() => setJsonOpen((value) => !value)} aria-label={jsonOpen ? 'Collapse JSON panel' : 'Expand JSON panel'}><Icon name="panel" size={18} /></button></div>
          {jsonOpen && <>
            <div className="json-toolbar"><span className="json-file"><span className="json-dot" />document.json</span><button className="copy-button" onClick={copyJson}>Copy</button></div>
            <pre className="json-code"><code>{JSON.stringify(blocks, null, 2).split('\n').map((line, index) => <div key={index} className="json-line"><span className="line-number">{String(index + 1).padStart(2, '0')}</span><span dangerouslySetInnerHTML={{ __html: highlightJson(line) }} /></div>)}</code></pre>
            <div className="json-footer"><span><span className="live-dot" />Live sync</span><span>{blocks.length} blocks</span></div>
          </>}
        </aside>}
      </div>
      {toast && <div className="toast"><span><Icon name="check" size={15} /></span>{toast}</div>}
      <CrossBlockSelectionOverlay />
    </div>
  )
}
