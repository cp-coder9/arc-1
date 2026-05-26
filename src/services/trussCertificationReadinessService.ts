export type TrussCertificationStatus = "not_required" | "blocked" | "ready_for_professional_review";

export interface TrussCertificationReadinessInput {
  projectId?: string;
  scopeTags?: string[];
  roof?: {
    timberTrusses?: boolean;
    roofCoveringPending?: boolean;
    structuralTimberSpecies?: string;
    windLoadingRegion?: string;
  };
  evidence?: {
    manufacturerDesignPackRef?: string;
    trussLayoutRef?: string;
    windBracingCalculationRef?: string;
    engineerInspectionRef?: string;
    a19CertificateRef?: string;
  };
  checks?: {
    manufacturerPackReviewed?: boolean;
    windLoadingChecked?: boolean;
    bracingChecked?: boolean;
    engineerInspectionComplete?: boolean;
    a19CertificateUploaded?: boolean;
    roofCoveringReleaseApproved?: boolean;
  };
}

export interface TrussCertificationReadinessResult {
  status: TrussCertificationStatus;
  required: boolean;
  riskLevel: "low" | "medium" | "high";
  missingEvidence: string[];
  blockers: string[];
  warnings: string[];
  nextAction: {
    label: string;
    priority: "low" | "medium" | "high";
    target: "sans-forms" | "municipal-tracker" | "snagging";
    detail: string;
    requiresHumanConfirmation: true;
    automationLevel: "advisory";
  };
  audit: {
    prdSection: "Section 50: Structural Timber & Truss Certification (SANS 10082 & ITC-SA A19)";
    noPaymentRelease: true;
    noRoofCoveringRelease: true;
    humanReviewRequired: true;
  };
  summary: string;
}

const NOTE = "AI may only prepare structural timber/truss certification readiness; registered engineer/BEP/admin review is required before roof covering, A19 close-out, or any payment-gate decision.";

function isRequired(input: TrussCertificationReadinessInput): boolean {
  const text = (input.scopeTags ?? []).join(" ").toLowerCase();
  return Boolean(input.roof?.timberTrusses || /truss|timber roof|roof truss|s5|sa pine|sans 10082|sans 10163|a19|itc-sa/.test(text));
}

function missingEvidence(input: TrussCertificationReadinessInput): string[] {
  const evidence = input.evidence ?? {};
  const missing: string[] = [];
  if (!evidence.manufacturerDesignPackRef) missing.push("truss manufacturer engineering design pack reference");
  if (!evidence.windBracingCalculationRef) missing.push("wind bracing / loading calculation reference");
  if (!evidence.engineerInspectionRef) missing.push("registered engineer inspection reference");
  if (!evidence.a19CertificateRef) missing.push("ITC-SA / A19 structural timber roof certificate reference");
  return missing;
}

function buildBlockers(input: TrussCertificationReadinessInput, missing: string[]): string[] {
  const checks = input.checks ?? {};
  const blockers = missing.map((item) => `Missing ${item} for structural timber/truss certification readiness.`);
  if (!checks.manufacturerPackReviewed) blockers.push("Manufacturer design pack must be reviewed against SANS 10163 and project roof layout before readiness approval.");
  if (!checks.windLoadingChecked) blockers.push("Wind loading metrics must be checked against the truss configuration before readiness approval.");
  if (!checks.bracingChecked) blockers.push("Roof bracing details must be checked before readiness approval.");
  if (!checks.engineerInspectionComplete) blockers.push("Registered engineer inspection must be complete before A19 readiness approval.");
  if (!checks.a19CertificateUploaded) blockers.push("A19 structural timber roof certificate must be uploaded before close-out readiness.");
  if (input.roof?.roofCoveringPending || !checks.roofCoveringReleaseApproved) blockers.push("Roof covering release must remain blocked until engineer inspection and A19 certificate evidence are approved.");
  return blockers;
}

function buildWarnings(input: TrussCertificationReadinessInput): string[] {
  const warnings: string[] = [];
  if (!input.evidence?.trussLayoutRef) warnings.push("No truss layout reference is attached to the manufacturer pack.");
  if (!input.roof?.structuralTimberSpecies) warnings.push("Structural timber species/grade is not captured for baseline SANS 10163 review.");
  if (!input.roof?.windLoadingRegion) warnings.push("Wind loading region is not captured for bracing/loading review.");
  return warnings;
}

function buildNextAction(required: boolean, blockers: string[], warnings: string[]): TrussCertificationReadinessResult["nextAction"] {
  if (!required) return { label: "Confirm truss certification workflow not required", priority: "low", target: "snagging", detail: NOTE, requiresHumanConfirmation: true, automationLevel: "advisory" };
  if (blockers.length) return { label: "Resolve truss certification blockers", priority: "high", target: "snagging", detail: `${blockers[0]} ${NOTE}`, requiresHumanConfirmation: true, automationLevel: "advisory" };
  return { label: warnings.length ? "Review truss certification warnings" : "Approve truss certification evidence for close-out/payment gate", priority: warnings.length ? "medium" : "low", target: "snagging", detail: NOTE, requiresHumanConfirmation: true, automationLevel: "advisory" };
}

export function evaluateTrussCertificationReadiness(input: TrussCertificationReadinessInput): TrussCertificationReadinessResult {
  const required = isRequired(input);
  const missing = required ? missingEvidence(input) : [];
  const blockers = required ? buildBlockers(input, missing) : [];
  const warnings = required ? buildWarnings(input) : [];
  const status: TrussCertificationStatus = !required ? "not_required" : blockers.length ? "blocked" : "ready_for_professional_review";
  const riskLevel = blockers.length ? "high" : warnings.length ? "medium" : "low";
  return Object.freeze({
    status,
    required,
    riskLevel,
    missingEvidence: missing,
    blockers,
    warnings,
    nextAction: buildNextAction(required, blockers, warnings),
    audit: { prdSection: "Section 50: Structural Timber & Truss Certification (SANS 10082 & ITC-SA A19)", noPaymentRelease: true, noRoofCoveringRelease: true, humanReviewRequired: true },
    summary: required ? `Truss certification readiness ${status.replaceAll("_", " ")}; ${blockers.length} blockers and ${warnings.length} warnings.` : "No structural timber/truss trigger inferred; human review remains available.",
  } satisfies TrussCertificationReadinessResult);
}
