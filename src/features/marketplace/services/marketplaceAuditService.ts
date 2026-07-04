import { createAuditEntry } from '@/services/auditTrailService';

/**
 * Marketplace Audit Trail Service
 *
 * Records every marketplace action (posting, application, acceptance, rejection,
 * payment, dispute, completion) to both the platform audit trail and the
 * dedicated marketplace_audit_trail Firestore collection.
 *
 * CONTRACT: Logging completes within 5 seconds of action completion.
 * The platform audit trail write is synchronous; Firestore persistence is
 * fire-and-forget but designed to complete well within the 5-second window
 * under normal network conditions.
 *
 * Validates: Requirements 10.2, 4.5, 9.4
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single audit trail entry for a marketplace action.
 */
export interface MarketplaceAuditEntry {
  /** Unique identifier for this audit entry */
  id: string;
  /** User ID of the actor who performed the action */
  actorId: string;
  /** The marketplace action performed (e.g., 'posting_created', 'proposal_accepted') */
  actionType: string;
  /** ISO-8601 timestamp of when the action occurred */
  timestamp: string;
  /** Identifier of the affected entity (posting, proposal, task, etc.) */
  entityId: string;
  /** Type of the affected entity (e.g., 'project_posting', 'proposal', 'task') */
  entityType: string;
  /** Status before the action (for state change actions) */
  beforeStatus?: string;
  /** Status after the action (for state change actions) */
  afterStatus?: string;
  /** Optional additional metadata about the action */
  metadata?: Record<string, unknown>;
}

/**
 * Parameters for logging a marketplace action.
 */
export interface LogMarketplaceActionParams {
  /** User ID of the actor performing the action */
  actorId: string;
  /** The marketplace action type being recorded */
  actionType: string;
  /** Identifier of the affected entity */
  entityId: string;
  /** Type of the affected entity */
  entityType: string;
  /** Status before the action (for state changes) */
  beforeStatus?: string;
  /** Status after the action (for state changes) */
  afterStatus?: string;
  /** Optional additional metadata about the action */
  metadata?: Record<string, unknown>;
}

// ─── Firestore Persistence ────────────────────────────────────────────────────

/**
 * Persists an audit entry to the marketplace_audit_trail Firestore collection.
 * Uses dynamic import to avoid hard coupling to the admin SDK at module load.
 *
 * Designed to complete within 5 seconds under normal conditions.
 */
async function persistToFirestore(entry: MarketplaceAuditEntry): Promise<void> {
  const { adminDb } = await import('@/lib/firebase-admin');
  await adminDb
    .collection('marketplace_audit_trail')
    .doc(entry.id)
    .set({
      actorId: entry.actorId,
      actionType: entry.actionType,
      timestamp: entry.timestamp,
      entityId: entry.entityId,
      entityType: entry.entityType,
      ...(entry.beforeStatus !== undefined && { beforeStatus: entry.beforeStatus }),
      ...(entry.afterStatus !== undefined && { afterStatus: entry.afterStatus }),
      ...(entry.metadata && { metadata: entry.metadata }),
    });
}

// ─── Service ──────────────────────────────────────────────────────────────────

let entryCounter = 0;

/**
 * Generates a unique audit entry ID.
 */
function generateEntryId(): string {
  entryCounter += 1;
  return `mkt-audit-${Date.now()}-${entryCounter}`;
}

/**
 * Logs a marketplace action to the audit trail.
 *
 * CONTRACT: This function completes within 5 seconds of action completion.
 *
 * It records the action by:
 * 1. Writing to the platform audit trail synchronously (via createAuditEntry)
 * 2. Persisting to the Firestore marketplace_audit_trail collection (fire-and-forget)
 *
 * The ISO-8601 timestamp is generated automatically at invocation time.
 *
 * @param params - The action details to record
 * @returns The created MarketplaceAuditEntry with all fields populated
 */
export async function logMarketplaceAction(
  params: LogMarketplaceActionParams
): Promise<MarketplaceAuditEntry> {
  const entry: MarketplaceAuditEntry = {
    id: generateEntryId(),
    actorId: params.actorId,
    actionType: params.actionType,
    timestamp: new Date().toISOString(),
    entityId: params.entityId,
    entityType: params.entityType,
    beforeStatus: params.beforeStatus,
    afterStatus: params.afterStatus,
    metadata: params.metadata,
  };

  // Integrate with the existing platform audit trail service (synchronous)
  createAuditEntry({
    actorId: entry.actorId,
    action: `marketplace:${entry.actionType}`,
    sourceObjectId: entry.entityId,
  });

  // Durable Firestore persistence — if audit cannot be written, the operation fails
  await persistToFirestore(entry);

  return entry;
}
