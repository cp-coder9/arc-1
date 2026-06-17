import type { WorkflowRecord, AgentIdentity, BaseContext } from '../types/agentOrchestration';
import { createAgentIdentity } from './agentIdentityService';

interface UserAgentConfig {
  userId: string;
  tenantId: string;
  displayName: string;
  preferences?: Record<string, unknown>;
  learningData?: Record<string, unknown>;
}

interface UserAgentInstance {
  agent: AgentIdentity;
  config: UserAgentConfig;
  lastActiveAt: string;
  createdAt: string;
}

const instances = new Map<string, UserAgentInstance>();
let seq = 1;

export function createUserAgent(params: {
  title: string;
  status: string;
  payload?: Record<string, unknown>;
  blockers?: string[];
  approvalsRequired?: string[];
}): WorkflowRecord {
  return {
    id: `userAgent-${seq++}`,
    type: 'userAgent',
    title: params.title,
    status: params.status,
    payload: params.payload ?? {},
    blockers: params.blockers ?? [],
    approvalsRequired: params.approvalsRequired ?? [],
  };
}

export function createUserAgentInstance(config: UserAgentConfig): UserAgentInstance {
  const agent = createAgentIdentity({
    tenantId: config.tenantId,
    agentType: 'user',
    agentKey: `user-agent-${config.userId}`,
    displayName: config.displayName,
    capabilities: [
      { key: 'personalized_recommendations', label: 'Personalized Recommendations', description: 'Generate recommendations based on user preferences and history', requiredRoles: ['architect', 'client', 'contractor'] },
      { key: 'preference_learning', label: 'Preference Learning', description: 'Learn user preferences over time', requiredRoles: ['architect', 'client'] },
    ],
    permissions: [`user:${config.userId}:read`, `user:${config.userId}:write`],
  });

  const instance: UserAgentInstance = {
    agent,
    config,
    lastActiveAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  instances.set(config.userId, instance);
  return instance;
}

export function getUserAgent(userId: string): UserAgentInstance | undefined {
  return instances.get(userId);
}

export function updateUserAgentPreferences(userId: string, preferences: Record<string, unknown>): UserAgentInstance | undefined {
  const instance = instances.get(userId);
  if (!instance) return undefined;
  instance.config.preferences = { ...instance.config.preferences, ...preferences };
  instance.lastActiveAt = new Date().toISOString();
  return instance;
}

export function recordUserInteraction(userId: string, interaction: Record<string, unknown>): void {
  const instance = instances.get(userId);
  if (!instance) return;
  instance.config.learningData = {
    ...instance.config.learningData,
    lastInteraction: interaction,
    interactionCount: ((instance.config.learningData?.interactionCount as number) ?? 0) + 1,
  };
  instance.lastActiveAt = new Date().toISOString();
}
