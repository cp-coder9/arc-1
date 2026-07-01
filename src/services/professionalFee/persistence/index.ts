/**
 * Barrel exports for Professional Fee Proposal Builder persistence layer.
 */

// Types
export type {
  SACAPFeeTableBand,
  SACAPFeeTable,
  SACAPComplexityMatrixType,
  SACAPComplexityMatrixCategory,
  SACAPComplexityMatrix,
  PercentageBand,
  FeeSourceVersionPayload,
  SourceVersionStatus,
  FeeSourceVersionRecord,
  ExportFormat,
  FeeProposalRun,
  ProposalStatus,
  FeeProposalRecord,
  TermsClause,
  FeeTermsTemplateRecord,
} from './types';

// Schemas
export {
  ProfessionEnum,
  FormulaTypeEnum,
  SourceVersionStatusEnum,
  ProposalStatusEnum,
  ExportFormatEnum,
  ComplexityLevelEnum,
  SACAPFeeTableBandSchema,
  SACAPFeeTableSchema,
  SACAPComplexityMatrixTypeSchema,
  SACAPComplexityMatrixCategorySchema,
  SACAPComplexityMatrixSchema,
  PercentageBandSchema,
  StageDefinitionSchema,
  FeeSourceVersionPayloadSchema,
  FeeSourceVersionRecordSchema,
  FeeInputSchema,
  FeeCalculationResultSchema,
  FeeProposalRunSchema,
  ProposalDocumentSchema,
  FeeProposalRecordSchema,
  TermsClauseSchema,
  FeeTermsTemplateRecordSchema,
} from './schemas';

// Services
export {
  RunPersistenceService,
  InMemoryFirestoreAdapter,
} from './runPersistenceService';

export type {
  FirestoreAdapter,
  FirestoreQuery,
} from './runPersistenceService';
