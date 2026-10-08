import { defineConfig, devices } from '@playwright/test';

// Desktop UI against the mocked native commands (src/lib/mock.ts). The real build is covered by the
// tauri-driver smoke run (e2e/tauri-smoke.mjs).
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: { baseURL: 'http://127.0.0.1:1420', trace: 'retain-on-failure', screenshot: 'only-on-failure', ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } },
  webServer: { command: 'npx vite --mode e2e', url: 'http://127.0.0.1:1420', reuseExistingServer: false, timeout: 120_000 },
});
