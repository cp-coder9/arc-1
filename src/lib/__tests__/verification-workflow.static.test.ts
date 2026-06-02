import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};
const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/verification.yml'), 'utf8');
const validatorScriptPath = resolve(process.cwd(), 'scripts/validate-api-contracts.mjs');
const validatorScript = readFileSync(validatorScriptPath, 'utf8');
const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8');
const adminDashboard = readFileSync(resolve(process.cwd(), 'src/components/AdminDashboard.tsx'), 'utf8');

describe('verification workflow static regressions', () => {
  it('keeps the API contract documentation validator wired into package scripts and CI', () => {
    expect(packageJson.scripts['docs:api-contracts']).toBe('node scripts/validate-api-contracts.mjs');
    expect(statSync(validatorScriptPath).isFile()).toBe(true);
    expect(workflow).toContain('npm run docs:api-contracts');
    expect(workflow.indexOf('npm test')).toBeLessThan(workflow.indexOf('npm run docs:api-contracts'));
    expect(workflow.indexOf('npm run docs:api-contracts')).toBeLessThan(workflow.indexOf('npm run build'));
  });

  it('keeps route coverage and JSON parsing behavior explicit in the validator and README', () => {
    expect(validatorScript).toContain('extractDocumentedRoutes');
    expect(validatorScript).toContain('JSON.parse');
    expect(validatorScript).toContain('Uncovered documented routes requiring deterministic contract examples');
    expect(validatorScript).toContain("route !== 'POST /track-municipality'");
    expect(readme).toContain('npm run docs:api-contracts');
    expect(readme).toContain('documented non-legacy API reference routes have deterministic contract examples');
  });

  it('surfaces the prioritized admin verification queue projection in the governance console', () => {
    expect(adminDashboard).toContain('buildVerificationQueueProjection(userVerifications)');
    expect(adminDashboard).toContain('verificationQueue.summary.overdue');
    expect(adminDashboard).toContain('SLA overdue');
    expect(adminDashboard).toContain('verificationQueue.items.map');
    expect(adminDashboard).toContain('{queueItem.priority} priority');
    expect(adminDashboard).toContain('{queueItem.action}');
    expect(adminDashboard).toContain('{queueItem.blocker &&');
  });
});
