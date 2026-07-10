/**
 * FM Bridge — Audit Trail Adapter
 *
 * Writes immutable audit records to the building-scoped audit trail.
 * Uses dependency injection for persistence (no direct Firestore imports).
 * Implements graceful degradation — audit trail writes should NEVER break
 * the calling operation. On failure, logs a warning and returns a failure
 * ServiceResult.
 *
 * Requirements: 1.4, 5.5, 7.7
 */

import type { AuditEvent } from '../../p2-shared/types';

// ─── Service Result Type ──────────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Persistence Callback ─────────────────────────────────────────────────────

/** Injected persistence callback — writes audit event to building-scoped collection */
export type PersistBuildingAuditEvent = (
  buildingId: string,
  event: AuditEvent,
) => Promise<string>;

/** Bundled dependencies for the audit trail adapter */
export interface AuditTrailAdapterDeps {
  persistAuditEvent: PersistBuildingAuditEvent;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generates a unique audit event ID */
function generateAuditId(): string {
  return `aud_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

// ─── Input Types ──────────────────────────────────────────────────────────────

/** Input for creating a building-scoped audit event (id and timestamp auto-generated) */
export interface CreateBuildingAuditInput {
  buildingId: string;
  eventType: string;
  actorId: string;
  actorDisplayName: string;
  metadata: Record<string, unknown>;
}

// ─── Pre-Defined Event Types ──────────────────────────────────────────────────

/** Well-known FM Bridge audit event types */
export const FM_AUDIT_EVENTS = {
  // Handover
  HANDOVER_INITIATED: 'fm.handover.initiated',
  BUILDING_PASSPORT_CREATED: 'fm.building_passport.created',

  // Warranty
  WARRANTY_CREATED: 'fm.warranty.created',
  WARRANTY_CLAIM_LODGED: 'fm.warranty.claim_lodged',
  WARRANTY_CLAIM_TRANSITIONED: 'fm.warranty.claim_transitioned',
  WARRANTY_EXPIRED: 'fm.warranty.expired',

  // Asset
  ASSET_CREATED: 'fm.asset.created',
  ASSET_UPDATED: 'fm.asset.updated',
  ASSET_DELETED: 'fm.asset.deleted',
  ASSET_BULK_IMPORTED: 'fm.asset.bulk_imported',

  // DLP
  DLP_CREATED: 'fm.dlp.created',
  DEFECT_LOGGED: 'fm.dlp.defect_logged',
  DEFECT_TRANSITIONED: 'fm.dlp.defect_transitioned',
  DLP_EXPIRED: 'fm.dlp.expired',
  DLP_ALL_RESOLVED: 'fm.dlp.all_defects_resolved',

  // Maintenance
  MAINTENANCE_SCHEDULE_CREATED: 'fm.maintenance.schedule_created',
  MAINTENANCE_COMPLETED: 'fm.maintenance.completed',
  MAINTENANCE_OVERDUE: 'fm.maintenance.overdue',

  // Access
  ACCESS_GRANTED: 'fm.access.granted',
  ACCESS_REVOKED: 'fm.access.revoked',

  // Subscription
  SUBSCRIPTION_ACTIVATED: 'fm.subscription.activated',
  SUBSCRIPTION_UPGRADED: 'fm.subscription.upgraded',
  SUBSCRIPTION_DOWNGRADED: 'fm.subscription.downgraded',
  SUBSCRIPTION_CANCELLED: 'fm.subscription.cancelled',
  SUBSCRIPTION_RENEWED: 'fm.subscription.renewed',
  SUBSCRIPTION_LAPSED: 'fm.subscription.lapsed',
} as const;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Records an audit event in the building-scoped audit trail.
 *
 * Graceful degradation: never throws, logs a warning on persistence failure.
 *
 * @param input - Audit event details (id and timestamp generated automatically)
 * @param deps - Injected dependencies (persistence callback)
 * @returns ServiceResult with the created AuditEvent on success
 */
export async function recordBuildingAuditEvent(
  input: CreateBuildingAuditInput,
  deps: AuditTrailAdapterDeps,
): Promise<ServiceResult<AuditEvent>> {
  // Validate required fields
  if (!input.buildingId || !input.eventType || !input.actorId) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'buildingId, eventType, and actorId are required for audit events',
      },
    };
  }

  // Assemble the full audit event
  const event: AuditEvent = {
    id: generateAuditId(),
    entityType: 'building',
    entityId: input.buildingId,
    eventType: input.eventType,
    actorId: input.actorId,
    actorDisplayName: input.actorDisplayName || 'Unknown',
    metadata: input.metadata || {},
    timestamp: new Date().toISOString(),
  };

  // Persist via injected callback — graceful degradation on failure
  try {
    await deps.persistAuditEvent(input.buildingId, event);
    return { success: true, data: event };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown persistence error';
    console.warn(
      `[auditTrailAdapter] Failed to persist audit event for building "${input.buildingId}": ${message}`,
    );
    return {
      success: false,
      error: {
        code: 'PERSISTENCE_ERROR',
        message: 'Failed to write audit event — audit trail unavailable',
        details: { originalError: message },
      },
    };
  }
}

/**
 * Records multiple audit events in batch. Processes each event independently
 * so that a single failure does not prevent other events from being recorded.
 *
 * @param inputs - Array of audit event inputs
 * @param deps - Injected dependencies
 * @returns Array of ServiceResults, one per input
 */
export async function recordBuildingAuditEventBatch(
  inputs: CreateBuildingAuditInput[],
  deps: AuditTrailAdapterDeps,
): Promise<ServiceResult<AuditEvent>[]> {
  const results: ServiceResult<AuditEvent>[] = [];

  for (const input of inputs) {
    const result = await recordBuildingAuditEvent(input, deps);
    results.push(result);
  }

  return results;
}
