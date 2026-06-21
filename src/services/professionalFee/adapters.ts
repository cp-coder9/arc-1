import type { ProposalDocument } from './types';

export function toProjectRecord(proposal: ProposalDocument) {
  return {
    type: 'PROFESSIONAL_PROPOSAL',
    proposalId: proposal.id,
    projectName: proposal.project.name,
    total: proposal.totals.totalInclVat,
    auditHash: proposal.auditHash,
  };
}

export function toInboxEvent(proposal: ProposalDocument) {
  return {
    type: 'PROPOSAL_ISSUED',
    title: proposal.title,
    message: `Review and accept proposal total R ${proposal.totals.totalInclVat.toLocaleString('en-ZA')}`,
    proposalId: proposal.id,
  };
}

export function toAppointmentDraft(proposal: ProposalDocument) {
  return {
    sourceProposalId: proposal.id,
    project: proposal.project,
    professional: proposal.professional,
    status: 'draft-appointment-from-accepted-proposal',
    scopeSnapshotHash: proposal.auditHash,
  };
}
