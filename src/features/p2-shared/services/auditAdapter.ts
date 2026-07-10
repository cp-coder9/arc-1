/**
 * P2 Shared — Audit Adapter
 *
 * Creates immutable audit records across all P2 modules. Uses dependency
 * injection for persistence (no direct Firestore imports). Audit trail
 * creation should NEVER break main operations — graceful degradation on
 * persistence failure (log warning and continue).
 *
 * Requirements: 1.4, 7.7, 20.7
 */

import type { AuditEvent } from '../types';
import { AuditEventSchema } from '../schemas';

// ─── Service Result ───────────────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Persistence Callback ─────────────────────────────────────────────────────

/** Injected persistence callback — writes the audit event to the store and returns the ID */
export type PersistAuditEvent = (event: AuditEvent) => Promise<string>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generates a simple unique ID (UUID-like) when one is not provided */
function generateId(): string {
  return `audit_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** Returns ISO timestamp string */
function generateTimestamp(): string {
  return new Date().toISOString();
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateAuditEvent(event: AuditEvent): ServiceResult<AuditEvent> {
  const result = AuditEventSchema.safeParse(event);
  if (!result.success) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Audit event data failed validation',
        details: result.error.flatten(),
      },
    };
  }
  return { success: true, data: result.data as AuditEvent };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Input for creating an audit event. `id` and `timestamp` are optional —
 * they will be generated if not provided.
 */
export type CreateAuditEventInput = Omit<AuditEvent, 'id' | 'timestamp'> & {
  id?: string;
  timestamp?: string;
};

/**
 * Creates an immutable audit event record.
 *
 * - Generates `id` if not provided
 * - Generates `timestamp` if not provided
 * - Validates the assembled event
 * - Persists via injected callback
 * - Never throws — returns a ServiceResult on failure
 *
 * @param input - Audit event data (id and timestamp optional)
 * @param persist - Injected persistence callback
 * @returns ServiceResult containing the created AuditEvent on success
 */
export async function createAuditEvent(
  input: CreateAuditEventInput,
  persist: PersistAuditEvent,
): Promise<ServiceResult<AuditEvent>> {
  // 1. Assemble event with generated fields
  const event: AuditEvent = {
    id: input.id || generateId(),
    timestamp: input.timestamp || generateTimestamp(),
    entityType: input.entityType,
    entityId: input.entityId,
    eventType: input.eventType,
    actorId: input.actorId,
    actorDisplayName: input.actorDisplayName,
    metadata: input.metadata,
  };

  // 2. Validate assembled event
  const validation = validateAuditEvent(event);
  if (!validation.success) {
    return validation;
  }

  // 3. Persist via injected callback — graceful degradation on failure
  try {
    await persist(event);
    return { success: true, data: event };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unknown persistence error';
    console.warn(
      `[auditAdapter] Failed to persist audit event: ${message}`,
    );
    return {
      success: false,
      error: {
        code: 'PERSISTENCE_ERROR',
        message: 'Failed to create audit event — audit trail unavailable',
        details: { originalError: message },
      },
    };
  }
}
