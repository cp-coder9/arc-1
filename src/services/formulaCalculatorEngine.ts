/**
 * Formula Calculator Engine — Pack 4: Professional Toolboxes & Proposal Builder
 *
 * Implements all 6 formula types for professional fee calculation:
 *   1. percentage_of_cost — percentage of project value
 *   2. sliding_scale — base fee + percentage of amount above threshold
 *   3. stage_apportioned — percentage of full fee for selected stages
 *   4. time_based — hours × hourly rate
 *   5. area_unit — area × unit rate × complexity
 *   6. hybrid — combination of multiple formula components
 *
 * Each formula type supports input validation, complexity factor adjustment,
 * and produces a consistent CalculationResult with warnings.
 */
import type { ProposalPartyRole } from '../types/proposalBuilder';

// ─── Types ──────────────────────────────────────────────────────────────────

export type FormulaType =
  | 'sliding_scale'
  | 'percentage_of_cost'
  | 'stage_apportioned'
  | 'time_based'
  | 'area_unit'
  | 'hybrid';

export interface FeeLineItem {
  label: string;
  amount: number;
  category: 'professional_fee' | 'discount' | 'vat' | 'disbursement' | 'statutory_fee' | 'platform_fee' | 'total';
}

export interface CalculatorDefinition {
  calculatorId: string;
  label: string;
  role: ProposalPartyRole;
  formulaType: FormulaType;
  sourceName: string;
  sourceVersion: string;
  vatRate: number;
  requiresProfessionalConfirmation: boolean;
}

export interface CalculationInput {
  projectValue?: number;
  area?: number;
  unitRate?: number;
  hours?: number;
  hourlyRate?: number;
  stagePercentage?: number;
  complexityFactor?: number;
  disbursements?: number;
  statutoryFees?: number;
  discountPercent?: number;
  discountReason?: string;
  /** Sliding scale config */
  slidingScaleBaseFee?: number;
  slidingScaleThreshold?: number;
  slidingScaleAboveRate?: number;
  /** Hybrid formula components */
  hybridComponents?: Array<{
    formulaType: FormulaType;
    weight: number;
    inputs: CalculationInput;
  }>;
}

export interface CalculationResult {
  calculatorId: string;
  formulaType: FormulaType;
  originalProfessionalFee: number;
  discountAmount: number;
  professionalFeeAfterDiscount: number;
  disbursements: number;
  statutoryFees: number;
  vatAmount: number;
  total: number;
  lines: FeeLineItem[];
  warnings: string[];
}

// ─── Validation ─────────────────────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate inputs for a given formula type.
 * Returns an array of validation errors (empty if valid).
 */
export function validateCalculatorInputs(
  formulaType: FormulaType,
  inputs: CalculationInput,
): ValidationError[] {
  const errors: ValidationError[] = [];

  const requirePositive = (field: keyof CalculationInput, label: string) => {
    const val = inputs[field];
    if (val !== undefined && (typeof val !== 'number' || val < 0 || !Number.isFinite(val))) {
      errors.push({ field, message: `${label} must be a non-negative number.` });
    }
  };

  const requireDefined = (field: keyof CalculationInput, label: string) => {
    const val = inputs[field];
    if (val === undefined || val === null) {
      errors.push({ field, message: `${label} is required.` });
    } else if (typeof val === 'number' && (!Number.isFinite(val) || val < 0)) {
      errors.push({ field, message: `${label} must be a non-negative number.` });
    }
  };

  switch (formulaType) {
    case 'percentage_of_cost':
      requireDefined('projectValue', 'Project value');
      break;
    case 'sliding_scale':
      requireDefined('projectValue', 'Project value');
      requirePositive('slidingScaleBaseFee', 'Sliding scale base fee');
      requirePositive('slidingScaleThreshold', 'Sliding scale threshold');
      requirePositive('slidingScaleAboveRate', 'Sliding scale above-threshold rate');
      break;
    case 'stage_apportioned':
      requireDefined('projectValue', 'Project value');
      if (inputs.stagePercentage !== undefined && (inputs.stagePercentage < 0 || inputs.stagePercentage > 100)) {
        errors.push({ field: 'stagePercentage', message: 'Stage percentage must be between 0 and 100.' });
      }
      break;
    case 'time_based':
      if ((inputs.hours ?? 0) <= 0) {
        errors.push({ field: 'hours', message: 'Hours must be a positive number.' });
      }
      if ((inputs.hourlyRate ?? 0) <= 0) {
        errors.push({ field: 'hourlyRate', message: 'Hourly rate must be a positive number.' });
      }
      break;
    case 'area_unit':
      if ((inputs.area ?? 0) <= 0) {
        errors.push({ field: 'area', message: 'Area must be a positive number.' });
      }
      if ((inputs.unitRate ?? 0) <= 0) {
        errors.push({ field: 'unitRate', message: 'Unit rate must be a positive number.' });
      }
      break;
    case 'hybrid':
      if (!inputs.hybridComponents || inputs.hybridComponents.length === 0) {
        errors.push({ field: 'hybridComponents', message: 'At least one hybrid component is required.' });
      } else {
        const totalWeight = inputs.hybridComponents.reduce((sum, c) => sum + c.weight, 0);
        if (Math.abs(totalWeight - 1) > 0.001) {
          errors.push({ field: 'hybridComponents', message: 'Hybrid component weights must sum to 1.0.' });
        }
        inputs.hybridComponents.forEach((component, index) => {
          const childErrors = validateCalculatorInputs(component.formulaType, component.inputs);
          childErrors.forEach((err) => {
            errors.push({ field: `hybridComponents[${index}].${err.field}`, message: err.message });
          });
        });
      }
      break;
  }

  // Common validations
  if (inputs.discountPercent !== undefined && (inputs.discountPercent < 0 || inputs.discountPercent > 100)) {
    errors.push({ field: 'discountPercent', message: 'Discount percentage must be between 0 and 100.' });
  }
  requirePositive('disbursements', 'Disbursements');
  requirePositive('statutoryFees', 'Statutory fees');

  return errors;
}

// ─── Calculator Engine ──────────────────────────────────────────────────────

/**
 * Calculate a professional fee using the specified formula type.
 * All monetary values are rounded to 2 decimal places.
 */
export function calculateFee(
  definition: Pick<CalculatorDefinition, 'calculatorId' | 'formulaType' | 'vatRate'>,
  inputs: CalculationInput,
): CalculationResult {
  const complexity = inputs.complexityFactor ?? 1;
  const warnings: string[] = [];
  let professionalFee = 0;

  switch (definition.formulaType) {
    case 'percentage_of_cost': {
      const projectValue = inputs.projectValue ?? 0;
      professionalFee = projectValue * 0.08 * complexity;
      break;
    }

    case 'sliding_scale': {
      const projectValue = inputs.projectValue ?? 0;
      const baseFee = inputs.slidingScaleBaseFee ?? 50000;
      const threshold = inputs.slidingScaleThreshold ?? 1000000;
      const aboveRate = inputs.slidingScaleAboveRate ?? 0.045;
      const aboveThreshold = Math.max(0, projectValue - threshold);
      professionalFee = (baseFee + aboveThreshold * aboveRate) * complexity;
      break;
    }

    case 'stage_apportioned': {
      const projectValue = inputs.projectValue ?? 0;
      const stagePercentage = (inputs.stagePercentage ?? 100) / 100;
      professionalFee = projectValue * 0.08 * stagePercentage * complexity;
      break;
    }

    case 'time_based': {
      const hours = inputs.hours ?? 0;
      const hourlyRate = inputs.hourlyRate ?? 0;
      professionalFee = hours * hourlyRate * complexity;
      if (hours < 1) {
        warnings.push('Time-based estimate with less than 1 hour may not reflect realistic engagement scope.');
      }
      break;
    }

    case 'area_unit': {
      const area = inputs.area ?? 0;
      const unitRate = inputs.unitRate ?? 0;
      professionalFee = area * unitRate * complexity;
      break;
    }

    case 'hybrid': {
      if (!inputs.hybridComponents || inputs.hybridComponents.length === 0) {
        throw new Error('Hybrid formula requires at least one component with weight.');
      }
      // Calculate each component independently
      const componentResults = inputs.hybridComponents.map((component) => {
        const childResult = calculateFee(
          { calculatorId: definition.calculatorId, formulaType: component.formulaType, vatRate: definition.vatRate },
          { ...component.inputs, complexityFactor: (component.inputs.complexityFactor ?? 1) },
        );
        return {
          weight: component.weight,
          professionalFee: childResult.originalProfessionalFee,
          warnings: childResult.warnings,
        };
      });
      // Weighted combination
      professionalFee = componentResults.reduce(
        (sum, result) => sum + result.professionalFee * result.weight,
        0,
      );
      componentResults.forEach((result) => warnings.push(...result.warnings));
      warnings.push(
        `Hybrid fee combines ${inputs.hybridComponents.length} component(s) with weights totaling 1.0. Each component is calculated independently and weighted.`,
      );
      break;
    }
  }

  // Discount
  const discountPercent = inputs.discountPercent ?? 0;
  if (discountPercent > 0 && !inputs.discountReason) {
    warnings.push('Discount reason is required before proposal issue.');
  }
  const discountAmount = round(professionalFee * (discountPercent / 100));

  const professionalFeeAfterDiscount = round(professionalFee - discountAmount);
  const disbursements = inputs.disbursements ?? 0;
  const statutory = inputs.statutoryFees ?? 0;

  // VAT applies to professional fees (after discount) and disbursements
  const vatableAmount = professionalFeeAfterDiscount + disbursements;
  const vatAmount = round(vatableAmount * definition.vatRate);

  // Total: professional fee after discount + disbursements + statutory fees + VAT
  const total = round(professionalFeeAfterDiscount + disbursements + statutory + vatAmount);

  const lines: FeeLineItem[] = [
    { label: 'Original professional fee', amount: round(professionalFee), category: 'professional_fee' },
    { label: 'Professional fee discount', amount: round(-discountAmount), category: 'discount' },
    { label: 'Professional fee after discount', amount: professionalFeeAfterDiscount, category: 'professional_fee' },
    { label: 'Disbursements', amount: round(disbursements), category: 'disbursement' },
    { label: 'Statutory / municipal fees', amount: round(statutory), category: 'statutory_fee' },
    { label: 'VAT', amount: vatAmount, category: 'vat' },
    { label: 'Total', amount: total, category: 'total' },
  ];

  return {
    calculatorId: definition.calculatorId,
    formulaType: definition.formulaType,
    originalProfessionalFee: round(professionalFee),
    discountAmount,
    professionalFeeAfterDiscount,
    disbursements: round(disbursements),
    statutoryFees: round(statutory),
    vatAmount,
    total,
    lines,
    warnings,
  };
}

// ─── Registry of Calculator Definitions ─────────────────────────────────────

export const FORMULA_CALCULATOR_REGISTRY: CalculatorDefinition[] = [
  {
    calculatorId: 'architect_fee_proposal',
    label: 'Architect Fee + Proposal Calculator',
    role: 'architect',
    formulaType: 'percentage_of_cost',
    sourceName: 'SACAP Fee Guideline placeholder',
    sourceVersion: 'admin-versioned-v0.1',
    vatRate: 0.15,
    requiresProfessionalConfirmation: true,
  },
  {
    calculatorId: 'architect_sliding_scale',
    label: 'Architect Sliding Scale Calculator',
    role: 'architect',
    formulaType: 'sliding_scale',
    sourceName: 'Architex sliding-scale template',
    sourceVersion: 'admin-versioned-v0.1',
    vatRate: 0.15,
    requiresProfessionalConfirmation: true,
  },
  {
    calculatorId: 'engineer_fee_placeholder',
    label: 'Engineer Fee Placeholder',
    role: 'engineer',
    formulaType: 'percentage_of_cost',
    sourceName: 'ECSA-style editable placeholder',
    sourceVersion: 'admin-versioned-v0.1',
    vatRate: 0.15,
    requiresProfessionalConfirmation: true,
  },
  {
    calculatorId: 'qs_fee_placeholder',
    label: 'QS Sliding Scale Placeholder',
    role: 'quantity_surveyor',
    formulaType: 'sliding_scale',
    sourceName: 'SACQSP-style editable placeholder',
    sourceVersion: 'admin-versioned-v0.1',
    vatRate: 0.15,
    requiresProfessionalConfirmation: true,
  },
  {
    calculatorId: 'town_planner_application_placeholder',
    label: 'Town Planner Application Placeholder',
    role: 'town_planner',
    formulaType: 'hybrid',
    sourceName: 'SACPLAN/application-type editable placeholder',
    sourceVersion: 'admin-versioned-v0.1',
    vatRate: 0.15,
    requiresProfessionalConfirmation: true,
  },
  {
    calculatorId: 'client_soft_cost_estimator',
    label: 'Client Soft-Cost Estimator',
    role: 'client',
    formulaType: 'hybrid',
    sourceName: 'Architex soft-cost estimator placeholder',
    sourceVersion: 'admin-versioned-v0.1',
    vatRate: 0.15,
    requiresProfessionalConfirmation: false,
  },
  {
    calculatorId: 'time_based_consultant',
    label: 'Time-Based Consultant Fee Calculator',
    role: 'architect',
    formulaType: 'time_based',
    sourceName: 'Architex time-based template',
    sourceVersion: 'admin-versioned-v0.1',
    vatRate: 0.15,
    requiresProfessionalConfirmation: true,
  },
  {
    calculatorId: 'area_unit_estimator',
    label: 'Area Unit Rate Estimator',
    role: 'architect',
    formulaType: 'area_unit',
    sourceName: 'Architex area-rate template',
    sourceVersion: 'admin-versioned-v0.1',
    vatRate: 0.15,
    requiresProfessionalConfirmation: true,
  },
];

// ─── Lookup ─────────────────────────────────────────────────────────────────

export function getCalculatorById(calculatorId: string): CalculatorDefinition {
  const calc = FORMULA_CALCULATOR_REGISTRY.find((c) => c.calculatorId === calculatorId);
  if (!calc) throw new Error(`Formula calculator not found: ${calculatorId}`);
  return calc;
}

export function listCalculatorsForRole(role: ProposalPartyRole): CalculatorDefinition[] {
  return FORMULA_CALCULATOR_REGISTRY.filter((c) => c.role === role);
}

export function listCalculatorsByFormulaType(formulaType: FormulaType): CalculatorDefinition[] {
  return FORMULA_CALCULATOR_REGISTRY.filter((c) => c.formulaType === formulaType);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
