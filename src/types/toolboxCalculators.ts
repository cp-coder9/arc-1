export type ToolboxUserRole =
  | 'architect'
  | 'bep'
  | 'contractor'
  | 'subcontractor'
  | 'supplier'
  | 'engineer'
  | 'energy_professional'
  | 'fire_engineer'
  | 'admin';

export type ToolboxFamilyId =
  | 'xa_energy'
  | 'structural'
  | 'civil_stormwater'
  | 'electrical'
  | 'mechanical_hvac'
  | 'wet_services'
  | 'fire_life_safety'
  | 'contractor_trade';

export type CalculatorRiskStatus = 'pass' | 'warning' | 'fail' | 'info';
export type CalculatorUseClass = 'quick_estimate' | 'coordination_check' | 'tender_estimate' | 'contractor_quantity' | 'compliance_support' | 'professional_design_required';

export type CalculatorExportTarget =
  | 'compliance_report'
  | 'tender_boq'
  | 'bid_line_item'
  | 'supplier_rfq'
  | 'site_log'
  | 'rfi'
  | 'variation_claim'
  | 'payment_valuation'
  | 'bim_coordination_comment';

export interface ToolboxContext {
  projectId?: string;
  jobId?: string;
  tenderPackageId?: string;
  bidId?: string;
  userId: string;
  role: ToolboxUserRole;
  phase?: string;
  municipality?: string;
  discipline?: string;
  trade?: string;
  locationZone?: string;
  sourceReferences?: string[];
}

export interface CalculatorDefinition<TInputs extends object = Record<string, unknown>, TResult extends object = Record<string, unknown>> {
  id: string;
  version: string;
  familyId: ToolboxFamilyId;
  label: string;
  description: string;
  useClass: CalculatorUseClass;
  applicableRoles: ToolboxUserRole[];
  defaultExportTargets: CalculatorExportTarget[];
  requiredInputs: Array<keyof TInputs & string>;
  optionalInputs?: Array<keyof TInputs & string>;
  referenceNotes: string[];
  professionalSignoffRequired: boolean;
  run: (context: ToolboxContext, inputs: TInputs) => CalculatorRun<TResult>;
}

export interface CalculatorRun<TResult extends object = Record<string, unknown>> {
  id: string;
  calculatorId: string;
  calculatorVersion: string;
  context: ToolboxContext;
  inputs: object;
  assumptions: string[];
  results: TResult;
  riskStatus: CalculatorRiskStatus;
  referenceNotes: string[];
  professionalSignoffRequired: boolean;
  nextRecommendedActions: string[];
  exportTargets: CalculatorExportTarget[];
  createdAt: string;
}

export interface XAfenestrationInputs {
  buildingType: 'residential' | 'commercial' | 'mixed_use' | 'other';
  energyZone: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  orientation: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
  wallAreaM2: number;
  glazedAreaM2: number;
  averageUValue?: number;
  averageSHGC?: number;
  shadingFactor?: number;
  maxGlazingRatio?: number;
  maxWeightedSHGC?: number;
}

export interface RValueInputs {
  assembly: 'roof_ceiling' | 'external_wall';
  energyZone: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  requiredRValue: number;
  layers: Array<{ label: string; rValue: number }>;
}

export interface RationalMethodInputs {
  catchments: Array<{ label: string; areaM2: number; runoffCoefficient: number }>;
  rainfallIntensityMmPerHour: number;
  returnPeriodYears?: number;
  timeOfConcentrationMinutes?: number;
}

export interface ConcreteOrderInputs {
  elements: Array<{ label: string; lengthM: number; widthM: number; depthM: number; count?: number }>;
  wastePercent?: number;
  truckCapacityM3?: number;
}

export interface BrickBlockworkInputs {
  wallAreaM2: number;
  openingsM2?: number;
  unitLengthMm: number;
  unitHeightMm: number;
  jointMm?: number;
  wastePercent?: number;
}

export interface TenderRateBuildUpInputs {
  quantity: number;
  unit: string;
  materialUnitCost: number;
  labourUnitCost: number;
  plantUnitCost?: number;
  subcontractUnitCost?: number;
  overheadPercent?: number;
  profitPercent?: number;
  riskPercent?: number;
}

export interface LabourProductivityInputs {
  quantity: number;
  unit: string;
  productivityPerCrewPerDay: number;
  crewCount?: number;
  workingHoursPerDay?: number;
}

export interface ToolboxAgentRecommendation {
  agentId: string;
  message: string;
  severity: 'info' | 'warning' | 'blocker';
  suggestedCalculatorIds?: string[];
  suggestedExportTargets?: CalculatorExportTarget[];
}
