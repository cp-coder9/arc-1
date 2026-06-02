import { defineConfig, devices } from '@playwright/test';

const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || `${process.env.USERPROFILE}\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe`;

export default defineConfig({
  testDir: './e2e',
  testMatch: /sidebar-harness\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4175',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: chromiumExecutablePath,
    },
  },
  projects: [
    {
      name: 'chromium-sidebar-harness',
    },
  ],
});