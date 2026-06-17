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
  financialImpactCents?: number;
  statutoryImpact?: boolean;
  dueAt?: string;
  createdAt: string;
  resolvedAt?: string;
  metadata?: Record<string, unknown>;
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

export function evaluateApprovalGateReadiness(gate: ApprovalGateRecord): ApprovalGateReadiness {
  const blockers: string[] = [];

  if (gate.status === 'rejected') {
    blockers.push(`Approval gate ${gate.id} was rejected: ${gate.reason}`);
  }

  if (gate.risk === 'high' || gate.risk === 'critical') {
    blockers.push(`High-risk approval (${gate.risk}) requires admin escalation`);
  }

  return {
    ready: blockers.length === 0,
    blockers,
    requiredApproverRoles: gate.requiredApproverRoles,
    risk: gate.risk,
    requiresVerifiedProfessional: gate.domain === 'compliance_signoff' || gate.domain === 'municipal_submission',
    requiresAdminEscalation: gate.risk === 'critical',
    aiMayNotApprove: true,
  };
}

export function buildApprovalGateRecord(input: ApprovalGateInput): ApprovalGateRecord {
  return {
    id: input.id ?? `gate-${Date.now()}`,
    domain: input.domain,
    projectId: input.projectId,
    target: input.target,
    requestedBy: input.requestedBy,
    requiredApproverRoles: input.requiredApproverRoles,
    risk: input.risk,
    reason: input.reason,
    evidence: input.evidence,
    status: 'pending',
    financialImpactCents: input.financialImpactCents,
    statutoryImpact: input.statutoryImpact,
    dueAt: input.dueAt,
    createdAt: input.createdAt ?? new Date().toISOString(),
    metadata: input.metadata,
  };
}

export function buildApprovalGateResolution(params: {
  gateId: string;
  approved: boolean;
  resolvedBy: ApprovalGateActor;
  reason?: string;
}): { gateId: string; approved: boolean; resolvedBy: ApprovalGateActor; reason: string; resolvedAt: string } {
  return {
    gateId: params.gateId,
    approved: params.approved,
    resolvedBy: params.resolvedBy,
    reason: params.reason ?? (params.approved ? 'Approved' : 'Rejected'),
    resolvedAt: new Date().toISOString(),
  };
}

export function assertApprovalGateResolutionAllowed(gate: ApprovalGateRecord, actor: ApprovalGateActor): void {
  const isRequiredApprover = gate.requiredApproverRoles.includes(actor.role as UserRole);
  if (!isRequiredApprover) {
    throw new Error(`Actor ${actor.uid} with role ${actor.role} is not an authorized approver for gate ${gate.id}`);
  }
  if (gate.status === 'approved' || gate.status === 'rejected') {
    throw new Error(`Gate ${gate.id} is already ${gate.status}`);
  }
}

export function buildApprovalGateAuditInput(
  gate: ApprovalGateRecord,
  resolution?: { approved: boolean; resolvedBy: ApprovalGateActor; reason?: string },
): { action: string; sourceObjectId: string; actorId: string; metadata: Record<string, unknown> } {
  return {
    action: resolution ? `approval_gate_${resolution.approved ? 'approved' : 'rejected'}` : 'approval_gate_created',
    sourceObjectId: gate.id,
    actorId: resolution?.resolvedBy.uid ?? gate.requestedBy.uid,
    metadata: { domain: gate.domain, risk: gate.risk, reason: gate.reason },
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
