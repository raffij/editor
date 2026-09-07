import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
  } : undefined,
}))
