/**
 * Proposal Integration Outputs — Bridge for the ProposalBuilderPanel
 *
 * Wraps proposalIntegrationAdapters, proposalInboxEvents, and
 * proposalAgentRecommendations with the interface the frontend component expects.
 */

import type { ProposalBuilderResult, ProposalTermsSnapshot } from '../types/proposalBuilder';
import { generateAllProposalRecords, createProposalDocumentOutput } from './proposalIntegrationAdapters';
import type { ProjectRecord, DocumentOutputPlaceholder } from './proposalIntegrationAdapters';
import { generateProposalInboxEvents } from './proposalInboxEvents';
import type { InboxEvent } from './proposalInboxEvents';
import { recommendationsFromProposal as genRecommendations } from './proposalAgentRecommendations';
import type { ProposalAgentRecommendation } from './proposalAgentRecommendations';

// Re-export types the component expects
export type ProjectRecord = ProjectRecord;
export type DocumentOutput = DocumentOutputPlaceholder & { placeholderNote: string };
export type WorkflowEvent = InboxEvent & { title: string; detail: string; assignedRoles: string[] };
export type AgentRecommendation = ProposalAgentRecommendation;

interface ProjectContext {
  proposalId: string;
  tenantId: string;
  projectId: string;
  professionalName: string;
  professionalRole: string;
  clientName: string;
}

/** Generate ProjectRecords from a proposal */
export function projectRecordsFromProposal(
  proposal: ProposalBuilderResult,
  context: ProjectContext,
): ProjectRecord[] {
  const termsSnapshot: ProposalTermsSnapshot = proposal.terms ?? {};
  const records = generateAllProposalRecords(proposal, {
    tenantId: context.tenantId,
    projectId: context.projectId,
    createdByUserId: context.professionalName,
    scopeSummary: (proposal.auditSnapshot as any)?.scopeSummary ?? '',
    clientName: context.clientName,
    professionalName: context.professionalName,
    termsSnapshot,
  });

  return [
    records.proposalRecord,
    records.scopeBaselineRecord,
    records.feeSnapshotRecord,
    records.termsSnapshotRecord,
    records.appointmentDraftRecord,
  ];
}

/** Generate DocumentOutput from a proposal */
export function documentOutputFromProposal(
  proposal: ProposalBuilderResult,
  proposalId: string,
  projectId: string,
  professionalName: string,
): DocumentOutput {
  const doc = createProposalDocumentOutput(proposal, projectId);
  return {
    ...doc,
    placeholderNote: 'PDF placeholder — real PDF generation is excluded from this pack. The document record with frozen terms, fee calculation, and professional responsibility confirmation is stored in the system.',
  };
}

/** Generate WorkflowEvents (inbox events) from a proposal */
export function workflowEventsFromProposal(
  proposal: ProposalBuilderResult,
  proposalId: string,
  projectId: string,
  professionalRole: string,
): WorkflowEvent[] {
  const events = generateProposalInboxEvents(
    {
      projectId,
      proposalId,
      status: proposal.status,
      payeeRole: professionalRole,
      clientUserId: 'client',
      professionalUserId: 'professional',
    },
    proposal.terms,
  );

  return events.map((e) => ({
    ...e,
    title: e.message,
    detail: e.message,
    assignedRoles: e.assignedRoles,
  }));
}

/** Generate Agent Recommendations from a proposal */
export function recommendationsFromProposal(
  proposal: ProposalBuilderResult,
  proposalId: string,
  projectId: string,
  events: WorkflowEvent[],
  professionalRole: string,
): AgentRecommendation[] {
  return genRecommendations(proposal, projectId);
}
