/**
 * Terms Template Service — Pack 4: Professional Toolboxes & Proposal Builder
 *
 * Provides standard Architex terms, profession-specific terms
 * (architect, engineer, QS, town planner), company/user saved terms,
 * project-specific special conditions, and terms versioning with
 * snapshot on proposal issue.
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
  description: 'Standard terms of engagement for professional services delivered through the Architex platform.',
  clauses: [
    { id: 'std-general-1', text: 'All professional services are delivered through the Architex platform and governed by the Architex Terms of Service.', optional: false, category: 'general' },
    { id: 'std-fees-1', text: 'Fees exclude statutory municipal charges, disbursements and reimbursable expenses unless explicitly stated in the proposal line items.', optional: false, category: 'fees' },
    { id: 'std-fees-2', text: 'A platform transaction fee of 1.00% (shared equally between client and professional at 0.50% each) applies to all chargeable professional fees. The client-side component is added to the escrow deposit; the professional-side component is deducted from the release.', optional: false, category: 'fees' },
    { id: 'std-scope-1', text: 'The professional remains responsible for final scope, fee assumptions, terms approval and proposal issue.', optional: false, category: 'scope' },
    { id: 'std-scope-2', text: 'Issued proposals are version-locked. Changes require a revised proposal that supersedes the original — issued proposals are never silently mutated.', optional: false, category: 'scope' },
    { id: 'std-payment-1', text: 'Payment is held in escrow and released according to agreed milestone conditions.', optional: false, category: 'payment' },
    { id: 'std-termination-1', text: 'Either party may request termination subject to fair compensation for work completed up to the date of termination, calculated against the agreed milestone schedule.', optional: false, category: 'termination' },
    { id: 'std-dispute-1', text: 'Disputes shall first be referred to negotiation between the parties. If unresolved within 14 business days, the matter may be escalated to mediation or arbitration as agreed.', optional: false, category: 'dispute' },
    { id: 'std-liability-1', text: 'The professional shall maintain appropriate professional indemnity insurance as required by their registering council.', optional: true, category: 'liability' },
    { id: 'std-ip-1', text: 'Copyright in designs, drawings and specifications remains with the professional until full payment, after which the client receives a licence for the project use.', optional: true, category: 'ip' },
  ],
  applicableRoles: ['architect', 'engineer', 'quantity_surveyor', 'town_planner', 'land_surveyor', 'construction_project_manager', 'landscape_architect', 'interior_designer'],
  requiresProfessionalApproval: true, requiresClientAcceptance: true, defaultValidityDays: 14,
  defaultPaymentTerms: 'Paid through Architex escrow by agreed milestone schedule. Platform transaction fee applies.',
  defaultClientResponsibilities: ['Provide accurate project brief, site information and decision-maker contacts.', 'Respond to professional queries within 5 business days.', 'Notify the professional of any changes to scope, budget or programme.'],
  defaultExclusions: ['Statutory municipal submission fees, development charges and bulk service contributions.', 'Specialist sub-consultant fees unless expressly included.', 'NHBRC enrolment fees, building contractor charges and construction work.', 'Re-zoning, subdivision, township establishment, environmental authorisation or land-use amendment costs unless expressly included.'],
};

export const ARCHITECT_TERMS: TermsTemplate = {
  templateId: 'architect-profession-specific', version: '2026.1', label: 'Architect Profession-Specific Terms',
  scope: 'profession_specific', description: 'Additional terms specific to architectural services aligned with SACAP work stages.',
  clauses: [
    { id: 'arch-1', text: 'Architectural service stages and deliverables shall be confirmed in the scope of services and aligned with SACAP Practice Note work stages 1–6.', optional: false, category: 'scope' },
    { id: 'arch-2', text: 'The architect shall maintain current SACAP registration and comply with the Code of Professional Conduct.', optional: false, category: 'general' },
    { id: 'arch-3', text: 'Copyright and professional responsibility remain subject to the approved appointment terms.', optional: false, category: 'ip' },
    { id: 'arch-4', text: 'The architect is responsible for design coordination with sub-consultants engaged by the client.', optional: false, category: 'scope' },
  ],
  applicableRoles: ['architect'], requiresProfessionalApproval: true, requiresClientAcceptance: true, defaultValidityDays: 14,
  defaultPaymentTerms: 'Architex escrow by milestone, subject to SACAP fee guideline alignment.',
  defaultClientResponsibilities: ['Confirm project budget, programme and scope in writing.', 'Appoint sub-consultants and contractors directly unless otherwise agreed.'],
  defaultExclusions: ['Sub-consultant services unless expressly included in scope.', 'As-built surveys, measured drawings of existing conditions.', 'Specialist facade, acoustic, fire-engineering and sustainability assessments.'],
};

export const ENGINEER_TERMS: TermsTemplate = {
  templateId: 'engineer-profession-specific', version: '2026.1', label: 'Engineer Profession-Specific Terms',
  scope: 'profession_specific', description: 'Additional terms specific to engineering services aligned with ECSA requirements.',
  clauses: [
    { id: 'eng-1', text: 'Engineering services are delivered in accordance with ECSA requirements and registration category.', optional: false, category: 'general' },
    { id: 'eng-2', text: 'Design assumptions, loading conditions and material specifications shall be documented and remain the professional responsibility of the engineer.', optional: false, category: 'scope' },
    { id: 'eng-3', text: 'The engineer shall maintain current ECSA registration and appropriate professional indemnity insurance.', optional: false, category: 'liability' },
  ],
  applicableRoles: ['engineer'], requiresProfessionalApproval: true, requiresClientAcceptance: true, defaultValidityDays: 14,
  defaultPaymentTerms: 'Architex escrow by milestone.',
  defaultClientResponsibilities: ['Provide geotechnical and topographical survey data.', 'Confirm design criteria and applicable standards.'],
  defaultExclusions: ['Specialist geotechnical investigations beyond standard requirements.', 'Materials testing and quality control during construction.'],
};

export const QS_TERMS: TermsTemplate = {
  templateId: 'qs-profession-specific', version: '2026.1', label: 'Quantity Surveyor Profession-Specific Terms',
  scope: 'profession_specific', description: 'Additional terms specific to quantity surveying services aligned with SACQSP.',
  clauses: [
    { id: 'qs-1', text: 'Quantity surveying services are delivered in accordance with SACQSP requirements.', optional: false, category: 'general' },
    { id: 'qs-2', text: 'Cost estimates are based on information available at the time and subject to market conditions.', optional: false, category: 'scope' },
  ],
  applicableRoles: ['quantity_surveyor'], requiresProfessionalApproval: true, requiresClientAcceptance: true, defaultValidityDays: 14,
  defaultPaymentTerms: 'Architex escrow by milestone.',
  defaultClientResponsibilities: ['Provide design documentation for measurement and costing.', 'Confirm procurement strategy and contract form.'],
  defaultExclusions: ['Construction monitoring beyond agreed frequency.', 'Specialist cost consultancy outside agreed scope.'],
};

export const TOWN_PLANNER_TERMS: TermsTemplate = {
  templateId: 'town-planner-profession-specific', version: '2026.1', label: 'Town Planner Profession-Specific Terms',
  scope: 'profession_specific', description: 'Additional terms specific to town planning services aligned with SACPLAN.',
  clauses: [
    { id: 'tp-1', text: 'Town planning services are delivered in accordance with SACPLAN requirements.', optional: false, category: 'general' },
    { id: 'tp-2', text: 'Municipal application outcomes are subject to the authority\'s decision-making process.', optional: false, category: 'scope' },
  ],
  applicableRoles: ['town_planner'], requiresProfessionalApproval: true, requiresClientAcceptance: true, defaultValidityDays: 21,
  defaultPaymentTerms: 'Architex escrow by milestone.',
  defaultClientResponsibilities: ['Provide property title deed, SG diagram and zoning certificate.', 'Disclose all known servitudes and title deed conditions.'],
  defaultExclusions: ['Municipal application fees and advertising costs.', 'Legal representation at tribunal or appeal hearings.', 'Environmental impact assessments and specialist studies.'],
};

// ─── Registry & Lookup ─────────────────────────────────────────────────────

export const TERMS_TEMPLATE_REGISTRY: Record<string, TermsTemplate> = {
  [ARCHITEX_STANDARD_TERMS.templateId]: ARCHITEX_STANDARD_TERMS,
  [ARCHITECT_TERMS.templateId]: ARCHITECT_TERMS,
  [ENGINEER_TERMS.templateId]: ENGINEER_TERMS,
  [QS_TERMS.templateId]: QS_TERMS,
  [TOWN_PLANNER_TERMS.templateId]: TOWN_PLANNER_TERMS,
};

const savedTermsStore: Map<string, TermsTemplate> = new Map();

export function saveCustomTermsTemplate(template: TermsTemplate): void {
  if (template.scope !== 'company_saved' && template.scope !== 'project_specific') {
    throw new Error('Custom templates must have scope "company_saved" or "project_specific".');
  }
  const parts = template.version.split('.'); parts[parts.length - 1] = String((parseInt(parts[parts.length - 1], 10) || 0) + 1);
  savedTermsStore.set(template.templateId, { ...template, version: parts.join('.') });
}

export function loadCustomTermsTemplate(templateId: string): TermsTemplate | undefined {
  return savedTermsStore.get(templateId);
}

export function listCustomTermsTemplates(scope?: TermsScope): TermsTemplate[] {
  const all = Array.from(savedTermsStore.values());
  return scope ? all.filter((t) => t.scope === scope) : all;
}

export function defaultTermsForRole(role: ProposalPartyRole): TermsTemplate[] {
  const templates: TermsTemplate[] = [ARCHITEX_STANDARD_TERMS];
  const professionMap: Partial<Record<ProposalPartyRole, TermsTemplate>> = {
    architect: ARCHITECT_TERMS, engineer: ENGINEER_TERMS, quantity_surveyor: QS_TERMS, town_planner: TOWN_PLANNER_TERMS,
  };
  const prof = professionMap[role];
  if (prof) templates.push(prof);
  return templates;
}

export function listAvailableTemplates(role: ProposalPartyRole): TermsTemplate[] {
  const defaults = defaultTermsForRole(role);
  const companySaved = listCustomTermsTemplates('company_saved').filter((t) => t.applicableRoles.includes(role));
  return [...defaults, ...companySaved];
}

export function getTermsTemplate(templateId: string): TermsTemplate | undefined {
  return TERMS_TEMPLATE_REGISTRY[templateId] || savedTermsStore.get(templateId);
}

export function createTermsSnapshot(
  templates: TermsTemplate[],
  overrides?: { customTermsText?: string; specialConditions?: string; paymentTerms?: string; validityPeriodDays?: number; clientResponsibilities?: string[]; exclusions?: string[]; acceptanceMethod?: ProposalTermsSnapshot['acceptanceMethod'] },
): ProposalTermsSnapshot {
  const primaryTemplate = templates[0];
  const allTemplateIds = templates.map((t) => t.templateId);
  const allTemplateVersions = templates.map((t) => t.version);
  const allClauses = templates.flatMap((t) => t.clauses.map((c) => c.text));
  const combinedClientResponsibilities = [...new Set([...templates.flatMap((t) => t.defaultClientResponsibilities), ...(overrides?.clientResponsibilities || [])])];
  const combinedExclusions = [...new Set([...templates.flatMap((t) => t.defaultExclusions), ...(overrides?.exclusions || [])])];
  return {
    termsTemplateId: allTemplateIds.join(' + '), termsTemplateVersion: allTemplateVersions.join(' / '),
    standardTermsText: allClauses.join('\n\n'), customTermsText: overrides?.customTermsText,
    specialConditions: overrides?.specialConditions,
    paymentTerms: overrides?.paymentTerms || primaryTemplate?.defaultPaymentTerms || ARCHITEX_STANDARD_TERMS.defaultPaymentTerms,
    validityPeriodDays: overrides?.validityPeriodDays || primaryTemplate?.defaultValidityDays || ARCHITEX_STANDARD_TERMS.defaultValidityDays,
    clientResponsibilities: combinedClientResponsibilities, exclusions: combinedExclusions,
    acceptanceMethod: overrides?.acceptanceMethod || 'digital_acceptance',
  };
}

export function termsRequireApproval(templates: TermsTemplate[]): boolean { return templates.some((t) => t.requiresProfessionalApproval); }
export function termsRequireClientAcceptance(templates: TermsTemplate[]): boolean { return templates.some((t) => t.requiresClientAcceptance); }

export function calculateValidityExpiry(issuedAt: string, validityPeriodDays: number): string {
  const issued = new Date(issuedAt); issued.setDate(issued.getDate() + validityPeriodDays); return issued.toISOString();
}
export function isProposalExpired(validUntil: string): boolean { return new Date(validUntil) < new Date(); }
export function daysUntilExpiry(validUntil: string): number {
  const diffMs = new Date(validUntil).getTime() - Date.now(); return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
