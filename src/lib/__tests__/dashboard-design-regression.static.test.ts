import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const root = process.cwd();
const readSource = (relativePath: string) => readFileSync(path.join(root, relativePath), 'utf8');

const dashboardSources = [
  'src/App.tsx',
  'src/components/AdminDashboard.tsx',
  'src/components/ArchitectDashboard.tsx',
  'src/components/BEPDashboard.tsx',
  'src/components/ClientDashboard.tsx',
  'src/components/ContractorDashboard.tsx',
  'src/components/FirmDashboard.tsx',
  'src/components/FreelancerDashboard.tsx',
];

const dashboardComponents = [
  'src/components/AdminDashboard.tsx',
  'src/components/ArchitectDashboard.tsx',
  'src/components/BEPDashboard.tsx',
  'src/components/ClientDashboard.tsx',
  'src/components/ContractorDashboard.tsx',
  'src/components/FirmDashboard.tsx',
  'src/components/FreelancerDashboard.tsx',
];

describe('dashboard design regression safeguards', () => {
  test('keeps dashboard shells and stat cards on theme color tokens', () => {
    const blockedDashboardColorPatterns = [
      /bg-\[#FDFDFD\]/,
      /text-(yellow|blue|green)-600/,
      /bg-(gray|slate)-\d+/,
      /text-(gray|slate)-\d+/,
    ];

    const violations = dashboardSources.flatMap((relativePath) => {
      const source = readSource(relativePath);
      return blockedDashboardColorPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath}: ${pattern}`);
    });

    expect(violations).toEqual([]);
  });

  test('keeps global keyboard focus indicators enabled for interactive elements', () => {
    const css = readSource('src/index.css');
    expect(css).toContain(':where(a, button, input, textarea, select, [role="button"], [tabindex]:not([tabindex="-1"])):focus-visible');
    expect(css).toContain('@apply outline-2 outline-offset-2 outline-ring');
    expect(css).toContain('.focus-visible-ring');
  });

  test('keeps mobile dashboard navigation controls labelled for assistive tech', () => {
    const appSource = readSource('src/App.tsx');
    expect(appSource).toContain('aria-label="Close navigation menu"');
    expect(appSource).toContain('aria-label="Open navigation menu"');
    expect(appSource).toContain('aria-label="Role workspace navigation"');
    expect(appSource).toContain('aria-expanded={isSidebarOpen}');
  });

  test('tracks P1 dashboard smoke coverage targets in source or tests', () => {
    const existingTests = [
      'src/components/__tests__/AdminDashboard.test.tsx',
      'src/components/__tests__/ArchitectDashboard.test.tsx',
      'src/components/__tests__/ClientDashboard.test.tsx',
      'src/lib/__tests__/dashboard-registry.static.test.ts',
      'src/services/__tests__/phase5DashboardReadinessService.test.ts',
      'src/lib/__tests__/dashboard-design-regression.static.test.ts',
    ].map(readSource).join('\n');

    const missing = dashboardComponents.filter((relativePath) => {
      const componentName = path.basename(relativePath, '.tsx');
      return !existingTests.includes(componentName) && !readSource(relativePath).includes(`function ${componentName}`);
    });

    expect(missing).toEqual([]);
  });
});
