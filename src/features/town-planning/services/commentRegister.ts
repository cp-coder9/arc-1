/**
 * Comment & Objection Register Service
 *
 * Manages public comments and objections during the advertising/comment period
 * of a land use application. Supports registration, status tracking, response
 * capture, late submission detection, and summary aggregation.
 *
 * Uses DI pattern consistent with other town-planning services.
 */

import { z } from 'zod';
import type { UserRole } from '@/types';
import type { Comment, CommentType, CommentStatus } from '../types';
import type { FirestoreDB } from './municipalityConfig';

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const CommentTypeEnum = z.enum(['support', 'neutral', 'objection']);

export const CommentInputSchema = z.object({
  type: CommentTypeEnum,
  submitterName: z.string().min(1, 'Submitter name is required'),
  submitterContact: z.string().min(1, 'Submitter contact is required'),
  content: z.string().min(1, 'Comment content is required'),
  dateReceived: z.string().min(1, 'Date received is required'),
});

export type CommentInput = z.infer<typeof CommentInputSchema>;

export const CommentResponseInputSchema = z.object({
  response: z.string().min(1, 'Response content is required'),
});

export type CommentResponseInput = z.infer<typeof CommentResponseInputSchema>;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CommentActor {
  id: string;
  role: UserRole;
}

export interface CommentAuditEntry {
  action: 'comment_registered' | 'comment_status_updated' | 'comment_response_added';
  actorId: string;
  actorRole: UserRole;
  timestamp: string;
  projectId: string;
  applicationId: string;
  commentId: string;
  details: Record<string, unknown>;
}

export type CommentAuditFn = (entry: CommentAuditEntry) => Promise<void>;

export interface ActionCentreAlert {
  type: 'unreviewed_objections';
  applicationId: string;
  projectId: string;
  title: string;
  description: string;
  severity: 'high' | 'critical';
  timestamp: string;
}

export type ActionCentreFn = (alert: ActionCentreAlert) => Promise<void>;

export interface CommentDeps {
  db: FirestoreDB;
  auditFn: CommentAuditFn;
}

export interface CommentsSummary {
  totalSupports: number;
  totalNeutral: number;
  totalObjections: number;
  totalAddressed: number;
}

export type CommentRecord = Comment;

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── Status Transitions ──────────────────────────────────────────────────────

/**
 * Permitted comment status transitions:
 * received → reviewed → response_prepared → addressed
 */
export const COMMENT_STATUS_TRANSITIONS: Record<CommentStatus, CommentStatus[]> = {
  received: ['reviewed'],
  reviewed: ['response_prepared'],
  response_prepared: ['addressed'],
  addressed: [],
};

// ─── Helper: Collection Path ─────────────────────────────────────────────────

function commentsPath(projectId: string, applicationId: string): string {
  return `projects/${projectId}/townPlanning/applications/${applicationId}/comments`;
}

// ─── Service Implementation ──────────────────────────────────────────────────

/**
 * Registers a new comment/objection.
 *
 * - Validates input with CommentInputSchema
 * - Detects late submission (dateReceived > advertisingEndDate)
 * - Persists to Firestore
 * - Creates audit record
 */
export async function registerComment(
  applicationId: string,
  projectId: string,
  input: unknown,
  advertisingEndDate: string,
  actor: CommentActor,
  deps: CommentDeps
): Promise<ServiceResult<CommentRecord>> {
  const { db, auditFn } = deps;

  // Validate input
  const parsed = CommentInputSchema.safeParse(input);
  if (!parsed.success) {
    const messages = parsed.error.errors.map((e) => e.message).join(', ');
    return { success: false, error: `Validation failed: ${messages}` };
  }

  const validInput = parsed.data;
  const now = new Date().toISOString();

  // Detect late submission
  const isLateSubmission = validInput.dateReceived > advertisingEndDate;

  const commentData: Omit<Comment, 'id'> = {
    applicationId,
    type: validInput.type,
    status: 'received',
    submitterName: validInput.submitterName,
    submitterContact: validInput.submitterContact,
    content: validInput.content,
    dateReceived: validInput.dateReceived,
    isLateSubmission,
    createdAt: now,
    updatedAt: now,
  };

  // Persist to Firestore
  const path = commentsPath(projectId, applicationId);
  const docRef = await db.collection(path).add(commentData as unknown as Record<string, unknown>);

  const comment: CommentRecord = {
    id: docRef.id,
    ...commentData,
  };

  // Create audit record
  await auditFn({
    action: 'comment_registered',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    projectId,
    applicationId,
    commentId: docRef.id,
    details: {
      type: validInput.type,
      submitterName: validInput.submitterName,
      isLateSubmission,
    },
  });

  return { success: true, data: comment };
}

/**
 * Updates a comment's status following the state machine.
 *
 * Validates that the transition is permitted:
 * received → reviewed → response_prepared → addressed
 */
export async function updateCommentStatus(
  commentId: string,
  applicationId: string,
  projectId: string,
  newStatus: CommentStatus,
  actor: CommentActor,
  deps: CommentDeps
): Promise<ServiceResult<CommentRecord>> {
  const { db, auditFn } = deps;

  // Fetch existing comment
  const path = commentsPath(projectId, applicationId);
  const docSnap = await db.collection(path).doc(commentId).get();

  if (!docSnap.exists) {
    return { success: false, error: `Comment '${commentId}' not found` };
  }

  const data = docSnap.data();
  if (!data) {
    return { success: false, error: `Comment '${commentId}' has no data` };
  }

  const currentStatus = data.status as CommentStatus;

  // Validate transition
  const permitted = COMMENT_STATUS_TRANSITIONS[currentStatus] ?? [];
  if (!permitted.includes(newStatus)) {
    return {
      success: false,
      error: `Invalid status transition: '${currentStatus}' → '${newStatus}'. Permitted: ${permitted.join(', ') || 'none'}`,
    };
  }

  const now = new Date().toISOString();

  // Update in Firestore
  await db.collection(path).doc(commentId).update({
    status: newStatus,
    updatedAt: now,
  });

  // Create audit record
  await auditFn({
    action: 'comment_status_updated',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    projectId,
    applicationId,
    commentId,
    details: {
      previousStatus: currentStatus,
      newStatus,
    },
  });

  const updatedComment: CommentRecord = {
    id: commentId,
    ...(data as unknown as Omit<Comment, 'id'>),
    status: newStatus,
    updatedAt: now,
  };

  return { success: true, data: updatedComment };
}

/**
 * Adds a response to a comment and sets status to 'response_prepared'.
 *
 * - Validates response input with CommentResponseInputSchema
 * - Updates comment with response text, date, and responder
 * - Transitions status to 'response_prepared'
 */
export async function addResponse(
  commentId: string,
  applicationId: string,
  projectId: string,
  responseInput: unknown,
  actor: CommentActor,
  deps: CommentDeps
): Promise<ServiceResult<CommentRecord>> {
  const { db, auditFn } = deps;

  // Validate response input
  const parsed = CommentResponseInputSchema.safeParse(responseInput);
  if (!parsed.success) {
    const messages = parsed.error.errors.map((e) => e.message).join(', ');
    return { success: false, error: `Validation failed: ${messages}` };
  }

  const validResponse = parsed.data;

  // Fetch existing comment
  const path = commentsPath(projectId, applicationId);
  const docSnap = await db.collection(path).doc(commentId).get();

  if (!docSnap.exists) {
    return { success: false, error: `Comment '${commentId}' not found` };
  }

  const data = docSnap.data();
  if (!data) {
    return { success: false, error: `Comment '${commentId}' has no data` };
  }

  const currentStatus = data.status as CommentStatus;

  // Only allow adding response from 'reviewed' status
  if (currentStatus !== 'reviewed') {
    return {
      success: false,
      error: `Cannot add response when status is '${currentStatus}'. Comment must be in 'reviewed' status.`,
    };
  }

  const now = new Date().toISOString();

  // Update comment with response
  await db.collection(path).doc(commentId).update({
    response: validResponse.response,
    responseDate: now,
    respondedBy: actor.id,
    status: 'response_prepared',
    updatedAt: now,
  });

  // Create audit record
  await auditFn({
    action: 'comment_response_added',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    projectId,
    applicationId,
    commentId,
    details: {
      previousStatus: currentStatus,
      newStatus: 'response_prepared',
    },
  });

  const updatedComment: CommentRecord = {
    id: commentId,
    ...(data as unknown as Omit<Comment, 'id'>),
    response: validResponse.response,
    responseDate: now,
    respondedBy: actor.id,
    status: 'response_prepared' as CommentStatus,
    updatedAt: now,
  };

  return { success: true, data: updatedComment };
}

/**
 * Returns a summary of comments for an application.
 */
export async function getCommentsSummary(
  applicationId: string,
  projectId: string,
  db: FirestoreDB
): Promise<CommentsSummary> {
  const path = commentsPath(projectId, applicationId);
  const snapshot = await db.collection(path).get();

  const summary: CommentsSummary = {
    totalSupports: 0,
    totalNeutral: 0,
    totalObjections: 0,
    totalAddressed: 0,
  };

  if (snapshot.empty) {
    return summary;
  }

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data) continue;

    const type = data.type as CommentType;
    const status = data.status as CommentStatus;

    switch (type) {
      case 'support':
        summary.totalSupports++;
        break;
      case 'neutral':
        summary.totalNeutral++;
        break;
      case 'objection':
        summary.totalObjections++;
        break;
    }

    if (status === 'addressed') {
      summary.totalAddressed++;
    }
  }

  return summary;
}

/**
 * Checks for unreviewed objections after the comment period has expired.
 * If found, surfaces an Action Centre alert.
 *
 * @param advertisingEndDate - The end date of the advertising/comment period
 * @param today - Optional current date for testing (defaults to now)
 */
export async function checkUnreviewedObjections(
  applicationId: string,
  projectId: string,
  advertisingEndDate: string,
  db: FirestoreDB,
  actionCentreFn: ActionCentreFn,
  today?: string
): Promise<{ hasUnreviewed: boolean; count: number }> {
  const currentDate = today ?? new Date().toISOString().split('T')[0];

  // Only check if comment period has expired
  if (currentDate <= advertisingEndDate) {
    return { hasUnreviewed: false, count: 0 };
  }

  const path = commentsPath(projectId, applicationId);
  const snapshot = await db.collection(path).get();

  if (snapshot.empty) {
    return { hasUnreviewed: false, count: 0 };
  }

  // Count unreviewed objections (status = 'received' and type = 'objection')
  let unreviewedCount = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data) continue;

    if (data.type === 'objection' && data.status === 'received') {
      unreviewedCount++;
    }
  }

  if (unreviewedCount > 0) {
    await actionCentreFn({
      type: 'unreviewed_objections',
      applicationId,
      projectId,
      title: 'Unreviewed Objections Require Attention',
      description: `${unreviewedCount} objection(s) remain unreviewed after the comment period has expired.`,
      severity: 'high',
      timestamp: new Date().toISOString(),
    });
  }

  return { hasUnreviewed: unreviewedCount > 0, count: unreviewedCount };
}
