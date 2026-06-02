import type { UserRole } from '@/types';
import { buildAuditEvent, type AuditEventInput } from './auditService';

export type ApprovalGateDomain =
  | 'ai_output'
  | 'compliance_signoff'
  | 'payment_release'
  | 'contract_execution'
  | 'procurement_issue'
  | 'programme_change'
  | 'municipal_submission'
  | 'closeout_acceptance';

export type ApprovalGateDecision = 'pending' | 'approved' | 'rejected' | 'changes_requested' | 'cancelled';

export type ApprovalGateRisk = 'low' | 'medium' | 'high' | 'critical';

export interface ApprovalGateActor {
  uid: string;
  role: UserRole | string;
  displayName?: string;
  email?: string;
  verificationStatus?: string;
}

export interface ApprovalGateEvidence {
  id: string;
  type: 'document' | 'drawing' | 'form' | 'quote' | 'delivery_note' | 'audit_log' | 'ai_output' | 'other';
  label: string;
  uri?: string;
  hash?: string;
}

export interface ApprovalGateInput {
  id: string;
  domain: ApprovalGateDomain;
  projectId: string;
  target: {
    type: string;
    id: string;
  };
  requestedBy: ApprovalGateActor;
  requiredApproverRoles: Array<UserRole | string>;
  risk?: ApprovalGateRisk;
  reason: string;
  evidence: ApprovalGateEvidence[];
  aiGenerated?: boolean;
  statutoryImpact?: boolean;
  financialImpactCents?: number;
  dueAt?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ApprovalGateRecord extends ApprovalGateInput {
  decision: ApprovalGateDecision;
  createdAt: string;
  requiresHumanApproval: true;
  aiMayNotApprove: true;
  immutableRequest: true;
}

export interface ApprovalGateResolutionInput {
  gate: ApprovalGateRecord;
  actor: ApprovalGateActor;
  decision: Exclude<ApprovalGateDecision, 'pending'>;
  rationale: string;
  evidence?: ApprovalGateEvidence[];
  decidedAt?: string;
}

export interface ApprovalGateResolutionRecord extends ApprovalGateResolutionInput {
  decidedAt: string;
  humanConfirmed: true;
  aiMayNotApprove: true;
  immutableDecision: true;
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

const PROFESSIONAL_APPROVER_ROLES = new Set(['bep', 'architect']);
const PAYMENT_APPROVER_ROLES = new Set(['client', 'admin']);
const ADMIN_ESCALATION_RISKS = new Set<ApprovalGateRisk>(['critical']);

function assertNonEmpty(value: string | undefined, field: string): asserts value is string {
  if (!value?.trim()) throw new Error(`${field} is required`);
}

function normalizeRole(role: UserRole | string): string {
  return String(role).trim().toLowerCase();
}

function normalizeUniqueRoles(roles: Array<UserRole | string>): Array<UserRole | string> {
  return Array.from(new Set(roles.map(role => String(role).trim()).filter(Boolean)));
}

function deriveRisk(input: ApprovalGateInput): ApprovalGateRisk {
  if (input.risk) return input.risk;
  if (input.statutoryImpact) return 'high';
  if (input.financialImpactCents && input.financialImpactCents > 250_000_00) return 'high';
  if (input.aiGenerated) return 'medium';
  return 'low';
}

export function buildApprovalGateRecord(input: ApprovalGateInput): ApprovalGateRecord {
  assertNonEmpty(input.id, 'id');
  assertNonEmpty(input.projectId, 'projectId');
  assertNonEmpty(input.target?.type, 'target.type');
  assertNonEmpty(input.target?.id, 'target.id');
  assertNonEmpty(input.requestedBy?.uid, 'requestedBy.uid');
  assertNonEmpty(String(input.requestedBy?.role || ''), 'requestedBy.role');
  assertNonEmpty(input.reason, 'reason');

  const requiredApproverRoles = normalizeUniqueRoles(input.requiredApproverRoles);
  if (!requiredApproverRoles.length) throw new Error('at least one required approver role is required');
  if (!input.evidence.length) throw new Error('approval gate requires at least one evidence item');

  return {
    ...input,
    requiredApproverRoles,
    risk: deriveRisk(input),
    decision: 'pending',
    createdAt: input.createdAt || new Date().toISOString(),
    metadata: input.metadata || {},
    requiresHumanApproval: true,
    aiMayNotApprove: true,
    immutableRequest: true,
  };
}

export function evaluateApprovalGateReadiness(gate: ApprovalGateRecord): ApprovalGateReadiness {
  const blockers: string[] = [];
  const requiredRoles = gate.requiredApproverRoles.map(normalizeRole);
  const risk = gate.risk || 'low';

  if (gate.decision !== 'pending') blockers.push(`gate is already ${gate.decision}`);
  if (!gate.evidence.length) blockers.push('missing evidence pack');
  if (gate.aiGenerated) blockers.push('AI-generated output requires named human review before action');
  if (gate.statutoryImpact && !requiredRoles.some(role => PROFESSIONAL_APPROVER_ROLES.has(role) || role === 'admin')) {
    blockers.push('statutory/compliance action requires verified BEP, architect, or admin approver');
  }
  if (gate.financialImpactCents && !requiredRoles.some(role => PAYMENT_APPROVER_ROLES.has(role))) {
    blockers.push('financial action requires client or admin approver');
  }

  const requiresVerifiedProfessional = gate.statutoryImpact === true;
  const requiresAdminEscalation = ADMIN_ESCALATION_RISKS.has(risk) || requiredRoles.includes('admin');

  return {
    ready: blockers.length === 0,
    blockers,
    requiredApproverRoles: gate.requiredApproverRoles,
    risk,
    requiresVerifiedProfessional,
    requiresAdminEscalation,
    aiMayNotApprove: true,
  };
}

export function assertApprovalGateResolutionAllowed(input: ApprovalGateResolutionInput): void {
  const { gate, actor, decision, rationale } = input;
  assertNonEmpty(actor?.uid, 'actor.uid');
  assertNonEmpty(String(actor?.role || ''), 'actor.role');
  assertNonEmpty(rationale, 'rationale');

  if (gate.decision !== 'pending') throw new Error(`approval gate is already ${gate.decision}`);
  if (decision === 'cancelled' && actor.uid !== gate.requestedBy.uid && normalizeRole(actor.role) !== 'admin') {
    throw new Error('only the requester or admin can cancel an approval gate');
  }
  if (actor.uid === 'ai' || normalizeRole(actor.role) === 'ai' || normalizeRole(actor.role) === 'system') {
    throw new Error('AI/system actors cannot resolve approval gates');
  }

  const actorRole = normalizeRole(actor.role);

  if (gate.financialImpactCents && !PAYMENT_APPROVER_ROLES.has(actorRole)) {
    throw new Error('financial gate requires a client or admin approver');
  }

  const allowedRoles = gate.requiredApproverRoles.map(normalizeRole);
  if (!allowedRoles.includes(actorRole) && actorRole !== 'admin') {
    throw new Error(`approval gate requires one of: ${gate.requiredApproverRoles.join(', ')}`);
  }

  if (gate.statutoryImpact && actorRole !== 'admin') {
    if (!PROFESSIONAL_APPROVER_ROLES.has(actorRole)) {
      throw new Error('statutory/compliance gate requires a BEP, architect, or admin approver');
    }
    if (actor.verificationStatus !== 'verified') {
      throw new Error('statutory/compliance gate requires verified professional status');
    }
  }

  if (gate.financialImpactCents && !PAYMENT_APPROVER_ROLES.has(actorRole)) {
    throw new Error('financial gate requires a client or admin approver');
  }
}

export function buildApprovalGateResolution(input: ApprovalGateResolutionInput): ApprovalGateResolutionRecord {
  assertApprovalGateResolutionAllowed(input);

  return {
    ...input,
    evidence: input.evidence || [],
    decidedAt: input.decidedAt || new Date().toISOString(),
    humanConfirmed: true,
    aiMayNotApprove: true,
    immutableDecision: true,
  };
}

export function buildApprovalGateAuditInput(
  gate: ApprovalGateRecord,
  resolution?: ApprovalGateResolutionRecord,
): AuditEventInput {
  const action = resolution
    ? `approval_gate.${gate.domain}.${resolution.decision}`
    : `approval_gate.${gate.domain}.requested`;

  return buildAuditEvent({
    category: 'approval',
    action,
    actor: resolution?.actor || gate.requestedBy,
    target: {
      type: gate.target.type,
      id: gate.target.id,
      projectId: gate.projectId,
    },
    reason: resolution?.rationale || gate.reason,
    metadata: {
      gateId: gate.id,
      domain: gate.domain,
      risk: gate.risk,
      requiredApproverRoles: gate.requiredApproverRoles,
      decision: resolution?.decision || gate.decision,
      aiMayNotApprove: true,
      evidenceIds: gate.evidence.map(item => item.id),
      resolutionEvidenceIds: resolution?.evidence?.map(item => item.id) || [],
      ...gate.metadata,
    },
    createdAt: resolution?.decidedAt || gate.createdAt,
  });
}
