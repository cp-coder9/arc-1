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

// ---------------------------------------------------------------------------
// Platform Spine Integration Types
// ---------------------------------------------------------------------------

export interface ProjectRecord {
  type: string;
  recordType: string;
  data: Record<string, unknown>;
  projectId: string;
  createdAt: string;
}

export interface WorkflowEvent {
  type: string;
  actionType: string;
  priority: string;
  recipientId: string;
  data: Record<string, unknown>;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  performedBy?: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface SpecForgeItem {
  id: string;
  type: string;
  title: string;
  sourceProposalId: string;
  status: string;
}

export interface AppointmentDraft {
  sourceProposalId: string;
  projectId: string;
  projectName: string;
  professionalName: string;
  professionalCompany?: string;
  scopeStages: string[];
  totalFeeInclVat: number;
  status: string;
  createdAt: string;
}

export interface ProjectFacts {
  propertyDescription?: string;
  erfNumber?: string;
  municipality?: string;
  province?: string;
}

// ---------------------------------------------------------------------------
// Platform Spine Integration Adapters
// ---------------------------------------------------------------------------

export function writeProposalToPassport(proposal: ProposalDocument, projectId: string): ProjectRecord {
  return {
    type: 'PROFESSIONAL_PROPOSAL',
    recordType: 'fee_proposal',
    data: {
      proposalId: proposal.id,
      title: proposal.title,
      professionalName: proposal.professional.name,
      professionalCompany: proposal.professional.company,
      projectName: proposal.project.name,
      totalInclVat: proposal.totals.totalInclVat,
      profession: proposal.totals.profession,
      formulaType: proposal.totals.formulaType,
      status: proposal.status,
      auditHash: proposal.auditHash,
    },
    projectId,
    createdAt: new Date().toISOString(),
  };
}

export function createProposalInboxEvent(proposal: ProposalDocument, clientId: string): WorkflowEvent {
  return {
    type: 'PROPOSAL_ISSUED',
    actionType: 'Review and accept',
    priority: 'high',
    recipientId: clientId,
    data: {
      proposalId: proposal.id,
      title: proposal.title,
      professionalName: proposal.professional.name,
      projectName: proposal.project.name,
      totalInclVat: proposal.totals.totalInclVat,
      message: `Review and accept fee proposal from ${proposal.professional.name} — R ${proposal.totals.totalInclVat.toLocaleString('en-ZA')}`,
    },
  };
}

export function createAppointmentFromProposal(
  proposal: ProposalDocument,
  projectFacts: ProjectFacts,
): AppointmentDraft {
  const scopeStages = proposal.sections
    .filter((s) => s.heading.toLowerCase().includes('stage') || s.heading.toLowerCase().includes('scope'))
    .map((s) => s.heading);

  return {
    sourceProposalId: proposal.id,
    projectId: projectFacts.municipality
      ? `${proposal.project.name}-${projectFacts.municipality}`.toLowerCase().replace(/\s+/g, '-')
      : proposal.project.name.toLowerCase().replace(/\s+/g, '-'),
    projectName: proposal.project.name,
    professionalName: proposal.professional.name,
    professionalCompany: proposal.professional.company,
    scopeStages,
    totalFeeInclVat: proposal.totals.totalInclVat,
    status: 'draft',
    createdAt: new Date().toISOString(),
  };
}

export function seedSpecForgeFromProposal(proposal: ProposalDocument, projectId: string): SpecForgeItem[] {
  return proposal.sections.map((section, index) => ({
    id: `sf_${proposal.id}_${index}`,
    type: 'specification_item',
    title: section.heading,
    sourceProposalId: proposal.id,
    status: 'pending',
  }));
}

export function writeProposalAuditEntry(
  action: 'create' | 'issue' | 'revise' | 'accept',
  proposal: ProposalDocument,
): AuditEntry {
  return {
    action,
    entityType: 'fee_proposal',
    entityId: proposal.id,
    performedBy: proposal.professional.name,
    timestamp: new Date().toISOString(),
    data: {
      proposalTitle: proposal.title,
      projectName: proposal.project.name,
      status: proposal.status,
      totalInclVat: proposal.totals.totalInclVat,
      auditHash: proposal.auditHash,
    },
  };
}
