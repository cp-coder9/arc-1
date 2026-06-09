/**
 * Proposal Integration Outputs — Pack 4
 *
 * Generates ProjectRecord outputs, document output placeholders,
 * inbox workflow events, and agent recommendations from proposal data.
 */
import type { ProposalBuilderResult, ProposalStatus, ProposalPartyRole, ProposalTermsSnapshot } from '../types/proposalBuilder';

export type ProjectRecordType = 'proposal' | 'scope_baseline' | 'fee_calculation_snapshot' | 'terms_snapshot' | 'professional_appointment_draft';

export interface ProjectRecordApproval { required: boolean; pendingRoles?: ProposalPartyRole[]; approvedBy?: string[]; }
export interface ProjectRecordAudit { createdBy: string; createdAt: string; supersedesRecordId?: string; }

export interface ProjectRecord {
  id: string; tenantId: string; projectId: string; phase: string;
  moduleKey: 'toolboxes' | 'proposal_builder'; recordType: ProjectRecordType;
  title: string; status: 'draft' | 'pending_review' | 'issued' | 'superseded';
  payload: Record<string, unknown>; approvals: ProjectRecordApproval;
  audit: ProjectRecordAudit; linkedRecordIds: string[];
}

export interface ProposalContext {
  proposalId: string; tenantId: string; projectId: string;
  professionalName: string; professionalRole: ProposalPartyRole; clientName?: string;
}

export function projectRecordsFromProposal(proposal: ProposalBuilderResult, context: ProposalContext): ProjectRecord[] {
  const base = { tenantId: context.tenantId, projectId: context.projectId, phase: 'appointment', moduleKey: 'proposal_builder' as const, audit: { createdBy: context.professionalRole, createdAt: new Date().toISOString() }, linkedRecordIds: [] as string[] };
  const isIssued = proposal.status === 'issued' || proposal.status === 'accepted' || proposal.status === 'converted_to_appointment';
  return [
    { ...base, id: `pr-${context.proposalId}-proposal`, recordType: 'proposal' as ProjectRecordType, title: `Proposal: ${context.professionalName}`, status: isIssued ? 'issued' : 'draft', payload: { proposalId: context.proposalId, title: proposal.title, totalExVat: proposal.feeAfterDiscountExVat, vatAmount: proposal.vatAmount, totalIncVat: proposal.feeAfterDiscountIncVat, platformFee: proposal.platformFee, clientPaysIntoEscrow: proposal.clientAmountPayableIntoEscrow, status: proposal.status }, approvals: { required: !isIssued, pendingRoles: ['client'] } },
    { ...base, id: `pr-${context.proposalId}-scope`, recordType: 'scope_baseline' as ProjectRecordType, title: 'Scope baseline from proposal', status: isIssued ? 'issued' : 'draft', payload: { proposalId: context.proposalId, scopeSummary: (proposal.auditSnapshot as any)?.scopeSummary || 'Fee estimate from proposal.', calculatorId: proposal.auditSnapshot?.calculatorId }, approvals: { required: true, pendingRoles: ['client'] } },
    { ...base, id: `pr-${context.proposalId}-fee`, recordType: 'fee_calculation_snapshot' as ProjectRecordType, title: 'Fee calculation snapshot', status: isIssued ? 'issued' : 'draft', payload: { proposalId: context.proposalId, calculatorId: proposal.auditSnapshot?.calculatorId, feeBeforeDiscount: proposal.feeBeforeDiscountExVat, discountAmount: proposal.discountAmount, feeAfterDiscount: proposal.feeAfterDiscountExVat, vatAmount: proposal.vatAmount, platformFee: proposal.platformFee, discount: (proposal.auditSnapshot as any)?.discount || null }, approvals: { required: false } },
    { ...base, id: `pr-${context.proposalId}-terms`, recordType: 'terms_snapshot' as ProjectRecordType, title: 'Terms snapshot', status: isIssued ? 'issued' : 'draft', payload: { proposalId: context.proposalId, terms: proposal.terms || null, termsTemplateId: proposal.auditSnapshot?.termsTemplateId || null }, approvals: { required: !!proposal.terms, pendingRoles: proposal.terms ? [context.professionalRole, 'client'] as ProposalPartyRole[] : undefined } },
    { ...base, id: `pr-${context.proposalId}-appointment-draft`, recordType: 'professional_appointment_draft' as ProjectRecordType, title: 'Appointment draft from accepted proposal', status: 'draft', payload: { proposalId: context.proposalId, clientName: context.clientName || 'Client', professionalName: context.professionalName, professionalRole: context.professionalRole, feeSchedule: { totalIncVat: proposal.feeAfterDiscountIncVat, platformFee: proposal.platformFee } }, approvals: { required: true, pendingRoles: ['client', context.professionalRole] } },
  ];
}

export interface DocumentOutput {
  documentId: string; projectId: string; title: string;
  documentType: 'proposal_pdf' | 'proposal_revision' | 'terms_snapshot' | 'appointment_letter';
  status: 'draft' | 'issued' | 'superseded'; revision: string;
  linkedProposalId: string; createdAt: string; placeholderNote: string;
}

export function documentOutputFromProposal(
  proposal: ProposalBuilderResult, proposalId: string, projectId: string, professionalName: string, supersedesProposalId?: string,
): DocumentOutput {
  const revision = supersedesProposalId ? 'B' : 'A';
  const isTerminal = ['accepted', 'rejected', 'withdrawn'].includes(proposal.status);
  return { documentId: `doc-${proposalId}`, projectId, title: `Proposal - ${professionalName}`, documentType: 'proposal_pdf', status: isTerminal ? 'issued' : proposal.status === 'issued' ? 'issued' : 'draft', revision: `rev ${revision}`, linkedProposalId: proposalId, createdAt: new Date().toISOString(), placeholderNote: 'PDF generation is excluded from Pack 4 scope. This placeholder reserves the document register entry for later PDF population via the document engine.' };
}

export type WorkflowEventType = 'approval_required' | 'document_updated' | 'task_overdue' | 'risk_detected' | 'proposal_ready_for_review' | 'proposal_issued' | 'proposal_accepted' | 'proposal_expiring' | 'terms_review_required';
export type WorkflowEventPriority = 'low' | 'medium' | 'high' | 'critical';

export interface WorkflowEvent {
  id: string; type: WorkflowEventType; projectId: string; title: string; detail: string;
  priority: WorkflowEventPriority; sourceModule: 'toolboxes' | 'proposal_builder';
  assignedRoles: ProposalPartyRole[]; createdAt: string; actionUrl?: string;
}

export function workflowEventsFromProposal(
  proposal: ProposalBuilderResult, proposalId: string, projectId: string, professionalRole: ProposalPartyRole,
): WorkflowEvent[] {
  const events: WorkflowEvent[] = []; const now = new Date().toISOString();
  const makeEvent = (type: WorkflowEventType, title: string, detail: string, priority: WorkflowEventPriority, roles: ProposalPartyRole[]): WorkflowEvent => ({ id: `evt-${proposalId}-${type}`, type, projectId, title, detail, priority, sourceModule: 'proposal_builder', assignedRoles: roles, createdAt: now, actionUrl: `/projects/${projectId}/proposals/${proposalId}` });

  const audit = proposal.auditSnapshot as any;
  if (audit?.discount && typeof audit.discount === 'object' && audit.discount.percentage && !audit.discount.reason) {
    events.push(makeEvent('risk_detected', 'Discount reason missing', 'A discount was applied without a recorded reason.', 'high', [professionalRole, 'admin' as ProposalPartyRole]));
  }
  if (proposal.status === 'terms_attached' || proposal.status === 'calculator_completed') {
    events.push(makeEvent('terms_review_required', 'Terms review required', 'Terms and conditions must be reviewed before issue.', 'medium', [professionalRole]));
  }
  if (proposal.status === 'professional_approved') {
    events.push(makeEvent('proposal_ready_for_review', 'Proposal ready for professional review', 'Awaiting final professional sign-off before issuing.', 'high', [professionalRole]));
  }
  if (proposal.status === 'issued') {
    events.push(makeEvent('proposal_issued', 'Proposal issued to client', 'Awaiting client review and acceptance.', 'high', ['client']));
    events.push(makeEvent('proposal_accepted', 'Awaiting client acceptance', 'Client acceptance is required.', 'high', ['client']));
  }
  if (proposal.terms?.validityPeriodDays && audit?.createdAt && proposal.status === 'issued') {
    const issuedAt = new Date(audit.createdAt as string);
    const expiryDate = new Date(issuedAt); expiryDate.setDate(expiryDate.getDate() + proposal.terms.validityPeriodDays);
    const daysRemaining = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysRemaining <= 3 && daysRemaining > 0) {
      events.push(makeEvent('proposal_expiring', `Proposal expiring in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`, `Expires on ${expiryDate.toLocaleDateString('en-ZA')}.`, daysRemaining <= 1 ? 'critical' : 'medium', ['client', professionalRole]));
    } else if (daysRemaining <= 0) {
      events.push(makeEvent('proposal_expiring', 'Proposal has expired', `Expired on ${expiryDate.toLocaleDateString('en-ZA')}.`, 'high', [professionalRole, 'client']));
    }
  }
  if (proposal.status === 'accepted') {
    events.push(makeEvent('proposal_accepted', 'Proposal accepted — create appointment', 'Convert to professional appointment and set up escrow milestones.', 'high', ['admin' as ProposalPartyRole, professionalRole]));
  }
  return events;
}

export interface AgentRecommendation {
  id: string; scope: 'user' | 'project'; title: string; rationale: string;
  priority: WorkflowEventPriority; recommendedActionLabel: string;
  relatedRoute: string; requiresHumanApproval: boolean;
}

export function recommendationsFromProposal(
  proposal: ProposalBuilderResult, proposalId: string, projectId: string,
  events: WorkflowEvent[], professionalRole: ProposalPartyRole,
): AgentRecommendation[] {
  const recs: AgentRecommendation[] = [];
  const makeRec = (title: string, rationale: string, priority: AgentRecommendation['priority'], label: string, needsApproval: boolean, scope: 'user' | 'project' = 'project'): AgentRecommendation => ({ id: `rec-${proposalId}-${title.toLowerCase().replace(/\s+/g, '-')}`, scope, title, rationale, priority, recommendedActionLabel: label, relatedRoute: `/projects/${projectId}/toolboxes/proposals/${proposalId}`, requiresHumanApproval: needsApproval });

  const audit = proposal.auditSnapshot as any;
  if (!audit?.scopeSummary) recs.push(makeRec('Complete scope before issue', 'A proposal should not be issued without documented scope.', 'high', 'Add scope', true));
  if (audit?.discount && typeof audit.discount === 'object' && audit.discount.percentage && !audit.discount.reason) recs.push(makeRec('Record discount reason', 'Discount requires recorded rationale.', 'high', 'Add discount reason', true));
  if (proposal.status === 'calculator_completed') recs.push(makeRec('Attach terms and conditions', 'Terms must be attached before approval.', 'high', 'Attach terms', true));
  if (proposal.status === 'terms_attached') recs.push(makeRec('Professional approval required', 'Professional must review and approve before issuing.', 'high', 'Approve proposal', true));
  if (proposal.status === 'issued') recs.push(makeRec('Request client acceptance', 'Issued proposal can be accepted, rejected or revised.', 'high', 'Send acceptance request', true));
  if (proposal.status === 'accepted') recs.push(makeRec('Convert to appointment', 'Accepted proposal should be converted to appointment.', 'high', 'Create appointment', true));
  const topEvent = events[0];
  if (topEvent) recs.push({ id: `rec-${topEvent.id}`, scope: 'user', title: 'Handle proposal inbox item', rationale: topEvent.detail, priority: topEvent.priority, recommendedActionLabel: 'Open inbox item', relatedRoute: `/inbox/${topEvent.id}`, requiresHumanApproval: topEvent.type === 'approval_required' || topEvent.type === 'terms_review_required' });

  const weights: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  return recs.sort((a, b) => weights[b.priority] - weights[a.priority]);
}
