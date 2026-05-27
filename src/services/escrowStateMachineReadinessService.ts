export type EscrowState = 'created' | 'funded' | 'release_requested' | 'admin_review' | 'released' | 'dispute_hold' | 'refunded' | 'closed';
export const ESCROW_TRANSITIONS: Readonly<Record<EscrowState, readonly EscrowState[]>> = Object.freeze({ created: ['funded', 'closed'], funded: ['release_requested', 'dispute_hold', 'refunded'], release_requested: ['admin_review', 'dispute_hold'], admin_review: ['released', 'dispute_hold'], released: ['closed'], dispute_hold: ['admin_review', 'refunded'], refunded: ['closed'], closed: [] });
export function evaluateEscrowStateTransition(input: { from: EscrowState; to: EscrowState; funded?: boolean; evidenceIds?: string[]; clientApproved?: boolean; adminApproved?: boolean; disputeOpen?: boolean }) {
  const allowedByMap = ESCROW_TRANSITIONS[input.from].includes(input.to);
  const blockers: string[] = [];
  if (!allowedByMap) blockers.push(`Transition ${input.from} -> ${input.to} is not allowed by the PRD escrow state-machine mapping.`);
  if (input.to === 'funded' && !input.funded) blockers.push('Funding confirmation is required before funded state.');
  if (input.to === 'admin_review' && (input.evidenceIds?.length ?? 0) === 0) blockers.push('Release evidence is required before admin review.');
  if (input.to === 'released' && (!input.clientApproved || !input.adminApproved)) blockers.push('Client and admin approval are required before release.');
  if (input.to === 'closed' && input.disputeOpen) blockers.push('Open disputes block escrow closure.');
  return Object.freeze({ allowed: allowedByMap && blockers.length === 0, blockers, solidityInScope: false, model: 'internal_typescript_state_machine' as const, nextAction: { label: blockers.length ? 'Resolve escrow transition blockers' : 'Record escrow transition in ledger/audit trail', target: 'payment-governance', requiresHumanConfirmation: true, automationLevel: 'advisory' as const }, audit: { prdSection: 'Section 58: Programmatic Escrow State-Machine (Solidity Specification)' as const, noBlockchainExecution: true, noAutomaticRelease: true, humanReviewRequired: true } });
}
