/**
 * NHBRC Enrolment Module — Type Definitions
 *
 * NHBRC project enrolment readiness, inspection tracking,
 * warranty claims management, and builder verification types.
 */

// ─── Enumerations ─────────────────────────────────────────────────────────────

export type EnrolmentStatus = 'not_started' | 'in_progress' | 'enrolled';
export type ChecklistItemStatus = 'not_started' | 'in_progress' | 'completed' | 'not_applicable';
export type InspectionStage = 'foundation' | 'wall_plate' | 'roof' | 'completion';
export type InspectionOutcome = 'passed' | 'failed' | 'conditionally_passed';
export type WarrantyDefectCategory = 'structural' | 'roof_waterproofing' | 'wall_waterproofing';
export type WarrantyClaimStage =
  | 'reported'
  | 'acknowledged'
  | 'inspection_scheduled'
  | 'inspected'
  | 'liability_determined'
  | 'rectification_ordered'
  | 'rectification_in_progress'
  | 'rectification_complete'
  | 'claim_closed';
export type LiabilityOutcome = 'builder_liable' | 'shared_liability' | 'no_liability';
export type BuilderVerificationStatus = 'verified_active' | 'verified_suspended' | 'verified_expired' | 'unverifiable';

// ─── Core Domain Interfaces ───────────────────────────────────────────────────

export interface EnrolmentChecklist {
  id: string;
  projectId: string;
  status: EnrolmentStatus;
  readinessPercentage: number;  // 0–100
  items: ChecklistItem[];
  feeEstimate?: number;
  builderRegistrationNumber?: string;
  numberOfUnits: number;
  estimatedValuePerUnit: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  status: ChecklistItemStatus;
  isApplicable: boolean;
  completedAt?: string;
  completedBy?: string;
}

export interface FeeBand {
  id: string;
  minValue: number;             // ZAR
  maxValue: number;             // ZAR
  feePerUnit: number;           // ZAR
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface InspectionRecord {
  id: string;
  projectId: string;
  unitId: string;
  stage: InspectionStage;
  inspectionDate: string;
  inspectorName: string;        // max 200 chars
  outcome: InspectionOutcome;
  conditionsOrDefects?: string; // max 2000 chars, mandatory if failed/conditional
  evidenceRefs: string[];       // max 20 images
  conditionDeadline?: string;   // for conditionally_passed
  conditionsResolved?: boolean;
  createdBy: string;
  createdAt: string;
}

export interface UnitInspectionStatus {
  unitId: string;
  currentStage: InspectionStage | 'inspection_complete';
  stagesCompleted: InspectionStage[];
  hasFailed: boolean;
  failedStages: InspectionStage[];
}

export interface WarrantyClaim {
  id: string;
  projectId: string;
  unitId: string;
  claimantName: string;
  claimantContact: string;
  defectDescription: string;    // max 2000 chars
  defectCategory: WarrantyDefectCategory;
  defectDiscoveredDate: string;
  practicalCompletionDate: string;
  warrantyExpiryDate: string;   // calculated: practicalCompletion + 5 years
  isOutsideWarranty: boolean;
  evidenceRefs: string[];       // 1–20 images, each max 10MB, JPEG/PNG/HEIF
  currentStage: WarrantyClaimStage;
  liabilityOutcome?: LiabilityOutcome;
  rectificationDescription?: string;
  rectificationDeadline?: string;
  rectificationResponsibleParty?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BuilderVerification {
  id: string;
  projectId: string;
  builderName: string;          // 2–200 chars
  registrationNumber: string;   // 4–20 alphanumeric
  verificationDate: string;     // not future
  result: BuilderVerificationStatus;
  registrationCategory?: string;
  maxProjectValue?: number;     // ZAR
  registrationExpiry?: string;
  requestedBy: string;
  createdAt: string;
}

// ─── Service Interfaces ───────────────────────────────────────────────────────

export interface CreateEnrolmentInput {
  builderRegistrationNumber?: string;
  numberOfUnits: number;
  estimatedValuePerUnit: number;
}

export interface RecordInspectionInput {
  unitId: string;
  stage: InspectionStage;
  inspectionDate: string;
  inspectorName: string;
  outcome: InspectionOutcome;
  conditionsOrDefects?: string;
  evidenceRefs?: string[];
  conditionDeadline?: string;
}

export type UserRole =
  | 'contractor'
  | 'developer'
  | 'site_manager'
  | 'client'
  | 'architect'
  | 'engineer'
  | 'quantity_surveyor'
  | 'bep'
  | 'platform_admin';

export interface CreateWarrantyClaimInput {
  unitId: string;
  claimantName: string;
  claimantContact: string;
  defectDescription: string;
  defectCategory: WarrantyDefectCategory;
  defectDiscoveredDate: string;
  practicalCompletionDate: string;
  evidenceRefs: string[];
}

export interface WarrantyTransitionData {
  liabilityOutcome?: LiabilityOutcome;
  rectificationDescription?: string;
  rectificationDeadline?: string;
  rectificationResponsibleParty?: string;
}

export interface WarrantyClaimsSummary {
  totalClaims: number;
  countByStage: Record<WarrantyClaimStage, number>;
  countByCategory: Record<WarrantyDefectCategory, number>;
  overdueRectifications: number;
}

export interface VerifyBuilderInput {
  builderName: string;
  registrationNumber: string;
  verificationDate: string;
}

export interface NHBRCEngineService {
  createEnrolment(projectId: string, input: CreateEnrolmentInput, actorId: string): Promise<EnrolmentChecklist>;
  updateChecklistItem(projectId: string, itemId: string, status: ChecklistItemStatus, actorId: string): Promise<EnrolmentChecklist>;
  calculateFee(numberOfUnits: number, valuePerUnit: number): Promise<{ fee: number | null; disclaimer: string; error?: string }>;
  getEnrolmentStatus(projectId: string): Promise<EnrolmentChecklist | null>;
  getFeeBands(): Promise<FeeBand[]>;
}

export interface InspectionTrackerService {
  recordInspection(projectId: string, input: RecordInspectionInput, actorId: string): Promise<InspectionRecord>;
  waiveStage(projectId: string, unitId: string, stage: InspectionStage, actorId: string, actorRole: UserRole): Promise<void>;
  getUnitStatus(projectId: string, unitId: string): Promise<UnitInspectionStatus>;
  getAllUnitsStatus(projectId: string): Promise<UnitInspectionStatus[]>;
  resolveConditions(projectId: string, inspectionId: string, actorId: string): Promise<InspectionRecord>;
  canRecordStage(projectId: string, unitId: string, stage: InspectionStage): Promise<{ allowed: boolean; blockedBy?: InspectionStage }>;
}

export interface WarrantyManagerService {
  registerClaim(projectId: string, claim: CreateWarrantyClaimInput, actorId: string): Promise<WarrantyClaim>;
  transitionClaim(projectId: string, claimId: string, newStage: WarrantyClaimStage, data?: WarrantyTransitionData, actorId?: string): Promise<WarrantyClaim>;
  getClaimsSummary(projectId: string): Promise<WarrantyClaimsSummary>;
  getOverdueRectifications(projectId: string): Promise<WarrantyClaim[]>;
}

export interface BuilderVerificationService {
  verifyBuilder(projectId: string, input: VerifyBuilderInput, requestedBy: string): Promise<BuilderVerification>;
  getPriorVerifications(projectId: string, registrationNumber: string): Promise<BuilderVerification[]>;
}
