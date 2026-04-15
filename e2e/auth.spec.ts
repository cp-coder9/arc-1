import { test, expect } from '@playwright/test';

// Authentication tests
test.describe('Authentication', () => {
  test('should allow user to login with email', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'invalid@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('.text-destructive')).toBeVisible();
  });
});

// Job posting tests
test.describe('Job Posting', () => {
  test.beforeEach(async ({ page }) => {
    // Login as client
    await page.goto('/login');
    await page.fill('input[type="email"]', 'client@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('should allow client to post a job', async ({ page }) => {
    await page.click('text=Post New Job');
    await page.fill('input[name="title"]', 'Test Architectural Project');
    await page.fill('textarea[name="description"]', 'This is a test project description');
    await page.fill('input[name="budget"]', '50000');
    await page.selectOption('select[name="category"]', 'Residential');
    await page.click('button[type="submit"]');
    await expect(page.locator('.text-green-600')).toContainText('Job posted successfully');
  });
});

// Architect application tests
test.describe('Architect Application', () => {
  test.beforeEach(async ({ page }) => {
    // Login as architect
    await page.goto('/login');
    await page.fill('input[type="email"]', 'architect@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('should allow architect to apply for job', async ({ page }) => {
    await page.goto('/marketplace');
    await page.click('text=Apply for Job').first();
    await page.fill('textarea[name="proposal"]', 'I am interested in this project');
    await page.click('button[type="submit"]');
    await expect(page.locator('.text-green-600')).toContainText('Application submitted');
  });
});

// Drawing submission tests
test.describe('Drawing Submission', () => {
  test.beforeEach(async ({ page }) => {
    // Login as architect with active project
    await page.goto('/login');
    await page.fill('input[type="email"]', 'architect@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('should allow architect to submit drawing', async ({ page }) => {
    await page.click('text=My Active Projects');
    await page.click('text=Submit New Drawing').first();
    await page.fill('input[name="drawingName"]', 'Floor Plan Rev A');
    // Simulate file upload
    await page.setInputFiles('input[type="file"]', {
      name: 'test-drawing.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('test content'),
    });
    await page.click('button[type="submit"]');
    await expect(page.locator('.text-green-600')).toContainText('Submission successful');
  });
});

// Admin approval tests
test.describe('Admin Review', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('should allow admin to approve submission', async ({ page }) => {
    await page.click('text=Compliance Hub');
    await page.click('text=Review').first();
    await page.click('text=Approve for Council');
    await expect(page.locator('.text-green-600')).toContainText('Submission approved');
  });
});

// Messaging tests
test.describe('Messaging', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'client@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('should allow sending message', async ({ page }) => {
    await page.click('text=My Projects');
    await page.click('text=Chat').first();
    await page.fill('input[placeholder="Type a message..."]', 'Hello architect');
    await page.click('button:has-text("Send")');
    await expect(page.locator('.text-sm')).toContainText('Hello architect');
  });
});
