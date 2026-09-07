import React, { useState } from 'react'
import { EmbedEditor } from './embed'
import { highlightJson, starterBlocks } from './logic/document-model'

const embedDemoBlocks = [
  { id: 'embed-heading', type: 'heading', html: 'A quiet corner of the page, made yours.' },
  { id: 'embed-body', type: 'paragraph', html: 'Everything inside this box is live, running from a single script. The host site above it needs no React, no bundler, no build step — just one stylesheet and one mount call.' },
  { id: 'embed-quote', type: 'quote', html: 'Embedded editors should feel borrowed, not grafted on.' },
  { id: 'embed-list', type: 'bulleted-list', html: '<li>Mount the editor on any element</li><li>Read the document as JSON</li><li>Style it to match your site</li>' },
]

const optionRows = [
  { key: 'showToolbar', label: 'Toolbar' },
  { key: 'showHeader', label: 'Header' },
  { key: 'showActions', label: 'Save / export' },
  { key: 'showJson', label: 'Live JSON panel' },
]

const snippet = `<!-- 1. Pocket the stylesheet -->
<link rel="stylesheet" href="papertrail-editor.css">

<!-- 2. Drop a host element where the editor should live -->
<div id="editor-host"></div>

<!-- 3. Load the bundle and mount (React is already inside) -->
<script src="papertrail-editor.umd.js"></script>
<script>
  const editor = PapertrailEditor.mountPapertrailEditor(
    document.getElementById('editor-host'),
    {
      showToolbar: true,
      onChange(blocks) {
        console.log('document JSON', blocks)
      },
    },
  )

  // Later, from your app:
  // editor.update({ showJson: true })
  // editor.unmount()
</script>`

function fallbackCopy(text, done) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try { document.execCommand('copy') } catch { /* best effort */ }
  document.body.removeChild(textarea)
  done()
}

export default function EmbedDemo() {
  const [options, setOptions] = useState({
    showToolbar: true,
    showHeader: false,
    showActions: false,
    showJson: false,
  })
  const [blocks, setBlocks] = useState(null)
  const [copied, setCopied] = useState(false)

  const toggle = (key) => setOptions((current) => ({ ...current, [key]: !current[key] }))

  const copySnippet = () => {
    const done = () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(snippet).then(done).catch(() => fallbackCopy(done))
    } else {
      fallbackCopy(done)
    }
  }

  const output = blocks ?? starterBlocks

  return (
    <div className="embed-demo">
      <div className="embed-demo-head">
        <h1>Run the editor anywhere</h1>
        <p>
          Papertrail ships a self-contained embed — React is bundled inside the script. What you see
          below is the editor dropped into a plain content page, exactly as a visitor would meet it.
          Flip the options to reshape the embed, and watch the document stream out as JSON.
        </p>
      </div>

      <div className="host-site">
        <header className="host-header">
          <div className="host-brand"><span className="host-brand-mark">◳</span>Fieldnote</div>
          <nav className="host-nav"><span>Field notes</span><span>Guides</span><span>About</span></nav>
        </header>

        <main className="host-article">
          <div className="host-kicker">Fieldnote / Guides</div>
          <h2>Let readers shape the notes</h2>
          <p>
            Skip the contact form. Give your readers a quiet strip of paper to write on — the
            Papertrail block editor sits inline in this page the same way it will sit in yours.
            The document below is live: try editing it, then glance at the JSON it produces.
          </p>

          <div className="embed-options" aria-label="Embed options">
            <span className="embed-options-label">Embed options</span>
            {optionRows.map(({ key, label }) => (
              <label className="embed-option" key={key}>
                <input type="checkbox" checked={options[key]} onChange={() => toggle(key)} />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="embed-host-slot">
            <EmbedEditor initialBlocks={embedDemoBlocks} {...options} onChange={setBlocks} />
          </div>

          <p className="host-after">
            Changes stream out through <code>onChange</code> — your host app owns the document from
            there.
          </p>
        </main>
      </div>

      <div className="embed-output">
        <div className="embed-output-label">onChange output</div>
        <pre className="json-output" dangerouslySetInnerHTML={{ __html: highlightJson(JSON.stringify(output, null, 2)) }} />
      </div>

      <section className="embed-snippet">
        <div className="embed-snippet-head">
          <div>
            <h3>Drop this into any page</h3>
            <p>One stylesheet, one script, one mount call — no build step required.</p>
          </div>
          <button className="copy-snippet" onClick={copySnippet}>{copied ? 'Copied ✓' : 'Copy'}</button>
        </div>
        <pre className="snippet-code">{snippet}</pre>
      </section>
    </div>
  )
}