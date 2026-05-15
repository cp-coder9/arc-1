import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const registryMatch = appSource.match(/const CANONICAL_DASHBOARD_PAGES: DashboardPage\[\] = \[([\s\S]*?)\n\];/);
const registrySource = registryMatch?.[1] ?? '';

const findPageEntry = (id: string) => {
  const entry = registrySource
    .split('\n')
    .find((line) => line.includes(`{ id: '${id}',`));
  expect(entry, `Expected dashboard registry entry for ${id}`).toBeTruthy();
  return entry ?? '';
};

const entryIncludesRole = (entry: string, role: string) => {
  const designTeamRoles = ['bep', 'architect'];
  return entry.includes(`'${role}'`) || (designTeamRoles.includes(role) && entry.includes('DESIGN_TEAM_ROLES'));
};

const expectPage = (id: string, label: string, roles: string[]) => {
  const entry = findPageEntry(id);

  expect(entry).toContain(`label: '${label}'`);
  for (const role of roles) {
    expect(entryIncludesRole(entry, role), `Expected ${id} to include role ${role}`).toBe(true);
  }
};

describe('canonical dashboard page registry', () => {
  it('keeps backend.html shared workflow pages exposed for every canonical role', () => {
    expect(registryMatch, 'CANONICAL_DASHBOARD_PAGES should remain statically discoverable').toBeTruthy();

    const canonicalRoles = ['client', 'bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'];
    const sharedPages = [
      ['command', 'Command Centre'],
      ['profile', 'Profile Editor'],
      ['toolbox', 'Project Toolbox'],
      ['journey', 'Project Journey'],
      ['tasks', 'Tasks & Approvals'],
      ['messages', 'Project Messenger'],
      ['programme', 'Programme / Gantt'],
      ['disputes', 'Dispute Resolution'],
      ['payments', 'Payments & Governance'],
      ['contracts', 'Contracts & Signing'],
      ['escrow', 'Escrow Service'],
      ['ai', 'AI Co-Pilot'],
    ] as const;

    for (const [id, label] of sharedPages) {
      expectPage(id, label, canonicalRoles);
    }
  });

  it('keeps role-specific canonical dashboard pages labelled and role-gated', () => {
    expectPage('client-intake', 'Guided Brief Wizard', ['client']);
    expectPage('client-proposals', 'BEP Proposals', ['client']);
    expectPage('directory-search', 'Directory Search', ['client', 'bep', 'architect', 'contractor']);
    expectPage('municipal-tracker', 'Municipal Status', ['client', 'bep', 'architect', 'contractor']);
    expectPage('design', 'Design & Compliance', ['bep', 'architect', 'freelancer', 'admin']);
    expectPage('drawing-checker', 'AI Drawing Checker', ['bep', 'architect', 'freelancer']);
    expectPage('procurement', 'BoQ / BoM Procurement', ['bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'admin']);
    expectPage('packages', 'Subcontractor Packages', ['contractor', 'subcontractor', 'supplier', 'admin']);
    expectPage('freelancer-work', 'Assigned Work', ['freelancer']);
    expectPage('knowledge', 'Knowledge / CPD', ['bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin']);
    expectPage('admin-console', 'Admin Console', ['admin']);
  });
});
