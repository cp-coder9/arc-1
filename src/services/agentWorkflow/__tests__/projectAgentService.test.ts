/**
 * Tests for Project Agent Service — Pack 14
 */
import { describe, expect, it } from 'vitest';
import {
  createProjectAgent,
  accumulateProjectRecord,
  transitionProjectPhase,
  generateCrossPhaseInsights,
  generateProjectRecommendations,
} from '../projectAgentService';
import type { ProjectRecord } from '@/types/architexMasterTypes';

function makeRecord(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'rec-1',
    tenantId: 't1',
    projectId: 'p1',
    phase: 'brief_feasibility',
    moduleKey: 'project_passport',
    recordType: 'document',
    title: 'Test Record',
    status: 'active',
    payload: {},
    approval: { status: 'approved', requiredApproverRoles: [] },
    audit: { createdByUserId: 'u1', createdAt: new Date().toISOString() },
    linkedRecordIds: [],
    ...overrides,
  };
}

describe('projectAgentService', () => {
  describe('createProjectAgent', () => {
    it('creates agent for a project with initial phase', () => {
      const agent = createProjectAgent({
        projectId: 'proj-1',
        tenantId: 't1',
        currentPhase: 'brief_feasibility',
      });

      expect(agent.id).toBe('project-agent-proj-1');
      expect(agent.currentPhase).toBe('brief_feasibility');
      expect(agent.phaseHistory).toHaveLength(1);
      expect(agent.phaseHistory[0].phase).toBe('brief_feasibility');
      expect(agent.accumulatedRecords).toBe(0);
      expect(agent.crossPhaseInsights).toEqual([]);
      expect(agent.recommendations).toEqual([]);
    });
  });

  describe('accumulateProjectRecord', () => {
    it('increments record count', () => {
      const agent = createProjectAgent({
        projectId: 'p1', tenantId: 't1', currentPhase: 'brief_feasibility',
      });

      const updated = accumulateProjectRecord(agent, makeRecord());
      expect(updated.accumulatedRecords).toBe(1);
    });

    it('increments risk count for risk_alert records', () => {
      const agent = createProjectAgent({
        projectId: 'p1', tenantId: 't1', currentPhase: 'brief_feasibility',
      });

      const updated = accumulateProjectRecord(agent, makeRecord({ recordType: 'risk_alert' }));
      expect(updated.accumulatedRecords).toBe(1);
      expect(updated.phaseHistory[0].risksIdentified).toBe(1);
    });

    it('accumulates multiple records', () => {
      let agent = createProjectAgent({
        projectId: 'p1', tenantId: 't1', currentPhase: 'brief_feasibility',
      });

      for (let i = 0; i < 5; i++) {
        agent = accumulateProjectRecord(agent, makeRecord());
      }
      agent = accumulateProjectRecord(agent, makeRecord({ recordType: 'risk_alert' }));

      expect(agent.accumulatedRecords).toBe(6);
      expect(agent.phaseHistory[0].risksIdentified).toBe(1);
    });
  });

  describe('transitionProjectPhase', () => {
    it('closes current phase and starts new one', () => {
      const agent = createProjectAgent({
        projectId: 'p1', tenantId: 't1', currentPhase: 'brief_feasibility',
      });

      const updated = transitionProjectPhase(agent, 'design_coordination');

      expect(updated.currentPhase).toBe('design_coordination');
      expect(updated.phaseHistory).toHaveLength(2);
      expect(updated.phaseHistory[0].exitedAt).toBeTruthy();
      expect(updated.phaseHistory[1].phase).toBe('design_coordination');
      expect(updated.phaseHistory[1].enteredAt).toBeTruthy();
      expect(updated.phaseHistory[1].exitedAt).toBeUndefined();
    });

    it('tracks multiple phase transitions', () => {
      let agent = createProjectAgent({
        projectId: 'p1', tenantId: 't1', currentPhase: 'brief_feasibility',
      });

      agent = transitionProjectPhase(agent, 'proposal_appointment');
      agent = transitionProjectPhase(agent, 'design_coordination');

      expect(agent.phaseHistory).toHaveLength(3);
      expect(agent.currentPhase).toBe('design_coordination');
      expect(agent.phaseHistory[0].exitedAt).toBeTruthy();
      expect(agent.phaseHistory[1].exitedAt).toBeTruthy();
    });
  });

  describe('generateCrossPhaseInsights', () => {
    it('returns no insights with < 2 completed phases', () => {
      const agent = createProjectAgent({
        projectId: 'p1', tenantId: 't1', currentPhase: 'brief_feasibility',
      });

      const insights = generateCrossPhaseInsights(agent);
      expect(insights).toEqual([]);
    });

    it('detects high risk accumulation across phases', () => {
      let agent = createProjectAgent({
        projectId: 'p1', tenantId: 't1', currentPhase: 'brief_feasibility',
      });

      // Add many risk records
      for (let i = 0; i < 6; i++) {
        agent = accumulateProjectRecord(agent, makeRecord({ recordType: 'risk_alert' }));
      }

      agent = transitionProjectPhase(agent, 'proposal_appointment');
      for (let i = 0; i < 3; i++) {
        agent = accumulateProjectRecord(agent, makeRecord({ recordType: 'risk_alert' }));
      }

      agent = transitionProjectPhase(agent, 'design_coordination');

      const insights = generateCrossPhaseInsights(agent);
      const riskInsight = insights.find((i) => i.title.includes('risk'));
      expect(riskInsight).toBeDefined();
      expect(riskInsight!.relatedPhases).toContain('brief_feasibility');
      expect(riskInsight!.confidence).toBeGreaterThan(0);
    });

    it('detects rapid phase transitions', () => {
      let agent = createProjectAgent({
        projectId: 'p1', tenantId: 't1', currentPhase: 'brief_feasibility',
      });

      agent = transitionProjectPhase(agent, 'proposal_appointment');
      agent = transitionProjectPhase(agent, 'design_coordination');
      // Now we have at least 2 completed phases with minimal records

      const insights = generateCrossPhaseInsights(agent);
      const quickInsight = insights.find((i) => i.title.includes('Rapid'));
      expect(quickInsight).toBeDefined();
    });
  });

  describe('generateProjectRecommendations', () => {
    it('recommends stronger documentation for phases with few records', () => {
      let agent = createProjectAgent({
        projectId: 'p1', tenantId: 't1', currentPhase: 'brief_feasibility',
      });

      agent = transitionProjectPhase(agent, 'proposal_appointment');
      agent = transitionProjectPhase(agent, 'design_coordination');

      const recs = generateProjectRecommendations(agent);
      const docRec = recs.find((r) => r.title.includes('documentation'));
      expect(docRec).toBeDefined();
      expect(docRec!.priority).toBe('high');
      expect(docRec!.requiresAttention).toBe(true);
    });

    it('returns empty recs for projects with well-documented phases', () => {
      let agent = createProjectAgent({
        projectId: 'p1', tenantId: 't1', currentPhase: 'brief_feasibility',
      });

      // Add sufficient records
      for (let i = 0; i < 3; i++) {
        agent = accumulateProjectRecord(agent, makeRecord());
      }

      agent = transitionProjectPhase(agent, 'proposal_appointment');
      for (let i = 0; i < 3; i++) {
        agent = accumulateProjectRecord(agent, makeRecord());
      }

      const recs = generateProjectRecommendations(agent);
      const docRec = recs.find((r) => r.title.includes('documentation'));
      expect(docRec).toBeUndefined();
    });
  });
});
