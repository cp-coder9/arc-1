import { expect, test } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

type RoleName = 'client' | 'architect' | 'admin';

const roles: Record<RoleName, { port: number; menuItems: string[] }> = {
  client: {
    port: 4511,
    menuItems: ['Overview', 'Post a Job', 'Active Projects', 'Audit Logs', 'Invoices', 'Files', 'My Settings'],
  },
  architect: {
    port: 4512,
    menuItems: ['Overview', 'Marketplace', 'My Applications', 'Team & Freelancers', 'Active Projects', 'Audit Logs', 'Invoices', 'Files', 'My Settings'],
  },
  admin: {
    port: 4513,
    menuItems: ['Overview', 'Active Projects', 'Compliance Hub', 'User Management', 'LLM Settings', 'Knowledge Base', 'Audit Logs', 'Invoices', 'Files', 'My Settings'],
  },
};

async function waitForServer(port: number, timeoutMs = 30_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) return;
    } catch {
      // Server is still booting.
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for test server on port ${port}`);
}

function startHarnessServer(role: RoleName, port: number) {
  const server = spawn('cmd', ['/c', 'npx vite --config vite.sidebar-test.config.ts --host 127.0.0.1'], {
    env: {
      ...process.env,
      TEST_ROLE: role,
      VITE_TEST_ROLE: role,
      TEST_PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  server.stdout.on('data', chunk => { output += chunk.toString(); });
  server.stderr.on('data', chunk => { output += chunk.toString(); });

  return { server, getOutput: () => output };
}

async function stopHarnessServer(server: ChildProcessWithoutNullStreams) {
  if (!server.killed) server.kill();
}

test.describe('Dashboard sidebar navigation harness', () => {
  test.setTimeout(120_000);

  for (const [role, { port, menuItems }] of Object.entries(roles) as Array<[RoleName, typeof roles[RoleName]]>) {
    test(`${role} sidebar menu items render without errors`, async ({ page }) => {
      const { server, getOutput } = startHarnessServer(role, port);
      const consoleErrors: string[] = [];
      page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('pageerror', error => consoleErrors.push(String(error)));

      try {
        await waitForServer(port);
        await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('aside')).toBeVisible({ timeout: 20_000 });

        for (const label of menuItems) {
          await test.step(`${role}: ${label}`, async () => {
            const beforeErrorCount = consoleErrors.length;
            await page.getByRole('button', { name: label }).click({ timeout: 10_000 });
            await page.waitForTimeout(200);

            await expect(page.locator('body')).not.toContainText('Something went wrong');
            await expect(page.locator('body')).not.toContainText('Application Error');
            expect(consoleErrors.slice(beforeErrorCount), `${role} ${label} console errors`).toEqual([]);
          });
        }
      } catch (error) {
        throw new Error(`${role} sidebar E2E failed: ${(error as Error).message}\nServer output:\n${getOutput()}`);
      } finally {
        await stopHarnessServer(server);
      }
    });
  }
});