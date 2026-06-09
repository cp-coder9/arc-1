/**
 * Payment Schedule Service
 *
 * Builds milestone/date-based payment plans from the commercial baseline.
 * Tracks next payment due and integrates with escrow milestones.
 *
 * Default schedule follows the standard construction payment cadence:
 * Deposit → Structure → Enclosure → Practical Completion → Retention Release
 */
import type { CommercialBaseline, PaymentMilestone } from './types';

/** Default milestone definitions — can be overridden per project */
export const DEFAULT_PAYMENT_MILESTONE_TEMPLATES: Array<{
  milestoneId: string;
  label: string;
  percent: number;
  dueTrigger: string;
}> = [
  {
    milestoneId: 'deposit',
    label: 'Deposit / mobilisation',
    percent: 10,
    dueTrigger: 'appointment and provider collection confirmed',
  },
  {
    milestoneId: 'milestone-structure',
    label: 'Structural work progress payment',
    percent: 30,
    dueTrigger: 'lead professional/QS certification',
  },
  {
    milestoneId: 'milestone-enclosure',
    label: 'Envelope/enclosure progress payment',
    percent: 30,
    dueTrigger: 'lead professional/QS certification',
  },
  {
    milestoneId: 'milestone-completion',
    label: 'Practical completion payment',
    percent: 25,
    dueTrigger: 'practical completion certificate',
  },
  {
    milestoneId: 'retention-release',
    label: 'Retention release',
    percent: 5,
    dueTrigger: 'defects/retention release approval',
  },
];

/**
 * Build a payment schedule from the baseline using default milestone templates.
 * Each milestone amount is calculated as a percentage of the current contract sum.
 */
export function buildPaymentSchedule(
  baseline: CommercialBaseline,
  templates: Array<{
    milestoneId: string;
    label: string;
    percent: number;
    dueTrigger: string;
  }> = DEFAULT_PAYMENT_MILESTONE_TEMPLATES,
): PaymentMilestone[] {
  const total = baseline.currentContractSum.amount;

  // Validate template percentages sum to 100
  const totalPct = templates.reduce((sum, t) => sum + t.percent, 0);
  if (Math.abs(totalPct - 100) > 0.01) {
    throw new Error(
      `Payment schedule template percentages must total 100%, got ${totalPct}%`,
    );
  }

  return templates.map(({ milestoneId, label, percent, dueTrigger }) => ({
    milestoneId,
    label,
    percent,
    amount: {
      currency: 'ZAR' as const,
      amount: Math.round((total * percent) / 100),
    },
    dueTrigger,
    status: 'approval_required' as const,
  }));
}

/**
 * Build a custom payment schedule from a list of amounts and labels.
 */
export function buildCustomPaymentSchedule(
  baseline: CommercialBaseline,
  milestones: Array<{
    milestoneId: string;
    label: string;
    amount: number;
    dueTrigger: string;
  }>,
): PaymentMilestone[] {
  const totalAmount = milestones.reduce((sum, m) => sum + m.amount, 0);
  const contractAmount = baseline.currentContractSum.amount;

  return milestones.map(({ milestoneId, label, amount, dueTrigger }) => ({
    milestoneId,
    label,
    percent: contractAmount > 0 ? Math.round((amount / contractAmount) * 10000) / 100 : 0,
    amount: { currency: 'ZAR' as const, amount },
    dueTrigger,
    status: 'approval_required' as const,
  }));
}

/**
 * Find the next payment due in the schedule (first milestone not yet
 * approved/provider-confirmed).
 */
export function findNextPaymentDue(
  schedule: PaymentMilestone[],
): PaymentMilestone | null {
  return (
    schedule.find(
      (m) =>
        m.status === 'approval_required' ||
        m.status === 'approved_for_provider_request' ||
        m.status === 'provider_configuration_required',
    ) ?? null
  );
}

/**
 * Calculate total amount scheduled across all milestones.
 */
export function totalScheduledAmount(schedule: PaymentMilestone[]): number {
  return schedule.reduce((sum, m) => sum + m.amount.amount, 0);
}

/**
 * Calculate total amount released (provider_confirmed_paid).
 */
export function totalReleasedAmount(schedule: PaymentMilestone[]): number {
  return schedule
    .filter((m) => m.status === 'provider_confirmed_paid')
    .reduce((sum, m) => sum + m.amount.amount, 0);
}
