import {
  generateProposalRecommendations,
  recommendationsFromProposal,
} from '../proposalAgentRecommendations';
import type { ProposalBuilderResult } from '../../types/proposalBuilder';

describe('proposalAgentRecommendations', () => {
  describe('generateProposalRecommendations', () => {
    it('warns when scope is empty', () => {
      const recs = generateProposalRecommendations({
        projectId: 'proj-1',
        proposalId: 'prop-1',
        status: 'draft',
        discountReasonMissing: false,
        scopeEmpty: true,
        termsAttached: false,
        warningsCount: 0,
      });
      expect(recs.some((r) => r.id.includes('scope-missing'))).toBe(true);
    });

    it('warns when terms are not attached', () => {
      const recs = generateProposalRecommendations({
        projectId: 'proj-1',
        proposalId: 'prop-1',
        status: 'calculator_completed',
        discountReasonMissing: false,
        scopeEmpty: false,
        termsAttached: false,
        warningsCount: 0,
      });
      expect(recs.some((r) => r.id.includes('terms-missing'))).toBe(true);
    });

    it('warns about missing discount reason', () => {
      const recs = generateProposalRecommendations({
        projectId: 'proj-1',
        proposalId: 'prop-1',
        status: 'calculator_completed',
        discountReasonMissing: true,
        scopeEmpty: false,
        termsAttached: true,
        warningsCount: 0,
      });
      expect(recs.some((r) => r.id.includes('discount-reason'))).toBe(true);
    });

    it('recommends professional approval when terms_attached and complete', () => {
      const recs = generateProposalRecommendations({
        projectId: 'proj-1',
        proposalId: 'prop-1',
        status: 'terms_attached',
        discountReasonMissing: false,
        scopeEmpty: false,
        termsAttached: true,
        warningsCount: 0,
      });
      expect(recs.some((r) => r.id.includes('professional-approve'))).toBe(true);
    });

    it('recommends acceptance request when issued', () => {
      const recs = generateProposalRecommendations({
        projectId: 'proj-1',
        proposalId: 'prop-1',
        status: 'issued',
        discountReasonMissing: false,
        scopeEmpty: false,
        termsAttached: true,
        warningsCount: 0,
      });
      expect(recs.some((r) => r.id.includes('request-acceptance'))).toBe(true);
    });

    it('recommends appointment conversion when accepted (critical priority)', () => {
      const recs = generateProposalRecommendations({
        projectId: 'proj-1',
        proposalId: 'prop-1',
        status: 'accepted',
        discountReasonMissing: false,
        scopeEmpty: false,
        termsAttached: true,
        warningsCount: 0,
      });
      const convertRec = recs.find((r) => r.id.includes('convert-appointment'));
      expect(convertRec).toBeDefined();
      expect(convertRec!.priority).toBe('critical');
    });

    it('sorts by priority (highest first)', () => {
      const recs = generateProposalRecommendations({
        projectId: 'proj-1',
        proposalId: 'prop-1',
        status: 'accepted',
        discountReasonMissing: true,
        scopeEmpty: true,
        termsAttached: false,
        warningsCount: 2,
      });
      // Critical (convert-appointment) should be first
      expect(recs[0].priority).toBe('critical');
    });

    it('includes related routes', () => {
      const recs = generateProposalRecommendations({
        projectId: 'proj-1',
        proposalId: 'prop-1',
        status: 'issued',
        discountReasonMissing: false,
        scopeEmpty: false,
        termsAttached: true,
        warningsCount: 0,
      });
      recs.forEach((r) => {
        expect(r.relatedRoute.length).toBeGreaterThan(0);
        expect(r.recommendedActionLabel.length).toBeGreaterThan(0);
      });
    });
  });

  describe('recommendationsFromProposal', () => {
    it('generates recommendations from a ProposalBuilderResult', () => {
      const proposal: ProposalBuilderResult = {
        idSeed: 'test-prop-1',
        status: 'terms_attached',
        title: 'Test Proposal',
        feeBeforeDiscountExVat: 100000,
        discountAmount: 0,
        feeAfterDiscountExVat: 100000,
        vatAmount: 15000,
        feeAfterDiscountIncVat: 115000,
        platformFee: {
          configVersion: 'v1',
          chargeableBase: 100000,
          payerSharePercent: 0.5,
          payeeSharePercent: 0.5,
          payerPlatformFee: 500,
          payeePlatformFee: 500,
          totalPlatformFee: 1000,
          payerTotalIntoEscrow: 115500,
          payeeGrossRelease: 115000,
          payeeNetRelease: 114500,
          disclosure: '1% platform fee',
        },
        clientAmountPayableIntoEscrow: 115500,
        payeeNetReleaseAmount: 114500,
        architexPlatformRevenue: 1000,
        visibleLineItems: [],
        terms: { termsTemplateId: 'test-template' },
        auditSnapshot: {},
      };

      const recs = recommendationsFromProposal(proposal, 'proj-1');
      expect(recs.length).toBeGreaterThan(0);
      expect(recs.some((r) => r.id.includes('test-prop-1'))).toBe(true);
    });
  });
});
