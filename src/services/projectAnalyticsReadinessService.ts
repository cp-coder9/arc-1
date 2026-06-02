export type ProjectAnalyticsReadinessStatus = "not_ready" | "blocked" | "ready_for_indexing_review";

export interface ProjectAnalyticsReadinessInput {
  projectId?: string;
  stage?: string;
  finalCompletionAccepted?: boolean;
  anonymisation?: { piiRemoved?: boolean; projectIdHashed?: boolean; consentOrLegitimateInterestRecorded?: boolean };
  metadata?: {
    actualCostPerSqmByTrade?: Record<string, number>;
    baselineEstimatePerSqm?: number;
    municipalTurnaroundDays?: number;
    municipality?: string;
    contractorDelayDays?: number;
    vendorReliabilityRatings?: Record<string, number>;
    materialDeliveryDelayDays?: number;
    subcontractorPackagePerformance?: Record<string, "on_time" | "delayed" | "blocked">;
  };
  auditTrail?: { completionSnapshotRef?: string; anonymisationLogRef?: string; analyticsIndexApprovalRef?: string; capturedBy?: string; capturedAtIso?: string };
}

export interface ProjectAnalyticsReadinessResult {
  status: ProjectAnalyticsReadinessStatus;
  required: boolean;
  riskLevel: "low" | "medium" | "high";
  missingMetadata: string[];
  blockers: string[];
  warnings: string[];
  derivedMetrics: { tradeCount: number; averageActualCostPerSqm: number | null; delayDays: number | null; hasVendorRatings: boolean };
  nextAction: { label: string; priority: "low" | "medium" | "high"; target: "analytics-audit"; detail: string; requiresHumanConfirmation: true; automationLevel: "advisory" };
  audit: { prdSection: "Section 52: Closed-Loop Machine Learning & Project Analytics"; anonymisedOnly: true; noTrainingSideEffects: true; humanReviewRequired: true };
  summary: string;
}

const NOTE = "AI may prepare anonymised completed-project metadata for human-reviewed indexing only; this service must not train, update, or deploy ML models as a side effect.";

function isComplete(input: ProjectAnalyticsReadinessInput): boolean {
  return Boolean(input.finalCompletionAccepted || /stage\s*8|final completion|closed out|complete/i.test(input.stage ?? ""));
}

function missing(input: ProjectAnalyticsReadinessInput): string[] {
  const m = input.metadata ?? {};
  const a = input.auditTrail ?? {};
  const out: string[] = [];
  if (!m.actualCostPerSqmByTrade || Object.keys(m.actualCostPerSqmByTrade).length === 0) out.push("actual cost per sqm by trade");
  if (m.baselineEstimatePerSqm === undefined) out.push("baseline estimate per sqm");
  if (m.municipalTurnaroundDays === undefined) out.push("municipal turnaround duration");
  if (m.contractorDelayDays === undefined) out.push("contractor delay duration");
  if (!m.vendorReliabilityRatings || Object.keys(m.vendorReliabilityRatings).length === 0) out.push("vendor reliability ratings");
  if (m.materialDeliveryDelayDays === undefined) out.push("material delivery delay duration");
  if (!m.subcontractorPackagePerformance || Object.keys(m.subcontractorPackagePerformance).length === 0) out.push("subcontractor package performance");
  if (!a.completionSnapshotRef) out.push("final completion snapshot reference");
  if (!a.anonymisationLogRef) out.push("anonymisation audit log reference");
  if (!a.analyticsIndexApprovalRef) out.push("analytics indexing approval reference");
  return out;
}

function blockers(input: ProjectAnalyticsReadinessInput, miss: string[]): string[] {
  const anon = input.anonymisation ?? {};
  const out = miss.map((item) => `Missing ${item} for closed-loop analytics indexing readiness.`);
  if (!isComplete(input)) out.push("Project must reach final completion/Stage 8 before analytics capture readiness.");
  if (!anon.piiRemoved) out.push("PII must be removed before completed-project metadata can be indexed.");
  if (!anon.projectIdHashed) out.push("Project identifier must be hashed or tokenised before analytics indexing.");
  if (!anon.consentOrLegitimateInterestRecorded) out.push("Consent or legitimate-interest basis must be recorded before analytics indexing.");
  return out;
}

function warnings(input: ProjectAnalyticsReadinessInput): string[] {
  const out: string[] = [];
  if (!input.metadata?.municipality) out.push("Municipality is not captured, reducing municipal-turnaround benchmarking quality.");
  if (!input.auditTrail?.capturedBy || !input.auditTrail?.capturedAtIso) out.push("Capture actor/timestamp is incomplete for audit trail traceability.");
  return out;
}

function metrics(input: ProjectAnalyticsReadinessInput): ProjectAnalyticsReadinessResult["derivedMetrics"] {
  const costs = Object.values(input.metadata?.actualCostPerSqmByTrade ?? {}).filter((value) => Number.isFinite(value));
  const averageActualCostPerSqm = costs.length ? Number((costs.reduce((sum, value) => sum + value, 0) / costs.length).toFixed(2)) : null;
  const delayDays = typeof input.metadata?.contractorDelayDays === "number" || typeof input.metadata?.materialDeliveryDelayDays === "number" ? (input.metadata?.contractorDelayDays ?? 0) + (input.metadata?.materialDeliveryDelayDays ?? 0) : null;
  return Object.freeze({ tradeCount: costs.length, averageActualCostPerSqm, delayDays, hasVendorRatings: Object.keys(input.metadata?.vendorReliabilityRatings ?? {}).length > 0 });
}

function nextAction(required: boolean, b: string[], w: string[]): ProjectAnalyticsReadinessResult["nextAction"] {
  if (!required) return { label: "Wait for final completion before analytics capture", priority: "low", target: "analytics-audit", detail: NOTE, requiresHumanConfirmation: true, automationLevel: "advisory" };
  if (b.length) return { label: "Resolve anonymised analytics capture blockers", priority: "high", target: "analytics-audit", detail: `${b[0]} ${NOTE}`, requiresHumanConfirmation: true, automationLevel: "advisory" };
  return { label: w.length ? "Review analytics capture warnings" : "Approve anonymised project metadata for indexing", priority: w.length ? "medium" : "low", target: "analytics-audit", detail: NOTE, requiresHumanConfirmation: true, automationLevel: "advisory" };
}

export function evaluateProjectAnalyticsReadiness(input: ProjectAnalyticsReadinessInput): ProjectAnalyticsReadinessResult {
  const required = isComplete(input);
  const miss = required ? missing(input) : [];
  const b = required ? blockers(input, miss) : [];
  const w = required ? warnings(input) : [];
  const status: ProjectAnalyticsReadinessStatus = !required ? "not_ready" : b.length ? "blocked" : "ready_for_indexing_review";
  const riskLevel = b.length ? "high" : w.length ? "medium" : "low";
  return Object.freeze({ status, required, riskLevel, missingMetadata: miss, blockers: b, warnings: w, derivedMetrics: metrics(input), nextAction: nextAction(required, b, w), audit: { prdSection: "Section 52: Closed-Loop Machine Learning & Project Analytics", anonymisedOnly: true, noTrainingSideEffects: true, humanReviewRequired: true }, summary: required ? `Analytics capture readiness ${status.replaceAll("_", " ")}; ${b.length} blockers and ${w.length} warnings.` : "Project is not at final completion; no analytics capture is required yet." } satisfies ProjectAnalyticsReadinessResult);
}
