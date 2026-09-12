import { EditorSurface } from './components/editor-surface'
import { useDocumentEditor } from './logic/use-document-editor'

// Test-only fixture: mounts two independent editor instances on one page,
// both with the default starterBlocks (which use fixed ids like 'intro' /
// 'lead') so a regression that resolves blocks by a bare
// `document.querySelector('[data-block-id=...]')` instead of scoping to its
// own editor root would silently act on the wrong instance. Not part of the
// production build — reachable only via the Vite dev server that the e2e
// suite runs against.
export default function TwoInstancesDemo() {
  const editorA = useDocumentEditor({ storageKey: 'two-instances-a' })
  const editorB = useDocumentEditor({ storageKey: 'two-instances-b' })

  return (
    <div className="two-instances-demo" style={{ display: 'flex', gap: '24px' }}>
      <div data-instance="a" style={{ flex: 1, minWidth: 0 }}>
        <EditorSurface editor={editorA} documentTitle="Instance A" />
      </div>
      <div data-instance="b" style={{ flex: 1, minWidth: 0 }}>
        <EditorSurface editor={editorB} documentTitle="Instance B" />
      </div>
    </div>
  )
}
