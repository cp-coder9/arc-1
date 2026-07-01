/**
 * Zod validation schemas for Professional Fee Proposal Builder persistence records.
 * Used for runtime validation of Firestore documents and API payloads.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

export const ProfessionEnum = z.enum([
  'architect',
  'civilEngineer',
  'structuralEngineer',
  'electricalEngineer',
  'mechanicalEngineer',
  'fireEngineer',
  'quantitySurveyor',
  'townPlanner',
  'landSurveyor',
  'landscapeArchitect',
  'interiorDesigner',
  'constructionProjectManager',
]);

export const FormulaTypeEnum = z.enum([
  'slidingScale',
  'percentageOfCost',
  'stageApportioned',
  'timeBased',
  'areaUnit',
  'hybrid',
]);

export const SourceVersionStatusEnum = z.enum([
  'demo-seed',
  'draft',
  'verified',
  'retired',
]);

export const ProposalStatusEnum = z.enum([
  'draft',
  'issued',
  'accepted',
  'superseded',
  'withdrawn',
]);

export const ExportFormatEnum = z.enum(['pdf', 'csv', 'json']);

export const ComplexityLevelEnum = z.enum(['low', 'medium', 'high']);

// ---------------------------------------------------------------------------
// SACAP fee table schemas
// ---------------------------------------------------------------------------

export const SACAPFeeTableBandSchema = z.object({
  minValue: z.number().min(0),
  maxValue: z.number().min(0),
  feePercentage: z.number().min(0),
  baseFee: z.number().min(0).optional(),
  rateAboveMin: z.number().min(0).optional(),
});

export const SACAPFeeTableSchema = z.object({
  complexityLevel: ComplexityLevelEnum,
  bands: z.array(SACAPFeeTableBandSchema).min(1),
});

export const SACAPComplexityMatrixTypeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  complexityLevel: ComplexityLevelEnum,
  description: z.string().optional(),
});

export const SACAPComplexityMatrixCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  types: z.array(SACAPComplexityMatrixTypeSchema).min(1),
});

export const SACAPComplexityMatrixSchema = z.object({
  categories: z.array(SACAPComplexityMatrixCategorySchema).min(1),
});

export const PercentageBandSchema = z.object({
  minValue: z.number().min(0),
  maxValue: z.number().min(0),
  percentage: z.number().min(0),
});

// ---------------------------------------------------------------------------
// Stage definition schema (for payload)
// ---------------------------------------------------------------------------

export const StageDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  defaultWeight: z.number().min(0).max(1),
  deliverables: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Source version payload schema
// ---------------------------------------------------------------------------

export const FeeSourceVersionPayloadSchema = z.object({
  feeTables: z.array(SACAPFeeTableSchema).optional(),
  percentageBands: z.array(PercentageBandSchema).optional(),
  stageWeightings: z.array(StageDefinitionSchema).optional(),
  complexityMatrix: SACAPComplexityMatrixSchema.optional(),
  hourlyRates: z.record(z.string(), z.number().min(0)).optional(),
  disciplineFactors: z.record(z.string(), z.number().min(0)).optional(),
});

// ---------------------------------------------------------------------------
// FeeSourceVersionRecord schema
// ---------------------------------------------------------------------------

export const FeeSourceVersionRecordSchema = z.object({
  id: z.string().min(1),
  profession: ProfessionEnum,
  body: z.string().min(1),
  title: z.string().min(1),
  effectiveDate: z.string().min(1),
  boardNoticeRef: z.string().optional(),
  status: SourceVersionStatusEnum,
  payload: FeeSourceVersionPayloadSchema,
  contentHash: z.string().min(1),
  createdBy: z.string().min(1),
  approvedBy: z.string().optional(),
  previousVersionId: z.string().optional(),
  createdAt: z.string().min(1),
  verifiedAt: z.string().optional(),
  retiredAt: z.string().optional(),
});

// ---------------------------------------------------------------------------
// FeeInput schema (for embedding in run records)
// ---------------------------------------------------------------------------

const HourlyLineSchema = z.object({
  label: z.string().min(1),
  hours: z.number().min(0),
  rate: z.number().min(0),
});

const UnitLineSchema = z.object({
  label: z.string().min(1),
  quantity: z.number().min(0),
  unitRate: z.number().min(0),
  factor: z.number().optional(),
});

const DisbursementLineSchema = z.object({
  label: z.string().min(1),
  amount: z.number().min(0),
});

const StatutoryFeeLineSchema = z.object({
  label: z.string().min(1),
  amount: z.number().min(0),
});

const SelectedStageSchema = z.object({
  applicable: z.boolean(),
  reductionPercentage: z.number().min(0).max(100),
});

const ProfessionalOverrideSchema = z.object({
  amount: z.number().min(0),
  reason: z.string().min(1),
});

const DiscountSchema = z.object({
  percentage: z.number().min(0).max(100),
  reason: z.string(),
  appliesToDisbursements: z.boolean().optional(),
  appliesToStatutoryFees: z.boolean().optional(),
});

export const FeeInputSchema = z.object({
  profession: ProfessionEnum,
  projectValue: z.number().min(0),
  complexityId: z.string().min(1),
  workCategorySplits: z.record(z.string(), z.number()),
  selectedStages: z.record(z.string(), SelectedStageSchema),
  hourlyLines: z.array(HourlyLineSchema).optional(),
  unitLines: z.array(UnitLineSchema).optional(),
  disbursements: z.array(DisbursementLineSchema).optional(),
  statutoryFees: z.array(StatutoryFeeLineSchema).optional(),
  professionalOverride: ProfessionalOverrideSchema.optional(),
  discount: DiscountSchema.optional(),
  vatApplicable: z.boolean(),
});

// ---------------------------------------------------------------------------
// FeeCalculationResult schema (for embedding in run records)
// ---------------------------------------------------------------------------

const FeeLineSchema = z.object({
  label: z.string().min(1),
  amount: z.number(),
  taxable: z.boolean(),
  discountable: z.boolean(),
  note: z.string().optional(),
});

export const FeeCalculationResultSchema = z.object({
  profession: ProfessionEnum,
  sourceVersionId: z.string().min(1),
  formulaType: FormulaTypeEnum,
  guidelineProfessionalFee: z.number(),
  stageAdjustedFee: z.number(),
  professionalFeeBeforeDiscount: z.number(),
  discountAmount: z.number(),
  professionalFeeAfterDiscount: z.number(),
  disbursementsTotal: z.number(),
  statutoryFeesTotal: z.number(),
  vatAmount: z.number(),
  totalInclVat: z.number(),
  lines: z.array(FeeLineSchema),
  warnings: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// FeeProposalRun schema — fee_proposal_runs/{runId}
// ---------------------------------------------------------------------------

export const FeeProposalRunSchema = z.object({
  runId: z.string().min(1),
  userId: z.string().min(1),
  profession: ProfessionEnum,
  input: FeeInputSchema,
  result: FeeCalculationResultSchema,
  sourceVersionId: z.string().min(1),
  sourceVersionHash: z.string().min(1),
  projectId: z.string().optional(),
  projectRecordId: z.string().optional(),
  notes: z.string().optional(),
  version: z.number().int().min(1),
  previousRunId: z.string().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  exportedAt: z.string().optional(),
  exportFormat: ExportFormatEnum.optional(),
});

// ---------------------------------------------------------------------------
// ProposalDocument schema (embedded in FeeProposalRecord)
// ---------------------------------------------------------------------------

const PartyDetailsSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  phone: z.string().optional(),
  registrationNumber: z.string().optional(),
  company: z.string().optional(),
  address: z.string().optional(),
});

const ProjectDetailsSchema = z.object({
  name: z.string().min(1),
  clientName: z.string().min(1),
  location: z.string().min(1),
  description: z.string().min(1),
  reference: z.string().optional(),
});

const ProposalSectionSchema = z.object({
  heading: z.string().min(1),
  body: z.array(z.string()),
});

export const ProposalDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(['draft', 'issued']),
  project: ProjectDetailsSchema,
  professional: PartyDetailsSchema,
  sections: z.array(ProposalSectionSchema),
  totals: FeeCalculationResultSchema,
  terms: z.array(z.string()),
  acceptance: z.array(z.string()),
  auditHash: z.string().optional(),
  createdAt: z.string().min(1),
});

// ---------------------------------------------------------------------------
// FeeProposalRecord schema — fee_proposals/{proposalId}
// ---------------------------------------------------------------------------

export const FeeProposalRecordSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  profession: ProfessionEnum,
  status: ProposalStatusEnum,
  document: ProposalDocumentSchema,
  runId: z.string().min(1),
  sourceVersionId: z.string().min(1),
  projectId: z.string().optional(),
  clientId: z.string().optional(),
  validityDays: z.number().int().min(1),
  validUntil: z.string().min(1),
  responsibilityConfirmed: z.boolean(),
  responsibilityConfirmedAt: z.string().optional(),
  auditHash: z.string().optional(),
  previousVersionId: z.string().optional(),
  version: z.number().int().min(1),
  createdAt: z.string().min(1),
  issuedAt: z.string().optional(),
  acceptedAt: z.string().optional(),
});

// ---------------------------------------------------------------------------
// TermsClause and FeeTermsTemplateRecord schema — fee_terms_templates/{templateId}
// ---------------------------------------------------------------------------

export const TermsClauseSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  editable: z.boolean(),
  editedAt: z.string().optional(),
});

export const FeeTermsTemplateRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  professionTags: z.array(z.string()),
  version: z.number().int().min(1),
  clauses: z.array(TermsClauseSchema).min(1),
  legalReviewFlag: z.boolean(),
  legalReviewedAt: z.string().optional(),
  legalReviewedBy: z.string().optional(),
  previousVersionId: z.string().optional(),
  createdBy: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
