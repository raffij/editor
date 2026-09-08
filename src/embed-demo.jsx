import React, { useState } from 'react'
import { EmbedEditor } from './embed'

const embedDemoBlocks = [
  { id: 'embed-heading', type: 'heading', html: 'Start writing here.' },
  { id: 'embed-body', type: 'paragraph', html: 'This is a live Papertrail editor. Edit this text to see how it feels on your device.' },
]

const optionRows = [
  { key: 'showToolbar', label: 'Toolbar' },
  { key: 'showHeader', label: 'Header' },
  { key: 'showActions', label: 'Save / export' },
  { key: 'showJson', label: 'JSON panel' },
]

export default function EmbedDemo() {
  const [options, setOptions] = useState({
    showToolbar: true,
    showHeader: false,
    showActions: false,
    showJson: false,
  })

  const toggle = (key) => setOptions((current) => ({ ...current, [key]: !current[key] }))

  return (
    <div className="embed-editor-page">
      <div className="embed-controls" aria-label="Embed options">
        {optionRows.map(({ key, label }) => (
          <label className="embed-option" key={key}>
            <input type="checkbox" checked={options[key]} onChange={() => toggle(key)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <div className="embed-editor-slot">
        <EmbedEditor initialBlocks={embedDemoBlocks} {...options} />
      </div>
    </div>
  )
}