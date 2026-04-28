import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should show landing page', async ({ page }) => {
    await page.goto('/');
    // Landing page should show
    await expect(page.locator('text=Join the premier architectural marketplace')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/');
    
    // Click Get Started to open onboarding
    await page.click('text=Get Started');
    await page.waitForTimeout(500);
    
    // Select a role first (Client)
    await page.click('[data-testid="role-select-client"]');
    
    // Click Login button
    await page.click('text=Login');
    
    // Fill in credentials
    await page.fill('input[type="email"]', 'invalid@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    
    // Should show error
    await expect(page.locator('.text-destructive, [role="alert"]')).toBeVisible();
  });

  test('should show role selection required', async ({ page }) => {
    await page.goto('/');
    
    // Click Get Started
    await page.click('text=Get Started');
    await page.waitForTimeout(500);
    
    // Try to sign in without selecting role
    await page.click('text=Sign in with Google');
    
    // Should show error toast
    await expect(page.locator('text=Please select a role first')).toBeVisible();
  });
});
