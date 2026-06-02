import type { ProjectStage, UserRole } from '../types';

export type ProjectThreadType = 'client_professional' | 'project_team' | 'package' | 'admin_observer';
export type NotificationTriggerType = 'message_sent' | 'mention' | 'approval_requested' | 'document_status_changed' | 'payment_action_required';
export type ProjectMessageCaptureType = 'chat' | 'voice_note' | 'document_upload' | 'drawing_comment' | 'approval_request' | 'site_photo' | 'site_voice_note' | 'rfi' | 'site_instruction' | 'payment_note' | 'closeout_evidence';
export type ProjectMessageStructuredStatus = 'raw' | 'converted' | 'linked' | 'archived';
export type ProjectMessageVisibility = 'job_participants' | 'project_team' | 'client_professional' | 'admin_only';

export interface ProjectRecordLink {
  recordType: string;
  recordId: string;
}

export interface ProjectMessageLocation {
  latitude: number;
  longitude: number;
  label?: string;
}

export interface ProjectThreadInput {
  projectId?: string;
  jobId: string;
  createdBy: string;
  participantIds: string[];
  participantRoles?: Partial<Record<string, UserRole | string>>;
  type?: ProjectThreadType;
  subject?: string;
}

export interface ProjectThreadRecord extends ProjectThreadInput {
  projectId?: string;
  type: ProjectThreadType;
  participantIds: string[];
  archived: false;
  auditVisible: true;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMessageInput {
  threadId: string;
  jobId: string;
  projectId?: string;
  phase?: ProjectStage;
  captureType?: ProjectMessageCaptureType;
  structuredStatus?: ProjectMessageStructuredStatus;
  actionIds?: string[];
  recordLinks?: ProjectRecordLink[];
  aiTags?: string[];
  transcribedText?: string;
  visibility?: ProjectMessageVisibility;
  location?: ProjectMessageLocation;
  senderId: string;
  senderRole: UserRole;
  participantIds: string[];
  content: string;
  attachments?: Array<{ name: string; url: string; type?: string }>;
  mentions?: string[];
}

export interface ProjectMessageRecord extends ProjectMessageInput {
  content: string;
  attachments: Array<{ name: string; url: string; type?: string }>;
  mentions: string[];
  auditVisible: true;
  createdAt: string;
  notificationTriggers: NotificationTrigger[];
}

export interface NotificationTrigger {
  type: NotificationTriggerType;
  recipientId: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw Object.assign(new Error(`${field} is required`), { status: 400 });
  return value.trim();
}

function uniqueStrings(values: unknown, field: string): string[] {
  if (!Array.isArray(values)) throw Object.assign(new Error(`${field} must be an array`), { status: 400 });
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map(value => value.trim()))];
}

function cleanContent(value: string): string {
  return value.replace(/<script[^>]*>.*?<\/script>/gis, '').trim();
}

export function buildProjectThread(input: ProjectThreadInput): ProjectThreadRecord {
  const participantIds = uniqueStrings(input.participantIds, 'participantIds');
  const createdBy = requireString(input.createdBy, 'createdBy');
  if (!participantIds.includes(createdBy)) throw Object.assign(new Error('Thread creator must be a participant'), { status: 403 });
  if (participantIds.length < 2 && input.type !== 'admin_observer') throw Object.assign(new Error('A project thread requires at least two participants'), { status: 400 });
  const now = new Date().toISOString();
  return {
    ...input,
    jobId: requireString(input.jobId, 'jobId'),
    projectId: input.projectId?.trim(),
    createdBy,
    participantIds,
    participantRoles: { ...(input.participantRoles || {}) },
    type: input.type || 'client_professional',
    subject: input.subject?.trim(),
    archived: false,
    auditVisible: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildProjectMessage(input: ProjectMessageInput): ProjectMessageRecord {
  const participantIds = uniqueStrings(input.participantIds, 'participantIds');
  const senderId = requireString(input.senderId, 'senderId');
  if (!participantIds.includes(senderId)) throw Object.assign(new Error('Only thread participants can send project messages'), { status: 403 });
  const content = cleanContent(requireString(input.content, 'content'));
  if (!content) throw Object.assign(new Error('Message content cannot be empty'), { status: 400 });
  const mentions = uniqueStrings(input.mentions || [], 'mentions').filter(id => participantIds.includes(id) && id !== senderId);
  const now = new Date().toISOString();
  const baseData = { threadId: requireString(input.threadId, 'threadId'), jobId: requireString(input.jobId, 'jobId'), senderId };
  const notificationTriggers: NotificationTrigger[] = participantIds
    .filter(id => id !== senderId)
    .map(recipientId => ({
      type: mentions.includes(recipientId) ? 'mention' : 'message_sent',
      recipientId,
      title: mentions.includes(recipientId) ? 'You were mentioned' : 'New project message',
      body: content.slice(0, 160),
      data: baseData,
    }));

  return {
    ...input,
    threadId: baseData.threadId,
    jobId: baseData.jobId,
    senderId,
    content,
    attachments: (input.attachments || []).map(attachment => ({ ...attachment, name: requireString(attachment.name, 'attachment.name'), url: requireString(attachment.url, 'attachment.url') })),
    projectId: input.projectId?.trim(),
    phase: input.phase,
    captureType: input.captureType || 'chat',
    structuredStatus: input.structuredStatus || 'raw',
    actionIds: uniqueStrings(input.actionIds || [], 'actionIds'),
    recordLinks: (input.recordLinks || []).map(link => ({ recordType: requireString(link.recordType, 'recordLink.recordType'), recordId: requireString(link.recordId, 'recordLink.recordId') })),
    aiTags: uniqueStrings(input.aiTags || [], 'aiTags'),
    transcribedText: input.transcribedText?.trim(),
    visibility: input.visibility || 'job_participants',
    location: input.location ? { ...input.location } : undefined,
    mentions,
    participantIds,
    auditVisible: true,
    createdAt: now,
    notificationTriggers,
  };
}

export function buildCommunicationAuditInput(input: { actorId: string; action: string; threadId: string; jobId: string; projectId?: string; messageId?: string }) {
  return {
    actorId: requireString(input.actorId, 'actorId'),
    action: requireString(input.action, 'action'),
    resourceType: 'project_message_thread',
    resourceId: requireString(input.threadId, 'threadId'),
    projectId: input.projectId,
    jobId: requireString(input.jobId, 'jobId'),
    metadata: {
      messageId: input.messageId,
      auditVisible: true,
    },
  };
}
