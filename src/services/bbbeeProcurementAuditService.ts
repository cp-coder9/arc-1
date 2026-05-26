export type BbbeeProcurementAuditStatus = "not_required" | "blocked" | "ready_for_award_review";
export type BbbeeRiskLevel = "low" | "medium" | "high";

export interface BbbeeProcurementAuditInput {
  projectId?: string;
  procurement: { publicSector?: boolean; estimatedValue?: number; localSpendTargetPercent?: number; policyRequiresBbbee?: boolean };
  supplier: { supplierId: string; bbbeeLevel?: number; blackOwnershipPercent?: number; localSupplier?: boolean };
  evidence?: { bbbeeCertificateRef?: string; swornAffidavitRef?: string; preferentialScorecardRef?: string; taxClearanceRef?: string };
  spend?: Array<{ supplierId: string; amount: number; bbbeeRecognized?: boolean; localSpend?: boolean; verified?: boolean }>;
  checks?: { certificateVerified?: boolean; certificateCurrent?: boolean; scorecardReviewed?: boolean; spendVerified?: boolean; preferentialScoringApproved?: boolean };
}

export interface BbbeeProcurementMetrics {
  totalSpend: number;
  verifiedSpend: number;
  bbbeeRecognizedSpend: number;
  localSpend: number;
  localSpendPercent: number;
}

export interface BbbeeProcurementNextAction {
  label: string;
  priority: "low" | "medium" | "high";
  target: "procurement";
  detail: string;
  requiresHumanConfirmation: true;
  automationLevel: "advisory";
}

export interface BbbeeProcurementAuditResult {
  status: BbbeeProcurementAuditStatus;
  required: boolean;
  riskLevel: BbbeeRiskLevel;
  missingEvidence: string[];
  blockers: string[];
  warnings: string[];
  metrics: BbbeeProcurementMetrics;
  nextAction: BbbeeProcurementNextAction;
  audit: {
    prdSection: "Section 48: Local Sourcing & B-BBEE Procurement Auditing";
    noAutomaticAward: true;
    noCertificateMutation: true;
    humanReviewRequired: true;
  };
  summary: string;
}

const GOVERNANCE_NOTE = "AI may calculate procurement audit readiness only; accountable procurement/admin reviewers must verify certificates, scorecards, and spend evidence before award or dashboard reliance.";

function isRequired(input: BbbeeProcurementAuditInput): boolean {
  return Boolean(input.procurement.publicSector || input.procurement.policyRequiresBbbee || (input.procurement.estimatedValue ?? 0) >= 1_000_000);
}

function buildMetrics(input: BbbeeProcurementAuditInput): BbbeeProcurementMetrics {
  const spend = input.spend ?? [];
  const totalSpend = spend.reduce((sum, item) => sum + item.amount, 0);
  const verifiedSpend = spend.filter((item) => item.verified).reduce((sum, item) => sum + item.amount, 0);
  const bbbeeRecognizedSpend = spend.filter((item) => item.verified && item.bbbeeRecognized).reduce((sum, item) => sum + item.amount, 0);
  const localSpend = spend.filter((item) => item.verified && item.localSpend).reduce((sum, item) => sum + item.amount, 0);
  const localSpendPercent = totalSpend > 0 ? Math.round((localSpend / totalSpend) * 10000) / 100 : 0;
  return { totalSpend, verifiedSpend, bbbeeRecognizedSpend, localSpend, localSpendPercent };
}

function buildMissingEvidence(input: BbbeeProcurementAuditInput): string[] {
  const evidence = input.evidence ?? {};
  const missing: string[] = [];
  if (!evidence.bbbeeCertificateRef && !evidence.swornAffidavitRef) missing.push("SANAS B-BBEE certificate or sworn affidavit reference");
  if (!evidence.preferentialScorecardRef) missing.push("preferential procurement scorecard reference");
  return missing;
}

function buildWarnings(input: BbbeeProcurementAuditInput, metrics: BbbeeProcurementMetrics): string[] {
  const warnings: string[] = [];
  const target = input.procurement.localSpendTargetPercent;
  if (typeof input.supplier.bbbeeLevel === "number" && input.supplier.bbbeeLevel > 4) {
    warnings.push("Supplier B-BBEE level is below common preferential procurement targets; retain procurement review.");
  }
  if (typeof target === "number" && metrics.totalSpend > 0 && metrics.localSpendPercent < target) {
    warnings.push(`Verified local spend is ${metrics.localSpendPercent}% and below the ${target}% target.`);
  }
  if (!input.evidence?.taxClearanceRef) warnings.push("No tax-clearance reference is attached for the supplier file.");
  return warnings;
}

function buildBlockers(input: BbbeeProcurementAuditInput, missingEvidence: string[]): string[] {
  const checks = input.checks ?? {};
  const blockers = missingEvidence.map((item) => `Missing ${item} for B-BBEE procurement audit.`);
  if (!checks.certificateVerified) blockers.push("B-BBEE certificate/affidavit must be verified before award readiness.");
  if (!checks.certificateCurrent) blockers.push("B-BBEE certificate/affidavit must be current before award readiness.");
  if (!checks.scorecardReviewed) blockers.push("Preferential procurement scorecard must be reviewed before award readiness.");
  if (!checks.spendVerified) blockers.push("B-BBEE/local spend entries must be verified before dashboard totals are trusted.");
  if (!checks.preferentialScoringApproved) blockers.push("Preferential scoring must be approved by a human reviewer before award readiness.");
  return blockers;
}

function buildNextAction(required: boolean, blockers: string[], warnings: string[]): BbbeeProcurementNextAction {
  if (!required) {
    return { label: "Confirm B-BBEE procurement audit not required", priority: "low", target: "procurement", detail: GOVERNANCE_NOTE, requiresHumanConfirmation: true, automationLevel: "advisory" };
  }
  if (blockers.length > 0) {
    return { label: "Resolve B-BBEE procurement audit blockers", priority: "high", target: "procurement", detail: `${blockers[0]} ${GOVERNANCE_NOTE}`, requiresHumanConfirmation: true, automationLevel: "advisory" };
  }
  return { label: warnings.length > 0 ? "Review B-BBEE procurement audit warnings" : "Approve B-BBEE procurement audit for award review", priority: warnings.length > 0 ? "medium" : "low", target: "procurement", detail: GOVERNANCE_NOTE, requiresHumanConfirmation: true, automationLevel: "advisory" };
}

export function evaluateBbbeeProcurementAudit(input: BbbeeProcurementAuditInput): BbbeeProcurementAuditResult {
  const required = isRequired(input);
  const metrics = buildMetrics(input);
  const missingEvidence = required ? buildMissingEvidence(input) : [];
  const blockers = required ? buildBlockers(input, missingEvidence) : [];
  const warnings = required ? buildWarnings(input, metrics) : [];
  const riskLevel: BbbeeRiskLevel = blockers.length > 0 ? "high" : warnings.length > 0 ? "medium" : "low";
  const status: BbbeeProcurementAuditStatus = !required ? "not_required" : blockers.length > 0 ? "blocked" : "ready_for_award_review";

  return Object.freeze({
    status,
    required,
    riskLevel,
    missingEvidence,
    blockers,
    warnings,
    metrics,
    nextAction: buildNextAction(required, blockers, warnings),
    audit: {
      prdSection: "Section 48: Local Sourcing & B-BBEE Procurement Auditing",
      noAutomaticAward: true,
      noCertificateMutation: true,
      humanReviewRequired: true,
    },
    summary: required
      ? `B-BBEE procurement audit ${status.replaceAll("_", " ")}; ${blockers.length} blocker${blockers.length === 1 ? "" : "s"}, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}, ${metrics.localSpendPercent}% verified local spend.`
      : "No B-BBEE procurement audit trigger inferred from current procurement attributes; human review remains available.",
  } satisfies BbbeeProcurementAuditResult);
}
