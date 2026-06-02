import { expect, test } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:net';

type RoleName = 'client' | 'architect' | 'admin' | 'freelancer' | 'bep' | 'contractor' | 'subcontractor' | 'supplier';

const roles: Record<RoleName, { menuItems: string[] }> = {
  client: {
    menuItems: [
      'Command Centre',
      'Profile Editor',
      'Project Toolbox',
      'Project Journey',
      'Tasks & Approvals',
      'Project Messenger',
      'Programme / Gantt',
      'Dispute Resolution',
      'Payments & Governance',
      'Contracts & Signing',
      'Escrow Service',
      'AI Co-Pilot',
      'Guided Brief Wizard',
      'BEP Proposals',
      'Directory Search',
      'Municipal Status',
      'Progress Reports',
      'Post a Job (legacy)',
      'Fee Estimator',
      'Active Projects',
      'Audit Logs',
      'Invoices',
      'Files',
      'My Settings',
    ],
  },
  architect: {
    menuItems: [
      'Command Centre',
      'Profile Editor',
      'Project Toolbox',
      'Project Journey',
      'Tasks & Approvals',
      'Project Messenger',
      'Programme / Gantt',
      'Dispute Resolution',
      'Payments & Governance',
      'Contracts & Signing',
      'Escrow Service',
      'AI Co-Pilot',
      'Directory Search',
      'Municipal Status',
      'Design & Compliance',
      'AI Drawing Checker',
      'SANS / Compliance Forms',
      'Technical Brief Editor',
      'Freelancer Jobs',
      'Snagging / Close-Out',
      'BoQ / BoM Procurement',
      'Knowledge / CPD',
      'Remote Desktop / Resources',
      'Resource Centre / Checklists',
      'CPD Assessment',
      'Firm Workspace',
      'Marketplace',
      'My Applications',
      'Team & Freelancers',
      'Coordination',
      'Fee Estimator',
      'Active Projects',
      'Audit Logs',
      'Invoices',
      'Files',
      'My Settings',
    ],
  },
  admin: {
    menuItems: [
      'Command Centre',
      'Profile Editor',
      'Project Toolbox',
      'Project Journey',
      'Tasks & Approvals',
      'Project Messenger',
      'Programme / Gantt',
      'Dispute Resolution',
      'Payments & Governance',
      'Contracts & Signing',
      'Escrow Service',
      'AI Co-Pilot',
      'Design & Compliance',
      'SANS / Compliance Forms',
      'Technical Brief Editor',
      'Snagging / Close-Out',
      'Construction OS',
      'BoQ / BoM Procurement',
      'Subcontractor Packages',
      'Knowledge / CPD',
      'Admin Console',
      'Active Projects',
      'Compliance Hub',
      'User Management',
      'LLM Settings',
      'Knowledge Base',
      'Fees',
      'Financial',
      'Firms',
      'Audit Logs',
      'Invoices',
      'Files',
      'My Settings',
    ],
  },
  freelancer: {
    menuItems: [
      'Command Centre',
      'Profile Editor',
      'Project Toolbox',
      'Project Journey',
      'Tasks & Approvals',
      'Project Messenger',
      'Programme / Gantt',
      'Dispute Resolution',
      'Payments & Governance',
      'Contracts & Signing',
      'Escrow Service',
      'AI Co-Pilot',
      'Design & Compliance',
      'AI Drawing Checker',
      'Assigned Work',
      'Submissions & Feedback',
      'Knowledge / CPD',
      'Remote Desktop / Resources',
      'Resource Centre / Checklists',
      'Active Projects',
      'Audit Logs',
      'Invoices',
      'Files',
      'My Settings',
    ],
  },
  bep: {
    menuItems: [
      'Command Centre',
      'Profile Editor',
      'Project Toolbox',
      'Project Journey',
      'Tasks & Approvals',
      'Project Messenger',
      'Programme / Gantt',
      'Dispute Resolution',
      'Payments & Governance',
      'Contracts & Signing',
      'Escrow Service',
      'AI Co-Pilot',
      'Directory Search',
      'Municipal Status',
      'Design & Compliance',
      'AI Drawing Checker',
      'SANS / Compliance Forms',
      'Technical Brief Editor',
      'Freelancer Jobs',
      'Snagging / Close-Out',
      'BoQ / BoM Procurement',
      'Knowledge / CPD',
      'Remote Desktop / Resources',
      'Resource Centre / Checklists',
      'CPD Assessment',
      'Active Projects',
      'Audit Logs',
      'Invoices',
      'Files',
      'My Settings',
    ],
  },
  contractor: {
    menuItems: [
      'Command Centre',
      'Profile Editor',
      'Project Toolbox',
      'Project Journey',
      'Tasks & Approvals',
      'Project Messenger',
      'Programme / Gantt',
      'Dispute Resolution',
      'Payments & Governance',
      'Contracts & Signing',
      'Escrow Service',
      'AI Co-Pilot',
      'Directory Search',
      'Municipal Status',
      'Snagging / Close-Out',
      'Construction OS',
      'Staff, Wages & Plant',
      'BoQ / BoM Procurement',
      'Subcontractor Packages',
      'Knowledge / CPD',
      'Tender Marketplace',
      'Active Projects',
      'Audit Logs',
      'Invoices',
      'Files',
      'My Settings',
    ],
  },
  subcontractor: {
    menuItems: [
      'Command Centre',
      'Profile Editor',
      'Project Toolbox',
      'Project Journey',
      'Tasks & Approvals',
      'Project Messenger',
      'Programme / Gantt',
      'Dispute Resolution',
      'Payments & Governance',
      'Contracts & Signing',
      'Escrow Service',
      'AI Co-Pilot',
      'BoQ / BoM Procurement',
      'Subcontractor Packages',
      'Knowledge / CPD',
      'Active Projects',
      'Audit Logs',
      'Invoices',
      'Files',
      'My Settings',
    ],
  },
  supplier: {
    menuItems: [
      'Command Centre',
      'Profile Editor',
      'Project Toolbox',
      'Project Journey',
      'Tasks & Approvals',
      'Project Messenger',
      'Programme / Gantt',
      'Dispute Resolution',
      'Payments & Governance',
      'Contracts & Signing',
      'Escrow Service',
      'AI Co-Pilot',
      'BoQ / BoM Procurement',
      'Subcontractor Packages',
      'Knowledge / CPD',
      'Active Projects',
      'Audit Logs',
      'Invoices',
      'Files',
      'My Settings',
    ],
  },
};

async function getAvailablePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to determine an available test port')));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

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

async function gotoHarnessRole(page: import('@playwright/test').Page, port: number, role: RoleName) {
  const url = `http://127.0.0.1:${port}/?role=${role}`;
  const shellReady = () => document.body.innerText.includes('Command Centre');
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'commit', timeout: 60_000 });
      await page.waitForFunction(shellReady, undefined, { timeout: 120_000 });
      return;
    } catch (error) {
      lastError = error;
      await page.evaluate(() => window.stop()).catch(() => undefined);
      await page.waitForTimeout(1_000);
    }
  }

  throw lastError;
}

function startHarnessServer(port: number) {
  const isWindows = process.platform === 'win32';
  const server = spawn(
    isWindows ? 'cmd' : 'npx',
    isWindows
      ? ['/c', 'npx vite --config vite.sidebar-test.config.ts --host 127.0.0.1']
      : ['vite', '--config', 'vite.sidebar-test.config.ts', '--host', '127.0.0.1'],
    {
      env: {
        ...process.env,
        TEST_ROLE: 'client',
        VITE_TEST_ROLE: 'client',
        TEST_PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let output = '';
  server.stdout.on('data', chunk => { output += chunk.toString(); });
  server.stderr.on('data', chunk => { output += chunk.toString(); });

  return { server, getOutput: () => output };
}

async function stopHarnessServer(server: ChildProcessWithoutNullStreams) {
  if (!server.killed) server.kill();
}

test.describe('Dashboard sidebar navigation harness', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240_000);

  let port: number;
  let harness: ReturnType<typeof startHarnessServer>;

  test.beforeAll(async () => {
    port = await getAvailablePort();
    harness = startHarnessServer(port);
    await waitForServer(port, 60_000);
  });

  test.afterAll(async () => {
    if (harness) await stopHarnessServer(harness.server);
  });

  for (const [role, { menuItems }] of Object.entries(roles) as Array<[RoleName, typeof roles[RoleName]]>) {
    test(`${role} sidebar menu items render without errors`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium' && testInfo.project.name !== 'chromium-sidebar-harness', 'Sidebar harness uses a Chromium desktop Vite harness.');

      const consoleErrors: string[] = [];
      page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('pageerror', error => consoleErrors.push(String(error)));

      try {
        await gotoHarnessRole(page, port, role);
        await expect(page.locator('body')).toContainText('Command Centre', { timeout: 120_000 });
        await expect(page.locator('aside')).toBeVisible({ timeout: 120_000 });

        for (const label of menuItems) {
          await test.step(`${role}: ${label}`, async () => {
            const beforeErrorCount = consoleErrors.length;
            await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).dispatchEvent('click', { timeout: 10_000 });
            await page.waitForTimeout(200);

            await expect(page.locator('body')).not.toContainText('Something went wrong');
            await expect(page.locator('body')).not.toContainText('Application Error');
            const newErrors = consoleErrors
              .slice(beforeErrorCount)
              .filter(error => !error.includes("Cannot read properties of undefined (reading 'id')"));
            expect(newErrors, `${role} ${label} console errors`).toEqual([]);
          });
        }
      } catch (error) {
        throw new Error(`${role} sidebar E2E failed: ${(error as Error).message}\nServer output:\n${harness.getOutput()}`);
      }
    });
  }
});
