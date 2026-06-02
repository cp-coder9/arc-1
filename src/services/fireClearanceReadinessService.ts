import type { JobCategory } from "../types";

export type FireClearanceStatus = "not_required" | "blocked" | "ready_for_professional_review";
export interface FireClearanceInput {
  projectId?: string;
  category?: JobCategory;
  scopeTags?: string[];
  design?: { occupancyClassChanged?: boolean; sprinklerSystem?: boolean; fireDetectionSystem?: boolean; publicAssembly?: boolean };
  evidence?: { firePlanRef?: string; rationalDesignRef?: string; municipalFireSubmissionRef?: string; sprinklerOrDetectionDesignRef?: string; fireInstallationCertificateRef?: string };
  checks?: { escapeRoutesChecked?: boolean; compartmentationChecked?: boolean; equipmentPlacementChecked?: boolean; rationalDesignAccepted?: boolean; municipalFireSubmissionReady?: boolean; fireInstallationCertificateUploaded?: boolean };
}
export interface FireClearanceResult {
  status: FireClearanceStatus;
  required: boolean;
  riskLevel: "low" | "medium" | "high";
  missingEvidence: string[];
  blockers: string[];
  warnings: string[];
  nextAction: { label: string; priority: "low" | "medium" | "high"; target: "sans-forms" | "municipal-tracker" | "snagging"; detail: string; requiresHumanConfirmation: true; automationLevel: "advisory" };
  audit: { prdSection: "Section 49: Fire Protection & Municipal Fire Department Clearances (SANS 10400-T)"; noMunicipalSubmission: true; noOccupancyCertification: true; humanReviewRequired: true };
  summary: string;
}
const NOTE = "AI may prepare fire clearance readiness only; a competent person/fire engineer, BEP, municipal reviewer, or admin must confirm before fire-department submission, occupancy clearance, or close-out.";
function required(input: FireClearanceInput): boolean {
  const text = [input.category, ...(input.scopeTags ?? [])].filter(Boolean).join(" ").toLowerCase();
  const d = input.design ?? {};
  return Boolean(input.category === "Commercial" || input.category === "Industrial" || d.occupancyClassChanged || d.sprinklerSystem || d.fireDetectionSystem || d.publicAssembly || /fire|occupancy|assembly|sprinkler|detection|hose reel|hydrant|escape route|sans 10400-t/.test(text));
}
function missing(input: FireClearanceInput): string[] {
  const e = input.evidence ?? {};
  const out: string[] = [];
  if (!e.rationalDesignRef) out.push("fire rational design / competent-person review reference");
  if (!e.municipalFireSubmissionRef) out.push("municipal fire department submission reference");
  if (!e.sprinklerOrDetectionDesignRef && (input.design?.sprinklerSystem || input.design?.fireDetectionSystem)) out.push("sprinkler / detection design reference");
  if (!e.fireInstallationCertificateRef) out.push("fire installation certificate / Form 4 reference");
  return out;
}
function blockers(input: FireClearanceInput, miss: string[]): string[] {
  const c = input.checks ?? {};
  const out = miss.map((item) => `Missing ${item} for fire clearance readiness.`);
  if (!c.escapeRoutesChecked) out.push("Escape route geometry must be checked against SANS 10400-T before readiness approval.");
  if (!c.compartmentationChecked) out.push("Fire compartmentation must be checked before readiness approval.");
  if (!c.equipmentPlacementChecked) out.push("Fire equipment placement must be checked before readiness approval.");
  if (!c.rationalDesignAccepted) out.push("Fire rational design/competent-person review must be accepted before submission readiness.");
  if (!c.municipalFireSubmissionReady) out.push("Municipal fire submission pack must be human-reviewed before submission readiness.");
  if (!c.fireInstallationCertificateUploaded) out.push("Fire installation certificate/Form 4 must be uploaded before close-out/occupancy readiness.");
  return out;
}
function warnings(input: FireClearanceInput): string[] {
  const out: string[] = [];
  if (!input.evidence?.firePlanRef) out.push("No dedicated fire plan reference is attached.");
  if (input.design?.publicAssembly) out.push("Public assembly occupancy may require stricter escape-width and inspection evidence.");
  return out;
}
function nextAction(requiredFlag: boolean, b: string[], w: string[]): FireClearanceResult["nextAction"] {
  if (!requiredFlag) return { label: "Confirm fire clearance workflow not required", priority: "low", target: "sans-forms", detail: NOTE, requiresHumanConfirmation: true, automationLevel: "advisory" };
  if (b.length) return { label: "Resolve fire clearance blockers", priority: "high", target: "sans-forms", detail: `${b[0]} ${NOTE}`, requiresHumanConfirmation: true, automationLevel: "advisory" };
  return { label: w.length ? "Review fire clearance warnings" : "Approve fire clearance evidence for municipal/close-out pack", priority: w.length ? "medium" : "low", target: "sans-forms", detail: NOTE, requiresHumanConfirmation: true, automationLevel: "advisory" };
}
export function evaluateFireClearanceReadiness(input: FireClearanceInput): FireClearanceResult {
  const req = required(input);
  const miss = req ? missing(input) : [];
  const b = req ? blockers(input, miss) : [];
  const w = req ? warnings(input) : [];
  const status: FireClearanceStatus = !req ? "not_required" : b.length ? "blocked" : "ready_for_professional_review";
  const riskLevel = b.length ? "high" : w.length ? "medium" : "low";
  return Object.freeze({ status, required: req, riskLevel, missingEvidence: miss, blockers: b, warnings: w, nextAction: nextAction(req, b, w), audit: { prdSection: "Section 49: Fire Protection & Municipal Fire Department Clearances (SANS 10400-T)", noMunicipalSubmission: true, noOccupancyCertification: true, humanReviewRequired: true }, summary: req ? `Fire clearance readiness ${status.replaceAll("_", " ")}; ${b.length} blockers and ${w.length} warnings.` : "No fire clearance trigger inferred; human review remains available." } satisfies FireClearanceResult);
}
