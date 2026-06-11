/**
 * RFQ Package Builder
 *
 * Builds a complete RFQ/tender package:
 *   - Scope summary from project context
 *   - Drawings reference integration
 *   - Required returnables definition
 *   - Deadline management
 *   - Evaluation criteria definition
 *   - Package completeness validation
 *
 * Outputs are advisory. Human professional review is required before issue.
 */

import type { ProcurementScopeResult } from './procurementScopeClassifier';

export type RfqPackageStatus = 'draft' | 'ready_for_review' | 'issued' | 'closed';

export interface RfqReturnable {
  id: string;
  name: string;
  description: string;
  mandatory: boolean;
  format: 'pdf' | 'spreadsheet' | 'document' | 'drawing' | 'schedule' | 'other';
  validationRule?: string;
}

export interface RfqEvaluationCriterion {
  id: string;
  name: string;
  weight: number; // 0-100
  description: string;
  scoringGuidance: string;
}

export interface RfqDrawingReference {
  drawingNumber: string;
  title: string;
  revision: string;
  url?: string;
  requiredForPricing: boolean;
}

export interface RfqPackageInput {
  projectId: string;
  title: string;
  scopeSummary: string;
  procurementScope: ProcurementScopeResult;
  drawings: RfqDrawingReference[];
  returnables: RfqReturnable[];
  evaluationCriteria: RfqEvaluationCriterion[];
  deadlineIso: string;
  budgetEstimateZar: number;
  siteAddress: string;
  contactEmail: string;
  specialConditions?: string[];
  createdBy: string;
}

export interface RfqPackageRecord {
  rfqId: string;
  projectId: string;
  title: string;
  status: RfqPackageStatus;
  scopeSummary: string;
  procurementClassification: string;
  drawings: RfqDrawingReference[];
  returnables: RfqReturnable[];
  evaluationCriteria: RfqEvaluationCriterion[];
  totalWeight: number;
  deadlineIso: string;
  budgetEstimateZar: number;
  siteAddress: string;
  contactEmail: string;
  specialConditions: string[];
  minimumBidders: number;
  recommendedBidders: number;
  publicAdvertisement: boolean;
  completenessChecks: RfqCompletenessCheck[];
  isComplete: boolean;
  fairnessRule: string;
  createdBy: string;
  issuedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RfqCompletenessCheck {
  check: string;
  passed: boolean;
  detail: string;
}

const FAIRNESS_RULE =
  'All bidders must receive equal material information. Clarifications that affect scope, price, programme, or risk must become addenda distributed to all bidders. Late submissions and bid revisions are auditable.';

const REQUIRED_RETURNABLE_TEMPLATES: RfqReturnable[] = [
  {
    id: 'returnable_quote_form',
    name: 'Quote Form',
    description: 'Completed pricing schedule with all line items',
    mandatory: true,
    format: 'spreadsheet',
    validationRule: 'Must include all mandatory line items with non-negative amounts',
  },
  {
    id: 'returnable_programme',
    name: 'Project Programme',
    description: 'Proposed works programme showing key milestones and completion date',
    mandatory: true,
    format: 'document',
    validationRule: 'Must include start, key milestones, and completion dates',
  },
  {
    id: 'returnable_methodology',
    name: 'Methodology Statement',
    description: 'Description of proposed approach, methods, and resources',
    mandatory: true,
    format: 'document',
    validationRule: 'Must address all major scope items',
  },
  {
    id: 'returnable_cv_team',
    name: 'CVs / Team Profiles',
    description: 'CVs of key personnel proposed for the works',
    mandatory: true,
    format: 'document',
    validationRule: 'Must include qualifications and relevant experience',
  },
  {
    id: 'returnable_company_profile',
    name: 'Company Profile',
    description: 'Company registration, CIDB grading, tax clearance',
    mandatory: true,
    format: 'pdf',
    validationRule: 'Must include valid CIDB certificate and tax clearance',
  },
  {
    id: 'returnable_references',
    name: 'Project References',
    description: 'At least 3 similar completed projects',
    mandatory: true,
    format: 'document',
    validationRule: 'Must include client contact details for verification',
  },
  {
    id: 'returnable_health_safety',
    name: 'Health & Safety Plan',
    description: 'Project-specific health and safety plan',
    mandatory: true,
    format: 'document',
    validationRule: 'Must comply with Construction Regulations',
  },
  {
    id: 'returnable_bbbee',
    name: 'B-BBEE Certificate',
    description: 'Valid B-BBEE certificate or sworn affidavit',
    mandatory: false,
    format: 'pdf',
    validationRule: 'SANAS-accredited certificate or sworn affidavit',
  },
];

const DEFAULT_EVALUATION_CRITERIA: RfqEvaluationCriterion[] = [
  {
    id: 'criteria_price',
    name: 'Price',
    weight: 30,
    description: 'Total tendered amount including all allowances',
    scoringGuidance: 'Lowest price scores highest. Significant deviations require review.',
  },
  {
    id: 'criteria_methodology',
    name: 'Methodology & Approach',
    weight: 20,
    description: 'Quality and appropriateness of proposed construction methodology',
    scoringGuidance: 'Score based on clarity, feasibility, and innovation of approach.',
  },
  {
    id: 'criteria_experience',
    name: 'Experience & Track Record',
    weight: 15,
    description: 'Relevant experience on similar projects',
    scoringGuidance: 'Score based on number, scale, and recency of relevant completed projects.',
  },
  {
    id: 'criteria_programme',
    name: 'Programme & Timeline',
    weight: 10,
    description: 'Realistic programme with achievable milestones',
    scoringGuidance: 'Score based on achievability, resource allocation, and milestone detail.',
  },
  {
    id: 'criteria_team',
    name: 'Team & Key Personnel',
    weight: 10,
    description: 'Qualifications and experience of proposed team',
    scoringGuidance: 'Score based on professional registration, relevant experience, and team composition.',
  },
  {
    id: 'criteria_hse',
    name: 'Health, Safety & Environment',
    weight: 5,
    description: 'HSE plan quality and track record',
    scoringGuidance: 'Score based on HSE plan completeness and past safety record.',
  },
  {
    id: 'criteria_bbbee',
    name: 'B-BBEE / Transformation',
    weight: 5,
    description: 'B-BBEE level and transformation commitment',
    scoringGuidance: 'Score based on B-BBEE level and use of local/subcontractor labour.',
  },
  {
    id: 'criteria_risk',
    name: 'Risk Assessment',
    weight: 5,
    description: 'Identification and mitigation of project risks',
    scoringGuidance: 'Score based on comprehensiveness and practicality of risk mitigations.',
  },
];

function validateDeadline(deadlineIso: string, createdAt: string): string | null {
  const deadline = Date.parse(deadlineIso);
  const created = Date.parse(createdAt);
  if (Number.isNaN(deadline)) return 'Deadline must be a valid ISO date string';
  if (deadline <= created) return 'Deadline must be after creation date';
  const minDays = 7;
  const diffDays = (deadline - created) / (1000 * 60 * 60 * 24);
  if (diffDays < minDays)
    return `Deadline must be at least ${minDays} days from today (currently ${Math.round(diffDays)} days)`;
  const maxDays = 365;
  if (diffDays > maxDays)
    return `Deadline should not exceed ${maxDays} days from today (currently ${Math.round(diffDays)} days)`;
  return null;
}

function validateWeights(criteria: RfqEvaluationCriterion[]): string | null {
  const total = criteria.reduce((sum, c) => sum + c.weight, 0);
  if (Math.abs(total - 100) > 0.01)
    return `Evaluation criteria weights must sum to 100 (current total: ${total})`;
  return null;
}

function runCompletenessChecks(input: RfqPackageInput, createdAt: string): RfqCompletenessCheck[] {
  const checks: RfqCompletenessCheck[] = [];

  // Scope summary
  checks.push({
    check: 'Scope summary provided',
    passed: input.scopeSummary.trim().length >= 20,
    detail:
      input.scopeSummary.trim().length >= 20
        ? 'Scope summary is adequate'
        : 'Scope summary is too brief — minimum 20 characters required',
  });

  // Drawings
  checks.push({
    check: 'Drawings referenced',
    passed: input.drawings.length > 0,
    detail:
      input.drawings.length > 0
        ? `${input.drawings.length} drawing(s) referenced`
        : 'No drawings referenced — pricing drawings are essential for accurate quoting',
  });

  // Returnables
  const mandatoryReturnables = input.returnables.filter((r) => r.mandatory);
  checks.push({
    check: 'Mandatory returnables defined',
    passed: mandatoryReturnables.length >= 4,
    detail:
      mandatoryReturnables.length >= 4
        ? `${mandatoryReturnables.length} mandatory returnables defined`
        : `Only ${mandatoryReturnables.length} mandatory returnables defined — minimum 4 recommended`,
  });

  // Evaluation criteria
  checks.push({
    check: 'Evaluation criteria weights valid',
    passed: validateWeights(input.evaluationCriteria) === null,
    detail: validateWeights(input.evaluationCriteria) ?? 'Criteria weights are valid',
  });

  // Deadline
  const deadlineError = validateDeadline(input.deadlineIso, createdAt);
  checks.push({
    check: 'Deadline valid',
    passed: deadlineError === null,
    detail: deadlineError ?? `Deadline: ${new Date(input.deadlineIso).toLocaleDateString('en-ZA')}`,
  });

  // Budget
  checks.push({
    check: 'Budget estimate provided',
    passed: input.budgetEstimateZar > 0,
    detail:
      input.budgetEstimateZar > 0
        ? `Budget: R${input.budgetEstimateZar.toLocaleString()}`
        : 'No budget estimate provided — required for bidder guidance',
  });

  // Site address
  checks.push({
    check: 'Site address provided',
    passed: input.siteAddress.trim().length >= 5,
    detail:
      input.siteAddress.trim().length >= 5
        ? 'Site address provided'
        : 'Site address is required for proper quoting',
  });

  // Contact email
  checks.push({
    check: 'Contact email valid',
    passed: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail),
    detail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail)
      ? 'Contact email is valid'
      : 'A valid contact email is required',
  });

  // Procurement scope
  checks.push({
    check: 'Procurement scope classified',
    passed: input.procurementScope.classification !== undefined,
    detail: `Classification: ${input.procurementScope.classification.replace('_', ' ')}`,
  });

  // Minimum bidders
  checks.push({
    check: 'Minimum bidder requirement clear',
    passed: input.procurementScope.minimumBidders > 0,
    detail: `Minimum ${input.procurementScope.minimumBidders} bidder(s) required`,
  });

  return checks;
}

/**
 * Builds a complete RFQ package from project inputs.
 * Validates completeness and applies fairness rules.
 */
export function buildRfqPackage(input: RfqPackageInput): RfqPackageRecord {
  // Validate required fields
  if (!input.title.trim()) throw new Error('RFQ title is required');
  if (!input.scopeSummary.trim()) throw new Error('Scope summary is required');
  if (!input.projectId.trim()) throw new Error('Project ID is required');

  const createdAt = new Date().toISOString();
  const rfqId = `rfq_${input.projectId}_${Date.now()}`;

  // Validate deadline
  const deadlineError = validateDeadline(input.deadlineIso, createdAt);
  if (deadlineError) throw new Error(deadlineError);

  // Validate weights
  const weightError = validateWeights(input.evaluationCriteria);
  if (weightError) throw new Error(weightError);

  const completenessChecks = runCompletenessChecks(input, createdAt);
  const isComplete = completenessChecks.every((c) => c.passed);

  return {
    rfqId,
    projectId: input.projectId,
    title: input.title.trim(),
    status: isComplete ? 'ready_for_review' : 'draft',
    scopeSummary: input.scopeSummary.trim(),
    procurementClassification: input.procurementScope.classification,
    drawings: input.drawings,
    returnables: input.returnables,
    evaluationCriteria: input.evaluationCriteria,
    totalWeight: input.evaluationCriteria.reduce((sum, c) => sum + c.weight, 0),
    deadlineIso: input.deadlineIso,
    budgetEstimateZar: input.budgetEstimateZar,
    siteAddress: input.siteAddress.trim(),
    contactEmail: input.contactEmail.trim(),
    specialConditions: input.specialConditions ?? [],
    minimumBidders: input.procurementScope.minimumBidders,
    recommendedBidders: input.procurementScope.recommendedBidders,
    publicAdvertisement: input.procurementScope.publicAdvertisement,
    completenessChecks,
    isComplete,
    fairnessRule: FAIRNESS_RULE,
    createdBy: input.createdBy,
    createdAt,
    updatedAt: createdAt,
  };
}

/**
 * Returns the default returnable templates for an RFQ package.
 * Callers can override, extend, or filter these.
 */
export function getDefaultReturnables(): RfqReturnable[] {
  return REQUIRED_RETURNABLE_TEMPLATES.map((r) => ({ ...r }));
}

/**
 * Returns default evaluation criteria for an RFQ package.
 * Callers can adjust weights or add custom criteria.
 */
export function getDefaultEvaluationCriteria(): RfqEvaluationCriterion[] {
  return DEFAULT_EVALUATION_CRITERIA.map((c) => ({ ...c }));
}

/**
 * Validates whether an RFQ package is complete and ready for issue.
 */
export function validateRfqPackageCompleteness(
  pkg: RfqPackageRecord,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!pkg.scopeSummary || pkg.scopeSummary.length < 20)
    issues.push('Scope summary is too brief');
  if (pkg.drawings.length === 0) issues.push('No drawings referenced');
  if (pkg.returnables.filter((r) => r.mandatory).length < 4)
    issues.push('Insufficient mandatory returnables (minimum 4)');
  if (pkg.totalWeight !== 100) issues.push('Evaluation criteria weights do not sum to 100');
  if (!pkg.deadlineIso) issues.push('Deadline not set');
  if (pkg.budgetEstimateZar <= 0) issues.push('Budget estimate not set');
  if (!pkg.siteAddress || pkg.siteAddress.length < 5) issues.push('Site address not set');
  if (!pkg.contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pkg.contactEmail))
    issues.push('Contact email is invalid');

  return { valid: issues.length === 0, issues };
}
