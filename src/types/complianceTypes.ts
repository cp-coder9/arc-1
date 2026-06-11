/**
 * SANS / NBR Compliance Intelligence Engine — types.
 *
 * Source boundary: POC data at https://mwo-aec.github.io/sans-codified-poc/
 * is illustrative only. Production requires official SANS/NBR source verification.
 */

export const SOURCE_BOUNDARY = {
  sourceUrl: "https://mwo-aec.github.io/sans-codified-poc/",
  sourceStatus: "illustrative_poc_until_verified" as const,
  warning:
    "POC numbers, clauses and AI answers are illustrative. Production requires official SANS/NBR source verification and licensing.",
} as const;

export type SourceStatus =
  | "illustrative_poc_until_verified"
  | "draft_codified_rule"
  | "verified_internal_rule"
  | "official_licensed_source_verified"
  | "professional_signed_off"
  | "municipal_submitted"
  | "municipal_approved";

export type ComplianceStatus = "pass" | "watch" | "fail" | "needs_input" | "not_applicable";

/** A SANS 10400 part (e.g. Part K, Part T, Part XA). */
export interface CompliancePart {
  id: string;
  code: string;         // e.g. "K", "T", "XA"
  title: string;
  currentEdition: string;
  status: string;
  sourceStatus: SourceStatus;
  clauseCount: number;
  ruleCount: number;
  tableCount: number;
  updatedAt: string;
}

export interface ComplianceClause {
  id: string;
  partCode: string;
  clauseNumber: string;
  title: string;
  text: string;
  edition: string;
  sourceStatus: SourceStatus;
  tags: string[];
  linkedRuleIds: string[];
  linkedTableIds: string[];
  linkedFigureIds: string[];
  crossReferences: string[];
  professionalSignoffRequired: boolean;
}

export interface ComplianceRule {
  id: string;
  partCode: string;
  clauseId: string;
  ruleCode: string;
  title: string;
  severity: "mandatory" | "recommended" | "note";
  parameterSchema: Record<string, unknown>;
  operator: string;
  valueSource: string;
  tableRef?: string;
  passText: string;
  failText: string;
  watchText: string;
  sourceStatus: SourceStatus;
  edition: string;
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface ComplianceTable {
  id: string;
  partCode: string;
  tableCode: string;
  title: string;
  columns: string[];
  rows: Record<string, unknown>[];
  edition: string;
  sourceStatus: SourceStatus;
}

export interface ComplianceScenario {
  id: string;
  projectId?: string;
  title: string;
  description: string;
  scenarioType: string;
  createdBy: string;
  phase: string;
  location: string;
  status: "draft" | "checking" | "pass" | "watch" | "fail" | "signed_off";
  sourceSnapshotIds: string[];
  resultSummary?: string;
  nodes?: ComplianceScenarioNode[];
  createdAt: string;
  source: typeof SOURCE_BOUNDARY;
}

export interface ComplianceScenarioNode {
  id: string;
  scenarioId: string;
  nodeType:
    | "description"
    | "parameter"
    | "clause"
    | "table"
    | "rule"
    | "drawing"
    | "image"
    | "annotation"
    | "calc"
    | "result"
    | "memo"
    | "form";
  payload: Record<string, unknown>;
  linkedFileIds: string[];
  sourceObjectRef?: string;
  createdAt: string;
}

export interface ComplianceResult {
  id: string;
  scenarioId: string;
  ruleId: string;
  status: ComplianceStatus;
  inputs: Record<string, unknown>;
  calculationTrace: Record<string, unknown>;
  evidenceRefs: string[];
  reviewedBy?: string;
  signoffStatus: string;
  createdAt: string;
}

export interface ComplianceMemoOptions {
  scenario: ComplianceScenario;
  checkResult: { status: ComplianceStatus; message: string };
}

/** Boundary/garden wall checker inputs (MVP first checker — Part K 4.2.4). */
export interface BoundaryWallInput {
  unitType: "solid" | "hollow";
  thicknessMm: number;
  heightM: number;
  earthRetained: boolean;
  pierSpacingM?: number;
  pierSize?: string;
  controlJointSpacingM?: number;
  weepHoleSpacingM?: number;
  xDimensionM?: number;
}

export interface CheckResult {
  status: ComplianceStatus;
  message: string;
  trace: Record<string, unknown>;
}

export interface BecoStyleAssessment {
  hasVisualEvidence: boolean;
  evidenceRefs: string[];
  confidence: number;       // 0–1
  confidenceBand: "low" | "medium" | "high";
  missingEvidence: string[];
  needsInspection: boolean;
  clauseGrounded: boolean;
  clauseRefs: string[];
}

export interface BecoStylePromptContract {
  prohibitsApprovalClaims: boolean;
  prohibitsInventedDimensions: boolean;
  requiresClauseCitations: boolean;
  requiresConfidenceBand: boolean;
  requiresProfessionalGate: boolean;
}

export interface ComplianceGroundedDrawingResponse {
  drawingFindings: Array<{
    extractedObject: string;
    confidence: number;
    mappedSansRefs: string[];
    checkResult?: CheckResult;
    becoStyleAssessment: BecoStyleAssessment;
  }>;
  mappedSansNbrReferences: string[];
  passWatchFailNeedsInput: ComplianceStatus;
  missingInformation: string[];
  sourceStatus: SourceStatus;
  professionalReviewGate: boolean;
  nextActions: string[];
  drawingSetReview?: Record<string, unknown>;
  landUseSplumaReview?: Record<string, unknown>;
  planSubmissionReview?: Record<string, unknown>;
  becoStylePromptContract: BecoStylePromptContract;
  actionCards: Array<{
    type: "missing_parameter" | "missing_evidence" | "failed_check" | "watch_inspection" | "signoff_required" | "version_changed" | "municipal_not_ready";
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
  }>;
}

export interface DrawingExtractionResult {
  objectType: string;
  label: string;
  confidence: number;
  evidenceRefs: string[];
  parameters: Record<string, unknown>;
}

export interface DrawingSetContext {
  projectDescription: string;
  sansNotesOnDrawings: string[];
  floorAreas: Array<{ room: string; areaM2: number }>;
  occupancyClassification: OccupancyClassification;
}

export interface OccupancyClassification {
  class: string;
  description: string;
  totalSeats: number;
  seatingRooms: Array<{ room: string; seatCount: number }>;
  classification: { class: string; description: string };
}

export interface LandUseContext {
  municipality: string;
  currentUse: string;
  proposedUse: string;
  zoning: string | null;
  erfNumber?: string;
  landUseSchemeName?: string;
  parkingProvided?: number;
  coverage?: number;
  FAR?: number;
  heightStoreys?: number;
  buildingLinesChecked?: boolean;
}

export interface PlanSubmissionContext {
  municipality: string;
  submissionStream: string;
  projectCategory: string;
  sdpRequired: boolean;
  availableDrawingTypes: string[];
  visionObservations: {
    found: string[];
    risks: string[];
  };
  drawingRegister: Array<{
    drawingNo: string;
    title: string;
    details: Array<{ detailNo: string }>;
  }>;
  references: Array<{
    detailNo: string;
    targetSheet: string;
    source: string;
  }>;
}
