/**
 * Sample data for finance / commercial control demo and testing.
 */
import type { AwardSnapshot, FinancialProvider } from './types';

export const sampleAward: AwardSnapshot = {
  awardId: 'award-quote-001',
  projectId: 'project-appt-prop-architect-002',
  appointedPartyId: 'mkt-main-001',
  appointedPartyName: 'Jozi Alterations CC',
  contractSum: { currency: 'ZAR', amount: 2_650_000 },
  vatIncluded: true,
  exclusions: ['municipal fees', 'specialist structural certification'],
  qualifications: ['subject to final approved drawings'],
  approvedAtIso: '2026-07-05T10:00:00.000Z',
};

export const sampleProviders: FinancialProvider[] = [
  {
    providerId: 'fsp-escrow-demo',
    name: 'Registered Escrow Provider Placeholder',
    providerType: 'escrow_provider',
    registered: true,
    capabilities: ['collect', 'escrow_hold', 'release', 'payout', 'webhook_status'],
    liveConfigured: false,
  },
  {
    providerId: 'pay-gateway-demo',
    name: 'Registered Payment Gateway Placeholder',
    providerType: 'payment_gateway',
    registered: true,
    capabilities: ['collect', 'payout', 'webhook_status'],
    liveConfigured: false,
  },
];
