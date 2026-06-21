import type { AdminActor, AuditEvent } from './types';
import { assertPermission, hash, id } from './utils';

export class AuditViewerService {
  createEvent(input: Omit<AuditEvent, 'id' | 'hash' | 'timestamp'>): AuditEvent {
    const timestamp = new Date().toISOString();
    const base = { ...input, timestamp };
    return { id: id('audit'), ...base, hash: hash(JSON.stringify(base)) };
  }
  query(actor: AdminActor, events: AuditEvent[], filter: { tenantId?: string; projectId?: string; userId?: string; objectRef?: string; eventType?: string }): AuditEvent[] {
    assertPermission(['audit_viewer', 'platform_admin', 'super_admin', 'finance_admin'].includes(actor.role), 'Not allowed to view audit');
    return events.filter((e) => (!filter.tenantId || e.tenantId === filter.tenantId) && (!filter.projectId || e.projectId === filter.projectId) && (!filter.userId || e.userId === filter.userId) && (!filter.objectRef || e.objectRef === filter.objectRef) && (!filter.eventType || e.eventType === filter.eventType)).map((e) => actor.canViewSensitiveAudit ? e : this.redact(e));
  }
  redact(e: AuditEvent): AuditEvent {
    const payload = { ...e.payload };
    for (const field of e.redactedFields) { if (field in payload) payload[field] = '[REDACTED]'; }
    return { ...e, payload };
  }
  verifyChain(events: AuditEvent[]): boolean { for (let i = 1; i < events.length; i++) { if (events[i].previousHash !== events[i - 1].hash) return false; } return true; }
}
