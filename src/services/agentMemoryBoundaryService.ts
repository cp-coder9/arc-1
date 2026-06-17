import type { WorkflowRecord, Severity } from '../types/agentOrchestration';

interface MemoryScope {
  tenantId: string;
  projectId?: string;
  userId?: string;
}

interface MemoryEntry {
  entryId: string;
  scope: MemoryScope;
  key: string;
  value: unknown;
  createdAt: string;
  expiresAt?: string;
}

interface MemoryBoundaryViolation {
  violationId: string;
  attemptedScope: MemoryScope;
  targetScope: MemoryScope;
  severity: Severity;
  message: string;
  timestamp: string;
}

const memoryStore = new Map<string, MemoryEntry>();
const violations: MemoryBoundaryViolation[] = [];
let seq = 1;

export function createAgentMemoryBoundary(params: {
  title: string;
  status: string;
  payload?: Record<string, unknown>;
  blockers?: string[];
  approvalsRequired?: string[];
}): WorkflowRecord {
  return {
    id: `agentMemoryBoundary-${seq++}`,
    type: 'agentMemoryBoundary',
    title: params.title,
    status: params.status,
    payload: params.payload ?? {},
    blockers: params.blockers ?? [],
    approvalsRequired: params.approvalsRequired ?? [],
  };
}

export function writeMemory(
  scope: MemoryScope,
  key: string,
  value: unknown,
  ttlMs?: number,
): MemoryEntry {
  const entry: MemoryEntry = {
    entryId: `mem-${seq++}`,
    scope,
    key,
    value,
    createdAt: new Date().toISOString(),
    expiresAt: ttlMs ? new Date(Date.now() + ttlMs).toISOString() : undefined,
  };
  memoryStore.set(entry.entryId, entry);
  return entry;
}

export function readMemory(
  accessorScope: MemoryScope,
  targetEntryId: string,
): { entry?: MemoryEntry; violation?: MemoryBoundaryViolation } {
  const entry = memoryStore.get(targetEntryId);
  if (!entry) return {};

  const violation = checkBoundary(accessorScope, entry.scope);
  if (violation) return { violation };

  if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
    memoryStore.delete(targetEntryId);
    return {};
  }

  return { entry };
}

export function queryMemory(scope: MemoryScope, key?: string): MemoryEntry[] {
  return Array.from(memoryStore.values()).filter((entry) => {
    const scopeMatch = entry.scope.tenantId === scope.tenantId &&
      (!scope.projectId || entry.scope.projectId === scope.projectId) &&
      (!scope.userId || entry.scope.userId === scope.userId);
    if (!scopeMatch) return false;
    return !key || entry.key === key;
  });
}

function checkBoundary(accessor: MemoryScope, target: MemoryScope): MemoryBoundaryViolation | undefined {
  if (accessor.tenantId !== target.tenantId) {
    const violation: MemoryBoundaryViolation = {
      violationId: `violation-${seq++}`,
      attemptedScope: accessor,
      targetScope: target,
      severity: 'critical',
      message: `Cross-tenant memory access denied: ${accessor.tenantId} attempted to access ${target.tenantId}`,
      timestamp: new Date().toISOString(),
    };
    violations.push(violation);
    return violation;
  }

  if (target.projectId && accessor.projectId !== target.projectId && !accessor.userId) {
    const violation: MemoryBoundaryViolation = {
      violationId: `violation-${seq++}`,
      attemptedScope: accessor,
      targetScope: target,
      severity: 'high',
      message: `Cross-project memory access denied without user context`,
      timestamp: new Date().toISOString(),
    };
    violations.push(violation);
    return violation;
  }

  return undefined;
}

export function getViolations(): MemoryBoundaryViolation[] {
  return [...violations];
}
