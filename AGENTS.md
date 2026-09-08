# Papertrail editor — Agent working conventions

Instructions for agents working in this repository. Follow these unless the user
explicitly overrides them.

## Workflow

1. **Assess** — understand the change requested. Read the relevant source in
   `src/` (see layout below) and confirm the current behaviour before editing.
2. **Change** — make the fix or feature, keeping changes consistent with the
   existing structure, naming, and patterns.
3. **Test** — add or update tests. This repo uses Playwright end-to-end suites in
   `e2e/` running against Chromium and WebKit. See the *Testing* section for how
   to run and add them. Add a test whenever the change to behaviour can be pinned
   by an e2e suite.
4. **Document** — update relevant docs (README, AGENTS.md, or the source
   comments) if the change affects usage, embed API, or behaviour. Keep the
   README's embed docs and regression-test list accurate.
5. **Verify** — run the build and the full e2e suite and make sure everything
   passes before pushing.
6. **Ship** — push a pull request using the conventions below.

## Demo / what the project is

The GitHub Pages site at `raffij.github.io/editor` is the demo. The editor can
also be embedded into any web app as a self-contained bundle (see `README.md`).
Keep the embed API and the demo working when changing things.

## Code layout

- `src/components/` — React components (block editor, surface, controls).
- `src/logic/` — document model, caret navigation, editor state logic.
- `e2e/` — Playwright regression suites (`*.spec.js`, plus `_helpers.js`).
- `dist/` — build output; never edit by hand.

## Testing

```bash
npm install
npx playwright install chromium webkit   # once
npm run test:e2e                          # headless chromium + webkit
npm run test:e2e:headed                   # opt-in headed (drag-during.spec.js needs a display)
npm run build
```

- The cross-block selection logic is intentionally engine-fragile, so behaviour
  is pinned by e2e suites in both Chromium and WebKit. Add coverage there.
- `npm run build` must pass before pushing.

## Pull requests

- **One PR per session.** Accumulate the changes made in a session (even across
  several distinct fixes/features) into a single PR before pushing, rather than
  opening separate PRs per change.
- **Auto-push.** After the assessment, tests, documentation, and verification
  are complete and everything passes, create a branch, commit, and open the PR
  without asking — unless the user has signalled they want to review first.
- Branch name follows the existing convention: `fix/`, `polish/`, `feature/`,
  or similar prefix plus a short kebab-case slug (e.g. `fix/ios-enter-split`,
  `polish/block-layout`).
- Title: a concise, imperative summary of what the PR does (see merged PR
  history for style).
- Use the GitHub CLI (`gh`) to create the PR against `main`, with a body that
  summarises the changes and any test coverage added.
- Base the branch off the latest `main` before committing and pushing.
