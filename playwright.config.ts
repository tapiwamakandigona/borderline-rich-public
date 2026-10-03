// E2E on a phone-sized touch viewport. Headless Chromium renders WebGL2 through SwiftShader, so
// frame timings here are NOT device performance — the budget checks are draw calls and triangles.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  // Per-test budget. GitHub's shared runners render SwiftShader ~3x slower than a dev box (run 37110751257:
  // 14.2 min vs 4.3 min locally), so CI gets more wall-clock. No assertion or render budget changes with it.
  timeout: process.env.CI ? 300_000 : 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: 'npx vite preview --outDir dist-test --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
