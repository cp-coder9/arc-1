/**
 * Survey & Geomatics Module — Type Definitions
 *
 * Types for survey instruction management, SG diagram tracking,
 * beacon register, boundary lines, and as-built comparisons.
 */

// ─── Survey Instruction Types ─────────────────────────────────────────────────

export type SurveyType =
  | 'boundary_determination' | 'topographic_survey' | 'as_built_survey'
  | 'sectional_title_survey' | 'subdivision_survey' | 'consolidation_survey'
  | 'general_purposes_diagram';

export type SurveyInstructionStage =
  | 'drafted' | 'issued' | 'accepted' | 'fieldwork_in_progress'
  | 'office_processing' | 'submitted_to_sg' | 'completed';

// ─── SG Diagram Types ─────────────────────────────────────────────────────────

export type SGDiagramType = 'general_plan' | 'sectional_title' | 'subdivision' | 'consolidation' | 'servitude';

export type SGDiagramStage =
  | 'prepared' | 'checked' | 'lodged' | 'examination_in_progress'
  | 'queries_raised' | 'queries_resolved' | 'approved' | 'registered' | 'withdrawn';

export type SGOffice =
  | 'Cape Town' | 'Pretoria' | 'Pietermaritzburg'
  | 'Bloemfontein' | 'King William\'s Town' | 'Mthatha';

// ─── Beacon Types ─────────────────────────────────────────────────────────────

export type BeaconType = 'iron_peg' | 'concrete_block' | 'nail_in_tar' | 'reference_mark' | 'trigonometric_beacon' | 'other';
export type BeaconCondition = 'intact' | 'damaged' | 'missing' | 'replaced';
export type CoordinateSystem = 'WGS84' | 'Hartebeesthoek94';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface SurveyInstruction {
  id: string;
  projectId: string;
  referenceNumber: string;
  surveyType: SurveyType;
  propertyDescription: string;    // max 500
  scopeOfWork: string;            // max 2000
  appointedSurveyorId?: string;
  appointedSurveyorName: string;
  appointedSurveyorPLATO: string; // max 20
  requiredCompletionDate: string;
  linkedDocuments: string[];      // max 20
  currentStage: SurveyInstructionStage;
  linkedTownPlanningAppId?: string;
  issuedBy?: string;
  issuedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SGDiagram {
  id: string;
  projectId: string;
  diagramReference: string;       // max 50, unique per project
  diagramType: SGDiagramType;
  linkedSurveyInstructionId: string;
  propertyDescription: string;    // max 200
  lodgementDate: string;
  lodgementOffice: SGOffice;
  surveyorName: string;
  surveyorPLATO: string;          // max 20
  currentStage: SGDiagramStage;
  queryDetails?: string;          // max 2000
  queryResponseDeadline?: string;
  approvalDate?: string;
  sgApprovalNumber?: string;      // max 30
  processingDays: number;         // auto-calculated Working_Days
  expectedProcessingDays: number; // configurable, default 60
  withdrawalReason?: string;      // max 500
  createdAt: string;
  updatedAt: string;
}

export interface Beacon {
  id: string;
  projectId: string;
  identifier: string;             // alphanumeric, max 50, unique per project
  beaconType: BeaconType;
  latitude?: number;              // decimal degrees, 8 dp (WGS84)
  longitude?: number;
  yCoordinate?: number;           // Lo system, 3 dp (Hartebeesthoek94)
  xCoordinate?: number;
  coordinateSystem: CoordinateSystem;
  condition: BeaconCondition;
  dateLastInspected: string;
  linkedDiagramRef?: string;
  notes?: string;                 // max 500
  replacementHistory: BeaconReplacement[];
  createdAt: string;
  updatedAt: string;
}

export interface BeaconReplacement {
  date: string;
  newLatitude?: number;
  newLongitude?: number;
  newY?: number;
  newX?: number;
  replacingSurveyorId: string;
  reason: string;                 // max 500
  evidenceRefs: string[];         // max 10
}

export interface BoundaryLine {
  id: string;
  projectId: string;
  parcelIdentifier: string;
  beaconSequence: string[];       // min 2
  createdAt: string;
}

export interface AsBuiltComparison {
  id: string;
  projectId: string;
  referenceNumber: string;
  linkedSurveyInstructionId: string;
  linkedApprovedPlanRef: string;
  surveyDate: string;
  surveyorId: string;
  measurements: MeasurementPair[];
  totalMeasurements: number;
  withinTolerance: number;
  outsideTolerance: number;
  maxDeviation: number;
  compliancePercentage: number;   // 0.0–100.0
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MeasurementPair {
  id: string;
  comparisonId: string;
  dimensionDescription: string;   // max 200
  approvedDimension: number;      // 0.001–99999.999
  asBuiltDimension: number;
  toleranceThreshold: number;     // 0.001–1.000, default 0.050
  deviation: number;              // asBuilt - approved
  absoluteDeviation: number;
  isWithinTolerance: boolean;
}
