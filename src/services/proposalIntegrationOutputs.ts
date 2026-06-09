/**
 * Proposal Integration Outputs — Pack 4: Professional Toolboxes & Proposal Builder
 *
 * Generates ProjectRecord outputs, document output placeholders, and inbox
 * workflow events from proposal data. These feed into the platform's
 * ProjectRecord envelope, document register, and inbox/notification system.
 */
import type {
  ProposalBuilderResult,
  ProposalStatus,
  ProposalPartyRole,
} from '../types/proposalBuilder';
import type { ProposalTermsSnapshot } from '../types/proposalBuilder';

// ─── Project Records ────────────────────────────────────────────────────────

export type ProjectRecordType =
  | 'proposal'
  | 'scope_baseline'
  | 'fee_calculation_snapshot'
  | 'terms_snapshot'
  | 'professional_appointment_draft';

export interface ProjectRecordApproval {
  required: boolean;
  pendingRoles?: ProposalPartyRole[];
  approvedBy?: string[];
}

export interface ProjectRecordAudit {
  createdBy: string;
  createdAt: string;
  supersedesRecordId?: string;
}

export interface ProjectRecord {
  id: string;
  tenantId: string;
  projectId: string;
  phase: string;
  moduleKey: 'toolboxes' | 'proposal_builder';
  recordType: ProjectRecordType;
  title: string;
  status: 'draft' | 'pending_review' | 'issued' | 'superseded';
  payload: Record<string, unknown>;
  approvals: ProjectRecordApproval;
  audit: ProjectRecordAudit;
  linkedRecordIds: string[];
}

export interface ProposalContext {
  proposalId: string;
  tenantId: string;
  projectId: string;
  professionalName: string;
  professionalRole: ProposalPartyRole;
  clientName?: string;
}

/**
 * Generate all ProjectRecord outputs from a proposal result.
 */
export function projectRecordsFromProposal(
  proposal: ProposalBuilderResult,
  context: ProposalContext,
): ProjectRecord[] {
  const base = {
    tenantId: context.tenantId,
    projectId: context.projectId,
    phase: 'appointment',
    moduleKey: 'proposal_builder' as const,
    audit: {
      createdBy: context.professionalRole,
      createdAt: new Date().toISOString(),
    },
    linkedRecordIds: [] as string[],
  };

  const isIssued = proposal.status === 'issued' || proposal.status === 'accepted' || proposal.status === 'converted_to_appointment';

  return [
    // 1. Proposal record
    {
      ...base,
      id: `pr-${context.proposalId}-proposal`,
      recordType: 'proposal' as ProjectRecordType,
      title: `Proposal: ${context.professionalName}`,
      status: isIssued ? 'issued' : 'draft',
      payload: {
        proposalId: context.proposalId,
        title: proposal.title,
        totalExVat: proposal.feeAfterDiscountExVat,
        vatAmount: proposal.vatAmount,
        totalIncVat: proposal.feeAfterDiscountIncVat,
        platformFee: proposal.platformFee,
        clientPaysIntoEscrow: proposal.clientAmountPayableIntoEscrow,
        payeeNetRelease: proposal.payeeNetReleaseAmount,
        status: proposal.status,
        lineItems: proposal.visibleLineItems,
      },
      approvals: {
        required: !isIssued,
        pendingRoles: ['client'],
      },
    },

    // 2. Scope baseline record
    {
      ...base,
      id: `pr-${context.proposalId}-scope`,
      recordType: 'scope_baseline' as ProjectRecordType,
      title: 'Scope baseline from proposal',
      status: isIssued ? 'issued' : 'draft',
      payload: {
        proposalId: context.proposalId,
        scopeSummary: proposal.auditSnapshot?.scopeSummary || 'Fee estimate derived from proposal.',
        calculatorId: proposal.auditSnapshot?.calculatorId,
        calculatorVersion: proposal.auditSnapshot?.calculatorVersion,
      },
      approvals: {
        required: true,
        pendingRoles: ['client'],
      },
    },

    // 3. Fee calculation snapshot record
    {
      ...base,
      id: `pr-${context.proposalId}-fee`,
      recordType: 'fee_calculation_snapshot' as ProjectRecordType,
      title: 'Fee calculation snapshot',
      status: isIssued ? 'issued' : 'draft',
      payload: {
        proposalId: context.proposalId,
        calculatorId: proposal.auditSnapshot?.calculatorId,
        calculatorVersion: proposal.auditSnapshot?.calculatorVersion,
        feeBeforeDiscount: proposal.feeBeforeDiscountExVat,
        discountAmount: proposal.discountAmount,
        feeAfterDiscount: proposal.feeAfterDiscountExVat,
        vatAmount: proposal.vatAmount,
        total: proposal.feeAfterDiscountIncVat,
        platformFee: proposal.platformFee,
        discount: proposal.auditSnapshot?.discount || null,
        createdAt: proposal.auditSnapshot?.createdAt,
      },
      approvals: { required: false },
    },

    // 4. Terms snapshot record
    {
      ...base,
      id: `pr-${context.proposalId}-terms`,
      recordType: 'terms_snapshot' as ProjectRecordType,
      title: 'Terms snapshot',
      status: isIssued ? 'issued' : 'draft',
      payload: {
        proposalId: context.proposalId,
        terms: proposal.terms || null,
        termsTemplateId: proposal.auditSnapshot?.termsTemplateId || null,
        termsTemplateVersion: proposal.auditSnapshot?.termsTemplateVersion || null,
      },
      approvals: {
        required: proposal.terms ? true : false,
        pendingRoles: proposal.terms
          ? ([context.professionalRole, 'client'] as ProposalPartyRole[])
          : undefined,
      },
    },

    // 5. Professional appointment draft record
    {
      ...base,
      id: `pr-${context.proposalId}-appointment-draft`,
      recordType: 'professional_appointment_draft' as ProjectRecordType,
      title: 'Appointment draft from accepted proposal',
      status: 'draft',
      payload: {
        proposalId: context.proposalId,
        clientName: context.clientName || 'Client',
        professionalName: context.professionalName,
        professionalRole: context.professionalRole,
        feeSchedule: {
          totalIncVat: proposal.feeAfterDiscountIncVat,
          platformFee: proposal.platformFee,
        },
        scopeSummary: proposal.auditSnapshot?.scopeSummary || '',
        terms: proposal.terms || null,
      },
      approvals: {
        required: true,
        pendingRoles: ['client', context.professionalRole],
      },
    },
  ];
}

// ─── Document Output ────────────────────────────────────────────────────────

export interface DocumentOutput {
  documentId: string;
  projectId: string;
  title: string;
  documentType: 'proposal_pdf' | 'proposal_revision' | 'terms_snapshot' | 'appointment_letter';
  status: 'draft' | 'issued' | 'superseded';
  revision: string;
  linkedProposalId: string;
  createdAt: string;
  placeholderNote: string;
}

/**
 * Generate a document output placeholder for an issued proposal.
 * Real PDF generation is excluded from this pack — this placeholder
 * integrates with the document register for later population.
 */
export function documentOutputFromProposal(
  proposal: ProposalBuilderResult,
  proposalId: string,
  projectId: string,
  professionalName: string,
  supersedesProposalId?: string,
): DocumentOutput {
  const revision = supersedesProposalId ? 'B' : 'A';
  const isTerminal =
    proposal.status === 'accepted' ||
    proposal.status === 'rejected' ||
    proposal.status === 'withdrawn';

  return {
    documentId: `doc-${proposalId}`,
    projectId,
    title: `Proposal - ${professionalName}`,
    documentType: 'proposal_pdf',
    status: isTerminal
      ? 'issued'
      : proposal.status === 'issued'
        ? 'issued'
        : 'draft',
    revision: `rev ${revision}`,
    linkedProposalId: proposalId,
    createdAt: new Date().toISOString(),
    placeholderNote:
      'PDF generation is excluded from Pack 4 scope. This placeholder reserves the document register entry for later PDF population via the document engine.',
  };
}

// ─── Inbox / Workflow Events ────────────────────────────────────────────────

export type WorkflowEventType =
  | 'approval_required'
  | 'document_updated'
  | 'task_overdue'
  | 'risk_detected'
  | 'proposal_ready_for_review'
  | 'proposal_issued'
  | 'proposal_accepted'
  | 'proposal_expiring'
  | 'terms_review_required';

export type WorkflowEventPriority = 'low' | 'medium' | 'high' | 'critical';

export interface WorkflowEvent {
  id: string;
  type: WorkflowEventType;
  projectId: string;
  title: string;
  detail: string;
  priority: WorkflowEventPriority;
  sourceModule: 'toolboxes' | 'proposal_builder';
  assignedRoles: ProposalPartyRole[];
  createdAt: string;
  actionUrl?: string;
}

/**
 * Generate inbox workflow events from a proposal and its state.
 */
export function workflowEventsFromProposal(
  proposal: ProposalBuilderResult,
  proposalId: string,
  projectId: string,
  professionalRole: ProposalPartyRole,
): WorkflowEvent[] {
  const events: WorkflowEvent[] = [];
  const now = new Date().toISOString();

  // Helper
  const makeEvent = (
    type: WorkflowEventType,
    title: string,
    detail: string,
    priority: WorkflowEventPriority,
    roles: ProposalPartyRole[],
  ): WorkflowEvent => ({
    id: `evt-${proposalId}-${type}`,
    type,
    projectId,
    title,
    detail,
    priority,
    sourceModule: 'proposal_builder',
    assignedRoles: roles,
    createdAt: now,
    actionUrl: `/projects/${projectId}/proposals/${proposalId}`,
  });

  // 1. Discount reason check
  if (
    proposal.auditSnapshot?.discount &&
    typeof proposal.auditSnapshot.discount === 'object' &&
    (proposal.auditSnapshot.discount as Record<string, unknown>).percentage &&
    !(proposal.auditSnapshot.discount as Record<string, unknown>).reason
  ) {
    events.push(
      makeEvent(
        'risk_detected',
        'Discount reason missing',
        'A discount was applied without a recorded reason. A reason is required before the proposal can be issued.',
        'high',
        [professionalRole, 'admin' as ProposalPartyRole],
      ),
    );
  }

  // 2. Terms review required
  if (
    proposal.status === 'terms_attached' ||
    proposal.status === 'calculator_completed'
  ) {
    events.push(
      makeEvent(
        'terms_review_required',
        'Terms review required',
        'Terms and conditions must be reviewed and approved before the proposal can be issued.',
        'medium',
        [professionalRole],
      ),
    );
  }

  // 3. Proposal ready for review
  if (proposal.status === 'professional_approved') {
    events.push(
      makeEvent(
        'proposal_ready_for_review',
        'Proposal ready for professional review',
        'The proposal has been built and is awaiting final professional sign-off before issuing.',
        'high',
        [professionalRole],
      ),
    );
  }

  // 4. Proposal issued
  if (proposal.status === 'issued') {
    events.push(
      makeEvent(
        'proposal_issued',
        'Proposal issued to client',
        'The proposal has been issued and is awaiting client review and acceptance.',
        'high',
        ['client'],
      ),
    );
  }

  // 5. Client acceptance
  if (proposal.status === 'issued') {
    events.push(
      makeEvent(
        'proposal_accepted',
        'Awaiting client acceptance',
        'Client acceptance is required to convert this proposal to an appointment.',
        'high',
        ['client'],
      ),
    );
  }

  // 6. Proposal expiry warning
  if (
    proposal.terms?.validityPeriodDays &&
    proposal.auditSnapshot?.createdAt &&
    proposal.status === 'issued'
  ) {
    const issuedAt = new Date(proposal.auditSnapshot.createdAt as string);
    const validityDays = proposal.terms.validityPeriodDays;
    const expiryDate = new Date(issuedAt);
    expiryDate.setDate(expiryDate.getDate() + validityDays);
    const daysRemaining = Math.ceil(
      (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    if (daysRemaining <= 3 && daysRemaining > 0) {
      events.push(
        makeEvent(
          'proposal_expiring',
          `Proposal expiring in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`,
          `This proposal expires on ${expiryDate.toLocaleDateString('en-ZA')}. Request client action before expiry.`,
          daysRemaining <= 1 ? 'critical' : 'medium',
          ['client', professionalRole],
        ),
      );
    } else if (daysRemaining <= 0) {
      events.push(
        makeEvent(
          'proposal_expiring',
          'Proposal has expired',
          `This proposal expired on ${expiryDate.toLocaleDateString('en-ZA')}. Consider issuing a revised proposal.`,
          'high',
          [professionalRole, 'client'],
        ),
      );
    }
  }

  // 7. Accepted proposal → appointment conversion
  if (proposal.status === 'accepted') {
    events.push(
      makeEvent(
        'proposal_accepted',
        'Proposal accepted — create appointment',
        'Client has accepted the proposal. Convert to a professional appointment and set up escrow milestones.',
        'high',
        ['admin' as ProposalPartyRole, professionalRole],
      ),
    );
  }

  return events;
}

// ─── Agent Recommendations ──────────────────────────────────────────────────

export interface AgentRecommendation {
  id: string;
  scope: 'user' | 'project';
  title: string;
  rationale: string;
  priority: WorkflowEventPriority;
  recommendedActionLabel: string;
  relatedRoute: string;
  requiresHumanApproval: boolean;
}

/**
 * Generate agent recommendations from proposal and workflow events.
 */
export function recommendationsFromProposal(
  proposal: ProposalBuilderResult,
  proposalId: string,
  projectId: string,
  events: WorkflowEvent[],
  professionalRole: ProposalPartyRole,
): AgentRecommendation[] {
  const recs: AgentRecommendation[] = [];

  const makeRec = (
    title: string,
    rationale: string,
    priority: AgentRecommendation['priority'],
    label: string,
    requiresHumanApproval: boolean,
    scope: 'user' | 'project' = 'project',
  ): AgentRecommendation => ({
    id: `rec-${proposalId}-${title.toLowerCase().replace(/\s+/g, '-')}`,
    scope,
    title,
    rationale,
    priority,
    recommendedActionLabel: label,
    relatedRoute: `/projects/${projectId}/toolboxes/proposals/${proposalId}`,
    requiresHumanApproval,
  });

  // Missing scope
  if (!proposal.auditSnapshot?.scopeSummary) {
    recs.push(
      makeRec(
        'Complete scope before issue',
        'A proposal should not be issued without a documented scope summary.',
        'high',
        'Add scope',
        true,
      ),
    );
  }

  // Discount without reason
  if (
    proposal.auditSnapshot?.discount &&
    typeof proposal.auditSnapshot.discount === 'object' &&
    (proposal.auditSnapshot.discount as Record<string, unknown>).percentage &&
    !(proposal.auditSnapshot.discount as Record<string, unknown>).reason
  ) {
    recs.push(
      makeRec(
        'Record discount reason',
        'A discount was applied without a reason. Professional governance requires recorded rationale.',
        'high',
        'Add discount reason',
        true,
      ),
    );
  }

  // Needs terms
  if (proposal.status === 'calculator_completed') {
    recs.push(
      makeRec(
        'Attach terms and conditions',
        'Terms must be attached and reviewed before the proposal can be professionally approved and issued.',
        'high',
        'Attach terms',
        true,
      ),
    );
  }

  // Professional approval needed
  if (proposal.status === 'terms_attached') {
    recs.push(
      makeRec(
        'Professional approval required',
        'The professional must review and approve the complete proposal before issuing to the client.',
        'high',
        'Approve proposal',
        true,
      ),
    );
  }

  // Issued proposal
  if (proposal.status === 'issued') {
    recs.push(
      makeRec(
        'Request client acceptance',
        'Issued proposal can be accepted, rejected or revised by the client.',
        'high',
        'Send acceptance request',
        true,
      ),
    );
  }

  // Accepted
  if (proposal.status === 'accepted') {
    recs.push(
      makeRec(
        'Convert to appointment',
        'Accepted proposal should be converted to a formal professional appointment and escrow milestones created.',
        'high',
        'Create appointment',
        true,
      ),
    );
  }

  // Top inbox item as a recommendation
  const topEvent = events[0];
  if (topEvent) {
    recs.push({
      id: `rec-${topEvent.id}`,
      scope: 'user',
      title: 'Handle proposal inbox item',
      rationale: topEvent.detail,
      priority: topEvent.priority,
      recommendedActionLabel: 'Open inbox item',
      relatedRoute: `/inbox/${topEvent.id}`,
      requiresHumanApproval: topEvent.type === 'approval_required' || topEvent.type === 'terms_review_required',
    });
  }

  // Sort by priority
  const priorityWeights: Record<AgentRecommendation['priority'], number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  return recs.sort((a, b) => priorityWeights[b.priority] - priorityWeights[a.priority]);
}
