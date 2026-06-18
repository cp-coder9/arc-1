// ─── Professional Toolboxes — Registry ──────────────────────────────────────
// Defines all available toolboxes and calculators as static registries.

import type { CalculatorDefinition, ToolboxDefinition } from './toolboxTypes';

export const toolboxes: ToolboxDefinition[] = [
  {
    toolboxId: 'architect_toolbox',
    label: 'Architect Toolbox',
    roles: ['architect', 'candidate_professional', 'admin'],
    phases: ['feasibility', 'appointment', 'concept_design', 'design_development', 'municipal_submission'],
    toolIds: ['architect_fee_proposal'],
  },
  {
    toolboxId: 'engineering_toolbox',
    label: 'Engineer Toolbox',
    roles: ['engineer', 'admin'],
    phases: ['feasibility', 'appointment', 'design_development', 'municipal_submission', 'construction_execution'],
    toolIds: ['engineer_fee_proposal'],
  },
  {
    toolboxId: 'qs_toolbox',
    label: 'Quantity Surveyor Toolbox',
    roles: ['quantity_surveyor', 'admin'],
    phases: ['feasibility', 'appointment', 'tender_procurement', 'construction_execution'],
    toolIds: ['qs_fee_proposal'],
  },
  {
    toolboxId: 'town_planner_toolbox',
    label: 'Town Planner Toolbox',
    roles: ['town_planner', 'admin'],
    phases: ['feasibility', 'appointment', 'municipal_submission'],
    toolIds: ['town_planner_fee_proposal'],
  },
  {
    toolboxId: 'client_soft_cost_toolbox',
    label: 'Client / Developer Soft-Cost Estimator',
    roles: ['client_developer', 'admin'],
    phases: ['feasibility', 'appointment'],
    toolIds: ['client_soft_cost_estimator'],
  },
];

export const calculators: CalculatorDefinition[] = [
  {
    calculatorId: 'architect_fee_proposal',
    label: 'Architect Fee + Proposal Calculator',
    role: 'architect',
    formulaType: 'percentage_of_cost',
    sourceName: 'SACAP/FeeDesk-derived editable guideline placeholder',
    sourceVersion: 'admin-versioned-v0.1',
    vatRate: 0.15,
    requiresProfessionalConfirmation: true,
  },
  {
    calculatorId: 'engineer_fee_proposal',
    label: 'Engineer Fee Calculator',
    role: 'engineer',
    formulaType: 'percentage_of_cost',
    sourceName: 'ECSA Fee Guideline v2026.1',
    sourceVersion: 'admin-versioned-v0.1',
    vatRate: 0.15,
    requiresProfessionalConfirmation: true,
  },
  {
    calculatorId: 'qs_fee_proposal',
    label: 'QS Sliding Scale Calculator',
    role: 'quantity_surveyor',
    formulaType: 'sliding_scale',
    sourceName: 'SACQSP Fee Guideline v2026.1',
    sourceVersion: 'admin-versioned-v0.1',
    vatRate: 0.15,
    requiresProfessionalConfirmation: true,
  },
  {
    calculatorId: 'town_planner_fee_proposal',
    label: 'Town Planner Fee Calculator',
    role: 'town_planner',
    formulaType: 'hybrid',
    sourceName: 'SACPLAN Fee Guideline v2026.1',
    sourceVersion: 'admin-versioned-v0.1',
    vatRate: 0.15,
    requiresProfessionalConfirmation: true,
  },
  {
    calculatorId: 'client_soft_cost_estimator',
    label: 'Client Soft-Cost Estimator',
    role: 'client_developer',
    formulaType: 'hybrid',
    sourceName: 'Architex Soft-Cost Estimator v2026.1',
    sourceVersion: 'admin-versioned-v0.1',
    vatRate: 0.15,
    requiresProfessionalConfirmation: false,
  },
];

export function calculatorById(id: string): CalculatorDefinition {
  const calc = calculators.find((c) => c.calculatorId === id);
  if (!calc) throw new Error(`Calculator not found: ${id}`);
  return calc;
}

export function toolboxesForRole(role: string): ToolboxDefinition[] {
  return toolboxes.filter((tb) => tb.roles.includes(role as ToolboxDefinition['roles'][number]));
}

export function toolboxesForPhase(phase: string): ToolboxDefinition[] {
  return toolboxes.filter((tb) => tb.phases.includes(phase as ToolboxDefinition['phases'][number]));
}

export function calculatorsForRole(role: string): CalculatorDefinition[] {
  return calculators.filter((c) => c.role === role);
}
