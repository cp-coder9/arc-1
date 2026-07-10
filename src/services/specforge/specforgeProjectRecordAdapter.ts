/**
 * SpecForge ProjectRecord Adapter — the third leg of the governance triple-write.
 *
 * On every SpecForge state transition, the system writes:
 *   1. Audit_Event (via specforgeAuditAdapter)
 *   2. Inbox_Event (via specforgeInboxAdapter)
 *   3. ProjectRecord (via this adapter)
 *
 * This adapter creates a generic ProjectRecord envelope for each SpecForge state
 * transition and writes it using the existing project passport pattern. The records
 * are stored in-memory (matching the platform pattern) and can be queried for
 * inclusion in the Project Passport lifecycle evaluation.
 *
 * Requirements: 12.1, 12.9, 12.10
 */

import type { SpecAuditAction } from '@/types/specforgeTypes';

// ── Types ───────────────────────────────────────────────────────────────────

export interface SpecForgeProjectRecord {
  recordId: string;
  projectId: string;
  moduleKey: 'specforge';
  recordType: SpecForgeRecordType;
  title: string;
  status: string;
  entityType: 'item' | 'section' | 'workspace' | 'snapshot' | 'procurement' | 'substitution' | 'approval';
  entityId: string;
  action: SpecAuditAction;
  performedBy: string;
  performedAt: string;
  linkedRecordIds: string[];
  payload?: Record<string, unknown>;
}

export type SpecForgeRecordType =
  | 'spec_item_transition'
  | 'spec_section_transition'
  | 'spec_workspace_transition'
  | 'spec_snapshot_created'
  | 'spec_procurement_transition'
  | 'spec_substitution_transition'
  | 'spec_approval_transition';

// ── Internal State ──────────────────────────────────────────────────────────

let seq = 1;
const projectRecords: SpecForgeProjectRecord[] = [];

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Map entity type to a record type string. */
function entityTypeToRecordType(
  entityType: SpecForgeProjectRecord['entityType'],
): SpecForgeRecordType {
  const mapping: Record<SpecForgeProjectRecord['entityType'], SpecForgeRecordType> = {
    item: 'spec_item_transition',
    section: 'spec_section_transition',
    workspace: 'spec_workspace_transition',
    snapshot: 'spec_snapshot_created',
    procurement: 'spec_procurement_transition',
    substitution: 'spec_substitution_transition',
    approval: 'spec_approval_transition',
  };
  return mapping[entityType];
}

/** Generate a unique record ID. */
function generateRecordId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `sfpr-${ts}-${rand}-${seq++}`;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Create a SpecForge ProjectRecord for a state transition.
 * This is the primary entry point for the governance triple-write's third leg.
 *
 * Called by all SpecForge services on state transitions alongside
 * emitEnhancedAuditEvent and emitEnhancedInboxEvent.
 *
 * @param params - The state transition details
 * @returns The created ProjectRecord
 */
export function createSpecForgeProjectRecord(params: {
  projectId: string;
  entityType: 'item' | 'section' | 'workspace' | 'snapshot' | 'procurement' | 'substitution' | 'approval';
  entityId: string;
  action: SpecAuditAction;
  title: string;
  status: string;
  performedBy: string;
  linkedRecordIds?: string[];
  payload?: Record<string, unknown>;
}): SpecForgeProjectRecord {
  const record: SpecForgeProjectRecord = {
    recordId: generateRecordId(),
    projectId: params.projectId,
    moduleKey: 'specforge',
    recordType: entityTypeToRecordType(params.entityType),
    title: params.title,
    status: params.status,
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    performedBy: params.performedBy,
    performedAt: new Date().toISOString(),
    linkedRecordIds: params.linkedRecordIds ?? [],
    payload: params.payload,
  };

  projectRecords.push(record);
  return record;
}

/**
 * Convenience function: emit the full triple-write in one call.
 * Orchestrates the Audit_Event, Inbox_Event, and ProjectRecord writes.
 *
 * This is the recommended entry point for services that need to perform
 * the complete governance triple-write on state transitions.
 *
 * Requirements: 12.1
 */
export async function emitSpecForgeTripleWrite(params: {
  // Common fields
  projectId: string;
  entityType: 'item' | 'section' | 'workspace' | 'snapshot' | 'procurement' | 'substitution' | 'approval';
  entityId: string;
  action: SpecAuditAction;
  performedBy: string;
  // Audit-specific
  previousValue?: string;
  newValue?: string;
  // Inbox-specific
  targetUsers?: string[];
  targetRole?: string;
  message: string;
  deepLinkRoute: string;
  // ProjectRecord-specific
  title: string;
  status: string;
  linkedRecordIds?: string[];
  payload?: Record<string, unknown>;
}): Promise<{
  auditEventId: string;
  inboxEvent: import('./specforgeInboxAdapter').EnhancedSpecInboxEvent;
  projectRecord: SpecForgeProjectRecord;
}> {
  // Lazy-import to avoid circular dependencies
  const { emitEnhancedAuditEvent } = await import('./specforgeAuditAdapter');
  const { emitEnhancedInboxEvent } = await import('./specforgeInboxAdapter');

  // 1. Audit Event
  const auditEventId = await emitEnhancedAuditEvent({
    action: params.action,
    targetId: params.entityId,
    targetType: params.entityType,
    performedBy: params.performedBy,
    projectId: params.projectId,
    previousValue: params.previousValue,
    newValue: params.newValue,
  });

  // 2. Inbox Event
  const inboxEvent = emitEnhancedInboxEvent({
    targetUsers: params.targetUsers,
    targetRole: params.targetRole,
    eventType: params.action,
    sourceEntityType: params.entityType,
    sourceEntityId: params.entityId,
    message: params.message,
    deepLinkRoute: params.deepLinkRoute,
    projectId: params.projectId,
  });

  // 3. ProjectRecord
  const projectRecord = createSpecForgeProjectRecord({
    projectId: params.projectId,
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    title: params.title,
    status: params.status,
    performedBy: params.performedBy,
    linkedRecordIds: params.linkedRecordIds,
    payload: params.payload,
  });

  return { auditEventId, inboxEvent, projectRecord };
}

// ── Query ───────────────────────────────────────────────────────────────────

/**
 * Get all SpecForge project records for a project.
 */
export function getSpecForgeProjectRecords(projectId: string): SpecForgeProjectRecord[] {
  return projectRecords
    .filter((r) => r.projectId === projectId)
    .sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime());
}

/**
 * Get a SpecForge project record by ID.
 */
export function getSpecForgeProjectRecord(recordId: string): SpecForgeProjectRecord | undefined {
  return projectRecords.find((r) => r.recordId === recordId);
}

/**
 * Get SpecForge project records filtered by entity type.
 */
export function getSpecForgeProjectRecordsByEntity(
  projectId: string,
  entityType: SpecForgeProjectRecord['entityType'],
): SpecForgeProjectRecord[] {
  return projectRecords
    .filter((r) => r.projectId === projectId && r.entityType === entityType)
    .sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime());
}

// ── Reset (for testing) ─────────────────────────────────────────────────────

export function resetSpecForgeProjectRecordState(): void {
  projectRecords.length = 0;
  seq = 1;
}
