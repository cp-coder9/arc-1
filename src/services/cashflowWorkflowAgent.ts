import { calculatePlatformTransactionFee } from './platformTransactionFeeService';
import type { CashflowAgentEvent, EscrowMilestonePlan, ProposalBuilderResult } from '../types/proposalBuilder';

export const DEFAULT_PROFESSIONAL_MILESTONES = [
  { id: 'deposit', name: 'Appointment deposit', percentage: 20, releaseConditions: ['Client acceptance recorded', 'Escrow funded'] },
  { id: 'stage_1_2', name: 'Inception, concept and viability', percentage: 20, releaseConditions: ['Stage deliverables uploaded', 'Client review window closed or approval received'] },
  { id: 'stage_3', name: 'Design development', percentage: 20, releaseConditions: ['Design development package uploaded', 'Coordination actions closed'] },
  { id: 'stage_4', name: 'Documentation and council/procurement package', percentage: 25, releaseConditions: ['Documentation package uploaded', 'Submission/procurement readiness confirmed'] },
  { id: 'stage_5_6', name: 'Construction and close-out services', percentage: 15, releaseConditions: ['Site-stage/close-out deliverables accepted'] },
];

export function createEscrowMilestonePlan(
  proposal: ProposalBuilderResult,
  milestones = DEFAULT_PROFESSIONAL_MILESTONES,
): EscrowMilestonePlan[] {
  const totalPct = milestones.reduce((sum, item) => sum + item.percentage, 0);
  if (Math.round(totalPct) !== 100) throw new Error('Escrow milestone percentages must total 100%.');

  return milestones.map((milestone, index) => {
    const grossChargeableBase = index === milestones.length - 1
      ? Number((proposal.platformFee.chargeableBase - milestones.slice(0, -1).reduce((sum, item) => sum + Number((proposal.platformFee.chargeableBase * (item.percentage / 100)).toFixed(2)), 0)).toFixed(2))
      : Number((proposal.platformFee.chargeableBase * (milestone.percentage / 100)).toFixed(2));
    const split = calculatePlatformTransactionFee(grossChargeableBase, {
      version: proposal.platformFee.configVersion,
      payerSharePercent: proposal.platformFee.payerSharePercent,
      payeeSharePercent: proposal.platformFee.payeeSharePercent,
      totalPlatformFeePercent: proposal.platformFee.payerSharePercent + proposal.platformFee.payeeSharePercent,
    });
    return {
      id: milestone.id,
      name: milestone.name,
      percentage: milestone.percentage,
      grossChargeableBase,
      payerPlatformFee: split.payerPlatformFee,
      payerFundingAmount: split.payerTotalIntoEscrow,
      payeePlatformFee: split.payeePlatformFee,
      payeeNetRelease: split.payeeNetRelease,
      releaseConditions: milestone.releaseConditions,
      status: 'draft',
    };
  });
}

export function nextCashflowAgentEvents(action: CashflowAgentEvent['type'], proposalId: string, projectId?: string): CashflowAgentEvent[] {
  const now = new Date().toISOString();
  const event = (actor: CashflowAgentEvent['actor'], message: string, type: CashflowAgentEvent['type'] = action): CashflowAgentEvent => ({
    type,
    actor,
    projectId,
    proposalId,
    message,
    createdAt: now,
  });

  switch (action) {
    case 'proposal_generated':
      return [
        event('proposal_agent', 'Proposal generated. Check scope, discount, terms and Architex split platform-fee disclosure.'),
        event('terms_agent', 'Terms template required before professional approval.'),
      ];
    case 'proposal_issued':
      return [event('acceptance_agent', 'Monitor client questions, revision requests and acceptance deadline.')];
    case 'proposal_accepted':
      return [
        event('escrow_agent', 'Generate escrow milestone schedule from accepted proposal.'),
        event('invoice_agent', 'Prepare first funding request/invoice for escrow deposit.'),
      ];
    case 'escrow_schedule_generated':
      return [event('payment_agent', 'Await gateway payment confirmation before activating milestone.')];
    case 'payment_confirmed':
      return [event('payment_agent', 'Escrow funded. Activate milestone and notify project team.')];
    case 'release_requested':
      return [
        event('reconciliation_agent', 'Check deliverables, invoice, escrow, platform fee and ledger consistency before approval.'),
        event('dispute_agent', 'If client disputes release, pause payment and open evidence collection.'),
      ];
    case 'release_approved':
      return [
        event('payment_agent', 'Release net payee amount and settle Architex client/payee platform-fee shares.'),
        event('reconciliation_agent', 'Record payee release, platform fee shares and gateway fees in ledger.'),
      ];
    case 'release_completed':
      return [event('reconciliation_agent', 'Reconcile proposal, invoice, escrow and ledger. Prepare next milestone or close-out.')];
    default:
      return [event('proposal_agent', `Cash-flow event recorded: ${action}.`)];
  }
}
