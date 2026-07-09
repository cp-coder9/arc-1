/**
 * Municipal Approval Readiness Workspace Types
 *
 * Land Use Scheme validation, Departmental Circulation Simulation,
 * Submission Pack assembly, Certificate generation, and Outcome Tracking.
 */

import type { MunicipalityType } from '@/types';

// ── Land Use Scheme Types ──────────────────────────────────────────────────────

export interface ZoneDefinition {
  id: string;
  municipalityId: MunicipalityType;
  schemeName: string;
  zoneCode: string;
  zoneName: string;
  permittedUses: string[];
  consentUses: string[];
  parameters: DevelopmentParameters;
}

export interface DevelopmentParameters {
  maxCoverage: number;
  maxFAR: number;
  maxHeight: number;
  buildingLines: {
    front: number;
    rear: number;
    sides: number;
    streetSide?: number;
  };
  maxDensity?: number;
  parkingRatios: ParkingRequirement[];
}

export interface ParkingRequirement {
  landUseType: string;
  ratioDescription: string;
  baysPerUnit: number;
  unitMeasure: string;
}

export interface LandUseCheckInput {
  municipalityId: MunicipalityType;
  zoneCode: string;
  proposedCoverage: number;
  proposedFAR: number;
  proposedHeight: number;
  proposedSetbacks: {
    front: number;
    rear: number;
    sides: number;
    streetSide?: number;
  };
  proposedParkingBays: number;
  proposedLandUse: string;
  grossFloorArea?: number;
  dwellingUnits?: number;
  erfArea: number;
}

export interface LandUseCheckResult {
  status: 'pass' | 'fail' | 'zone_not_found';
  checks: LandUseParameterCheck[];
  consentRequired: boolean;
  consentUses: string[];
  zone?: ZoneDefinition;
}

export interface LandUseParameterCheck {
  parameter: string;
  proposedValue: number;
  permittedMax: number;
  unit: string;
  status: 'pass' | 'fail';
  excess?: number;
}

// ── Circulation Simulator Types ────────────────────────────────────────────────

export type DepartmentId =
  | 'town_planning'
  | 'building_control'
  | 'fire'
  | 'water_sanitation'
  | 'roads_transport'
  | 'electrical'
  | 'environmental'
  | 'heritage';

export interface DepartmentAssessment {
  departmentId: DepartmentId;
  departmentName: string;
  confidenceScore: number;
  status: 'pass' | 'attention' | 'fail' | 'insufficient_data';
  checksTotal: number;
  checksPassed: number;
  dataGaps: string[];
  actionItems: string[];
}

export interface CirculationSimulationResult {
  overallConfidence: number;
  departments: DepartmentAssessment[];
  simulatedAt: string;
  advisoryNotice: string;
}

// ── Submission Pack Types ──────────────────────────────────────────────────────

export interface SubmissionPackDocument {
  id: string;
  title: string;
  category: 'form' | 'drawing' | 'supporting' | 'cover';
  sequenceNumber: number;
  status: 'included' | 'missing' | 'draft_only' | 'placeholder';
  sourceRef?: string;
  prePopulated: boolean;
}

export interface SubmissionPack {
  municipality: MunicipalityType;
  submissionType: string;
  documents: SubmissionPackDocument[];
  coverSheet: { projectName: string; erfNumber: string; applicant: string };
  tableOfContents: string[];
  completeness: { total: number; included: number; missing: number };
  crossReferenceErrors: string[];
}

// ── Certificate Types ──────────────────────────────────────────────────────────

export interface MunicipalReadyCertificate {
  certificateNumber: string;
  projectId: string;
  projectName: string;
  erfNumber: string;
  municipality: MunicipalityType;
  issuedAt: string;
  overallReadinessScore: number;
  departmentScores: Record<DepartmentId, number>;
  professionalSignOffs: ProfessionalSignOff[];
  completenessStatement: string;
  advisoryDisclaimer: string;
}

export interface ProfessionalSignOff {
  discipline: string;
  professionalName: string;
  registrationNumber: string;
  registrationBody: 'SACAP' | 'ECSA' | 'SACPLAN' | 'Other';
  signedAt: string;
  declaration: string;
  verified: boolean;
}

// ── Outcome Tracking Types ─────────────────────────────────────────────────────

export type SubmissionOutcomeStatus =
  | 'submitted'
  | 'approved_first_time'
  | 'approved_with_conditions'
  | 'returned_for_amendments'
  | 'refused';

export interface SubmissionOutcome {
  id: string;
  projectId: string;
  municipality: MunicipalityType;
  submissionType: string;
  referenceNumber: string;
  submissionDate: string;
  readinessScoreAtSubmission: number;
  departmentScoresAtSubmission: Record<DepartmentId, number>;
  outcome: SubmissionOutcomeStatus;
  returnReasons?: { department: DepartmentId; reason: string }[];
  timeToDecision?: number;
  updatedAt: string;
}
