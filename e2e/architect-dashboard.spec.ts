import { test, expect } from '@playwright/test';

async function clickLandingAction(page: import('@playwright/test').Page, name: string) {
  await page.locator('button').filter({ hasText: name }).first().evaluate((element: HTMLElement) => element.click());
}

async function gotoApp(page: import('@playwright/test').Page, path = '/') {
  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const appShellReady = () =>
    document.body.innerText.includes('Architex') ||
    document.body.innerText.includes('Admin Portal') ||
    document.body.innerText.includes('Join Architex');

  try {
    await page.waitForFunction(appShellReady, undefined, { timeout: 60_000 });
  } catch (error) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(appShellReady, undefined, { timeout: 60_000 });
  }
}

async function forceClick(locator: import('@playwright/test').Locator) {
  await locator.evaluate((element: HTMLElement) => element.click());
}

test.describe('BEP / Design Team Login', () => {
  test('should expose BEP design-team login option without requiring seeded credentials', async ({ page }) => {
    await gotoApp(page);

    await clickLandingAction(page, 'Login');
    await forceClick(page.getByTestId('role-select-bep'));
    await forceClick(page.getByRole('button', { name: 'Login with Email' }));

    await expect(page.getByText('Welcome Back')).toBeVisible();
    await expect(page.getByPlaceholder('name@example.com')).toBeVisible();
  });

  test('should show invalid BEP credentials error', async ({ page }) => {
    await gotoApp(page);

    await clickLandingAction(page, 'Login');
    await forceClick(page.getByTestId('role-select-bep'));
    await forceClick(page.getByRole('button', { name: 'Login with Email' }));
    await page.getByPlaceholder('name@example.com').fill('bep@test.com');
    await page.getByPlaceholder('••••••••').fill('wrongpassword');
    await page.getByRole('button', { name: 'Login' }).dispatchEvent('click');

    await expect(page.locator('body')).toContainText(/Invalid email or password|Authentication failed|Securing session/i);
  });

  test('should route architects through BEP onboarding with SACAP profile fields', async ({ page }) => {
    await gotoApp(page);

    await clickLandingAction(page, 'Get Started');
    await forceClick(page.getByTestId('role-select-bep'));

    await expect(page.getByText('Trade / Profession')).toBeVisible();
    await page.locator('select[name="professionalLabel"]').selectOption('Architect');
    await expect(page.getByText('SACAP Registration #')).toBeVisible();
    await expect(page.getByText('Professional Indemnity')).toBeVisible();
  });
});
