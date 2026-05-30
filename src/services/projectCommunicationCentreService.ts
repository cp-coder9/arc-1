import type { Job, Message, ProjectCommunicationCaptureType, ProjectCommunicationStructuredStatus, ProjectCommunicationVisibility, ProjectStage } from '../types';
import { buildAiCommunicationSuggestion } from './aiCommunicationService';
import { getPhaseCommunicationConfig, type ProjectCommunicationConversionRoute } from './phaseCommunicationConfig';

export interface ProjectCommunicationCentreFilters {
  phase?: ProjectStage | 'all';
  captureType?: ProjectCommunicationCaptureType | 'all';
  search?: string;
}

export interface ProjectCommunicationCentreInput {
  jobs: Job[];
  messages: Message[];
  selectedJobId?: string;
  filters?: ProjectCommunicationCentreFilters;
}

export interface ProjectCommunicationThreadCard {
  id: string;
  jobId: string;
  projectId?: string;
  jobTitle: string;
  phase: ProjectStage;
  captureType: ProjectCommunicationCaptureType;
  structuredStatus: ProjectCommunicationStructuredStatus;
  visibility: ProjectCommunicationVisibility;
  senderId: string;
  senderRole: string;
  content: string;
  createdAt: string;
  attachmentCount: number;
  linkedRecordCount: number;
  actionCount: number;
  aiTags: string[];
  suggestedConversionRoutes: ProjectCommunicationConversionRoute[];
  requiresHumanApproval: boolean;
  aiSummary?: string;
  legacyFallback: boolean;
  unread: boolean;
}

export interface ProjectCommunicationCentreSummary {
  totalMessages: number;
  unreadMessages: number;
  unconvertedMessages: number;
  linkedMessages: number;
  attachmentMessages: number;
  humanApprovalQueue: number;
}

export interface ProjectCommunicationCentreModel {
  selectedJob?: Job;
  threadCards: ProjectCommunicationThreadCard[];
  summary: ProjectCommunicationCentreSummary;
  filters: ProjectCommunicationCentreFilters;
}

function timestampMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime() || 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value && 'toDate' in value && typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'object' && value && 'seconds' in value && typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function fallbackPhase(message: Message): ProjectStage {
  return message.phase ?? 'intake';
}

function fallbackCaptureType(message: Message): ProjectCommunicationCaptureType {
  return message.captureType ?? 'chat';
}

function fallbackStructuredStatus(message: Message): ProjectCommunicationStructuredStatus {
  return message.structuredStatus ?? 'raw';
}

function fallbackVisibility(message: Message): ProjectCommunicationVisibility {
  return message.visibility ?? 'job_participants';
}

function shouldRequireHumanApproval(message: Message, phase: ProjectStage, captureType: ProjectCommunicationCaptureType, structuredStatus: ProjectCommunicationStructuredStatus) {
  if (structuredStatus !== 'raw') return false;
  if (captureType === 'approval_request' || captureType === 'site_instruction') return true;
  const content = message.content.toLowerCase();
  return phase === 'delivery' && (captureType === 'site_photo' || content.includes('inspect') || content.includes('instruction'));
}

function toCard(message: Message, job?: Job): ProjectCommunicationThreadCard {
  const phase = fallbackPhase(message);
  const captureType = fallbackCaptureType(message);
  const structuredStatus = fallbackStructuredStatus(message);
  const visibility = fallbackVisibility(message);
  const legacyFallback = !message.projectId || !message.phase || !message.captureType || !message.structuredStatus;
  const config = getPhaseCommunicationConfig(phase);
  const requiresHumanApproval = shouldRequireHumanApproval(message, phase, captureType, structuredStatus);
  const aiSuggestion = requiresHumanApproval ? buildAiCommunicationSuggestion({
    projectId: message.projectId,
    jobId: message.jobId,
    threadId: message.jobId,
    messageId: message.id,
    phase,
    captureType,
    content: message.content,
    senderRole: message.senderRole,
  }) : undefined;

  return {
    id: message.id,
    jobId: message.jobId,
    projectId: message.projectId,
    jobTitle: job?.title ?? message.jobId,
    phase,
    captureType,
    structuredStatus,
    visibility,
    senderId: message.senderId,
    senderRole: message.senderRole,
    content: message.content,
    createdAt: message.createdAt,
    attachmentCount: message.attachments?.length ?? 0,
    linkedRecordCount: message.recordLinks?.length ?? 0,
    actionCount: message.actionIds?.length ?? 0,
    aiTags: [...new Set([...(message.aiTags ?? []), ...(aiSuggestion?.aiTags ?? [])])],
    suggestedConversionRoutes: aiSuggestion?.suggestedRecordLinks.map(link => link.recordType as ProjectCommunicationConversionRoute) ?? config.conversionRoutes.slice(0, 2),
    requiresHumanApproval,
    aiSummary: aiSuggestion?.summary,
    legacyFallback,
    unread: !message.isRead,
  };
}

function matchesFilters(card: ProjectCommunicationThreadCard, filters: ProjectCommunicationCentreFilters) {
  if (filters.phase && filters.phase !== 'all' && card.phase !== filters.phase) return false;
  if (filters.captureType && filters.captureType !== 'all' && card.captureType !== filters.captureType) return false;
  const search = filters.search?.trim().toLowerCase();
  if (search && !`${card.jobTitle} ${card.content} ${card.senderRole} ${card.phase} ${card.captureType}`.toLowerCase().includes(search)) return false;
  return true;
}

export function buildProjectCommunicationCentreModel(input: ProjectCommunicationCentreInput): ProjectCommunicationCentreModel {
  const filters = input.filters ?? {};
  const selectedJob = input.jobs.find(job => job.id === input.selectedJobId) ?? (input.selectedJobId ? undefined : input.jobs[0]);
  const jobsById = new Map(input.jobs.map(job => [job.id, job]));
  const allCards = input.messages
    .map(message => toCard(message, jobsById.get(message.jobId)))
    .sort((a, b) => timestampMs(b.createdAt) - timestampMs(a.createdAt));
  const visibleCards = selectedJob ? allCards.filter(card => card.jobId === selectedJob.id) : allCards;
  const threadCards = visibleCards.filter(card => matchesFilters(card, filters));

  return {
    selectedJob,
    threadCards,
    filters,
    summary: {
      totalMessages: input.messages.length,
      unreadMessages: input.messages.filter(message => !message.isRead).length,
      unconvertedMessages: input.messages.filter(message => fallbackStructuredStatus(message) === 'raw').length,
      linkedMessages: input.messages.filter(message => fallbackStructuredStatus(message) === 'linked' || (message.recordLinks?.length ?? 0) > 0).length,
      attachmentMessages: input.messages.filter(message => (message.attachments?.length ?? 0) > 0).length,
      humanApprovalQueue: allCards.filter(card => card.requiresHumanApproval).length,
    },
  };
}
