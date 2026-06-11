/**
 * Terms & Conditions Service
 *
 * Manages proposal terms templates with:
 *   - Standard Architex terms
 *   - Profession-specific terms (architect, engineer, QS, town planner, etc.)
 *   - Company/user saved terms
 *   - Project-specific special conditions
 *   - Terms versioning and snapshot-on-issue
 */

import type { ProposalTermsSnapshot } from '../types/proposalBuilder';

export interface TermsTemplate {
  termsId: string;
  /** Human-readable label */
  label: string;
  /** Version string, e.g. "2026.1" */
  version: string;
  /** Scope classification */
  scope: 'architex_standard' | 'profession_specific' | 'company_saved' | 'project_specific';
  /** The role this template applies to (if profession_specific) */
  applicableRole?: string;
  /** Full text of the clauses */
  clauses: string[];
  /** Whether this template requires explicit approval */
  requiresApproval: boolean;
  /** Default payment terms text */
  paymentTerms?: string;
  /** Default validity period in days */
  defaultValidityDays?: number;
  /** Default client responsibilities */
  clientResponsibilities?: string[];
  /** Default exclusions */
  exclusions?: string[];
  /** Created by user ID (for company_saved) */
  createdBy?: string;
  /** ISO timestamp */
  createdAt?: string;
  /** ISO timestamp */
  updatedAt?: string;
}

// ─── Standard Architex Terms ──────────────────────────────────────────────────

export const ARCHITEX_STANDARD_TERMS: TermsTemplate = {
  termsId: 'architex-standard-v2026.1',
  label: 'Architex Standard Proposal Terms',
  version: '2026.1',
  scope: 'architex_standard',
  requiresApproval: false,
  defaultValidityDays: 14,
  clauses: [
    'Fees exclude statutory municipal charges and disbursements unless explicitly stated in the proposal.',
    'The professional remains responsible for verifying fee assumptions, scope of services, and final proposal before issue.',
    'Issued proposals are locked — revisions create a new superseding proposal rather than mutating the issued record.',
    'Platform transaction fees are disclosed transparently: 1.00% of chargeable fees, shared equally between payer and payee.',
    'This proposal is a commercial offer and does not constitute a binding professional appointment until formally accepted.',
  ],
  paymentTerms: 'Paid through Architex escrow by agreed milestones as defined in the escrow schedule.',
  clientResponsibilities: [
    'Review the proposal and attached terms within the validity period.',
    'Provide complete and accurate project information.',
    'Respond to requests for clarification or additional information in a timely manner.',
  ],
  exclusions: [
    'Statutory submission fees payable to municipalities.',
    'Third-party consultant fees unless explicitly included.',
    'Variations or additional scope beyond what is described in this proposal.',
  ],
};

// ─── Profession-Specific Terms ────────────────────────────────────────────────

export const ARCHITECT_TERMS: TermsTemplate = {
  termsId: 'architect-terms-v2026.1',
  label: 'Architect Profession-Specific Terms',
  version: '2026.1',
  scope: 'profession_specific',
  applicableRole: 'architect',
  requiresApproval: true,
  defaultValidityDays: 14,
  clauses: [
    'Architectural service stages and deliverables must be confirmed in the scope of services before acceptance.',
    'Copyright in architectural work remains with the author unless separately assigned in the professional appointment.',
    'Professional responsibility remains subject to SACAP code of conduct and the approved appointment terms.',
    'Council submission documentation is prepared for the stated municipality only.',
  ],
  paymentTerms: 'Professional fees apportioned by stage are invoiced on completion of each stage milestone.',
  clientResponsibilities: [
    'Confirm acceptance of the scope of services and nominated service stages.',
    'Provide site information, surveys, and brief confirmation in writing.',
  ],
  exclusions: [
    'Structural, civil, mechanical, and electrical engineering services unless separately appointed.',
    'Quantity surveying and cost control services unless included in scope.',
    'Principal-agent responsibilities unless explicitly appointed.',
  ],
};

export const ENGINEER_TERMS: TermsTemplate = {
  termsId: 'engineer-terms-v2026.1',
  label: 'Engineer Profession-Specific Terms',
  version: '2026.1',
  scope: 'profession_specific',
  applicableRole: 'engineer',
  requiresApproval: true,
  defaultValidityDays: 21,
  clauses: [
    'Engineering design is prepared in accordance with applicable SANS codes and ECSA guidelines.',
    'Design assumptions and load cases must be confirmed in writing before construction documentation.',
    'Professional responsibility remains subject to ECSA code of conduct and the approved appointment terms.',
    'Site inspection frequency is defined in the appointment and may be adjusted based on construction progress.',
  ],
  paymentTerms: 'Engineering fees are invoiced at agreed design-stage milestones.',
  clientResponsibilities: [
    'Confirm design brief, site constraints, and geotechnical information.',
    'Notify the engineer of any variations to the brief or site conditions.',
  ],
  exclusions: [
    'Architectural services and coordination.',
    'Contractor means-and-methods or temporary works design unless specified.',
  ],
};

export const QS_TERMS: TermsTemplate = {
  termsId: 'qs-terms-v2026.1',
  label: 'Quantity Surveyor Profession-Specific Terms',
  version: '2026.1',
  scope: 'profession_specific',
  applicableRole: 'quantity_surveyor',
  requiresApproval: true,
  defaultValidityDays: 21,
  clauses: [
    'Cost estimates are based on information available at the time of preparation and are subject to market conditions.',
    'Bills of quantities are prepared in accordance with the standard system of measurement specified.',
    'Professional responsibility remains subject to SACQSP code of conduct and the approved appointment terms.',
  ],
  paymentTerms: 'QS fees are invoiced per deliverable or on a time-and-expense basis as agreed.',
  clientResponsibilities: [
    'Provide complete design information for accurate quantity take-off.',
    'Confirm procurement strategy and contract form selection.',
  ],
  exclusions: [
    'Design services beyond elemental cost advice.',
    'Project management services unless separately appointed.',
  ],
};

export const TOWN_PLANNER_TERMS: TermsTemplate = {
  termsId: 'town-planner-terms-v2026.1',
  label: 'Town Planner Profession-Specific Terms',
  version: '2026.1',
  scope: 'profession_specific',
  applicableRole: 'town_planner',
  requiresApproval: true,
  defaultValidityDays: 30,
  clauses: [
    'Town planning applications are subject to municipal processes and timeframes outside the professional\'s control.',
    'Application outcomes cannot be guaranteed and are subject to municipal decision-making and appeal processes.',
    'Professional responsibility remains subject to SACPLAN code of conduct.',
  ],
  paymentTerms: 'Planning fees are invoiced at key submission milestones.',
  clientResponsibilities: [
    'Provide property information, title deed, and any existing use rights documentation.',
    'Participate in public participation processes as required.',
  ],
  exclusions: [
    'Legal representation at tribunals or appeals unless separately appointed.',
    'Environmental impact assessments unless specifically included.',
    'Specialist studies (traffic, heritage, ecology) unless coordinated through the planner.',
  ],
};

// ─── Terms Registry ───────────────────────────────────────────────────────────

/** All built-in terms templates */
export const BUILT_IN_TERMS_TEMPLATES: TermsTemplate[] = [
  ARCHITEX_STANDARD_TERMS,
  ARCHITECT_TERMS,
  ENGINEER_TERMS,
  QS_TERMS,
  TOWN_PLANNER_TERMS,
];

/**
 * In-memory store for company/user saved terms.
 * In production this would be backed by Firestore.
 */
const savedTermsStore = new Map<string, TermsTemplate[]>();

/**
 * Get default terms templates for a given role.
 * Always includes the Architex standard terms, plus any profession-specific terms.
 */
export function defaultTermsForRole(role: string): TermsTemplate[] {
  const templates: TermsTemplate[] = [ARCHITEX_STANDARD_TERMS];
  const professionSpecific = BUILT_IN_TERMS_TEMPLATES.find(
    (t) => t.scope === 'profession_specific' && t.applicableRole === role,
  );
  if (professionSpecific) {
    templates.push(professionSpecific);
  }
  return templates;
}

/**
 * Check whether a set of terms templates requires explicit approval.
 */
export function termsRequireApproval(templates: TermsTemplate[]): boolean {
  return templates.some((t) => t.requiresApproval);
}

/**
 * Get all available templates for a role, including built-in and company/user saved.
 */
export function availableTermsForRole(role: string, userId?: string): TermsTemplate[] {
  const builtIn = BUILT_IN_TERMS_TEMPLATES.filter(
    (t) => t.scope === 'architex_standard' || t.applicableRole === role,
  );
  const saved = userId ? savedTermsStore.get(userId) ?? [] : [];
  return [...builtIn, ...saved];
}

/**
 * Save a custom terms template for a user.
 */
export function saveCustomTermsTemplate(userId: string, template: TermsTemplate): void {
  const existing = savedTermsStore.get(userId) ?? [];
  const index = existing.findIndex((t) => t.termsId === template.termsId);
  const now = new Date().toISOString();
  if (index >= 0) {
    existing[index] = { ...template, updatedAt: now };
  } else {
    existing.push({ ...template, createdBy: userId, createdAt: now, updatedAt: now });
  }
  savedTermsStore.set(userId, existing);
}

/**
 * Delete a custom terms template.
 */
export function deleteCustomTermsTemplate(userId: string, termsId: string): boolean {
  const existing = savedTermsStore.get(userId);
  if (!existing) return false;
  const filtered = existing.filter((t) => t.termsId !== termsId);
  if (filtered.length === existing.length) return false;
  savedTermsStore.set(userId, filtered);
  return true;
}

/**
 * Create a ProposalTermsSnapshot from a set of templates and optional overrides.
 * This "freezes" the terms at proposal issue time for versioning.
 */
export function snapshotTerms(
  templates: TermsTemplate[],
  overrides?: {
    customTermsText?: string;
    specialConditions?: string;
    paymentTerms?: string;
    validityPeriodDays?: number;
    clientResponsibilities?: string[];
    exclusions?: string[];
    acceptanceMethod?: ProposalTermsSnapshot['acceptanceMethod'];
  },
): ProposalTermsSnapshot {
  const primaryTemplate = templates[0];
  const allClauses = templates.flatMap((t) => t.clauses);
  const allClientResponsibilities = [
    ...new Set(templates.flatMap((t) => t.clientResponsibilities ?? [])),
  ];
  const allExclusions = [...new Set(templates.flatMap((t) => t.exclusions ?? []))];

  return {
    termsTemplateId: primaryTemplate?.termsId,
    termsTemplateVersion: primaryTemplate?.version,
    standardTermsText: allClauses.join('\n'),
    customTermsText: overrides?.customTermsText,
    specialConditions: overrides?.specialConditions,
    paymentTerms: overrides?.paymentTerms ?? primaryTemplate?.paymentTerms,
    validityPeriodDays: overrides?.validityPeriodDays ?? primaryTemplate?.defaultValidityDays ?? 14,
    clientResponsibilities: overrides?.clientResponsibilities ?? allClientResponsibilities,
    exclusions: overrides?.exclusions ?? allExclusions,
    acceptanceMethod: overrides?.acceptanceMethod ?? 'digital_acceptance',
  };
}

/**
 * Resolve the terms from a snapshot back to a displayable template list.
 * Used for display purposes when viewing an issued proposal's frozen terms.
 */
export function resolveTermsSnapshot(
  snapshot: ProposalTermsSnapshot,
): { templateId: string; version: string; clauses: string[] } {
  return {
    templateId: snapshot.termsTemplateId ?? 'unknown',
    version: snapshot.termsTemplateVersion ?? 'unknown',
    clauses: (snapshot.standardTermsText ?? '').split('\n').filter(Boolean),
  };
}

/**
 * Calculate the expiry date from a validity period.
 */
export function calculateExpiryDate(validityPeriodDays: number, fromDate = new Date()): string {
  const expiry = new Date(fromDate);
  expiry.setDate(expiry.getDate() + validityPeriodDays);
  return expiry.toISOString();
}

/**
 * Check if a proposal has expired based on its validity period.
 */
export function isProposalExpired(
  issuedAt: string,
  validityPeriodDays: number,
  now = new Date(),
): boolean {
  const issued = new Date(issuedAt);
  const expiry = new Date(issued);
  expiry.setDate(expiry.getDate() + validityPeriodDays);
  return now > expiry;
}
