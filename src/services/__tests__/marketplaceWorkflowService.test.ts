import { describe, expect, it } from 'vitest';
import { assertVerifiedParticipantForOpportunity, buildMarketplaceAnalyticsSnapshot, buildMarketplaceOpportunityFromBrief, buildProposal, buildProposalComparison } from '../marketplaceWorkflowService';
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
    expect(() => assertVerifiedParticipantForOpportunity(null)).toThrow(/Verified participant/);
  });

  it('builds human-reviewed proposals', () => {
    const proposal = buildProposal({ opportunityId: 'opp-1', briefId: 'brief-1', clientId: 'client-1', professionalId: 'bep-1', feeAmount: 1000, scopeSummary: 'Design scope', exclusions: [' travel ', '', 'printing'] });
    expect(proposal).toMatchObject({ currency: 'ZAR', status: 'submitted', humanReviewRequired: true, exclusions: ['travel', 'printing'] });
    expect(() => buildProposal({ ...proposal, feeAmount: -1 })).toThrow(/feeAmount/);
    expect(() => buildProposal({ ...proposal, feeAmount: Number.NaN })).toThrow(/feeAmount/);
  });

  it('builds advisory proposal comparisons requiring client ownership and multiple proposals', () => {
    const comparison = buildProposalComparison({ briefId: 'brief-1', clientId: 'client-1', createdBy: 'client-1', proposalIds: ['p1', 'p2'], criteria: ['fee'] });
    expect(comparison.advisoryOnly).toBe(true);
    expect(comparison.limitations.join(' ')).toMatch(/does not automatically appoint/);
    expect(() => buildProposalComparison({ briefId: 'brief-1', clientId: 'client-1', createdBy: 'other', proposalIds: ['p1', 'p2'] })).toThrow(/client owner/);
    expect(() => buildProposalComparison({ briefId: 'brief-1', clientId: 'client-1', createdBy: 'client-1', proposalIds: ['p1'] })).toThrow(/At least two/);
  });

  it('keeps proposal comparison advisory and does not mutate caller arrays or auto-appoint a provider', () => {
    const proposalIds = [' p1 ', 'p2', ''];
    const criteria = [' fee ', 'programme'];
    const comparison = buildProposalComparison({ briefId: 'brief-1', clientId: 'client-1', createdBy: 'client-1', proposalIds, criteria });

    proposalIds.push('p3');
    criteria.push('availability');

    expect(proposalIds).toEqual([' p1 ', 'p2', '', 'p3']);
    expect(criteria).toEqual([' fee ', 'programme', 'availability']);
    expect(comparison.proposalIds).toEqual(['p1', 'p2']);
    expect(comparison.criteria).toEqual(['fee', 'programme']);
    expect(comparison.advisoryOnly).toBe(true);
    expect(comparison.limitations).toContain('Client human confirmation is required before appointment.');
    expect(comparison).not.toHaveProperty('appointmentId');
    expect(comparison).not.toHaveProperty('appointedProfessionalId');
  });

  it('normalizes comparison proposal ids before enforcing minimum proposal count', () => {
    expect(() => buildProposalComparison({ briefId: 'brief-1', clientId: 'client-1', createdBy: 'client-1', proposalIds: ['p1', '  '] })).toThrow(/At least two/);
  });

  it('builds provider-neutral marketplace analytics without personal data or auto-appointment authority', () => {
    const residential = buildMarketplaceOpportunityFromBrief(brief);
    const commercial = buildMarketplaceOpportunityFromBrief({ ...brief, briefId: 'brief-2', title: 'Office fitout', category: 'commercial', location: 'Johannesburg' });
    const proposalA = buildProposal({ opportunityId: 'opp-1', briefId: 'brief-1', clientId: 'client-1', professionalId: 'bep-1', feeAmount: 1000, scopeSummary: 'Design scope' });
    const proposalB = buildProposal({ opportunityId: 'opp-1', briefId: 'brief-1', clientId: 'client-1', professionalId: 'bep-2', feeAmount: 2000, scopeSummary: 'Design scope' });
    const comparison = buildProposalComparison({ briefId: 'brief-1', clientId: 'client-1', createdBy: 'client-1', proposalIds: ['p1', 'p2'] });

    const snapshot = buildMarketplaceAnalyticsSnapshot({
      opportunities: [residential, { ...commercial, status: 'paused' }],
      proposals: [proposalA, { ...proposalB, status: 'shortlisted' }],
      comparisons: [comparison],
      generatedAt: '2026-01-02T00:00:00.000Z',
    });

    expect(snapshot).toMatchObject({
      generatedAt: '2026-01-02T00:00:00.000Z',
      opportunityCount: 2,
      proposalCount: 2,
      comparisonCount: 1,
      statusCounts: { published: 1, paused: 1, closed: 0, appointed: 0 },
      proposalStatusCounts: { submitted: 1, shortlisted: 1, accepted: 0, rejected: 0, withdrawn: 0 },
      governanceFlags: {
        advisoryMatchingOnly: true,
        humanAppointmentRequired: true,
        excludesPersonalData: true,
        aiMayAutoAppoint: false,
      },
    });
    expect(snapshot.categories[0]).toMatchObject({ key: 'residential', opportunities: 1, proposals: 2, averageProposalFee: 1500 });
    expect(snapshot.locations).toEqual([
      expect.objectContaining({ key: 'cape town', opportunities: 1, proposals: 2 }),
      expect.objectContaining({ key: 'johannesburg', opportunities: 1, proposals: 0 }),
    ]);
    expect(JSON.stringify(snapshot)).not.toContain('bep-1');
    expect(JSON.stringify(snapshot)).not.toContain('client-1');
  });

});
