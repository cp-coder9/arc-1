/**
 * Client Decision Service — Records client approval/rejection decisions on spec items.
 *
 * Implements the dedicated client decision endpoint logic:
 * - Validates the target item exists (404 if not)
 * - Validates the item's `clientDecision` field is true (400 if not)
 * - Writes ONLY decision-related fields: clientDecisionStatus, decidedBy, decidedAt, decisionComment
 * - Supports overwriting prior decisions with audit of previous value
 * - Writes EnhancedAuditEvent (action = approved|rejected, targetType = item)
 * - Generates EnhancedInboxEvent for users with `view_all` capability
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8
 */

import type {
  SpecItem,
  SpecAuditAction,
  SpecItemClientDecisionFields,
  EnhancedAuditEvent,
  EnhancedInboxEvent,
} from '@/types/specforgeTypes';
import { adminDb } from '@/lib/firebase-admin';
import { clientDecisionSchema } from './specforgeSchemas';
import { getRolesWithCapability } from './specforgeInboxAdapter';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ClientDecisionPayload {
  decision: 'approved' | 'rejected';
  comment?: string;
}

export interface ClientDecisionResponse {
  success: boolean;
  itemId: string;
  decision: 'approved' | 'rejected';
  decidedAt: string;
}

export interface ClientDecisionContext {
  projectId: string;
  itemId: string;
  userId: string;
  userName?: string;
}

// ── Errors ──────────────────────────────────────────────────────────────────

export class ClientDecisionItemNotFoundError extends Error {
  constructor(itemId: string) {
    super(`Item not found: ${itemId}`);
    this.name = 'ClientDecisionItemNotFoundError';
  }
}

export class ClientDecisionNotAcceptedError extends Error {
  constructor(itemId: string) {
    super(`Item does not accept client decisions: ${itemId}`);
    this.name = 'ClientDecisionNotAcceptedError';
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a unique event ID. */
function generateEventId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `cde-${ts}-${rand}`;
}

/** Get Firestore collection reference for a project subcollection. */
function col(projectId: string, subcol: string) {
  return adminDb.collection('projects').doc(projectId).collection(subcol);
}

// ── Core Logic ──────────────────────────────────────────────────────────────

/**
 * Record a client decision (approved/rejected) on a spec item.
 *
 * Flow: validate payload → fetch item (404) → check clientDecision flag (400)
 *       → write decision fields ONLY → write audit event → generate inbox event
 *
 * @param context - Project/item/user context
 * @param payload - The decision payload (decision + optional comment)
 * @returns ClientDecisionResponse with the recorded decision
 * @throws ClientDecisionItemNotFoundError if item doesn't exist
 * @throws ClientDecisionNotAcceptedError if item.clientDecision is false
 */
export async function recordDecision(
  context: ClientDecisionContext,
  payload: ClientDecisionPayload,
): Promise<ClientDecisionResponse> {
  const { projectId, itemId, userId, userName } = context;

  // 1. Validate payload against Zod schema
  const parseResult = clientDecisionSchema.safeParse(payload);
  if (!parseResult.success) {
    throw new Error(`Invalid payload: ${parseResult.error.message}`);
  }

  const { decision, comment } = parseResult.data;

  // 2. Fetch the item from Firestore
  const itemDocRef = col(projectId, 'specItems').doc(itemId);
  const itemDoc = await itemDocRef.get();

  if (!itemDoc.exists) {
    throw new ClientDecisionItemNotFoundError(itemId);
  }

  const item = itemDoc.data() as SpecItem & SpecItemClientDecisionFields;

  // 3. Validate clientDecision field is true
  if (!item.clientDecision) {
    throw new ClientDecisionNotAcceptedError(itemId);
  }

  // 4. Capture previous decision value for audit (if overwriting)
  const previousDecision = item.decidedAt
    ? {
        clientDecisionStatus: item.clientDecisionStatus,
        decidedBy: item.decidedBy,
        decidedAt: item.decidedAt,
        decisionComment: item.decisionComment,
      }
    : undefined;

  // 5. Write ONLY decision fields — no other item fields are modified
  const decidedAt = new Date().toISOString();
  const decisionFields: SpecItemClientDecisionFields = {
    clientDecisionStatus: decision,
    decidedBy: userId,
    decidedAt,
    decisionComment: comment ?? undefined,
  };

  await itemDocRef.update(decisionFields as Record<string, unknown>);

  // 6. Write Audit_Event with action matching the decision value
  const auditEvent: EnhancedAuditEvent = {
    id: generateEventId(),
    workspaceId: projectId,
    action: decision as SpecAuditAction,
    targetId: itemId,
    targetType: 'item',
    performedBy: userId,
    performedAt: decidedAt,
    previousValue: previousDecision ? JSON.stringify(previousDecision) : undefined,
    newValue: JSON.stringify({
      clientDecisionStatus: decision,
      decidedBy: userId,
      decidedAt,
      decisionComment: comment,
    }),
    details: previousDecision
      ? `Overwritten: previous decision was "${previousDecision.clientDecisionStatus}" by ${previousDecision.decidedBy}`
      : undefined,
  };

  await col(projectId, 'specAuditEvents').doc(auditEvent.id).set(auditEvent);

  // 7. Generate Inbox_Event for users with `view_all` capability
  const viewAllRoles = getRolesWithCapability('view_all');
  const inboxEvent: EnhancedInboxEvent = {
    id: generateEventId(),
    targetRole: viewAllRoles[0], // Primary target role
    targetUsers: undefined, // Broadcast to all users with view_all roles
    eventType: 'client_decision_recorded',
    sourceEntityType: 'item',
    sourceEntityId: itemId,
    message: `Client ${userName ?? userId} ${decision} item ${item.code ?? itemId}${comment ? `: "${comment}"` : ''}`.slice(0, 500),
    deepLinkRoute: `/specforge/${projectId}/items/${itemId}`,
    createdAt: decidedAt,
  };

  await col(projectId, 'specInboxEvents').doc(inboxEvent.id).set(inboxEvent);

  // Also emit inbox events for each view_all role via the in-memory adapter
  // for Action Centre integration
  for (const role of viewAllRoles) {
    if (role !== viewAllRoles[0]) {
      const roleInboxEvent: EnhancedInboxEvent = {
        ...inboxEvent,
        id: generateEventId(),
        targetRole: role,
      };
      await col(projectId, 'specInboxEvents').doc(roleInboxEvent.id).set(roleInboxEvent);
    }
  }

  return {
    success: true,
    itemId,
    decision,
    decidedAt,
  };
}
