// Marketplace Feature Module — Public Exports

// Components
export { default as MarketplaceShell } from './components/MarketplaceShell';
export {
  MARKETPLACE_SECTIONS,
  getPermittedSections,
  hasMarketplaceAccess,
} from './components/MarketplaceShell';
export type { MarketplaceSection } from './components/MarketplaceShell';

// Services
export { logMarketplaceAction } from './services/marketplaceAuditService';
export type { MarketplaceAuditEntry, LogMarketplaceActionParams } from './services/marketplaceAuditService';

// Types
export type {
  // Trust Score
  TrustScoreFactorType,
  TrustScoreFactor,
  TrustScore,
  TrustBadge,
  // Compliance Search
  ComplianceSearchQuery,
  ComplianceSearchResult,
  AutoSuggestion,
  // Project Marketplace
  ProjectPosting,
  ProjectPostingStatus,
  ProjectProposal,
  ProposalStatus,
  ProposalMilestone,
  RecentProject,
  // Task Marketplace
  TaskPosting,
  DeliverableFormat,
  TaskPostingStatus,
  TaskApplication,
  TaskDeliverable,
  DeliverableFile,
  // Supplier & Material Marketplace
  MaterialListing,
  CertificationDoc,
  QuoteRequest,
  QuoteRequestStatus,
  // Freelancer Hub
  FreelancerProfile,
  FreelancerSkill,
  TaskHistoryEntry,
  FreelancerProfileView,
  DisputeEntry,
  // Firm Collaboration
  FirmCollaborationPosting,
  CollaborationMember,
  CollaborationInvite,
  // RBAC
  MarketplaceAction,
  RbacCheckResult,
  // Compliance Certificate
  ComplianceCertificateData,
  CertificateProfessional,
  MilestoneAuditResult,
  EscrowConfirmation,
  // Error Handling
  MarketplaceError,
} from './types';

// Services
export { checkMarketplacePermission } from './services/marketplaceRbacService';

// Trust Score Engine
export {
  computeScoreFromInputs,
  computeRegistrationScore,
  computeCpdScore,
  computeProjectCompletionScore,
  computeAuditPassScore,
  computeRatingsScore,
  computeToolMasteryScore,
  computeDisputeFreeScore,
  computeTrustScore,
  getTrustScore,
  recalculateOnEvent,
  fetchFactorInputs,
  persistTrustScore,
  clearPendingRecalculations,
  FACTOR_WEIGHTS,
} from './services/trustScoreService';
export type { TrustScoreEvent, TrustScoreFactorInputs } from './services/trustScoreService';

// Compliance Search Engine
export {
  search as complianceSearch,
  getSuggestions,
  getNoResultsInfo,
  applyHysteresis,
  meetsComplianceCriteria,
  computeExclusionCriteria,
  sortResults as sortSearchResults,
  toSearchResult,
  buildNoResultsMessage,
  markUserExcluded,
  isUserExcluded,
  clearHysteresisState,
  fetchProfessionalRecords,
  fetchSuggestionSources,
  TRUST_SCORE_EXCLUSION_THRESHOLD,
  TRUST_SCORE_REINCLUSION_THRESHOLD,
  MAX_SUGGESTIONS,
  MIN_SUGGESTION_INPUT_LENGTH,
} from './services/complianceSearchService';
export type { ProfessionalRecord, ExclusionCriteria, NoResultsMessage } from './services/complianceSearchService';

// Task Marketplace Service
export {
  validateTaskPosting,
  checkFreelancerEligibility,
  createTaskPosting,
  applyToTask,
  acceptApplication,
  validateToolIds as validateTaskToolIds,
  fetchFreelancerApplicationData,
  createTaskEscrowHolding,
} from './services/taskMarketplaceService';
export type {
  CreateTaskPostingInput,
  ValidationResult as TaskValidationResult,
  FreelancerEligibilityResult,
  ToolValidationResult as TaskToolValidationResult,
  FreelancerApplicationData,
} from './services/taskMarketplaceService';

// Supplier Marketplace Service
export {
  validateMaterialListingInput,
  createMaterialListing,
  searchMaterials,
  validateSupplierStatus,
  requestQuote,
  respondToQuote,
  acceptQuote,
  handleQuoteExpiry,
  handleDeliveryNoteTimeout,
  evaluateQuoteExpiry,
} from './services/supplierMarketplaceService';
export type {
  CreateMaterialListingInput,
  CertificationDocInput,
  MaterialSearchQuery,
  MaterialListingUser,
  ValidationResult as MaterialValidationResult,
  RequestQuoteParams,
} from './services/supplierMarketplaceService';

// Task Delivery Service
export {
  validateDeliverableFormat,
  canResubmit,
  isPaymentReleasable,
  submitDeliverable,
  signOffDeliverable,
  handleAiReviewRejection,
  handleAiReviewPass,
  handleTaskFailure,
  routeToAiReview,
  storeInDocumentVault,
  notifyUser as notifyMarketplaceUser,
  triggerEscrowRelease,
  queueDocumentStorageRetry,
} from './services/taskDeliveryService';

// Project Marketplace Service
export {
  createProjectPosting,
  getVisiblePostings,
  handlePostingExpiry,
  withdrawPosting,
  applyToProject,
  acceptProposal,
  validateProjectPostingInput,
  checkProfessionalEligibility,
} from './services/projectMarketplaceService';
export type {
  ProfessionalEligibility,
  ProposalSubmissionData,
  ProfessionalApplicationData,
  CreateProjectPostingInput,
  ProjectPostingUser,
  ValidationResult,
} from './services/projectMarketplaceService';

// Firm Collaboration Service
export {
  validateCollaborationPosting,
  checkInviteeEligibility,
  checkPostingAccess,
  createCollaboration,
  inviteMember,
  markComplete,
  grantTemplateAccess,
  revokeTemplateAccess,
  fetchInviteeTrustScore,
  fetchInviteeRegistration,
  triggerTrustScoreRecalculation,
} from './services/firmCollaborationService';
export type {
  CreateCollaborationInput,
  CollaborationUser,
  ParticipantRating,
  InviteeEligibilityResult,
  ValidationResult as CollaborationValidationResult,
} from './services/firmCollaborationService';

// Marketplace Escrow Integration Service
export {
  checkReleaseConditions,
  evaluateTransitionAllowed,
  createMarketplaceEscrow,
  requestEscrowRelease,
  handleEscrowDispute,
  logEscrowRelease,
  handleRejectedTransition,
  _resetEscrowState,
  _getEscrowHolding,
} from './services/marketplaceEscrowService';
export type {
  MarketplaceEscrowType,
  MilestoneDefinition,
  CreateMarketplaceEscrowParams,
  MarketplaceEscrowHolding,
  ReleaseConditions,
  RequestEscrowReleaseParams,
  EscrowReleaseResult,
  EscrowReleaseLog,
  HandleEscrowDisputeParams,
  EscrowDisputeResult,
  LogEscrowReleaseParams,
  HandleRejectedTransitionParams,
  RejectedTransitionResult,
  TransitionAllowedResult,
} from './services/marketplaceEscrowService';

// Compliance Certificate Service
export {
  validateCertificateData,
  assembleCertificateData,
  generateCertificate,
  checkCertificateReadiness,
  withholdCertificate,
  fetchProjectMilestones,
  fetchProjectProfessionals,
  fetchProjectSansReferences,
  fetchProjectTools,
  fetchEscrowConfirmations,
  generatePdf,
  storeCertificateInVault,
  notifyClient,
  SANS_10400_VERIFICATION_STATEMENT,
} from './services/complianceCertificateService';
export type {
  ProjectMilestone,
  CertificateReadinessResult,
  CertificateAssemblyInput,
  CertificateValidationResult,
  GenerateCertificateResult,
} from './services/complianceCertificateService';

// Freelancer Hub Service
export {
  createProfile,
  getProfile,
  getProfileView,
  validateFreelancerProfile,
  canApplyToTasks,
  fetchCpdStatus,
  fetchTrustScore as fetchFreelancerTrustScore,
  fetchTaskStats,
  fetchToolUsageFrequency,
  fetchAiAuditPassRate,
  fetchDisputeHistory,
  validateToolIds as validateFreelancerToolIds,
} from './services/freelancerHubService';
export type {
  CreateFreelancerProfileInput,
  FreelancerProfileValidationResult,
} from './services/freelancerHubService';

// Verification Gates & Anti-Gaming Service
export {
  checkProfessionalVerification,
  fileDispute as fileMarketplaceDispute,
  suspendUserMarketplaceActivity,
  validateReviewEligibility,
  isRankingFactorAllowed,
  validateFeatureAllowed,
  PROHIBITED_FEATURES as VERIFICATION_PROHIBITED_FEATURES,
} from './services/verificationGatesService';
export type {
  VerificationCheckResult,
  DisputeFilingParams,
  MarketplaceDispute,
} from './services/verificationGatesService';

// Platform Integration Service
export {
  writeToProjectPassport,
  logToAuditTrail,
  validateToolIds as validatePlatformToolIds,
  checkCpdCompliance,
  surfaceToActionCentre,
  storeDeliverable,
  processPendingDeliverables,
  getPendingDeliverableCount,
  routeToAiReview as routeDeliverableToAiReview,
  getVerificationStatus,
} from './services/platformIntegrationService';
export type {
  ProjectPassportWriteParams,
  AuditTrailLogParams,
  ActionCentreParams,
  StoreDeliverableParams,
  StoreDeliverableResult,
  VerificationStatusResult,
  CpdComplianceResult,
  ToolValidationResult as PlatformToolValidationResult,
} from './services/platformIntegrationService';
