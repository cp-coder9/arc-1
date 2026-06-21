import type { PaymentProviderConfig, PolicyGateDecision, ReviewQueueItem, TariffVersion, VerificationCase } from './types';
import { id } from './utils';

export class PolicyGateService {
  tariffUse(t: TariffVersion): PolicyGateDecision {
    return t.status === 'published'
      ? { id: id('gate'), policyCode: 'TARIFF_VERSION_PUBLISHED_ONLY', actionRef: t.id, decision: 'allowed', reason: 'Published tariff version can be used' }
      : { id: id('gate'), policyCode: 'TARIFF_VERSION_PUBLISHED_ONLY', actionRef: t.id, decision: 'blocked', reason: 'Only published tariffs can be used in issued proposal snapshots', requiredReviewerRole: 'platform_admin' };
  }
  verificationUse(c: VerificationCase): PolicyGateDecision {
    return ['manually_verified', 'externally_verified'].includes(c.status)
      ? { id: id('gate'), policyCode: 'VERIFICATION_VALID', actionRef: c.id, decision: 'allowed', reason: c.badgeLabel }
      : { id: id('gate'), policyCode: 'VERIFICATION_VALID', actionRef: c.id, decision: 'requires_review', reason: `Verification status is ${c.status}`, requiredReviewerRole: 'verification_reviewer' };
  }
  aiFormalAction(item: ReviewQueueItem): PolicyGateDecision {
    return item.status === 'approved'
      ? { id: id('gate'), policyCode: 'AI_FORMAL_ACTION_REVIEWED', actionRef: item.id, decision: 'allowed', reason: 'Human review approved' }
      : { id: id('gate'), policyCode: 'AI_FORMAL_ACTION_REVIEWED', actionRef: item.id, decision: 'blocked', reason: 'AI-generated formal action requires human approval', requiredReviewerRole: item.reviewerRole };
  }
  paymentRelease(cfg: PaymentProviderConfig): PolicyGateDecision {
    return cfg.status === 'active' && cfg.webhookConfigured && cfg.enabledScopes.includes('payment_release')
      ? { id: id('gate'), policyCode: 'PAYMENT_PROVIDER_ACTIVE', actionRef: cfg.id, decision: 'allowed', reason: 'Active provider configured for release requests' }
      : { id: id('gate'), policyCode: 'PAYMENT_PROVIDER_ACTIVE', actionRef: cfg.id, decision: 'blocked', reason: 'Payment provider configuration required; Architex cannot release funds directly', requiredReviewerRole: 'finance_admin' };
  }
}
