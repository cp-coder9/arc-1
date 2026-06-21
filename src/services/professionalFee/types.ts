export type Profession =
  | 'architect'
  | 'civilEngineer'
  | 'structuralEngineer'
  | 'electricalEngineer'
  | 'mechanicalEngineer'
  | 'fireEngineer'
  | 'quantitySurveyor'
  | 'townPlanner'
  | 'landSurveyor'
  | 'landscapeArchitect'
  | 'interiorDesigner'
  | 'constructionProjectManager';

export type FormulaType = 'slidingScale' | 'percentageOfCost' | 'stageApportioned' | 'timeBased' | 'areaUnit' | 'hybrid';

export interface SourceVersion {
  id: string;
  profession: Profession;
  body: string;
  title: string;
  effectiveDate: string;
  status: 'demo-seed' | 'draft' | 'verified' | 'retired';
  note: string;
}

export interface StageDefinition {
  id: string;
  name: string;
  defaultWeight: number;
  deliverables: string[];
}

export interface ComplexityOption {
  id: 'low' | 'medium' | 'high' | 'specialist';
  label: string;
  factor: number;
  description: string;
}

export interface WorkCategory {
  id: string;
  label: string;
  factor: number;
  description: string;
}

export interface ProfessionProfile {
  profession: Profession;
  displayName: string;
  councilOrBody: string;
  source: SourceVersion;
  preferredFormula: FormulaType;
  uiStyle: 'architectural-fee-desk' | 'engineering-discipline' | 'qs-cost-plan' | 'planning-application' | 'survey-unit' | 'design-fitout' | 'project-management';
  stages: StageDefinition[];
  complexity: ComplexityOption[];
  workCategories: WorkCategory[];
  defaultTermsTemplateIds: string[];
  actReferences: string[];
}

export interface FeeInput {
  profession: Profession;
  projectValue: number;
  complexityId: string;
  workCategorySplits: Record<string, number>;
  selectedStages: Record<string, { applicable: boolean; reductionPercentage: number }>;
  hourlyLines?: Array<{ label: string; hours: number; rate: number }>;
  unitLines?: Array<{ label: string; quantity: number; unitRate: number; factor?: number }>;
  disbursements?: Array<{ label: string; amount: number }>;
  statutoryFees?: Array<{ label: string; amount: number }>;
  professionalOverride?: { amount: number; reason: string };
  discount?: { percentage: number; reason: string; appliesToDisbursements?: boolean; appliesToStatutoryFees?: boolean };
  vatApplicable: boolean;
}

export interface FeeLine {
  label: string;
  amount: number;
  taxable: boolean;
  discountable: boolean;
  note?: string;
}

export interface FeeCalculationResult {
  profession: Profession;
  sourceVersionId: string;
  formulaType: FormulaType;
  guidelineProfessionalFee: number;
  stageAdjustedFee: number;
  professionalFeeBeforeDiscount: number;
  discountAmount: number;
  professionalFeeAfterDiscount: number;
  disbursementsTotal: number;
  statutoryFeesTotal: number;
  vatAmount: number;
  totalInclVat: number;
  lines: FeeLine[];
  warnings: string[];
}

export interface PartyDetails {
  name: string;
  email?: string;
  phone?: string;
  registrationNumber?: string;
  company?: string;
  address?: string;
}

export interface ProjectDetails {
  name: string;
  clientName: string;
  location: string;
  description: string;
  reference?: string;
}

export interface ProposalInput {
  project: ProjectDetails;
  professional: PartyDetails;
  calculation: FeeCalculationResult;
  assumptions: string[];
  exclusions: string[];
  notes: string[];
  validityDays: number;
  selectedTermsTemplateIds: string[];
  customTerms: string[];
}

export interface ProposalDocument {
  id: string;
  title: string;
  status: 'draft' | 'issued';
  project: ProjectDetails;
  professional: PartyDetails;
  sections: Array<{ heading: string; body: string[] }>;
  totals: FeeCalculationResult;
  terms: string[];
  acceptance: string[];
  auditHash?: string;
  createdAt: string;
}
