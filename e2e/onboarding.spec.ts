import { test, expect } from '@playwright/test';

async function clickLandingAction(page: import('@playwright/test').Page, name: string) {
  const action = page.getByRole('button', { name }).first();
  if (await action.isVisible().catch(() => false)) {
    await action.click();
    return;
  }

  await page.getByRole('button', { name: 'Toggle navigation menu' }).click();
  await page.getByRole('button', { name }).click();
}

test.describe('Onboarding Flow', () => {
  test('should guide client to account creation after onboarding', async ({ page }) => {
    await page.goto('/');

    await clickLandingAction(page, 'Get Started');
    await expect(page.getByText('Join Architex')).toBeVisible();
    await expect(page.getByText('Select your professional role to get started')).toBeVisible();

    await page.getByTestId('role-select-client').click();
    await page.locator('select[name="projectType"]').selectOption('Residential');
    await page.locator('select[name="budgetRange"]').selectOption('100k_500k');
    await page.getByRole('button', { name: 'Finish Setup' }).click();

    await expect(page.getByText('Create your account')).toBeVisible();
    await expect(page.getByPlaceholder('John Doe')).toBeVisible();
  });

  test('should guide architect to account creation after onboarding', async ({ page }) => {
    await page.goto('/');

    await clickLandingAction(page, 'Get Started');
    await expect(page.getByText('Join Architex')).toBeVisible();

    await page.getByTestId('role-select-architect').click();
    await page.getByPlaceholder('ST123456').fill('ST123456');
    await page.locator('input[name="experienceYears"]').fill('7');
    await page.locator('select[name="mainSpecialization"]').selectOption('Residential');
    await page.getByRole('button', { name: 'Finish Setup' }).click();

    await expect(page.getByText('Create your account')).toBeVisible();
    await expect(page.getByPlaceholder('John Doe')).toBeVisible();
  });

  test('should navigate back to marketplace', async ({ page }) => {
    await page.goto('/');

    await clickLandingAction(page, 'Get Started');
    await page.getByRole('button', { name: 'Cancel' }).dispatchEvent('click');

    await expect(page.getByText('Smarter projects. Stronger built environments.')).toBeVisible();
  });
});
