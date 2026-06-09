/**
 * Audit Trail Service
 *
 * Creates immutable audit records for analytics operations.
 * Each record captures who did what and when.
 */

import type { BaseContext } from '../types/analyticsReporting';

let seq = 1;
const auditRecords: AuditRecord[] = [];

export interface AuditRecord {
  auditId: string;
  actorId: string;
  action: string;
  sourceObjectId: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
  immutable: true;
}

/**
 * Create an audit trail entry.
 */
export function audit(
  ctx: BaseContext,
  action: string,
  sourceObjectId: string,
  metadata?: Record<string, unknown>,
): AuditRecord {
  const record: AuditRecord = {
    auditId: `audit-${seq++}`,
    actorId: ctx.userId,
    action,
    sourceObjectId,
    createdAt: ctx.now || new Date().toISOString(),
    metadata,
    immutable: true,
  };

  auditRecords.push(record);
  return record;
}

/**
 * Get audit records, optionally filtered.
 */
export function getAuditRecords(options?: {
  actorId?: string;
  action?: string;
  sourceObjectId?: string;
  since?: string;
  limit?: number;
}): AuditRecord[] {
  let filtered = [...auditRecords];

  if (options?.actorId) {
    filtered = filtered.filter((r) => r.actorId === options.actorId);
  }
  if (options?.action) {
    filtered = filtered.filter((r) => r.action.includes(options.action!));
  }
  if (options?.sourceObjectId) {
    filtered = filtered.filter((r) => r.sourceObjectId === options.sourceObjectId);
  }
  if (options?.since) {
    const sinceDate = new Date(options.since).getTime();
    filtered = filtered.filter((r) => new Date(r.createdAt).getTime() >= sinceDate);
  }
  if (options?.limit) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Assert that audit records are immutable — changing them is prohibited.
 */
export function assertAuditImmutableUpdateAttempt(changedKeys: string[]): void {
  if (changedKeys.length > 0) {
    const error = new Error('Audit records are immutable and cannot be updated');
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
}

/**
 * Export all audit records as a JSON-serializable array.
 */
export function exportAuditRecords(options?: {
  since?: string;
  actorId?: string;
}): AuditRecord[] {
  return getAuditRecords(options);
}

// ── Reset (for testing) ─────────────────────────────────────────────────────────

export function resetAuditState(): void {
  auditRecords.length = 0;
  seq = 1;
}
