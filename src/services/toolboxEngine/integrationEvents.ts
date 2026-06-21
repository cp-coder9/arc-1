import { createId, iso } from './ids';
import type { IntegrationEvent, ToolRun } from './types';

export class IntegrationEventBus {
  readonly events: IntegrationEvent[] = [];

  emitForRun(run: ToolRun, message: string): IntegrationEvent[] {
    const types = ['ProjectRecord', 'Inbox', 'AuditTrail'] as const;
    const emitted = types.map((type) => ({
      id: createId(type.toLowerCase()),
      type,
      tenantId: run.tenantId,
      userId: run.userId,
      toolRunId: run.id,
      message,
      payload: { toolId: run.toolId, status: run.status, assignment: run.assignment, auditHash: run.auditSnapshot?.hash },
      createdAt: iso(),
    }));
    this.events.push(...emitted);
    return emitted;
  }
}
