/**
 * SpecForge Inbox/Action Centre Adapter
 *
 * Bridges SpecForge workflow events into the platform Action Centre / Inbox.
 * Generates inbox events for approvals, client decisions, issue notifications,
 * substitutions, budget warnings, and long-lead warnings.
 *
 * Key behaviours:
 * - Deduplication: skips event creation if an unresolved event with the same
 *   trigger type + item code + recipient already exists
 * - Fallback: routes to admin-role users if no matching recipients found
 * - Issue notifications capped at 200 recipients
 * - Budget warning triggers when estimatedCost > budgetAllowance × 1.1
 * - Long-lead warning triggers when leadTimeDays ≥ 56
 */

import type {
  SpecApproval,
  SpecItem,
  SpecIssueSnapshot,
  SpecIssueRecipient,
  SpecSubstitution,
  SpecForgeRole,
  SpecCapability,
} from '@/types/specforgeTypes';
import { SPEC_ROLE_CAPABILITIES, specRoleCan } from './specforgeService';
import { createInboxEvent } from '@/services/inboxEventAdapter';

// ── Types ───────────────────────────────────────────────────────────────────

export type SpecInboxTriggerType =
  | 'approval_created'
  | 'client_decision'
  | 'spec_issued'
  | 'substitution_requested'
  | 'budget_warning'
  | 'long_lead_warning';

export interface SpecInboxEvent {
  eventId: string;
  triggerType: SpecInboxTriggerType;
  recipientRole: string;
  recipientUserId?: string;
  title: string;
  description: string;
  itemCode: string;
  sectionRef?: string;
  projectId: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  resolved: boolean;
}

// ── Internal State ──────────────────────────────────────────────────────────

let seq = 1;
const specInboxEvents: SpecInboxEvent[] = [];

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Find all SpecForge roles that have a given capability.
 */
export function getRolesWithCapability(capability: SpecCapability): SpecForgeRole[] {
  return (Object.keys(SPEC_ROLE_CAPABILITIES) as SpecForgeRole[]).filter(
    (role) => specRoleCan(role, capability),
  );
}

/**
 * Get admin-role fallback recipients (roles: admin, platform_admin).
 */
function getAdminFallbackRoles(): SpecForgeRole[] {
  return ['admin', 'platform_admin'];
}

/**
 * Check for an existing unresolved event with the same trigger type, item code,
 * and recipient role. Returns true if a duplicate exists (should skip creation).
 */
function hasDuplicateUnresolved(
  triggerType: SpecInboxTriggerType,
  itemCode: string,
  recipientRole: string,
): boolean {
  return specInboxEvents.some(
    (e) =>
      !e.resolved &&
      e.triggerType === triggerType &&
      e.itemCode === itemCode &&
      e.recipientRole === recipientRole,
  );
}

/**
 * Create and store an inbox event, returning the event or null if deduplicated.
 */
function createSpecInboxEvent(params: {
  triggerType: SpecInboxTriggerType;
  recipientRole: string;
  recipientUserId?: string;
  title: string;
  description: string;
  itemCode: string;
  sectionRef?: string;
  projectId: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}): SpecInboxEvent | null {
  // Deduplication check
  if (hasDuplicateUnresolved(params.triggerType, params.itemCode, params.recipientRole)) {
    return null;
  }

  const event: SpecInboxEvent = {
    eventId: `spec-inbox-${seq++}`,
    triggerType: params.triggerType,
    recipientRole: params.recipientRole,
    recipientUserId: params.recipientUserId,
    title: params.title,
    description: params.description,
    itemCode: params.itemCode,
    sectionRef: params.sectionRef,
    projectId: params.projectId,
    priority: params.priority,
    createdAt: new Date().toISOString(),
    resolved: false,
  };

  specInboxEvents.push(event);

  // Also emit to platform spine inbox event adapter
  createInboxEvent(
    params.recipientRole,
    params.title,
    params.itemCode,
    params.priority,
  );

  return event;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Emit inbox event when an approval is created.
 * Targets users with the matching reviewer capability (approve_technical_section
 * or the approval's designated reviewerRole).
 *
 * Requirement 8.1: approval → inbox event for designated reviewer with item code,
 * section reference, approval type, and route to approval detail view.
 */
export async function emitApprovalCreatedEvent(
  approval: SpecApproval,
  item: SpecItem,
  projectId: string,
): Promise<void> {
  const targetRoles = getRolesWithCapability('approve_technical_section');

  // Also include the specific reviewer role from the approval
  if (approval.reviewerRole && !targetRoles.includes(approval.reviewerRole)) {
    targetRoles.push(approval.reviewerRole);
  }

  const recipientRoles = targetRoles.length > 0 ? targetRoles : getAdminFallbackRoles();

  for (const role of recipientRoles) {
    createSpecInboxEvent({
      triggerType: 'approval_created',
      recipientRole: role,
      title: `Approval required: ${item.code}`,
      description: `Technical approval requested for "${item.title}" in section ${item.sectionId}. Review and provide your decision.`,
      itemCode: item.code,
      sectionRef: item.sectionId,
      projectId,
      priority: 'high',
    });
  }
}

/**
 * Emit inbox event when a spec item needs a client decision.
 * Targets users with `approve_client_decision` capability.
 *
 * Requirement 8.2: client decision change → inbox event for approve_client_decision
 * holders with item code, section, and decision description.
 */
export async function emitClientDecisionEvent(
  item: SpecItem,
  projectId: string,
): Promise<void> {
  const targetRoles = getRolesWithCapability('approve_client_decision');
  const recipientRoles = targetRoles.length > 0 ? targetRoles : getAdminFallbackRoles();

  for (const role of recipientRoles) {
    createSpecInboxEvent({
      triggerType: 'client_decision',
      recipientRole: role,
      title: `Client decision required: ${item.code}`,
      description: `Item "${item.title}" in section ${item.sectionId} requires a client decision. Please review and approve or reject.`,
      itemCode: item.code,
      sectionRef: item.sectionId,
      projectId,
      priority: 'high',
    });
  }
}

/**
 * Emit inbox events when a specification is issued.
 * One event per recipient, capped at 200.
 *
 * Requirement 8.3: issue → one inbox event per recipient, max 200.
 */
export async function emitIssueNotifications(
  snapshot: SpecIssueSnapshot,
  recipients: SpecIssueRecipient[],
): Promise<void> {
  // Cap recipients at 200
  const cappedRecipients = recipients.slice(0, 200);

  for (const recipient of cappedRecipients) {
    createSpecInboxEvent({
      triggerType: 'spec_issued',
      recipientRole: recipient.role,
      recipientUserId: recipient.userId,
      title: `Specification issued: Rev ${snapshot.revision}`,
      description: `Specification "${snapshot.projectName}" has been issued at revision ${snapshot.revision} by ${snapshot.issuer.name}. Scope: ${recipient.scope}.`,
      itemCode: snapshot.snapshotId,
      sectionRef: undefined,
      projectId: snapshot.projectId,
      priority: 'medium',
    });
  }
}

/**
 * Emit inbox event when a substitution is requested.
 * Targets users with `approve_substitution` capability.
 *
 * Requirement 8.4: substitution request → inbox event for approve_substitution
 * holders with original item code, proposed substitute title, and reason.
 */
export async function emitSubstitutionEvent(
  sub: SpecSubstitution,
  item: SpecItem,
  projectId: string,
): Promise<void> {
  const targetRoles = getRolesWithCapability('approve_substitution');
  const recipientRoles = targetRoles.length > 0 ? targetRoles : getAdminFallbackRoles();

  for (const role of recipientRoles) {
    createSpecInboxEvent({
      triggerType: 'substitution_requested',
      recipientRole: role,
      title: `Substitution requested: ${item.code}`,
      description: `Substitution proposed for "${item.title}": "${sub.proposedTitle}". Reason: ${sub.reason}`,
      itemCode: item.code,
      sectionRef: item.sectionId,
      projectId,
      priority: 'high',
    });
  }
}

/**
 * Emit budget warning event when estimated cost exceeds budget allowance by >10%.
 * Only triggers when estimatedCost > budgetAllowance × 1.1.
 * Targets users with `review_budget` capability.
 *
 * Requirement 8.5: estimatedCost > budgetAllowance * 1.1 → budget warning
 * for review_budget capability holders.
 */
export async function emitBudgetWarning(
  item: SpecItem,
  projectId: string,
): Promise<void> {
  // Only trigger if threshold exceeded
  if (item.estimatedCost <= item.budgetAllowance * 1.1) {
    return;
  }

  const targetRoles = getRolesWithCapability('review_budget');
  const recipientRoles = targetRoles.length > 0 ? targetRoles : getAdminFallbackRoles();

  const overPct = item.budgetAllowance > 0
    ? Math.round(((item.estimatedCost - item.budgetAllowance) / item.budgetAllowance) * 100)
    : 100;

  for (const role of recipientRoles) {
    createSpecInboxEvent({
      triggerType: 'budget_warning',
      recipientRole: role,
      title: `Budget warning: ${item.code} (+${overPct}%)`,
      description: `Item "${item.title}" estimated cost (${item.estimatedCost}) exceeds budget allowance (${item.budgetAllowance}) by ${overPct}%. Review required.`,
      itemCode: item.code,
      sectionRef: item.sectionId,
      projectId,
      priority: 'high',
    });
  }
}

/**
 * Emit long-lead warning event when lead time is 56 days or more.
 * Only triggers when leadTimeDays >= 56.
 * Targets users with `view_all` capability.
 *
 * Requirement 8.6: leadTimeDays >= 56 → long-lead warning for view_all
 * capability holders.
 */
export async function emitLongLeadWarning(
  item: SpecItem,
  projectId: string,
): Promise<void> {
  // Only trigger if threshold met
  if (item.leadTimeDays < 56) {
    return;
  }

  const targetRoles = getRolesWithCapability('view_all');
  const recipientRoles = targetRoles.length > 0 ? targetRoles : getAdminFallbackRoles();

  for (const role of recipientRoles) {
    createSpecInboxEvent({
      triggerType: 'long_lead_warning',
      recipientRole: role,
      title: `Long-lead item: ${item.code} (${item.leadTimeDays} days)`,
      description: `Item "${item.title}" has a lead time of ${item.leadTimeDays} days (≥56 day threshold). Plan procurement accordingly.`,
      itemCode: item.code,
      sectionRef: item.sectionId,
      projectId,
      priority: 'medium',
    });
  }
}

// ── Query / State Management ────────────────────────────────────────────────

/**
 * Get all specforge inbox events, optionally filtered.
 */
export function getSpecInboxEvents(options?: {
  triggerType?: SpecInboxTriggerType;
  recipientRole?: string;
  projectId?: string;
  unresolvedOnly?: boolean;
}): SpecInboxEvent[] {
  let filtered = [...specInboxEvents];

  if (options?.triggerType) {
    filtered = filtered.filter((e) => e.triggerType === options.triggerType);
  }
  if (options?.recipientRole) {
    filtered = filtered.filter((e) => e.recipientRole === options.recipientRole);
  }
  if (options?.projectId) {
    filtered = filtered.filter((e) => e.projectId === options.projectId);
  }
  if (options?.unresolvedOnly) {
    filtered = filtered.filter((e) => !e.resolved);
  }

  return filtered.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Resolve a spec inbox event by ID (marks as resolved so deduplication allows new events).
 */
export function resolveSpecInboxEvent(eventId: string): SpecInboxEvent | undefined {
  const event = specInboxEvents.find((e) => e.eventId === eventId);
  if (event) {
    event.resolved = true;
  }
  return event;
}

/**
 * Get the total count of spec inbox events.
 */
export function getSpecInboxEventCount(options?: {
  unresolvedOnly?: boolean;
  projectId?: string;
}): number {
  return getSpecInboxEvents({
    unresolvedOnly: options?.unresolvedOnly,
    projectId: options?.projectId,
  }).length;
}

// ── Reset (for testing) ─────────────────────────────────────────────────────

export function resetSpecInboxState(): void {
  specInboxEvents.length = 0;
  seq = 1;
}
