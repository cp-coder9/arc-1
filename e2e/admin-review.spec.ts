import { test, expect } from '@playwright/test';

test.describe('Admin Review', () => {
 test.beforeEach(async ({ page }) => {
 await page.goto('/');
 await page.click('text=Get Started');
 await page.click('button:has-text("Admin")');
 await page.fill('input[type="email"]', 'admin@test.com');
 await page.fill('input[type="password"]', 'password123');
 await page.click('button[type="submit"]');
 await page.waitForURL('/');
 });

 test('should display admin dashboard heading', async ({ page }) => {
 await expect(page.locator('h1')).toContainText('Admin Dashboard');
 });

 test('should show compliance hub', async ({ page }) => {
 await expect(page.locator('text=Compliance Hub')).toBeVisible();
 });
});
