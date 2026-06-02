export type ApiDeploymentGateStatus = 'pass' | 'warn' | 'fail';
export type ApiDeploymentGateDomain = 'bundle' | 'hosting' | 'tls' | 'environment' | 'smoke' | 'governance';

export interface ApiDeploymentInventory {
  packageScripts: Record<string, string | undefined>;
  files: string[];
  serverOnlyEnvRefs?: string[];
  publicEnvRefs?: string[];
  cpanelNodeAppEnabled: boolean;
  tlsCertificateValid: boolean;
  jsonHealthCheckPassed: boolean;
  unauthenticatedAdminCheckReturnsJson: boolean;
  bundleBuiltAt?: string;
  uploadApprovalRef?: string;
  smokeEvidenceRef?: string;
  generatedAt?: string;
}

export interface ApiDeploymentGate {
  domain: ApiDeploymentGateDomain;
  status: ApiDeploymentGateStatus;
  label: string;
  evidence: string[];
  blockers: string[];
}

export interface ApiDeploymentReadinessProjection {
  generatedAt: string;
  overallStatus: ApiDeploymentGateStatus;
  productionApiEnabled: boolean;
  targetHost: 'api.architex.co.za';
  expectedFrontendHost: 'test.architex.co.za';
  gates: ApiDeploymentGate[];
  requiredFiles: string[];
  requiredScripts: string[];
  requiredServerOnlyEnv: string[];
  audit: {
    source: 'PRODUCTION_API_HOSTING_DECISION_2026-05-19.md';
    providerNeutral: true;
    deploysOrUploads: false;
    performsLiveNetworkCalls: false;
    secretsRecorded: false;
    humanApprovalRequired: true;
  };
}

export const API_DEPLOYMENT_REQUIRED_FILES = [
  'api-server.ts',
  'src/lib/api-router.ts',
  'scripts/cpanel-api-smoke.mjs',
  'scripts/build-cpanel-api-bundle.mjs',
  'docs/deployment/api-architex-co-za-cpanel.md',
  '.env.production.example',
  'package.json',
  'package-lock.json',
];

export const API_DEPLOYMENT_REQUIRED_SCRIPTS = [
  'start:api:host',
  'smoke:api',
  'deploy:api:bundle',
  'predeploy:check',
];

export const API_DEPLOYMENT_SERVER_ONLY_ENV = [
  'FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_KEY',
  'BLOB_READ_WRITE_TOKEN',
  'PAYFAST_PASSPHRASE',
  'PAYFAST_MERCHANT_ID',
  'PAYFAST_MERCHANT_KEY',
];

export const API_DEPLOYMENT_PUBLIC_ENV = ['VITE_API_BASE_URL'];

export function projectApiDeploymentReadiness(input: ApiDeploymentInventory): ApiDeploymentReadinessProjection {
  const gates = [
    projectBundleGate(input),
    projectHostingGate(input),
    projectTlsGate(input),
    projectEnvironmentGate(input),
    projectSmokeGate(input),
    projectGovernanceGate(input),
  ];
  const overallStatus = combineStatuses(gates.map((gate) => gate.status));

  return Object.freeze({
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    overallStatus,
    productionApiEnabled: overallStatus === 'pass',
    targetHost: 'api.architex.co.za',
    expectedFrontendHost: 'test.architex.co.za',
    gates,
    requiredFiles: API_DEPLOYMENT_REQUIRED_FILES,
    requiredScripts: API_DEPLOYMENT_REQUIRED_SCRIPTS,
    requiredServerOnlyEnv: API_DEPLOYMENT_SERVER_ONLY_ENV,
    audit: {
      source: 'PRODUCTION_API_HOSTING_DECISION_2026-05-19.md',
      providerNeutral: true,
      deploysOrUploads: false,
      performsLiveNetworkCalls: false,
      secretsRecorded: false,
      humanApprovalRequired: true,
    },
  } satisfies ApiDeploymentReadinessProjection);
}

function projectBundleGate(input: ApiDeploymentInventory): ApiDeploymentGate {
  const missingFiles = API_DEPLOYMENT_REQUIRED_FILES.filter((file) => !input.files.includes(file));
  const missingScripts = API_DEPLOYMENT_REQUIRED_SCRIPTS.filter((script) => !input.packageScripts[script]);
  const blockers = [
    ...missingFiles.map((file) => `Missing API deployment file ${file}.`),
    ...missingScripts.map((script) => `Missing package script ${script}.`),
    ...(!input.bundleBuiltAt ? ['API bundle has not been built or recorded for cPanel upload.'] : []),
  ];
  return gate('bundle', blockers.length === 0 ? 'pass' : 'fail', 'cPanel API bundle package readiness', [input.bundleBuiltAt ?? 'bundle build evidence missing'], blockers);
}

function projectHostingGate(input: ApiDeploymentInventory): ApiDeploymentGate {
  const blockers = input.cpanelNodeAppEnabled ? [] : ['cPanel Node.js/Passenger app for api.architex.co.za is not enabled or not verified.'];
  return gate('hosting', blockers.length === 0 ? 'pass' : 'fail', 'api.architex.co.za Node hosting readiness', input.cpanelNodeAppEnabled ? ['cPanel Node app enabled'] : [], blockers);
}

function projectTlsGate(input: ApiDeploymentInventory): ApiDeploymentGate {
  const blockers = input.tlsCertificateValid ? [] : ['api.architex.co.za TLS certificate is not valid for browser API calls.'];
  return gate('tls', blockers.length === 0 ? 'pass' : 'fail', 'API subdomain TLS readiness', input.tlsCertificateValid ? ['valid TLS certificate evidence'] : [], blockers);
}

function projectEnvironmentGate(input: ApiDeploymentInventory): ApiDeploymentGate {
  const serverRefs = input.serverOnlyEnvRefs ?? [];
  const publicRefs = input.publicEnvRefs ?? [];
  const missingServerOnly = API_DEPLOYMENT_SERVER_ONLY_ENV.filter((env) => !serverRefs.includes(env));
  const missingPublic = API_DEPLOYMENT_PUBLIC_ENV.filter((env) => !publicRefs.includes(env));
  const publicServerSecret = publicRefs.filter((env) => API_DEPLOYMENT_SERVER_ONLY_ENV.some((serverEnv) => env.includes(serverEnv.split(' ')[0])));
  const blockers = [
    ...missingServerOnly.map((env) => `Missing server-only environment evidence for ${env}.`),
    ...missingPublic.map((env) => `Missing browser/public environment evidence for ${env}.`),
    ...publicServerSecret.map((env) => `Server-only credential appears in public env evidence: ${env}.`),
  ];
  return gate('environment', blockers.length === 0 ? 'pass' : 'fail', 'API production environment evidence', [...serverRefs, ...publicRefs], blockers);
}

function projectSmokeGate(input: ApiDeploymentInventory): ApiDeploymentGate {
  const blockers = [
    ...(!input.jsonHealthCheckPassed ? ['/api/health has not returned JSON status ok from api.architex.co.za.'] : []),
    ...(!input.unauthenticatedAdminCheckReturnsJson ? ['/api/auth/check-admin has not returned a JSON unauthenticated response from api.architex.co.za.'] : []),
    ...(!input.smokeEvidenceRef ? ['Remote API smoke evidence reference is missing.'] : []),
  ];
  return gate('smoke', blockers.length === 0 ? 'pass' : 'fail', 'Remote JSON API smoke readiness', [input.smokeEvidenceRef ?? 'smoke evidence missing'], blockers);
}

function projectGovernanceGate(input: ApiDeploymentInventory): ApiDeploymentGate {
  const blockers = input.uploadApprovalRef ? [] : ['Owner/Hermes-routed approval reference is required before upload, cPanel configuration, or production API enablement.'];
  return gate('governance', blockers.length === 0 ? 'pass' : 'fail', 'Human deployment approval gate', input.uploadApprovalRef ? [input.uploadApprovalRef] : [], blockers);
}

function gate(domain: ApiDeploymentGateDomain, status: ApiDeploymentGateStatus, label: string, evidence: string[], blockers: string[]): ApiDeploymentGate {
  return { domain, status, label, evidence, blockers };
}

function combineStatuses(statuses: ApiDeploymentGateStatus[]): ApiDeploymentGateStatus {
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('warn')) return 'warn';
  return 'pass';
}
