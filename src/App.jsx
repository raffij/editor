import React, { useState } from 'react'
import { EditorSurface } from './components/editor-surface'
import { Icon } from './components/editor-controls'
import { useDocumentEditor } from './logic/use-document-editor'
import EmbedDemo from './embed-demo'

export default function DemoApp() {
  const [view, setView] = useState('workspace')
  const editor = useDocumentEditor({ storageKey: 'papertrail-document' })
  const { saved, resetDocument } = editor

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><span></span><span></span><span></span></div>
          <span className="brand-name">papertrail</span>
          <span className="brand-slash">/</span>
          <span className="brand-context">{view === 'workspace' ? 'workspace demo' : 'embed demo'}</span>
        </div>

        <nav className="view-switcher" role="tablist" aria-label="Demo view">
          <button role="tab" aria-selected={view === 'workspace'} className={`view-switch ${view === 'workspace' ? 'is-active' : ''}`} onClick={() => setView('workspace')}>Workspace</button>
          <button role="tab" aria-selected={view === 'embed'} className={`view-switch ${view === 'embed' ? 'is-active' : ''}`} onClick={() => setView('embed')}>Embed</button>
        </nav>

        {view === 'workspace' && <div className="topbar-actions">
          <div className="save-state"><span className={`save-dot ${saved ? 'saved' : ''}`} />{saved ? 'Saved just now' : 'Unsaved changes'}</div>
          <button className="icon-button" aria-label="Search" title="Search"><Icon name="search" size={18} /></button>
          <button className="icon-button" aria-label="Settings" title="Settings"><Icon name="settings" size={18} /></button>
          <div className="avatar">RS</div>
        </div>}
      </header>

      {view === 'workspace' ? (
        <div className="workspace">
          <aside className="sidebar">
            <div className="sidebar-top">
              <div className="eyebrow">Your workspace</div>
              <button className="new-doc" onClick={resetDocument}><Icon name="plus" size={16} />New document</button>
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
            <EditorSurface editor={editor} />
          </main>
        </div>
      ) : (
        <EmbedDemo />
      )}
    </div>
  )
}