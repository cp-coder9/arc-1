import { test, expect } from '@playwright/test';

async function clickLandingAction(page: import('@playwright/test').Page, name: string) {
  await page.locator('button').filter({ hasText: name }).first().evaluate((element: HTMLElement) => element.click());
}

async function gotoApp(page: import('@playwright/test').Page, path = '/') {
  await page.goto(path, { waitUntil: 'commit', timeout: 30_000 });
}

async function forceClick(locator: import('@playwright/test').Locator) {
  await locator.evaluate((element: HTMLElement) => element.click());
}

test.describe('Onboarding Flow', () => {
  test('should guide client to account creation after onboarding', async ({ page }) => {
    await gotoApp(page);

    await clickLandingAction(page, 'Get Started');
    await expect(page.getByText('Join Architex')).toBeVisible();
    await expect(page.getByText('Select your professional role to get started')).toBeVisible();

    await forceClick(page.getByTestId('role-select-client'));
    await page.locator('select[name="projectType"]').selectOption('Residential');
    await page.locator('select[name="budgetRange"]').selectOption('100k_500k');
    await page.getByRole('button', { name: 'Finish Setup' }).click();

    await expect(page.getByText('Create your account')).toBeVisible();
    await expect(page.getByPlaceholder('John Doe')).toBeVisible();
  });

  test('should guide BEP architect profile to account creation after onboarding', async ({ page }) => {
    await gotoApp(page);

    await clickLandingAction(page, 'Get Started');
    await expect(page.getByText('Join Architex')).toBeVisible();

    await forceClick(page.getByTestId('role-select-bep'));
    await page.locator('select[name="professionalLabel"]').selectOption('Architect');
    await page.locator('input[name="region"]').fill('Gauteng');
    await page.getByPlaceholder('ST123456').fill('ST123456');
    await page.locator('select[name="mainSpecialization"]').selectOption('Residential');
    await page.getByRole('button', { name: 'Complete Profile' }).click();

    await expect(page.getByText('Create your account')).toBeVisible();
    await expect(page.getByPlaceholder('John Doe')).toBeVisible();
  });

  test('should navigate back to marketplace', async ({ page }) => {
    await gotoApp(page);

    await clickLandingAction(page, 'Get Started');
    await page.getByRole('button', { name: 'Cancel' }).dispatchEvent('click');

    await expect(page.getByText('Smarter projects. Stronger built environments.')).toBeVisible();
  });
});
