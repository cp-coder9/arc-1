/**
 * Approval Gate Service — Pack 14: Agent Orchestration Core
 *
 * Enforces approval gates for agent-generated recommendations and actions.
 * Every agent recommendation that requires human approval must pass through
 * an approval gate before being applied.
 */
import type {
  ArchitexRole,
  Priority,
  AgentRecommendation,
} from '@/types/architexMasterTypes';

// ─── Types ─────────────────────────────────────────────────────────────────

export type ApprovalGateDecision =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'changes_requested'
  | 'auto_approved';

export interface ApprovalGate {
  id: string;
  recommendationId: string;
  tenantId: string;
  projectId?: string;
  title: string;
  rationale: string;
  priority: Priority;
  requiredApproverRoles: ArchitexRole[];
  approvers: ApprovalGateApprover[];
  decision: ApprovalGateDecision;
  decidedBy?: string;
  decidedAt?: string;
  decisionNotes?: string;
  autoApprovalReason?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalGateApprover {
  role: ArchitexRole;
  userId?: string;
  status: 'pending' | 'approved' | 'rejected' | 'abstained';
  respondedAt?: string;
  notes?: string;
}

export interface ApprovalGateConfig {
  tenantId: string;
  autoApproveLowRisk: boolean;
  autoApproveThreshold: Priority; // Priorities at or below this level can auto-approve
  requireMultipleApproversForPriority: Priority; // Critical/High can require 2+
  approvalTimeoutDays: number;
  escalationRole: ArchitexRole;
  enabled: boolean;
}

// ─── Default Config ────────────────────────────────────────────────────────

export function createDefaultApprovalConfig(
  tenantId: string,
): ApprovalGateConfig {
  return {
    tenantId,
    autoApproveLowRisk: true,
    autoApproveThreshold: 'low',
    requireMultipleApproversForPriority: 'critical',
    approvalTimeoutDays: 7,
    escalationRole: 'platform_admin',
    enabled: true,
  };
}

// ─── Gate Factory ──────────────────────────────────────────────────────────

let gateSeq = 1;

/**
 * Create an approval gate for an agent recommendation.
 */
export function createApprovalGate(params: {
  recommendationId: string;
  tenantId: string;
  projectId?: string;
  title: string;
  rationale: string;
  priority: Priority;
  requiredApproverRoles: ArchitexRole[];
  config: ApprovalGateConfig;
}): ApprovalGate {
  const now = new Date().toISOString();
  const config = params.config;

  // Auto-approve if enabled and priority is at or below threshold
  if (config.enabled && config.autoApproveLowRisk) {
    const priorityRank: Record<Priority, number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };
    if (
      priorityRank[params.priority] <= priorityRank[config.autoApproveThreshold]
    ) {
      return {
        id: `gate-agent-${gateSeq++}`,
        recommendationId: params.recommendationId,
        tenantId: params.tenantId,
        projectId: params.projectId,
        title: params.title,
        rationale: params.rationale,
        priority: params.priority,
        requiredApproverRoles: params.requiredApproverRoles,
        approvers: [],
        decision: 'auto_approved',
        autoApprovalReason: `Priority ${params.priority} meets auto-approve threshold ${config.autoApproveThreshold}`,
        createdAt: now,
        updatedAt: now,
      };
    }
  }

  const approvers: ApprovalGateApprover[] = params.requiredApproverRoles.map(
    (role) => ({
      role,
      status: 'pending',
    }),
  );

  return {
    id: `gate-agent-${gateSeq++}`,
    recommendationId: params.recommendationId,
    tenantId: params.tenantId,
    projectId: params.projectId,
    title: params.title,
    rationale: params.rationale,
    priority: params.priority,
    requiredApproverRoles: params.requiredApproverRoles,
    approvers,
    decision: 'pending',
    expiresAt: new Date(
      Date.now() + config.approvalTimeoutDays * 24 * 60 * 60 * 1000,
    ).toISOString(),
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Decision Logic ────────────────────────────────────────────────────────

/**
 * Record an approver's decision on a gate.
 */
export function recordApproverDecision(
  gate: ApprovalGate,
  userId: string,
  role: ArchitexRole,
  decision: 'approved' | 'rejected' | 'abstained',
  notes?: string,
): ApprovalGate {
  const now = new Date().toISOString();
  const updatedApprovers = gate.approvers.map((a) => {
    if (a.role === role) {
      return {
        ...a,
        userId,
        status: decision === 'abstained' ? ('abstained' as const) : (decision as 'approved' | 'rejected'),
        respondedAt: now,
        notes,
      };
    }
    return a;
  });

  // Determine overall decision
  let overallDecision: ApprovalGateDecision = 'pending';

  const requiredCount = gate.approvers.length;
  const decided = updatedApprovers.filter(
    (a) => a.status !== 'pending',
  );
  const approved = decided.filter((a) => a.status === 'approved').length;
  const rejected = decided.filter((a) => a.status === 'rejected').length;
  const abstained = decided.filter((a) => a.status === 'abstained').length;

  if (decided.length >= requiredCount) {
    // For critical priority, require majority (not just at least one)
    if (gate.priority === 'critical') {
      const effectiveVotes = requiredCount - abstained;
      if (approved > effectiveVotes / 2) {
        overallDecision = 'approved';
      } else if (rejected >= effectiveVotes / 2) {
        overallDecision = 'rejected';
      }
    } else {
      // Any rejection means rejected
      if (rejected > 0) {
        overallDecision = 'rejected';
      } else if (approved > 0) {
        overallDecision = 'approved';
      }
    }
  }

  return {
    ...gate,
    approvers: updatedApprovers,
    decision: overallDecision,
    decidedBy: overallDecision !== 'pending' ? userId : undefined,
    decidedAt: overallDecision !== 'pending' ? now : undefined,
    updatedAt: now,
  };
}

/**
 * Check if a gate is expired (past its approval timeout).
 */
export function isGateExpired(gate: ApprovalGate): boolean {
  if (!gate.expiresAt) return false;
  return new Date(gate.expiresAt) <= new Date();
}

/**
 * Escalate an expired gate to the escalation role.
 */
export function escalateGate(
  gate: ApprovalGate,
  escalationRole: ArchitexRole,
): ApprovalGate {
  return {
    ...gate,
    requiredApproverRoles: [
      ...new Set([...gate.requiredApproverRoles, escalationRole]),
    ],
    approvers: [
      ...gate.approvers,
      { role: escalationRole, status: 'pending' },
    ],
    updatedAt: new Date().toISOString(),
  };
}

// ─── Validation ────────────────────────────────────────────────────────────

/**
 * Validate that a gate's approvers have the necessary permissions.
 */
export function validateGatePermissions(
  gate: ApprovalGate,
  permittedRoles: ArchitexRole[],
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  for (const approver of gate.approvers) {
    if (!permittedRoles.includes(approver.role)) {
      issues.push(
        `Approver role "${approver.role}" is not in permitted roles for this tenant`,
      );
    }
  }

  if (gate.requiredApproverRoles.length === 0) {
    issues.push('Gate has no required approver roles');
  }

  return { valid: issues.length === 0, issues };
}

// ─── Batch Gate Creation ──────────────────────────────────────────────────

/**
 * Create approval gates for a batch of recommendations.
 */
export function createApprovalGatesForRecommendations(
  recommendations: AgentRecommendation[],
  tenantId: string,
  config: ApprovalGateConfig,
): ApprovalGate[] {
  return recommendations.map((rec) =>
    createApprovalGate({
      recommendationId: rec.id,
      tenantId,
      title: rec.title,
      rationale: rec.rationale,
      priority: rec.priority,
      requiredApproverRoles: ['architect', 'client'] as ArchitexRole[],
      config,
    }),
  );
}
