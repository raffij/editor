# Papertrail editor

The GitHub Pages site is the demo: [raffij.github.io/editor](https://raffij.github.io/editor/).
Open the **Embed** tab in the top bar to see the editor dropped into a plain content page,
with live controls for the embed options, an `onChange` JSON stream, and a copyable mount snippet.

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

## Regression tests

The cross-block selection logic is engine-fragile by design (native selection within a block,
an overlay across blocks), so the behavior is pinned down by end-to-end suites that run against
the dev server in both Chromium and WebKit:

```bash
npm install
npx playwright install chromium webkit
npm run test:e2e
```

The suites cover vertical navigation, list keyboard selection, mouse drags (forward, backward,
cross-block, shrink-back), copy/cut/type/backspace over cross-block selections, mobile
splitting and block-merge via synthetic `beforeinput`, and the rule that
highlights never bleed into the 40px control gutter on the left of each block. A CI workflow
(`.github/workflows/e2e.yml`) runs them on every pull request.

One suite (`e2e/drag-during.spec.js`) samples the live highlight *while the mouse is still down*,
which headless Chromium cannot do, so it is opt-in and needs a display:

```bash
EDITOR_E2E_HEADED=1 npm run test:e2e:headed
```
