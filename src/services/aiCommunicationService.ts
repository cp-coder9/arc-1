import type { ProjectStage, UserRole } from '../types';
import type { ProjectMessageCaptureType } from './communicationWorkflowService';
import { getPhaseCommunicationConfig } from './phaseCommunicationConfig';

export type AiCommunicationUrgency = 'low' | 'medium' | 'high';
export type AiSuggestionConfidence = 'low' | 'medium' | 'high';
export type AiCommunicationActionType = 'inspection_required' | 'human_approval_required' | 'link_record' | 'summarise_thread';

export interface AiCommunicationSuggestionInput {
  projectId?: string;
  jobId: string;
  threadId: string;
  messageId: string;
  phase: ProjectStage;
  captureType: ProjectMessageCaptureType;
  content: string;
  senderRole: UserRole;
}

export interface AiSuggestedRecordLink {
  recordType: string;
  confidence: AiSuggestionConfidence;
}

export interface AiSuggestedAction {
  type: AiCommunicationActionType;
  label: string;
  approvalRequired: true;
}

export interface AiCommunicationSuggestion {
  projectId?: string;
  jobId: string;
  threadId: string;
  messageId: string;
  phase: ProjectStage;
  captureType: ProjectMessageCaptureType;
  senderRole: UserRole;
  summary: string;
  urgency: AiCommunicationUrgency;
  structuredStatus: 'draft_suggestion';
  requiresHumanApproval: true;
  mayIssueFormalOutput: false;
  aiTags: string[];
  suggestedRecordLinks: AiSuggestedRecordLink[];
  suggestedActions: AiSuggestedAction[];
  auditNote: string;
}

function normalizeContent(content: string): string {
  return content.trim().replace(/\s+/g, ' ');
}

function summarize(content: string): string {
  const normalized = normalizeContent(content);
  return normalized.length <= 180 ? normalized : `${normalized.slice(0, 177)}...`;
}

function urgencyFor(input: AiCommunicationSuggestionInput): AiCommunicationUrgency {
  const content = input.content.toLowerCase();
  if (input.captureType === 'approval_request' || content.includes('inspect') || content.includes('submit') || content.includes('tomorrow') || content.includes('urgent')) return 'high';
  if (input.captureType === 'rfi' || input.captureType === 'site_instruction' || input.captureType === 'document_upload') return 'medium';
  return 'low';
}

function confidenceForRecord(stage: ProjectStage, captureType: ProjectMessageCaptureType, recordType: string): AiSuggestionConfidence {
  if ((stage === 'delivery' && captureType === 'site_photo' && recordType === 'site_log') || (stage === 'delivery' && captureType === 'rfi' && recordType === 'rfi')) return 'high';
  if (stage === 'compliance' && captureType === 'approval_request' && recordType === 'municipal_submission') return 'medium';
  return 'medium';
}

function suggestedRecordLinks(input: AiCommunicationSuggestionInput): AiSuggestedRecordLink[] {
  const config = getPhaseCommunicationConfig(input.phase);
  const preferredRoutes = config.conversionRoutes.filter(route => {
    if (input.phase === 'delivery' && input.captureType === 'site_photo') return ['site_log', 'snag_item'].includes(route);
    if (input.phase === 'compliance' && input.captureType === 'approval_request') return ['municipal_submission', 'compliance_issue'].includes(route);
    if (input.captureType === 'rfi') return route === 'rfi';
    return true;
  });

  return preferredRoutes.slice(0, 2).map(recordType => ({
    recordType,
    confidence: confidenceForRecord(input.phase, input.captureType, recordType),
  }));
}

function suggestedActions(input: AiCommunicationSuggestionInput): AiSuggestedAction[] {
  if (input.phase === 'delivery' && input.content.toLowerCase().includes('inspect')) {
    return [{ type: 'inspection_required', label: 'Request human inspection before proceeding', approvalRequired: true }];
  }

  if (input.captureType === 'approval_request' || input.content.toLowerCase().includes('submit')) {
    return [{ type: 'human_approval_required', label: 'Human approval required before any formal output or submission', approvalRequired: true }];
  }

  return [{ type: 'summarise_thread', label: 'Review and approve the suggested communication summary', approvalRequired: true }];
}

function aiTags(input: AiCommunicationSuggestionInput): string[] {
  const tags = new Set<string>([input.phase, input.captureType.replace('_', '-')]);
  if (input.captureType === 'approval_request') tags.add('approval-request');
  if (input.phase === 'delivery') tags.add('site-evidence');
  if (input.phase === 'compliance') tags.add('compliance');
  return [...tags];
}

export function buildAiCommunicationSuggestion(input: AiCommunicationSuggestionInput): AiCommunicationSuggestion {
  const summary = summarize(input.content);
  return {
    projectId: input.projectId?.trim(),
    jobId: input.jobId.trim(),
    threadId: input.threadId.trim(),
    messageId: input.messageId.trim(),
    phase: input.phase,
    captureType: input.captureType,
    senderRole: input.senderRole,
    summary,
    urgency: urgencyFor(input),
    structuredStatus: 'draft_suggestion',
    requiresHumanApproval: true,
    mayIssueFormalOutput: false,
    aiTags: aiTags(input),
    suggestedRecordLinks: suggestedRecordLinks(input),
    suggestedActions: suggestedActions(input),
    auditNote: 'AI suggestion only: human approval is required before formal issue, approval, instruction, or municipal submission workflows.',
  };
}
