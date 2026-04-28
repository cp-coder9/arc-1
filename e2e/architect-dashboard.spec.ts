import { test, expect } from '@playwright/test';

test.describe('Architect Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Click Get Started
    await page.click('text=Get Started');
    await page.waitForTimeout(500);
    
    // Select Architect role
    await page.click('[data-testid="role-select-architect"]');
    
    // Click Login button
    await page.click('text=Login');
    
    // Fill in credentials
    await page.fill('input[type="email"]', 'architect@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // Wait for navigation
    await page.waitForURL('/', { timeout: 10000 });
  });

  test('should display architect dashboard heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Architect Portal');
  });

  test('should show marketplace tab', async ({ page }) => {
    // Click on Marketplace in sidebar
    await page.click('text=Marketplace');
    
    // Should show available jobs section
    await expect(page.locator('text=Available Jobs')).toBeVisible();
  });

  test('should show my applications tab', async ({ page }) => {
    // Click on My Applications in sidebar
    await page.click('text=My Applications');
    
    // Should show applications content
    await expect(page.locator('text=My Applications')).toBeVisible();
  });

  test('should show search filters', async ({ page }) => {
    // Click on Marketplace
    await page.click('text=Marketplace');
    
    // Should show search and filter elements
    await expect(page.locator('[placeholder*="Search"], input[type="search"]')).toBeVisible();
  });
});
