/**
 * BIM Audit Adapter — Audit Trail Integration
 *
 * Pure builder for audit events covering all BIM write operations.
 * Does NOT write to Firestore — that responsibility belongs to the API router.
 *
 * Requirements: 11.4, 11.5, 11.6, 9.5
 */

import type { BimAuditAction } from './types';

/**
 * Structured audit event input ready for persistence by the API layer.
 */
export interface AuditEventInput {
  action: BimAuditAction;
  actorUid: string;
  targetId: string;
  projectId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * Builds an audit event for any BIM write operation.
 *
 * Creates a structured AuditEventInput with an ISO 8601 UTC timestamp.
 * The caller (API router) is responsible for persisting the event to Firestore.
 *
 * @param action - The BIM audit action type
 * @param actorUid - The UID of the user performing the action
 * @param targetId - The ID of the resource being acted upon
 * @param projectId - The project context for the action
 * @param metadata - Optional additional metadata for the event
 * @returns A fully populated AuditEventInput
 */
export function buildBimAuditEvent(
  action: BimAuditAction,
  actorUid: string,
  targetId: string,
  projectId: string,
  metadata?: Record<string, unknown>,
): AuditEventInput {
  const event: AuditEventInput = {
    action,
    actorUid,
    targetId,
    projectId,
    timestamp: new Date().toISOString(),
  };

  if (metadata !== undefined) {
    event.metadata = metadata;
  }

  return event;
}
