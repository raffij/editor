import { defineConfig } from '@playwright/test'

// Cross-block selection regression suites. These exercises Chromium + WebKit
// against the dev server because the dual-path selection rendering (native
// within a block, overlay across blocks) is engine-fragile by design.
//
// Headless is the default: it covers every selection/navigation/copy path.
// Headed projects are opt-in via `EDITOR_E2E_HEADED=1` because headless
// Chromium cannot extend a live native drag selection (see e2e/drag-during.spec.js).
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
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 5_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5211',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5211 --strictPort',
    url: 'http://localhost:5211',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects,
})