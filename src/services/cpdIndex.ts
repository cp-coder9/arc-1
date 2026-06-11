/**
 * CPD Assessment Platform — client-safe service barrel
 * Re-exports all browser-compatible CPD service modules.
 *
 * NOTE: Server-side certificate verification/hashing (cpdService.ts, which uses
 * `node:crypto`) must be imported directly by server code — it is NOT re-exported
 * here to keep the client bundle Node-free.
 */

// Types
export type {
  CPDProfessionalBody,
  CPDContentType,
  CPDAccreditationStatus,
  CPDQuestionType,
  CPDConnectorMode,
  CPDBodyRuleStatus,
  CPDCreditCalculationMethod,
  CPDCommercialModel,
  CPDPricingBasis,
  CPDApprovedCategory,
  CPDCategoryRule,
  CPDProfessionalBodyRuleSet,
  CPDCreditCalculationInput,
  CPDCreditCalculation,
  ArchitexBuiltEnvironmentRole,
  CPDRoleBodyMapping,
  CPDProfessionalProfile,
  CPDContentItem,
  CPDQuestionOption,
  CPDQuestion,
  CPDAssessmentDraft,
  CPDCourse,
  CPDAccreditationApplication,
  CPDAnswerSubmission,
  CPDAnswerResult,
  CPDAttempt,
  CPDCertificate,
  CPDRecord,
  CPDAssessmentAnalytics,
  CPDLecturerAnalytics,
  CPDPaymentSettings,
  CPDPriceCalculation,
  CPDAssessmentPurchase,
  CPDInstructorPayout,
} from './cpdTypes';

// Category rules engine
export {
  getProfessionalBodyRuleSet,
  calculateCPDCredits,
  isCategoryOneStrategicTarget,
  getRuleSetResearchStatus,
} from './cpdCategoryRulesService';

// Role-to-body mapping
export {
  getRoleBodyMapping,
  listRoleBodyMappings,
} from './cpdRoleBodyMappingService';

// Assessment generation
export {
  generateAssessmentDraft,
  validateDraftForHumanReview,
} from './cpdAssessmentGeneratorService';

// Accreditation workflow
export {
  createAccreditationApplication,
  publishCourseAfterAccreditation,
  scoreAttempt,
  issueRecordAfterPass,
} from './cpdAccreditationWorkflowService';

// Certificate service
export {
  createCertificateAfterPass,
  renderCertificateText,
} from './cpdCertificateService';

// Payment service
export {
  recommendAssessmentPrice,
  calculateAssessmentPrice,
  createAssessmentPurchase,
  markPurchasePaid,
  createInstructorPayout,
  canStartPaidAssessment,
} from './cpdPaymentService';

// Analytics service
export {
  calculateAssessmentAnalytics,
  calculateLecturerAnalytics,
} from './cpdAnalyticsService';
