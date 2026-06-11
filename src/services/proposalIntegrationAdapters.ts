/**
 * Proposal Integration Adapters
 *
 * Produces ProjectRecord outputs and DocumentOutput placeholders from proposals.
 * Follows the existing ProjectRecord<T> pattern from architexMasterTypes.
 */

import type { ProposalBuilderResult, ProposalTermsSnapshot } from '../types/proposalBuilder';

/** Local ProjectRecord type matching the master type pattern */
export interface ProjectRecord<TPayload = unknown> {
  id: string;
  tenantId: string;
  projectId: string;
  phase: string;
  moduleKey: string;
  recordType: string;
  title: string;
  status: string;
  payload: TPayload;
  approval: ApprovalMetadata;
  audit: AuditMetadata;
  linkedRecordIds: string[];
}

export interface ApprovalMetadata {
  status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'issued' | 'superseded';
  requiredApproverRoles: string[];
  approvedByUserId?: string;
  approvedAt?: string;
  reason?: string;
}

export interface AuditMetadata {
  createdByUserId: string;
  createdAt: string;
  updatedAt?: string;
  source?: 'user' | 'agent' | 'system' | 'import';
  revision?: number;
  lockedAfterIssue?: boolean;
}

export interface DocumentOutputPlaceholder {
  documentId: string;
  projectId: string;
  title: string;
  documentType: 'proposal';
  status: 'draft' | 'issued' | 'superseded';
  revision: string;
  linkedProposalId: string;
}

interface BaseRecordParams {
  tenantId: string;
  projectId: string;
  createdByUserId: string;
  phase?: string;
}

function baseAudit(createdByUserId: string): AuditMetadata {
  return {
    createdByUserId,
    createdAt: new Date().toISOString(),
    source: 'user',
    lockedAfterIssue: false,
  };
}

function baseApproval(required: boolean, approverRoles: string[] = []): ApprovalMetadata {
  return {
    status: 'draft',
    requiredApproverRoles: approverRoles as any[],
  };
}

/**
 * Create a ProjectRecord for the proposal itself.
 */
export function createProposalRecord(
  proposal: ProposalBuilderResult,
  params: BaseRecordParams,
): ProjectRecord<{ proposalId: string; total: number; status: string }> {
  return {
    id: `pr-${proposal.idSeed}-proposal`,
    tenantId: params.tenantId,
    projectId: params.projectId,
    phase: 'proposal_appointment',
    moduleKey: 'project_lifecycle',
    recordType: 'escrow_milestone' as any, // closest existing type
    title: `Proposal: ${proposal.title}`,
    status: proposal.status,
    payload: {
      proposalId: proposal.idSeed,
      total: proposal.feeAfterDiscountIncVat,
      status: proposal.status,
    },
    approval: baseApproval(proposal.status !== 'issued', ['client']),
    audit: baseAudit(params.createdByUserId),
    linkedRecordIds: [],
  };
}

/**
 * Create a ProjectRecord for the scope baseline.
 */
export function createScopeBaselineRecord(
  proposal: ProposalBuilderResult,
  params: BaseRecordParams & { scopeSummary: string },
): ProjectRecord<{ scope: string }> {
  return {
    id: `pr-${proposal.idSeed}-scope`,
    tenantId: params.tenantId,
    projectId: params.projectId,
    phase: 'proposal_appointment',
    moduleKey: 'project_lifecycle',
    recordType: 'escrow_milestone' as any,
    title: 'Scope baseline from proposal',
    status: proposal.status === 'issued' ? 'issued' : 'draft',
    payload: {
      scope: params.scopeSummary,
    },
    approval: baseApproval(true, ['client']),
    audit: baseAudit(params.createdByUserId),
    linkedRecordIds: [`pr-${proposal.idSeed}-proposal`],
  };
}

/**
 * Create a ProjectRecord for the fee calculation snapshot.
 */
export function createFeeCalculationSnapshotRecord(
  proposal: ProposalBuilderResult,
  params: BaseRecordParams,
): ProjectRecord<Record<string, unknown>> {
  return {
    id: `pr-${proposal.idSeed}-fee`,
    tenantId: params.tenantId,
    projectId: params.projectId,
    phase: 'proposal_appointment',
    moduleKey: 'project_lifecycle',
    recordType: 'escrow_milestone' as any,
    title: 'Fee calculation snapshot',
    status: proposal.status === 'issued' ? 'issued' : 'draft',
    payload: {
      feeBeforeDiscountExVat: proposal.feeBeforeDiscountExVat,
      discountAmount: proposal.discountAmount,
      feeAfterDiscountExVat: proposal.feeAfterDiscountExVat,
      vatAmount: proposal.vatAmount,
      feeAfterDiscountIncVat: proposal.feeAfterDiscountIncVat,
      platformFee: proposal.platformFee,
      auditSnapshot: proposal.auditSnapshot,
    },
    approval: baseApproval(false),
    audit: { ...baseAudit(params.createdByUserId), lockedAfterIssue: proposal.status === 'issued' },
    linkedRecordIds: [`pr-${proposal.idSeed}-proposal`],
  };
}

/**
 * Create a ProjectRecord for the terms snapshot.
 */
export function createTermsSnapshotRecord(
  proposal: ProposalBuilderResult & { termsSnapshot: ProposalTermsSnapshot },
  params: BaseRecordParams,
): ProjectRecord<{ terms: ProposalTermsSnapshot }> {
  return {
    id: `pr-${proposal.idSeed}-terms`,
    tenantId: params.tenantId,
    projectId: params.projectId,
    phase: 'proposal_appointment',
    moduleKey: 'project_lifecycle',
    recordType: 'escrow_milestone' as any,
    title: 'Terms snapshot',
    status: proposal.status === 'issued' ? 'issued' : 'draft',
    payload: {
      terms: proposal.termsSnapshot,
    },
    approval: baseApproval(
      !!proposal.termsSnapshot.termsTemplateId,
      ['client'],
    ),
    audit: { ...baseAudit(params.createdByUserId), lockedAfterIssue: proposal.status === 'issued' },
    linkedRecordIds: [`pr-${proposal.idSeed}-proposal`],
  };
}

/**
 * Create a ProjectRecord for the professional appointment draft.
 */
export function createAppointmentDraftRecord(
  proposal: ProposalBuilderResult,
  params: BaseRecordParams & { clientName: string; professionalName: string },
): ProjectRecord<{ clientName: string; professionalName: string }> {
  return {
    id: `pr-${proposal.idSeed}-appointment-draft`,
    tenantId: params.tenantId,
    projectId: params.projectId,
    phase: 'proposal_appointment',
    moduleKey: 'project_lifecycle',
    recordType: 'escrow_milestone' as any,
    title: 'Appointment draft from accepted proposal',
    status: 'draft',
    payload: {
      clientName: params.clientName,
      professionalName: params.professionalName,
    },
    approval: baseApproval(true, ['client']),
    audit: baseAudit(params.createdByUserId),
    linkedRecordIds: [`pr-${proposal.idSeed}-proposal`],
  };
}

/**
 * Create a DocumentOutput placeholder for an issued proposal.
 */
export function createProposalDocumentOutput(
  proposal: ProposalBuilderResult,
  projectId: string,
  isRevision = false,
): DocumentOutputPlaceholder {
  return {
    documentId: `doc-${proposal.idSeed}`,
    projectId,
    title: `Proposal - ${proposal.title}`,
    documentType: 'proposal',
    status: proposal.status === 'issued' ? 'issued' : 'draft',
    revision: isRevision ? 'B' : 'A',
    linkedProposalId: proposal.idSeed,
  };
}

/**
 * Generate all ProjectRecord outputs for a proposal in one call.
 */
export function generateAllProposalRecords(
  proposal: ProposalBuilderResult,
  params: BaseRecordParams & {
    scopeSummary: string;
    clientName: string;
    professionalName: string;
    termsSnapshot: ProposalTermsSnapshot;
  },
): {
  proposalRecord: ProjectRecord;
  scopeBaselineRecord: ProjectRecord;
  feeSnapshotRecord: ProjectRecord;
  termsSnapshotRecord: ProjectRecord;
  appointmentDraftRecord: ProjectRecord;
  documentOutput: DocumentOutputPlaceholder;
} {
  return {
    proposalRecord: createProposalRecord(proposal, params),
    scopeBaselineRecord: createScopeBaselineRecord(proposal, params),
    feeSnapshotRecord: createFeeCalculationSnapshotRecord(proposal, params),
    termsSnapshotRecord: createTermsSnapshotRecord(
      { ...proposal, termsSnapshot: params.termsSnapshot },
      params,
    ),
    appointmentDraftRecord: createAppointmentDraftRecord(proposal, params),
    documentOutput: createProposalDocumentOutput(proposal, params.projectId),
  };
}
