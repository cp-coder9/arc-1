/**
 * System Governance Agent Service — Pack 14: Agent Orchestration Core
 *
 * Platform-wide governance rules enforcement, compliance monitoring
 * across all tenants, and abuse detection with rate limiting.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface GovernanceRule {
  id: string;
  name: string;
  description: string;
  appliesTo: 'all' | 'tenant' | 'role' | 'agent';
  scopeId?: string; // tenantId, role, or agentId
  ruleType: 'rate_limit' | 'approval_required' | 'audit_required' | 'block';
  threshold: number; // Meaning depends on ruleType
  windowSeconds: number;
  action: 'warn' | 'throttle' | 'block' | 'notify_admin';
  enabled: boolean;
  createdAt: string;
}

export interface ComplianceCheck {
  id: string;
  tenantId: string;
  checkType: string;
  passed: boolean;
  details: string;
  checkedAt: string;
  requiredAction?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface RateLimitRecord {
  key: string; // tenant:user:action or tenant:agent:action
  windowStart: string;
  count: number;
  limit: number;
}

export interface AbuseDetectionResult {
  detected: boolean;
  reason?: string;
  evidence: AbuseEvidence[];
  recommendedAction: 'warn' | 'throttle' | 'block' | 'none';
}

export interface AbuseEvidence {
  type: string;
  description: string;
  occurrences: number;
  windowMinutes: number;
  detectedAt: string;
}

// ─── Governance Rules ─────────────────────────────────────────────────────

export function createGovernanceRule(params: {
  name: string;
  description: string;
  appliesTo: GovernanceRule['appliesTo'];
  scopeId?: string;
  ruleType: GovernanceRule['ruleType'];
  threshold: number;
  windowSeconds: number;
  action: GovernanceRule['action'];
}): GovernanceRule {
  return {
    id: `gov-rule-${params.name.replace(/\s+/g, '_').toLowerCase()}`,
    ...params,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
}

export const DEFAULT_GOVERNANCE_RULES: GovernanceRule[] = [
  createGovernanceRule({
    name: 'API Rate Limit per User',
    description: 'Limits API calls per user to prevent abuse',
    appliesTo: 'all',
    ruleType: 'rate_limit',
    threshold: 1000,
    windowSeconds: 3600,
    action: 'throttle',
  }),
  createGovernanceRule({
    name: 'Agent Action Rate Limit',
    description: 'Limits agent-generated actions to prevent runaway agents',
    appliesTo: 'agent',
    ruleType: 'rate_limit',
    threshold: 500,
    windowSeconds: 3600,
    action: 'block',
  }),
  createGovernanceRule({
    name: 'Critical Approval Required',
    description: 'All critical-priority recommendations require human approval',
    appliesTo: 'all',
    ruleType: 'approval_required',
    threshold: 1,
    windowSeconds: 0,
    action: 'block',
  }),
  createGovernanceRule({
    name: 'Audit Log Retention',
    description: 'All agent decisions must be logged for audit',
    appliesTo: 'all',
    ruleType: 'audit_required',
    threshold: 1,
    windowSeconds: 0,
    action: 'notify_admin',
  }),
];

// ─── Rate Limiting ────────────────────────────────────────────────────────

const rateLimitStore = new Map<string, RateLimitRecord>();

export function checkRateLimit(params: {
  tenantId: string;
  actorId: string;
  action: string;
  limit: number;
  windowSeconds: number;
}): { allowed: boolean; remaining: number; resetAt: string } {
  const key = `${params.tenantId}:${params.actorId}:${params.action}`;
  const now = Date.now();
  const windowMs = params.windowSeconds * 1000;

  const existing = rateLimitStore.get(key);
  if (existing && now - new Date(existing.windowStart).getTime() < windowMs) {
    // Within window
    if (existing.count >= params.limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(
          new Date(existing.windowStart).getTime() + windowMs,
        ).toISOString(),
      };
    }
    const updated: RateLimitRecord = {
      ...existing,
      count: existing.count + 1,
    };
    rateLimitStore.set(key, updated);
    return {
      allowed: true,
      remaining: params.limit - updated.count,
      resetAt: new Date(
        new Date(existing.windowStart).getTime() + windowMs,
      ).toISOString(),
    };
  }

  // New window
  const record: RateLimitRecord = {
    key,
    windowStart: new Date(now).toISOString(),
    count: 1,
    limit: params.limit,
  };
  rateLimitStore.set(key, record);
  return {
    allowed: true,
    remaining: params.limit - 1,
    resetAt: new Date(now + windowMs).toISOString(),
  };
}

// ─── Abuse Detection ──────────────────────────────────────────────────────

export function detectAbuse(
  activityLog: { actorId: string; action: string; timestamp: string }[],
  windowMinutes = 5,
): AbuseDetectionResult {
  const now = Date.now();
  const windowMs = windowMinutes * 60 * 1000;
  const recentActivity = activityLog.filter(
    (a) => now - new Date(a.timestamp).getTime() < windowMs,
  );

  const evidence: AbuseEvidence[] = [];

  // Check for rapid-fire actions
  const actionsByActor = new Map<string, number>();
  for (const entry of recentActivity) {
    actionsByActor.set(entry.actorId, (actionsByActor.get(entry.actorId) ?? 0) + 1);
  }

  for (const [actorId, count] of actionsByActor.entries()) {
    if (count > 50) {
      evidence.push({
        type: 'rapid_fire',
        description: `Actor ${actorId} performed ${count} actions in ${windowMinutes} minutes`,
        occurrences: count,
        windowMinutes,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  // Check for repeated identical actions (possible automation abuse)
  const actionCounts = new Map<string, number>();
  for (const entry of recentActivity) {
    const key = `${entry.actorId}:${entry.action}`;
    actionCounts.set(key, (actionCounts.get(key) ?? 0) + 1);
  }

  for (const [key, count] of actionCounts.entries()) {
    if (count > 30) {
      evidence.push({
        type: 'repeated_action',
        description: `Repeated action pattern: ${key} (${count} times in ${windowMinutes}min)`,
        occurrences: count,
        windowMinutes,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  if (evidence.length > 0) {
    return {
      detected: true,
      reason: `${evidence.length} abuse pattern(s) detected`,
      evidence,
      recommendedAction: evidence.some((e) => e.occurrences > 50)
        ? 'block'
        : 'warn',
    };
  }

  return { detected: false, evidence: [], recommendedAction: 'none' };
}

// ─── Compliance Checks ────────────────────────────────────────────────────

export function runComplianceCheck(params: {
  tenantId: string;
  checkType: string;
  criteria: Record<string, unknown>;
}): ComplianceCheck {
  const checks: Record<string, () => { passed: boolean; details: string; severity: ComplianceCheck['severity'] }> = {
    agent_approval_gate: () => {
      const hasGate = params.criteria.approvalGateEnabled === true;
      return {
        passed: hasGate,
        details: hasGate
          ? 'Agent approval gate is enabled'
          : 'Agent approval gate is DISABLED — critical compliance risk',
        severity: hasGate ? 'low' : 'critical',
      };
    },
    audit_trail_complete: () => {
      const auditCount = (params.criteria.auditRecordCount as number) ?? 0;
      const expectedMin = (params.criteria.expectedMinimum as number) ?? 1;
      const passed = auditCount >= expectedMin;
      return {
        passed,
        details: passed
          ? `Audit trail complete: ${auditCount} records`
          : `Audit trail incomplete: ${auditCount}/${expectedMin} minimum records`,
        severity: passed ? 'low' : 'high',
      };
    },
    tenant_isolation: () => {
      const crossTenantAccesses = (params.criteria.crossTenantAccessCount as number) ?? 0;
      const passed = crossTenantAccesses === 0;
      return {
        passed,
        details: passed
          ? 'No cross-tenant access detected'
          : `${crossTenantAccesses} cross-tenant access(es) detected — POPIA violation risk`,
        severity: passed ? 'low' : 'critical',
      };
    },
  };

  const checkFn = checks[params.checkType];
  const result = checkFn
    ? checkFn()
    : { passed: true, details: `Unknown check type: ${params.checkType}`, severity: 'low' as const };

  return {
    id: `compliance-${params.tenantId}-${params.checkType}-${Date.now()}`,
    tenantId: params.tenantId,
    checkType: params.checkType,
    passed: result.passed,
    details: result.details,
    checkedAt: new Date().toISOString(),
    severity: result.severity,
    requiredAction: result.passed
      ? undefined
      : `Resolve ${params.checkType} compliance issue for tenant ${params.tenantId}`,
  };
}
