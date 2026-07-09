/**
 * Architex Town Planning Application Tracker — Feature Types
 *
 * All planning-specific types for the South African town planning application
 * lifecycle module. Governs 7 application types through 10 SPLUMA lifecycle
 * stages with statutory deadline tracking, public participation, condition
 * fulfilment, appeal handling, and environmental/heritage triggers.
 */

// ─── Application Type Enumerations ──────────────────────────────────────────

/** Seven planning application types governed by SPLUMA and municipal by-laws. */
export type PlanningApplicationType =
  | 'rezoning'
  | 'consent_use'
  | 'subdivision'
  | 'consolidation'
  | 'site_development_plan'
  | 'removal_of_restrictive_conditions'
  | 'township_establishment';

/** Ten sequential lifecycle stages from pre-consultation to completion. */
export type PlanningStage =
  | 'pre_consultation'
  | 'preparation'
  | 'submission'
  | 'circulation_advertising'
  | 'objection_response'
  | 'tribunal_decision'
  | 'record_of_decision'
  | 'appeal_period'
  | 'condition_fulfilment'
  | 'completion';

/** Application status reflecting current lifecycle position. */
export type ApplicationStatus =
  | 'draft'
  | 'active'
  | 'approved'
  | 'refused'
  | 'deemed_refused'
  | 'appeal_in_progress'
  | 'withdrawn'
  | 'lapsed';

// ─── Supporting Type Aliases ────────────────────────────────────────────────

/** Condition classification per Record of Decision. */
export type ConditionType = 'precedent' | 'ongoing';

/** Appeal outcome as determined by the appeal authority. */
export type AppealOutcome = 'upheld' | 'dismissed' | 'varied';

/** Deadline tracking status for statutory and procedural timeframes. */
export type DeadlineStatus = 'pending' | 'approaching' | 'overdue' | 'met' | 'waived';

/** Status of an objection within the public participation register. */
export type ObjectionStatus = 'received' | 'responded' | 'late_accepted' | 'late_rejected';

/** Environmental or heritage trigger type requiring parallel process. */
export type TriggerType = 'heritage_nhra_s38' | 'environmental_nema';

/** Status of a parallel environmental/heritage process. */
export type ParallelProcessStatus = 'pending' | 'in_progress' | 'resolved' | 'deferred';

// ─── Core Interfaces ────────────────────────────────────────────────────────

/** Contact details for applicants, objectors, and appellants. */
export interface ContactDetails {
  name: string;
  email: string;
  phone: string;
  postalAddress?: string;
}

/** Primary planning application record. */
export interface PlanningApplication {
  id: string;
  tenantId: string;
  projectId: string;
  referenceNumber: string;
  applicationType: PlanningApplicationType;
  currentStage: PlanningStage;
  status: ApplicationStatus;
  municipalityId: string;
  assignedTownPlannerId: string;
  propertyDescription: string;
  erfNumber: string;
  titleDeedReference: string;
  applicantName: string;
  applicantContactDetails: ContactDetails;
  interdependencies: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Stage Transition ───────────────────────────────────────────────────────

/** Record of a stage-to-stage transition within an application lifecycle. */
export interface StageTransition {
  id: string;
  applicationId: string;
  fromStage: PlanningStage;
  toStage: PlanningStage;
  transitionedBy: string;
  transitionedAt: string;
  notes: string;
  documentsVerified: boolean;
}

// ─── Deadline Register ──────────────────────────────────────────────────────

/** Statutory or procedural deadline tracked against an application. */
export interface Deadline {
  id: string;
  applicationId: string;
  type: 'statutory' | 'procedural' | 'condition';
  label: string;
  dueDate: string;
  status: DeadlineStatus;
  linkedStage?: PlanningStage;
  linkedConditionId?: string;
  statutoryBasis?: string;
  daysRemaining: number;
  alertGenerated: boolean;
}

// ─── Municipality Profile ───────────────────────────────────────────────────

/** Municipality-specific configuration for forms, fees, and process variations. */
export interface MunicipalityProfile {
  id: string;
  tenantId: string;
  name: string;
  province: string;
  contactDetails: ContactDetails;
  landUseSchemeReference: string;
  feeSchedule: FeeScheduleItem[];
  requiredForms: RequiredForm[];
  processVariations: ProcessVariation[];
  customTimeframes: CustomTimeframe[];
  createdAt: string;
  updatedAt: string;
}

/** Fee schedule entry for a specific application type within a municipality. */
export interface FeeScheduleItem {
  applicationType: PlanningApplicationType;
  description: string;
  amount: number;
  currency: 'ZAR';
  validFrom: string;
  validTo?: string;
}

/** Required form for a specific application type and stage. */
export interface RequiredForm {
  id: string;
  name: string;
  applicationType: PlanningApplicationType[];
  isProvincial: boolean;
  stage: PlanningStage;
  templateUrl?: string;
}

/** Process variation describing additional requirements for a municipality. */
export interface ProcessVariation {
  applicationType: PlanningApplicationType;
  stage: PlanningStage;
  description: string;
  additionalRequirements: string[];
}

/** Custom timeframe override for a specific deadline type within a municipality. */
export interface CustomTimeframe {
  deadlineType: string;
  defaultDays: number;
  municipalityDays: number;
  statutoryReference: string;
}

// ─── Public Participation ───────────────────────────────────────────────────

/** Objection recorded during the statutory advertising period. */
export interface Objection {
  id: string;
  applicationId: string;
  objectorName: string;
  objectorContactDetails: ContactDetails;
  dateReceived: string;
  groundsOfObjection: string;
  supportingDocumentIds: string[];
  status: ObjectionStatus;
  responseId?: string;
  isLate: boolean;
  lateDecision?: 'accepted' | 'rejected';
  lateDecisionReason?: string;
}

/** Response to an objection by the applicant or town planner. */
export interface ObjectionResponse {
  id: string;
  objectionId: string;
  applicationId: string;
  responseText: string;
  respondedBy: string;
  respondedAt: string;
  supportingDocumentIds: string[];
}

/** Summary of public participation inputs for an application. */
export interface PublicParticipationSummary {
  applicationId: string;
  totalObjections: number;
  totalComments: number;
  responsesComplete: number;
  responsesPending: number;
  objectionPeriodStart: string;
  objectionPeriodEnd: string;
  periodClosed: boolean;
}

// ─── Condition Register ─────────────────────────────────────────────────────

/** Condition imposed by a Record of Decision. */
export interface Condition {
  id: string;
  applicationId: string;
  conditionNumber: number;
  description: string;
  conditionType: ConditionType;
  responsibleParty: string;
  deadline?: string;
  fulfilmentCriteria: string;
  status: 'pending' | 'fulfilled' | 'overdue' | 'waived';
  fulfilmentDate?: string;
  fulfilmentEvidenceIds: string[];
  confirmedBy?: string;
}

// ─── Appeal ─────────────────────────────────────────────────────────────────

/** Appeal lodged against a Record of Decision. */
export interface Appeal {
  id: string;
  applicationId: string;
  appellantName: string;
  appellantContactDetails: ContactDetails;
  groundsOfAppeal: string;
  dateLodged: string;
  withinStatutoryPeriod: boolean;
  supportingDocumentIds: string[];
  hearingDate?: string;
  hearingVenue?: string;
  outcome?: AppealOutcome;
  outcomeDate?: string;
  outcomeNotes?: string;
  conditionsVaried: boolean;
}

// ─── Hearing ────────────────────────────────────────────────────────────────

/** Tribunal hearing record for a planning application. */
export interface Hearing {
  id: string;
  applicationId: string;
  hearingDate: string;
  hearingTime: string;
  venue: string;
  tribunalPanel: string[];
  status: 'scheduled' | 'postponed' | 'completed';
  previousDates: string[];
  preparationAlertsSent: boolean;
}

// ─── Environmental / Heritage Triggers ──────────────────────────────────────

/** Environmental or heritage trigger requiring a parallel process. */
export interface EnvironmentalHeritageTrigger {
  id: string;
  applicationId: string;
  triggerType: TriggerType;
  reason: string;
  confirmed: boolean;
  parallelProcessStatus: ParallelProcessStatus;
  parallelDeadlines: Deadline[];
  parallelDocumentIds: string[];
  deferredBy?: string;
  deferredAt?: string;
}

// ─── Document Checklist ─────────────────────────────────────────────────────

/** Document checklist item for stage-gate validation. */
export interface DocumentChecklistItem {
  id: string;
  applicationId: string;
  documentType: string;
  description: string;
  required: boolean;
  stage: PlanningStage;
  documentId?: string;
  status: 'required' | 'uploaded' | 'waived';
  waivedBy?: string;
  waivedReason?: string;
}

// ─── Stage Gate Validation ──────────────────────────────────────────────────

/** Result of a stage-gate validation check before advancing. */
export interface StageGateResult {
  canAdvance: boolean;
  missingDocuments: DocumentChecklistItem[];
  missingActions: string[];
  blockers: string[];
  parallelProcessBlockers: EnvironmentalHeritageTrigger[];
}

/** Individual requirement for a stage, indicating fulfilment status. */
export interface StageRequirement {
  description: string;
  type: 'document' | 'action' | 'condition';
  met: boolean;
  linkedItemId?: string;
}

// ─── Permissions ────────────────────────────────────────────────────────────

/** Role-based permission flags for planning application access. */
export interface PlanningPermission {
  read: boolean;
  write: boolean;
  comment: boolean;
  configure: boolean;
}
