export type WulaComplianceStatus = "not_required" | "blocked" | "ready_for_professional_review";
export type WulaRiskLevel = "low" | "medium" | "high";

export interface WulaComplianceInput {
  projectId?: string;
  location?: string;
  scopeTags?: string[];
  system?: {
    hasBorehole?: boolean;
    hasGreywaterReuse?: boolean;
    hasBlackwaterTreatment?: boolean;
    hasRainwaterHarvesting?: boolean;
    sensitiveWaterArea?: boolean;
    drinkingWaterConnectionPresent?: boolean;
  };
  evidence?: {
    dwsAuthorizationRef?: string;
    eapOrGeohydrologistRef?: string;
    yieldTestRef?: string;
    waterQualityCertificateRef?: string;
    sans10252PlumbingReviewRef?: string;
    plumbingCocRef?: string;
  };
  checks?: {
    potableNonPotableSeparationConfirmed?: boolean;
    sans10252Compliant?: boolean;
    eapOrGeohydrologistReviewComplete?: boolean;
    waterQualityCertificateAccepted?: boolean;
    plumbingCocUploaded?: boolean;
    dwsAuthorizationReceived?: boolean;
  };
}

export interface WulaComplianceNextAction {
  label: string;
  priority: "low" | "medium" | "high";
  target: "municipal-tracker" | "sans-forms";
  detail: string;
  requiresHumanConfirmation: true;
  automationLevel: "advisory";
}

export interface WulaComplianceResult {
  status: WulaComplianceStatus;
  required: boolean;
  riskLevel: WulaRiskLevel;
  missingEvidence: string[];
  blockers: string[];
  warnings: string[];
  nextAction: WulaComplianceNextAction;
  audit: {
    prdSection: "Section 47: Water Infrastructure & Water Use License Applications (WULA)";
    noAuthoritySubmission: true;
    noPermitMutation: true;
    humanReviewRequired: true;
  };
  summary: string;
}

const GOVERNANCE_NOTE = "AI may prepare the WULA/SANS 10252 checklist only; an accountable BEP, plumber, EAP, geohydrologist, or admin reviewer must confirm evidence before DWS/municipal submission or site release.";

function hasWaterTrigger(input: WulaComplianceInput): boolean {
  const searchableText = [input.location, ...(input.scopeTags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const system = input.system ?? {};

  return Boolean(
    system.hasBorehole ||
    system.hasGreywaterReuse ||
    system.hasBlackwaterTreatment ||
    system.hasRainwaterHarvesting ||
    system.sensitiveWaterArea ||
    /wula|water use|borehole|greywater|grey water|blackwater|black water|rainwater|rain water|harvesting|wetland|river|stormwater|water extraction|sans 10252|sans10252/.test(searchableText),
  );
}

function buildMissingEvidence(input: WulaComplianceInput): string[] {
  const evidence = input.evidence ?? {};
  const system = input.system ?? {};
  const missing: string[] = [];

  if (!evidence.dwsAuthorizationRef) missing.push("DWS WULA / registration reference");
  if (!evidence.eapOrGeohydrologistRef && (system.hasBorehole || system.sensitiveWaterArea || system.hasBlackwaterTreatment)) {
    missing.push("EAP or geohydrologist review reference");
  }
  if (!evidence.yieldTestRef && system.hasBorehole) missing.push("borehole yield / abstraction test reference");
  if (!evidence.waterQualityCertificateRef && (system.hasBorehole || system.hasBlackwaterTreatment)) {
    missing.push("SANS 241 water quality certificate");
  }
  if (!evidence.plumbingCocRef) missing.push("plumbing certificate of compliance reference");

  return missing;
}

function buildBlockers(input: WulaComplianceInput, missingEvidence: string[]): string[] {
  const checks = input.checks ?? {};
  const blockers = missingEvidence.map((item) => `Missing ${item} for WULA / water compliance readiness.`);

  if (!checks.potableNonPotableSeparationConfirmed) {
    blockers.push("Potable and non-potable water separation must be confirmed before plumbing compliance readiness.");
  }
  if (!checks.sans10252Compliant) blockers.push("SANS 10252 plumbing compliance must be confirmed before water infrastructure readiness.");
  if (!checks.eapOrGeohydrologistReviewComplete && (input.system?.hasBorehole || input.system?.sensitiveWaterArea || input.system?.hasBlackwaterTreatment)) {
    blockers.push("EAP/geohydrologist review must be complete before WULA readiness approval.");
  }
  if (!checks.waterQualityCertificateAccepted && (input.system?.hasBorehole || input.system?.hasBlackwaterTreatment)) {
    blockers.push("Water quality evidence must be accepted before potable or treatment-system readiness.");
  }
  if (!checks.plumbingCocUploaded) blockers.push("Plumbing certificate of compliance must be uploaded before release.");
  if (!checks.dwsAuthorizationReceived) blockers.push("DWS authorization or registration evidence must be recorded before WULA readiness approval.");

  return blockers;
}

function buildWarnings(input: WulaComplianceInput): string[] {
  const warnings: string[] = [];
  const system = input.system ?? {};

  if (system.sensitiveWaterArea) {
    warnings.push("Sensitive water-area context may require broader environmental authorisation beyond a basic WULA/registration checklist.");
  }
  if (system.hasGreywaterReuse && system.drinkingWaterConnectionPresent) {
    warnings.push("Greywater reuse is present alongside drinking-water connection; maintain strict cross-connection review.");
  }
  if (!input.evidence?.sans10252PlumbingReviewRef) {
    warnings.push("No SANS 10252 plumbing review reference is attached; retain accountable professional review.");
  }

  return warnings;
}

function buildNextAction(required: boolean, blockers: string[], warnings: string[]): WulaComplianceNextAction {
  if (!required) {
    return {
      label: "Confirm WULA / water compliance workflow not required",
      priority: "low",
      target: "municipal-tracker",
      detail: GOVERNANCE_NOTE,
      requiresHumanConfirmation: true,
      automationLevel: "advisory",
    };
  }

  if (blockers.length > 0) {
    return {
      label: "Resolve WULA / water compliance blockers",
      priority: "high",
      target: "municipal-tracker",
      detail: `${blockers[0]} ${GOVERNANCE_NOTE}`,
      requiresHumanConfirmation: true,
      automationLevel: "advisory",
    };
  }

  return {
    label: warnings.length > 0 ? "Review WULA / water compliance warnings" : "Approve WULA / water evidence for authority pack",
    priority: warnings.length > 0 ? "medium" : "low",
    target: "municipal-tracker",
    detail: GOVERNANCE_NOTE,
    requiresHumanConfirmation: true,
    automationLevel: "advisory",
  };
}

export function evaluateWulaComplianceReadiness(input: WulaComplianceInput): WulaComplianceResult {
  const required = hasWaterTrigger(input);
  const missingEvidence = required ? buildMissingEvidence(input) : [];
  const blockers = required ? buildBlockers(input, missingEvidence) : [];
  const warnings = required ? buildWarnings(input) : [];
  const riskLevel: WulaRiskLevel = blockers.length > 0
    ? "high"
    : warnings.length > 0
      ? "medium"
      : "low";
  const status: WulaComplianceStatus = !required
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
      prdSection: "Section 47: Water Infrastructure & Water Use License Applications (WULA)",
      noAuthoritySubmission: true,
      noPermitMutation: true,
      humanReviewRequired: true,
    },
    summary: required
      ? `WULA / water compliance readiness ${status.replaceAll("_", " ")}; ${blockers.length} blocker${blockers.length === 1 ? "" : "s"} and ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.`
      : "No WULA / water infrastructure trigger inferred from current project attributes; human review remains available.",
  } satisfies WulaComplianceResult);
}
