import type { LedgerEntry, ProjectStage, UserRole } from '../types';
import { buildApprovalGateRecord, evaluateApprovalGateReadiness, type ApprovalGateActor, type ApprovalGateReadiness, type ApprovalGateRecord } from './approvalGateService';

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

export interface EscrowReleaseApprovalGateInput {
  milestone: EscrowMilestoneGateInput;
  requestedBy: ApprovalGateActor;
  requiredApproverRoles?: Array<UserRole | string>;
  gateId?: string;
  dueAt?: string;
  createdAt?: string;
}

export interface EscrowReleaseApprovalGateProjection {
  escrowEvaluation: EscrowReleaseGateEvaluation;
  approvalGate: ApprovalGateRecord;
  approvalReadiness: ApprovalGateReadiness;
}

export interface EscrowAdminReviewRecord extends EscrowAdminReviewInput {
  statusAfterDecision: 'release_approved' | 'release_rejected' | 'release_hold';
  createdAt: string;
  updatedAt: string;
  humanApprovalRequired: true;
  autoReleaseProhibited: true;
}

export interface FinalEscrowClosureInput {
  projectId: string;
  jobId: string;
  projectStage: ProjectStage | string;
  archived?: boolean;
  closeoutGateReady?: boolean;
  ledgerEntries?: Array<Pick<LedgerEntry, 'type' | 'amount'>>;
  unresolvedDisputes?: number;
  unresolvedApprovalGates?: number;
  adminId?: string;
  reviewedAt?: string;
}

export interface FinalEscrowClosureEvaluation {
  ready: boolean;
  escrowHeld: number;
  blockers: string[];
  warnings: string[];
  closureRecord?: {
    projectId: string;
    jobId: string;
    status: 'ready_for_wallet_closure';
    reviewedBy: string;
    reviewedAt: string;
    escrowHeld: number;
    humanApprovalRequired: true;
    autoClosureProhibited: true;
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw Object.assign(new Error(`${field} is required`), { status: 400 });
  return value.trim();
}

function cleanStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim()) : [];
}

function calculateHeldEscrow(entries: Array<Pick<LedgerEntry, 'type' | 'amount'>> = []): number {
  const held = entries.reduce((sum, entry) => {
    if (entry.type === 'escrow_deposit') return sum + entry.amount;
    if (entry.type === 'milestone_release' || entry.type === 'refund') return sum - entry.amount;
    return sum;
  }, 0);
  return Math.max(0, Math.round(held * 100) / 100);
}

function formatZarAmount(amount: number): string {
  return amount.toLocaleString('en-ZA').replace(/\u00a0/g, ' ');
}

export function evaluateFinalEscrowClosure(input: FinalEscrowClosureInput): FinalEscrowClosureEvaluation {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const escrowHeld = calculateHeldEscrow(input.ledgerEntries);

  if (!input.projectId?.trim()) blockers.push('Project ID is required for escrow wallet closure.');
  if (!input.jobId?.trim()) blockers.push('Job ID is required for escrow wallet closure.');
  if (input.projectStage !== 'closeout') blockers.push('Project must be in close-out stage before final escrow wallet closure.');
  if (!input.archived) blockers.push('Project file must be archived before final escrow wallet closure.');
  if (!input.closeoutGateReady) blockers.push('Close-out gate must be ready before final escrow wallet closure.');
  if (escrowHeld > 0) blockers.push(`Escrow wallet still holds ZAR ${formatZarAmount(escrowHeld)}; release or refund must be resolved first.`);
  if ((input.unresolvedDisputes ?? 0) > 0) blockers.push(`${input.unresolvedDisputes} unresolved dispute${input.unresolvedDisputes === 1 ? '' : 's'} must be closed before wallet closure.`);
  if ((input.unresolvedApprovalGates ?? 0) > 0) blockers.push(`${input.unresolvedApprovalGates} approval gate${input.unresolvedApprovalGates === 1 ? '' : 's'} remain open before wallet closure.`);
  if (!input.adminId?.trim()) blockers.push('Admin reviewer is required for final escrow wallet closure.');
  if (!input.reviewedAt?.trim()) warnings.push('No reviewedAt timestamp supplied; closure record will use the current time when built.');

  const ready = blockers.length === 0;
  return {
    ready,
    escrowHeld,
    blockers,
    warnings,
    closureRecord: ready ? {
      projectId: input.projectId.trim(),
      jobId: input.jobId.trim(),
      status: 'ready_for_wallet_closure',
      reviewedBy: input.adminId!.trim(),
      reviewedAt: input.reviewedAt?.trim() || new Date().toISOString(),
      escrowHeld,
      humanApprovalRequired: true,
      autoClosureProhibited: true,
    } : undefined,
  };
}

export function buildEscrowReleaseApprovalGate(input: EscrowReleaseApprovalGateInput): EscrowReleaseApprovalGateProjection {
  const milestone = input.milestone;
  const escrowEvaluation = evaluateEscrowReleaseGate(milestone);
  const evidenceIds = cleanStringArray(milestone.evidenceIds);
  const approvalGate = buildApprovalGateRecord({
    id: input.gateId ?? `escrow-release-${milestone.milestoneId}`,
    domain: 'payment_release',
    projectId: milestone.projectId,
    target: { type: 'escrow_milestone', id: milestone.milestoneId },
    requestedBy: input.requestedBy,
    requiredApproverRoles: input.requiredApproverRoles ?? ['client', 'admin'],
    risk: milestone.amount >= 250_000 ? 'high' : 'medium',
    reason: `Escrow release for milestone ${milestone.milestoneId} requires explicit client/admin human approval before ledger effects.`,
    evidence: evidenceIds.length > 0
      ? evidenceIds.map((id) => ({ id, type: 'document' as const, label: `Escrow release evidence ${id}` }))
      : [{ id: `${milestone.milestoneId}-missing-evidence`, type: 'audit_log' as const, label: 'Escrow release evidence missing' }],
    financialImpactCents: milestone.amount,
    dueAt: input.dueAt,
    createdAt: input.createdAt,
    metadata: {
      jobId: milestone.jobId,
      stage: milestone.stage,
      status: milestone.status,
      certifiedBy: milestone.certifiedBy,
      releaseConditions: cleanStringArray(milestone.releaseConditions),
      escrowBlockers: escrowEvaluation.blockers,
      escrowWarnings: escrowEvaluation.warnings,
      autoReleaseProhibited: true,
    },
  });

  return {
    escrowEvaluation,
    approvalGate,
    approvalReadiness: evaluateApprovalGateReadiness(approvalGate),
  };
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
