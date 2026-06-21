export { FeeCalculatorEngine } from './feeEngine';
export { ProfessionProfileRegistry } from './profiles';
export { ProfessionFeeService } from './professionFeeService';
export { ProposalBuilderService } from './proposalBuilder';
export { TermsLibraryService } from './terms';
export { FeeGuideWatchRegistry, FeeGuideUpdateService } from './guidelineUpdateService';
export { toProjectRecord, toInboxEvent, toAppointmentDraft } from './adapters';
export { id, roundMoney } from './ids';
export type {
  Profession, FormulaType, SourceVersion, StageDefinition, ComplexityOption,
  WorkCategory, ProfessionProfile, FeeInput, FeeLine, FeeCalculationResult,
  PartyDetails, ProjectDetails, ProposalInput, ProposalDocument,
} from './types';
