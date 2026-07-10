/**
 * Substitution Service — Handles material/product substitution requests,
 * multi-gate approval workflow, and rejection logic.
 *
 * Key behaviours:
 * - requestSubstitution(): validates body with Zod (400), validates originalItemId
 *   exists and is not superseded (409), creates substitution record, flags procurement
 *   impact warning, emits Inbox_Event for approve_substitution users
 * - approveSubstitution(): multi-gate logic — if clientDecision=true, require
 *   additional client approval; if ownerRole is professional, require professional
 *   approval. On all gates passed: atomically set original to superseded, create
 *   replacement with approved status, write Audit_Event
 * - rejectSubstitution(): set status rejected, preserve original unchanged,
 *   emit Inbox_Event to requester
 *
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10
 */

import type {
  SpecItem,
  SpecSubstitution,
  SpecSubstitutionStatus,
  EnhancedAuditEvent,
  EnhancedInboxEvent,
  SpecForgeRole,
} from '@/types/specforgeTypes';
import { adminDb } from '@/lib/firebase-admin';
import { substitutionRequestSchema, substitutionApprovalSchema } from './specforgeSchemas';
import { getRolesWithCapability } from './specforgeInboxAdapter';

// ── Types ───────────────────────────────────────────────────────────────────

export interface SubstitutionRequestPayload {
  originalItemId: string;
  proposedTitle: string;
  reason: string;
  proposedSupplier?: string;
  proposedCost?: number;
}

export interface SubstitutionApprovalPayload {
  decision: 'approved' | 'rejected';
  comments?: string;
}

export interface SubstitutionRequestContext {
  projectId: string;
  userId: string;
  userName?: string;
}

export interface SubstitutionApprovalContext {
  projectId: string;
  substitutionId: string;
  userId: string;
  userName?: string;
  approverRole: 'technical' | 'client' | 'professional';
}

export interface SubstitutionRequestResult {
  success: boolean;
  substitutionId: string;
  status: SpecSubstitutionStatus;
  procurementImpactWarning: boolean;
}

export interface SubstitutionApprovalResult {
  success: boolean;
  substitutionId: string;
  status: SpecSubstitutionStatus;
  allApprovalsGranted: boolean;
  replacementItemId?: string;
}

export interface SubstitutionRejectionResult {
  success: boolean;
  substitutionId: string;
  status: 'rejected';
}

// ── Errors ──────────────────────────────────────────────────────────────────

export class SubstitutionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubstitutionValidationError';
  }
}

export class SubstitutionItemNotFoundError extends Error {
  constructor(itemId: string) {
    super(`Item not found or not eligible for substitution: ${itemId}`);
    this.name = 'SubstitutionItemNotFoundError';
  }
}

export class SubstitutionNotFoundError extends Error {
  constructor(substitutionId: string) {
    super(`Substitution not found: ${substitutionId}`);
    this.name = 'SubstitutionNotFoundError';
  }
}

// ── Constants ───────────────────────────────────────────────────────────────

/** Professional roles that require owning professional's approval for substitutions. */
const PROFESSIONAL_ROLES: SpecForgeRole[] = [
  'architect',
  'engineer',
  'energy_professional',
  'fire_engineer',
];

/** Procurement statuses that trigger a procurement impact warning. */
const PROCUREMENT_IMPACT_STATUSES = [
  'ordered',
  'dispatched',
  'delivered',
  'installed',
  'closed',
];

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a unique event/record ID. */
function generateId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${ts}-${rand}`;
}

/** Get Firestore collection reference for a project subcollection. */
function col(projectId: string, subcol: string) {
  return adminDb.collection('projects').doc(projectId).collection(subcol);
}

/**
 * Check if a spec item has a procurement status that's ordered or later.
 * Looks up the specProcurement collection for entries matching the item.
 */
async function hasProcurementImpact(
  projectId: string,
  itemId: string,
): Promise<boolean> {
  const procSnapshot = await col(projectId, 'specProcurement')
    .where('itemId', '==', itemId)
    .limit(1)
    .get();

  if (procSnapshot.empty) return false;

  const entry = procSnapshot.docs[0].data();
  return PROCUREMENT_IMPACT_STATUSES.includes(entry.status);
}

/**
 * Determine which approval gates are required for this substitution.
 * Returns the set of gate keys required.
 */
function getRequiredGates(item: SpecItem): Set<string> {
  const gates = new Set<string>();

  // Technical gate is always required (approve_substitution)
  gates.add('technical');

  // If item requires client decision, add client gate
  if (item.clientDecision) {
    gates.add('client');
  }

  // If item's ownerRole is a professional role, add professional gate
  if (PROFESSIONAL_ROLES.includes(item.ownerRole)) {
    gates.add('professional');
  }

  return gates;
}

// ── Core Logic ──────────────────────────────────────────────────────────────

/**
 * Request a substitution for a spec item.
 *
 * Flow: validate payload (400) → fetch item (409 if missing/superseded)
 *       → check procurement impact → create substitution record
 *       → emit Inbox_Event for approve_substitution users
 *
 * @throws SubstitutionValidationError if Zod validation fails (400)
 * @throws SubstitutionItemNotFoundError if item doesn't exist or is superseded (409)
 */
export async function requestSubstitution(
  context: SubstitutionRequestContext,
  payload: SubstitutionRequestPayload,
): Promise<SubstitutionRequestResult> {
  const { projectId, userId, userName } = context;

  // 1. Validate payload with Zod schema
  const parseResult = substitutionRequestSchema.safeParse(payload);
  if (!parseResult.success) {
    throw new SubstitutionValidationError(
      `Invalid substitution request: ${parseResult.error.message}`,
    );
  }

  const { originalItemId, proposedTitle, reason, proposedSupplier, proposedCost } =
    parseResult.data;

  // 2. Validate original item exists and is not superseded
  const itemDocRef = col(projectId, 'specItems').doc(originalItemId);
  const itemDoc = await itemDocRef.get();

  if (!itemDoc.exists) {
    throw new SubstitutionItemNotFoundError(originalItemId);
  }

  const item = itemDoc.data() as SpecItem;

  if (item.status === 'superseded') {
    throw new SubstitutionItemNotFoundError(originalItemId);
  }

  // 3. Check procurement impact — if item is ordered or later, flag warning
  const procurementImpactWarning = await hasProcurementImpact(
    projectId,
    originalItemId,
  );

  // 4. Create substitution record
  const substitutionId = generateId('sub');
  const now = new Date().toISOString();

  const substitution: SpecSubstitution = {
    id: substitutionId,
    originalItemId,
    proposedTitle,
    proposedSupplier,
    proposedCost,
    reason,
    requestedBy: userId,
    requestedAt: now,
    status: 'requested',
  };

  await col(projectId, 'specSubstitutions').doc(substitutionId).set(substitution);

  // 5. Write Audit_Event for the request
  const auditEvent: EnhancedAuditEvent = {
    id: generateId('sfa'),
    workspaceId: projectId,
    action: 'substitution_requested',
    targetId: originalItemId,
    targetType: 'substitution',
    performedBy: userId,
    performedAt: now,
    newValue: JSON.stringify({
      substitutionId,
      proposedTitle,
      reason,
      proposedSupplier,
      proposedCost,
      procurementImpactWarning,
    }),
    details: procurementImpactWarning
      ? 'Procurement impact warning: item has active procurement (ordered or later)'
      : undefined,
  };

  await col(projectId, 'specAuditEvents').doc(auditEvent.id).set(auditEvent);

  // 6. Generate Inbox_Event for users with `approve_substitution` capability
  const approverRoles = getRolesWithCapability('approve_substitution');
  for (const role of approverRoles) {
    const inboxEvent: EnhancedInboxEvent = {
      id: generateId('sfi'),
      targetRole: role,
      eventType: 'substitution_requested',
      sourceEntityType: 'substitution',
      sourceEntityId: substitutionId,
      message: `Substitution requested for "${item.code}": "${proposedTitle}". Reason: ${reason}`.slice(
        0,
        500,
      ),
      deepLinkRoute: `/specforge/${projectId}/substitutions/${substitutionId}`,
      createdAt: now,
    };
    await col(projectId, 'specInboxEvents').doc(inboxEvent.id).set(inboxEvent);
  }

  return {
    success: true,
    substitutionId,
    status: 'requested',
    procurementImpactWarning,
  };
}

/**
 * Approve a substitution through the multi-gate workflow.
 *
 * Gates:
 * - 'technical': required for all substitutions (approve_substitution capability)
 * - 'client': required if item's clientDecision=true (approve_client_decision)
 * - 'professional': required if item's ownerRole is a professional role
 *
 * The substitution stays in 'under_review' until ALL required gates pass.
 * On all gates passed: atomically set original item to superseded, create
 * replacement item with approved status.
 *
 * @throws SubstitutionNotFoundError if substitution doesn't exist
 */
export async function approveSubstitution(
  context: SubstitutionApprovalContext,
  payload: SubstitutionApprovalPayload,
): Promise<SubstitutionApprovalResult> {
  const { projectId, substitutionId, userId, approverRole } = context;

  // 1. Validate payload
  const parseResult = substitutionApprovalSchema.safeParse(payload);
  if (!parseResult.success) {
    throw new SubstitutionValidationError(
      `Invalid approval payload: ${parseResult.error.message}`,
    );
  }

  const { decision, comments } = parseResult.data;

  // If decision is 'rejected', delegate to rejection logic
  if (decision === 'rejected') {
    await rejectSubstitution(
      { projectId, substitutionId, userId, userName: context.userName },
      comments,
    );
    return {
      success: true,
      substitutionId,
      status: 'rejected',
      allApprovalsGranted: false,
    };
  }

  // 2. Fetch the substitution
  const subDocRef = col(projectId, 'specSubstitutions').doc(substitutionId);
  const subDoc = await subDocRef.get();

  if (!subDoc.exists) {
    throw new SubstitutionNotFoundError(substitutionId);
  }

  const substitution = subDoc.data() as SpecSubstitution & {
    approvalGates?: Record<string, { approvedBy: string; approvedAt: string }>;
  };

  // 3. Fetch the original item to determine required gates
  const itemDocRef = col(projectId, 'specItems').doc(substitution.originalItemId);
  const itemDoc = await itemDocRef.get();

  if (!itemDoc.exists) {
    throw new SubstitutionItemNotFoundError(substitution.originalItemId);
  }

  const item = itemDoc.data() as SpecItem;

  // 4. Determine required gates
  const requiredGates = getRequiredGates(item);
  const now = new Date().toISOString();

  // 5. Record this approval gate
  const existingGates = substitution.approvalGates ?? {};
  existingGates[approverRole] = {
    approvedBy: userId,
    approvedAt: now,
  };

  // 6. Check if all required gates are satisfied
  const allGatesSatisfied = [...requiredGates].every(
    (gate) => existingGates[gate] !== undefined,
  );

  if (!allGatesSatisfied) {
    // Update substitution status to under_review and record the gate
    await subDocRef.update({
      status: 'under_review' as SpecSubstitutionStatus,
      approvalGates: existingGates,
      reviewedBy: userId,
      reviewedAt: now,
      reviewComments: comments ?? undefined,
    });

    // Write audit event for partial approval
    const partialAuditEvent: EnhancedAuditEvent = {
      id: generateId('sfa'),
      workspaceId: projectId,
      action: 'approved',
      targetId: substitutionId,
      targetType: 'substitution',
      performedBy: userId,
      performedAt: now,
      details: `Approval gate "${approverRole}" granted. Pending gates: ${[...requiredGates].filter((g) => !existingGates[g]).join(', ')}`,
      newValue: JSON.stringify({ approverRole, gatesSatisfied: Object.keys(existingGates) }),
    };
    await col(projectId, 'specAuditEvents').doc(partialAuditEvent.id).set(partialAuditEvent);

    return {
      success: true,
      substitutionId,
      status: 'under_review',
      allApprovalsGranted: false,
    };
  }

  // 7. All gates satisfied — execute atomic substitution
  const replacementItemId = generateId('spi');
  const batch = adminDb.batch();

  // 7a. Set original item to superseded
  batch.update(itemDocRef, {
    status: 'superseded',
    supersededBy: replacementItemId,
  });

  // 7b. Create replacement item with approved status
  const replacementItem: SpecItem = {
    id: replacementItemId,
    sectionId: item.sectionId,
    code: `${item.code}-SUB`,
    title: substitution.proposedTitle,
    room: item.room,
    package: item.package,
    discipline: item.discipline,
    supplier: substitution.proposedSupplier ?? item.supplier,
    model: undefined,
    finish: undefined,
    dimensions: undefined,
    drawingRefs: item.drawingRefs,
    clauseRefs: item.clauseRefs,
    budgetAllowance: item.budgetAllowance,
    estimatedCost: substitution.proposedCost ?? item.estimatedCost,
    leadTimeDays: item.leadTimeDays,
    clientDecision: item.clientDecision,
    ownerRole: item.ownerRole,
    reviewerRole: item.reviewerRole,
    approverRole: item.approverRole,
    status: 'approved',
    sourceRevision: item.sourceRevision,
    supersededBy: null,
    sustainability: item.sustainability,
    warranty: item.warranty,
    notes: `Substitution of ${item.code}. Reason: ${substitution.reason}`,
  };

  batch.set(col(projectId, 'specItems').doc(replacementItemId), replacementItem);

  // 7c. Update substitution record
  batch.update(subDocRef, {
    status: 'approved' as SpecSubstitutionStatus,
    approvalGates: existingGates,
    reviewedBy: userId,
    reviewedAt: now,
    reviewComments: comments ?? undefined,
  });

  // 7d. Commit the atomic batch
  await batch.commit();

  // 8. Write Audit_Event recording the supersession and replacement creation
  const completionAuditEvent: EnhancedAuditEvent = {
    id: generateId('sfa'),
    workspaceId: projectId,
    action: 'substitution_resolved',
    targetId: substitutionId,
    targetType: 'substitution',
    performedBy: userId,
    performedAt: now,
    previousValue: JSON.stringify({
      originalItemId: item.id,
      originalItemCode: item.code,
      originalStatus: item.status,
    }),
    newValue: JSON.stringify({
      originalItemStatus: 'superseded',
      replacementItemId,
      replacementTitle: substitution.proposedTitle,
      replacementStatus: 'approved',
      allGates: Object.keys(existingGates),
    }),
    details: `Substitution completed: ${item.code} superseded by ${replacementItemId}. All approval gates satisfied: ${[...requiredGates].join(', ')}`,
  };

  await col(projectId, 'specAuditEvents').doc(completionAuditEvent.id).set(completionAuditEvent);

  return {
    success: true,
    substitutionId,
    status: 'approved',
    allApprovalsGranted: true,
    replacementItemId,
  };
}

/**
 * Reject a substitution — set status to rejected, preserve original unchanged,
 * emit Inbox_Event to the requesting user.
 *
 * @throws SubstitutionNotFoundError if substitution doesn't exist
 */
export async function rejectSubstitution(
  context: {
    projectId: string;
    substitutionId: string;
    userId: string;
    userName?: string;
  },
  comments?: string,
): Promise<SubstitutionRejectionResult> {
  const { projectId, substitutionId, userId } = context;
  const now = new Date().toISOString();

  // 1. Fetch the substitution
  const subDocRef = col(projectId, 'specSubstitutions').doc(substitutionId);
  const subDoc = await subDocRef.get();

  if (!subDoc.exists) {
    throw new SubstitutionNotFoundError(substitutionId);
  }

  const substitution = subDoc.data() as SpecSubstitution;

  // 2. Set status to rejected — original item remains unchanged
  await subDocRef.update({
    status: 'rejected' as SpecSubstitutionStatus,
    reviewedBy: userId,
    reviewedAt: now,
    reviewComments: comments ?? undefined,
  });

  // 3. Write Audit_Event for rejection
  const auditEvent: EnhancedAuditEvent = {
    id: generateId('sfa'),
    workspaceId: projectId,
    action: 'substitution_resolved',
    targetId: substitutionId,
    targetType: 'substitution',
    performedBy: userId,
    performedAt: now,
    previousValue: JSON.stringify({ status: substitution.status }),
    newValue: JSON.stringify({ status: 'rejected', reviewComments: comments }),
    details: `Substitution rejected by ${userId}. Original item preserved unchanged.`,
  };

  await col(projectId, 'specAuditEvents').doc(auditEvent.id).set(auditEvent);

  // 4. Emit Inbox_Event to the requesting user
  const inboxEvent: EnhancedInboxEvent = {
    id: generateId('sfi'),
    targetUsers: [substitution.requestedBy],
    eventType: 'substitution_rejected',
    sourceEntityType: 'substitution',
    sourceEntityId: substitutionId,
    message: `Your substitution request for "${substitution.proposedTitle}" has been rejected.${comments ? ` Reason: ${comments}` : ''}`.slice(
      0,
      500,
    ),
    deepLinkRoute: `/specforge/${projectId}/substitutions/${substitutionId}`,
    createdAt: now,
  };

  await col(projectId, 'specInboxEvents').doc(inboxEvent.id).set(inboxEvent);

  return {
    success: true,
    substitutionId,
    status: 'rejected',
  };
}
