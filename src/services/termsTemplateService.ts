/**
 * Terms Template Service — Pack 4: Professional Toolboxes & Proposal Builder
 *
 * Provides standard Architex terms, profession-specific terms (architect,
 * engineer, QS, town planner), company/user saved terms, project-specific
 * special conditions, and terms versioning with snapshot on proposal issue.
 */
import type { ProposalTermsSnapshot, ProposalPartyRole } from '../types/proposalBuilder';

export type TermsScope =
  | 'architex_standard'
  | 'profession_specific'
  | 'company_saved'
  | 'project_specific';

export interface TermsClause {
  id: string;
  text: string;
  optional: boolean;
  category: 'general' | 'fees' | 'scope' | 'liability' | 'ip' | 'termination' | 'dispute' | 'payment';
}

export interface TermsTemplate {
  templateId: string;
  version: string;
  label: string;
  scope: TermsScope;
  description: string;
  clauses: TermsClause[];
  applicableRoles: ProposalPartyRole[];
  requiresProfessionalApproval: boolean;
  requiresClientAcceptance: boolean;
  defaultValidityDays: number;
  defaultPaymentTerms: string;
  defaultClientResponsibilities: string[];
  defaultExclusions: string[];
}

// ─── Standard Architex Terms ───────────────────────────────────────────────

export const ARCHITEX_STANDARD_TERMS: TermsTemplate = {
  templateId: 'architex-standard-professional-services',
  version: '2026.1',
  label: 'Architex Standard Professional Services Terms',
  scope: 'architex_standard',
  description:
    'Standard terms of engagement for professional services delivered through the Architex platform.',
  clauses: [
    {
      id: 'std-general-1',
      text: 'All professional services are delivered through the Architex platform and governed by the Architex Terms of Service.',
      optional: false,
      category: 'general',
    },
    {
      id: 'std-fees-1',
      text: 'Fees exclude statutory municipal charges, disbursements and reimbursable expenses unless explicitly stated in the proposal line items.',
      optional: false,
      category: 'fees',
    },
    {
      id: 'std-fees-2',
      text: 'A platform transaction fee of 1.00% (shared equally between client and professional at 0.50% each) applies to all chargeable professional fees. The client-side component is added to the escrow deposit; the professional-side component is deducted from the release.',
      optional: false,
      category: 'fees',
    },
    {
      id: 'std-scope-1',
      text: 'The professional remains responsible for final scope, fee assumptions, terms approval and proposal issue.',
      optional: false,
      category: 'scope',
    },
    {
      id: 'std-scope-2',
      text: 'Issued proposals are version-locked. Changes require a revised proposal that supersedes the original — issued proposals are never silently mutated.',
      optional: false,
      category: 'scope',
    },
    {
      id: 'std-payment-1',
      text: 'Payment is held in escrow and released according to agreed milestone conditions. Milestone percentages, deliverables and release conditions are specified in the proposal schedule.',
      optional: false,
      category: 'payment',
    },
    {
      id: 'std-termination-1',
      text: 'Either party may request termination subject to fair compensation for work completed up to the date of termination, calculated against the agreed milestone schedule.',
      optional: false,
      category: 'termination',
    },
    {
      id: 'std-dispute-1',
      text: 'Disputes shall first be referred to negotiation between the parties. If unresolved within 14 business days, the matter may be escalated to mediation or arbitration as agreed.',
      optional: false,
      category: 'dispute',
    },
    {
      id: 'std-liability-1',
      text: 'The professional shall maintain appropriate professional indemnity insurance as required by their registering council.',
      optional: true,
      category: 'liability',
    },
    {
      id: 'std-ip-1',
      text: 'Copyright in designs, drawings and specifications remains with the professional until full payment, after which the client receives a licence for the project use.',
      optional: true,
      category: 'ip',
    },
  ],
  applicableRoles: [
    'architect',
    'engineer',
    'quantity_surveyor',
    'town_planner',
    'land_surveyor',
    'construction_project_manager',
    'landscape_architect',
    'interior_designer',
  ],
  requiresProfessionalApproval: true,
  requiresClientAcceptance: true,
  defaultValidityDays: 14,
  defaultPaymentTerms:
    'Paid through Architex escrow by agreed milestone schedule. Platform transaction fee applies.',
  defaultClientResponsibilities: [
    'Provide accurate project brief, site information and decision-maker contacts.',
    'Respond to professional queries within 5 business days.',
    'Notify the professional of any changes to scope, budget or programme.',
  ],
  defaultExclusions: [
    'Statutory municipal submission fees, development charges and bulk service contributions.',
    'Specialist sub-consultant fees (structural, civil, mechanical, electrical, fire, wet services, etc.) unless expressly included.',
    'NHBRC enrolment fees, building contractor charges and construction work.',
    'Re-zoning, subdivision, township establishment, environmental authorisation or land-use amendment costs unless expressly included.',
  ],
};

// ─── Profession-Specific Terms ─────────────────────────────────────────────

export const ARCHITECT_TERMS: TermsTemplate = {
  templateId: 'architect-profession-specific',
  version: '2026.1',
  label: 'Architect Profession-Specific Terms',
  scope: 'profession_specific',
  description:
    'Additional terms specific to architectural services delivered through the Architex platform, aligned with SACAP work stages and practice requirements.',
  clauses: [
    {
      id: 'arch-1',
      text: 'Architectural service stages and deliverables shall be confirmed in the scope of services and aligned with SACAP Practice Note work stages 1–6.',
      optional: false,
      category: 'scope',
    },
    {
      id: 'arch-2',
      text: 'The architect shall maintain current SACAP registration and comply with the Code of Professional Conduct in all project activities.',
      optional: false,
      category: 'general',
    },
    {
      id: 'arch-3',
      text: 'Copyright and professional responsibility remain subject to the approved appointment terms between the architect and client.',
      optional: false,
      category: 'ip',
    },
    {
      id: 'arch-4',
      text: 'The architect is responsible for design coordination with sub-consultants engaged by the client and identified in the scope of services.',
      optional: false,
      category: 'scope',
    },
    {
      id: 'arch-5',
      text: 'Site inspections are limited to the frequency specified in the appointment. Additional inspections may be requested at agreed additional fees.',
      optional: true,
      category: 'scope',
    },
  ],
  applicableRoles: ['architect'],
  requiresProfessionalApproval: true,
  requiresClientAcceptance: true,
  defaultValidityDays: 14,
  defaultPaymentTerms: 'Architex escrow by milestone, subject to SACAP fee guideline alignment.',
  defaultClientResponsibilities: [
    'Confirm project budget, programme and scope of works in writing.',
    'Appoint sub-consultants and contractors directly unless otherwise agreed.',
    'Provide timely design decisions and approvals at each work stage.',
  ],
  defaultExclusions: [
    'Sub-consultant services unless expressly included in scope.',
    'As-built surveys, measured drawings of existing conditions for renovation projects.',
    'Specialist facade, acoustic, fire-engineering and sustainability assessments.',
  ],
};

export const ENGINEER_TERMS: TermsTemplate = {
  templateId: 'engineer-profession-specific',
  version: '2026.1',
  label: 'Engineer Profession-Specific Terms',
  scope: 'profession_specific',
  description:
    'Additional terms specific to engineering services, aligned with ECSA registration and practice requirements.',
  clauses: [
    {
      id: 'eng-1',
      text: 'Engineering services are delivered in accordance with ECSA requirements and the engineer\'s professional registration category.',
      optional: false,
      category: 'general',
    },
    {
      id: 'eng-2',
      text: 'Design assumptions, loading conditions and material specifications shall be documented and remain the professional responsibility of the engineer.',
      optional: false,
      category: 'scope',
    },
    {
      id: 'eng-3',
      text: 'The engineer shall maintain current ECSA registration and appropriate professional indemnity insurance.',
      optional: false,
      category: 'liability',
    },
    {
      id: 'eng-4',
      text: 'Shop drawings, fabrication details and contractor method statements must be reviewed by the engineer before construction proceeds.',
      optional: false,
      category: 'scope',
    },
  ],
  applicableRoles: ['engineer'],
  requiresProfessionalApproval: true,
  requiresClientAcceptance: true,
  defaultValidityDays: 14,
  defaultPaymentTerms: 'Architex escrow by milestone.',
  defaultClientResponsibilities: [
    'Provide geotechnical and topographical survey data.',
    'Confirm design criteria, performance requirements and applicable standards.',
  ],
  defaultExclusions: [
    'Specialist geotechnical investigations beyond standard requirements.',
    'Materials testing and quality control during construction.',
  ],
};

export const QS_TERMS: TermsTemplate = {
  templateId: 'qs-profession-specific',
  version: '2026.1',
  label: 'Quantity Surveyor Profession-Specific Terms',
  scope: 'profession_specific',
  description:
    'Additional terms specific to quantity surveying services, aligned with SACQSP requirements.',
  clauses: [
    {
      id: 'qs-1',
      text: 'Quantity surveying services are delivered in accordance with SACQSP requirements and professional practice standards.',
      optional: false,
      category: 'general',
    },
    {
      id: 'qs-2',
      text: 'Cost estimates and elemental estimates are based on information available at the time of preparation and are subject to market conditions, design development and procurement outcomes.',
      optional: false,
      category: 'scope',
    },
    {
      id: 'qs-3',
      text: 'The QS shall maintain current SACQSP registration and comply with the QS Code of Professional Conduct.',
      optional: false,
      category: 'general',
    },
    {
      id: 'qs-4',
      text: 'Bills of quantities are prepared for tender purposes and should not be used for construction without reconciliation against actual site measurements.',
      optional: false,
      category: 'scope',
    },
  ],
  applicableRoles: ['quantity_surveyor'],
  requiresProfessionalApproval: true,
  requiresClientAcceptance: true,
  defaultValidityDays: 14,
  defaultPaymentTerms: 'Architex escrow by milestone.',
  defaultClientResponsibilities: [
    'Provide design documentation for measurement and costing.',
    'Confirm procurement strategy and contract form.',
  ],
  defaultExclusions: [
    'Construction monitoring and site measurements beyond the agreed frequency.',
    'Specialist cost consultancy for areas outside the agreed scope.',
  ],
};

export const TOWN_PLANNER_TERMS: TermsTemplate = {
  templateId: 'town-planner-profession-specific',
  version: '2026.1',
  label: 'Town Planner Profession-Specific Terms',
  scope: 'profession_specific',
  description:
    'Additional terms specific to town planning services, aligned with SACPLAN requirements.',
  clauses: [
    {
      id: 'tp-1',
      text: 'Town planning services are delivered in accordance with SACPLAN requirements and relevant municipal planning by-laws.',
      optional: false,
      category: 'general',
    },
    {
      id: 'tp-2',
      text: 'Municipal application outcomes are subject to the relevant authority\'s decision-making process and cannot be guaranteed by the professional.',
      optional: false,
      category: 'scope',
    },
    {
      id: 'tp-3',
      text: 'The town planner shall maintain current SACPLAN registration and comply with the SACPLAN Code of Ethics.',
      optional: false,
      category: 'general',
    },
    {
      id: 'tp-4',
      text: 'Additional applications, objections, appeals or tribunal representations beyond the initial scope shall be treated as additional services.',
      optional: false,
      category: 'scope',
    },
  ],
  applicableRoles: ['town_planner'],
  requiresProfessionalApproval: true,
  requiresClientAcceptance: true,
  defaultValidityDays: 21,
  defaultPaymentTerms: 'Architex escrow by milestone.',
  defaultClientResponsibilities: [
    'Provide property title deed, SG diagram and zoning certificate.',
    'Disclose all known servitudes, restrictive conditions and title deed conditions.',
  ],
  defaultExclusions: [
    'Municipal application fees, advertising costs and notification charges.',
    'Legal representation at tribunal or appeal hearings.',
    'Environmental impact assessments and specialist studies.',
  ],
};

// ─── Registry ───────────────────────────────────────────────────────────────

export const TERMS_TEMPLATE_REGISTRY: Record<string, TermsTemplate> = {
  [ARCHITEX_STANDARD_TERMS.templateId]: ARCHITEX_STANDARD_TERMS,
  [ARCHITECT_TERMS.templateId]: ARCHITECT_TERMS,
  [ENGINEER_TERMS.templateId]: ENGINEER_TERMS,
  [QS_TERMS.templateId]: QS_TERMS,
  [TOWN_PLANNER_TERMS.templateId]: TOWN_PLANNER_TERMS,
};

// ─── Saved Terms (Company/User) ─────────────────────────────────────────────

const savedTermsStore: Map<string, TermsTemplate> = new Map();

/**
 * Save a custom terms template for a company or user.
 */
export function saveCustomTermsTemplate(template: TermsTemplate): void {
  if (template.scope !== 'company_saved' && template.scope !== 'project_specific') {
    throw new Error('Custom templates must have scope "company_saved" or "project_specific".');
  }
  savedTermsStore.set(template.templateId, { ...template, version: incrementVersion(template.version) });
}

/**
 * Load a custom terms template by ID.
 */
export function loadCustomTermsTemplate(templateId: string): TermsTemplate | undefined {
  return savedTermsStore.get(templateId);
}

/**
 * List all saved custom terms templates.
 */
export function listCustomTermsTemplates(scope?: TermsScope): TermsTemplate[] {
  const all = Array.from(savedTermsStore.values());
  return scope ? all.filter((t) => t.scope === scope) : all;
}

// ─── Role-based defaults ────────────────────────────────────────────────────

/**
 * Returns the default terms templates for a professional role.
 * Always includes the Architex standard terms plus profession-specific
 * terms when available.
 */
export function defaultTermsForRole(role: ProposalPartyRole): TermsTemplate[] {
  const templates: TermsTemplate[] = [ARCHITEX_STANDARD_TERMS];

  const professionMap: Partial<Record<ProposalPartyRole, TermsTemplate>> = {
    architect: ARCHITECT_TERMS,
    engineer: ENGINEER_TERMS,
    quantity_surveyor: QS_TERMS,
    town_planner: TOWN_PLANNER_TERMS,
  };

  const professionTerms = professionMap[role];
  if (professionTerms) {
    templates.push(professionTerms);
  }

  return templates;
}

/**
 * List available terms templates for a given role, including any
 * company-saved templates that apply.
 */
export function listAvailableTemplates(role: ProposalPartyRole): TermsTemplate[] {
  const defaults = defaultTermsForRole(role);
  const companySaved = listCustomTermsTemplates('company_saved').filter(
    (t) => t.applicableRoles.includes(role),
  );
  return [...defaults, ...companySaved];
}

/**
 * Retrieve a terms template by ID and version.
 */
export function getTermsTemplate(templateId: string): TermsTemplate | undefined {
  return TERMS_TEMPLATE_REGISTRY[templateId] || savedTermsStore.get(templateId);
}

// ─── Terms Snapshot ─────────────────────────────────────────────────────────

/**
 * Create a versioned snapshot of terms at proposal issue time.
 * This locks the terms so that later template changes don't
 * retroactively affect issued proposals.
 */
export function createTermsSnapshot(
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
  const allTemplateIds = templates.map((t) => t.templateId);
  const allTemplateVersions = templates.map((t) => t.version);

  const allClauses = templates.flatMap((t) => t.clauses.map((c) => c.text));
  const standardTermsText = allClauses.join('\n\n');

  const combinedClientResponsibilities = [
    ...new Set([
      ...templates.flatMap((t) => t.defaultClientResponsibilities),
      ...(overrides?.clientResponsibilities || []),
    ]),
  ];

  const combinedExclusions = [
    ...new Set([
      ...templates.flatMap((t) => t.defaultExclusions),
      ...(overrides?.exclusions || []),
    ]),
  ];

  return {
    termsTemplateId: allTemplateIds.join(' + '),
    termsTemplateVersion: allTemplateVersions.join(' / '),
    standardTermsText,
    customTermsText: overrides?.customTermsText,
    specialConditions: overrides?.specialConditions,
    paymentTerms:
      overrides?.paymentTerms ||
      primaryTemplate?.defaultPaymentTerms ||
      ARCHITEX_STANDARD_TERMS.defaultPaymentTerms,
    validityPeriodDays:
      overrides?.validityPeriodDays ||
      primaryTemplate?.defaultValidityDays ||
      ARCHITEX_STANDARD_TERMS.defaultValidityDays,
    clientResponsibilities: combinedClientResponsibilities,
    exclusions: combinedExclusions,
    acceptanceMethod: overrides?.acceptanceMethod || 'digital_acceptance',
  };
}

/**
 * Check if any terms in a set require professional approval before issue.
 */
export function termsRequireApproval(templates: TermsTemplate[]): boolean {
  return templates.some((t) => t.requiresProfessionalApproval);
}

/**
 * Check if any terms in a set require client acceptance.
 */
export function termsRequireClientAcceptance(templates: TermsTemplate[]): boolean {
  return templates.some((t) => t.requiresClientAcceptance);
}

// ─── Validity / Expiry ──────────────────────────────────────────────────────

/**
 * Calculate the expiry date from issue date and validity period (in days).
 */
export function calculateValidityExpiry(issuedAt: string, validityPeriodDays: number): string {
  const issued = new Date(issuedAt);
  issued.setDate(issued.getDate() + validityPeriodDays);
  return issued.toISOString();
}

/**
 * Check if a proposal has expired based on its validity period.
 */
export function isProposalExpired(validUntil: string): boolean {
  return new Date(validUntil) < new Date();
}

/**
 * Get days remaining until expiry. Negative means expired.
 */
export function daysUntilExpiry(validUntil: string): number {
  const now = new Date();
  const expiry = new Date(validUntil);
  const diffMs = expiry.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function incrementVersion(version: string): string {
  const parts = version.split('.');
  const patch = parseInt(parts[parts.length - 1], 10) || 0;
  parts[parts.length - 1] = String(patch + 1);
  return parts.join('.');
}
