/**
 * Firestore persistence types for the Professional Fee Proposal Builder.
 * These interfaces map directly to Firestore collection documents.
 */

import type {
  Profession,
  FeeInput,
  FeeCalculationResult,
  ProposalDocument,
  StageDefinition,
} from '../types';

// ---------------------------------------------------------------------------
// SACAP-specific payload types (within source version)
// ---------------------------------------------------------------------------

export interface SACAPFeeTableBand {
  minValue: number;
  maxValue: number;
  feePercentage: number;
  baseFee?: number;
  rateAboveMin?: number;
}

export interface SACAPFeeTable {
  complexityLevel: 'low' | 'medium' | 'high';
  bands: SACAPFeeTableBand[];
}

export interface SACAPComplexityMatrixType {
  id: string;
  name: string;
  complexityLevel: 'low' | 'medium' | 'high';
  description?: string;
}

export interface SACAPComplexityMatrixCategory {
  id: string;
  name: string;
  types: SACAPComplexityMatrixType[];
}

export interface SACAPComplexityMatrix {
  categories: SACAPComplexityMatrixCategory[];
}

export interface PercentageBand {
  minValue: number;
  maxValue: number;
  percentage: number;
}

// ---------------------------------------------------------------------------
// Source version payload
// ---------------------------------------------------------------------------

export interface FeeSourceVersionPayload {
  feeTables?: SACAPFeeTable[];
  percentageBands?: PercentageBand[];
  stageWeightings?: StageDefinition[];
  complexityMatrix?: SACAPComplexityMatrix;
  hourlyRates?: Record<string, number>;
  disciplineFactors?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Firestore: fee_source_versions/{sourceId}
// ---------------------------------------------------------------------------

export type SourceVersionStatus = 'demo-seed' | 'draft' | 'verified' | 'retired';

export interface FeeSourceVersionRecord {
  id: string;
  profession: Profession;
  body: string;
  title: string;
  effectiveDate: string;
  boardNoticeRef?: string;
  status: SourceVersionStatus;
  payload: FeeSourceVersionPayload;
  contentHash: string;
  createdBy: string;
  approvedBy?: string;
  previousVersionId?: string;
  createdAt: string;
  verifiedAt?: string;
  retiredAt?: string;
}

// ---------------------------------------------------------------------------
// Firestore: fee_proposal_runs/{runId}
// ---------------------------------------------------------------------------

export type ExportFormat = 'pdf' | 'csv' | 'json';

export interface FeeProposalRun {
  runId: string;
  userId: string;
  profession: Profession;
  input: FeeInput;
  result: FeeCalculationResult;
  sourceVersionId: string;
  sourceVersionHash: string;
  projectId?: string;
  projectRecordId?: string;
  notes?: string;
  version: number;
  previousRunId?: string;
  createdAt: string;
  updatedAt: string;
  exportedAt?: string;
  exportFormat?: ExportFormat;
}

// ---------------------------------------------------------------------------
// Firestore: fee_proposals/{proposalId}
// ---------------------------------------------------------------------------

export type ProposalStatus = 'draft' | 'issued' | 'accepted' | 'superseded' | 'withdrawn';

export interface FeeProposalRecord {
  id: string;
  userId: string;
  profession: Profession;
  status: ProposalStatus;
  document: ProposalDocument;
  runId: string;
  sourceVersionId: string;
  projectId?: string;
  clientId?: string;
  validityDays: number;
  validUntil: string;
  responsibilityConfirmed: boolean;
  responsibilityConfirmedAt?: string;
  auditHash?: string;
  previousVersionId?: string;
  version: number;
  createdAt: string;
  issuedAt?: string;
  acceptedAt?: string;
}

// ---------------------------------------------------------------------------
// Firestore: fee_terms_templates/{templateId}
// ---------------------------------------------------------------------------

export interface TermsClause {
  id: string;
  text: string;
  editable: boolean;
  editedAt?: string;
}

export interface FeeTermsTemplateRecord {
  id: string;
  name: string;
  professionTags: string[];
  version: number;
  clauses: TermsClause[];
  legalReviewFlag: boolean;
  legalReviewedAt?: string;
  legalReviewedBy?: string;
  previousVersionId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
