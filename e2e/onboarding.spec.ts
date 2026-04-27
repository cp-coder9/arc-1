import { test, expect } from '@playwright/test';

test.describe('Onboarding Flow', () => {
 test('should guide client through onboarding', async ({ page }) => {
 await page.goto('/');
 await page.click('text=Get Started');
 
 await expect(page.locator('h1')).toContainText('Welcome to Architex');
 
 await page.click('button:has-text("Client")');
 
 await page.fill('input[type="email"]', 'client@test.com');
 await page.fill('input[type="password"]', 'password123');
 await page.click('button[type="submit"]');
 
 await page.waitForURL('/');
 await expect(page.locator('h1')).toContainText('Architectural Marketplace');
 });

 test('should guide architect through onboarding', async ({ page }) => {
 await page.goto('/');
 await page.click('text=Get Started');
 
 await page.click('button:has-text("Architect")');
 
 await page.fill('input[type="email"]', 'architect@test.com');
 await page.fill('input[type="password"]', 'password123');
 await page.click('button[type="submit"]');
 
 await page.waitForURL('/');
 await expect(page.locator('h1')).toContainText('Architectural Marketplace');
 });
});
