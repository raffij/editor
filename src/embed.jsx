import React from 'react'
import { createRoot } from 'react-dom/client'
import { EditorSurface } from './components/editor-surface'
import { useDocumentEditor } from './logic/use-document-editor'
import { starterBlocks } from './logic/document-model'
import './styles.css'

export function EmbedEditor({
  initialBlocks = starterBlocks,
  value,
  onChange,
  onSave,
  storageKey = null,
  showToolbar = true,
  showJson = false,
  showHeader = false,
  showActions = false,
  className = '',
}) {
  const editor = useDocumentEditor({ initialBlocks, value, onChange, onSave, storageKey })
  return (
    <div className={`papertrail-embed ${className}`.trim()}>
      <EditorSurface editor={editor} showToolbar={showToolbar} showJson={showJson} showHeader={showHeader} showActions={showActions} />
    </div>
  )
}

export function mountPapertrailEditor(element, options = {}) {
  const root = createRoot(element)
  let currentOptions = options
  root.render(<EmbedEditor {...currentOptions} />)
  return {
    update(nextOptions) {
      currentOptions = { ...currentOptions, ...nextOptions }
      root.render(<EmbedEditor {...currentOptions} />)
    },
    unmount() {
      root.unmount()
    },
  }
}

export { starterBlocks }
