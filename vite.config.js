import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const resolveFromRoot = (path) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? '/editor/' : '/',
  build: mode === 'embed' ? {
    lib: {
      entry: 'src/embed.jsx',
      name: 'PapertrailEditor',
      formats: ['es', 'umd'],
      fileName: (format) => `papertrail-editor.${format}.js`,
    },
    rollupOptions: {
      output: {},
    },
  } : {
    // two-instances.html is a Playwright-only fixture (e2e/multi-instance.spec.js)
    // proving two mounted editors never share state. CI serves the e2e suite
    // against this same built bundle via `vite preview`, so it needs to be a
    // real build entry, not just a file the dev server happens to find.
    rollupOptions: {
      input: {
        main: resolveFromRoot('./index.html'),
        twoInstances: resolveFromRoot('./two-instances.html'),
      },
    },
  },
}))
