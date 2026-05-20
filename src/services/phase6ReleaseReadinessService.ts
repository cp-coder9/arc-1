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

export interface Phase6SecurityRuleMatrixEntry {
  collection: string;
  owner: 'user' | 'firm' | 'admin' | 'server' | 'project' | 'mixed';
  allowCases: string[];
  denyCases: string[];
  requiredAudit: boolean;
}

export interface Phase6EnvironmentRequirement {
  key: string;
  exposure: 'server-only' | 'browser-exposed';
  requiredFor: string;
}

export interface Phase6ReleaseGateDefinition {
  id: string;
  label: string;
  required: boolean;
  noGoIfMissing: boolean;
}

export interface Phase6DryRunMigrationPlanInput {
  version: string;
  requestedBy: string;
  targetCollections: string[];
  estimatedWrites: number;
}

export interface Phase6RollbackPlan {
  releaseCommitSha: string;
  requiredArtifacts: string[];
  steps: string[];
}

export interface Phase6DryRunMigrationPlan {
  version: string;
  requestedBy: string;
  mode: 'dry-run';
  targetCollections: string[];
  estimatedWrites: number;
  idempotencyKey: string;
  steps: string[];
  rollback: Phase6RollbackPlan;
}

export interface Phase6GateResultInput {
  gateId: string;
  status: 'pass' | 'warn' | 'fail' | 'blocked';
  evidence: string;
}

export interface Phase6GateEvaluation {
  canRelease: boolean;
  blockers: string[];
  warnings: string[];
  passedGateIds: string[];
}

export interface ClassifiedEnvironmentVariables {
  serverOnly: { present: string[]; missing: string[] };
  browserExposed: { present: string[]; missing: string[] };
  leakWarnings: string[];
}

export interface Phase6ReleaseReadinessReportInput {
  generatedAt: string;
  generatedBy: string;
  gateResults: Phase6GateResultInput[];
  environment: Record<string, string | undefined>;
}

export interface Phase6ReleaseReadinessReport extends Phase6GateEvaluation {
  generatedAt: string;
  generatedBy: string;
  securityMatrixCount: number;
  requiredEnvironmentCount: number;
  environment: ClassifiedEnvironmentVariables;
  noGoConditions: string[];
  rollbackPlan: Phase6RollbackPlan;
}

export const PHASE6_SECURITY_RULE_MATRIX: readonly Phase6SecurityRuleMatrixEntry[] = Object.freeze([
  { collection: 'users', owner: 'user', allowCases: ['owner_reads_profile', 'server_updates_identity_fields', 'admin_reads_for_support'], denyCases: ['user_self_sets_admin', 'user_self_sets_subscription_status'], requiredAudit: true },
  { collection: 'firms', owner: 'firm', allowCases: ['firm_owner_updates_profile', 'admin_reads_firm', 'server_applies_verified_billing'], denyCases: ['member_self_escalates_role', 'non_member_reads_private_firm'], requiredAudit: true },
  { collection: 'firmInvites', owner: 'firm', allowCases: ['firm_admin_creates_invite', 'invitee_accepts_valid_invite'], denyCases: ['expired_invite_acceptance', 'non_admin_creates_invite'], requiredAudit: true },
  { collection: 'cpdCourses', owner: 'admin', allowCases: ['published_course_public_read', 'admin_writes_course'], denyCases: ['professional_publishes_course', 'anonymous_writes_course'], requiredAudit: true },
  { collection: 'cpdRecords', owner: 'server', allowCases: ['server_awards_passed_attempt_points', 'admin_revokes_with_reason'], denyCases: ['professional_self_awards_points', 'client_edits_certificate_url'], requiredAudit: true },
  { collection: 'subscriptions', owner: 'server', allowCases: ['server_webhook_updates_status', 'admin_reads_subscription'], denyCases: ['browser_user_direct_write', 'firm_member_changes_billing_owner'], requiredAudit: true },
  { collection: 'credits', owner: 'server', allowCases: ['server_spends_credit_with_idempotency', 'server_credits_verified_purchase'], denyCases: ['browser_user_direct_write', 'negative_credit_balance'], requiredAudit: true },
  { collection: 'ledger', owner: 'server', allowCases: ['server_append_with_idempotency', 'admin_reads_financial_audit'], denyCases: ['browser_user_direct_write', 'update_existing_ledger_entry'], requiredAudit: true },
  { collection: 'escrow', owner: 'server', allowCases: ['server_records_verified_provider_event', 'admin_places_dispute_hold_with_reason'], denyCases: ['browser_user_direct_write', 'release_without_required_human_approval'], requiredAudit: true },
  { collection: 'materialOrders', owner: 'project', allowCases: ['contractor_drafts_order', 'authorized_approver_confirms_order'], denyCases: ['ai_auto_places_order', 'supplier_edits_client_approval'], requiredAudit: true },
  { collection: 'supplierQuotes', owner: 'project', allowCases: ['supplier_submits_invited_quote', 'project_member_reads_quote'], denyCases: ['uninvited_supplier_reads_quote', 'ai_awards_quote_without_human'], requiredAudit: true },
  { collection: 'aiActionLogs', owner: 'server', allowCases: ['server_appends_ai_output', 'admin_reviews_ai_queue'], denyCases: ['delete_ai_decision_log', 'ai_approves_legal_financial_statutory_action'], requiredAudit: true },
  { collection: 'auditLogs', owner: 'server', allowCases: ['server_append_audit_event', 'admin_reads_with_reason'], denyCases: ['update_existing_audit_event', 'browser_user_direct_write'], requiredAudit: true },
]);

export const PHASE6_ENVIRONMENT_REQUIREMENTS: readonly Phase6EnvironmentRequirement[] = Object.freeze([
  { key: 'PAYFAST_MERCHANT_ID', exposure: 'server-only', requiredFor: 'payment checkout and webhook reconciliation' },
  { key: 'PAYFAST_MERCHANT_KEY', exposure: 'server-only', requiredFor: 'payment checkout signing' },
  { key: 'BLOB_READ_WRITE_TOKEN', exposure: 'server-only', requiredFor: 'certificate and invoice artifact storage' },
  { key: 'FIREBASE_SERVICE_ACCOUNT_JSON', exposure: 'server-only', requiredFor: 'server-owned rules, migrations, and webhooks' },
  { key: 'SUPPLIER_API_KEY', exposure: 'server-only', requiredFor: 'supplier adapter activation when provider terms exist' },
  { key: 'LLM_PROVIDER_API_KEY', exposure: 'server-only', requiredFor: 'AI review queues and governed summaries' },
  { key: 'VITE_FIREBASE_API_KEY', exposure: 'browser-exposed', requiredFor: 'Firebase browser client initialization' },
]);

export const PHASE6_RELEASE_GATES: readonly Phase6ReleaseGateDefinition[] = Object.freeze([
  { id: 'security-rules', label: 'Firestore rules allow and deny matrix passed', required: true, noGoIfMissing: true },
  { id: 'payment-webhooks', label: 'PayFast subscription, activation, refund, and duplicate ITN tests passed', required: true, noGoIfMissing: true },
  { id: 'dry-run-migrations', label: 'Migration dry-run produced an idempotent report and rollback artifacts', required: true, noGoIfMissing: true },
  { id: 'unit-integration-tests', label: 'Unit and integration suites passed', required: true, noGoIfMissing: true },
  { id: 'e2e-role-flows', label: 'Client, BEP, contractor, firm, supplier, freelancer, admin role flows passed', required: true, noGoIfMissing: true },
  { id: 'environment-readiness', label: 'Server-only and browser-exposed env vars classified', required: true, noGoIfMissing: true },
  { id: 'rollback-plan', label: 'Rollback procedure and artifacts verified', required: true, noGoIfMissing: true },
]);

export function buildPhase6RollbackPlan(releaseCommitSha: string): Readonly<Phase6RollbackPlan> {
  const sha = releaseCommitSha.trim();
  if (!sha) throw new Error('Release commit SHA is required');
  return Object.freeze({
    releaseCommitSha: sha,
    requiredArtifacts: ['pre_migration_export', 'mutation_report', 'release_commit_sha', 'previous_deploy_bundle'],
    steps: [
      'pause_deployments_and_background_jobs',
      'restore_previous_static_and_api_bundle',
      'restore_previous_firestore_rules',
      'run_migration_rollback_from_export_if_mutations_were_applied',
      'run_smoke_tests_and_payment_webhook_health_checks',
      'resume_jobs_only_after_owner_approval',
    ],
  });
}

export function buildPhase6DryRunMigrationPlan(input: Phase6DryRunMigrationPlanInput): Readonly<Phase6DryRunMigrationPlan> {
  const version = input.version.trim();
  const requestedBy = input.requestedBy.trim();
  if (!version) throw new Error('Migration version is required');
  if (!requestedBy) throw new Error('Migration requester is required');
  if (input.targetCollections.length === 0) throw new Error('At least one target collection is required');
  if (!Number.isInteger(input.estimatedWrites) || input.estimatedWrites < 0) throw new Error('Estimated writes must be a non-negative integer');
  const targetCollections = input.targetCollections.map((collection) => collection.trim()).filter(Boolean);
  if (targetCollections.length !== input.targetCollections.length) throw new Error('Target collection names are required');
  return Object.freeze({
    version,
    requestedBy,
    mode: 'dry-run',
    targetCollections: Object.freeze([...targetCollections]) as unknown as string[],
    estimatedWrites: input.estimatedWrites,
    idempotencyKey: `phase6:${version}:${targetCollections.join(',')}`,
    steps: Object.freeze(['snapshot_current_counts', 'validate_source_documents', 'compute_backfill_mutations_without_writing', 'write_migration_report']) as unknown as string[],
    rollback: buildPhase6RollbackPlan('pending-release-commit'),
  });
}

export function classifyEnvironmentVariables(env: Record<string, string | undefined>): Readonly<ClassifiedEnvironmentVariables> {
  const requiredServerOnly = PHASE6_ENVIRONMENT_REQUIREMENTS.filter((entry) => entry.exposure === 'server-only').map((entry) => entry.key);
  const requiredBrowser = PHASE6_ENVIRONMENT_REQUIREMENTS.filter((entry) => entry.exposure === 'browser-exposed').map((entry) => entry.key);
  const present = (key: string) => Boolean(env[key]?.trim());
  const serverOnlyPresent = requiredServerOnly.filter(present);
  const browserPresent = requiredBrowser.filter(present);
  const secretNameFragments = ['PAYFAST', 'SUPPLIER', 'BLOB', 'SERVICE_ACCOUNT', 'LLM_PROVIDER', 'API_KEY', 'MERCHANT_KEY'];
  const allowedBrowserKeys = new Set(requiredBrowser);
  const leakWarnings = Object.keys(env)
    .filter((key) => key.startsWith('VITE_') && !allowedBrowserKeys.has(key) && secretNameFragments.some((fragment) => key.includes(fragment)))
    .map((key) => `${key} appears to expose a server-only secret to the browser bundle`);
  return Object.freeze({
    serverOnly: Object.freeze({ present: Object.freeze(serverOnlyPresent) as unknown as string[], missing: Object.freeze(requiredServerOnly.filter((key) => !present(key))) as unknown as string[] }),
    browserExposed: Object.freeze({ present: Object.freeze(browserPresent) as unknown as string[], missing: Object.freeze(requiredBrowser.filter((key) => !present(key))) as unknown as string[] }),
    leakWarnings: Object.freeze(leakWarnings) as unknown as string[],
  });
}

export function evaluatePhase6GateResults(results: Phase6GateResultInput[]): Readonly<Phase6GateEvaluation> {
  const blockers = results
    .filter((result) => result.status === 'fail' || result.status === 'blocked')
    .map((result) => `${result.gateId}: ${result.evidence}`);
  const warnings = results.filter((result) => result.status === 'warn').map((result) => `${result.gateId}: ${result.evidence}`);
  const passedGateIds = results.filter((result) => result.status === 'pass').map((result) => result.gateId);
  return Object.freeze({
    canRelease: blockers.length === 0,
    blockers: Object.freeze(blockers) as unknown as string[],
    warnings: Object.freeze(warnings) as unknown as string[],
    passedGateIds: Object.freeze(passedGateIds) as unknown as string[],
  });
}

export function buildPhase6ReleaseReadinessReport(input: Phase6ReleaseReadinessReportInput): Readonly<Phase6ReleaseReadinessReport> {
  const generatedBy = input.generatedBy.trim();
  if (!generatedBy) throw new Error('Report generator is required');
  const gateEvaluation = evaluatePhase6GateResults(input.gateResults);
  const environment = classifyEnvironmentVariables(input.environment);
  const leakBlockers = environment.leakWarnings.map((warning) => `environment-readiness: ${warning}`);
  const missingEnvBlockers = [...environment.serverOnly.missing, ...environment.browserExposed.missing].map((key) => `environment-readiness: missing ${key}`);
  const blockers = [...gateEvaluation.blockers, ...leakBlockers, ...missingEnvBlockers];
  return Object.freeze({
    ...gateEvaluation,
    canRelease: blockers.length === 0,
    blockers: Object.freeze(blockers) as unknown as string[],
    generatedAt: input.generatedAt,
    generatedBy,
    securityMatrixCount: PHASE6_SECURITY_RULE_MATRIX.length,
    requiredEnvironmentCount: PHASE6_ENVIRONMENT_REQUIREMENTS.length,
    environment,
    noGoConditions: Object.freeze(['Any failed or blocked required release gate', ...PHASE6_NO_GO_CONDITIONS]) as unknown as string[],
    rollbackPlan: buildPhase6RollbackPlan('pending-release-commit'),
  });
}
