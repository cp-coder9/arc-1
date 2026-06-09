/**
 * Tests for Agent Identity Service — Pack 14
 */
import { describe, expect, it } from 'vitest';
import {
  createAgentIdentity,
  getCapabilitiesForRole,
  getDefaultCapabilities,
  canAgentActForRole,
  agentHasCapability,
  agentsWithCapability,
  validateTenantScope,
  filterAgentsByTenant,
} from '../agentIdentityService';
import type { AgentIdentity, AgentCapability } from '../agentIdentityService';

describe('agentIdentityService', () => {
  describe('createAgentIdentity', () => {
    it('creates an active user agent with defaults', () => {
      const agent = createAgentIdentity({
        tenantId: 't1',
        type: 'user',
        ownerId: 'u1',
        label: 'Test User Agent',
      });

      expect(agent.id).toMatch(/^agent-t1-user-/);
      expect(agent.type).toBe('user');
      expect(agent.status).toBe('active');
      expect(agent.capabilities).toContain('recommendation_generation');
      expect(agent.createdAt).toBeTruthy();
      expect(agent.updatedAt).toBeTruthy();
    });

    it('creates a project agent with explicit capabilities', () => {
      const agent = createAgentIdentity({
        tenantId: 't2',
        type: 'project',
        ownerId: 'p1',
        label: 'Test Project Agent',
        capabilities: ['brief_analysis', 'risk_detection'],
      });

      expect(agent.type).toBe('project');
      expect(agent.capabilities).toEqual(['brief_analysis', 'risk_detection']);
    });

    it('creates a system governance agent with restricted roles', () => {
      const agent = createAgentIdentity({
        tenantId: 't3',
        type: 'system_governance',
        ownerId: 'platform',
        label: 'Gov Agent',
      });

      expect(agent.permittedRoles).toEqual(['platform_admin']);
      expect(agent.capabilities).toContain('compliance_check');
    });

    it('assigns unique sequential IDs', () => {
      const a1 = createAgentIdentity({ tenantId: 't', type: 'user', ownerId: 'u1', label: 'A' });
      const a2 = createAgentIdentity({ tenantId: 't', type: 'user', ownerId: 'u2', label: 'B' });
      const a3 = createAgentIdentity({ tenantId: 't', type: 'project', ownerId: 'p1', label: 'C' });

      expect(a1.id).not.toBe(a2.id);
      expect(a2.id).not.toBe(a3.id);
      expect(a1.id).toContain('user');
      expect(a3.id).toContain('project');
    });
  });

  describe('getCapabilitiesForRole', () => {
    it('returns capabilities for architect', () => {
      const caps = getCapabilitiesForRole('architect');
      expect(caps).toContain('drawing_review');
      expect(caps).toContain('compliance_check');
      expect(caps).toContain('tender_analysis');
      expect(caps).toContain('construction_monitoring');
    });

    it('returns limited capabilities for contractor', () => {
      const caps = getCapabilitiesForRole('contractor');
      expect(caps).toEqual(['construction_monitoring', 'closeout_verification']);
    });

    it('returns empty array for unknown role', () => {
      const caps = getCapabilitiesForRole('unknown' as any);
      expect(caps).toEqual([]);
    });
  });

  describe('getDefaultCapabilities', () => {
    it('returns recommendation and messaging for user agents', () => {
      const caps = getDefaultCapabilities('user');
      expect(caps).toContain('recommendation_generation');
      expect(caps).toContain('message_drafting');
    });

    it('returns broad capabilities for project agents', () => {
      const caps = getDefaultCapabilities('project');
      expect(caps).toContain('brief_analysis');
      expect(caps).toContain('risk_detection');
      expect(caps).toContain('audit_logging');
    });
  });

  describe('canAgentActForRole', () => {
    const agent: AgentIdentity = {
      id: 'agent-test',
      tenantId: 't1',
      type: 'user',
      ownerId: 'u1',
      label: 'Test',
      capabilities: [],
      permittedRoles: ['architect', 'client'],
      status: 'active',
      createdAt: '',
      updatedAt: '',
    };

    it('allows active agent for permitted role', () => {
      expect(canAgentActForRole(agent, 'architect')).toBe(true);
    });

    it('denies suspended agent', () => {
      const suspended = { ...agent, status: 'suspended' as const };
      expect(canAgentActForRole(suspended, 'architect')).toBe(false);
    });

    it('denies archived agent', () => {
      const archived = { ...agent, status: 'archived' as const };
      expect(canAgentActForRole(archived, 'architect')).toBe(false);
    });

    it('denies non-permitted role', () => {
      expect(canAgentActForRole(agent, 'platform_admin')).toBe(false);
    });
  });

  describe('agentHasCapability', () => {
    const agent: AgentIdentity = {
      id: 'a1', tenantId: 't1', type: 'user', ownerId: 'u1',
      label: 'Test', capabilities: ['brief_analysis', 'risk_detection'],
      permittedRoles: [], status: 'active', createdAt: '', updatedAt: '',
    };

    it('returns true for existing capability', () => {
      expect(agentHasCapability(agent, 'brief_analysis')).toBe(true);
    });

    it('returns false for missing capability', () => {
      expect(agentHasCapability(agent, 'compliance_check')).toBe(false);
    });

    it('returns false for suspended agent regardless of capability', () => {
      expect(agentHasCapability({ ...agent, status: 'suspended' }, 'brief_analysis')).toBe(false);
    });
  });

  describe('agentsWithCapability', () => {
    it('filters agents by capability', () => {
      const agents: AgentIdentity[] = [
        { id: 'a1', tenantId: 't', type: 'user', ownerId: 'u1', label: 'A', capabilities: ['risk_detection'], permittedRoles: [], status: 'active', createdAt: '', updatedAt: '' },
        { id: 'a2', tenantId: 't', type: 'user', ownerId: 'u2', label: 'B', capabilities: ['brief_analysis'], permittedRoles: [], status: 'active', createdAt: '', updatedAt: '' },
        { id: 'a3', tenantId: 't', type: 'user', ownerId: 'u3', label: 'C', capabilities: ['risk_detection'], permittedRoles: [], status: 'suspended', createdAt: '', updatedAt: '' },
      ];

      const result = agentsWithCapability(agents, 'risk_detection');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a1');
    });
  });

  describe('validateTenantScope', () => {
    it('validates matching tenant', () => {
      const agent: AgentIdentity = {
        id: 'a1', tenantId: 't1', type: 'user', ownerId: 'u1',
        label: 'A', capabilities: [], permittedRoles: [], status: 'active', createdAt: '', updatedAt: '',
      };
      expect(validateTenantScope(agent, 't1')).toBe(true);
      expect(validateTenantScope(agent, 't2')).toBe(false);
    });
  });

  describe('filterAgentsByTenant', () => {
    it('filters agents to a single tenant', () => {
      const agents: AgentIdentity[] = [
        { id: 'a1', tenantId: 't1', type: 'user', ownerId: 'u1', label: 'A', capabilities: [], permittedRoles: [], status: 'active', createdAt: '', updatedAt: '' },
        { id: 'a2', tenantId: 't2', type: 'user', ownerId: 'u2', label: 'B', capabilities: [], permittedRoles: [], status: 'active', createdAt: '', updatedAt: '' },
        { id: 'a3', tenantId: 't1', type: 'project', ownerId: 'p1', label: 'C', capabilities: [], permittedRoles: [], status: 'active', createdAt: '', updatedAt: '' },
      ];

      const filtered = filterAgentsByTenant(agents, 't1');
      expect(filtered).toHaveLength(2);
      expect(filtered.every((a) => a.tenantId === 't1')).toBe(true);
    });
  });
});
