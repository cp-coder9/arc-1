import { test, expect } from '@playwright/test';

test.describe('Architect Dashboard', () => {
 test.beforeEach(async ({ page }) => {
 await page.goto('/');
 await page.click('text=Get Started');
 await page.click('button:has-text("Architect")');
 await page.fill('input[type="email"]', 'architect@test.com');
 await page.fill('input[type="password"]', 'password123');
 await page.click('button[type="submit"]');
 await page.waitForURL('/');
 });

 test('should display architect dashboard heading', async ({ page }) => {
 await expect(page.locator('h1')).toContainText('Architect Portal');
 });

 test('should show available jobs', async ({ page }) => {
 await expect(page.locator('text=Available Jobs')).toBeVisible();
 });
});
