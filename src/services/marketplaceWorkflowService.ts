import { assertBriefPublishable, type ProjectBriefRecord } from './briefWorkflowService';

export type OpportunityStatus = 'published' | 'paused' | 'closed' | 'appointed';
export type ProposalStatus = 'submitted' | 'shortlisted' | 'accepted' | 'rejected' | 'withdrawn';

export interface UserVerificationLike {
  status?: string;
  verificationStatus?: string;
  verified?: boolean;
  expiresAt?: string | null;
}

export interface MarketplaceOpportunityRecord {
  briefId: string;
  clientId: string;
  title: string;
  description: string;
  category?: string;
  location?: string;
  budgetRange?: ProjectBriefRecord['budgetRange'];
  status: OpportunityStatus;
  advisoryMatchingOnly: true;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalInput {
  opportunityId: string;
  briefId: string;
  clientId: string;
  professionalId: string;
  feeAmount: number;
  currency?: string;
  scopeSummary: string;
  programmeSummary?: string;
  exclusions?: string[];
  submittedAt?: string;
}

export interface ProposalRecord extends ProposalInput {
  currency: string;
  exclusions: string[];
  status: ProposalStatus;
  humanReviewRequired: true;
  createdAt: string;
  updatedAt: string;
}


export interface MarketplaceAnalyticsInput {
  opportunities?: MarketplaceOpportunityRecord[];
  proposals?: ProposalRecord[];
  comparisons?: ProposalComparisonRecord[];
  generatedAt?: string;
}

export interface MarketplaceAnalyticsBucket {
  key: string;
  opportunities: number;
  proposals: number;
  averageProposalFee?: number;
}

export interface MarketplaceAnalyticsSnapshot {
  generatedAt: string;
  opportunityCount: number;
  proposalCount: number;
  comparisonCount: number;
  statusCounts: Record<OpportunityStatus, number>;
  proposalStatusCounts: Record<ProposalStatus, number>;
  categories: MarketplaceAnalyticsBucket[];
  locations: MarketplaceAnalyticsBucket[];
  governanceFlags: {
    advisoryMatchingOnly: true;
    humanAppointmentRequired: true;
    excludesPersonalData: true;
    aiMayAutoAppoint: false;
  };
}

export interface ProposalComparisonInput {
  briefId: string;
  clientId: string;
  proposalIds: string[];
  createdBy: string;
  criteria?: string[];
  recommendationSummary?: string;
  scores?: Record<string, number>;
}

export interface ProposalComparisonRecord extends ProposalComparisonInput {
  advisoryOnly: true;
  limitations: string[];
  createdAt: string;
  updatedAt: string;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw Object.assign(new Error(`${field} is required`), { status: 400 });
  return value.trim();
}

function cleanStringArray(value: unknown, maxItems = 50): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim()).slice(0, maxItems) : [];
}

export function assertVerifiedParticipantForOpportunity(userVerification?: UserVerificationLike | null): void {
  const status = userVerification?.verificationStatus || userVerification?.status;
  const expired = userVerification?.expiresAt ? Date.parse(userVerification.expiresAt) <= Date.now() : false;
  if (!(userVerification?.verified === true || status === 'verified') || expired) {
    throw Object.assign(new Error('Verified participant is required for marketplace opportunity access'), { status: 403 });
  }
}

export function buildMarketplaceOpportunityFromBrief(brief: ProjectBriefRecord): MarketplaceOpportunityRecord {
  assertBriefPublishable(brief);
  const now = new Date().toISOString();
  return {
    briefId: requireString((brief as ProjectBriefRecord & { briefId?: string }).briefId || (brief as ProjectBriefRecord & { id?: string }).id, 'briefId'),
    clientId: requireString(brief.clientId, 'clientId'),
    title: requireString(brief.title, 'title'),
    description: requireString(brief.description, 'description'),
    category: brief.category,
    location: brief.location,
    budgetRange: brief.budgetRange,
    status: 'published',
    advisoryMatchingOnly: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildProposal(input: ProposalInput): ProposalRecord {
  if (input.feeAmount < 0 || !Number.isFinite(input.feeAmount)) throw Object.assign(new Error('feeAmount must be a non-negative finite number'), { status: 400 });
  const now = new Date().toISOString();
  return {
    ...input,
    opportunityId: requireString(input.opportunityId, 'opportunityId'),
    briefId: requireString(input.briefId, 'briefId'),
    clientId: requireString(input.clientId, 'clientId'),
    professionalId: requireString(input.professionalId, 'professionalId'),
    scopeSummary: requireString(input.scopeSummary, 'scopeSummary'),
    currency: input.currency || 'ZAR',
    exclusions: cleanStringArray(input.exclusions, 30),
    status: 'submitted',
    humanReviewRequired: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildProposalComparison(input: ProposalComparisonInput): ProposalComparisonRecord {
  if (input.clientId !== input.createdBy) throw Object.assign(new Error('Only the client owner can compare proposals'), { status: 403 });
  if (cleanStringArray(input.proposalIds).length < 2) throw Object.assign(new Error('At least two proposals are required for comparison'), { status: 400 });
  const now = new Date().toISOString();
  return {
    ...input,
    briefId: requireString(input.briefId, 'briefId'),
    clientId: requireString(input.clientId, 'clientId'),
    proposalIds: cleanStringArray(input.proposalIds, 20),
    criteria: cleanStringArray(input.criteria, 20),
    advisoryOnly: true,
    limitations: ['Comparison is advisory only and does not automatically appoint a professional.', 'Client human confirmation is required before appointment.'],
    createdAt: now,
    updatedAt: now,
  };
}

function incrementRecord<T extends string>(record: Record<T, number>, key: T): void {
  record[key] = (record[key] ?? 0) + 1;
}

function buildAnalyticsBuckets(
  opportunities: MarketplaceOpportunityRecord[],
  proposals: ProposalRecord[],
  field: 'category' | 'location',
): MarketplaceAnalyticsBucket[] {
  const buckets = opportunities.reduce<Map<string, MarketplaceAnalyticsBucket & { totalFee: number; feeCount: number }>>((accumulator, opportunity) => {
    const key = (opportunity[field]?.trim() || 'unspecified').toLowerCase();
    const bucket = accumulator.get(key) ?? { key, opportunities: 0, proposals: 0, totalFee: 0, feeCount: 0 };
    bucket.opportunities += 1;
    const opportunityProposals = proposals.filter((proposal) => proposal.briefId === opportunity.briefId);
    bucket.proposals += opportunityProposals.length;
    opportunityProposals.forEach((proposal) => {
      if (proposal.currency === 'ZAR' && Number.isFinite(proposal.feeAmount)) {
        bucket.totalFee += proposal.feeAmount;
        bucket.feeCount += 1;
      }
    });
    accumulator.set(key, bucket);
    return accumulator;
  }, new Map());

  return Array.from(buckets.values())
    .map(({ totalFee, feeCount, ...bucket }) => ({
      ...bucket,
      averageProposalFee: feeCount > 0 ? Math.round((totalFee / feeCount) * 100) / 100 : undefined,
    }))
    .sort((a, b) => b.opportunities - a.opportunities || b.proposals - a.proposals || a.key.localeCompare(b.key));
}

export function buildMarketplaceAnalyticsSnapshot(input: MarketplaceAnalyticsInput): MarketplaceAnalyticsSnapshot {
  const opportunities = input.opportunities ?? [];
  const proposals = input.proposals ?? [];
  const comparisons = input.comparisons ?? [];
  const statusCounts: Record<OpportunityStatus, number> = { published: 0, paused: 0, closed: 0, appointed: 0 };
  const proposalStatusCounts: Record<ProposalStatus, number> = { submitted: 0, shortlisted: 0, accepted: 0, rejected: 0, withdrawn: 0 };

  opportunities.forEach((opportunity) => incrementRecord(statusCounts, opportunity.status));
  proposals.forEach((proposal) => incrementRecord(proposalStatusCounts, proposal.status));

  return {
    generatedAt: input.generatedAt || new Date().toISOString(),
    opportunityCount: opportunities.length,
    proposalCount: proposals.length,
    comparisonCount: comparisons.length,
    statusCounts,
    proposalStatusCounts,
    categories: buildAnalyticsBuckets(opportunities, proposals, 'category'),
    locations: buildAnalyticsBuckets(opportunities, proposals, 'location'),
    governanceFlags: {
      advisoryMatchingOnly: true,
      humanAppointmentRequired: true,
      excludesPersonalData: true,
      aiMayAutoAppoint: false,
    },
  };
}
