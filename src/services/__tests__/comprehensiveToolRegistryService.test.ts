import { describe, it, expect } from 'vitest';
import {
  COMPREHENSIVE_TOOL_REGISTRY,
  getToolsForContext,
  getToolById,
  recommendTools,
  phaseToolSummary,
} from '../comprehensiveToolRegistryService';
import type { ToolContext } from '../../types/comprehensiveToolsets';

const architectContext: ToolContext = {
  userId: 'arch_001',
  role: 'architect',
  phase: 'design_coordination',
};

const contractorContext: ToolContext = {
  userId: 'contractor_001',
  role: 'contractor',
  phase: 'tender_procurement',
};

describe('comprehensiveToolRegistryService', () => {
  describe('COMPREHENSIVE_TOOL_REGISTRY', () => {
    it('contains exactly 15 tool definitions', () => {
      expect(COMPREHENSIVE_TOOL_REGISTRY.length).toBe(15);
    });

    it('all tools have unique IDs', () => {
      const ids = COMPREHENSIVE_TOOL_REGISTRY.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all tools have required fields', () => {
      for (const tool of COMPREHENSIVE_TOOL_REGISTRY) {
        expect(tool.id).toBeTruthy();
        expect(tool.label).toBeTruthy();
        expect(tool.category).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.roles.length).toBeGreaterThan(0);
        expect(tool.phases.length).toBeGreaterThan(0);
        expect(tool.exportTargets.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getToolsForContext', () => {
    it('filters tools by role and phase', () => {
      const tools = getToolsForContext(architectContext);
      for (const tool of tools) {
        expect(tool.roles).toContain('architect');
        expect(tool.phases).toContain('design_coordination');
      }
    });

    it('returns contractor tools for tender phase', () => {
      const tools = getToolsForContext(contractorContext);
      const ids = tools.map((t) => t.id);
      expect(ids).toContain('tender_bid_workbench');
    });

    it('returns empty for unmatched context', () => {
      const tools = getToolsForContext({
        userId: 'test',
        role: 'supplier',
        phase: 'lead',
      });
      expect(tools.length).toBe(0);
    });
  });

  describe('getToolById', () => {
    it('returns the correct tool definition', () => {
      const tool = getToolById('brief_builder');
      expect(tool).toBeDefined();
      expect(tool!.id).toBe('brief_builder');
      expect(tool!.label).toBeTruthy();
    });

    it('returns undefined for unknown ID', () => {
      expect(getToolById('nonexistent')).toBeUndefined();
    });
  });

  describe('recommendTools', () => {
    it('returns scored recommendations for relevant keywords', () => {
      const results = recommendTools(architectContext, 'check drawing compliance and sans');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeGreaterThanOrEqual(16);
      expect(results[0].toolId).toBeTruthy();
      expect(results[0].agentId).toBe('tool_router_agent');
    });

    it('boosts drawing/compliance tools for compliance keywords', () => {
      const results = recommendTools(architectContext, 'municipal zoning sans nbr drawing review');
      const topTool = results[0];
      expect(topTool.toolId).toBe('ai_drawing_compliance_reader');
    });

    it('boosts tender tools for bid keywords', () => {
      const results = recommendTools(contractorContext, 'tender bid boq rate takeoff');
      const topIds = results.map((r) => r.toolId);
      expect(topIds).toContain('tender_bid_workbench');
    });

    it('returns empty for no matching keywords', () => {
      const results = recommendTools(
        { userId: 'test', role: 'supplier', phase: 'lead' },
        'xyz abc',
      );
      expect(results.length).toBe(0);
    });

    it('requires human approval flag matches tool definition', () => {
      const results = recommendTools(architectContext, 'payment certificate escrow');
      for (const r of results) {
        const tool = getToolById(r.toolId);
        if (tool?.requiresHumanApproval) {
          expect(r.requiresHumanApproval).toBe(true);
        }
      }
    });
  });

  describe('phaseToolSummary', () => {
    it('returns record with all 10 phases', () => {
      const summary = phaseToolSummary('architect');
      expect(Object.keys(summary).length).toBe(10);
    });

    it('each phase value is an array of strings', () => {
      const summary = phaseToolSummary('contractor');
      for (const phase of Object.values(summary)) {
        expect(Array.isArray(phase)).toBe(true);
      }
    });
  });
});
