export type DevelopmentChargeReadinessStatus = "not_required" | "blocked" | "ready_for_municipal_review";

export interface DevelopmentChargeReadinessInput {
  projectId?: string;
  municipality?: string;
  scopeTags?: string[];
  development?: {
    landUseChange?: boolean;
    floorAreaIncreaseSqm?: number;
    newServiceConnections?: Array<"electricity" | "water" | "sewer" | "stormwater">;
    zoningOrSitePlanApproved?: boolean;
  };
  evidence?: {
    chargeEstimateRef?: string;
    municipalDemandRef?: string;
    paymentProofRef?: string;
    clearanceRef?: string;
    connectionApplicationRefs?: Partial<Record<"electricity" | "water" | "sewer" | "stormwater", string>>;
    meterCommissioningRef?: string;
  };
  checks?: {
    chargesCalculated?: boolean;
    municipalDemandReceived?: boolean;
    paymentCleared?: boolean;
    connectionApplicationsReady?: boolean;
    siteInspectionComplete?: boolean;
    metersCommissioned?: boolean;
  };
}

export interface DevelopmentChargeReadinessResult {
  status: DevelopmentChargeReadinessStatus;
  required: boolean;
  riskLevel: "low" | "medium" | "high";
  missingEvidence: string[];
  blockers: string[];
  warnings: string[];
  serviceConnectionReadiness: Record<"electricity" | "water" | "sewer" | "stormwater", "not_requested" | "missing_application" | "application_ready">;
  nextAction: { label: string; priority: "low" | "medium" | "high"; target: "municipal-tracker"; detail: string; requiresHumanConfirmation: true; automationLevel: "advisory" };
  audit: { prdSection: "Section 51: Municipal Bulk Service Connections & Development Charges"; noAutomaticMunicipalSubmission: true; noAutomaticPaymentRelease: true; humanReviewRequired: true };
  summary: string;
}

const SERVICES = ["electricity", "water", "sewer", "stormwater"] as const;
const NOTE = "AI may prepare development-charge and utility-connection readiness only; municipality, BEP/admin, and finance confirmation are required before payment, submission, connection, or occupancy decisions.";

function requested(input: DevelopmentChargeReadinessInput) {
  return new Set(input.development?.newServiceConnections ?? []);
}

function isRequired(input: DevelopmentChargeReadinessInput): boolean {
  const text = (input.scopeTags ?? []).join(" ").toLowerCase();
  return Boolean(input.development?.landUseChange || (input.development?.floorAreaIncreaseSqm ?? 0) > 0 || (input.development?.newServiceConnections?.length ?? 0) > 0 || /development charge|bulk service|service connection|city power|johannesburg water|eskom|meter|zoning/.test(text));
}

function serviceReadiness(input: DevelopmentChargeReadinessInput): DevelopmentChargeReadinessResult["serviceConnectionReadiness"] {
  const req = requested(input);
  const refs = input.evidence?.connectionApplicationRefs ?? {};
  return Object.freeze(Object.fromEntries(SERVICES.map((service) => [service, !req.has(service) ? "not_requested" : refs[service] ? "application_ready" : "missing_application"])) as DevelopmentChargeReadinessResult["serviceConnectionReadiness"]);
}

function missingEvidence(input: DevelopmentChargeReadinessInput, connections: DevelopmentChargeReadinessResult["serviceConnectionReadiness"]): string[] {
  const e = input.evidence ?? {};
  const out: string[] = [];
  if (!e.chargeEstimateRef) out.push("municipal development-charge estimate reference");
  if (!e.municipalDemandRef) out.push("municipal development-charge demand reference");
  if (!e.paymentProofRef) out.push("development-charge payment proof reference");
  if (!e.clearanceRef) out.push("municipal charge clearance / service readiness reference");
  for (const service of SERVICES) if (connections[service] === "missing_application") out.push(`${service} connection application reference`);
  return out;
}

function blockers(input: DevelopmentChargeReadinessInput, missing: string[], connections: DevelopmentChargeReadinessResult["serviceConnectionReadiness"]): string[] {
  const c = input.checks ?? {};
  const out = missing.map((item) => `Missing ${item} for municipal bulk service/development-charge readiness.`);
  if (!input.development?.zoningOrSitePlanApproved) out.push("Zoning/site-plan approval must be confirmed before development-charge and connection readiness.");
  if (!c.chargesCalculated) out.push("Development charges must be calculated against the municipal framework before readiness approval.");
  if (!c.municipalDemandReceived) out.push("Municipal payment demand must be received and human-reviewed before payment tracking readiness.");
  if (!c.paymentCleared) out.push("Development-charge payment must be cleared before service connection or occupancy readiness.");
  if (Object.values(connections).includes("missing_application") || !c.connectionApplicationsReady) out.push("Utility connection applications must be ready for all requested services.");
  if (!c.siteInspectionComplete) out.push("Municipal/site utility inspection must be complete before commissioning readiness.");
  if (!c.metersCommissioned) out.push("Requested utility meters/connections must be commissioned before final service readiness.");
  return out;
}

function warnings(input: DevelopmentChargeReadinessInput): string[] {
  const out: string[] = [];
  if (!input.municipality) out.push("Municipality is not captured, so framework-specific charge validation remains incomplete.");
  if ((input.development?.floorAreaIncreaseSqm ?? 0) > 0 && !input.development?.landUseChange) out.push("Floor-area increase may still trigger bulk service contributions even without land-use change.");
  return out;
}

function nextAction(required: boolean, b: string[], w: string[]): DevelopmentChargeReadinessResult["nextAction"] {
  if (!required) return { label: "Confirm development-charge workflow not required", priority: "low", target: "municipal-tracker", detail: NOTE, requiresHumanConfirmation: true, automationLevel: "advisory" };
  if (b.length) return { label: "Resolve development-charge/service-connection blockers", priority: "high", target: "municipal-tracker", detail: `${b[0]} ${NOTE}`, requiresHumanConfirmation: true, automationLevel: "advisory" };
  return { label: w.length ? "Review development-charge readiness warnings" : "Approve municipal service-connection readiness pack", priority: w.length ? "medium" : "low", target: "municipal-tracker", detail: NOTE, requiresHumanConfirmation: true, automationLevel: "advisory" };
}

export function evaluateDevelopmentChargeReadiness(input: DevelopmentChargeReadinessInput): DevelopmentChargeReadinessResult {
  const req = isRequired(input);
  const connections = serviceReadiness(input);
  const missing = req ? missingEvidence(input, connections) : [];
  const b = req ? blockers(input, missing, connections) : [];
  const w = req ? warnings(input) : [];
  const status: DevelopmentChargeReadinessStatus = !req ? "not_required" : b.length ? "blocked" : "ready_for_municipal_review";
  const riskLevel = b.length ? "high" : w.length ? "medium" : "low";
  return Object.freeze({ status, required: req, riskLevel, missingEvidence: missing, blockers: b, warnings: w, serviceConnectionReadiness: connections, nextAction: nextAction(req, b, w), audit: { prdSection: "Section 51: Municipal Bulk Service Connections & Development Charges", noAutomaticMunicipalSubmission: true, noAutomaticPaymentRelease: true, humanReviewRequired: true }, summary: req ? `Development-charge readiness ${status.replaceAll("_", " ")}; ${b.length} blockers and ${w.length} warnings.` : "No municipal bulk-service/development-charge trigger inferred; human review remains available." } satisfies DevelopmentChargeReadinessResult);
}
