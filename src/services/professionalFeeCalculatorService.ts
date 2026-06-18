/**
 * Professional Fee Calculator Engine
 *
 * Implements all 6 formula types for professional fee calculation:
 *   - percentage_of_cost
 *   - sliding_scale
 *   - stage_apportioned
 *   - time_based
 *   - area_unit
 *   - hybrid
 *
 * Designed as a general-purpose professional fee engine that complements
 * the architect-specific feeEstimatorService and bridges into the proposal
 * builder via feeProposalBridge.
 */

export type FormulaType =
  | 'percentage_of_cost'
  | 'sliding_scale'
  | 'stage_apportioned'
  | 'time_based'
  | 'area_unit'
  | 'hybrid';

export type ArchitexProfessionalRole =
  | 'architect'
  | 'engineer'
  | 'quantity_surveyor'
  | 'town_planner'
  | 'client_developer'
  | 'land_surveyor'
  | 'construction_project_manager'
  | 'landscape_architect'
  | 'interior_designer';

export interface CalculatorDefinition {
  calculatorId: string;
  label: string;
  role: ArchitexProfessionalRole;
  formulaType: FormulaType;
  /** Source reference (e.g. "SACAP/FeeDesk v0.1") */
  sourceName: string;
  sourceVersion: string;
  /** VAT rate as decimal (e.g. 0.15 for 15%) */
  vatRate: number;
  requiresProfessionalConfirmation: boolean;
  /** For hybrid calculators: sub-calculator IDs and their weights */
  hybridComponents?: Array<{ calculatorId: string; weight: number }>;
  /** For percentage_of_cost: default percentage */
  defaultPercentage?: number;
  /** For sliding_scale: base fee and rate per additional unit */
  slidingScaleBase?: { threshold: number; baseFee: number; rateAboveThreshold: number };
  /** For time_based: default hourly rate */
  defaultHourlyRate?: number;
  /** For area_unit: default unit rate per sqm */
  defaultUnitRate?: number;
}

export interface CalculationInput {
  /** Value of works / project value (Rands) */
  projectValue: number;
  /** Stage percentage for stage_apportioned (0-100) */
  stagePercentage?: number;
  /** Labour hours for time_based */
  hours?: number;
  /** Hourly rate for time_based (overrides calculator default) */
  hourlyRate?: number;
  /** Area in sqm for area_unit */
  area?: number;
  /** Unit rate per sqm for area_unit (overrides calculator default) */
  unitRate?: number;
  /** Complexity multiplier (1 = default, >1 = more complex) */
  complexityFactor?: number;
  /** Disbursements (not subject to professional discount by default) */
  disbursements?: number;
  /** Statutory / municipal fees (not subject to professional discount) */
  statutoryFees?: number;
  /** Discount percentage (0-100) */
  discountPercent?: number;
  /** Required when discount is applied */
  discountReason?: string;
}

export interface FeeLineItem {
  label: string;
  amount: number;
  category: 'professional_fee' | 'discount' | 'vat' | 'disbursement' | 'statutory_fee' | 'total';
}

export interface CalculationResult {
  calculatorId: string;
  formulaType: FormulaType;
  originalProfessionalFee: number;
  discountAmount: number;
  professionalFeeAfterDiscount: number;
  vatAmount: number;
  total: number;
  lines: FeeLineItem[];
  warnings: string[];
  /** Snapshot of inputs for audit trail */
  inputSnapshot: CalculationInput;
}

/** Round to 2 decimal places (cents) */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Validate that all required inputs for the given formula type are present.
 * Returns an array of error messages; empty array means valid.
 */
export function validateCalculatorInputs(
  formulaType: FormulaType,
  input: CalculationInput,
): string[] {
  const errors: string[] = [];

  if (!Number.isFinite(input.projectValue) || input.projectValue < 0) {
    errors.push('projectValue must be a non-negative number.');
  }

  switch (formulaType) {
    case 'stage_apportioned':
      if (input.stagePercentage !== undefined && (input.stagePercentage < 0 || input.stagePercentage > 100)) {
        errors.push('stage_apportioned requires stagePercentage between 0 and 100.');
      }
      break;
    case 'time_based':
      if ((input.hours === undefined || input.hours <= 0) && (input.hourlyRate === undefined)) {
        errors.push('time_based requires hours > 0 (and optionally hourlyRate).');
      }
      break;
    case 'area_unit':
      if (input.area === undefined || input.area <= 0) {
        errors.push('area_unit requires area > 0 (sqm).');
      }
      break;
    case 'hybrid':
      if (!input.projectValue && !input.hours && !input.area) {
        errors.push('hybrid requires at least one of: projectValue, hours, or area.');
      }
      break;
    default:
      // percentage_of_cost and sliding_scale only need projectValue
      break;
  }

  if (input.discountPercent !== undefined && (input.discountPercent < 0 || input.discountPercent > 100)) {
    errors.push('discountPercent must be between 0 and 100.');
  }

  if ((input.discountPercent ?? 0) > 0 && !input.discountReason) {
    // This is a warning, not an error — the calculation can proceed
  }

  return errors;
}

/**
 * Calculate a professional fee using the specified formula type.
 */
export function calculateProfessionalFee(
  def: CalculatorDefinition,
  input: CalculationInput,
): CalculationResult {
  const complexity = input.complexityFactor ?? 1;
  const warnings: string[] = [];
  let professionalFee = 0;

  // Validate required inputs
  const errors = validateCalculatorInputs(def.formulaType, input);
  if (errors.length > 0) {
    throw new Error(`Invalid calculator inputs: ${errors.join(' ')}`);
  }

  // Calculate professional fee based on formula type
  switch (def.formulaType) {
    case 'percentage_of_cost': {
      const pct = def.defaultPercentage ?? 8; // default 8%
      professionalFee = input.projectValue * (pct / 100) * complexity;
      break;
    }
    case 'sliding_scale': {
      const scale = def.slidingScaleBase ?? { threshold: 1_000_000, baseFee: 50_000, rateAboveThreshold: 0.045 };
      if (input.projectValue <= scale.threshold) {
        professionalFee = scale.baseFee * complexity;
      } else {
        professionalFee = (scale.baseFee + (input.projectValue - scale.threshold) * scale.rateAboveThreshold) * complexity;
      }
      break;
    }
    case 'stage_apportioned': {
      const stagePct = ((input.stagePercentage ?? undefined) !== undefined ? input.stagePercentage! : 100) / 100;
      const pct = def.defaultPercentage ?? 8;
      professionalFee = input.projectValue * (pct / 100) * stagePct * complexity;
      break;
    }
    case 'time_based': {
      const hours = input.hours ?? 0;
      const rate = input.hourlyRate ?? def.defaultHourlyRate ?? 950;
      professionalFee = hours * rate;
      break;
    }
    case 'area_unit': {
      const area = input.area ?? 0;
      const rate = input.unitRate ?? def.defaultUnitRate ?? 9500;
      professionalFee = area * rate * complexity;
      break;
    }
    case 'hybrid': {
      // Hybrid: combine percentage_of_cost (3.5%) + time_based (10h × hourly)
      const pctPortion = input.projectValue * 0.035 * complexity;
      const timePortion = (input.hours ?? 10) * (input.hourlyRate ?? def.defaultHourlyRate ?? 950);
      professionalFee = pctPortion + timePortion;
      break;
    }
    default:
      throw new Error(`Unknown formula type: ${def.formulaType}`);
  }

  // Apply discount
  const discountPercent = input.discountPercent ?? 0;
  if (discountPercent > 0 && !input.discountReason) {
    warnings.push('Discount reason is required before proposal issue.');
  }
  const discountAmount = roundMoney(professionalFee * (discountPercent / 100));
  const professionalFeeAfterDiscount = roundMoney(professionalFee - discountAmount);

  // Add disbursements and statutory fees
  const disbursements = input.disbursements ?? 0;
  const statutory = input.statutoryFees ?? 0;

  // Calculate VAT on professional fee (after discount) + disbursements
  const vatBase = professionalFeeAfterDiscount + disbursements;
  const vatAmount = roundMoney(vatBase * def.vatRate);

  // Total
  const total = roundMoney(professionalFeeAfterDiscount + disbursements + statutory + vatAmount);

  // Build line items
  const lines: FeeLineItem[] = [
    { label: 'Original professional fee', amount: roundMoney(professionalFee), category: 'professional_fee' },
  ];

  if (discountAmount > 0) {
    lines.push({ label: 'Professional fee discount', amount: roundMoney(-discountAmount), category: 'discount' });
  }

  lines.push({ label: 'Professional fee after discount', amount: professionalFeeAfterDiscount, category: 'professional_fee' });

  if (disbursements > 0) {
    lines.push({ label: 'Disbursements', amount: roundMoney(disbursements), category: 'disbursement' });
  }

  if (statutory > 0) {
    lines.push({ label: 'Statutory / municipal fees', amount: roundMoney(statutory), category: 'statutory_fee' });
  }

  lines.push({ label: 'VAT', amount: vatAmount, category: 'vat' });
  lines.push({ label: 'Total', amount: total, category: 'total' });

  return {
    calculatorId: def.calculatorId,
    formulaType: def.formulaType,
    originalProfessionalFee: roundMoney(professionalFee),
    discountAmount,
    professionalFeeAfterDiscount,
    vatAmount,
    total,
    lines,
    warnings,
    inputSnapshot: { ...input },
  };
}

// ─── Pre-configured calculators ───────────────────────────────────────────────

export const ARCHITECT_FEE_CALCULATOR: CalculatorDefinition = {
  calculatorId: 'architect_fee_proposal',
  label: 'Architect Fee + Proposal Calculator',
  role: 'architect',
  formulaType: 'percentage_of_cost',
  sourceName: 'SACAP/FeeDesk Fee Guideline v2026.1',
  sourceVersion: 'admin-versioned-v0.1',
  vatRate: 0.15,
  requiresProfessionalConfirmation: true,
  defaultPercentage: 8,
};

export const ENGINEER_FEE_CALCULATOR: CalculatorDefinition = {
  calculatorId: 'engineer_fee_proposal',
  label: 'Engineer Fee Calculator',
  role: 'engineer',
  formulaType: 'percentage_of_cost',
  sourceName: 'ECSA Fee Guideline v2026.1',
  sourceVersion: 'admin-versioned-v0.1',
  vatRate: 0.15,
  requiresProfessionalConfirmation: true,
  defaultPercentage: 6,
};

export const QS_FEE_CALCULATOR: CalculatorDefinition = {
  calculatorId: 'qs_fee_proposal',
  label: 'QS Sliding Scale Calculator',
  role: 'quantity_surveyor',
  formulaType: 'sliding_scale',
  sourceName: 'SACQSP Fee Guideline v2026.1',
  sourceVersion: 'admin-versioned-v0.1',
  vatRate: 0.15,
  requiresProfessionalConfirmation: true,
  slidingScaleBase: { threshold: 1_000_000, baseFee: 40_000, rateAboveThreshold: 0.035 },
};

export const TOWN_PLANNER_FEE_CALCULATOR: CalculatorDefinition = {
  calculatorId: 'town_planner_fee_proposal',
  label: 'Town Planner Fee Calculator',
  role: 'town_planner',
  formulaType: 'hybrid',
  sourceName: 'SACPLAN Fee Guideline v2026.1',
  sourceVersion: 'admin-versioned-v0.1',
  vatRate: 0.15,
  requiresProfessionalConfirmation: true,
};

export const CLIENT_SOFT_COST_CALCULATOR: CalculatorDefinition = {
  calculatorId: 'client_soft_cost_estimator',
  label: 'Client Soft-Cost Estimator',
  role: 'client_developer',
  formulaType: 'hybrid',
  sourceName: 'Architex soft-cost estimator placeholder',
  sourceVersion: 'admin-versioned-v0.1',
  vatRate: 0.15,
  requiresProfessionalConfirmation: false,
};

/** All pre-configured calculators indexed by role */
export const ROLE_CALCULATORS: Record<ArchitexProfessionalRole, CalculatorDefinition[]> = {
  architect: [ARCHITECT_FEE_CALCULATOR],
  engineer: [ENGINEER_FEE_CALCULATOR],
  quantity_surveyor: [QS_FEE_CALCULATOR],
  town_planner: [TOWN_PLANNER_FEE_CALCULATOR],
  client_developer: [CLIENT_SOFT_COST_CALCULATOR],
  land_surveyor: [],
  construction_project_manager: [],
  landscape_architect: [],
  interior_designer: [],
};

/** Lookup a calculator by ID */
export function calculatorById(id: string): CalculatorDefinition {
  for (const calcs of Object.values(ROLE_CALCULATORS)) {
    const found = calcs.find((c) => c.calculatorId === id);
    if (found) return found;
  }
  throw new Error(`Calculator not found: ${id}`);
}

/** List all available calculators */
export function listAllCalculators(): CalculatorDefinition[] {
  return Object.values(ROLE_CALCULATORS).flat();
}

/** List calculators for a specific role */
export function calculatorsForRole(role: ArchitexProfessionalRole): CalculatorDefinition[] {
  return ROLE_CALCULATORS[role] ?? [];
}
