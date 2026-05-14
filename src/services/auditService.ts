import type { UserRole } from '@/types';

export type AuditEventCategory =
  | 'auth'
  | 'access'
  | 'role'
  | 'verification'
  | 'project'
  | 'approval'
  | 'payment'
  | 'escrow'
  | 'contract'
  | 'compliance'
  | 'ai'
  | 'message'
  | 'document'
  | 'dispute'
  | 'admin_override';

export interface AuditActor {
  uid: string;
  role?: UserRole | string;
  email?: string;
  displayName?: string;
  authorizationType?: string;
}

export interface AuditTarget {
  type: string;
  id: string;
  projectId?: string;
}

export interface AuditEventInput {
  category: AuditEventCategory;
  action: string;
  actor: AuditActor;
  target?: AuditTarget;
  reason?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt?: string;
}

export interface AuditEvent extends AuditEventInput {
  id?: string;
  createdAt: string;
  immutable: true;
}

export interface AuditWriter {
  add(collectionPath: string, data: Record<string, unknown>): Promise<{ id: string }>;
}

export function buildAuditEvent(input: AuditEventInput): AuditEvent {
  if (!input.actor?.uid) throw new Error('Audit actor uid is required');
  if (!input.category) throw new Error('Audit category is required');
  if (!input.action?.trim()) throw new Error('Audit action is required');

  return {
    ...input,
    action: input.action.trim(),
    metadata: input.metadata || {},
    createdAt: input.createdAt || new Date().toISOString(),
    immutable: true,
  };
}

export async function writeAuditEvent(writer: AuditWriter, input: AuditEventInput): Promise<AuditEvent> {
  const event = buildAuditEvent(input);
  const ref = await writer.add('audit_logs', event as unknown as Record<string, unknown>);
  return { ...event, id: ref.id };
}

export function assertAuditEventImmutableUpdateAttempt(changedKeys: string[]): void {
  if (changedKeys.length > 0) {
    const error = new Error('Audit logs are immutable and cannot be updated');
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
}
