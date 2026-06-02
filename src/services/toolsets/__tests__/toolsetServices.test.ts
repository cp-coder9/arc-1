import { describe, expect, it } from '@jest/globals';
import { phaseToolSummary, recommendTools } from '../comprehensiveToolRegistryService';
import { routeToolRunToProjectObject, createPlantAllocation } from '../workflowToolAgentService';
import { listCalculatorsForContext, runCalculator } from '../toolboxCalculatorService';
import type { ToolContext } from '@/types/comprehensiveToolsets';
import type { ToolboxContext } from '@/types/toolboxCalculators';

const contractorToolContext: ToolContext = {
  userId: 'user-1',
  role: 'contractor',
  phase: 'construction_execution',
  projectId: 'project-1',
  sourceReferences: ['drawing A-101 rev 2'],
};

const contractorCalculatorContext: ToolboxContext = {
  userId: 'user-1',
  role: 'contractor',
  phase: 'construction_execution',
  projectId: 'project-1',
  sourceReferences: ['drawing A-101 rev 2'],
};

describe('Amy/Greg toolset services', () => {
  it('recommends role and phase appropriate workflow tools with human approval metadata', () => {
    const recommendations = recommendTools(contractorToolContext, 'site diary plant labour payment valuation rfi');

    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations[0].agentId).toBe('tool_router_agent');
    expect(recommendations.some((item) => item.toolId === 'site_diary_resource_log')).toBe(true);
    expect(recommendations.every((item) => Array.isArray(item.exportTargets))).toBe(true);
  });

  it('summarises available tools by workflow phase for a role', () => {
    const summary = phaseToolSummary('architect');

    expect(summary.design_coordination).toContain('document_control_register');
    expect(summary.tender_procurement).toContain('tender_bid_workbench');
    expect(summary.closeout).toContain('closeout_handover_pack');
  });

  it('runs calculator definitions with review guardrails and export targets', () => {
    const calculators = listCalculatorsForContext(contractorCalculatorContext);

    expect(calculators.map((calculator) => calculator.id)).toContain('concrete_order');

    const concreteRun = runCalculator('concrete_order', contractorCalculatorContext, {
      elements: [{ label: 'Pad footing', lengthM: 2, widthM: 2, depthM: 0.35, count: 3 }],
      wastePercent: 5,
      truckCapacityM3: 6,
    });

    expect(concreteRun.riskStatus).toBe('info');
    expect(concreteRun.results).toMatchObject({ netVolumeM3: 4.2, truckLoads: 1 });
    expect(concreteRun.referenceNotes.length).toBeGreaterThan(0);
    expect(concreteRun.exportTargets).toContain('supplier_rfq');
  });

  it('creates versioned ToolRun envelopes and routes them to project objects', () => {
    const run = createPlantAllocation(contractorToolContext, {
      assetId: 'excavator-1',
      assetLabel: 'Excavator',
      date: '2026-06-02',
      projectId: 'project-1',
      costCode: 'EARTHWORKS',
      hoursUsed: 4,
    });

    expect(run.approvalState).toBe('draft');
    expect(run.sourceSnapshot.drawingRevisions).toEqual(['drawing A-101 rev 2']);
    expect(run.sourceSnapshot.assumptions?.length).toBeGreaterThan(0);

    const routes = routeToolRunToProjectObject(run);
    expect(routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: 'site_log' }),
        expect.objectContaining({ target: 'payment_valuation' }),
      ]),
    );
  });
});
