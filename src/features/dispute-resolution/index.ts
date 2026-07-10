/**
 * Dispute Resolution Module
 *
 * Manages formal construction claims, evidence linkage, quantum/delay analysis,
 * notice timelines, and adjudication workflows under South African standard
 * contract forms (JBCC PBA, NEC ECC, GCC 2025, FIDIC).
 *
 * Integrates with: Project Passport, Action Centre, Contract Administration,
 * Finance, Audit Trail, and the p1-shared Working Day Calculator.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  ClaimType,
  ClaimStage,
  ResponseSubState,
  EvidenceRelevance,
  CostCategory,
  DelayType,
  ResponsibleParty,
  AdjudicationStage,
  FormalClaim,
  EvidenceLink,
  NoticeDeadline,
  QuantumLineItem,
  QuantumAssessment,
  DelayEvent,
  DelayAnalysis,
  Adjudication,
} from './types';

// ─── Schemas ──────────────────────────────────────────────────────────────────

export {
  formalClaimSchema,
  evidenceLinkSchema,
  quantumLineItemSchema,
  delayEventSchema,
  adjudicationSchema,
} from './schemas';

export type {
  FormalClaimInput,
  EvidenceLinkInput,
  QuantumLineItemInput,
  DelayEventInput,
  AdjudicationInput,
} from './schemas';

// ─── Service Factories ────────────────────────────────────────────────────────

export { createDisputeEngineService } from './services/disputeEngineService';
export type {
  DisputeEngineService,
  DisputeEngineServiceOptions,
  TransitionInput,
  ClaimsDashboard,
} from './services/disputeEngineService';

export { createNoticeTimelineService } from './services/noticeTimelineService';
export type {
  NoticeTimelineService,
  CreateNoticeTimelineServiceOptions,
  ContractDataSheetForTimeline,
  TimelineMilestone,
  TimelineVisualisationData,
} from './services/noticeTimelineService';

export { createQuantumAnalyserService } from './services/quantumAnalyserService';
export type {
  QuantumAnalyserService,
  QuantumAnalyserServiceOptions,
} from './services/quantumAnalyserService';

export { createAdjudicationService } from './services/adjudicationService';
export type {
  AdjudicationService,
  AdjudicationServiceOptions,
  RecordDecisionInput,
} from './services/adjudicationService';

export { createEvidenceLinkageService } from './services/evidenceLinkageService';
export type {
  EvidenceLinkageService,
  EvidenceLinkageServiceOptions,
  ClaimState,
  EvidenceScheduleItem,
  SourceAvailabilityResult,
} from './services/evidenceLinkageService';

// ─── Adapters ─────────────────────────────────────────────────────────────────

export { createDisputePassportAdapter, computeDisputeHealthCard } from './adapters/passportAdapter';
export type { DisputePassportAdapter, DisputeHealthCardData } from './adapters/passportAdapter';

export { createDisputeActionCentreAdapter, determinePriority } from './adapters/actionCentreAdapter';
export type {
  DisputeActionCentreAdapter,
  DeadlineWarningInput,
  SubmissionDeadlineInput,
  OverdueNoticeInput,
  SyncFailureInput,
} from './adapters/actionCentreAdapter';

export { createDisputeContractAdminAdapter } from './adapters/contractAdminAdapter';
export type {
  DisputeContractAdminAdapter,
  CrossReferencePayload,
  ResolutionWriteBackPayload,
  AdjudicationOutcomePayload,
  EvidencePrePopulatePayload,
} from './adapters/contractAdminAdapter';

export { createDisputeFinanceAdapter } from './adapters/financeAdapter';
export type {
  DisputeFinanceAdapter,
  PaymentInstructionInput,
  PaymentInstructionRef,
} from './adapters/financeAdapter';

// ─── Access Control ───────────────────────────────────────────────────────────

export {
  checkDisputeAccess,
  getDisputePermittedActions,
  canRegisterClaim,
  canManageClaims,
  canViewClaims,
} from './services/accessControl';

// ─── Components ───────────────────────────────────────────────────────────────

export {
  DisputeResolutionView,
  ClaimsRegisterPanel,
  ClaimDetailView,
  NoticeTimelineVisualisation,
  QuantumAnalyserPanel,
  DelayAnalysisPanel,
  EvidenceSchedulePanel,
  AdjudicationWorkflowView,
} from './components';
