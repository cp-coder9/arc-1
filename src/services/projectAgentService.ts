import type { WorkflowRecord, AgentIdentity, Severity } from '../types/agentOrchestration';
import { createAgentIdentity } from './agentIdentityService';

interface ProjectAgentConfig {
  projectId: string;
  tenantId: string;
  projectName: string;
}

interface ProjectBlocker {
  title: string;
  severity: Severity;
  detectedAt: string;
  resolvedAt?: string;
}

interface ProjectAgentInstance {
  agent: AgentIdentity;
  config: ProjectAgentConfig;
  context: Record<string, unknown>;
  blockers: ProjectBlocker[];
  phaseContinuity: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const instances = new Map<string, ProjectAgentInstance>();
let seq = 1;

export function createProjectAgent(params: {
  title: string;
  status: string;
  payload?: Record<string, unknown>;
  blockers?: string[];
  approvalsRequired?: string[];
}): WorkflowRecord {
  return {
    id: `projectAgent-${seq++}`,
    type: 'projectAgent',
    title: params.title,
    status: params.status,
    payload: params.payload ?? {},
    blockers: params.blockers ?? [],
    approvalsRequired: params.approvalsRequired ?? [],
  };
}

export function createProjectAgentInstance(config: ProjectAgentConfig): ProjectAgentInstance {
  const agent = createAgentIdentity({
    tenantId: config.tenantId,
    agentType: 'project',
    agentKey: `project-agent-${config.projectId}`,
    displayName: `Project Agent: ${config.projectName}`,
    capabilities: [
      { key: 'phase_continuity', label: 'Phase Continuity', description: 'Maintain context across project lifecycle phases', requiredRoles: ['architect', 'platform_admin', 'site_manager'] },
      { key: 'project_accumulation', label: 'Project Context Accumulation', description: 'Accumulate and surface project-wide context', requiredRoles: ['architect', 'platform_admin', 'client'] },
      { key: 'blocker_detection', label: 'Blocker Detection', description: 'Detect and track project blockers', requiredRoles: ['architect', 'platform_admin', 'site_manager'] },
    ],
    permissions: [`project:${config.projectId}:read`, `project:${config.projectId}:write`],
  });

  const instance: ProjectAgentInstance = {
    agent,
    config,
    context: {},
    blockers: [],
    phaseContinuity: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  instances.set(config.projectId, instance);
  return instance;
}

export function getProjectAgent(projectId: string): ProjectAgentInstance | undefined {
  return instances.get(projectId);
}

export function addProjectBlocker(projectId: string, blocker: Omit<ProjectBlocker, 'detectedAt'>): ProjectAgentInstance | undefined {
  const instance = instances.get(projectId);
  if (!instance) return undefined;
  instance.blockers.push({ ...blocker, detectedAt: new Date().toISOString() });
  instance.updatedAt = new Date().toISOString();
  return instance;
}

export function resolveProjectBlocker(projectId: string, blockerTitle: string): ProjectAgentInstance | undefined {
  const instance = instances.get(projectId);
  if (!instance) return undefined;
  const blocker = instance.blockers.find((b) => b.title === blockerTitle && !b.resolvedAt);
  if (blocker) blocker.resolvedAt = new Date().toISOString();
  instance.updatedAt = new Date().toISOString();
  return instance;
}

export function updateProjectContext(projectId: string, contextDelta: Record<string, unknown>): ProjectAgentInstance | undefined {
  const instance = instances.get(projectId);
  if (!instance) return undefined;
  instance.context = { ...instance.context, ...contextDelta };
  instance.updatedAt = new Date().toISOString();
  return instance;
}
