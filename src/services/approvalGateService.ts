import type { WorkflowRecord, Severity } from '../types/agentOrchestration';
import type { ArchitexRole } from '../types/architexMasterTypes';
import type { UserRole } from '../types';

export type ApprovalGateDomain =
  | 'contract_execution'
  | 'payment_release'
  | 'ai_output'
  | 'compliance_signoff'
  | 'municipal_submission'
  | 'procurement_issue'
  | 'programme_change'
  | 'closeout_acceptance';

export type ApprovalGateRisk = 'low' | 'medium' | 'high' | 'critical';

export interface ApprovalGateActor {
  uid: string;
  role: string;
  displayName?: string;
  verificationStatus?: string;
}

export interface ApprovalGateReadiness {
  ready: boolean;
  blockers: string[];
  requiredApproverRoles: Array<UserRole | string>;
  risk: ApprovalGateRisk;
  requiresVerifiedProfessional: boolean;
  requiresAdminEscalation: boolean;
  aiMayNotApprove: true;
}

export interface ApprovalGateEvidence {
  id: string;
  type: 'drawing' | 'form' | 'document' | 'audit_log';
  label: string;
  uri?: string;
  hash?: string;
}

export interface ApprovalGateRecord {
  id: string;
  domain: ApprovalGateDomain;
  projectId: string;
  target: { type: string; id: string };
  requestedBy: ApprovalGateActor;
  requiredApproverRoles: Array<UserRole | string>;
  risk: ApprovalGateRisk;
  reason: string;
  evidence: ApprovalGateEvidence[];
  status?: 'pending' | 'approved' | 'rejected' | 'escalated';
  decision?: string;
  financialImpactCents?: number;
  statutoryImpact?: boolean;
  dueAt?: string;
  createdAt: string;
  resolvedAt?: string;
  metadata?: Record<string, unknown>;
  // Derived fields
  requiresHumanApproval?: boolean;
  aiMayNotApprove?: boolean;
  immutableRequest?: boolean;
  aiGenerated?: boolean;
}

export interface ApprovalGateInput {
  id?: string;
  domain: ApprovalGateDomain;
  projectId: string;
  target: { type: string; id: string };
  requestedBy: ApprovalGateActor;
  requiredApproverRoles: Array<UserRole | string>;
  risk: ApprovalGateRisk;
  reason: string;
  evidence: ApprovalGateEvidence[];
  financialImpactCents?: number;
  statutoryImpact?: boolean;
  dueAt?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export function buildApprovalGateRecord(input: ApprovalGateInput): ApprovalGateRecord {
  const isAiGenerated = !!(input as any).aiGenerated;
  const isStatutory = input.statutoryImpact === true;
  const hasFinancialImpact = (input.financialImpactCents ?? 0) > 0;
  return {
    id: input.id ?? `gate-${Date.now()}`,
    domain: input.domain,
    projectId: input.projectId,
    target: input.target,
    requestedBy: input.requestedBy,
    requiredApproverRoles: input.requiredApproverRoles,
    risk: input.risk ?? (isStatutory || hasFinancialImpact ? 'high' : 'medium'),
    reason: input.reason,
    evidence: input.evidence,
    status: 'pending',
    decision: 'pending',
    financialImpactCents: input.financialImpactCents,
    statutoryImpact: input.statutoryImpact,
    dueAt: input.dueAt,
    createdAt: input.createdAt ?? new Date().toISOString(),
    metadata: input.metadata,
    // Derived fields
    requiresHumanApproval: true,
    aiMayNotApprove: true,
    immutableRequest: true,
    aiGenerated: isAiGenerated,
  };
}

export function evaluateApprovalGateReadiness(gate: ApprovalGateRecord): ApprovalGateReadiness {
  const blockers: string[] = [];

  if (gate.status === 'rejected') {
    blockers.push(`Approval gate ${gate.id} was rejected: ${gate.reason}`);
  }

  const isAiGenerated = gate.aiGenerated === true;
  const isStatutory = gate.statutoryImpact === true || gate.domain === 'compliance_signoff' || gate.domain === 'municipal_submission';

  if (isAiGenerated) {
    blockers.push('AI-generated output requires named human review before action');
  }

  if (isStatutory) {
    const hasValidApprover = gate.requiredApproverRoles.some((role) =>
      ['bep', 'architect', 'admin'].includes(role as string),
    );
    if (!hasValidApprover) {
      blockers.push('statutory/compliance action requires verified BEP, architect, or admin approver');
    }
  }

  if (gate.domain === 'payment_release' || (gate.financialImpactCents ?? 0) > 0) {
    const hasFinancialApprover = gate.requiredApproverRoles.some((role) =>
      ['client', 'admin'].includes(role as string),
    );
    if (!hasFinancialApprover) {
      blockers.push('financial gate requires a client or admin approver');
    }
  }

  return {
    ready: blockers.length === 0,
    blockers,
    requiredApproverRoles: gate.requiredApproverRoles,
    risk: gate.risk,
    requiresVerifiedProfessional: isStatutory,
    requiresAdminEscalation: gate.risk === 'critical' || gate.domain === 'payment_release',
    aiMayNotApprove: true,
  };
}

export function buildApprovalGateResolution(params: {
  gate: ApprovalGateRecord;
  actor: ApprovalGateActor;
  decision: string;
  rationale: string;
  evidence?: Array<{ id: string; type: string; label: string }>;
  decidedAt?: string;
}): {
  gateId: string;
  decision: string;
  humanConfirmed: boolean;
  aiMayNotApprove: boolean;
  immutableDecision: boolean;
  decidedAt: string;
  reason: string;
  resolvedBy: ApprovalGateActor;
} {
  return {
    gateId: params.gate.id,
    decision: params.decision,
    humanConfirmed: true,
    aiMayNotApprove: true,
    immutableDecision: true,
    decidedAt: params.decidedAt ?? new Date().toISOString(),
    reason: params.rationale,
    resolvedBy: params.actor,
  };
}

export function assertApprovalGateResolutionAllowed(params: {
  gate: ApprovalGateRecord;
  actor: ApprovalGateActor;
  decision: string;
  rationale: string;
}): void {
  const { gate, actor } = params;

  if (actor.role === 'ai' || actor.role === 'system') {
    throw new Error('AI/system actors cannot resolve approval gates');
  }

  if (actor.verificationStatus && actor.verificationStatus !== 'verified') {
    throw new Error('Actor requires verified professional status to resolve approval gates');
  }

  if (gate.status === 'approved' || gate.status === 'rejected') {
    throw new Error(`Gate ${gate.id} is already ${gate.status}`);
  }

  const gateRoles = gate.requiredApproverRoles.map((r) => r as string);

  // Financial gate check
  const isFinancial = gate.domain === 'payment_release' || (gate.financialImpactCents ?? 0) > 0;
  if (isFinancial) {
    if (!['client', 'admin'].includes(actor.role)) {
      throw new Error('financial gate requires a client or admin approver');
    }
    return;
  }

  // Statutory gate check
  const isStatutory = gate.statutoryImpact === true || gate.domain === 'compliance_signoff' || gate.domain === 'municipal_submission';
  if (isStatutory) {
    if (!['bep', 'architect', 'admin'].includes(actor.role)) {
      throw new Error(`statutory/compliance gate requires one of ${gateRoles.join(', ')}`);
    }
    return;
  }

  // Generic role check
  if (!gateRoles.includes(actor.role)) {
    throw new Error(`Actor ${actor.uid} with role ${actor.role} is not an authorized approver for gate ${gate.id}. Requires one of ${gateRoles.join(', ')}`);
  }
}

export interface ApprovalGateAuditEvent {
  action: string;
  sourceObjectId: string;
  actorId: string;
  category: string;
  target: { type: string; id: string; projectId: string };
  immutable: boolean;
  metadata: Record<string, unknown>;
  actor?: ApprovalGateActor;
  reason?: string;
  createdAt?: string;
}

export function buildApprovalGateAuditInput(
  gate: ApprovalGateRecord,
  resolution?: {
    decision?: string;
    resolvedBy?: ApprovalGateActor;
    reason?: string;
    decidedAt?: string;
  },
): ApprovalGateAuditEvent {
  return {
    action: resolution ? `approval_gate.${gate.domain}.${resolution.decision ?? 'resolved'}` : `approval_gate.${gate.domain}.requested`,
    sourceObjectId: gate.id,
    actorId: resolution?.resolvedBy?.uid ?? gate.requestedBy.uid,
    category: 'approval',
    target: { type: gate.target.type, id: gate.target.id, projectId: gate.projectId },
    immutable: true,
    metadata: {
      domain: gate.domain,
      risk: gate.risk,
      reason: gate.reason,
      gateId: gate.id,
      aiMayNotApprove: gate.aiMayNotApprove,
      ...(gate.metadata ?? {}),
      ...(resolution ? { resolvedAt: resolution.decidedAt ?? new Date().toISOString() } : {}),
    },
    ...(resolution ? {
      actor: resolution.resolvedBy,
      reason: resolution.reason,
      createdAt: resolution.decidedAt,
    } : {}),
  };
}

// ─── Existing Pack 14 service implementation below ───

interface ApprovalGate {
  gateId: string;
  title: string;
  sourceObjectId: string;
  requiredApprovers: ArchitexRole[];
  status: 'pending' | 'approved' | 'rejected' | 'escalated';
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  severity: Severity;
  createdAt: string;
  updatedAt?: string;
}

let seq = 1;
const gates = new Map<string, ApprovalGate>();

export function createApprovalGate(params: {
  title: string;
  status: string;
  payload?: Record<string, unknown>;
  blockers?: string[];
  approvalsRequired?: string[];
}): WorkflowRecord {
  return {
    id: `approvalGate-${seq++}`,
    type: 'approvalGate',
    title: params.title,
    status: params.status,
    payload: params.payload ?? {},
    blockers: params.blockers ?? [],
    approvalsRequired: params.approvalsRequired ?? [],
  };
}

export function openGate(params: {
  title: string;
  sourceObjectId: string;
  requiredApprovers: ArchitexRole[];
  severity: Severity;
}): ApprovalGate {
  const gate: ApprovalGate = {
    gateId: `gate-${seq++}`,
    title: params.title,
    sourceObjectId: params.sourceObjectId,
    requiredApprovers: params.requiredApprovers,
    status: 'pending',
    severity: params.severity,
    createdAt: new Date().toISOString(),
  };
  gates.set(gate.gateId, gate);
  return gate;
}

export function approveGate(gateId: string, approvedBy: string): ApprovalGate | undefined {
  const gate = gates.get(gateId);
  if (!gate || gate.status !== 'pending') return undefined;
  gate.status = 'approved';
  gate.approvedBy = approvedBy;
  gate.approvedAt = new Date().toISOString();
  gate.updatedAt = new Date().toISOString();
  return gate;
}

export function rejectGate(gateId: string, rejectedBy: string, reason: string): ApprovalGate | undefined {
  const gate = gates.get(gateId);
  if (!gate || gate.status !== 'pending') return undefined;
  gate.status = 'rejected';
  gate.approvedBy = rejectedBy;
  gate.rejectionReason = reason;
  gate.updatedAt = new Date().toISOString();
  return gate;
}

export function escalateGate(gateId: string): ApprovalGate | undefined {
  const gate = gates.get(gateId);
  if (!gate || gate.status !== 'pending') return undefined;
  gate.status = 'escalated';
  gate.updatedAt = new Date().toISOString();
  return gate;
}

export function getPendingGates(): ApprovalGate[] {
  return Array.from(gates.values()).filter((g) => g.status === 'pending');
}

export function canApprove(gate: ApprovalGate, role: ArchitexRole): boolean {
  return gate.requiredApprovers.includes(role);
}
