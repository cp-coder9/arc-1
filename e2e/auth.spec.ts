import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
 test('should show error for invalid credentials', async ({ page }) => {
 await page.goto('/');
 await page.click('text=Get Started');
 await page.fill('input[type="email"]', 'invalid@example.com');
 await page.fill('input[type="password"]', 'wrongpassword');
 await page.click('button[type="submit"]');
 await expect(page.locator('.text-destructive')).toBeVisible();
 });
});
