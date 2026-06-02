import type { UserRole } from '../types';
import { buildBriefInterpretation } from './briefWorkflowService';

export type TechnicalBriefStatus = 'draft' | 'ready_for_review' | 'finalized';

export interface TechnicalBriefDraftInput {
  opportunityId: string;
  briefId: string;
  clientId: string;
  createdBy: string;
  createdByRole: UserRole | string;
  scope: string;
  deliverables: string;
  exclusions?: string;
  assumptions?: string;
  consultants?: string;
  approvalRoute?: string;
  riskLevel?: 'low' | 'medium' | 'high' | string;
  missingInformation?: string;
  finalize?: boolean;
  createdAt?: string;
}

export interface TechnicalBriefRecord {
  opportunityId: string;
  briefId: string;
  clientId: string;
  createdBy: string;
  createdByRole: UserRole | string;
  professionalScope: string[];
  deliverables: string[];
  exclusions: string[];
  assumptions: string[];
  consultants: string[];
  approvalRoute: string;
  riskLevel: string;
  missingInformation: string[];
  status: TechnicalBriefStatus;
  humanReviewRequired: true;
  professionalAccountabilityRequired: true;
  downstreamFeeds: string[];
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string | null;
}

const TECHNICAL_BRIEF_ROLES = new Set(['bep', 'architect', 'admin']);

export function splitTechnicalBriefLines(value = '', maxItems = 100, maxLength = 500): string[] {
  return value
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => item.slice(0, maxLength))
    .slice(0, maxItems);
}

export function assertCanAuthorTechnicalBrief(role?: UserRole | string): void {
  if (!role || !TECHNICAL_BRIEF_ROLES.has(role)) {
    const error = new Error('Only BEP/design-team users can create technical briefs');
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
}

export function buildTechnicalBriefRecord(input: TechnicalBriefDraftInput): TechnicalBriefRecord {
  assertCanAuthorTechnicalBrief(input.createdByRole);
  if (!input.opportunityId?.trim()) throw new Error('opportunityId is required');
  if (!input.briefId?.trim()) throw new Error('briefId is required');
  if (!input.clientId?.trim()) throw new Error('clientId is required');
  if (!input.createdBy?.trim()) throw new Error('createdBy is required');

  const professionalScope = splitTechnicalBriefLines(input.scope);
  const deliverables = splitTechnicalBriefLines(input.deliverables);
  const consultants = splitTechnicalBriefLines(input.consultants, 30, 120);
  const missingInformation = splitTechnicalBriefLines(input.missingInformation, 50, 300);

  if (professionalScope.length === 0 && deliverables.length === 0) {
    throw new Error('Technical brief requires professional scope or deliverables');
  }

  if (input.finalize && (professionalScope.length === 0 || deliverables.length === 0)) {
    throw new Error('Final technical briefs require both professional scope and deliverables');
  }

  const now = input.createdAt || new Date().toISOString();
  return {
    opportunityId: input.opportunityId.trim(),
    briefId: input.briefId.trim(),
    clientId: input.clientId.trim(),
    createdBy: input.createdBy.trim(),
    createdByRole: input.createdByRole,
    professionalScope,
    deliverables,
    exclusions: splitTechnicalBriefLines(input.exclusions),
    assumptions: splitTechnicalBriefLines(input.assumptions),
    consultants,
    approvalRoute: input.approvalRoute?.trim().slice(0, 500) || '',
    riskLevel: input.riskLevel || 'medium',
    missingInformation,
    status: input.finalize ? 'finalized' : 'ready_for_review',
    humanReviewRequired: true,
    professionalAccountabilityRequired: true,
    downstreamFeeds: [
      'proposal_scope',
      'appointment_contract',
      'project_stage_gates',
      'compliance_checklists',
      'procurement_estimates',
    ],
    createdAt: now,
    updatedAt: now,
    finalizedAt: input.finalize ? now : null,
  };
}

export function buildTechnicalBriefInterpretation(input: TechnicalBriefDraftInput & { title: string; description?: string }) {
  const technicalBrief = buildTechnicalBriefRecord(input);
  return buildBriefInterpretation({
    briefId: input.briefId,
    clientId: input.clientId,
    createdBy: input.createdBy,
    createdByRole: input.createdByRole,
    summary: `Technical interpretation for ${input.title}: ${technicalBrief.professionalScope.join('; ') || input.description || 'scope pending'}`,
    inferredProjectRoute: technicalBrief.approvalRoute,
    likelyRequiredProfessionals: technicalBrief.consultants,
    risks: [
      technicalBrief.riskLevel !== 'low' ? `Risk level marked ${technicalBrief.riskLevel}` : '',
      ...technicalBrief.missingInformation.map(item => `Missing information: ${item}`),
    ].filter(Boolean),
    assumptions: technicalBrief.assumptions,
    confidence: 0.7,
    model: 'human-authored-technical-brief',
  });
}
