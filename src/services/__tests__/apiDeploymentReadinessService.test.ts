import { describe, expect, it } from 'vitest';
import {
  API_DEPLOYMENT_PUBLIC_ENV,
  API_DEPLOYMENT_REQUIRED_FILES,
  API_DEPLOYMENT_REQUIRED_SCRIPTS,
  API_DEPLOYMENT_SERVER_ONLY_ENV,
  projectApiDeploymentReadiness,
  type ApiDeploymentInventory,
} from '../apiDeploymentReadinessService';

const baseInventory: ApiDeploymentInventory = {
  packageScripts: Object.fromEntries(API_DEPLOYMENT_REQUIRED_SCRIPTS.map((script) => [script, `npm run ${script}`])),
  files: API_DEPLOYMENT_REQUIRED_FILES,
  serverOnlyEnvRefs: API_DEPLOYMENT_SERVER_ONLY_ENV,
  publicEnvRefs: API_DEPLOYMENT_PUBLIC_ENV,
  cpanelNodeAppEnabled: true,
  tlsCertificateValid: true,
  jsonHealthCheckPassed: true,
  unauthenticatedAdminCheckReturnsJson: true,
  bundleBuiltAt: '2026-05-21T02:10:00.000Z',
  uploadApprovalRef: 'approval:owner-api-upload-2026-05-21',
  smokeEvidenceRef: 'smoke:https://api.architex.co.za/api/health:json-ok',
  generatedAt: '2026-05-21T02:11:00.000Z',
};

describe('apiDeploymentReadinessService', () => {
  it('passes only when bundle, hosting, TLS, env, smoke, and approval evidence are all present', () => {
    const projection = projectApiDeploymentReadiness(baseInventory);

    expect(projection.generatedAt).toBe('2026-05-21T02:11:00.000Z');
    expect(projection.overallStatus).toBe('pass');
    expect(projection.productionApiEnabled).toBe(true);
    expect(projection.targetHost).toBe('api.architex.co.za');
    expect(projection.expectedFrontendHost).toBe('test.architex.co.za');
    expect(projection.gates.map((gate) => gate.status)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass', 'pass']);
    expect(projection.audit).toEqual({
      source: 'PRODUCTION_API_HOSTING_DECISION_2026-05-19.md',
      providerNeutral: true,
      deploysOrUploads: false,
      performsLiveNetworkCalls: false,
      secretsRecorded: false,
      humanApprovalRequired: true,
    });
    expect(Object.isFrozen(projection)).toBe(true);
  });

  it('fails the bundle gate when required cPanel package files, scripts, or build evidence are missing', () => {
    const projection = projectApiDeploymentReadiness({
      ...baseInventory,
      packageScripts: { 'start:api:host': 'NODE_ENV=production tsx api-server.ts' },
      files: ['api-server.ts', 'package.json'],
      bundleBuiltAt: undefined,
    });

    const bundleGate = projection.gates.find((gate) => gate.domain === 'bundle');
    expect(projection.overallStatus).toBe('fail');
    expect(projection.productionApiEnabled).toBe(false);
    expect(bundleGate?.blockers).toEqual(expect.arrayContaining([
      'Missing API deployment file src/lib/api-router.ts.',
      'Missing package script smoke:api.',
      'API bundle has not been built or recorded for cPanel upload.',
    ]));
  });

  it('keeps production API blocked while cPanel hosting or TLS is not verified', () => {
    const projection = projectApiDeploymentReadiness({
      ...baseInventory,
      cpanelNodeAppEnabled: false,
      tlsCertificateValid: false,
    });

    expect(projection.productionApiEnabled).toBe(false);
    expect(projection.gates.find((gate) => gate.domain === 'hosting')?.blockers).toContain('cPanel Node.js/Passenger app for api.architex.co.za is not enabled or not verified.');
    expect(projection.gates.find((gate) => gate.domain === 'tls')?.blockers).toContain('api.architex.co.za TLS certificate is not valid for browser API calls.');
  });

  it('requires server-only env evidence without exposing secrets through browser env', () => {
    const projection = projectApiDeploymentReadiness({
      ...baseInventory,
      serverOnlyEnvRefs: ['FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_KEY'],
      publicEnvRefs: ['VITE_API_BASE_URL', 'PAYFAST_MERCHANT_KEY'],
    });

    const environmentGate = projection.gates.find((gate) => gate.domain === 'environment');
    expect(environmentGate?.status).toBe('fail');
    expect(environmentGate?.blockers).toEqual(expect.arrayContaining([
      'Missing server-only environment evidence for BLOB_READ_WRITE_TOKEN.',
      'Missing server-only environment evidence for PAYFAST_PASSPHRASE.',
      'Server-only credential appears in public env evidence: PAYFAST_MERCHANT_KEY.',
    ]));
  });

  it('requires JSON smoke checks and human approval before enabling api.architex.co.za', () => {
    const projection = projectApiDeploymentReadiness({
      ...baseInventory,
      jsonHealthCheckPassed: false,
      unauthenticatedAdminCheckReturnsJson: false,
      smokeEvidenceRef: undefined,
      uploadApprovalRef: undefined,
    });

    expect(projection.productionApiEnabled).toBe(false);
    expect(projection.gates.find((gate) => gate.domain === 'smoke')?.blockers).toEqual(expect.arrayContaining([
      '/api/health has not returned JSON status ok from api.architex.co.za.',
      '/api/auth/check-admin has not returned a JSON unauthenticated response from api.architex.co.za.',
      'Remote API smoke evidence reference is missing.',
    ]));
    expect(projection.gates.find((gate) => gate.domain === 'governance')?.blockers).toContain('Owner/Hermes-routed approval reference is required before upload, cPanel configuration, or production API enablement.');
  });
});
