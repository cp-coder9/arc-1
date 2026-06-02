export type AppointmentContractStatus =
  | 'draft'
  | 'generated_pending_acceptance'
  | 'signature_requested'
  | 'partially_signed'
  | 'signed'
  | 'cancelled';

export type ContractPartyRole = 'client' | 'professional';

export interface ContractMilestoneLike {
  id?: string;
  name?: string;
  percentage?: number;
  amount?: number;
  releaseConditions?: string[];
  status?: string;
}

export interface AppointmentContractLike {
  id?: string;
  projectId: string;
  clientId: string;
  bepId: string;
  status?: string;
  professionalFee?: number;
  platformFee?: number;
  totalEscrowAmount?: number;
  scope?: string[];
  deliverables?: string[];
  exclusions?: string[];
  assumptions?: string[];
  milestones?: ContractMilestoneLike[];
  verificationId?: string;
  signatureRequestId?: string;
  signatures?: Partial<Record<ContractPartyRole, ContractSignatureRecord>>;
  createdAt?: string;
  updatedAt?: string;
}

export interface EscrowReadinessLike {
  status?: string;
  amount?: number;
  balance?: number;
  totalAmount?: number;
}

export interface ContractSignatureRecord {
  actorId: string;
  role: ContractPartyRole;
  signedAt: string;
  signatureProvider?: string;
  signatureReference?: string;
  ipAddress?: string;
}

export interface SignatureReadinessEvaluation {
  blockers: string[];
  warnings: string[];
  readyForHumanReview: boolean;
  readyForSignatureRequest: boolean;
  readyForExecution: boolean;
  missingSignatures: ContractPartyRole[];
  nextStatus: AppointmentContractStatus;
}

export interface SignatureRequestInput {
  contract: AppointmentContractLike;
  requestedBy: string;
  requesterRole: ContractPartyRole | 'admin';
  escrow?: EscrowReadinessLike | null;
  provider?: string;
}

export interface SignatureRequestRecord {
  contractId: string;
  projectId: string;
  requestedBy: string;
  requesterRole: ContractPartyRole | 'admin';
  provider: string;
  status: 'pending_human_signatures';
  humanSignatureRequired: true;
  autoExecutionProhibited: true;
  blockersAtRequest: string[];
  warningsAtRequest: string[];
  createdAt: string;
  updatedAt: string;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw Object.assign(new Error(`${field} is required`), { status: 400 });
  return value.trim();
}

function cleanStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim()) : [];
}

function positiveFinite(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function evaluateContractSignatureReadiness(contract: AppointmentContractLike, escrow?: EscrowReadinessLike | null): SignatureReadinessEvaluation {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const status = (contract.status || 'draft') as AppointmentContractStatus;

  if (!cleanStringArray(contract.scope).length) blockers.push('Contract scope is not recorded.');
  if (!cleanStringArray(contract.deliverables).length) blockers.push('Deliverables are not recorded.');
  if (!contract.milestones?.length) blockers.push('Milestones and release conditions are not recorded.');
  if (contract.milestones?.some(milestone => !milestone.name || !positiveFinite(milestone.amount) || !cleanStringArray(milestone.releaseConditions).length)) {
    blockers.push('Every milestone needs a name, positive amount, and release conditions.');
  }
  if (!positiveFinite(contract.professionalFee)) blockers.push('Professional fee is not recorded.');
  if (!positiveFinite(contract.totalEscrowAmount)) blockers.push('Escrow total is not recorded on the contract.');
  if (!contract.verificationId) warnings.push('Verification reference is not linked to the contract.');
  if (!escrow) warnings.push('No live escrow record is visible for this contract.');
  if (escrow && escrow.status === 'pending') warnings.push('Escrow exists but is still pending funding.');
  if (status === 'cancelled') blockers.push('Cancelled contracts cannot be signed.');

  const missingSignatures: ContractPartyRole[] = [];
  if (!contract.signatures?.client) missingSignatures.push('client');
  if (!contract.signatures?.professional) missingSignatures.push('professional');

  const readyForSignatureRequest = blockers.length === 0 && status !== 'signed';
  const readyForExecution = blockers.length === 0 && missingSignatures.length === 0 && Boolean(contract.signatureRequestId || status === 'signed');
  const nextStatus: AppointmentContractStatus = readyForExecution
    ? 'signed'
    : missingSignatures.length === 1
      ? 'partially_signed'
      : readyForSignatureRequest && (contract.signatureRequestId || status === 'signature_requested')
        ? 'signature_requested'
        : status;

  return {
    blockers,
    warnings,
    readyForHumanReview: blockers.length === 0,
    readyForSignatureRequest,
    readyForExecution,
    missingSignatures,
    nextStatus,
  };
}

export function buildSignatureRequest(input: SignatureRequestInput): SignatureRequestRecord {
  const contractId = requireString(input.contract.id, 'contractId');
  if (![input.contract.clientId, input.contract.bepId].includes(input.requestedBy) && input.requesterRole !== 'admin') {
    throw Object.assign(new Error('Only a contract party or admin can request signatures'), { status: 403 });
  }
  const readiness = evaluateContractSignatureReadiness(input.contract, input.escrow);
  if (!readiness.readyForSignatureRequest) {
    throw Object.assign(new Error(`Contract is not ready for signature request: ${readiness.blockers.join(' ')}`), { status: 400, blockers: readiness.blockers });
  }
  const now = new Date().toISOString();
  return {
    contractId,
    projectId: requireString(input.contract.projectId, 'projectId'),
    requestedBy: requireString(input.requestedBy, 'requestedBy'),
    requesterRole: input.requesterRole,
    provider: input.provider?.trim() || 'manual_human_signature_workflow',
    status: 'pending_human_signatures',
    humanSignatureRequired: true,
    autoExecutionProhibited: true,
    blockersAtRequest: [...readiness.blockers],
    warningsAtRequest: [...readiness.warnings],
    createdAt: now,
    updatedAt: now,
  };
}

export function buildSignatureAuditInput(input: { contract: AppointmentContractLike; actorId: string; action: string; readiness?: SignatureReadinessEvaluation }) {
  return {
    actorId: requireString(input.actorId, 'actorId'),
    action: requireString(input.action, 'action'),
    resourceType: 'appointment_contract',
    resourceId: requireString(input.contract.id, 'contractId'),
    projectId: requireString(input.contract.projectId, 'projectId'),
    metadata: {
      clientId: input.contract.clientId,
      professionalId: input.contract.bepId,
      status: input.contract.status || 'draft',
      missingSignatures: input.readiness?.missingSignatures,
      blockers: input.readiness?.blockers,
      warnings: input.readiness?.warnings,
      autoExecutionProhibited: true,
    },
  };
}
