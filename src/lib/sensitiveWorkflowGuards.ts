export const SENSITIVE_WORKFLOW_FLAGS = {
  livePayments: 'ARCHITEX_ENABLE_LIVE_PAYMENTS',
  escrowReleases: 'ARCHITEX_ENABLE_ESCROW_RELEASES',
  bindingAppointments: 'ARCHITEX_ENABLE_BINDING_APPOINTMENTS',
  eSignatureSubmission: 'ARCHITEX_ENABLE_E_SIGNATURE_SUBMISSION',
  municipalSubmissions: 'ARCHITEX_ENABLE_MUNICIPAL_SUBMISSIONS',
  statutoryCpdSync: 'ARCHITEX_ENABLE_STATUTORY_CPD_SYNC',
  providerVerificationAutomation: 'ARCHITEX_ENABLE_PROVIDER_VERIFICATION_AUTOMATION',
  supplierOrdering: 'ARCHITEX_ENABLE_SUPPLIER_ORDERING',
  resourceProvisioning: 'ARCHITEX_ENABLE_RESOURCE_PROVISIONING',
  transactionalEmail: 'ARCHITEX_ENABLE_TRANSACTIONAL_EMAIL',
} as const;

export const EXTERNAL_ACTIONS_DRY_RUN_FLAG = 'ARCHITEX_EXTERNAL_ACTIONS_DRY_RUN';

export type SensitiveWorkflowKey = keyof typeof SENSITIVE_WORKFLOW_FLAGS;
export type SensitiveWorkflowFlag = typeof SENSITIVE_WORKFLOW_FLAGS[SensitiveWorkflowKey];
export type SensitiveWorkflowEnv = Record<string, string | undefined>;

export interface SensitiveWorkflowGuardResult {
  flagName: SensitiveWorkflowFlag;
  allowed: boolean;
  dryRun: boolean;
  requiresHumanConfirmation: boolean;
  reason?: string;
  externalActionQueued: false;
  createsPayment: false;
  createsContract: false;
  createsSignature: false;
  submitsToProvider: false;
}

function isEnabled(value: string | undefined) {
  return value === 'true';
}

function isDryRun(env: SensitiveWorkflowEnv) {
  return env[EXTERNAL_ACTIONS_DRY_RUN_FLAG] !== 'false';
}

export function resolveSensitiveWorkflowFlag(workflow: SensitiveWorkflowKey | SensitiveWorkflowFlag): SensitiveWorkflowFlag {
  return workflow in SENSITIVE_WORKFLOW_FLAGS
    ? SENSITIVE_WORKFLOW_FLAGS[workflow as SensitiveWorkflowKey]
    : workflow as SensitiveWorkflowFlag;
}

export function requireSensitiveWorkflowEnabled(
  workflow: SensitiveWorkflowKey | SensitiveWorkflowFlag,
  env: SensitiveWorkflowEnv = process.env
): SensitiveWorkflowGuardResult {
  const flagName = resolveSensitiveWorkflowFlag(workflow);
  const dryRun = isDryRun(env);
  const enabled = isEnabled(env[flagName]);
  const allowed = enabled && !dryRun;

  return {
    flagName,
    allowed,
    dryRun,
    requiresHumanConfirmation: !allowed,
    reason: allowed ? undefined : `${flagName} is disabled or external actions are in dry-run mode`,
    externalActionQueued: false,
    createsPayment: false,
    createsContract: false,
    createsSignature: false,
    submitsToProvider: false,
  };
}

export function assertSensitiveWorkflowEnabled(
  workflow: SensitiveWorkflowKey | SensitiveWorkflowFlag,
  env: SensitiveWorkflowEnv = process.env
) {
  const result = requireSensitiveWorkflowEnabled(workflow, env);
  if (!result.allowed) {
    const error = new Error(result.reason);
    Object.assign(error, { status: 403, sensitiveWorkflowGuard: result });
    throw error;
  }
  return result;
}
