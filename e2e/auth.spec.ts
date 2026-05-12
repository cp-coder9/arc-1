import { test, expect } from '@playwright/test';

async function clickLandingAction(page: import('@playwright/test').Page, name: string) {
  const action = page.getByRole('button', { name }).first();
  if (await action.isVisible().catch(() => false)) {
    await action.click();
    return;
  }

  await page.getByRole('button', { name: 'Toggle navigation menu' }).click();
  await page.getByRole('button', { name }).click();
}

test.describe('Authentication', () => {
  test('should show landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Smarter projects. Stronger built environments.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Verify' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Collaborate' })).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/');

    await clickLandingAction(page, 'Login');
    await page.getByTestId('role-select-client').click();
    await page.getByRole('button', { name: 'Login with Email' }).click();

    await page.getByPlaceholder('name@example.com').fill('invalid@example.com');
    await page.getByPlaceholder('••••••••').fill('wrongpassword');
    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page.getByPlaceholder('name@example.com')).toBeVisible();
  });

  test('should expose current onboarding role selection flow', async ({ page }) => {
    await page.goto('/');

    await clickLandingAction(page, 'Get Started');

    await expect(page.getByText('Join Architex')).toBeVisible();
    await expect(page.getByText('Select your professional role to get started')).toBeVisible();
    await expect(page.getByRole('button', { name: /Select Client role/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Select Architect role/i })).toBeVisible();

    await page.getByTestId('role-select-client').click();
    await expect(page.getByText('What is your project type?')).toBeVisible();
  });
});
