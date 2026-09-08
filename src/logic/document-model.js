export const starterBlocks = [
  {
    id: 'intro',
    type: 'heading',
    html: 'A small idea, made legible.',
  },
  {
    id: 'lead',
    type: 'paragraph',
    html: 'Good documents do not just hold information. They give the reader a path through it. Papertrail lets you shape that path one clear block at a time.',
  },
  {
    id: 'quote',
    type: 'quote',
    html: 'The best writing feels inevitable in retrospect.',
  },
  {
    id: 'principles',
    type: 'bulleted-list',
    html: '<li>Start with the point</li><li>Give each thought room to breathe</li><li>Make the next step obvious</li>',
  },
  {
    id: 'closing',
    type: 'paragraph',
    html: 'This canvas is backed by a simple JSON document. Edit the writing here; the structure stays visible alongside it.',
  },
]

export const typeMeta = {
  paragraph: { label: 'Text', icon: 'T', hint: 'Write something…' },
  heading: { label: 'Heading', icon: 'H', hint: 'Give this section a name…' },
  quote: { label: 'Quote', icon: '“', hint: 'Add a memorable line…' },
  'bulleted-list': { label: 'Bulleted list', icon: '•', hint: 'Add a list item…' },
  'numbered-list': { label: 'Numbered list', icon: '1', hint: 'Add a list item…' },
}

export const makeBlockId = (type) => `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export function isListType(type) {
  return type.includes('list')
}

export function emptyBlockHtml(type) {
  if (isListType(type)) return '<li></li>'
  return ''
}

export function blockTagName(type) {
  switch (type) {
    case 'heading': return 'h1'
    case 'quote': return 'blockquote'
    case 'bulleted-list': return 'ul'
    case 'numbered-list': return 'ol'
    default: return 'p'
  }
}

export function blockDescription(type) {
  switch (type) {
    case 'paragraph': return 'A freeform text block'
    case 'heading': return 'A section title'
    case 'quote': return 'A pull quote or callout'
    default: return 'A structured list'
  }
}

export function convertBlockContent(block, nextType) {
  const isList = isListType(block.type)
  const nextIsList = isListType(nextType)
  if (nextIsList && !isList) return `<li>${block.html || ''}</li>`
  if (!nextIsList && isList) return (block.html || '').replace(/<\/li>\s*<li>/gi, '<br>').replace(/<\/?li>/gi, '')
  return block.html
}

export function hasReadableText(html) {
  const container = document.createElement('div')
  container.innerHTML = html || ''
  return container.textContent.replace(/\u00a0/g, '').trim().length > 0
}

// Inline formatting wrappers we are free to trim / unwrap. Links and list
// structure are preserved.
const FORMAT_WRAPPERS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'MARK', 'SUB', 'SUP', 'FONT'])

// The `document.execCommand` toggle-off artifact, e.g. <b style="font-weight: normal">.
const NEUTRAL_STYLE_RE = /^\s*(font-(?:weight|style))\s*:\s*(?:normal|400|inherit)\s*;?\s*$/i

function replaceWithChildren(element) {
  const parent = element.parentNode
  if (!parent) return
  while (element.firstChild) parent.insertBefore(element.firstChild, element)
  parent.removeChild(element)
}

function hasOnlyBreaks(element) {
  if (element.childNodes.length === 0) return true
  return Array.from(element.childNodes).every((node) => node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR')
}

// Normalizes contenteditable markup in place: drops empty style/class
// attributes, unwraps inert formatting wrappers (<b style="font-weight:
// normal">, <i style="">, empty <i></i> / <b><br></b>, attribute-less
// <span>). Text nodes are left untouched so the caret survives the pass.
// Runs bottom-up over a snapshot, so nesting is handled depth-first.
export function cleanElement(root) {
  const elements = Array.from(root.querySelectorAll('*'))
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]
    const tag = el.tagName

    const style = el.getAttribute('style')
    if (style != null && !style.trim()) el.removeAttribute('style')
    const cls = el.getAttribute('class')
    if (cls != null && !cls.trim()) el.removeAttribute('class')

    if (tag === 'B' || tag === 'STRONG' || tag === 'I' || tag === 'EM' || tag === 'SPAN' || tag === 'FONT') {
      const currentStyle = el.getAttribute('style')
      if (currentStyle && currentStyle.split(';').every((decl) => !decl.trim() || NEUTRAL_STYLE_RE.test(decl.trim()))) {
        replaceWithChildren(el)
        continue
      }
    }

    if (tag === 'SPAN' && el.attributes.length === 0) {
      replaceWithChildren(el)
      continue
    }

    if (FORMAT_WRAPPERS.has(tag) && !el.textContent.trim() && hasOnlyBreaks(el)) {
      replaceWithChildren(el)
      continue
    }
  }
}

// String variant for HTML that is not yet in the live DOM (split halves,
// merges, external content). Idempotent.
export function cleanBlockHtml(html) {
  if (!html) return html
  const container = document.createElement('div')
  container.innerHTML = html
  cleanElement(container)
  return container.innerHTML
}

export function listItemsAsInlineHtml(html) {
  const container = document.createElement('div')
  container.innerHTML = html || ''
  return Array.from(container.querySelectorAll('li')).map((item) => item.innerHTML).join('<br>')
}

// Number of <li> items in a list block's html.
export function countListItems(html) {
  const container = document.createElement('div')
  container.innerHTML = html || ''
  return container.querySelectorAll('li').length
}

export function mergeBlockContent(previous, current) {
  if (previous.type.includes('list') && current.type.includes('list')) return `${previous.html || ''}${current.html || ''}`
  if (previous.type.includes('list')) return `${previous.html || ''}<li>${current.html || ''}</li>`
  if (current.type.includes('list')) return `${previous.html || ''}${previous.html ? '<br>' : ''}${listItemsAsInlineHtml(current.html)}`
  return `${previous.html || ''}${current.html || ''}`
}

export function htmlTextLength(html) {
  const container = document.createElement('div')
  container.innerHTML = html || ''
  return container.textContent.length
}

export function highlightJson(line) {
  const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const stringToken = '"(?:\\\\.|[^"\\\\])*"'
  return escaped.replace(new RegExp(`(${stringToken})(?=\\s*:)`, 'g'), '<em>$1</em>').replace(new RegExp(`(${stringToken})`, 'g'), '<strong>$1</strong>').replace(/\b(true|false|null)\b/g, '<i>$1</i>').replace(/\b(\d+)\b/g, '<b>$1</b>')
}
