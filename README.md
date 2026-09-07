# Papertrail editor

The GitHub Pages site is the demo: [raffij.github.io/editor](https://raffij.github.io/editor/).

## Embed in any web app

Build the self-contained browser bundle and stylesheet:

```bash
npm install
npm run build:embed
```

Copy `dist/papertrail-editor.umd.js` and `dist/papertrail-editor.css` into the host app, then mount the editor:

```html
<link rel="stylesheet" href="/assets/papertrail-editor.css">
<div id="editor-host"></div>
<script src="/assets/papertrail-editor.umd.js"></script>
<script>
  const editor = PapertrailEditor.mountPapertrailEditor(
    document.querySelector('#editor-host'),
    {
      initialBlocks: [
        { id: 'intro', type: 'heading', html: 'A heading' },
        { id: 'body', type: 'paragraph', html: 'Edit this document.' },
      ],
      onChange(blocks) {
        console.log('document JSON', blocks)
      },
    },
  )

  // Update host-owned options later:
  // editor.update({ showJson: true })
  // editor.unmount()
</script>
```

The embed API accepts `initialBlocks`, controlled `value`, `onChange`, `onSave`, `storageKey`, `showToolbar`, `showJson`, `showHeader`, and `showActions`. `EmbedEditor` is also exported for React applications that prefer to render the component directly.
