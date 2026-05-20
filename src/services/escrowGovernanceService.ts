import type { ProjectStage } from '../types';

export type EscrowReleaseDecision = 'approved' | 'rejected' | 'hold';

export interface EscrowMilestoneGateInput {
  projectId: string;
  jobId: string;
  stage: ProjectStage;
  milestoneId: string;
  amount: number;
  status: string;
  requestedBy: string;
  evidenceIds?: string[];
  certifiedBy?: string;
  releaseConditions?: string[];
}

export interface EscrowAdminReviewInput {
  milestone: EscrowMilestoneGateInput;
  adminId: string;
  decision: EscrowReleaseDecision;
  reason?: string;
}

export interface EscrowReleaseGateEvaluation {
  readyForAdminReview: boolean;
  blockers: string[];
  warnings: string[];
  humanApprovalRequired: true;
  autoReleaseProhibited: true;
}

export interface EscrowAdminReviewRecord extends EscrowAdminReviewInput {
  statusAfterDecision: 'release_approved' | 'release_rejected' | 'release_hold';
  createdAt: string;
  updatedAt: string;
  humanApprovalRequired: true;
  autoReleaseProhibited: true;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw Object.assign(new Error(`${field} is required`), { status: 400 });
  return value.trim();
}

function cleanStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim()) : [];
}

export function evaluateEscrowReleaseGate(input: EscrowMilestoneGateInput): EscrowReleaseGateEvaluation {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!Number.isFinite(input.amount) || input.amount <= 0) blockers.push('Release amount must be positive.');
  if (input.status !== 'release_requested') blockers.push('Milestone must be in release_requested status.');
  if (cleanStringArray(input.evidenceIds).length === 0) blockers.push('Release evidence is required.');
  if (!input.certifiedBy) blockers.push('Certifier approval is required before admin release review.');
  if (cleanStringArray(input.releaseConditions).length === 0) warnings.push('No release conditions are recorded for this milestone.');
  return {
    readyForAdminReview: blockers.length === 0,
    blockers,
    warnings,
    humanApprovalRequired: true,
    autoReleaseProhibited: true,
  };
}

export function buildEscrowAdminReviewRecord(input: EscrowAdminReviewInput): EscrowAdminReviewRecord {
  const evaluation = evaluateEscrowReleaseGate(input.milestone);
  if (input.decision === 'approved' && !evaluation.readyForAdminReview) {
    throw Object.assign(new Error(`Escrow release cannot be approved: ${evaluation.blockers.join(' ')}`), { status: 400, blockers: evaluation.blockers });
  }
  if (input.decision !== 'approved' && !input.reason?.trim()) {
    throw Object.assign(new Error('reason is required for rejected or held escrow release decisions'), { status: 400 });
  }
  const now = new Date().toISOString();
  return {
    ...input,
    adminId: requireString(input.adminId, 'adminId'),
    reason: input.reason?.trim(),
    statusAfterDecision: input.decision === 'approved' ? 'release_approved' : input.decision === 'rejected' ? 'release_rejected' : 'release_hold',
    createdAt: now,
    updatedAt: now,
    humanApprovalRequired: true,
    autoReleaseProhibited: true,
  };
}

export function buildEscrowLedgerEntry(input: { projectId: string; jobId: string; milestoneId: string; amount: number; payerId: string; payeeId: string; adminId: string }) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw Object.assign(new Error('amount must be positive'), { status: 400 });
  return {
    projectId: requireString(input.projectId, 'projectId'),
    jobId: requireString(input.jobId, 'jobId'),
    type: 'milestone_release',
    amount: input.amount,
    direction: 'debit',
    description: `Admin-approved escrow release for milestone ${requireString(input.milestoneId, 'milestoneId')}`,
    payerId: requireString(input.payerId, 'payerId'),
    payeeId: requireString(input.payeeId, 'payeeId'),
    escrowMilestoneId: input.milestoneId,
    approvedBy: requireString(input.adminId, 'adminId'),
    createdAt: new Date().toISOString(),
  };
}

export function buildEscrowAuditInput(input: { actorId: string; action: string; projectId: string; jobId: string; milestoneId: string; decision?: EscrowReleaseDecision; blockers?: string[] }) {
  return {
    actorId: requireString(input.actorId, 'actorId'),
    action: requireString(input.action, 'action'),
    resourceType: 'escrow_milestone',
    resourceId: requireString(input.milestoneId, 'milestoneId'),
    projectId: requireString(input.projectId, 'projectId'),
    jobId: requireString(input.jobId, 'jobId'),
    metadata: {
      decision: input.decision,
      blockers: input.blockers || [],
      humanApprovalRequired: true,
      autoReleaseProhibited: true,
    },
  };
}
