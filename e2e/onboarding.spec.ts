import { test, expect } from '@playwright/test';

test.describe('Onboarding Flow', () => {
  test('should guide client through onboarding', async ({ page }) => {
    await page.goto('/');
    
    // Click Get Started
    await page.click('text=Get Started');
    
    // Should show role selection
    await expect(page.locator('text=Create Account')).toBeVisible();
    await expect(page.locator('text=Select your role to join the Architex community')).toBeVisible();
    
    // Select Client role
    await page.click('[data-testid="role-select-client"]');
    
    // Click Sign Up
    await page.click('text=Sign Up');
    
    // Should show sign up form
    await expect(page.locator('text=Join Architex')).toBeVisible();
    
    // Fill in sign up form
    await page.fill('input[placeholder*="John Doe"]', 'Test Client');
    await page.fill('input[type="email"]', 'client@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // Wait for navigation to dashboard
    await page.waitForURL('/', { timeout: 10000 });
    
    // Should show Client Portal
    await expect(page.locator('h1')).toContainText('Client Portal');
  });

  test('should guide architect through onboarding', async ({ page }) => {
    await page.goto('/');
    
    // Click Get Started
    await page.click('text=Get Started');
    
    // Should show role selection
    await expect(page.locator('text=Create Account')).toBeVisible();
    
    // Select Architect role
    await page.click('[data-testid="role-select-architect"]');
    
    // Click Sign Up
    await page.click('text=Sign Up');
    
    // Should show sign up form
    await expect(page.locator('text=Join Architex')).toBeVisible();
    
    // Fill in sign up form
    await page.fill('input[placeholder*="John Doe"]', 'Test Architect');
    await page.fill('input[type="email"]', 'architect@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // Wait for navigation
    await page.waitForURL('/', { timeout: 10000 });
    
    // Should show Architect Portal
    await expect(page.locator('h1')).toContainText('Architect Portal');
  });

  test('should navigate back to marketplace', async ({ page }) => {
    await page.goto('/');
    
    // Click Get Started
    await page.click('text=Get Started');
    await page.waitForTimeout(500);
    
    // Click Back to Marketplace
    await page.click('text=Back to Marketplace');
    
    // Should show landing page
    await expect(page.locator('text=Join the premier architectural marketplace')).toBeVisible();
  });
});
