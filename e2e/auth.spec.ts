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

test.describe('Authentication', () => {
  test('should show landing page', async ({ page }) => {
    await gotoApp(page);
    await expect(page.getByText('Smarter projects. Stronger built environments.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Verify' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Collaborate' })).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await gotoApp(page);

    await clickLandingAction(page, 'Login');
    await forceClick(page.getByTestId('role-select-client'));
    await forceClick(page.getByRole('button', { name: 'Login with Email' }));

    await page.getByPlaceholder('name@example.com').fill('invalid@example.com');
    await page.getByPlaceholder('••••••••').fill('wrongpassword');
    await page.getByRole('button', { name: 'Login' }).dispatchEvent('click');

    await expect(page.locator('body')).toContainText(/Invalid email or password|Authentication failed|Securing session/i);
  });

  test('should expose current onboarding role selection flow', async ({ page }) => {
    await gotoApp(page);

    await clickLandingAction(page, 'Get Started');

    await expect(page.getByText('Join Architex')).toBeVisible();
    await expect(page.getByText('Select your professional role to get started')).toBeVisible();
    await expect(page.getByRole('button', { name: /Select Client role/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Select Architect role/i })).toBeVisible();

    await forceClick(page.getByTestId('role-select-client'));
    await expect(page.getByText('What is your project type?')).toBeVisible();
  });
});
