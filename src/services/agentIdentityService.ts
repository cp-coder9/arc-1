import type { WorkflowRecord, AgentIdentity, AgentCapability } from '../types/agentOrchestration';
import type { ArchitexRole } from '../types/architexMasterTypes';

let seq = 1;

export function createAgentIdentity(params: {
  tenantId: string;
  agentType: AgentIdentity['agentType'];
  agentKey: string;
  displayName: string;
  capabilities?: AgentCapability[];
  permissions?: string[];
}): AgentIdentity {
  return {
    agentId: `agent-${params.agentType}-${seq++}`,
    tenantId: params.tenantId,
    agentType: params.agentType,
    agentKey: params.agentKey,
    displayName: params.displayName,
    capabilities: params.capabilities ?? [],
    status: 'active',
    permissions: params.permissions ?? [],
    createdAt: new Date().toISOString(),
  };
}

export function createAgentIdentityRecord(input: {
  title: string;
  status: string;
  payload?: Record<string, unknown>;
  blockers?: string[];
  approvalsRequired?: string[];
}): WorkflowRecord {
  return {
    id: `agentIdentity-${seq++}`,
    type: 'agentIdentity',
    title: input.title,
    status: input.status,
    payload: input.payload ?? {},
    blockers: input.blockers ?? [],
    approvalsRequired: input.approvalsRequired ?? [],
  };
}

export function suspendAgent(identity: AgentIdentity): AgentIdentity {
  return { ...identity, status: 'suspended', updatedAt: new Date().toISOString() };
}

export function activateAgent(identity: AgentIdentity): AgentIdentity {
  return { ...identity, status: 'active', updatedAt: new Date().toISOString() };
}

export function addCapability(identity: AgentIdentity, capability: AgentCapability): AgentIdentity {
  return {
    ...identity,
    capabilities: [...identity.capabilities, capability],
    updatedAt: new Date().toISOString(),
  };
}

export function agentHasCapability(identity: AgentIdentity, capabilityKey: string): boolean {
  return identity.capabilities.some((c) => c.key === capabilityKey);
}

export function agentCanActForRole(identity: AgentIdentity, role: ArchitexRole): boolean {
  return identity.capabilities.some((c) => c.requiredRoles.includes(role));
}
