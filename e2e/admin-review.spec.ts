import { test, expect } from '@playwright/test';

test.describe('Admin Review', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Click Get Started
    await page.click('text=Get Started');
    await page.waitForTimeout(500);
    
    // Select Admin role
    await page.click('[data-testid="role-select-admin"]');
    
    // Click Login button
    await page.click('text=Login');
    
    // Fill in credentials
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // Wait for navigation
    await page.waitForURL('/', { timeout: 10000 });
  });

  test('should display admin dashboard heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Admin Portal');
  });

  test('should show compliance hub', async ({ page }) => {
    // Click on Compliance Hub in sidebar
    await page.click('text=Compliance Hub');
    
    // Should show compliance content
    await expect(page.locator('text=Compliance Hub')).toBeVisible();
  });

  test('should show user management', async ({ page }) => {
    // Click on User Management in sidebar
    await page.click('text=User Management');
    
    // Should show user management content
    await expect(page.locator('text=User Management')).toBeVisible();
  });
});
