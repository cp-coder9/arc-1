import type { ArchitexRole, Priority, ProjectPhase, ProjectRecordType, ApprovalMetadata, AuditMetadata } from './architexMasterTypes';

export type Severity = Priority;

export type AgentRecordStatus =
  | 'draft'
  | 'active'
  | 'ready_with_minor_items'
  | 'blocked'
  | 'requires_review'
  | 'closed'
  | 'issued'
  | 'superseded';

export interface BaseContext {
  tenantId: string;
  projectId: string;
  userId: string;
  actorRole: string;
  now: string;
}

export interface WorkflowRecord {
  id: string;
  type: string;
  title: string;
  status: string;
  payload: Record<string, unknown>;
  blockers: string[];
  approvalsRequired: string[];
}

export interface AgentInboxEvent {
  eventId: string;
  recipientRole: string;
  title: string;
  sourceObjectId: string;
  priority: Severity;
}

export interface AuditRecord {
  auditId: string;
  actorId: string;
  action: string;
  sourceObjectId: string;
  createdAt: string;
}

export interface AgentOutput {
  outputId: string;
  agentKey: string;
  title: string;
  rationale: string;
  sourceObjectId: string;
  severity: Severity;
}

export const ORCHESTRATION_MODULE_KEY = 'agent_orchestration_core';

export interface AgentCapability {
  key: string;
  label: string;
  description: string;
  requiredRoles: ArchitexRole[];
}

export interface AgentIdentity {
  agentId: string;
  tenantId: string;
  agentType: 'system' | 'user' | 'project' | 'governance';
  agentKey: string;
  displayName: string;
  capabilities: AgentCapability[];
  status: 'active' | 'inactive' | 'suspended';
  permissions: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface EventRoute {
  routeId: string;
  sourceType: string;
  targetAgentKey: string;
  priority: Severity;
  condition?: string;
  transform?: string;
}
