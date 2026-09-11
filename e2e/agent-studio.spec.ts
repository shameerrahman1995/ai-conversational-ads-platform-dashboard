/**
 * AI Agent Studio — hero flow.
 *
 * Requires the app running on E2E_BASE_URL (default http://localhost:3000) with
 * the API reachable AND at least one seeded agent (the studio only mounts once
 * the first agent loads). Browsers via `pnpm exec playwright install`.
 * If the client-side auth guard is active, `gotoAuthed` signs in via /login using
 * E2E_EMAIL / E2E_PASSWORD (defaults to the seeded demo account).
 *
 * Run:  E2E_BASE_URL=http://localhost:3000 pnpm e2e
 */
import { test, expect } from '@playwright/test';
import { gotoAuthed } from './helpers';

/** The ten studio tabs, in order (apps/web/src/app/agents/_studio/model.ts). */
const AGENT_TABS = [
  'Setup',
  'Instructions',
  'Model & runtime',
  'Knowledge',
  'Tools',
  'Qualification',
  'Safety',
  'Voice',
  'Testing',
  'Versions',
];

test.describe('AI Agent Studio', () => {
  test('renders the 10-tab studio and the readiness rail', async ({ page }) => {
    await gotoAuthed(page, '/agents');

    // The studio mounts once the first agent's config loads (CI DB is seeded).
    const tabs = page.locator('.agent-tabs');
    await expect(tabs).toBeVisible({ timeout: 30_000 });
    await expect(tabs.locator('button')).toHaveCount(AGENT_TABS.length);
    for (const label of AGENT_TABS) {
      await expect(tabs.getByRole('button', { name: label, exact: true })).toBeVisible();
    }

    // Studio identity + the persistent readiness rail.
    await expect(page.getByText('AI Agent Studio', { exact: true })).toBeVisible();
    const rail = page.locator('.agent-readiness-stack');
    await expect(rail).toBeVisible();
    await expect(rail.getByText('Readiness', { exact: true })).toBeVisible();
    await expect(rail.getByText(/\/\s*100/)).toBeVisible(); // score "NN / 100"
    await expect(rail.getByRole('button', { name: /run full test suite/i })).toBeVisible();
  });

  test('opens the Testing tab and shows the regression + readiness UI', async ({ page }) => {
    await gotoAuthed(page, '/agents');

    const tabs = page.locator('.agent-tabs');
    await expect(tabs).toBeVisible({ timeout: 30_000 });

    await tabs.getByRole('button', { name: 'Testing', exact: true }).click();

    // The interactive test console + the regression suite section.
    await expect(page.getByText('Interactive agent test')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /run regression suite/i }).first(),
    ).toBeVisible();
    await expect(page.getByText('Regression test suite')).toBeVisible();

    // The readiness rail persists alongside the Testing tab.
    const rail = page.locator('.agent-readiness-stack');
    await expect(rail.getByText('Readiness', { exact: true })).toBeVisible();
  });
});
