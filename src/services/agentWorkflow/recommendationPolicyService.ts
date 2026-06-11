/**
 * Recommendation Policy Service — Pack 14: Agent Orchestration Core
 *
 * Configurable recommendation policies per tenant, admin override,
 * and A/B testing capability for recommendation quality.
 */

import type { ArchitexRole, Priority } from '@/types/architexMasterTypes';

// ─── Types ─────────────────────────────────────────────────────────────────

export type RecommendationScope = 'user' | 'project' | 'platform';

export interface RecommendationPolicy {
  id: string;
  tenantId: string;
  scope: RecommendationScope;
  // Display rules
  maxRecommendationsPerView: number;
  minPriorityToShow: Priority;
  autoDismissAfterDays: number;
  // Approval rules
  requireHumanApprovalFor: Priority[];
  allowedAutoApplyPriorities: Priority[];
  // Role restrictions
  rolesThatCanApprove: ArchitexRole[];
  rolesThatCanDismiss: ArchitexRole[];
  // Experimentation
  abTestGroup?: string;
  abTestWeight?: number;
  // Override tracking
  overridden: boolean;
  overriddenBy?: string;
  overriddenAt?: string;
  updatedAt: string;
}

export interface ABTestConfig {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  groups: ABTestGroup[];
  startAt: string;
  endAt?: string;
}

export interface ABTestGroup {
  name: string;
  weight: number; // 0-100
  policyOverrides: Partial<RecommendationPolicy>;
}

// ─── Default Policy ───────────────────────────────────────────────────────

export function createDefaultPolicy(
  tenantId: string,
  scope: RecommendationScope,
): RecommendationPolicy {
  return {
    id: `policy-${tenantId}-${scope}`,
    tenantId,
    scope,
    maxRecommendationsPerView: scope === 'user' ? 5 : 10,
    minPriorityToShow: 'low',
    autoDismissAfterDays: 14,
    requireHumanApprovalFor: ['critical', 'high'],
    allowedAutoApplyPriorities: ['low'],
    rolesThatCanApprove: ['architect', 'client', 'platform_admin'],
    rolesThatCanDismiss: ['architect', 'platform_admin'],
    overridden: false,
    updatedAt: new Date().toISOString(),
  };
}

// ─── Policy Evaluation ────────────────────────────────────────────────────

export function shouldShowRecommendation(
  policy: RecommendationPolicy,
  priority: Priority,
): boolean {
  const rank = { low: 1, medium: 2, high: 3, critical: 4 };
  return rank[priority] >= rank[policy.minPriorityToShow];
}

export function needsHumanApproval(
  policy: RecommendationPolicy,
  priority: Priority,
): boolean {
  return policy.requireHumanApprovalFor.includes(priority);
}

export function canAutoApply(
  policy: RecommendationPolicy,
  priority: Priority,
): boolean {
  return policy.allowedAutoApplyPriorities.includes(priority);
}

export function canRoleApprove(
  policy: RecommendationPolicy,
  role: ArchitexRole,
): boolean {
  return policy.rolesThatCanApprove.includes(role);
}

export function canRoleDismiss(
  policy: RecommendationPolicy,
  role: ArchitexRole,
): boolean {
  return policy.rolesThatCanDismiss.includes(role);
}

// ─── Admin Override ───────────────────────────────────────────────────────

export function overridePolicy(
  policy: RecommendationPolicy,
  overrides: Partial<RecommendationPolicy>,
  adminId: string,
): RecommendationPolicy {
  return {
    ...policy,
    ...overrides,
    overridden: true,
    overriddenBy: adminId,
    overriddenAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    id: policy.id, // Keep original ID
    tenantId: policy.tenantId, // Cannot change tenant
  };
}

export function resetPolicyToDefaults(
  policy: RecommendationPolicy,
  adminId: string,
): RecommendationPolicy {
  const defaults = createDefaultPolicy(policy.tenantId, policy.scope);
  return {
    ...defaults,
    id: policy.id,
    overridden: false,
    overriddenBy: adminId,
    overriddenAt: new Date().toISOString(),
  };
}

// ─── A/B Testing ──────────────────────────────────────────────────────────

export function createABTest(config: {
  tenantId: string;
  name: string;
  description: string;
  groups: { name: string; weight: number; overrides: Partial<RecommendationPolicy> }[];
  durationDays?: number;
}): ABTestConfig {
  const totalWeight = config.groups.reduce((sum, g) => sum + g.weight, 0);
  if (Math.abs(totalWeight - 100) > 0.01) {
    throw new Error(
      `AB test group weights must sum to 100 (got ${totalWeight})`,
    );
  }

  return {
    id: `ab-${config.tenantId}-${config.name.replace(/\s+/g, '_').toLowerCase()}`,
    tenantId: config.tenantId,
    name: config.name,
    description: config.description,
    groups: config.groups.map((g) => ({
      name: g.name,
      weight: g.weight,
      policyOverrides: g.overrides,
    })),
    startAt: new Date().toISOString(),
    endAt: config.durationDays
      ? new Date(Date.now() + config.durationDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined,
  };
}

export function assignABTestGroup(
  test: ABTestConfig,
  userId: string,
): ABTestGroup {
  // Deterministic assignment based on user ID hash
  const hash = simpleHash(userId + test.id);
  const bucket = hash % 100;
  let cumulative = 0;
  for (const group of test.groups) {
    cumulative += group.weight;
    if (bucket < cumulative) return group;
  }
  return test.groups[test.groups.length - 1];
}

export function applyABTestPolicy(
  basePolicy: RecommendationPolicy,
  test: ABTestConfig,
  userId: string,
): RecommendationPolicy {
  const group = assignABTestGroup(test, userId);
  return {
    ...basePolicy,
    ...group.policyOverrides,
    abTestGroup: group.name,
    abTestWeight: group.weight,
    updatedAt: new Date().toISOString(),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}
