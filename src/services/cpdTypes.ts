export type CPDProfessionalBody = string;

export type CPDContentType =
  | 'webinar_recording'
  | 'live_webinar'
  | 'transcript'
  | 'article'
  | 'refereed_article'
  | 'magazine_reading'
  | 'slide_deck'
  | 'external_partner_course'
  | 'platform_training_course'
  | 'municipal_or_regulatory_guide';

export type CPDAccreditationStatus =
  | 'draft'
  | 'internal_review'
  | 'submitted_to_partner'
  | 'changes_requested'
  | 'accredited'
  | 'expired'
  | 'archived';

export type CPDQuestionType =
  | 'multiple_choice'
  | 'multiple_select'
  | 'true_false'
  | 'scenario_mcq'
  | 'short_answer'
  | 'reflection';

export type CPDConnectorMode = 'api' | 'portal_assisted' | 'document_export' | 'email_submission' | 'manual_record';

export type CPDBodyRuleStatus = 'researched_official' | 'preliminary_needs_body_confirmation' | 'partner_confirmed_required';

export type CPDCreditCalculationMethod = 'hours_to_credits' | 'points_per_hour' | 'body_specific_formula' | 'partner_approved_value_only';

export type CPDCommercialModel =
  | 'free_launch_or_partner_funnel'
  | 'paid_webinar_addon_assessment'
  | 'standalone_article_based_assessment'
  | 'dedicated_cpd_course_assessment'
  | 'partner_bundle_included';

export type CPDPricingBasis =
  | 'admin_fixed'
  | 'content_owner_proposed_admin_approved'
  | 'duration_category_credit_formula'
  | 'partner_contract_included'
  | 'free_funnel';

export type CPDApprovedCategory =
  | 'category_1_developmental_activity'
  | 'category_2_work_based_activity'
  | 'category_3_individual_activity'
  | 'planning_category_a_professional_knowledge'
  | 'planning_category_b_mentorship'
  | 'planning_category_c_active_participation'
  | 'engineering_category_1_developmental_activity'
  | 'engineering_category_2_work_based_activity'
  | 'engineering_category_3_individual_activity'
  | 'sacpcmp_professional_practice'
  | 'sacpcmp_personal_development'
  | 'sacpcmp_mentorship'
  | 'sacpcmp_pppi'
  | 'quantity_surveying_category_1'
  | 'quantity_surveying_category_2'
  | 'landscape_category_1_personal_professional_development'
  | 'landscape_category_2_further_studies'
  | 'landscape_category_3_research_publications'
  | 'landscape_category_4_teaching_training'
  | 'landscape_category_5_professional_practice'
  | 'landscape_category_6_professional_community_engagement'
  | 'geomatics_category_1_developmental_activity'
  | 'geomatics_category_2_work_based_activity'
  | 'geomatics_category_3_individual_activity'
  | 'valuation_compliance_status_only'
  | 'body_specific_category_to_be_confirmed';

export interface CPDCategoryRule {
  id: string;
  label: string;
  approvedCategory: CPDApprovedCategory;
  required: boolean;
  calculationMethod: CPDCreditCalculationMethod;
  hoursPerCredit?: number;
  creditsPerHour?: number;
  annualMinimumCredits?: number;
  cycleMinimumCredits?: number;
  annualMaximumCredits?: number;
  cycleMaximumCredits?: number;
  maxCreditsClaimableInOneYear?: number;
  examples: string[];
  notes?: string;
}

export interface CPDProfessionalBodyRuleSet {
  professionalBody: CPDProfessionalBody;
  status: CPDBodyRuleStatus;
  sourceSummary: string;
  cycleYears?: number;
  annualTotalTargetCredits?: number;
  cycleTotalTargetCredits?: number;
  category1AnnualMinimumCredits?: number;
  category1CycleMinimumCredits?: number;
  category1MaxCreditsClaimableInOneYear?: number;
  categories: CPDCategoryRule[];
}

export interface CPDCreditCalculationInput {
  professionalBody: CPDProfessionalBody;
  approvedCategory: CPDApprovedCategory;
  durationHours: number;
  approvedCreditsOverride?: number;
}

export interface CPDCreditCalculation {
  professionalBody: CPDProfessionalBody;
  approvedCategory: CPDApprovedCategory;
  creditUnitLabel: 'credits' | 'points' | 'hours';
  calculatedCredits: number;
  calculationConfidence: 'confirmed_from_accreditor' | 'rule_based_estimate' | 'needs_partner_confirmation';
  notes: string[];
}

export type ArchitexBuiltEnvironmentRole = string;

export interface CPDRoleBodyMapping {
  role: ArchitexBuiltEnvironmentRole;
  professionalBody: CPDProfessionalBody;
  registrationCategoryExamples: string[];
  defaultApprovedCategory: CPDApprovedCategory;
  cpdRequired: boolean;
  workflowImplication: string;
  confidence: 'researched_official' | 'preliminary_needs_body_confirmation' | 'manual_confirmation_required';
}

export interface CPDProfessionalProfile {
  userId: string;
  fullName: string;
  email?: string;
  profession: string;
  professionalBody: CPDProfessionalBody;
  registrationNumber?: string;
  cpdCycleStart?: string;
  cpdCycleEnd?: string;
}

export interface CPDContentItem {
  id: string;
  title: string;
  contentType: CPDContentType;
  sourceUrl?: string;
  transcript?: string;
  providerName: string;
  presenterNames: string[];
  durationMinutes?: number;
  permissionStatus: 'owned_by_architex' | 'partner_permission_granted' | 'permission_required' | 'public_reference_only';
  targetBodies: CPDProfessionalBody[];
  learningOutcomes: string[];
  createdByUserId: string;
}

export interface CPDQuestionOption {
  id: string;
  label: string;
}

export interface CPDQuestion {
  id: string;
  type: CPDQuestionType;
  prompt: string;
  options: CPDQuestionOption[];
  correctOptionIds?: string[];
  modelAnswer?: string;
  explanation: string;
  learningOutcome: string;
  sourceReference?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  points: number;
  autoMarkable: boolean;
  requiresManualReview: boolean;
}

export interface CPDAssessmentDraft {
  id: string;
  contentItemId: string;
  generatedBy: 'ai' | 'human' | 'hybrid';
  title: string;
  questions: CPDQuestion[];
  passMarkPercent: number;
  timeLimitMinutes?: number;
  allowedAttempts: number;
  reviewStatus: 'draft' | 'creator_review' | 'cpd_reviewer_review' | 'approved_for_accreditation' | 'approved_live' | 'rejected';
  riskFlags: string[];
}

export interface CPDCourse {
  id: string;
  contentItemId: string;
  assessmentId: string;
  title: string;
  approvedCredits: number;
  professionalBodies: CPDProfessionalBody[];
  accreditationReference?: string;
  validFrom?: string;
  validUntil?: string;
  providerName: string;
  certificateTemplateId: string;
  status: 'draft' | 'live' | 'closed';
  assessmentPriceRand?: number;
  contentOwnerUserId?: string;
  monetizationEnabled?: boolean;
  commercialModel?: CPDCommercialModel;
  pricingBasis?: CPDPricingBasis;
  approvedCategory?: CPDApprovedCategory;
  expectedAssessmentMinutes?: number;
  contentOwnerProposedPriceRand?: number;
  adminApprovedPriceRand?: number;
}

export interface CPDAccreditationApplication {
  id: string;
  courseId: string;
  assessmentId: string;
  provider: 'CPD Central' | 'Voluntary Association' | 'Council/Professional Body' | 'Architex Future Provider';
  targetBodies: CPDProfessionalBody[];
  connectorMode: CPDConnectorMode;
  status: CPDAccreditationStatus;
  requestedCredits: number;
  approvedCredits?: number;
  accreditationReference?: string;
  validFrom?: string;
  validUntil?: string;
  reviewerNotes?: string[];
}

export interface CPDAnswerSubmission {
  questionId: string;
  selectedOptionIds?: string[];
  textAnswer?: string;
}

export interface CPDAnswerResult {
  questionId: string;
  awardedPoints: number;
  maxPoints: number;
  correct: boolean;
  needsManualReview: boolean;
}

export interface CPDAttempt {
  id: string;
  assessmentId: string;
  courseId: string;
  userId: string;
  answers: CPDAnswerSubmission[];
  results: CPDAnswerResult[];
  scorePercent: number;
  passed: boolean;
  submittedAt: string;
  attemptNumber: number;
  certificateId?: string;
  manualReviewRequired: boolean;
}

export interface CPDCertificate {
  id: string;
  userId: string;
  learnerName: string;
  professionalBody: CPDProfessionalBody;
  registrationNumber?: string;
  courseId: string;
  courseTitle: string;
  providerName: string;
  accreditationReference?: string;
  creditsAwarded: number;
  passed: boolean;
  issueDate: string;
  verificationCode: string;
  verificationUrl: string;
  pdfPath?: string;
}

export interface CPDRecord {
  id: string;
  userId: string;
  courseId: string;
  professionalBody: CPDProfessionalBody;
  creditsAwarded: number;
  certificateId: string;
  issuedAt: string;
  verificationCode: string;
}

export interface CPDAssessmentAnalytics {
  assessmentId: string;
  courseId: string;
  totalAttempts: number;
  uniqueLearners: number;
  passRatePercent: number;
  averageScorePercent: number;
  questionStats: Array<{
    questionId: string;
    correctRatePercent: number;
    averageAwardedPoints: number;
    attempts: number;
  }>;
}

export interface CPDLecturerAnalytics {
  lecturerUserId: string;
  courseIds: string[];
  totalLearners: number;
  totalAttempts: number;
  passRatePercent: number;
  averageScorePercent: number;
}

export interface CPDPaymentSettings {
  id: string;
  enabled: boolean;
  defaultAssessmentPriceRand: number;
  platformFeePercent: number;
  minimumPlatformFeeRand?: number;
  fixedPlatformFeeRand?: number;
  currency: 'ZAR';
  paymentProviders: Array<'payfast' | 'yoco' | 'stripe' | 'manual_eft' | 'other'>;
  contentOwnerPayoutEnabled: boolean;
  updatedByUserId: string;
  updatedAt: string;
}

export interface CPDPriceCalculation {
  assessmentPriceRand: number;
  platformFeeRand: number;
  contentOwnerNetRand: number;
  platformFeePercent: number;
  minimumPlatformFeeRand?: number;
  fixedPlatformFeeRand?: number;
}

export interface CPDAssessmentPurchase {
  id: string;
  courseId: string;
  learnerUserId: string;
  contentOwnerUserId: string;
  assessmentPriceRand: number;
  platformFeeRand: number;
  contentOwnerNetRand: number;
  platformFeePercent: number;
  paymentProvider: 'payfast' | 'yoco' | 'stripe' | 'manual_eft' | 'other';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  providerReference?: string;
  createdAt: string;
  paidAt?: string;
}

export interface CPDInstructorPayout {
  id: string;
  contentOwnerUserId: string;
  purchaseIds: string[];
  grossRand: number;
  platformFeeRand: number;
  payoutRand: number;
  payoutStatus: 'pending' | 'processing' | 'paid' | 'failed';
  createdAt: string;
  paidAt?: string;
}
