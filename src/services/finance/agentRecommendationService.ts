/**
 * Agent Recommendation Service for Finance / Commercial Control
 *
 * Generates AI-agent recommendations for the financial workflow.
 * Recommendations guide human decision-makers through:
 * - Approval gates
 * - Provider boundary enforcement
 * - Amount separation discipline
 * - Dispute resolution
 * - Provider configuration
 */
import type {
  FinanceAgentRecommendation,
  PaymentCertificate,
  ReleaseRequest,
} from './types';

/**
 * Create a full set of agent recommendations based on the current
 * financial state (certificate + release request + provider status).
 */
export function createAgentRecommendations(
  certificate: PaymentCertificate,
  release: ReleaseRequest,
  providerNotes: string[],
): FinanceAgentRecommendation[] {
  const recommendations: FinanceAgentRecommendation[] = [];

  // Always present: dispute resolution if amounts are disputed
  if (certificate.disputedAmount.amount > 0) {
    recommendations.push({
      id: 'rec-resolve-dispute',
      title: 'Resolve disputed amount before final release',
      rationale: `Disputed/rejected amount: R${certificate.disputedAmount.amount}. Resolve the dispute and re-certify before requesting release.`,
      requiresHumanApproval: true,
    });
  }

  // Always present: configure provider if not live
  if (release.status === 'provider_configuration_required') {
    recommendations.push({
      id: 'rec-configure-provider',
      title: 'Configure provider connector before live escrow/payment release',
      rationale:
        'Current workflow can prepare records but cannot represent live money movement without a configured third-party provider. Architex does not hold client funds.',
      requiresHumanApproval: true,
    });
  }

  // Core recommendations (always present)
  recommendations.push(
    {
      id: 'rec-approval-gates',
      title: 'Confirm client and professional approvals before money release',
      rationale:
        'Payment release is a formal financial/commercial action that requires documented client and lead professional approval.',
      requiresHumanApproval: true,
    },
    {
      id: 'rec-provider-boundary',
      title: 'Use registered third-party financial provider for all money movement',
      rationale: providerNotes.join(' '),
      requiresHumanApproval: true,
    },
    {
      id: 'rec-separate-amounts',
      title: 'Keep claimed, certified, release-requested and provider-paid amounts separate',
      rationale: `Claimed R${certificate.claimedAmount.amount}, certified R${certificate.certifiedAmount.amount}, requested R${release.amount.amount}. These are distinct financial states — never collapse them.`,
      requiresHumanApproval: false,
    },
  );

  return recommendations;
}

/**
 * Create a single recommendation.
 */
export function createRecommendation(input: {
  id?: string;
  title: string;
  rationale: string;
  requiresHumanApproval: boolean;
}): FinanceAgentRecommendation {
  return {
    id: input.id ?? `rec-${input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    title: input.title,
    rationale: input.rationale,
    requiresHumanApproval: input.requiresHumanApproval,
  };
}

/**
 * Generate scheduling recommendations based on payment schedule analysis.
 */
export function createScheduleRecommendations(schedule: {
  totalMilestones: number;
  completedMilestones: number;
  overdueMilestones: number;
  nextDueLabel?: string;
}): FinanceAgentRecommendation[] {
  const recs: FinanceAgentRecommendation[] = [];

  const progress =
    schedule.totalMilestones > 0
      ? Math.round((schedule.completedMilestones / schedule.totalMilestones) * 100)
      : 0;

  recs.push({
    id: 'rec-schedule-progress',
    title: `Payment schedule: ${progress}% complete (${schedule.completedMilestones}/${schedule.totalMilestones})`,
    rationale: `Progress is informational. Overdue milestones: ${schedule.overdueMilestones}.`,
    requiresHumanApproval: false,
  });

  if (schedule.overdueMilestones > 0) {
    recs.push({
      id: 'rec-chase-overdue',
      title: `${schedule.overdueMilestones} overdue payment milestone(s) require attention`,
      rationale: 'Review and action overdue milestones to maintain cashflow.',
      requiresHumanApproval: true,
    });
  }

  if (schedule.nextDueLabel) {
    recs.push({
      id: 'rec-next-payment',
      title: `Next payment due: ${schedule.nextDueLabel}`,
      rationale: 'Prepare certification and approvals in advance of the due date.',
      requiresHumanApproval: false,
    });
  }

  return recs;
}

/**
 * Generate risk-based recommendations for the finance admin.
 */
export function createRiskRecommendations(risks: {
  unconfiguredProvider: boolean;
  disputedClaims: number;
  uncertifiedClaims: number;
  retentionTotal: number;
}): FinanceAgentRecommendation[] {
  const recs: FinanceAgentRecommendation[] = [];

  if (risks.unconfiguredProvider) {
    recs.push({
      id: 'rec-risk-no-provider',
      title: 'HIGH RISK: No live-configured financial provider',
      rationale:
        'Without a configured provider, no payments can be released. This blocks the entire payment workflow.',
      requiresHumanApproval: true,
    });
  }

  if (risks.disputedClaims > 0) {
    recs.push({
      id: 'rec-risk-disputes',
      title: `${risks.disputedClaims} disputed claim(s) require resolution`,
      rationale: 'Disputed claims lock payment release and can stall projects.',
      requiresHumanApproval: true,
    });
  }

  if (risks.uncertifiedClaims > 0) {
    recs.push({
      id: 'rec-risk-uncertified',
      title: `${risks.uncertifiedClaims} uncertified claim(s) pending review`,
      rationale: 'Uncertified claims should be processed within contractual timeframes.',
      requiresHumanApproval: false,
    });
  }

  if (risks.retentionTotal > 100_000) {
    recs.push({
      id: 'rec-risk-retention',
      title: `Significant retention held: R${risks.retentionTotal}`,
      rationale:
        'Large retention balances should be reviewed for scheduled release dates.',
      requiresHumanApproval: false,
    });
  }

  return recs;
}
