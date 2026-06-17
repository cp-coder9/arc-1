import type { WorkflowRecord, Severity } from '../types/agentOrchestration';
import type { AgentRecommendation } from '../types/architexMasterTypes';

interface RecommendationPolicy {
  policyId: string;
  name: string;
  description: string;
  rules: RecommendationRule[];
  status: 'active' | 'inactive' | 'draft';
  createdAt: string;
  updatedAt?: string;
}

interface RecommendationRule {
  ruleId: string;
  condition: string;
  priority: Severity;
  actionLabel: string;
  requiresApproval: boolean;
}

let seq = 1;
const policies: RecommendationPolicy[] = [];

export function createRecommendationPolicy(params: {
  title: string;
  status: string;
  payload?: Record<string, unknown>;
  blockers?: string[];
  approvalsRequired?: string[];
}): WorkflowRecord {
  return {
    id: `recommendationPolicy-${seq++}`,
    type: 'recommendationPolicy',
    title: params.title,
    status: params.status,
    payload: params.payload ?? {},
    blockers: params.blockers ?? [],
    approvalsRequired: params.approvalsRequired ?? [],
  };
}

export function createPolicy(params: {
  name: string;
  description: string;
  rules: RecommendationRule[];
}): RecommendationPolicy {
  const policy: RecommendationPolicy = {
    policyId: `policy-${seq++}`,
    name: params.name,
    description: params.description,
    rules: params.rules,
    status: 'draft',
    createdAt: new Date().toISOString(),
  };
  policies.push(policy);
  return policy;
}

export function activatePolicy(policyId: string): RecommendationPolicy | undefined {
  const policy = policies.find((p) => p.policyId === policyId);
  if (!policy) return undefined;
  policy.status = 'active';
  policy.updatedAt = new Date().toISOString();
  return policy;
}

export function applyPolicies(
  recommendations: AgentRecommendation[],
  activePolicyIds?: string[],
): AgentRecommendation[] {
  const activePolicies = activePolicyIds
    ? policies.filter((p) => activePolicyIds.includes(p.policyId) && p.status === 'active')
    : policies.filter((p) => p.status === 'active');

  if (activePolicies.length === 0) return recommendations;

  return recommendations.map((rec) => {
    let modified = { ...rec };
    for (const policy of activePolicies) {
      for (const rule of policy.rules) {
        if (rec.priority === rule.priority) {
          modified = {
            ...modified,
            recommendedActionLabel: rule.actionLabel,
            requiresHumanApproval: rule.requiresApproval,
          };
        }
      }
    }
    return modified;
  });
}
