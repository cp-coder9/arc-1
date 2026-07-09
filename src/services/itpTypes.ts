/**
 * ITP Module — Core Type Definitions
 *
 * Types for Inspection Test Plans, Inspection Items, Material Testing,
 * and related entities. Used across ITP service, adapters, and UI components.
 */

// ── ITP Core Types ──────────────────────────────────────────────────────────

export type ITPStatus = 'draft' | 'approved' | 'in_progress' | 'completed' | 'superseded' | 'deleted';

export type InspectionType = 'hold_point' | 'witness_point' | 'surveillance';

export type InspectionItemStatus =
  | 'pending'
  | 'in_progress'
  | 'passed'
  | 'failed'
  | 'conditional'
  | 'conditional_accepted'
  | 'ncr_resolved'
  | 'review_required';

export type InspectorRole = 'engineer' | 'architect' | 'site_manager';

export type ConstructionStage =
  | 'site_establishment'
  | 'earthworks'
  | 'foundations'
  | 'substructure'
  | 'superstructure'
  | 'roof'
  | 'external_envelope'
  | 'internal_finishes'
  | 'mechanical_electrical'
  | 'external_works'
  | 'commissioning';

export interface ITP {
  id: string;
  projectId: string;
  title: string;
  description: string;
  constructionStage: ConstructionStage;
  revisionNumber: number;
  status: ITPStatus;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalSignOff?: SignOffRecord;
  previousRevisionId?: string;
  nextRevisionId?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
}

export interface InspectionItem {
  id: string;
  itpId: string;
  projectId: string;
  sequenceNumber: number;
  title: string;
  description: string;
  inspectionType: InspectionType;
  acceptanceCriteria: string;
  responsibleInspectorRole: InspectorRole;
  specificationReference: string;
  specificationCategory?: string;
  linkedMaterialTestIds: string[];
  linkedSpecItemId?: string;
  status: InspectionItemStatus;
  signOffRecord?: SignOffRecord;
  selfInspectionRecord?: SelfInspectionRecord;
  witnessAttendance?: WitnessAttendanceRecord;
  conditionalFollowUp?: ConditionalFollowUp;
  ncrId?: string;
  conditionsClosedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SignOffRecord {
  inspectorUserId: string;
  inspectorRole: InspectorRole;
  professionalRegistration?: string;
  outcome: 'pass' | 'fail' | 'conditional_pass';
  conditions?: string;
  conditionsDeadlineDays?: number;
  observations?: string;
  timestamp: string;
  inspectionItemId: string;
  itpRevisionNumber: number;
}

export interface SelfInspectionRecord {
  recordedByUserId: string;
  outcome: 'pass' | 'fail' | 'conditional_pass';
  observations?: string;
  timestamp: string;
}

export interface WitnessAttendanceRecord {
  notificationSentAt: string;
  inspectorResponse: 'acknowledged' | 'no_response';
  responseTimestamp?: string;
  attendance: 'attended' | 'not_attended';
  finalSignOffBy: 'inspector_witnessed' | 'contractor_recorded';
}

export interface ConditionalFollowUp {
  actionId: string;
  deadlineDate: string;
  deadlineDays: number;
  status: 'open' | 'resolved' | 'expired';
  resolvedAt?: string;
  expiredAt?: string;
}

// ── Material Testing Types ──────────────────────────────────────────────────

export type MaterialType = 'concrete' | 'soil' | 'steel' | 'aggregate' | 'bituminous';

export type ThresholdDirection = 'gte' | 'lte';

export type MaterialTestStatus =
  | 'scheduled'
  | 'sampled'
  | 'submitted_to_lab'
  | 'results_received'
  | 'passed'
  | 'failed'
  | 'ncr_resolved';

export type SANSTestCategory =
  | 'concrete_7day'
  | 'concrete_28day'
  | 'soil_compaction'
  | 'steel_tensile'
  | 'aggregate_grading'
  | 'bituminous_binder';

export interface TestingSchedule {
  id: string;
  projectId: string;
  materialType: MaterialType;
  sansTestMethodReference: string;
  testCategory: SANSTestCategory;
  testFrequencyRatio: number;
  testFrequencyQuantity: number;
  unitOfMeasure: string;
  minSamplesPerTest: number;
  acceptanceThreshold: number;
  thresholdUnit: string;
  thresholdDirection: ThresholdDirection;
  expectedTurnaroundDays: number;
  constructionStage: ConstructionStage;
  approvedLaboratories: ApprovedLaboratory[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovedLaboratory {
  name: string;
  sanasAccreditationNumber: string;
  accreditedTestMethods: string[];
  isActive: boolean;
}

export interface MaterialTest {
  id: string;
  projectId: string;
  testingScheduleId: string;
  sampleId: string;
  materialType: MaterialType;
  testCategory: SANSTestCategory;
  sansTestMethodReference: string;
  dateSampled: string;
  dateTestDue: string;
  testingLaboratoryName: string;
  status: MaterialTestStatus;
  linkedInspectionItemIds: string[];
  ncrId?: string;
  isPriority: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LabResult {
  id: string;
  materialTestId: string;
  projectId: string;
  testDate: string;
  resultValue: number;
  resultUnit: string;
  testingLaboratoryName: string;
  labReportReference: string;
  passFail: 'pass' | 'fail';
  recordedBy: string;
  attachmentUrl?: string;
  attachmentFileName?: string;
  createdAt: string;
}

// ── Inspection Request Types ────────────────────────────────────────────────

export interface InspectionRequest {
  id: string;
  projectId: string;
  inspectionItemId: string;
  itpId: string;
  requestedBy: string;
  requestedInspectionDate: string;
  status: 'pending' | 'signed_off' | 'breached';
  createdAt: string;
}

// ── Audit Types ─────────────────────────────────────────────────────────────

export type ITPAuditAction =
  | 'itp_created' | 'itp_updated' | 'itp_approved' | 'itp_revised'
  | 'itp_completed' | 'itp_deleted'
  | 'item_added' | 'item_updated' | 'item_removed' | 'items_reordered'
  | 'inspection_requested' | 'inspection_signed_off' | 'inspection_self_recorded'
  | 'hold_point_breached' | 'conditional_expired'
  | 'witness_notified' | 'witness_acknowledged' | 'witness_no_response'
  | 'test_schedule_created' | 'test_schedule_updated'
  | 'material_test_created' | 'material_test_status_changed'
  | 'lab_result_recorded'
  | 'ncr_created' | 'ncr_resolved'
  | 'spec_item_linked' | 'spec_item_unlinked' | 'spec_item_changed';

export interface ITPAuditRecord {
  id: string;
  projectId: string;
  entityType: 'itp' | 'inspection_item' | 'material_test' | 'testing_schedule' | 'lab_result';
  entityId: string;
  action: ITPAuditAction;
  actorUserId: string;
  timestamp: string;
  previousState: Record<string, unknown>;
  newState: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ── Passport Contribution Types ─────────────────────────────────────────────

export interface QualitySummary {
  totalITPs: number;
  itpsByStatus: Record<ITPStatus, number>;
  complianceScore: number | null;
  complianceScoreUnavailable: boolean;
  openHoldPointBreaches: number;
  pendingMaterialTests: number;
  openNCRsLinkedToITPs: number;
}

export interface ComplianceScore {
  score: number;
  passedInspections: number;
  passedMaterialTests: number;
  totalRequiredInspections: number;
  totalRequiredMaterialTests: number;
}
