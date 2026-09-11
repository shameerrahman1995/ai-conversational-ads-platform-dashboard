import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the ConvoAds dashboard hero-flow E2E specs.
 *
 * These specs run against an ALREADY-RUNNING app — there is intentionally no
 * `webServer` block. In CI (or locally) start the stack first, then run:
 *
 *   pnpm exec playwright install    # one-time: fetch browsers
 *   pnpm --filter @acp/web dev      # web on :3000 (and the API on :4000)
 *   E2E_BASE_URL=http://localhost:3000 pnpm e2e
 *
 * The base URL is read from E2E_BASE_URL (default http://localhost:3000).
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: '.',
  // Only *.spec.ts are tests; helpers.ts and this config are ignored.
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['list']],
  // Hero flows do real network work against the API; keep timeouts generous.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
