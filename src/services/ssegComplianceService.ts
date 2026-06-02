export type SsegComplianceStatus = "not_required" | "blocked" | "ready_for_professional_review";
export type SsegRiskLevel = "low" | "medium" | "high";
export type SsegDistributor = "city_power" | "eskom" | "cape_town" | "municipal" | "other";

export interface SsegComplianceInput {
  projectId?: string;
  location?: string;
  scopeTags?: string[];
  system?: {
    hasSolarPv?: boolean;
    hasBatteryStorage?: boolean;
    hasGridTieInverter?: boolean;
    hasGeneratorChangeover?: boolean;
    inverterCapacityKw?: number;
    distributor?: SsegDistributor;
  };
  evidence?: {
    applicationPackRef?: string;
    registrationRef?: string;
    singleLineDiagramRef?: string;
    inverterCertificateRef?: string;
    electricalCocRef?: string;
    distributorApprovalRef?: string;
  };
  checks?: {
    nrs097Compliant?: boolean;
    antiIslandingConfirmed?: boolean;
    singleLineDiagramReviewed?: boolean;
    professionalElectricalSignoff?: boolean;
    distributorApprovalReceived?: boolean;
  };
}

export interface SsegComplianceNextAction {
  label: string;
  priority: "low" | "medium" | "high";
  target: "municipal-tracker" | "sans-forms";
  detail: string;
  requiresHumanConfirmation: true;
  automationLevel: "advisory";
}

export interface SsegComplianceResult {
  status: SsegComplianceStatus;
  required: boolean;
  riskLevel: SsegRiskLevel;
  missingEvidence: string[];
  blockers: string[];
  warnings: string[];
  nextAction: SsegComplianceNextAction;
  audit: {
    prdSection: "Section 46: Solar PV & Small-Scale Embedded Generation (SSEG) Compliance";
    noAuthoritySubmission: true;
    noDistributorSubmission: true;
    humanReviewRequired: true;
  };
  summary: string;
}

const GOVERNANCE_NOTE = "AI may prepare the SSEG compliance checklist only; a responsible BEP, registered electrical professional, contractor, or admin reviewer must confirm evidence before municipal/distributor submission or grid-tied operation.";

function hasSsegTrigger(input: SsegComplianceInput): boolean {
  const searchableText = [input.location, ...(input.scopeTags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const system = input.system ?? {};

  return Boolean(
    system.hasSolarPv ||
    system.hasBatteryStorage ||
    system.hasGridTieInverter ||
    system.hasGeneratorChangeover ||
    (system.inverterCapacityKw ?? 0) > 0 ||
    /sseg|solar|photovoltaic|\bpv\b|inverter|battery|embedded generation|grid[- ]?tied|net meter|generator changeover/.test(searchableText),
  );
}

function buildMissingEvidence(input: SsegComplianceInput): string[] {
  const evidence = input.evidence ?? {};
  const missing: string[] = [];

  if (!evidence.registrationRef) missing.push("municipal / distributor SSEG registration reference");
  if (!evidence.singleLineDiagramRef) missing.push("approved single-line diagram reference");
  if (!evidence.inverterCertificateRef) missing.push("NRS 097 inverter compliance certificate");
  if (!evidence.electricalCocRef) missing.push("electrical COC / competent-person sign-off");
  if (!evidence.distributorApprovalRef) missing.push("distributor approval / permission-to-operate reference");

  return missing;
}

function buildBlockers(input: SsegComplianceInput, missingEvidence: string[]): string[] {
  const checks = input.checks ?? {};
  const blockers = missingEvidence.map((item) => `Missing ${item} for SSEG compliance readiness.`);

  if (!checks.nrs097Compliant) blockers.push("NRS 097 compliance must be confirmed before SSEG readiness can be approved.");
  if (!checks.antiIslandingConfirmed) blockers.push("Anti-islanding protection must be confirmed before grid-tied operation is treated as compliant.");
  if (!checks.singleLineDiagramReviewed) blockers.push("Single-line diagram must be reviewed before municipal/distributor pack readiness.");
  if (!checks.professionalElectricalSignoff) blockers.push("Professional electrical sign-off is required before SSEG readiness approval.");
  if (!checks.distributorApprovalReceived) blockers.push("Distributor approval or permission-to-operate must be recorded before the system is treated as compliant.");

  return blockers;
}

function buildWarnings(input: SsegComplianceInput): string[] {
  const warnings: string[] = [];
  const system = input.system ?? {};

  if ((system.inverterCapacityKw ?? 0) >= 10) {
    warnings.push("Higher-capacity embedded generation may require additional municipal, distributor, or engineering review beyond the standard evidence pack.");
  }
  if (system.hasBatteryStorage && !input.evidence?.applicationPackRef) {
    warnings.push("Battery storage is present; attach the full SSEG application pack and safety notes for human review.");
  }
  if (system.hasGeneratorChangeover) {
    warnings.push("Generator/changeover scope may require separate electrical isolation and changeover documentation.");
  }

  return warnings;
}

function buildNextAction(required: boolean, blockers: string[], warnings: string[]): SsegComplianceNextAction {
  if (!required) {
    return {
      label: "Confirm SSEG compliance workflow not required",
      priority: "low",
      target: "municipal-tracker",
      detail: GOVERNANCE_NOTE,
      requiresHumanConfirmation: true,
      automationLevel: "advisory",
    };
  }

  if (blockers.length > 0) {
    return {
      label: "Resolve SSEG compliance blockers",
      priority: "high",
      target: "municipal-tracker",
      detail: `${blockers[0]} ${GOVERNANCE_NOTE}`,
      requiresHumanConfirmation: true,
      automationLevel: "advisory",
    };
  }

  return {
    label: warnings.length > 0 ? "Review SSEG compliance warnings" : "Approve SSEG evidence for municipal/distributor pack",
    priority: warnings.length > 0 ? "medium" : "low",
    target: "municipal-tracker",
    detail: GOVERNANCE_NOTE,
    requiresHumanConfirmation: true,
    automationLevel: "advisory",
  };
}

export function evaluateSsegComplianceReadiness(input: SsegComplianceInput): SsegComplianceResult {
  const required = hasSsegTrigger(input);
  const missingEvidence = required ? buildMissingEvidence(input) : [];
  const blockers = required ? buildBlockers(input, missingEvidence) : [];
  const warnings = required ? buildWarnings(input) : [];
  const riskLevel: SsegRiskLevel = blockers.length > 0
    ? "high"
    : warnings.length > 0
      ? "medium"
      : "low";
  const status: SsegComplianceStatus = !required
    ? "not_required"
    : blockers.length > 0
      ? "blocked"
      : "ready_for_professional_review";

  return Object.freeze({
    status,
    required,
    riskLevel,
    missingEvidence,
    blockers,
    warnings,
    nextAction: buildNextAction(required, blockers, warnings),
    audit: {
      prdSection: "Section 46: Solar PV & Small-Scale Embedded Generation (SSEG) Compliance",
      noAuthoritySubmission: true,
      noDistributorSubmission: true,
      humanReviewRequired: true,
    },
    summary: required
      ? `SSEG compliance readiness ${status.replaceAll("_", " ")}; ${blockers.length} blocker${blockers.length === 1 ? "" : "s"} and ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.`
      : "No SSEG trigger inferred from current project attributes; human review remains available.",
  } satisfies SsegComplianceResult);
}
