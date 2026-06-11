import { getToolById, recommendTools } from './comprehensiveToolRegistryService';
import type {
  PlantAllocationPayload,
  ProcurementPackagePayload,
  StaffActivityLogPayload,
  ToolContext,
  ToolRecommendation,
  ToolRunEnvelope,
} from '../types/comprehensiveToolsets';

function id(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function suggestNextTools(
  context: ToolContext,
  event: { type: string; text: string },
): ToolRecommendation[] {
  const recommendations = recommendTools(context, `${event.type} ${event.text}`);
  if (recommendations.length) return recommendations;
  return [
    {
      id: id('fallback'),
      toolId: 'document_control_register',
      score: 1,
      agentId: 'workflow_orchestrator_agent',
      reason: 'No high-confidence tool matched; default to recording the issue/action against the project record.',
      nextAction: 'Create a project task or RFI and ask the responsible user to classify the action.',
      exportTargets: ['task', 'rfi'],
      requiresHumanApproval: true,
    },
  ];
}

export function createToolRun<TPayload extends Record<string, unknown>>(
  toolId: string,
  context: ToolContext,
  payload: TPayload,
  assumptions: string[] = [],
): ToolRunEnvelope<TPayload> {
  const tool = getToolById(toolId);
  if (!tool) throw new Error(`Unknown tool: ${toolId}`);
  return {
    id: id('toolrun'),
    toolId,
    context,
    payload,
    sourceSnapshot: {
      drawingRevisions: context.sourceReferences?.filter((item) =>
        /rev|drawing|\b[A-Z]-\d+/i.test(item),
      ),
      assumptions,
      benchmarkPattern: tool.benchmarkInspiration?.join('; '),
    },
    approvalState: tool.requiresHumanApproval ? 'needs_review' : 'draft',
    exportTargets: tool.exportTargets,
    createdAt: new Date().toISOString(),
  };
}

export function createStaffActivityLog(
  context: ToolContext,
  payload: StaffActivityLogPayload,
): ToolRunEnvelope<StaffActivityLogPayload> {
  return createToolRun('workforce_attendance_timesheet', context, payload as unknown as Record<string, unknown>, [
    'Attendance/activity data should be verified by site manager before payroll export or payment claim use.',
    'Payroll compliance should be handled through an approved payroll system/export rather than assumed by Architex MVP.',
  ]) as unknown as ToolRunEnvelope<StaffActivityLogPayload>;
}

export function createPlantAllocation(
  context: ToolContext,
  payload: PlantAllocationPayload,
): ToolRunEnvelope<PlantAllocationPayload> {
  return createToolRun('plant_equipment_manager', context, payload as unknown as Record<string, unknown>, [
    'Internal hire/fuel rates must be agreed in contract or company policy before using values exported by this tool.',
    'Plant utilisation data should be verified by project/plant manager before payment or claims use.',
  ]) as unknown as ToolRunEnvelope<PlantAllocationPayload>;
}

export function createProcurementPackage(
  context: ToolContext,
  payload: ProcurementPackagePayload,
): ToolRunEnvelope<ProcurementPackagePayload> {
  return createToolRun('supplier_rfq_order_portal', context, payload as unknown as Record<string, unknown>, [
    'Supplier quotes/orders should be confirmed in writing before commitment.',
    'Procurement values should align with budget/cost-plan approvals.',
  ]) as unknown as ToolRunEnvelope<ProcurementPackagePayload>;
}

export function routeToolRunToProjectObject(
  run: ToolRunEnvelope,
): Array<{ target: string; action: string; reason: string }> {
  const routes: Array<{ target: string; action: string; reason: string }> = [];
  for (const target of run.exportTargets) {
    if (target === 'site_log')
      routes.push({ target, action: 'append_to_daily_site_record', reason: 'Creates contemporaneous site evidence.' });
    if (target === 'rfq')
      routes.push({ target, action: 'create_supplier_or_subcontractor_rfq', reason: 'Turns quantities/scope into comparable quotes.' });
    if (target === 'payment_valuation')
      routes.push({ target, action: 'create_or_update_payment_valuation_line', reason: 'Links measured work/resources to commercial claim.' });
    if (target === 'rfi')
      routes.push({ target, action: 'draft_rfi_or_consultant_query', reason: 'Human clarification/sign-off required.' });
    if (target === 'invoice')
      routes.push({ target, action: 'prepare_invoice_or_invoice_match', reason: 'Connects commercial record to financial workflow.' });
    if (target === 'escrow_release')
      routes.push({ target, action: 'prepare_escrow_release_review', reason: 'Payment release needs approval and ledger reconciliation.' });
  }
  return routes;
}
