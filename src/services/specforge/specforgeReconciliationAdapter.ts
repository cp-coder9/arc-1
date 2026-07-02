import { SpecItem, SpecForgeWorkspace } from '@/types/specforgeTypes';
import { ToolAssignment } from '../orchestration/orchestrationTypes';

/**
 * SpecForge Reconciliation Adapter — Bidirectional flow between tools and the spec spine.
 *
 * This adapter handles mapping tool outputs into SpecForge records.
 * A tool run becomes spec-relevant if its output affects specification clauses,
 * product choices, compliance requirements, or BoQ/BoM items.
 */
export const specforgeReconciliationAdapter = {
  /**
   * Reconcile a tool run output into a SpecForge record.
   * Driven by the 'spec_relevant' capability in StandaloneToolDef.
   */
  async reconcile(assignment: ToolAssignment): Promise<SpecItem | null> {
    // Basic mapping logic — in a real implementation, this would switch on toolId
    // and use specific payload mappers for each tool.

    const { toolId, output } = assignment;

    switch (toolId) {
      case 'fenestration_calc':
        return {
          id: `spec-fen-${Date.now()}`,
          sectionId: 'compliance-n',
          code: 'WIN-001',
          title: 'Fenestration Compliance Approval',
          room: (output.room as string) || 'Unassigned',
          package: 'Glazing',
          budgetAllowance: 0,
          estimatedCost: 0,
          leadTimeDays: 0,
          clientDecision: true,
          ownerRole: 'architect',
          status: 'approved',
          sourceRevision: 1,
          supersededBy: null,
          drawingRefs: [],
          clauseRefs: ['SANS 10400-N'],
        };

      default:
        return null;
    }
  }
};
