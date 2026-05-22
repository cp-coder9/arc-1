import type { JobCategory } from "../types";

export type StatutoryComplianceTriggerKey =
  | "sg_boundary"
  | "sseg_registration"
  | "wula_screening"
  | "bbbee_verification"
  | "fire_rational_design"
  | "truss_certificate"
  | "development_charges"
  | "demolition_permit"
  | "asbestos_clearance"
  | "heritage_approval"
  | "lab_testing";

export type StatutoryComplianceStatus = "not_triggered" | "ready_for_review" | "blocked";

export interface StatutoryComplianceEvidence {
  sgDiagramApproved?: boolean;
  ssegRegistrationSubmitted?: boolean;
  wulaScreeningCompleted?: boolean;
  bbbeeCertificateVerified?: boolean;
  fireRationalDesignAccepted?: boolean;
  trussCertificateUploaded?: boolean;
  developmentChargesAcknowledged?: boolean;
  demolitionPermitUploaded?: boolean;
  asbestosClearanceUploaded?: boolean;
  heritageApprovalUploaded?: boolean;
  labTestResultsUploaded?: boolean;
}

export interface StatutoryComplianceTriggerInput {
  projectId?: string;
  category?: JobCategory;
  location?: string;
  scopeTags?: string[];
  procurement?: {
    publicSector?: boolean;
    estimatedValue?: number;
  };
  municipalAccount?: {
    developmentChargeEstimate?: number;
    ratesClearanceRequired?: boolean;
  };
  constructionQuality?: {
    requiresConcreteCubeTests?: boolean;
    requiresCompactionTests?: boolean;
    requiresGlazingTests?: boolean;
  };
  evidence?: StatutoryComplianceEvidence;
}

export interface StatutoryComplianceTrigger {
  key: StatutoryComplianceTriggerKey;
  label: string;
  reason: string;
  evidenceKey: keyof StatutoryComplianceEvidence;
  target: "municipal-tracker" | "sans-forms" | "procurement" | "snagging";
  satisfied: boolean;
}

export interface StatutoryComplianceNextAction {
  label: string;
  target: "municipal-tracker" | "sans-forms" | "procurement" | "snagging";
  priority: "high" | "medium" | "low";
  detail: string;
  requiresHumanConfirmation: true;
  automationLevel: "advisory";
}

export interface StatutoryComplianceTriggerResult {
  status: StatutoryComplianceStatus;
  requiredTriggers: StatutoryComplianceTrigger[];
  blockers: string[];
  warnings: string[];
  nextAction: StatutoryComplianceNextAction;
  humanReviewRequired: true;
  aiMaySubmitToAuthority: false;
  summary: string;
}

type TriggerRule = Omit<StatutoryComplianceTrigger, "satisfied"> & {
  matches: (input: NormalizedTriggerInput) => boolean;
  blocker: string;
};

type NormalizedTriggerInput = StatutoryComplianceTriggerInput & { searchableText: string; evidence: StatutoryComplianceEvidence };

const HUMAN_GOVERNANCE_NOTE = "AI may identify statutory triggers and prepare checklists only; accountable users must confirm evidence before authority submission, procurement release, or close-out.";

const TRIGGER_RULES: TriggerRule[] = [
  {
    key: "sg_boundary",
    label: "SG boundary confirmation",
    evidenceKey: "sgDiagramApproved",
    target: "municipal-tracker",
    reason: "Boundary disputes, subdivisions, servitudes, or cadastral uncertainty require Surveyor-General-aligned evidence before submission or site release.",
    blocker: "SG boundary confirmation is required before statutory submission or construction release.",
    matches: ({ searchableText }) => /boundary|sg diagram|surveyor|servitude|subdivision|cadastral/.test(searchableText),
  },
  {
    key: "sseg_registration",
    label: "SSEG / embedded generation registration",
    evidenceKey: "ssegRegistrationSubmitted",
    target: "municipal-tracker",
    reason: "Solar PV, inverter, battery, or embedded generation work can require municipal SSEG registration and electrical sign-off.",
    blocker: "SSEG registration evidence is required before embedded-generation work is treated as compliant.",
    matches: ({ searchableText }) => /sseg|solar|photovoltaic|pv|inverter|battery|embedded generation/.test(searchableText),
  },
  {
    key: "wula_screening",
    label: "Water-use / WULA screening",
    evidenceKey: "wulaScreeningCompleted",
    target: "municipal-tracker",
    reason: "Boreholes, stormwater discharge, wetlands, rivers, or other water-use impacts need screening before technical release.",
    blocker: "Water-use screening evidence is required before water-impact work proceeds.",
    matches: ({ searchableText }) => /wula|water use|borehole|wetland|river|stormwater|discharge|detention pond/.test(searchableText),
  },
  {
    key: "bbbee_verification",
    label: "B-BBEE procurement verification",
    evidenceKey: "bbbeeCertificateVerified",
    target: "procurement",
    reason: "Public-sector or high-value procurement needs verified supplier transformation/compliance evidence before award review.",
    blocker: "B-BBEE verification is required before this procurement package can be marked award-ready.",
    matches: ({ procurement }) => Boolean(procurement?.publicSector || (procurement?.estimatedValue ?? 0) >= 1_000_000),
  },
  {
    key: "fire_rational_design",
    label: "Fire rational design / occupancy confirmation",
    evidenceKey: "fireRationalDesignAccepted",
    target: "sans-forms",
    reason: "Commercial, industrial, public, or occupancy-change work may need fire consultant review and municipal acceptance.",
    blocker: "Fire rational design or occupancy compliance evidence is required.",
    matches: ({ category, searchableText }) => category === "Commercial" || category === "Industrial" || /fire|occupancy|assembly|warehouse|sprinkler/.test(searchableText),
  },
  {
    key: "truss_certificate",
    label: "Roof truss certificate",
    evidenceKey: "trussCertificateUploaded",
    target: "sans-forms",
    reason: "Roof truss design, installation, or alteration requires competent-person certificates and record evidence.",
    blocker: "Roof truss certificate evidence is required before close-out or inspection readiness.",
    matches: ({ searchableText }) => /truss|roof structure|timber roof|roof alteration/.test(searchableText),
  },
  {
    key: "development_charges",
    label: "Development charges acknowledgement",
    evidenceKey: "developmentChargesAcknowledged",
    target: "municipal-tracker",
    reason: "Development-charge estimates and municipal account obligations must be acknowledged before payment or approval planning.",
    blocker: "Development charges must be acknowledged before approval/payment readiness.",
    matches: ({ municipalAccount, searchableText }) => Boolean((municipalAccount?.developmentChargeEstimate ?? 0) > 0 || municipalAccount?.ratesClearanceRequired || /development charge|bulk contribution|rates clearance/.test(searchableText)),
  },
  {
    key: "demolition_permit",
    label: "Demolition permit",
    evidenceKey: "demolitionPermitUploaded",
    target: "municipal-tracker",
    reason: "Demolition or partial demolition needs permit evidence before site release.",
    blocker: "Demolition permit evidence is required before demolition work proceeds.",
    matches: ({ searchableText }) => /demolition|demolish|partial demo|strip out/.test(searchableText),
  },
  {
    key: "asbestos_clearance",
    label: "Asbestos clearance",
    evidenceKey: "asbestosClearanceUploaded",
    target: "municipal-tracker",
    reason: "Asbestos risk requires specialist clearance before demolition, alteration, or occupation workflows continue.",
    blocker: "Asbestos clearance evidence is required before affected work proceeds.",
    matches: ({ searchableText }) => /asbestos|hazardous material|hazmat/.test(searchableText),
  },
  {
    key: "heritage_approval",
    label: "Heritage approval",
    evidenceKey: "heritageApprovalUploaded",
    target: "municipal-tracker",
    reason: "Heritage overlays, older structures, or conservation areas may need heritage authority approval.",
    blocker: "Heritage approval evidence is required before submission or demolition release.",
    matches: ({ searchableText }) => /heritage|conservation|older than 60|60 years|historic/.test(searchableText),
  },
  {
    key: "lab_testing",
    label: "Construction lab testing",
    evidenceKey: "labTestResultsUploaded",
    target: "snagging",
    reason: "Concrete, compaction, glazing, or other quality tests must be recorded before payment or close-out readiness.",
    blocker: "Required lab test results must be uploaded before payment or close-out readiness.",
    matches: ({ constructionQuality, searchableText }) => Boolean(constructionQuality?.requiresConcreteCubeTests || constructionQuality?.requiresCompactionTests || constructionQuality?.requiresGlazingTests || /cube test|compaction|glazing test|lab test|concrete test/.test(searchableText)),
  },
];

function normalizeInput(input: StatutoryComplianceTriggerInput): NormalizedTriggerInput {
  const searchableText = [input.category, input.location, ...(input.scopeTags ?? [])]
    .filter(Boolean)
    .join(" " )
    .toLowerCase();
  return { ...input, searchableText, evidence: input.evidence ?? {} };
}

function buildWarnings(input: NormalizedTriggerInput, triggers: StatutoryComplianceTrigger[]): string[] {
  const warnings: string[] = [];
  if ((input.category === "Commercial" || input.category === "Industrial") && triggers.length > 0) {
    warnings.push("Commercial work may require competent-person confirmations even when core trigger evidence is present.");
  }
  if (triggers.length === 0) {
    warnings.push("No statutory triggers were inferred from current structured attributes; retain human review for municipal and professional obligations.");
  }
  return warnings;
}

function buildNextAction(requiredTriggers: StatutoryComplianceTrigger[], blockers: string[]): StatutoryComplianceNextAction {
  const firstOpenTrigger = requiredTriggers.find((trigger) => !trigger.satisfied);
  if (firstOpenTrigger) {
    return {
      label: `Resolve ${firstOpenTrigger.label}`,
      target: firstOpenTrigger.target,
      priority: "high",
      detail: `${firstOpenTrigger.reason} ${HUMAN_GOVERNANCE_NOTE}`,
      requiresHumanConfirmation: true,
      automationLevel: "advisory",
    };
  }

  return {
    label: requiredTriggers.length > 0 ? "Review statutory trigger evidence" : "Confirm no statutory triggers apply",
    target: "municipal-tracker",
    priority: blockers.length > 0 ? "high" : "medium",
    detail: HUMAN_GOVERNANCE_NOTE,
    requiresHumanConfirmation: true,
    automationLevel: "advisory",
  };
}

export function evaluateStatutoryComplianceTriggers(input: StatutoryComplianceTriggerInput): StatutoryComplianceTriggerResult {
  const normalized = normalizeInput(input);
  const requiredTriggers = TRIGGER_RULES
    .filter((rule) => rule.matches(normalized))
    .map(({ matches: _matches, blocker: _blocker, ...rule }) => ({
      ...rule,
      satisfied: normalized.evidence[rule.evidenceKey] === true,
    }));

  const blockerByKey = new Map(TRIGGER_RULES.map((rule) => [rule.key, rule.blocker]));
  const blockers = requiredTriggers
    .filter((trigger) => !trigger.satisfied)
    .map((trigger) => blockerByKey.get(trigger.key) ?? `${trigger.label} evidence is required.`);
  const warnings = buildWarnings(normalized, requiredTriggers);
  const status: StatutoryComplianceStatus = blockers.length > 0 ? "blocked" : requiredTriggers.length > 0 ? "ready_for_review" : "not_triggered";

  return {
    status,
    requiredTriggers,
    blockers,
    warnings,
    nextAction: buildNextAction(requiredTriggers, blockers),
    humanReviewRequired: true,
    aiMaySubmitToAuthority: false,
    summary: requiredTriggers.length > 0
      ? `${requiredTriggers.length} statutory trigger${requiredTriggers.length === 1 ? "" : "s"} identified; ${blockers.length} blocker${blockers.length === 1 ? "" : "s"} require human-governed evidence.`
      : "No structured statutory trigger was identified; human review remains required before authority submission.",
  };
}

export const statutoryComplianceTriggerService = { evaluateStatutoryComplianceTriggers };
export default statutoryComplianceTriggerService;
