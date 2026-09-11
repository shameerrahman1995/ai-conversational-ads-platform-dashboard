/**
 * New Campaign wizard — hero flow.
 *
 * Requires the app running on E2E_BASE_URL (default http://localhost:3000) with
 * the API reachable, and browsers installed via `pnpm exec playwright install`.
 * If the client-side auth guard is active, `gotoAuthed` signs in via /login using
 * E2E_EMAIL / E2E_PASSWORD (defaults to the seeded demo account).
 *
 * Run:  E2E_BASE_URL=http://localhost:3000 pnpm e2e
 */
import { test, expect } from '@playwright/test';
import { gotoAuthed } from './helpers';

/** The eight wizard steps, in order (apps/web/src/app/campaigns/new/page.tsx). */
const STEP_LABELS = [
  'Objective',
  'Platforms',
  'Audience',
  'Creative',
  'Agent',
  'Conversion',
  'Budget',
  'Review',
];

test.describe('New campaign wizard', () => {
  test('renders the 8 step labels and the primary actions', async ({ page }) => {
    await gotoAuthed(page, '/campaigns/new');

    await expect(page.getByRole('heading', { name: 'New campaign' })).toBeVisible({
      timeout: 30_000,
    });

    // All eight stepper buttons are present (future steps are disabled but visible).
    for (const label of STEP_LABELS) {
      await expect(page.getByRole('button', { name: label })).toBeVisible();
    }

    // Both primary actions are present on the first step.
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible();
  });

  test('steps from Objective to Platforms', async ({ page }) => {
    await gotoAuthed(page, '/campaigns/new');

    // Objective step content.
    await expect(
      page.getByRole('heading', { name: "What's the goal of this campaign?" }),
    ).toBeVisible({ timeout: 30_000 });

    // A selected objective (Lead generation is the default) + a name unlock Continue.
    await page.getByRole('button', { name: 'Lead generation' }).click();
    await page.getByPlaceholder('e.g. Spring Promo').fill('E2E Smoke Test Campaign');

    const continueBtn = page.getByRole('button', { name: 'Continue' });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // Platforms step is now active.
    await expect(
      page.getByRole('heading', { name: 'Where should this campaign run?' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Google Ads' })).toBeVisible();
  });
});
