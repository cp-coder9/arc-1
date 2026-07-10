// ─── RFQ Marketplace — Public API ────────────────────────────────────────────
// Barrel export for the Supplier RFQ Marketplace module (Module 6).
// All business logic lives in this service layer as pure functions with
// Firestore persistence via the existing getDemoDoc/getDemoCol pattern.

// ─── Types & Constants ──────────────────────────────────────────────────────
export type {
  RfqStatus,
  ProcurementStatus,
  RfqLineItem,
  EvaluationCriteria,
  VerificationStatus,
  InvitedSupplier,
  RfqDocument,
  QuoteStatus,
  QuoteAttachmentMimeType,
  QuoteAttachment,
  QuoteLineItem,
  QuoteResponse,
  RawScores,
  NormalizedScores,
  ScoredQuote,
  ComparisonResult,
  AwardRecommendationStatus,
  ConflictType,
  ConflictFlag,
  ApprovalRecord,
  AwardRecommendation,
  PerformanceMetrics,
  SupplierMarketplaceProfile,
  RfqErrorCode,
  RfqValidationError,
  ValidationResult,
  RfqCreationRole,
  AwardRecommendationRole,
} from './types';

export {
  RFQ_STATE_TRANSITIONS,
  isValidTransition,
  RFQ_ERROR_CODES,
  RFQ_ERROR_MESSAGES,
  MAX_INVITATION_LIST_SIZE,
  MAX_QUOTE_ATTACHMENTS,
  MAX_ATTACHMENT_SIZE_BYTES,
  MIN_DEADLINE_HOURS_AHEAD,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MIN_UNIT_PRICE,
  MAX_UNIT_PRICE,
  MIN_LEAD_TIME_DAYS,
  MAX_LEAD_TIME_DAYS,
  MIN_DELIVERY_TERMS_LENGTH,
  MIN_JUSTIFICATION_LENGTH,
  MIN_CONFLICT_ACK_LENGTH,
  MIN_BBEE_WEIGHT_PUBLIC_SECTOR,
  BBEE_VALUE_THRESHOLD,
  MAX_TRADE_CATEGORIES,
  MAX_DELIVERY_REGIONS,
  ALLOWED_ATTACHMENT_MIME_TYPES,
  RFQ_CREATION_ROLES,
  AWARD_RECOMMENDATION_ROLES,
} from './types';

// ─── RFQ Service ────────────────────────────────────────────────────────────
export {
  createRfq,
  getRfq,
  listRfqs,
  validateEvaluationCriteria,
  validateRfqSubmission,
  publishRfq,
  transitionToEvaluation,
  cancelRfq,
  awardRfq,
} from './rfqService';

// ─── Quote Service ──────────────────────────────────────────────────────────
export {
  submitQuote,
  reviseQuote,
  getQuote,
  listQuotes,
  validateQuoteAttachments,
  isBeforeDeadline,
  isSupplierInvited,
} from './quoteService';

// ─── Comparison Engine ──────────────────────────────────────────────────────
export {
  extractRawScores,
  normalizeScores,
  calculateWeightedScore,
  rankQuotes,
  generateComparison,
  getLineItemBreakdown,
  detectPriceScoreDivergence,
} from './comparisonEngine';

// ─── Award Service ──────────────────────────────────────────────────────────
export {
  createAwardRecommendation,
  checkConflictOfInterest,
  recordClientApproval,
  recordProfessionalApproval,
  rejectRecommendation,
  getAwardRecommendation,
  validateRecommendationCurrency,
} from './awardService';

export type { SupplierAffiliations, TeamMember } from './awardService';

// ─── Invitation Service ─────────────────────────────────────────────────────
export {
  discoverSuppliers,
  addToInvitationList,
  addSuppliersToPublishedRfq,
  removeFromInvitationList,
  getInvitationList,
} from './invitationService';

export type { SupplierDiscoveryFilters, SupplierDiscoveryResult } from './invitationService';

// ─── Notification Service ───────────────────────────────────────────────────
export {
  notifyRfqPublished,
  notifyDeadlineReminder,
  notifyQuoteSubmitted,
  notifyApprovalRequired,
  notifyZeroQuotes,
  retryNotification,
} from './rfqNotificationService';

export type { RfqNotificationPayload } from './rfqNotificationService';

// ─── Integration Service ────────────────────────────────────────────────────
export {
  writeBackToSpecForge,
  writeProjectPassportRecord,
  emitWorkflowEvent,
  logAuditEvent,
  getProcurementStatus,
  getPackageScopeLink,
} from './rfqIntegrationService';

export type {
  SpecForgeProcurementUpdate,
  RfqProjectRecord,
  RfqWorkflowEvent,
} from './rfqIntegrationService';

// ─── Supplier Profile Service ───────────────────────────────────────────────
export {
  createProfile,
  updateProfile,
  getProfile,
  calculatePerformanceMetrics,
  isNewSupplier,
  getVerificationStatus,
  searchMarketplace,
  validateProfileUpdate,
} from './supplierProfileService';

// ─── B-BBEE Compliance Service ──────────────────────────────────────────────
export {
  validateBbeeCriteria,
  getBbeeCertificateStatus,
  getBbeeWarnings,
  canFinaliseComparison,
  canProgressAward,
  calculateLocalContentPercentage,
  getLocalSpendWarnings,
} from './bbeeComplianceService';

export type {
  BbeeCertificateStatus,
  BbeeWarning,
  LocalSpendWarning,
} from './bbeeComplianceService';

// ─── RBAC Service ───────────────────────────────────────────────────────────
export {
  checkRfqCreationAccess,
  checkQuoteSubmissionAccess,
  checkAwardRecommendationAccess,
  checkApprovalAccess,
  filterRfqsForSupplier,
} from './rbacService';
