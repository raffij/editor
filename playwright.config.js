import { defineConfig } from '@playwright/test'

// Cross-block selection regression suites. These exercises Chromium + WebKit
// because the dual-path selection rendering (native within a block, overlay
// across blocks) is engine-fragile by design.
//
// Headless is the default: it covers every selection/navigation/copy path.
// Headed projects are opt-in via `EDITOR_E2E_HEADED=1` because headless
// Chromium cannot extend a live native drag selection (see e2e/drag-during.spec.js).
//
// Every test gets its own page/context and seeds its own document, so the
// suites run fully parallel. On CI we allow more workers than the default 50%
// of cores (a 2-core runner would otherwise serialize everything) and serve a
// pre-built static bundle (vite preview) instead of the dev server.
const isCI = !!process.env.CI
const PORT = isCI ? 4173 : 5211

const projects = [
  { name: 'chromium', use: { browserName: 'chromium' } },
  { name: 'webkit', use: { browserName: 'webkit' } },
]

if (process.env.EDITOR_E2E_HEADED) {
  projects.push(
    { name: 'chromium-headed', use: { browserName: 'chromium', headless: false } },
    { name: 'webkit-headed', use: { browserName: 'webkit', headless: false } },
  )
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: isCI ? 4 : undefined,
  timeout: 60_000,
  expect: { timeout: 5_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
  // CI runs against the static build (`npm run test:e2e:ci` builds first); the
  // dev server stays for local runs. Ports differ so a stale local server can
  // never mask CI runs, and vice versa.
  webServer: isCI
    ? {
        command: 'npm run preview -- --port 4173 --strictPort',
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
        timeout: 60_000,
      }
    : {
        command: 'npm run dev -- --port 5211 --strictPort',
        url: `http://localhost:${PORT}`,
        reuseExistingServer: true,
        timeout: 60_000,
      },
  projects,
})