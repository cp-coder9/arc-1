/**
 * Project Command Centre — Multi-Party Approval State Machine
 *
 * Tracks multi-party approval workflows for actions requiring consent from
 * multiple signatories. Implements Property 23 of the design document.
 *
 * State transitions:
 * - pending  → approved  (all N required approvals received within 14 days)
 * - pending  → rejected  (any signatory rejects)
 * - pending  → expired   (14 calendar days elapse without full approval or rejection)
 *
 * @module commandCentre/approvalStateMachine
 * @validates Requirements 17.3, 17.4, 17.5, 17.6, 17.7
 */

import type { UserRole } from '@/types';

// ── Constants ────────────────────────────────────────────────────────────────

/** Maximum calendar days before a multi-party approval request expires. */
export const APPROVAL_EXPIRY_DAYS = 14;

/** Convert days to milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000;

// ── Types ────────────────────────────────────────────────────────────────────

/** Status of the overall approval request. */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

/** Status of an individual signatory's approval. */
export type SignatoryStatus = 'pending' | 'approved' | 'rejected' | 'expired';

/** A single signatory's approval record. */
export interface SignatoryRecord {
  role: UserRole;
  userId?: string;
  status: SignatoryStatus;
  respondedAt?: string;
}

/** Authority rule defining which roles are required for a given action type. */
export interface AuthorityRule {
  actionType: string;
  requiredRoles: UserRole[];
  /** Whether all required roles must approve (true) or any one suffices (false). */
  multiParty: boolean;
  /** Number of days before expiry (default: 14). */
  expiryDays: number;
}

/** Complete state of a multi-party approval request. */
export interface ApprovalRequest {
  requestId: string;
  actionType: string;
  projectId: string;
  entityId: string;
  entityType: string;
  requiredSignatories: UserRole[];
  signatories: SignatoryRecord[];
  status: ApprovalStatus;
  initiatedAt: string;
  expiresAt: string;
  resolvedAt?: string;
}

/** Input for recording an individual approval. */
export interface ApprovalInput {
  role: UserRole;
  userId: string;
  decision: 'approved' | 'rejected';
  timestamp?: string;
}

// ── Authority Matrix ─────────────────────────────────────────────────────────

/**
 * Default authority rules for the Architex platform.
 *
 * @validates Requirement 17.1, 17.2
 */
export const AUTHORITY_MATRIX: AuthorityRule[] = [
  {
    actionType: 'payment_certification',
    requiredRoles: ['quantity_surveyor', 'architect'] as UserRole[],
    multiParty: true,
    expiryDays: APPROVAL_EXPIRY_DAYS,
  },
  {
    actionType: 'variation_approval',
    requiredRoles: ['architect', 'quantity_surveyor', 'client'] as UserRole[],
    multiParty: true,
    expiryDays: APPROVAL_EXPIRY_DAYS,
  },
  {
    actionType: 'milestone_completion',
    requiredRoles: ['site_manager', 'architect'] as UserRole[],
    multiParty: false,
    expiryDays: APPROVAL_EXPIRY_DAYS,
  },
  {
    actionType: 'risk_escalation',
    requiredRoles: ['bep', 'architect'] as UserRole[],
    multiParty: false,
    expiryDays: APPROVAL_EXPIRY_DAYS,
  },
  {
    actionType: 'contract_termination',
    requiredRoles: ['client', 'architect'] as UserRole[],
    multiParty: true,
    expiryDays: APPROVAL_EXPIRY_DAYS,
  },
];

// ── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Get the authority rule for a given action type.
 */
export function getAuthorityRule(actionType: string): AuthorityRule | undefined {
  return AUTHORITY_MATRIX.find((rule) => rule.actionType === actionType);
}

/**
 * Check whether a user role is authorised to perform a given action type.
 */
export function isRoleAuthorized(actionType: string, role: UserRole): boolean {
  const rule = getAuthorityRule(actionType);
  if (!rule) return false;
  return rule.requiredRoles.includes(role);
}

/**
 * Compute the expiry date from initiation date and rule.
 */
export function computeExpiryDate(initiatedAt: string, expiryDays: number = APPROVAL_EXPIRY_DAYS): string {
  const initiated = new Date(initiatedAt);
  const expiry = new Date(initiated.getTime() + expiryDays * DAY_MS);
  return expiry.toISOString();
}

// ── State Machine Core ───────────────────────────────────────────────────────

/**
 * Creates a new approval request with all required signatories in pending state.
 */
export function createApprovalRequest(
  requestId: string,
  actionType: string,
  projectId: string,
  entityId: string,
  entityType: string,
  requiredRoles: UserRole[],
  initiatedAt: string = new Date().toISOString(),
  expiryDays: number = APPROVAL_EXPIRY_DAYS,
): ApprovalRequest {
  const expiresAt = computeExpiryDate(initiatedAt, expiryDays);

  const signatories: SignatoryRecord[] = requiredRoles.map((role) => ({
    role,
    status: 'pending' as SignatoryStatus,
  }));

  return {
    requestId,
    actionType,
    projectId,
    entityId,
    entityType,
    requiredSignatories: requiredRoles,
    signatories,
    status: 'pending',
    initiatedAt,
    expiresAt,
  };
}

/**
 * Evaluates the current status of an approval request based on time and recorded approvals.
 *
 * Property 23: Authority Matrix Approval State Machine
 * - (a) < N approvals AND < 14 days → "pending"
 * - (b) exactly N approvals → "approved"
 * - (c) any rejection → "rejected"
 * - (d) 14 days elapsed → "expired"
 *
 * @param request - The current approval request state.
 * @param now - Current time for expiry calculation (ISO string or Date).
 * @returns The updated ApprovalRequest with resolved status.
 *
 * @validates Requirements 17.3, 17.4, 17.5, 17.6, 17.7
 */
export function evaluateApprovalStatus(
  request: ApprovalRequest,
  now: string | Date = new Date().toISOString(),
): ApprovalRequest {
  const currentTime = typeof now === 'string' ? new Date(now) : now;
  const expiryTime = new Date(request.expiresAt);

  // Rule (c): Any rejection → rejected immediately
  const hasRejection = request.signatories.some((s) => s.status === 'rejected');
  if (hasRejection) {
    return {
      ...request,
      status: 'rejected',
      resolvedAt: request.resolvedAt ?? currentTime.toISOString(),
    };
  }

  // Rule (b): All approvals received → approved
  const approvedCount = request.signatories.filter((s) => s.status === 'approved').length;
  const requiredCount = request.requiredSignatories.length;
  if (approvedCount >= requiredCount) {
    return {
      ...request,
      status: 'approved',
      resolvedAt: request.resolvedAt ?? currentTime.toISOString(),
    };
  }

  // Rule (d): 14 days elapsed → expired
  if (currentTime >= expiryTime) {
    // Mark remaining pending signatories as expired
    const updatedSignatories = request.signatories.map((s) =>
      s.status === 'pending' ? { ...s, status: 'expired' as SignatoryStatus } : s,
    );
    return {
      ...request,
      signatories: updatedSignatories,
      status: 'expired',
      resolvedAt: request.resolvedAt ?? currentTime.toISOString(),
    };
  }

  // Rule (a): Default — still pending
  return { ...request, status: 'pending' };
}

/**
 * Records an individual signatory's approval or rejection and evaluates the new state.
 *
 * @param request - Current approval request.
 * @param input - The signatory's decision.
 * @returns Updated approval request with new status.
 */
export function recordApproval(
  request: ApprovalRequest,
  input: ApprovalInput,
): ApprovalRequest {
  const timestamp = input.timestamp ?? new Date().toISOString();

  // Find the matching signatory record for this role
  const updatedSignatories = request.signatories.map((s) => {
    if (s.role === input.role && s.status === 'pending') {
      return {
        ...s,
        userId: input.userId,
        status: input.decision,
        respondedAt: timestamp,
      };
    }
    return s;
  });

  const updatedRequest: ApprovalRequest = {
    ...request,
    signatories: updatedSignatories,
  };

  // Re-evaluate the overall status
  return evaluateApprovalStatus(updatedRequest, timestamp);
}

/**
 * Returns the list of signatories who have not yet responded.
 */
export function getPendingSignatories(request: ApprovalRequest): SignatoryRecord[] {
  return request.signatories.filter((s) => s.status === 'pending');
}

/**
 * Returns the time remaining (in milliseconds) before the request expires.
 * Returns 0 if already expired.
 */
export function getTimeRemaining(request: ApprovalRequest, now: Date = new Date()): number {
  const expiryTime = new Date(request.expiresAt).getTime();
  const remaining = expiryTime - now.getTime();
  return Math.max(0, remaining);
}

// ── Service Export ───────────────────────────────────────────────────────────

export const approvalStateMachine = {
  AUTHORITY_MATRIX,
  APPROVAL_EXPIRY_DAYS,
  getAuthorityRule,
  isRoleAuthorized,
  computeExpiryDate,
  createApprovalRequest,
  evaluateApprovalStatus,
  recordApproval,
  getPendingSignatories,
  getTimeRemaining,
};

export default approvalStateMachine;
