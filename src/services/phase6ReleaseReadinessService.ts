export type ReleaseGateStatus = 'pass' | 'warn' | 'fail';
export type ReleaseGateDomain = 'security_rules' | 'migration' | 'tests' | 'environment' | 'rollback' | 'no_go';

export interface ReleaseScriptInventory {
  scripts: Record<string, string | undefined>;
}

export interface ReleaseEnvironmentInventory {
  available: string[];
  intentionallyPublic?: string[];
}

export interface ReleaseRulesInventory {
  coveredCollections: string[];
  denyCaseCollections?: string[];
  immutableFinancialCollections?: string[];
}

export interface MigrationPlanInventory {
  hasDryRun: boolean;
  hasRollback: boolean;
  plannedBackfills: string[];
}

export interface ReleaseReadinessInput {
  scripts: ReleaseScriptInventory;
  environment: ReleaseEnvironmentInventory;
  rules: ReleaseRulesInventory;
  migration: MigrationPlanInventory;
  generatedAt?: string;
}

export interface ReleaseReadinessGate {
  domain: ReleaseGateDomain;
  status: ReleaseGateStatus;
  label: string;
  evidence: string[];
  blockers: string[];
}

export interface Phase6ReleaseReadinessProjection {
  generatedAt: string;
  overallStatus: ReleaseGateStatus;
  gates: ReleaseReadinessGate[];
  releaseChecklist: string[];
  noGoConditions: string[];
  requiredCollections: string[];
  requiredServerOnlyEnv: string[];
  requiredPublicEnv: string[];
  audit: {
    deploysProductionChanges: false;
    migrationMode: 'plan_only';
    alignedScripts: string[];
  };
}

export const PHASE6_REQUIRED_COLLECTIONS = [
  'firms',
  'firm_invites',
  'contractor_staff_records',
  'contractor_plant_records',
  'contractor_wage_records',
  'cpd_assessments',
  'cpd_attempts',
  'cpd_certificates',
  'subscriptions',
  'credits',
  'procurement_workflows',
  'supplier_quotes',
  'material_orders',
  'affiliate_commission_ledger',
  'ledger_entries',
  'escrow_transactions',
  'invoices',
];

const REQUIRED_DENY_CASE_COLLECTIONS = ['ledger_entries', 'escrow_transactions', 'invoices', 'affiliate_commission_ledger'];
const REQUIRED_IMMUTABLE_FINANCIAL_COLLECTIONS = ['ledger_entries', 'escrow_transactions', 'affiliate_commission_ledger'];

export const PHASE6_RELEASE_CHECKLIST = [
  'npm run lint',
  'npm test',
  'npm run test:coverage',
  'npm run test:e2e',
  'npm run predeploy:check',
];

export const PHASE6_SERVER_ONLY_ENV = [
  'FIREBASE_SERVICE_ACCOUNT',
  'FIREBASE_SERVICE_ACCOUNT_KEY',
  'PAYFAST_PASSPHRASE',
  'PAYFAST_MERCHANT_ID',
  'PAYFAST_MERCHANT_KEY',
  'SUPPLIER_API_KEY',
  'BLOB_READ_WRITE_TOKEN',
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'NVIDIA_API_KEY',
];

export const PHASE6_PUBLIC_ENV = [
  'VITE_API_BASE_URL',
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
];

export const PHASE6_NO_GO_CONDITIONS = [
  'Any payment, escrow, invoice, credit, or affiliate commission write can be performed by a browser client.',
  'CPD certificates can be issued, revoked, or synced without a human/auditable verification path.',
  'Firm membership or project access can be escalated without owner/admin approval.',
  'Procurement awards, orders, or supplier commission ledger entries can be finalized without human approval.',
  'Required production secrets are missing or exposed through VITE-prefixed environment variables.',
  'Migration dry-run or rollback plan is missing for existing users, jobs, projects, payments, and ledger records.',
];

export function projectPhase6ReleaseReadiness(input: ReleaseReadinessInput): Phase6ReleaseReadinessProjection {
  const gates = [
    projectScriptGate(input.scripts),
    projectSecurityRulesGate(input.rules),
    projectMigrationGate(input.migration),
    projectEnvironmentGate(input.environment),
    projectRollbackGate(input.migration),
    projectNoGoGate(input),
  ];

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    overallStatus: combineGateStatuses(gates.map((gate) => gate.status)),
    gates,
    releaseChecklist: PHASE6_RELEASE_CHECKLIST,
    noGoConditions: PHASE6_NO_GO_CONDITIONS,
    requiredCollections: PHASE6_REQUIRED_COLLECTIONS,
    requiredServerOnlyEnv: PHASE6_SERVER_ONLY_ENV,
    requiredPublicEnv: PHASE6_PUBLIC_ENV,
    audit: {
      deploysProductionChanges: false,
      migrationMode: 'plan_only',
      alignedScripts: PHASE6_RELEASE_CHECKLIST.filter((command) => command.startsWith('npm run') || command === 'npm test'),
    },
  };
}

function projectScriptGate(inventory: ReleaseScriptInventory): ReleaseReadinessGate {
  const missing = PHASE6_RELEASE_CHECKLIST.filter((command) => !hasScriptForCommand(inventory.scripts, command));
  return gate('tests', missing.length === 0 ? 'pass' : 'fail', 'Release test and predeploy commands', PHASE6_RELEASE_CHECKLIST, missing.map((command) => `Missing package script for ${command}.`));
}

function projectSecurityRulesGate(inventory: ReleaseRulesInventory): ReleaseReadinessGate {
  const missingCollections = PHASE6_REQUIRED_COLLECTIONS.filter((collection) => !inventory.coveredCollections.includes(collection));
  const missingDenyCases = REQUIRED_DENY_CASE_COLLECTIONS.filter((collection) => !(inventory.denyCaseCollections ?? []).includes(collection));
  const missingImmutableFinancial = REQUIRED_IMMUTABLE_FINANCIAL_COLLECTIONS.filter((collection) => !(inventory.immutableFinancialCollections ?? []).includes(collection));
  const blockers = [
    ...missingCollections.map((collection) => `Missing explicit Firestore rule coverage for ${collection}.`),
    ...missingDenyCases.map((collection) => `Missing deny-case validation for ${collection}.`),
    ...missingImmutableFinancial.map((collection) => `Missing immutable/server-owned financial guard for ${collection}.`),
  ];
  return gate('security_rules', blockers.length === 0 ? 'pass' : 'fail', 'Firestore rules coverage', inventory.coveredCollections, blockers);
}

function projectMigrationGate(inventory: MigrationPlanInventory): ReleaseReadinessGate {
  const requiredBackfills = ['users', 'jobs', 'projects', 'payments', 'ledgers'];
  const missingBackfills = requiredBackfills.filter((item) => !inventory.plannedBackfills.includes(item));
  const blockers = [
    ...(!inventory.hasDryRun ? ['Migration plan must support dry-run mode.'] : []),
    ...missingBackfills.map((item) => `Missing ${item} backfill plan.`),
  ];
  return gate('migration', blockers.length === 0 ? 'pass' : 'fail', 'Data migration dry-run plan', inventory.plannedBackfills, blockers);
}

function projectEnvironmentGate(inventory: ReleaseEnvironmentInventory): ReleaseReadinessGate {
  const missingServerOnly = PHASE6_SERVER_ONLY_ENV.filter((key) => !inventory.available.includes(key));
  const missingPublic = PHASE6_PUBLIC_ENV.filter((key) => !inventory.available.includes(key));
  const leakedServerSecrets = inventory.available.filter((key) => key.startsWith('VITE_') && !PHASE6_PUBLIC_ENV.includes(key) && !(inventory.intentionallyPublic ?? []).includes(key));
  const serverSecretExposedAsPublic = PHASE6_SERVER_ONLY_ENV.flatMap((key) => {
    const viteName = `VITE_${key}`;
    return inventory.available.includes(viteName) ? [viteName] : [];
  });
  const blockers = [
    ...missingServerOnly.map((key) => `Missing server-only env ${key}.`),
    ...missingPublic.map((key) => `Missing public env ${key}.`),
    ...leakedServerSecrets.map((key) => `Unexpected public VITE env ${key}.`),
    ...serverSecretExposedAsPublic.map((key) => `Server secret appears exposed as ${key}.`),
  ];
  return gate('environment', blockers.length === 0 ? 'pass' : missingServerOnly.length + missingPublic.length > 0 ? 'warn' : 'fail', 'Production environment readiness', inventory.available, blockers);
}

function projectRollbackGate(inventory: MigrationPlanInventory): ReleaseReadinessGate {
  return gate('rollback', inventory.hasRollback ? 'pass' : 'fail', 'Rollback readiness', inventory.hasRollback ? ['rollback mode documented'] : [], inventory.hasRollback ? [] : ['Migration/release plan must include rollback mode.']);
}

function projectNoGoGate(input: ReleaseReadinessInput): ReleaseReadinessGate {
  const blockingDomains = [projectSecurityRulesGate(input.rules), projectMigrationGate(input.migration), projectEnvironmentGate(input.environment), projectRollbackGate(input.migration)]
    .filter((gate) => gate.status === 'fail')
    .map((gate) => gate.domain);
  return gate('no_go', blockingDomains.length === 0 ? 'pass' : 'fail', 'No-go condition evaluation', PHASE6_NO_GO_CONDITIONS, blockingDomains.map((domain) => `No-go domain still failing: ${domain}.`));
}

function hasScriptForCommand(scripts: Record<string, string | undefined>, command: string): boolean {
  if (command === 'npm test') return Boolean(scripts.test);
  const match = command.match(/^npm run (.+)$/);
  return match ? Boolean(scripts[match[1]]) : false;
}

function gate(domain: ReleaseGateDomain, status: ReleaseGateStatus, label: string, evidence: string[], blockers: string[]): ReleaseReadinessGate {
  return { domain, status, label, evidence, blockers };
}

function combineGateStatuses(statuses: ReleaseGateStatus[]): ReleaseGateStatus {
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('warn')) return 'warn';
  return 'pass';
}
