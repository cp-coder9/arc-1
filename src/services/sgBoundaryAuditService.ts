export type SgBoundaryAuditStatus = "not_required" | "blocked" | "ready_for_professional_review";
export type SgBoundaryRiskLevel = "low" | "medium" | "high";

export interface SgBoundaryAuditInput {
  erfNumber?: string;
  propertyDeedKey?: string;
  scopeTags?: string[];
  uploadedEvidence?: {
    sgDiagramRef?: string;
    vectorisedBoundaryRef?: string;
    titleDeedRef?: string;
    surveyorConfirmationRef?: string;
  };
  checks?: {
    erfMatchesDeed?: boolean;
    boundaryMatchesDrawing?: boolean;
    servitudesIdentified?: boolean;
    encroachmentFlagged?: boolean;
    coordinatesVerified?: boolean;
  };
}

export interface SgBoundaryAuditNextAction {
  label: string;
  priority: "low" | "medium" | "high";
  target: "municipal-tracker";
  detail: string;
  requiresHumanConfirmation: true;
  automationLevel: "advisory";
}

export interface SgBoundaryAuditResult {
  status: SgBoundaryAuditStatus;
  required: boolean;
  riskLevel: SgBoundaryRiskLevel;
  missingEvidence: string[];
  blockers: string[];
  warnings: string[];
  nextAction: SgBoundaryAuditNextAction;
  audit: {
    prdSection: "Section 45: Surveyor-General (SG) Diagrams & Boundary Auditing";
    noAuthoritySubmission: true;
    noRegistryMutation: true;
    humanReviewRequired: true;
  };
  summary: string;
}

const GOVERNANCE_NOTE = "AI may prepare the SG boundary checklist only; a BEP, land surveyor, conveyancer, or admin reviewer must confirm evidence before municipal submission or site release.";

function hasBoundaryTrigger(input: SgBoundaryAuditInput): boolean {
  const searchableText = [input.erfNumber, input.propertyDeedKey, ...(input.scopeTags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return Boolean(input.erfNumber || input.propertyDeedKey || /boundary|sg diagram|surveyor|servitude|subdivision|cadastral|encroachment|erf/.test(searchableText));
}

function buildMissingEvidence(input: SgBoundaryAuditInput): string[] {
  const evidence = input.uploadedEvidence ?? {};
  const checks = input.checks ?? {};
  const missing: string[] = [];

  if (!evidence.sgDiagramRef) missing.push("Surveyor-General diagram reference");
  if (!evidence.vectorisedBoundaryRef) missing.push("vectorised boundary overlay reference");
  if (!evidence.titleDeedRef) missing.push("title deed / property registry reference");
  if (!checks.erfMatchesDeed) missing.push("ERF-to-deed match confirmation");
  if (!checks.boundaryMatchesDrawing) missing.push("drawing boundary overlay confirmation");
  if (!checks.coordinatesVerified) missing.push("coordinate verification confirmation");

  return missing;
}

function buildWarnings(input: SgBoundaryAuditInput): string[] {
  const warnings: string[] = [];
  if (input.checks?.servitudesIdentified) {
    warnings.push("Servitudes are identified and must be carried into the municipal submission notes and site constraints.");
  }
  if (input.checks?.encroachmentFlagged) {
    warnings.push("Potential encroachment is flagged and must be resolved before construction release.");
  }
  if (!input.uploadedEvidence?.surveyorConfirmationRef) {
    warnings.push("No professional surveyor confirmation reference is attached; retain accountable human review.");
  }
  return warnings;
}

function buildNextAction(required: boolean, blockers: string[], warnings: string[]): SgBoundaryAuditNextAction {
  if (!required) {
    return {
      label: "Confirm SG boundary audit not required",
      priority: "low",
      target: "municipal-tracker",
      detail: GOVERNANCE_NOTE,
      requiresHumanConfirmation: true,
      automationLevel: "advisory",
    };
  }

  if (blockers.length > 0) {
    return {
      label: "Resolve SG boundary audit blockers",
      priority: "high",
      target: "municipal-tracker",
      detail: `${blockers[0]} ${GOVERNANCE_NOTE}`,
      requiresHumanConfirmation: true,
      automationLevel: "advisory",
    };
  }

  return {
    label: warnings.length > 0 ? "Review SG boundary warnings" : "Approve SG boundary evidence for submission pack",
    priority: warnings.length > 0 ? "medium" : "low",
    target: "municipal-tracker",
    detail: GOVERNANCE_NOTE,
    requiresHumanConfirmation: true,
    automationLevel: "advisory",
  };
}

export function evaluateSgBoundaryAudit(input: SgBoundaryAuditInput): SgBoundaryAuditResult {
  const required = hasBoundaryTrigger(input);
  const missingEvidence = required ? buildMissingEvidence(input) : [];
  const warnings = required ? buildWarnings(input) : [];
  const blockers = [
    ...missingEvidence.map((item) => `Missing ${item} for SG boundary audit.`),
    ...(input.checks?.encroachmentFlagged ? ["Potential encroachment must be resolved before municipal submission or site release."] : []),
  ];
  const riskLevel: SgBoundaryRiskLevel = blockers.length > 0
    ? "high"
    : warnings.length > 0
      ? "medium"
      : "low";
  const status: SgBoundaryAuditStatus = !required
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
      prdSection: "Section 45: Surveyor-General (SG) Diagrams & Boundary Auditing",
      noAuthoritySubmission: true,
      noRegistryMutation: true,
      humanReviewRequired: true,
    },
    summary: required
      ? `SG boundary audit ${status.replaceAll("_", " ")}; ${blockers.length} blocker${blockers.length === 1 ? "" : "s"} and ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.`
      : "No SG boundary trigger inferred from current project attributes; human review remains available.",
  } satisfies SgBoundaryAuditResult);
}
