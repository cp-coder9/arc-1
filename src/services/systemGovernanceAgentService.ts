import type { WorkflowRecord, Severity } from '../types/agentOrchestration';
import type { ArchitexRole } from '../types/architexMasterTypes';

interface GovernancePolicy {
  policyId: string;
  name: string;
  description: string;
  rules: GovernanceRule[];
  status: 'active' | 'inactive' | 'draft';
  createdAt: string;
  updatedAt?: string;
}

interface GovernanceRule {
  ruleId: string;
  condition: string;
  action: 'allow' | 'deny' | 'flag' | 'require_approval';
  severity: Severity;
  message: string;
}

interface ComplianceCheckResult {
  passed: boolean;
  violations: Array<{
    ruleId: string;
    message: string;
    severity: Severity;
  }>;
}

const policies = new Map<string, GovernancePolicy>();
let seq = 1;

export function createSystemGovernanceAgent(params: {
  title: string;
  status: string;
  payload?: Record<string, unknown>;
  blockers?: string[];
  approvalsRequired?: string[];
}): WorkflowRecord {
  return {
    id: `systemGovernance-${seq++}`,
    type: 'systemGovernance',
    title: params.title,
    status: params.status,
    payload: params.payload ?? {},
    blockers: params.blockers ?? [],
    approvalsRequired: params.approvalsRequired ?? [],
  };
}

export function createGovernancePolicy(params: {
  name: string;
  description: string;
  rules: GovernanceRule[];
}): GovernancePolicy {
  const policy: GovernancePolicy = {
    policyId: `policy-${seq++}`,
    name: params.name,
    description: params.description,
    rules: params.rules,
    status: 'draft',
    createdAt: new Date().toISOString(),
  };
  policies.set(policy.policyId, policy);
  return policy;
}

export function activatePolicy(policyId: string): GovernancePolicy | undefined {
  const policy = policies.get(policyId);
  if (!policy) return undefined;
  policy.status = 'active';
  policy.updatedAt = new Date().toISOString();
  return policy;
}

export function checkRolePermission(role: ArchitexRole, requiredRoles: ArchitexRole[]): ComplianceCheckResult {
  const hasRole = requiredRoles.includes(role);
  return {
    passed: hasRole,
    violations: hasRole ? [] : [{
      ruleId: 'role-permission-check',
      message: `Role "${role}" does not have required permission. Required: ${requiredRoles.join(', ')}`,
      severity: 'high',
    }],
  };
}

export function checkCompliance(
  context: Record<string, unknown>,
  activePolicies: GovernancePolicy[],
): ComplianceCheckResult {
  const violations: ComplianceCheckResult['violations'] = [];

  for (const policy of activePolicies) {
    if (policy.status !== 'active') continue;
    for (const rule of policy.rules) {
      const contextValue = context[rule.condition];
      if (rule.action === 'deny' && contextValue === true) {
        violations.push({ ruleId: rule.ruleId, message: rule.message, severity: rule.severity });
      }
    }
  }

  return { passed: violations.length === 0, violations };
}

export function getActivePolicies(): GovernancePolicy[] {
  return Array.from(policies.values()).filter((p) => p.status === 'active');
}
