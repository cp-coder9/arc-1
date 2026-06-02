import type {
  BrickBlockworkInputs,
  CalculatorDefinition,
  CalculatorRun,
  ConcreteOrderInputs,
  LabourProductivityInputs,
  RationalMethodInputs,
  RValueInputs,
  TenderRateBuildUpInputs,
  ToolboxContext,
  XAfenestrationInputs,
} from '@/types/toolboxCalculators';

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function runId(calculatorId: string): string {
  return `${calculatorId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function baseRun<TResult extends Record<string, unknown>>(
  definition: Pick<CalculatorDefinition, 'id' | 'version' | 'referenceNotes' | 'professionalSignoffRequired' | 'defaultExportTargets'>,
  context: ToolboxContext,
  inputs: Record<string, unknown>,
  partial: Omit<CalculatorRun<TResult>, 'id' | 'calculatorId' | 'calculatorVersion' | 'context' | 'inputs' | 'referenceNotes' | 'professionalSignoffRequired' | 'exportTargets' | 'createdAt'>
): CalculatorRun<TResult> {
  return {
    id: runId(definition.id),
    calculatorId: definition.id,
    calculatorVersion: definition.version,
    context,
    inputs,
    referenceNotes: definition.referenceNotes,
    professionalSignoffRequired: definition.professionalSignoffRequired,
    exportTargets: definition.defaultExportTargets,
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

const xaFenestrationQuickCheck: CalculatorDefinition<XAfenestrationInputs> = {
  id: 'xa_fenestration_quick_check',
  version: '0.1.0',
  familyId: 'xa_energy',
  label: 'SANS 10400-XA Fenestration Quick Check',
  description: 'Early check for glazing ratio and weighted SHGC/U-value assumptions. Not a full municipal submission report.',
  useClass: 'compliance_support',
  applicableRoles: ['architect', 'bep', 'energy_professional'],
  defaultExportTargets: ['compliance_report', 'bim_coordination_comment', 'rfi'],
  requiredInputs: ['buildingType', 'energyZone', 'orientation', 'wallAreaM2', 'glazedAreaM2'],
  optionalInputs: ['averageUValue', 'averageSHGC', 'shadingFactor', 'maxGlazingRatio', 'maxWeightedSHGC'],
  referenceNotes: [
    'Based on Architex quick-screening logic inspired by SANSCalc/Fencalc-style workflows.',
    'Confirm final values against current SANS 10400-XA, SANS 204, supplier data and municipal requirements.',
  ],
  professionalSignoffRequired: true,
  run(context, inputs) {
    const glazingRatio = inputs.wallAreaM2 > 0 ? inputs.glazedAreaM2 / inputs.wallAreaM2 : 0;
    const maxRatio = inputs.maxGlazingRatio ?? 0.15;
    const weightedSHGC = (inputs.averageSHGC ?? 0.69) * (inputs.shadingFactor ?? 1);
    const maxWeightedSHGC = inputs.maxWeightedSHGC ?? 0.58;
    const ratioPass = glazingRatio <= maxRatio;
    const shgcPass = weightedSHGC <= maxWeightedSHGC;
    const missing = ['averageUValue', 'averageSHGC', 'shadingFactor'].filter((key) => inputs[key as keyof XAfenestrationInputs] === undefined);
    return baseRun(this, context, inputs as unknown as Record<string, unknown>, {
      assumptions: [
        `Default max glazing ratio used: ${round(maxRatio * 100, 1)}% unless overridden by project-specific table.`,
        `Default max weighted SHGC used: ${maxWeightedSHGC} unless overridden.`,
      ],
      results: {
        glazingRatioPercent: round(glazingRatio * 100, 2),
        maxGlazingRatioPercent: round(maxRatio * 100, 2),
        weightedSHGC: round(weightedSHGC, 3),
        maxWeightedSHGC,
        ratioPass,
        shgcPass,
        missingInputs: missing,
      },
      riskStatus: ratioPass && shgcPass ? (missing.length ? 'warning' : 'pass') : 'fail',
      nextRecommendedActions: ratioPass && shgcPass
        ? ['Export to XA checklist and confirm supplier U-value/SHGC data.']
        : ['Revise glazing area, orientation, shading or glass specification; request energy consultant review.'],
    });
  },
};

const xaRoofRValueCheck: CalculatorDefinition<RValueInputs> = {
  id: 'xa_rvalue_check',
  version: '0.1.0',
  familyId: 'xa_energy',
  label: 'SANS 10400-XA Roof/Wall R-Value Check',
  description: 'Composite R-value quick checker for roof/ceiling or external wall assemblies.',
  useClass: 'compliance_support',
  applicableRoles: ['architect', 'bep', 'energy_professional', 'contractor'],
  defaultExportTargets: ['compliance_report', 'supplier_rfq', 'bim_coordination_comment'],
  requiredInputs: ['assembly', 'energyZone', 'requiredRValue', 'layers'],
  referenceNotes: ['Use manufacturer-declared R-values and confirm against SANS 10400-XA:2021 requirements.'],
  professionalSignoffRequired: true,
  run(context, inputs) {
    const totalRValue = inputs.layers.reduce((sum, layer) => sum + Number(layer.rValue || 0), 0);
    const shortfall = Math.max(0, inputs.requiredRValue - totalRValue);
    return baseRun(this, context, inputs as unknown as Record<string, unknown>, {
      assumptions: ['Layer R-values are user supplied and must be checked against manufacturer documentation.'],
      results: { totalRValue: round(totalRValue, 3), requiredRValue: inputs.requiredRValue, shortfall: round(shortfall, 3), pass: shortfall === 0 },
      riskStatus: shortfall === 0 ? 'pass' : 'fail',
      nextRecommendedActions: shortfall === 0 ? ['Attach R-value result to XA checklist.'] : ['Increase insulation specification or revise assembly build-up.'],
    });
  },
};

const rationalMethodRunoff: CalculatorDefinition<RationalMethodInputs> = {
  id: 'rational_method_runoff',
  version: '0.1.0',
  familyId: 'civil_stormwater',
  label: 'Rational Method Stormwater Runoff',
  description: 'Peak stormwater runoff estimator using Q = C i A.',
  useClass: 'coordination_check',
  applicableRoles: ['bep', 'engineer', 'contractor'],
  defaultExportTargets: ['bim_coordination_comment', 'rfi', 'tender_boq'],
  requiredInputs: ['catchments', 'rainfallIntensityMmPerHour'],
  referenceNotes: ['Use local municipal IDF data and return periods. Civil engineer sign-off required for submission.'],
  professionalSignoffRequired: true,
  run(context, inputs) {
    const areaWeightedC = inputs.catchments.reduce((sum, c) => sum + c.areaM2 * c.runoffCoefficient, 0);
    const totalAreaM2 = inputs.catchments.reduce((sum, c) => sum + c.areaM2, 0);
    const qM3s = (areaWeightedC * inputs.rainfallIntensityMmPerHour) / 3_600_000;
    return baseRun(this, context, inputs as unknown as Record<string, unknown>, {
      assumptions: ['Q = C i A, where i is mm/h and A is m²; result converted to m³/s.'],
      results: { totalAreaM2: round(totalAreaM2, 2), equivalentRunoffCoefficient: round(totalAreaM2 ? areaWeightedC / totalAreaM2 : 0, 3), peakRunoffM3s: round(qM3s, 4), peakRunoffLs: round(qM3s * 1000, 2) },
      riskStatus: 'info',
      nextRecommendedActions: ['Confirm rainfall intensity and return period with municipality/civil engineer.', 'Use output to reserve pipe/attenuation zones.'],
    });
  },
};

const concreteOrderCalculator: CalculatorDefinition<ConcreteOrderInputs> = {
  id: 'concrete_order',
  version: '0.1.0',
  familyId: 'contractor_trade',
  label: 'Concrete Volume / Order Calculator',
  description: 'Calculates concrete volume, waste allowance and truckloads for site ordering and tender quantities.',
  useClass: 'contractor_quantity',
  applicableRoles: ['contractor', 'subcontractor', 'bep'],
  defaultExportTargets: ['tender_boq', 'supplier_rfq', 'site_log', 'payment_valuation'],
  requiredInputs: ['elements'],
  optionalInputs: ['wastePercent', 'truckCapacityM3'],
  referenceNotes: ['For quantity/order planning. Structural design and reinforcement remain engineer responsibilities.'],
  professionalSignoffRequired: false,
  run(context, inputs) {
    const netVolume = inputs.elements.reduce((sum, e) => sum + e.lengthM * e.widthM * e.depthM * (e.count ?? 1), 0);
    const wastePercent = inputs.wastePercent ?? 5;
    const grossVolume = netVolume * (1 + wastePercent / 100);
    const truckCapacity = inputs.truckCapacityM3 ?? 6;
    return baseRun(this, context, inputs as unknown as Record<string, unknown>, {
      assumptions: [`Waste allowance: ${wastePercent}%`, `Truck capacity: ${truckCapacity}m³`],
      results: { netVolumeM3: round(netVolume, 3), grossOrderVolumeM3: round(grossVolume, 3), truckLoads: Math.ceil(grossVolume / truckCapacity) },
      riskStatus: 'info',
      nextRecommendedActions: ['Export gross volume to supplier RFQ or site pour log.', 'Attach delivery tickets after pour for payment reconciliation.'],
    });
  },
};

const brickBlockworkCalculator: CalculatorDefinition<BrickBlockworkInputs> = {
  id: 'brick_blockwork',
  version: '0.1.0',
  familyId: 'contractor_trade',
  label: 'Brick / Blockwork Quantity Calculator',
  description: 'Estimates masonry units from wall area, openings, joint size and waste allowance.',
  useClass: 'contractor_quantity',
  applicableRoles: ['contractor', 'subcontractor', 'supplier', 'bep'],
  defaultExportTargets: ['tender_boq', 'supplier_rfq', 'site_log', 'payment_valuation'],
  requiredInputs: ['wallAreaM2', 'unitLengthMm', 'unitHeightMm'],
  optionalInputs: ['openingsM2', 'jointMm', 'wastePercent'],
  referenceNotes: ['Use project-specific bond, wall thickness, lintels, reinforcement and mortar assumptions.'],
  professionalSignoffRequired: false,
  run(context, inputs) {
    const joint = inputs.jointMm ?? 10;
    const moduleArea = ((inputs.unitLengthMm + joint) / 1000) * ((inputs.unitHeightMm + joint) / 1000);
    const netArea = Math.max(0, inputs.wallAreaM2 - (inputs.openingsM2 ?? 0));
    const netUnits = moduleArea > 0 ? netArea / moduleArea : 0;
    const wastePercent = inputs.wastePercent ?? 7.5;
    return baseRun(this, context, inputs as unknown as Record<string, unknown>, {
      assumptions: [`Joint allowance: ${joint}mm`, `Waste allowance: ${wastePercent}%`],
      results: { netWallAreaM2: round(netArea, 2), estimatedUnits: Math.ceil(netUnits), orderUnits: Math.ceil(netUnits * (1 + wastePercent / 100)) },
      riskStatus: 'info',
      nextRecommendedActions: ['Export units to supplier RFQ and masonry subcontractor package.', 'Confirm bond, wall thickness and special units.'],
    });
  },
};

const tenderRateBuildUpCalculator: CalculatorDefinition<TenderRateBuildUpInputs> = {
  id: 'tender_rate_buildup',
  version: '0.1.0',
  familyId: 'contractor_trade',
  label: 'Tender Rate Build-Up Calculator',
  description: 'Builds a tender unit rate from material, labour, plant, subcontract, overhead, profit and risk components.',
  useClass: 'tender_estimate',
  applicableRoles: ['contractor', 'subcontractor', 'supplier', 'bep'],
  defaultExportTargets: ['tender_boq', 'bid_line_item', 'variation_claim'],
  requiredInputs: ['quantity', 'unit', 'materialUnitCost', 'labourUnitCost'],
  optionalInputs: ['plantUnitCost', 'subcontractUnitCost', 'overheadPercent', 'profitPercent', 'riskPercent'],
  referenceNotes: ['Keep rate build-ups audit-visible for tender comparison, variations and payment disputes.'],
  professionalSignoffRequired: false,
  run(context, inputs) {
    const directUnitRate = inputs.materialUnitCost + inputs.labourUnitCost + (inputs.plantUnitCost ?? 0) + (inputs.subcontractUnitCost ?? 0);
    const factor = 1 + ((inputs.overheadPercent ?? 0) + (inputs.profitPercent ?? 0) + (inputs.riskPercent ?? 0)) / 100;
    const unitRate = directUnitRate * factor;
    return baseRun(this, context, inputs as unknown as Record<string, unknown>, {
      assumptions: [`Overhead ${inputs.overheadPercent ?? 0}%, profit ${inputs.profitPercent ?? 0}%, risk ${inputs.riskPercent ?? 0}% applied to direct rate.`],
      results: { directUnitRate: round(directUnitRate, 2), unitRate: round(unitRate, 2), quantity: inputs.quantity, unit: inputs.unit, totalAmount: round(unitRate * inputs.quantity, 2) },
      riskStatus: 'info',
      nextRecommendedActions: ['Export to tender/bid line item.', 'Lock rate build-up version if bid is submitted.'],
    });
  },
};

const labourProductivityCalculator: CalculatorDefinition<LabourProductivityInputs> = {
  id: 'labour_productivity',
  version: '0.1.0',
  familyId: 'contractor_trade',
  label: 'Labour / Crew Productivity Calculator',
  description: 'Estimates crew days, duration and daily production targets.',
  useClass: 'tender_estimate',
  applicableRoles: ['contractor', 'subcontractor', 'bep'],
  defaultExportTargets: ['tender_boq', 'site_log', 'variation_claim', 'payment_valuation'],
  requiredInputs: ['quantity', 'unit', 'productivityPerCrewPerDay'],
  optionalInputs: ['crewCount', 'workingHoursPerDay'],
  referenceNotes: ['Use actual site logs to improve productivity templates over time.'],
  professionalSignoffRequired: false,
  run(context, inputs) {
    const crewCount = inputs.crewCount ?? 1;
    const crewDays = inputs.productivityPerCrewPerDay > 0 ? inputs.quantity / inputs.productivityPerCrewPerDay : 0;
    const durationDays = crewCount > 0 ? crewDays / crewCount : 0;
    return baseRun(this, context, inputs as unknown as Record<string, unknown>, {
      assumptions: [`Crew count: ${crewCount}`, `Working hours/day: ${inputs.workingHoursPerDay ?? 8}`],
      results: { quantity: inputs.quantity, unit: inputs.unit, crewDays: round(crewDays, 2), durationDays: round(durationDays, 2), dailyTarget: round(inputs.productivityPerCrewPerDay * crewCount, 2) },
      riskStatus: durationDays > 0 ? 'info' : 'warning',
      nextRecommendedActions: ['Export daily targets to programme/lookahead plan and site logs.'],
    });
  },
};

export const TOOLBOX_CALCULATORS = [
  xaFenestrationQuickCheck,
  xaRoofRValueCheck,
  rationalMethodRunoff,
  concreteOrderCalculator,
  brickBlockworkCalculator,
  tenderRateBuildUpCalculator,
  labourProductivityCalculator,
] as const;

export type ToolboxCalculatorId = typeof TOOLBOX_CALCULATORS[number]['id'];

export function listCalculatorsForContext(context: ToolboxContext): readonly CalculatorDefinition<object>[] {
  return TOOLBOX_CALCULATORS.filter((calculator) => calculator.applicableRoles.includes(context.role)) as readonly CalculatorDefinition<object>[];
}

export function runCalculator<TInputs extends object>(calculatorId: string, context: ToolboxContext, inputs: TInputs): CalculatorRun {
  const calculator = TOOLBOX_CALCULATORS.find((item) => item.id === calculatorId);
  if (!calculator) throw new Error(`Unknown calculator: ${calculatorId}`);
  return (calculator as unknown as CalculatorDefinition<TInputs>).run(context, inputs);
}
