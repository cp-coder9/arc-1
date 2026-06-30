import type { SpecForgeRole, SpecForgeWorkspace, SpecItem } from '@/types/specforgeTypes';

export const SPEC_ROLE_CAPABILITIES: Record<SpecForgeRole, string[]> = {
  client: ['view_client_items','comment','approve_client_decision'],
  developer: ['view_client_items','comment','approve_client_decision','view_budget_summary'],
  architect: ['view_all','edit_spec','issue_spec','approve_substitution','confirm_responsibility','assign_roles'],
  bep: ['view_all','edit_spec','issue_spec','approve_substitution','confirm_responsibility','assign_roles'],
  freelancer: ['view_assigned','edit_assigned_draft','submit_for_review'],
  engineer: ['view_assigned','edit_assigned_draft','confirm_responsibility','approve_technical_section'],
  quantity_surveyor: ['view_all','review_budget','flag_cost_delta','export_cost_schedule'],
  energy_professional: ['view_assigned','edit_assigned_draft','confirm_responsibility','approve_technical_section'],
  fire_engineer: ['view_assigned','edit_assigned_draft','confirm_responsibility','approve_technical_section'],
  contractor: ['view_issued','request_clarification','request_substitution','price_package','update_procurement_status'],
  subcontractor: ['view_package','submit_shop_drawing','request_substitution','update_installed_status'],
  supplier: ['view_package','quote_item','confirm_lead_time','upload_warranty','suggest_alternative'],
  site_manager: ['view_issued','update_installed_status','upload_site_evidence','flag_site_conflict'],
  admin: ['view_all','edit_templates','govern_library','override_with_audit'],
  platform_admin: ['view_all','edit_templates','govern_library','override_with_audit','manage_permissions'],
};

export function specRoleCan(role: SpecForgeRole, capability: string): boolean {
  return SPEC_ROLE_CAPABILITIES[role]?.includes(capability) ?? false;
}

export function getVisibleSpecItems(workspace: SpecForgeWorkspace, role: SpecForgeRole): SpecItem[] {
  if (specRoleCan(role, 'view_all')) return workspace.items;
  if (specRoleCan(role, 'view_client_items')) return workspace.items.filter(item => item.clientDecision || ['approved','issued'].includes(item.status));
  if (specRoleCan(role, 'view_issued')) return workspace.items.filter(item => ['issued','rfq','ordered','delivered','installed','as_built'].includes(item.status));
  if (specRoleCan(role, 'view_assigned')) return workspace.items.filter(item => [item.ownerRole, item.reviewerRole, item.approverRole].includes(role));
  if (specRoleCan(role, 'view_package')) return workspace.items.filter(item => ['issued','rfq','ordered','delivered','installed'].includes(item.status));
  return [];
}

export function summarizeSpecBudget(items: SpecItem[]) {
  const allowance = items.reduce((sum, item) => sum + item.budgetAllowance, 0);
  const estimate = items.reduce((sum, item) => sum + item.estimatedCost, 0);
  return {
    allowance,
    estimate,
    delta: estimate - allowance,
    overBudgetItems: items.filter(item => item.estimatedCost > item.budgetAllowance).map(item => item.id),
    longLeadItems: items.filter(item => item.leadTimeDays >= 56).map(item => item.id),
    staleItems: items.filter(item => item.supersededBy).map(item => item.id),
  };
}
