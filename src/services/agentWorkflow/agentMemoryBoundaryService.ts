/**
 * Agent Memory Boundary Service — Pack 14: Agent Orchestration Core
 *
 * Enforces memory isolation between tenants, manages retention policies,
 * and ensures data minimization compliance (POPIA).
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export type RetentionPeriod = '7d' | '30d' | '90d' | '1y' | '3y' | 'permanent';

export interface MemoryRecord {
  id: string;
  tenantId: string;
  agentId: string;
  scope: 'user' | 'project' | 'platform';
  scopeId: string; // userId, projectId, or 'platform'
  key: string;
  value: unknown;
  createdAt: string;
  expiresAt?: string;
  accessCount: number;
  lastAccessedAt?: string;
}

export interface MemoryBoundaryPolicy {
  tenantId: string;
  maxRecordsPerAgent: number;
  defaultRetention: RetentionPeriod;
  requireExplicitConsent: boolean;
  allowCrossTenantAccess: boolean; // Should always be false for POPIA
  sensitiveDataCategories: string[];
}

export interface MemoryStore {
  records: Map<string, MemoryRecord[]>;
}

// ─── Retention Duration Mapping ───────────────────────────────────────────

const RETENTION_MS: Record<RetentionPeriod, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
  '3y': 3 * 365 * 24 * 60 * 60 * 1000,
  permanent: Infinity,
};

// ─── Policy Defaults ──────────────────────────────────────────────────────

export function createDefaultMemoryPolicy(
  tenantId: string,
  overrides?: Partial<MemoryBoundaryPolicy>,
): MemoryBoundaryPolicy {
  return {
    tenantId,
    maxRecordsPerAgent: 1000,
    defaultRetention: '90d',
    requireExplicitConsent: true,
    allowCrossTenantAccess: false,
    sensitiveDataCategories: [
      'personal_information',
      'financial_data',
      'property_details',
      'professional_credentials',
      'client_communications',
    ],
    ...overrides,
  };
}

// ─── Memory Store Operations ──────────────────────────────────────────────

let memorySeq = 1;

export function createMemoryRecord(params: {
  tenantId: string;
  agentId: string;
  scope: MemoryRecord['scope'];
  scopeId: string;
  key: string;
  value: unknown;
  retention?: RetentionPeriod;
}): MemoryRecord {
  const now = new Date().toISOString();
  const retentionMs = RETENTION_MS[params.retention ?? '90d'];
  return {
    id: `mem-${params.tenantId}-${memorySeq++}`,
    tenantId: params.tenantId,
    agentId: params.agentId,
    scope: params.scope,
    scopeId: params.scopeId,
    key: params.key,
    value: params.value,
    createdAt: now,
    expiresAt:
      retentionMs === Infinity ? undefined : new Date(Date.now() + retentionMs).toISOString(),
    accessCount: 0,
  };
}

export function accessMemoryRecord(record: MemoryRecord): MemoryRecord {
  return {
    ...record,
    accessCount: record.accessCount + 1,
    lastAccessedAt: new Date().toISOString(),
  };
}

// ─── Tenant Isolation Enforcement ─────────────────────────────────────────

/**
 * Validate that memory access is properly scoped to the tenant.
 * Throws if cross-tenant access is attempted.
 */
export function enforceTenantIsolation(
  record: MemoryRecord,
  requestTenantId: string,
  policy: MemoryBoundaryPolicy,
): void {
  if (record.tenantId !== requestTenantId) {
    if (policy.allowCrossTenantAccess) {
      console.warn(
        `Cross-tenant memory access: ${requestTenantId} → ${record.tenantId}`,
      );
      return;
    }
    throw new Error(
      `Memory boundary violation: tenant "${requestTenantId}" cannot access records from tenant "${record.tenantId}"`,
    );
  }
}

export function validateTenantScope(
  records: MemoryRecord[],
  tenantId: string,
  policy: MemoryBoundaryPolicy,
): MemoryRecord[] {
  return records.filter((r) => {
    try {
      enforceTenantIsolation(r, tenantId, policy);
      return true;
    } catch {
      return false;
    }
  });
}

// ─── Retention Enforcement ────────────────────────────────────────────────

export function isExpired(record: MemoryRecord): boolean {
  if (!record.expiresAt) return false;
  return new Date(record.expiresAt) <= new Date();
}

export function purgeExpiredRecords(store: MemoryStore): number {
  let purged = 0;
  for (const [key, records] of store.records.entries()) {
    const active = records.filter((r) => !isExpired(r));
    purged += records.length - active.length;
    if (active.length === 0) {
      store.records.delete(key);
    } else {
      store.records.set(key, active);
    }
  }
  return purged;
}

// ─── Data Minimization (POPIA) ────────────────────────────────────────────

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /credential/i,
  /id_number/i,
  /passport/i,
  /bank/i,
  /account_number/i,
];

export function isSensitiveData(key: string, policy: MemoryBoundaryPolicy): boolean {
  if (policy.sensitiveDataCategories.some((cat) => key.toLowerCase().includes(cat.toLowerCase()))) {
    return true;
  }
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function redactSensitiveValue(
  key: string,
  value: unknown,
  policy: MemoryBoundaryPolicy,
): unknown {
  if (isSensitiveData(key, policy)) {
    if (typeof value === 'string') {
      return value.slice(0, 3) + '***REDACTED***';
    }
    return '***REDACTED***';
  }
  return value;
}

// ─── Memory Limit Enforcement ─────────────────────────────────────────────

export function enforceMemoryLimit(
  store: MemoryStore,
  agentId: string,
  policy: MemoryBoundaryPolicy,
): void {
  const records = store.records.get(agentId) ?? [];
  if (records.length > policy.maxRecordsPerAgent) {
    // Remove oldest non-accessed records first
    const sorted = [...records].sort((a, b) => {
      const aAccess = a.lastAccessedAt ?? a.createdAt;
      const bAccess = b.lastAccessedAt ?? b.createdAt;
      return aAccess.localeCompare(bAccess);
    });
    store.records.set(
      agentId,
      sorted.slice(records.length - policy.maxRecordsPerAgent),
    );
  }
}

// ─── Consent Verification ─────────────────────────────────────────────────

export function verifyMemoryConsent(
  policy: MemoryBoundaryPolicy,
  userConsented: boolean,
): { allowed: boolean; reason?: string } {
  if (policy.requireExplicitConsent && !userConsented) {
    return {
      allowed: false,
      reason: `Tenant "${policy.tenantId}" requires explicit user consent for agent memory storage (POPIA compliance).`,
    };
  }
  return { allowed: true };
}
