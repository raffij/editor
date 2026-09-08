import React from 'react'
import { BlockRow } from './block-editor'
import { Icon, ToolbarButton } from './editor-controls'
import { blockDescription, highlightJson, typeMeta } from '../logic/document-model'
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
    splitBlock,
    mergeBlockAtStart,
    deleteBlock,
    moveBlock,
    convertBlockContent,
    commitBlocks,
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

  // Handles Backspace / Delete over a cross-block selection: removes the
  // selected content/blocks from the model and focuses the caret at the merge
  // point instead of collapsing and deleting a single character.
  React.useEffect(() => {
    const handler = (result) => {
      if (!result || !Array.isArray(result.blocks)) return
      commitBlocks(result.blocks)
      const caretId = result.caretId || result.blocks[0]?.id
      if (caretId) {
        setActiveId(caretId)
        scheduleCaretAtTextOffset(caretId, result.caretOffset ?? 0)
      }
    }
    handler._getBlocks = () => blocks
    setCrossBlockDeleteHandler(handler)
  }, [blocks, commitBlocks])

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
            {blocks.map((block, index) => <BlockRow key={block.id} block={block} index={index} isActive={activeId === block.id} onFocus={() => setActiveId(block.id)} onInput={(html) => updateBlock(block.id, { html })} onSplit={(beforeHtml, afterHtml, options) => splitBlock(block.id, beforeHtml, afterHtml, options)} onBackspace={(html) => mergeBlockAtStart(block.id, html)} onChangeType={(type) => updateBlock(block.id, { type, html: convertBlockContent(block, type) })} onDelete={() => deleteBlock(block.id)} onAddAfter={() => addBlock('paragraph', block.id)} onFormat={(action) => moveBlock(block.id, action)} selectionAnchorRef={selectionAnchorRef} />)}
          </div>
          <div className="add-block-wrap">
            <button className="add-block-button" onClick={() => setShowAddMenu((value) => !value)}><Icon name="plus" size={17} />Add block</button>
            {showAddMenu && <div className="add-menu"><div className="add-menu-label">Insert a block</div>{Object.entries(typeMeta).map(([type, meta]) => <button key={type} onClick={() => addBlock(type, activeId)}><span className="add-menu-icon">{meta.icon}</span><span><strong>{meta.label}</strong><small>{blockDescription(type)}</small></span><span className="add-menu-key">{type === 'paragraph' ? 'P' : ''}</span></button>)}</div>}
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
