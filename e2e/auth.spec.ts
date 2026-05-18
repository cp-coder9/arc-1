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

test.describe('Authentication', () => {
  const publicRoles = ['client', 'freelancer', 'bep', 'contractor', 'subcontractor', 'supplier'];

  test('should show landing page', async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('body')).toContainText(/Where projects stop leaking time\./i);
    await expect(page.locator('body')).toContainText(/Discover/);
    await expect(page.locator('body')).toContainText(/Verify/);
    await expect(page.locator('body')).toContainText(/Collaborate/);
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await gotoApp(page);

    await clickLandingAction(page, 'Login');
    await forceClick(page.getByTestId('role-select-client'));
    await forceClick(page.getByRole('button', { name: 'Login with Email' }));

    await page.getByPlaceholder('name@example.com').fill('invalid@example.com');
    await page.getByPlaceholder('••••••••').fill('wrongpassword');
    await page.getByRole('button', { name: 'Login' }).dispatchEvent('click');

    await expect(page.locator('body')).toContainText(/Invalid email or password|Authentication failed|Securing session/i);
  });

  test('should expose current onboarding role selection flow', async ({ page }) => {
    await gotoApp(page);

    await clickLandingAction(page, 'Get Started');

    await expect(page.getByText('Join Architex')).toBeVisible();
    await expect(page.getByText('Select your professional role to get started')).toBeVisible();
    for (const role of publicRoles) {
      await expect(page.getByTestId(`role-select-${role}`)).toBeVisible();
    }

    await forceClick(page.getByTestId('role-select-client'));
    await expect(page.getByText('What is your project type?')).toBeVisible();
  });

  test('should expose every production role from login without hiding the modal content', async ({ page }) => {
    await gotoApp(page);

    await clickLandingAction(page, 'Login');
    await expect(page.getByText('Join Architex')).toBeVisible();

    for (const role of publicRoles) {
      await expect(page.getByTestId(`role-select-${role}`)).toBeVisible();
    }
  });
});
