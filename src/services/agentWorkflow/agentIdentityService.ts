/**
 * Agent Identity Service — Pack 14: Agent Orchestration Core
 *
 * Manages unique agent identities per tenant, capability registry,
 * and permission boundaries per role.
 */
import type { ArchitexRole } from '@/types/architexMasterTypes';

// ─── Types ─────────────────────────────────────────────────────────────────

export type AgentCapability =
  | 'brief_analysis'
  | 'drawing_review'
  | 'compliance_check'
  | 'tender_analysis'
  | 'construction_monitoring'
  | 'payment_review'
  | 'closeout_verification'
  | 'knowledge_sourcing'
  | 'marketplace_matching'
  | 'risk_detection'
  | 'recommendation_generation'
  | 'message_drafting'
  | 'audit_logging'
  | 'tenant_administration';

export type AgentType = 'user' | 'project' | 'system_governance';

export interface AgentIdentity {
  id: string;
  tenantId: string;
  type: AgentType;
  ownerId: string; // userId, projectId, or 'platform'
  label: string;
  capabilities: AgentCapability[];
  permittedRoles: ArchitexRole[];
  status: 'active' | 'suspended' | 'archived';
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentCapabilityRegistry {
  tenantId: string;
  agents: Map<string, AgentIdentity>;
}

// ─── Capability-to-Role Mapping ───────────────────────────────────────────

const ROLE_CAPABILITIES: Record<ArchitexRole, AgentCapability[]> = {
  client: ['brief_analysis', 'payment_review', 'closeout_verification'],
  developer: ['brief_analysis', 'risk_detection', 'payment_review'],
  architect: [
    'brief_analysis',
    'drawing_review',
    'compliance_check',
    'tender_analysis',
    'construction_monitoring',
    'closeout_verification',
    'knowledge_sourcing',
    'risk_detection',
    'recommendation_generation',
    'message_drafting',
  ],
  engineer: [
    'drawing_review',
    'compliance_check',
    'construction_monitoring',
    'risk_detection',
  ],
  quantity_surveyor: [
    'tender_analysis',
    'payment_review',
    'risk_detection',
    'recommendation_generation',
  ],
  town_planner: ['compliance_check', 'knowledge_sourcing'],
  contractor: ['construction_monitoring', 'closeout_verification'],
  subcontractor: ['construction_monitoring'],
  supplier: ['marketplace_matching'],
  site_manager: ['construction_monitoring', 'closeout_verification'],
  candidate_professional: [
    'drawing_review',
    'knowledge_sourcing',
    'message_drafting',
  ],
  platform_admin: [
    'tenant_administration',
    'audit_logging',
    'risk_detection',
    'recommendation_generation',
  ],
};

// ─── Agent Identity Factory ───────────────────────────────────────────────

let agentSeq = 1;

export function createAgentIdentity(params: {
  tenantId: string;
  type: AgentType;
  ownerId: string;
  label: string;
  capabilities?: AgentCapability[];
  permittedRoles?: ArchitexRole[];
}): AgentIdentity {
  const id = `agent-${params.tenantId}-${params.type}-${agentSeq++}`;
  const now = new Date().toISOString();

  return {
    id,
    tenantId: params.tenantId,
    type: params.type,
    ownerId: params.ownerId,
    label: params.label,
    capabilities: params.capabilities ?? getDefaultCapabilities(params.type),
    permittedRoles: params.permittedRoles ?? getDefaultPermittedRoles(params.type),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Capability Resolution ────────────────────────────────────────────────

export function getCapabilitiesForRole(role: ArchitexRole): AgentCapability[] {
  return ROLE_CAPABILITIES[role] ?? [];
}

export function getDefaultCapabilities(type: AgentType): AgentCapability[] {
  switch (type) {
    case 'user':
      return ['recommendation_generation', 'message_drafting', 'knowledge_sourcing'];
    case 'project':
      return [
        'brief_analysis',
        'risk_detection',
        'recommendation_generation',
        'message_drafting',
        'audit_logging',
      ];
    case 'system_governance':
      return [
        'tenant_administration',
        'audit_logging',
        'risk_detection',
        'compliance_check',
      ];
  }
}

function getDefaultPermittedRoles(type: AgentType): ArchitexRole[] {
  switch (type) {
    case 'user':
      return ['client', 'architect', 'engineer', 'quantity_surveyor', 'contractor'];
    case 'project':
      return ['architect', 'client', 'engineer', 'quantity_surveyor', 'platform_admin'];
    case 'system_governance':
      return ['platform_admin'];
  }
}

// ─── Permission Checks ────────────────────────────────────────────────────

export function canAgentActForRole(
  agent: AgentIdentity,
  role: ArchitexRole,
): boolean {
  return agent.status === 'active' && agent.permittedRoles.includes(role);
}

export function agentHasCapability(
  agent: AgentIdentity,
  capability: AgentCapability,
): boolean {
  return agent.status === 'active' && agent.capabilities.includes(capability);
}

export function agentsWithCapability(
  agents: AgentIdentity[],
  capability: AgentCapability,
): AgentIdentity[] {
  return agents.filter((a) => agentHasCapability(a, capability));
}

// ─── Tenant Isolation ─────────────────────────────────────────────────────

export function validateTenantScope(
  agent: AgentIdentity,
  tenantId: string,
): boolean {
  return agent.tenantId === tenantId;
}

export function filterAgentsByTenant(
  agents: AgentIdentity[],
  tenantId: string,
): AgentIdentity[] {
  return agents.filter((a) => validateTenantScope(a, tenantId));
}
