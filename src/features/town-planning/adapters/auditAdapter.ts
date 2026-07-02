/**
 * Audit Adapter — Town Planning Integration
 *
 * Writes immutable audit trail records for all town planning actions.
 * Records are append-only and cannot be modified or deleted.
 */

import type { UserRole } from '@/types';
import { withRetry, type RetryOptions } from './retryUtils';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TownPlanningAuditEvent {
  projectId: string;
  applicationId?: string;
  action: string;
  actorId: string;
  actorRole: UserRole;
  timestamp: string;
  details: Record<string, unknown>;
}

export interface AuditAdapterDeps {
  /** Function that writes an immutable audit record */
  recordFn: (event: TownPlanningAuditEvent) => Promise<void>;
  /** Optional retry configuration */
  retryOptions?: RetryOptions;
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Records an immutable audit event for town planning actions.
 * All significant state changes (transitions, creations, updates)
 * are recorded for traceability and compliance.
 */
export async function recordEvent(
  params: TownPlanningAuditEvent,
  deps: AuditAdapterDeps
): Promise<void> {
  await withRetry(
    () => deps.recordFn(params),
    deps.retryOptions
  );
}
