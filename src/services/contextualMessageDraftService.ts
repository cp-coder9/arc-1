import type { WorkflowRecord } from '../types/agentOrchestration';
import type { ProjectRecord } from '../types/architexMasterTypes';

interface MessageDraft {
  draftId: string;
  projectId: string;
  recipientRole: string;
  subject: string;
  body: string;
  sourceRecordId: string;
  status: 'draft' | 'reviewed' | 'sent' | 'cancelled';
  requiresHumanApproval: boolean;
  createdAt: string;
}

let seq = 1;

export function createContextualMessageDraft(params: {
  title: string;
  status: string;
  payload?: Record<string, unknown>;
  blockers?: string[];
  approvalsRequired?: string[];
}): WorkflowRecord {
  return {
    id: `contextualMessageDraft-${seq++}`,
    type: 'contextualMessageDraft',
    title: params.title,
    status: params.status,
    payload: params.payload ?? {},
    blockers: params.blockers ?? [],
    approvalsRequired: params.approvalsRequired ?? [],
  };
}

export function generateMessageDraft(
  projectId: string,
  record: ProjectRecord,
  recipientRole: string,
): MessageDraft {
  const subject = `Action required: ${record.title}`;
  const body = buildContextualBody(record);

  return {
    draftId: `draft-${seq++}`,
    projectId,
    recipientRole,
    subject,
    body,
    sourceRecordId: record.id,
    status: 'draft',
    requiresHumanApproval: record.approval.status !== 'approved',
    createdAt: new Date().toISOString(),
  };
}

export function approveDraft(draftId: string, drafts: MessageDraft[]): MessageDraft | undefined {
  const draft = drafts.find((d) => d.draftId === draftId);
  if (!draft) return undefined;
  draft.status = 'reviewed';
  return draft;
}

export function sendDraft(draftId: string, drafts: MessageDraft[]): MessageDraft | undefined {
  const draft = drafts.find((d) => d.draftId === draftId);
  if (!draft) return undefined;
  draft.status = 'sent';
  return draft;
}

function buildContextualBody(record: ProjectRecord): string {
  const sections: string[] = [];

  sections.push(`Record: ${record.title}`);
  sections.push(`Type: ${record.recordType}`);
  sections.push(`Status: ${record.status}`);
  sections.push(`Phase: ${record.phase}`);

  if (record.approval.status === 'pending_review') {
    sections.push('This record requires your review and approval.');
  } else if (record.approval.status === 'rejected') {
    sections.push('This record was rejected. Please review the reason and resubmit.');
  }

  if (record.audit.createdByUserId) {
    sections.push(`Created by: ${record.audit.createdByUserId}`);
  }

  return sections.join('\n');
}
