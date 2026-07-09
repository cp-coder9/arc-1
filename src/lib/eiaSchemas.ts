/**
 * Zod validation schemas for EIA & Environmental Compliance Workspace
 * Covers: NEMA screening, EAP management, Basic Assessment, Full EIA,
 * Authorization, EMPr, Public Participation, Green Building (Green Star SA, EDGE, Net Zero)
 *
 * Requirements: 2.2, 2.9, 3.1, 3.8, 4.3, 6.1, 6.3, 7.1–7.3, 8.1, 9.3, 10.2, 10.8, 11.1–11.2
 */

import { z } from 'zod';

// ─── Enums ───────────────────────────────────────────────────────────────────

export const ScreeningRecommendationEnum = z.enum([
  'no_eia_required',
  'basic_assessment',
  'full_scoping_eia',
]);

export const BAPhaseEnum = z.enum([
  'application_submission',
  'application_acceptance',
  'bar_preparation',
  'public_participation',
  'bar_finalization',
  'bar_submission',
  'authority_review',
  'decision',
]);

export const FullEIAPhaseEnum = z.enum([
  'application_submission',
  'application_acceptance',
  'scoping_preparation',
  'scoping_public_participation',
  'scoping_submission',
  'scoping_acceptance',
  'specialist_studies',
  'eir_preparation',
  'eir_public_participation',
  'eir_submission',
  'authority_review',
  'decision',
]);

export const PhaseStatusEnum = z.enum(['pending', 'active', 'completed', 'overdue']);

export const AssessmentTypeEnum = z.enum(['basic_assessment', 'full_scoping_eia']);

export const AuthorizationStatusEnum = z.enum([
  'pending_decision',
  'authorized',
  'authorized_with_conditions',
  'refused',
  'appealed',
  'lapsed',
  'amended',
]);

export const ConditionComplianceStatusEnum = z.enum([
  'not_started',
  'in_progress',
  'complied',
  'non_compliant',
]);

export const EMPrPhaseEnum = z.enum([
  'pre-construction',
  'construction',
  'operation',
  'rehabilitation',
]);

export const MonitoringFrequencyEnum = z.enum([
  'daily',
  'weekly',
  'monthly',
  'event-triggered',
]);

export const EMPrComplianceStatusEnum = z.enum([
  'compliant',
  'non_compliant',
  'not_yet_applicable',
]);

export const RegistrationMethodEnum = z.enum([
  'written_request',
  'site_notice',
  'advertisement_response',
  'organ_of_state',
]);

export const InterestCategoryEnum = z.enum([
  'adjacent_owner',
  'community_member',
  'organ_of_state',
  'ngo',
  'other',
]);

export const NotificationTypeEIAEnum = z.enum([
  'site_notice',
  'newspaper_advertisement',
  'written_notice',
  'bid_distribution',
]);

export const CreditCategoryEnum = z.enum([
  'management',
  'ieq',
  'energy',
  'transport',
  'water',
  'materials',
  'land_use_ecology',
  'emissions',
  'innovation',
]);

export const EvidenceStatusEnum = z.enum([
  'not_started',
  'in_progress',
  'submitted',
  'verified',
]);

export const RatingToolEnum = z.enum([
  'office_v1',
  'residential_v1',
  'retail_v1',
  'public_education_v1',
  'custom',
]);

export const EDGECategoryEnum = z.enum(['energy', 'water', 'embodied_energy_materials']);

export const EDGELevelEnum = z.enum([
  'not_eligible',
  'edge_certified',
  'edge_advanced',
  'edge_zero_carbon',
]);

export const EDGEStageEnum = z.enum([
  'preliminary_design',
  'post_construction',
  'certified',
]);

export const NetZeroTargetTypeEnum = z.enum([
  'net_zero_carbon',
  'net_zero_energy',
  'net_zero_water',
]);

export const SpecialistStudyTypeEnum = z.enum([
  'ecological',
  'heritage',
  'geotechnical',
  'traffic',
  'visual',
  'noise',
  'socio-economic',
  'agricultural',
]);

export const SpecialistStudyStatusEnum = z.enum([
  'appointed',
  'in_progress',
  'draft_complete',
  'final',
]);

export const EAPVerificationStatusEnum = z.enum(['verified', 'unverified', 'expired']);

export const EAPAssignmentStatusEnum = z.enum(['active', 'replaced', 'withdrawn']);

export const ListingNoticeEnum = z.enum(['GN_R983', 'GN_R984', 'GN_R985']);

// ─── Screening Schemas (Req 2.2, 2.9) ───────────────────────────────────────

export const ScreeningInputSchema = z.object({
  activityType: z.string().min(1, 'Activity type is required'),
  totalSiteArea: z.number().int().min(1, 'Total site area must be at least 1 m²').max(999_999_999, 'Total site area must not exceed 999,999,999 m²'),
  developmentFootprint: z.number().int().min(1, 'Development footprint must be at least 1 m²').max(999_999_999, 'Development footprint must not exceed 999,999,999 m²'),
  province: z.string().min(1, 'Province is required'),
  municipality: z.string().min(1, 'Municipality is required'),
  proximityWatercourse: z.number().min(0, 'Proximity to watercourse cannot be negative').max(99_999, 'Proximity to watercourse must not exceed 99,999 m'),
  proximityCoastal: z.number().min(0, 'Proximity to coastal area cannot be negative').max(99_999, 'Proximity to coastal area must not exceed 99,999 m'),
  proximityProtectedArea: z.number().min(0, 'Proximity to protected area cannot be negative').max(99_999, 'Proximity to protected area must not exceed 99,999 m'),
  landUseZone: z.string().min(1, 'Land use zone is required'),
  withinListedGeographicArea: z.boolean(),
});

export const TriggeredActivitySchema = z.object({
  listingNotice: ListingNoticeEnum,
  activityNumber: z.string().min(1),
  description: z.string().max(500, 'Description must not exceed 500 characters'),
  triggeringAttribute: z.string().min(1),
  triggeringValue: z.union([z.string(), z.number()]),
  thresholdValue: z.union([z.string(), z.number()]),
});

// ─── EAP Appointment Schema (Req 3.1, 3.8) ──────────────────────────────────

export const EAPAppointmentSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1, 'Project ID is required'),
  practitionerName: z.string().min(1, 'Practitioner name is required').max(200, 'Practitioner name must not exceed 200 characters'),
  firmName: z.string().min(1, 'Firm name is required').max(200, 'Firm name must not exceed 200 characters'),
  eapasaRegistration: z.string().min(1, 'EAPASA registration number is required'),
  email: z.string().email('A valid email address is required'),
  telephone: z.string().min(1, 'Telephone number is required'),
  dateOfAppointment: z.string().min(1, 'Date of appointment is required'),
  verificationStatus: EAPVerificationStatusEnum,
  assignmentStatus: EAPAssignmentStatusEnum,
  dateEnded: z.string().optional(),
  replacementReason: z.string().optional(),
});

export const EAPAppointmentCreateSchema = EAPAppointmentSchema.omit({
  id: true,
  assignmentStatus: true,
  dateEnded: true,
  replacementReason: true,
});

// ─── Phase Record Schema (Req 4.3) ──────────────────────────────────────────

export const PhaseRecordSchema = z.object({
  phase: z.union([BAPhaseEnum, FullEIAPhaseEnum]),
  status: PhaseStatusEnum,
  startDate: z.string().optional(),
  completionDate: z.string().optional(),
  referenceNumber: z.string().max(50, 'Reference number must not exceed 50 characters').optional(),
  statutoryDays: z.number().int().positive().optional(),
  deadline: z.string().optional(),
  completedBy: z.string().optional(),
  notes: z.string().optional(),
}).refine(
  (data) => {
    if (data.completionDate && data.startDate) {
      return new Date(data.completionDate) >= new Date(data.startDate);
    }
    return true;
  },
  { message: 'Completion date must not be before the phase start date' }
).refine(
  (data) => {
    if (data.completionDate) {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      return new Date(data.completionDate) <= today;
    }
    return true;
  },
  { message: 'Completion date must not be in the future' }
);

// ─── Specialist Study Schema (Req 5.2) ──────────────────────────────────────

export const SpecialistStudySchema = z.object({
  id: z.string().min(1),
  studyType: SpecialistStudyTypeEnum,
  specialistName: z.string().min(1).max(200, 'Specialist name must not exceed 200 characters'),
  registrationBody: z.string().optional(),
  registrationNumber: z.string().optional(),
  status: SpecialistStudyStatusEnum,
  submissionDate: z.string().optional(),
  requiredDate: z.string().min(1, 'Required date is required'),
  appointedDate: z.string().optional(),
});

// ─── Authorization Schemas (Req 6.1, 6.3) ───────────────────────────────────

export const AuthorizationConditionSchema = z.object({
  id: z.string().min(1),
  conditionNumber: z.number().int().positive(),
  conditionText: z.string().min(1, 'Condition text is required').max(2000, 'Condition text must not exceed 2000 characters'),
  responsibleParty: z.string().min(1, 'Responsible party is required'),
  complianceDeadline: z.string().optional(),
  complianceStatus: ConditionComplianceStatusEnum,
});

export const AuthorizationRecordSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1, 'Project ID is required'),
  referenceNumber: z.string().min(1, 'Reference number is required').max(100, 'Reference number must not exceed 100 characters'),
  dateOfIssue: z.string().min(1, 'Date of issue is required'),
  competentAuthority: z.string().min(1, 'Competent authority is required').max(200, 'Competent authority must not exceed 200 characters'),
  validityStart: z.string().min(1, 'Validity start date is required'),
  validityExpiry: z.string().min(1, 'Validity expiry date is required'),
  authorizedActivities: z.array(
    z.string().max(1000, 'Activity description must not exceed 1000 characters')
  ).min(1, 'At least one authorized activity is required'),
  status: AuthorizationStatusEnum,
  conditions: z.array(AuthorizationConditionSchema),
});

// ─── EMPr Schemas (Req 8.1) ─────────────────────────────────────────────────

export const EMPrCommitmentSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1, 'Project ID is required'),
  reference: z.string().min(1, 'Commitment reference is required'),
  description: z.string().min(1, 'Description is required'),
  applicablePhase: EMPrPhaseEnum,
  responsibleParty: z.string().min(1, 'Responsible party is required'),
  monitoringFrequency: MonitoringFrequencyEnum,
  complianceStatus: EMPrComplianceStatusEnum,
  lastMonitoredDate: z.string().optional(),
  nextDueDate: z.string().optional(),
  specForgeItemId: z.string().optional(),
});

export const EMPrAuditSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1, 'Project ID is required'),
  auditDate: z.string().min(1, 'Audit date is required'),
  auditorName: z.string().min(1, 'Auditor name is required'),
  findingsSummary: z.string().min(1, 'Findings summary is required').max(2000, 'Findings summary must not exceed 2000 characters'),
  overallStatus: EMPrComplianceStatusEnum,
});

// ─── Public Participation Schemas (Req 7.1–7.3) ─────────────────────────────

export const IAPRecordSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1, 'Project ID is required'),
  partyName: z.string().min(1, 'Party name is required').max(200, 'Party name must not exceed 200 characters'),
  organisation: z.string().max(200, 'Organisation must not exceed 200 characters').optional(),
  email: z.string().email('A valid email address is required'),
  phone: z.string().min(1, 'Phone number is required'),
  postalAddress: z.string().min(1, 'Postal address is required'),
  dateRegistered: z.string().min(1, 'Date registered is required'),
  registrationMethod: RegistrationMethodEnum,
  interestCategory: InterestCategoryEnum,
});

export const NotificationEventSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1, 'Project ID is required'),
  notificationType: NotificationTypeEIAEnum,
  dateIssued: z.string().min(1, 'Date issued is required'),
  recipientIds: z.array(z.string().min(1)).min(1, 'At least one recipient is required'),
  proofReference: z.string().min(1, 'Proof reference is required').max(500, 'Proof reference must not exceed 500 characters'),
  commentDeadline: z.string().min(1, 'Comment deadline is required'),
  isClosed: z.boolean(),
  totalComments: z.number().int().min(0),
  commentsWithResponse: z.number().int().min(0),
});

export const CommentRecordSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1, 'Project ID is required'),
  notificationId: z.string().min(1, 'Notification ID is required'),
  commentingPartyId: z.string().min(1, 'Commenting party ID is required'),
  dateReceived: z.string().min(1, 'Date received is required'),
  commentSummary: z.string().min(1, 'Comment summary is required').max(2000, 'Comment summary must not exceed 2000 characters'),
  eapResponse: z.string().max(2000, 'EAP response must not exceed 2000 characters').optional(),
});

// ─── Green Building: Credit Schema (Req 9.3) ────────────────────────────────

export const CreditSchema = z.object({
  id: z.string().min(1),
  category: CreditCategoryEnum,
  name: z.string().min(1, 'Credit name is required').max(120, 'Credit name must not exceed 120 characters'),
  availablePoints: z.number().int().min(0, 'Available points cannot be negative').max(25, 'Available points must not exceed 25'),
  targetedPoints: z.number().int().min(0, 'Targeted points cannot be negative'),
  achievedPoints: z.number().int().min(0, 'Achieved points cannot be negative'),
  evidenceStatus: EvidenceStatusEnum,
}).refine(
  (data) => data.targetedPoints <= data.availablePoints,
  { message: 'Targeted points must not exceed available points' }
).refine(
  (data) => data.achievedPoints <= data.availablePoints,
  { message: 'Achieved points must not exceed available points' }
);

// ─── Green Building: EDGE Savings Schema (Req 10.2, 10.8) ───────────────────

export const EDGESavingsSchema = z.number()
  .min(0, 'Percentage savings cannot be negative')
  .max(100, 'Percentage savings must not exceed 100%');

export const EDGECategoryValueSchema = z.object({
  category: EDGECategoryEnum,
  baselineValue: z.number().min(0),
  designedValue: z.number().min(0),
  percentageSavings: EDGESavingsSchema,
  meetsThreshold: z.boolean(),
});

// ─── Green Building: Net Zero Schemas (Req 11.1–11.2) ───────────────────────

export const NetZeroTargetSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1, 'Project ID is required'),
  targetType: NetZeroTargetTypeEnum,
  baselineYear: z.number().int().min(2000, 'Baseline year must be 2000 or later').max(2100, 'Baseline year must not exceed 2100'),
  targetYear: z.number().int().min(2001, 'Target year must be 2001 or later').max(2130, 'Target year must not exceed 2130'),
  baselineConsumption: z.number().min(0, 'Baseline consumption cannot be negative').max(999_999_999.99, 'Baseline consumption must not exceed 999,999,999.99'),
}).refine(
  (data) => {
    const diff = data.targetYear - data.baselineYear;
    return diff >= 1 && diff <= 30;
  },
  { message: 'Target year must be 1–30 years from baseline year' }
);

export const AnnualPerformanceSchema = z.object({
  year: z.number().int(),
  actualConsumption: z.number().min(0, 'Actual consumption cannot be negative').max(999_999_999.99, 'Actual consumption must not exceed 999,999,999.99'),
  baselineConsumption: z.number().min(0, 'Baseline consumption cannot be negative').max(999_999_999.99, 'Baseline consumption must not exceed 999,999,999.99'),
  onSiteRenewable: z.number().min(0, 'On-site renewable cannot be negative').optional(),
  offsetCredits: z.number().min(0, 'Offset credits cannot be negative').optional(),
});

// ─── Phase Transition Validation Schema (Req 4.3) ───────────────────────────

/**
 * Validates a phase completion request.
 * Completion date must not be before startDate and must not be in the future.
 */
export const PhaseCompletionSchema = z.object({
  completionDate: z.string().min(1, 'Completion date is required'),
  startDate: z.string().min(1, 'Start date is required'),
  referenceNumber: z.string().max(50, 'Reference number must not exceed 50 characters').optional(),
}).refine(
  (data) => new Date(data.completionDate) >= new Date(data.startDate),
  { message: 'Completion date must not be before the phase start date' }
).refine(
  (data) => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return new Date(data.completionDate) <= today;
  },
  { message: 'Completion date must not be in the future' }
);

// ─── Screening Result Schema ─────────────────────────────────────────────────

export const ScreeningResultSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  input: ScreeningInputSchema,
  triggeredActivities: z.array(TriggeredActivitySchema),
  recommendation: ScreeningRecommendationEnum,
  advisoryText: z.string().min(1),
  screenedAt: z.string().min(1),
  screenedBy: z.string().min(1),
});

// ─── Assessment Record Schema ────────────────────────────────────────────────

export const AssessmentRecordSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  type: AssessmentTypeEnum,
  currentPhase: z.union([BAPhaseEnum, FullEIAPhaseEnum]),
  specialistStudies: z.array(SpecialistStudySchema).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
