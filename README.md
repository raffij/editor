# Papertrail editor

The GitHub Pages site is the demo: [raffij.github.io/editor](https://raffij.github.io/editor/).
Open the **Embed** tab in the top bar to try the editor at full screen — a bare writing
surface that fills the viewport, with live toggles for the embed options (toolbar, header,
save/export, JSON panel). It works from a phone, so you can test mobile behaviour on the demo.

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

## Documentation

An interactive architecture diagram of the block editor (components, regions, and how the
caret, selection, and document logic connect) is available at
[`docs/block-system-architecture.html`](docs/block-system-architecture.html), with its source
spec in [`docs/block-system-architecture.json`](docs/block-system-architecture.json).

## Regression tests

The cross-block selection logic is engine-fragile by design (native selection within a block,
an overlay across blocks), so the behavior is pinned down by end-to-end suites that run in both
Chromium and WebKit:

```bash
npm install
npx playwright install chromium webkit
npm run test:e2e
```

The suites cover vertical navigation, list keyboard selection, mouse drags (forward, backward,
cross-block, shrink-back), copy/cut/type over cross-block selections, backspace/delete over
cross-block selections removing the whole selected range (every list item included), mobile
splitting and block-merge via synthetic `beforeinput`, iOS shift+backspace keydown merging, a
full split/merge permutation matrix for list blocks (enter on empty/mid/start items breaks out
of the list in place; backspacing at the start of a list merges it into the block above as
text, keeping that block's type; backspacing at the start of a paragraph joins it into the
previous block with the caret placed at the junction — the start of the joined item, even
when the paragraph carries spans/<br> and the target list has empty items), the rule that
highlights never bleed into the 40px control gutter on the left of each block, and the
promise that backspacing a block away (merge or delete) never re-centres the page: the
caret lands where the removed block sat and the viewport only scrolls when the caret itself
is off-screen, and the mirror promise for adding/splitting blocks: a new empty block
scrolls into view with minimal movement (no centring jump) on desktop and mobile viewports.

Two more suites guard the embed use case specifically. `e2e/multi-instance.spec.js` mounts
two independent editors on one page (`two-instances.html`, a dev-only fixture not part of the
production build) — every selection/caret/drag lookup in `src/logic/caret-navigation.js` is
scoped to the editor root the interaction happened in, so two instances (even with identical
starter-content block ids) never see or mutate each other's document.
`e2e/paste-sanitize.spec.js` pins down `sanitizePastedHtml` (`src/logic/document-model.js`):
pasted tables/divs/images/inline styles/scripts are stripped, while bold/italic/links and,
inside a list block, list items survive.

The suites run fully in parallel (each test seeds its own page), and waits are event-driven
rather than fixed sleeps. Locally they run against the Vite dev server; on CI they run against a
pre-built bundle served by `vite preview`, with `npm` and the Playwright browser downloads
cached between runs. A CI workflow (`.github/workflows/e2e.yml`) runs them on every pull request
and push to `main`:

```bash
npm run test:e2e:ci   # vite build && playwright test (same as CI)
```

One suite (`e2e/drag-during.spec.js`) samples the live highlight *while the mouse is still down*,
which headless Chromium cannot do, so it is opt-in and needs a display:

```bash
EDITOR_E2E_HEADED=1 npm run test:e2e:headed
```
