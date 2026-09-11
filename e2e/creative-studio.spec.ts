/**
 * AI Creative Studio — hero flow.
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

/** The nine studio stages, in order (apps/web/src/app/creative/page.tsx). */
const STAGES = [
  'Brief',
  'Directions',
  'Experience',
  'Produce',
  'Studio',
  'Variants',
  'Simulate',
  'Review',
  'Learn',
];

test.describe('AI Creative Studio', () => {
  test('loads the topbar, 9 stage tabs and the Studio canvas / interactive ad', async ({
    page,
  }) => {
    await gotoAuthed(page, '/creative');

    // Topbar identifies the studio. Scope to the breadcrumb so we don't collide
    // with the identically-labelled rail nav link.
    await expect(page.locator('.creative-topbar')).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator('.creative-breadcrumb').getByText('AI Creative Studio'),
    ).toBeVisible();

    // The 9 stage tabs render in the stage nav.
    const stageNav = page.locator('.creative-stage-nav');
    await expect(stageNav).toBeVisible();
    await expect(stageNav.locator('button')).toHaveCount(STAGES.length);
    for (const label of STAGES) {
      await expect(stageNav.getByText(label, { exact: true })).toBeVisible();
    }

    // Default stage is "studio": the canvas + the interactive ad must render.
    await expect(page.locator('.studio-canvas-area')).toBeVisible();
    await expect(page.locator('.creative-canvas')).toBeVisible();
    await expect(page.locator('.interactive-ad')).toBeVisible();
  });

  test('switches stages via the stage nav', async ({ page }) => {
    await gotoAuthed(page, '/creative');

    const stageNav = page.locator('.creative-stage-nav');
    await expect(stageNav).toBeVisible({ timeout: 30_000 });

    // "Studio" is active on load; move to "Brief".
    await stageNav.getByText('Brief', { exact: true }).click();
    await expect(stageNav.locator('button.active')).toContainText('Brief');
    // The Studio canvas is unmounted once we leave the Studio stage.
    await expect(page.locator('.studio-canvas-area')).toHaveCount(0);
  });
});
