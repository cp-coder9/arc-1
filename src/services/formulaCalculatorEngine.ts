/**
 * Formula Calculator Engine — Pack 4
 *
 * All 6 formula types: percentage_of_cost, sliding_scale, stage_apportioned,
 * time_based, area_unit, hybrid. With input validation and 8 calculator definitions.
 */
import type { ProposalPartyRole } from '../types/proposalBuilder';

export type FormulaType = 'sliding_scale' | 'percentage_of_cost' | 'stage_apportioned' | 'time_based' | 'area_unit' | 'hybrid';

export interface FeeLineItem { label: string; amount: number; category: 'professional_fee' | 'discount' | 'vat' | 'disbursement' | 'statutory_fee' | 'platform_fee' | 'total'; }
export interface CalculatorDefinition { calculatorId: string; label: string; role: ProposalPartyRole; formulaType: FormulaType; sourceName: string; sourceVersion: string; vatRate: number; requiresProfessionalConfirmation: boolean; }
export interface CalculationInput { projectValue?: number; area?: number; unitRate?: number; hours?: number; hourlyRate?: number; stagePercentage?: number; complexityFactor?: number; disbursements?: number; statutoryFees?: number; discountPercent?: number; discountReason?: string; slidingScaleBaseFee?: number; slidingScaleThreshold?: number; slidingScaleAboveRate?: number; hybridComponents?: Array<{ formulaType: FormulaType; weight: number; inputs: CalculationInput }>; }
export interface CalculationResult { calculatorId: string; formulaType: FormulaType; originalProfessionalFee: number; discountAmount: number; professionalFeeAfterDiscount: number; disbursements: number; statutoryFees: number; vatAmount: number; total: number; lines: FeeLineItem[]; warnings: string[]; }

function round(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }

export interface ValidationError { field: string; message: string; }

export function validateCalculatorInputs(formulaType: FormulaType, inputs: CalculationInput): ValidationError[] {
  const errors: ValidationError[] = [];
  const requirePositive = (field: keyof CalculationInput, label: string) => { const val = inputs[field]; if (val !== undefined && (typeof val !== 'number' || val < 0 || !Number.isFinite(val))) errors.push({ field, message: `${label} must be a non-negative number.` }); };
  const requireDefined = (field: keyof CalculationInput, label: string) => { const val = inputs[field]; if (val === undefined || val === null) errors.push({ field, message: `${label} is required.` }); else if (typeof val === 'number' && (!Number.isFinite(val) || val < 0)) errors.push({ field, message: `${label} must be a non-negative number.` }); };
  switch (formulaType) {
    case 'percentage_of_cost': requireDefined('projectValue', 'Project value'); break;
    case 'sliding_scale': requireDefined('projectValue', 'Project value'); break;
    case 'stage_apportioned': requireDefined('projectValue', 'Project value'); if (inputs.stagePercentage !== undefined && (inputs.stagePercentage < 0 || inputs.stagePercentage > 100)) errors.push({ field: 'stagePercentage', message: 'Stage percentage must be between 0 and 100.' }); break;
    case 'time_based': if ((inputs.hours ?? 0) <= 0) errors.push({ field: 'hours', message: 'Hours must be positive.' }); if ((inputs.hourlyRate ?? 0) <= 0) errors.push({ field: 'hourlyRate', message: 'Hourly rate must be positive.' }); break;
    case 'area_unit': if ((inputs.area ?? 0) <= 0) errors.push({ field: 'area', message: 'Area must be positive.' }); if ((inputs.unitRate ?? 0) <= 0) errors.push({ field: 'unitRate', message: 'Unit rate must be positive.' }); break;
    case 'hybrid': if (!inputs.hybridComponents || inputs.hybridComponents.length === 0) errors.push({ field: 'hybridComponents', message: 'At least one hybrid component is required.' }); else { const totalWeight = inputs.hybridComponents.reduce((s, c) => s + c.weight, 0); if (Math.abs(totalWeight - 1) > 0.001) errors.push({ field: 'hybridComponents', message: 'Hybrid component weights must sum to 1.0.' }); inputs.hybridComponents.forEach((comp, i) => { validateCalculatorInputs(comp.formulaType, comp.inputs).forEach((e) => errors.push({ field: `hybridComponents[${i}].${e.field}`, message: e.message })); }); } break;
  }
  if (inputs.discountPercent !== undefined && (inputs.discountPercent < 0 || inputs.discountPercent > 100)) errors.push({ field: 'discountPercent', message: 'Discount percentage must be between 0 and 100.' });
  return errors;
}

export function calculateFee(definition: Pick<CalculatorDefinition, 'calculatorId' | 'formulaType' | 'vatRate'>, inputs: CalculationInput): CalculationResult {
  const complexity = inputs.complexityFactor ?? 1; const warnings: string[] = []; let professionalFee = 0;
  switch (definition.formulaType) {
    case 'percentage_of_cost': professionalFee = (inputs.projectValue ?? 0) * 0.08 * complexity; break;
    case 'sliding_scale': { const pv = inputs.projectValue ?? 0; const bf = inputs.slidingScaleBaseFee ?? 50000; const th = inputs.slidingScaleThreshold ?? 1000000; const ar = inputs.slidingScaleAboveRate ?? 0.045; professionalFee = (bf + Math.max(0, pv - th) * ar) * complexity; break; }
    case 'stage_apportioned': professionalFee = (inputs.projectValue ?? 0) * 0.08 * ((inputs.stagePercentage ?? 100) / 100) * complexity; break;
    case 'time_based': { const h = inputs.hours ?? 0; professionalFee = h * (inputs.hourlyRate ?? 0) * complexity; if (h < 1) warnings.push('Time-based estimate with less than 1 hour may not reflect realistic scope.'); break; }
    case 'area_unit': professionalFee = (inputs.area ?? 0) * (inputs.unitRate ?? 0) * complexity; break;
    case 'hybrid': {
      if (!inputs.hybridComponents?.length) throw new Error('Hybrid formula requires at least one component.');
      const results = inputs.hybridComponents.map((c) => { const r = calculateFee({ calculatorId: definition.calculatorId, formulaType: c.formulaType, vatRate: definition.vatRate }, { ...c.inputs, complexityFactor: (c.inputs.complexityFactor ?? 1) }); return { weight: c.weight, fee: r.originalProfessionalFee, w: r.warnings }; });
      professionalFee = results.reduce((s, r) => s + r.fee * r.weight, 0);
      results.forEach((r) => warnings.push(...r.w));
      warnings.push(`Hybrid fee combines ${inputs.hybridComponents.length} component(s) with weights totaling 1.0.`);
      break;
    }
  }
  const discountPercent = inputs.discountPercent ?? 0;
  if (discountPercent > 0 && !inputs.discountReason) warnings.push('Discount reason is required before proposal issue.');
  const discountAmount = round(professionalFee * (discountPercent / 100));
  const professionalFeeAfterDiscount = round(professionalFee - discountAmount);
  const disbursements = inputs.disbursements ?? 0; const statutory = inputs.statutoryFees ?? 0;
  const vatAmount = round((professionalFeeAfterDiscount + disbursements) * definition.vatRate);
  const total = round(professionalFeeAfterDiscount + disbursements + statutory + vatAmount);
  return { calculatorId: definition.calculatorId, formulaType: definition.formulaType, originalProfessionalFee: round(professionalFee), discountAmount, professionalFeeAfterDiscount, disbursements: round(disbursements), statutoryFees: round(statutory), vatAmount, total, lines: [{ label: 'Original professional fee', amount: round(professionalFee), category: 'professional_fee' }, { label: 'Professional fee discount', amount: round(-discountAmount), category: 'discount' }, { label: 'Professional fee after discount', amount: professionalFeeAfterDiscount, category: 'professional_fee' }, { label: 'Disbursements', amount: round(disbursements), category: 'disbursement' }, { label: 'Statutory / municipal fees', amount: round(statutory), category: 'statutory_fee' }, { label: 'VAT', amount: vatAmount, category: 'vat' }, { label: 'Total', amount: total, category: 'total' }], warnings };
}

export const FORMULA_CALCULATOR_REGISTRY: CalculatorDefinition[] = [
  { calculatorId: 'architect_fee_proposal', label: 'Architect Fee + Proposal Calculator', role: 'architect', formulaType: 'percentage_of_cost', sourceName: 'SACAP Fee Guideline placeholder', sourceVersion: 'admin-versioned-v0.1', vatRate: 0.15, requiresProfessionalConfirmation: true },
  { calculatorId: 'architect_sliding_scale', label: 'Architect Sliding Scale Calculator', role: 'architect', formulaType: 'sliding_scale', sourceName: 'Architex sliding-scale template', sourceVersion: 'admin-versioned-v0.1', vatRate: 0.15, requiresProfessionalConfirmation: true },
  { calculatorId: 'engineer_fee_placeholder', label: 'Engineer Fee Placeholder', role: 'engineer', formulaType: 'percentage_of_cost', sourceName: 'ECSA-style editable placeholder', sourceVersion: 'admin-versioned-v0.1', vatRate: 0.15, requiresProfessionalConfirmation: true },
  { calculatorId: 'qs_fee_placeholder', label: 'QS Sliding Scale Placeholder', role: 'quantity_surveyor', formulaType: 'sliding_scale', sourceName: 'SACQSP-style editable placeholder', sourceVersion: 'admin-versioned-v0.1', vatRate: 0.15, requiresProfessionalConfirmation: true },
  { calculatorId: 'town_planner_application_placeholder', label: 'Town Planner Application Placeholder', role: 'town_planner', formulaType: 'hybrid', sourceName: 'SACPLAN/application-type editable placeholder', sourceVersion: 'admin-versioned-v0.1', vatRate: 0.15, requiresProfessionalConfirmation: true },
  { calculatorId: 'client_soft_cost_estimator', label: 'Client Soft-Cost Estimator', role: 'client', formulaType: 'hybrid', sourceName: 'Architex soft-cost estimator placeholder', sourceVersion: 'admin-versioned-v0.1', vatRate: 0.15, requiresProfessionalConfirmation: false },
  { calculatorId: 'time_based_consultant', label: 'Time-Based Consultant Fee Calculator', role: 'architect', formulaType: 'time_based', sourceName: 'Architex time-based template', sourceVersion: 'admin-versioned-v0.1', vatRate: 0.15, requiresProfessionalConfirmation: true },
  { calculatorId: 'area_unit_estimator', label: 'Area Unit Rate Estimator', role: 'architect', formulaType: 'area_unit', sourceName: 'Architex area-rate template', sourceVersion: 'admin-versioned-v0.1', vatRate: 0.15, requiresProfessionalConfirmation: true },
];

export function getCalculatorById(calculatorId: string): CalculatorDefinition { const calc = FORMULA_CALCULATOR_REGISTRY.find((c) => c.calculatorId === calculatorId); if (!calc) throw new Error(`Formula calculator not found: ${calculatorId}`); return calc; }
export function listCalculatorsForRole(role: ProposalPartyRole): CalculatorDefinition[] { return FORMULA_CALCULATOR_REGISTRY.filter((c) => c.role === role); }
export function listCalculatorsByFormulaType(formulaType: FormulaType): CalculatorDefinition[] { return FORMULA_CALCULATOR_REGISTRY.filter((c) => c.formulaType === formulaType); }
