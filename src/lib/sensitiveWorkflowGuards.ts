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

export interface SensitiveWorkflowPreflightInput {
  workflow: SensitiveWorkflowKey | SensitiveWorkflowFlag;
  actorId: string;
  targetType: string;
  targetId: string;
  action: string;
  humanConfirmationId?: string;
  idempotencyKey?: string;
  provider?: string;
  env?: SensitiveWorkflowEnv;
}

export interface SensitiveWorkflowAuditEvent {
  category: 'sensitive_workflow';
  action: string;
  actorId: string;
  target: {
    type: string;
    id: string;
  };
  provider?: string;
  humanConfirmationId?: string;
  idempotencyKey?: string;
  guard: SensitiveWorkflowGuardResult;
  createdAt: string;
}

export interface SensitiveWorkflowPreflightResult {
  guard: SensitiveWorkflowGuardResult;
  canSubmitToProvider: boolean;
  auditEvent: SensitiveWorkflowAuditEvent;
  missingHumanConfirmation: boolean;
  missingIdempotencyKey: boolean;
  safeResponse: SensitiveWorkflowGuardResult & {
    canSubmitToProvider: false;
    humanConfirmationId?: string;
    idempotencyKey?: string;
    auditAction: string;
  };
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

export function buildSensitiveWorkflowAuditEvent(
  input: Omit<SensitiveWorkflowPreflightInput, 'workflow' | 'env'>,
  guard: SensitiveWorkflowGuardResult,
  createdAt = new Date().toISOString()
): SensitiveWorkflowAuditEvent {
  return {
    category: 'sensitive_workflow',
    action: input.action,
    actorId: input.actorId,
    target: {
      type: input.targetType,
      id: input.targetId,
    },
    provider: input.provider,
    humanConfirmationId: input.humanConfirmationId,
    idempotencyKey: input.idempotencyKey,
    guard,
    createdAt,
  };
}

export function preflightSensitiveWorkflow(input: SensitiveWorkflowPreflightInput): SensitiveWorkflowPreflightResult {
  const guard = requireSensitiveWorkflowEnabled(input.workflow, input.env ?? process.env);
  const missingHumanConfirmation = !input.humanConfirmationId;
  const missingIdempotencyKey = !input.idempotencyKey;
  const canSubmitToProvider = guard.allowed && !missingHumanConfirmation && !missingIdempotencyKey;
  const reasonParts = [guard.reason, missingHumanConfirmation ? 'humanConfirmationId is required' : undefined, missingIdempotencyKey ? 'idempotencyKey is required' : undefined].filter(Boolean);
  const effectiveGuard: SensitiveWorkflowGuardResult = canSubmitToProvider ? guard : {
    ...guard,
    allowed: false,
    requiresHumanConfirmation: true,
    reason: reasonParts.join('; ') || 'Sensitive workflow preflight failed',
  };
  const auditEvent = buildSensitiveWorkflowAuditEvent(input, effectiveGuard);

  return {
    guard: effectiveGuard,
    canSubmitToProvider,
    auditEvent,
    missingHumanConfirmation,
    missingIdempotencyKey,
    safeResponse: {
      ...effectiveGuard,
      canSubmitToProvider: false,
      humanConfirmationId: input.humanConfirmationId,
      idempotencyKey: input.idempotencyKey,
      auditAction: input.action,
    },
  };
}

export function assertSensitiveWorkflowPreflight(input: SensitiveWorkflowPreflightInput) {
  const result = preflightSensitiveWorkflow(input);
  if (!result.canSubmitToProvider) {
    const error = new Error(result.guard.reason);
    Object.assign(error, { status: 403, sensitiveWorkflowGuard: result.guard, sensitiveWorkflowPreflight: result });
    throw error;
  }
  return result;
}
