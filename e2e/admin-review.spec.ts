import { test, expect } from '@playwright/test';

test.describe('Admin Review', () => {
  test('should display route-based admin login page', async ({ page }) => {
    await page.goto('/admin');

    await expect(page.getByRole('heading', { name: 'Admin Portal' })).toBeVisible();
    await expect(page.getByText('Authorized Architex administrators only')).toBeVisible();
    await expect(page.getByText('Secure Admin Login')).toBeVisible();
  });

  test('should expose admin email login form from /admin', async ({ page }) => {
    await page.goto('/admin');

    await page.getByRole('button', { name: 'Login with Email' }).click();

    await expect(page.getByPlaceholder('admin@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('••••••••')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login to Admin Portal' })).toBeVisible();
  });

  test('should return from admin route to marketplace', async ({ page }) => {
    await page.goto('/admin');

    await page.getByRole('link', { name: 'Return to Marketplace' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('Smarter projects. Stronger built environments.')).toBeVisible();
  });
});
