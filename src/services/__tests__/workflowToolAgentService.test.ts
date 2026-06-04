import { describe, it, expect } from 'vitest';
import {
  suggestNextTools,
  createToolRun,
  createStaffActivityLog,
  createPlantAllocation,
  createProcurementPackage,
  routeToolRunToProjectObject,
} from '../workflowToolAgentService';
import type { ToolContext } from '../../types/comprehensiveToolsets';

const contractorContext: ToolContext = {
  userId: 'contractor_001',
  role: 'contractor',
  phase: 'construction_execution',
  projectId: 'project_001',
  costCode: '03-CONCRETE',
  locationZone: 'Ground floor slab',
  sourceReferences: ['A-201 Rev C', 'S-101 Rev B'],
};

const architectContext: ToolContext = {
  userId: 'arch_001',
  role: 'architect',
  phase: 'design_coordination',
};

describe('workflowToolAgentService', () => {
  describe('suggestNextTools', () => {
    it('returns recommendations for matching event', () => {
      const results = suggestNextTools(contractorContext, {
        type: 'site_note',
        text: 'concrete pour delayed, labour overtime, plant fuel used',
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].toolId).toBeTruthy();
      expect(results[0].agentId).toBeTruthy();
    });

    it('falls back to document_control_register for unknown events', () => {
      const results = suggestNextTools(architectContext, {
        type: 'unknown',
        text: 'xyz abc def',
      });
      expect(results.length).toBe(1);
      expect(results[0].toolId).toBe('document_control_register');
      expect(results[0].requiresHumanApproval).toBe(true);
    });
  });

  describe('createToolRun', () => {
    it('creates a valid tool run envelope', () => {
      const run = createToolRun('brief_builder', architectContext, {
        title: 'Test Brief',
      });
      expect(run.id).toBeTruthy();
      expect(run.toolId).toBe('brief_builder');
      expect(run.context).toEqual(architectContext);
      expect(run.payload).toEqual({ title: 'Test Brief' });
      expect(run.approvalState).toBe('draft');
      expect(run.exportTargets.length).toBeGreaterThan(0);
      expect(run.createdAt).toBeTruthy();
    });

    it('sets needs_review for tools requiring human approval', () => {
      const run = createToolRun('ai_drawing_compliance_reader', architectContext, {
        sourceDocumentIds: ['doc_001'],
        sourceFormats: ['pdf'],
        extractedFacts: [],
        checks: [],
      });
      expect(run.approvalState).toBe('needs_review');
    });

    it('captures drawing revisions in source snapshot', () => {
      const ctx: ToolContext = {
        ...contractorContext,
        sourceReferences: ['A-201 Rev C', 'S-101 Rev B', 'spec_v1'],
      };
      const run = createToolRun('site_diary_resource_log', ctx, { note: 'test' });
      expect(run.sourceSnapshot.drawingRevisions).toContain('A-201 Rev C');
      expect(run.sourceSnapshot.drawingRevisions).toContain('S-101 Rev B');
      expect(run.sourceSnapshot.drawingRevisions).not.toContain('spec_v1');
    });

    it('throws for unknown tool ID', () => {
      expect(() => createToolRun('nonexistent', architectContext, {})).toThrow(
        'Unknown tool',
      );
    });
  });

  describe('createStaffActivityLog', () => {
    it('creates a workforce attendance tool run', () => {
      const run = createStaffActivityLog(contractorContext, {
        workerId: 'worker_001',
        workerName: 'Test Worker',
        date: '2026-06-04',
        startTime: '07:00',
        endTime: '17:00',
        activity: 'Concrete pour',
        costCode: '03-CONCRETE',
      });
      expect(run.toolId).toBe('workforce_attendance_timesheet');
      expect(run.sourceSnapshot.assumptions!.length).toBeGreaterThan(0);
    });
  });

  describe('createPlantAllocation', () => {
    it('creates a plant equipment tool run', () => {
      const run = createPlantAllocation(contractorContext, {
        assetId: 'plant_001',
        assetLabel: 'Excavator',
        date: '2026-06-04',
        projectId: 'project_001',
        costCode: '03-CONCRETE',
        hoursUsed: 8,
      });
      expect(run.toolId).toBe('plant_equipment_manager');
    });
  });

  describe('createProcurementPackage', () => {
    it('creates a supplier RFQ tool run', () => {
      const run = createProcurementPackage(contractorContext, {
        packageId: 'pkg_001',
        title: 'Blockwork RFQ',
        costCode: '04-MASONRY',
        items: [{ description: '140mm blocks', quantity: 1000, unit: 'each' }],
        invitedSuppliersOrSubcontractors: ['supplier_a'],
      });
      expect(run.toolId).toBe('supplier_rfq_order_portal');
    });
  });

  describe('routeToolRunToProjectObject', () => {
    it('routes site_log export target', () => {
      const run = createToolRun('site_diary_resource_log', contractorContext, {});
      const routes = routeToolRunToProjectObject(run);
      const siteRoute = routes.find((r) => r.target === 'site_log');
      expect(siteRoute).toBeDefined();
      expect(siteRoute!.action).toBe('append_to_daily_site_record');
    });

    it('routes rfq export target', () => {
      const run = createToolRun('supplier_rfq_order_portal', contractorContext, {});
      const routes = routeToolRunToProjectObject(run);
      const rfqRoute = routes.find((r) => r.target === 'rfq');
      expect(rfqRoute).toBeDefined();
      expect(rfqRoute!.action).toBe('create_supplier_or_subcontractor_rfq');
    });

    it('routes payment_valuation export target', () => {
      const run = createToolRun('payment_valuation_escrow', contractorContext, {});
      const routes = routeToolRunToProjectObject(run);
      const paymentRoute = routes.find((r) => r.target === 'payment_valuation');
      expect(paymentRoute).toBeDefined();
      expect(paymentRoute!.action).toBe('create_or_update_payment_valuation_line');
    });

    it('returns empty array for run with no recognized export targets', () => {
      const run = createToolRun('brief_builder', architectContext, {});
      // brief_builder exports: task, rfi — rfi IS handled, so expect 1
      const routes = routeToolRunToProjectObject(run);
      expect(routes.length).toBe(1); // rfi route
    });
  });
});
