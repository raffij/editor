import React from 'react'

export function Icon({ name, size = 18, stroke = 1.8 }) {
  const paths = {
    plus: <><path d="M12 5v14M5 12h14" /></>,
    chevron: <><path d="m7 10 5 5 5-5" /></>,
    bold: <><path d="M7 5h5.3a3.2 3.2 0 0 1 0 6.4H7V5Zm0 6.4h6a3.3 3.3 0 0 1 0 6.6H7v-6.6Z" /></>,
    italic: <><path d="M10 5h7M7 19h7M14 5 10 19" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.1.1l1.2-1.2a5 5 0 0 0-7.1-7.1L10.5 5.5" /><path d="M14 11a5 5 0 0 0-7.1-.1l-1.2 1.2a5 5 0 0 0 7.1 7.1l.7-.7" /></>,
    bullet: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" /></>,
    ordered: <><path d="M10 6h10M10 12h10M10 18h10" /><path d="M3 4h1v4M3 4h1M3 12c0-1 2-1 2 0 0 1-2 1-2 2h2M3 17c2-1 2 2 0 2 0 0 2 0 2-1" /></>,
    quote: <><path d="M9 10H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a7 7 0 0 0-4-6" /><path d="M19 10h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a7 7 0 0 0-4-6" /></>,
    code: <><path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" /></>,
    undo: <><path d="M9 8 5 12l4 4" /><path d="M5 12h8a5 5 0 0 1 5 5v1" /></>,
    redo: <><path d="m15 8 4 4-4 4" /><path d="M19 12h-8a5 5 0 0 0-5 5v1" /></>,
    settings: <><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="m19.4 15 .1.1a2 2 0 0 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4v.2a2 2 0 0 1-4 0v-.2a2 2 0 0 0-3.4-1.4l-.1.1A2 2 0 0 1 3 15.1l.1-.1a2 2 0 0 0-1.4-3.4h-.2a2 2 0 0 1 0-4h.2A2 2 0 0 0 3.1 4.2L3 4.1A2 2 0 0 1 5.8 1.3l.1.1a2 2 0 0 0 3.4-1.4V0a2 2 0 0 0 4 0v.2a2 2 0 0 0 3.4 1.4l-.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a2 2 0 0 0 1.4 3.4h.2a2 2 0 0 1 0 4h-.2a2 2 0 0 0-1.4 3.4Z" transform="translate(1 1) scale(.83)" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    dots: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
    panel: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M15 4v16" /></>,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

export function ToolbarButton({ label, children, onClick, active = false, shortcut }) {
  return (
    <button className={`toolbar-button ${active ? 'is-active' : ''}`} title={shortcut ? `${label} (${shortcut})` : label} aria-label={label} onMouseDown={(event) => event.preventDefault()} onClick={onClick}>
      {children}
    </button>
  )
}
