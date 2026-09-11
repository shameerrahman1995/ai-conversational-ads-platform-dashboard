import { type Page, expect } from '@playwright/test';

/**
 * Shared E2E helpers.
 *
 * The dashboard uses a client-side auth guard (see apps/web/src/components/AppShell.tsx):
 * once localStorage has hydrated, any route other than `/login` is replaced with
 * `/login` when there is no session token. These helpers detect that wall and sign
 * in through the real `/login` page so a spec can just ask for the page it wants.
 *
 * Credentials come from the environment so CI can inject real ones; they default to
 * the seeded demo account shown on the login screen.
 *
 *   E2E_EMAIL     (default: srahman@hodos360.ai)
 *   E2E_PASSWORD  (default: demo1234)
 */
export const E2E_EMAIL = process.env.E2E_EMAIL ?? 'srahman@hodos360.ai';
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'demo1234';

/**
 * Returns true when the app has bounced us to the `/login` wall. Races the login
 * form against the authenticated app shell so it resolves quickly on either path
 * rather than always waiting out a timeout.
 */
async function onLoginWall(page: Page): Promise<boolean> {
  const password = page.locator('input[type="password"]');
  const shell = page.locator('.app-shell');
  await Promise.race([
    password
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .catch(() => undefined),
    shell
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .catch(() => undefined),
  ]);
  return page.url().includes('/login') && (await password.count()) > 0;
}

/**
 * Sign in through the real `/login` page. Idempotent — `/login` always renders the
 * form, so this is safe to call even if a session already exists.
 */
export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  const email = page.locator('input[type="email"]');
  await email.first().waitFor({ state: 'visible', timeout: 20_000 });
  await email.first().fill(E2E_EMAIL);
  await page.locator('input[type="password"]').first().fill(E2E_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  // On success the app stores the token and routes to the workspace overview.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
}

/**
 * Navigate to `path`, transparently handling the login wall if it appears.
 * After a fresh sign-in the token lives in localStorage for the rest of the
 * browser context, so later navigations in the same test stay authenticated.
 */
export async function gotoAuthed(page: Page, path: string): Promise<void> {
  await page.goto(path);
  if (await onLoginWall(page)) {
    await login(page);
    await page.goto(path);
    // Guard/hydration shouldn't bounce us again now that we hold a token.
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
  }
}
