import type { AuditSnapshot, ToolRun } from './types';
import { iso } from './ids';

export class AuditSnapshotService {
  create(run: ToolRun, reason: string): AuditSnapshot {
    const snapshotSource = JSON.stringify({
      tenantId: run.tenantId,
      userId: run.userId,
      toolId: run.toolId,
      toolVersion: run.toolVersion,
      assignment: run.assignment,
      input: run.input,
      output: run.output,
      reason,
    });
    return { hash: fnv1a(snapshotSource), algorithm: 'fnv1a-32-spine', reason, createdAt: iso(), locked: true };
  }
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
