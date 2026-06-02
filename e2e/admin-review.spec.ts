import { test, expect } from '@playwright/test';

async function gotoApp(page: import('@playwright/test').Page, path = '/') {
  const expectedText = path.startsWith('/admin') ? 'Admin Portal' : 'Architex';
  const appShellReady = (text: string) => document.body.innerText.includes(text);
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: 'commit', timeout: 60_000 });
      await page.waitForFunction(appShellReady, expectedText, { timeout: 60_000 });
      return;
    } catch (error) {
      lastError = error;
      await page.evaluate(() => window.stop()).catch(() => undefined);
      await page.waitForTimeout(1_000);
    }
  }

  throw lastError;
}

async function waitForText(page: import('@playwright/test').Page, text: string | RegExp) {
  await expect(page.locator('body')).toContainText(text, { timeout: 60_000 });
}

test.describe('Admin Review', () => {
  test('should display route-based admin login page', async ({ page }) => {
    await gotoApp(page, '/admin');

    await waitForText(page, 'Admin Portal');
    await waitForText(page, 'Secure Admin Login');
  });

  test('should expose admin email login form from /admin', async ({ page }) => {
    await gotoApp(page, '/admin');

    await waitForText(page, 'Login with Email');
    await page.getByRole('button', { name: 'Login with Email' }).evaluate((element: HTMLElement) => element.click());

    await expect(page.getByPlaceholder('admin@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('••••••••')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login to Admin Portal' })).toBeVisible();
  });

  test('should return from admin route to marketplace', async ({ page }) => {
    await gotoApp(page, '/admin');

    await waitForText(page, 'Return to Marketplace');
    await page.getByRole('link', { name: 'Return to Marketplace' }).evaluate((element: HTMLElement) => element.click());

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('body')).toContainText(/Where projects stop leaking time|Smarter projects/i);
  });
});
