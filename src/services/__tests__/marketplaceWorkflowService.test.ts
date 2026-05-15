import { describe, expect, it } from 'vitest';
import { assertVerifiedParticipantForOpportunity, buildMarketplaceOpportunityFromBrief, buildProposal, buildProposalComparison } from '../marketplaceWorkflowService';
import type { ProjectBriefRecord } from '../briefWorkflowService';

const brief: ProjectBriefRecord & { briefId: string } = {
  briefId: 'brief-1',
  clientId: 'client-1',
  title: 'Alteration',
  description: 'Residential alteration',
  category: 'residential',
  location: 'Cape Town',
  requirements: [],
  propertyDetails: {},
  status: 'submitted',
  createdBy: 'client-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('marketplaceWorkflowService', () => {
  it('publishes marketplace opportunities from valid briefs only', () => {
    expect(buildMarketplaceOpportunityFromBrief(brief)).toMatchObject({ briefId: 'brief-1', clientId: 'client-1', status: 'published', advisoryMatchingOnly: true });
    expect(() => buildMarketplaceOpportunityFromBrief({ ...brief, status: 'appointed' })).toThrow(/draft or submitted/);
  });

  it('requires verified participants for opportunity access', () => {
    expect(() => assertVerifiedParticipantForOpportunity({ verified: true })).not.toThrow();
    expect(() => assertVerifiedParticipantForOpportunity({ status: 'verified', expiresAt: '2099-01-01T00:00:00.000Z' })).not.toThrow();
    expect(() => assertVerifiedParticipantForOpportunity({ status: 'verified', expiresAt: '2000-01-01T00:00:00.000Z' })).toThrow(/Verified participant/);
  });

  it('builds human-reviewed proposals', () => {
    const proposal = buildProposal({ opportunityId: 'opp-1', briefId: 'brief-1', clientId: 'client-1', professionalId: 'bep-1', feeAmount: 1000, scopeSummary: 'Design scope' });
    expect(proposal).toMatchObject({ currency: 'ZAR', status: 'submitted', humanReviewRequired: true });
    expect(() => buildProposal({ ...proposal, feeAmount: -1 })).toThrow(/feeAmount/);
  });

  it('builds advisory proposal comparisons requiring client ownership and multiple proposals', () => {
    const comparison = buildProposalComparison({ briefId: 'brief-1', clientId: 'client-1', createdBy: 'client-1', proposalIds: ['p1', 'p2'], criteria: ['fee'] });
    expect(comparison.advisoryOnly).toBe(true);
    expect(comparison.limitations.join(' ')).toMatch(/does not automatically appoint/);
    expect(() => buildProposalComparison({ briefId: 'brief-1', clientId: 'client-1', createdBy: 'other', proposalIds: ['p1', 'p2'] })).toThrow(/client owner/);
    expect(() => buildProposalComparison({ briefId: 'brief-1', clientId: 'client-1', createdBy: 'client-1', proposalIds: ['p1'] })).toThrow(/At least two/);
  });
});
