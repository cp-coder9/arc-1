import { test, expect } from '@playwright/test';

async function clickLandingAction(page: import('@playwright/test').Page, name: string) {
  await page.locator('button').filter({ hasText: name }).first().evaluate((element: HTMLElement) => element.click());
}

async function gotoApp(page: import('@playwright/test').Page, path = '/') {
  await page.goto(path, { waitUntil: 'commit', timeout: 30_000 });
}

async function forceClick(locator: import('@playwright/test').Locator) {
  await locator.evaluate((element: HTMLElement) => element.click());
}

test.describe('Architect Dashboard', () => {
  test('should expose architect login option without requiring seeded credentials', async ({ page }) => {
    await gotoApp(page);

    await clickLandingAction(page, 'Login');
    await forceClick(page.getByTestId('role-select-architect'));
    await forceClick(page.getByRole('button', { name: 'Login with Email' }));

    await expect(page.getByText('Welcome Back')).toBeVisible();
    await expect(page.getByPlaceholder('name@example.com')).toBeVisible();
  });

  test('should show invalid architect credentials error', async ({ page }) => {
    await gotoApp(page);

    await clickLandingAction(page, 'Login');
    await forceClick(page.getByTestId('role-select-architect'));
    await forceClick(page.getByRole('button', { name: 'Login with Email' }));
    await page.getByPlaceholder('name@example.com').fill('architect@test.com');
    await page.getByPlaceholder('••••••••').fill('wrongpassword');
    await page.getByRole('button', { name: 'Login' }).dispatchEvent('click');

    await expect(page.locator('body')).toContainText(/Invalid email or password|Authentication failed|Securing session/i);
  });

  test('should route architect onboarding to SACAP profile setup', async ({ page }) => {
    await gotoApp(page);

    await clickLandingAction(page, 'Get Started');
    await forceClick(page.getByTestId('role-select-architect'));

    await expect(page.getByText('SACAP Registration Number')).toBeVisible();
    await expect(page.getByText('Years of Experience')).toBeVisible();
    await expect(page.getByText('Main Specialization')).toBeVisible();
  });
});
