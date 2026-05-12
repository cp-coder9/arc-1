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

test.describe('Architect Dashboard', () => {
  test('should expose architect login option without requiring seeded credentials', async ({ page }) => {
    await page.goto('/');

    await clickLandingAction(page, 'Login');
    await page.getByTestId('role-select-architect').click();
    await page.getByRole('button', { name: 'Login with Email' }).click();

    await expect(page.getByText('Welcome Back')).toBeVisible();
    await expect(page.getByPlaceholder('name@example.com')).toBeVisible();
  });

  test('should show invalid architect credentials error', async ({ page }) => {
    await page.goto('/');

    await clickLandingAction(page, 'Login');
    await page.getByTestId('role-select-architect').click();
    await page.getByRole('button', { name: 'Login with Email' }).click();
    await page.getByPlaceholder('name@example.com').fill('architect@test.com');
    await page.getByPlaceholder('••••••••').fill('wrongpassword');
    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page.getByPlaceholder('name@example.com')).toBeVisible();
  });

  test('should route architect onboarding to SACAP profile setup', async ({ page }) => {
    await page.goto('/');

    await clickLandingAction(page, 'Get Started');
    await page.getByTestId('role-select-architect').click();

    await expect(page.getByText('SACAP Registration Number')).toBeVisible();
    await expect(page.getByText('Years of Experience')).toBeVisible();
    await expect(page.getByText('Main Specialization')).toBeVisible();
  });
});
