/**
 * Feedback Loop — Validation Utilities
 *
 * Validators for feedback submissions, attachments, status transitions,
 * and operator actions. Uses Zod schemas where appropriate following
 * the project pattern in `src/lib/schemas.ts`.
 *
 * @module feedbackValidation
 */

import { z } from 'zod';
import type {
  FeedbackStatus,
  FeedbackCategory,
  ContextSnapshot,
} from '@/services/feedbackTypes';
import { VALID_STATUS_TRANSITIONS } from '@/services/feedbackTypes';

// ─── Result Type ────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const VALID_CATEGORIES: readonly FeedbackCategory[] = ['bug', 'feature_request', 'usability', 'praise'];
const ALLOWED_ATTACHMENT_TYPES = ['image/png', 'image/jpeg'] as const;
const MAX_ATTACHMENT_SIZE = 5_242_880; // 5MB
const MAX_ATTACHMENTS = 3;
const MIN_DESCRIPTION_NON_WHITESPACE = 10;
const MAX_DESCRIPTION_TOTAL = 2000;
const MIN_ACTION_DESCRIPTION = 10;
const MIN_DECLINE_REASON = 20;
const MAX_DECLINE_REASON = 1000;

// ─── Validators ─────────────────────────────────────────────────────────────────

/**
 * Validates feedback description text.
 * Accepts iff ≥10 non-whitespace characters AND ≤2000 total characters.
 */
export function validateDescription(text: string): ValidationResult {
  if (text.length > MAX_DESCRIPTION_TOTAL) {
    return { valid: false, error: `Description must not exceed ${MAX_DESCRIPTION_TOTAL} characters (currently ${text.length})` };
  }
  const nonWhitespaceCount = text.replace(/\s/g, '').length;
  if (nonWhitespaceCount < MIN_DESCRIPTION_NON_WHITESPACE) {
    return { valid: false, error: `Description must contain at least ${MIN_DESCRIPTION_NON_WHITESPACE} non-whitespace characters (currently ${nonWhitespaceCount})` };
  }
  return { valid: true };
}

/**
 * Validates a feedback attachment file.
 * Accepts iff type is image/png or image/jpeg, size ≤5,242,880 bytes,
 * and currentCount < 3.
 */
export function validateAttachment(
  file: { type: string; size: number },
  currentCount: number
): ValidationResult {
  if (currentCount >= MAX_ATTACHMENTS) {
    return { valid: false, error: `Maximum of ${MAX_ATTACHMENTS} attachments allowed` };
  }
  if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type as typeof ALLOWED_ATTACHMENT_TYPES[number])) {
    return { valid: false, error: 'Attachment must be PNG or JPEG format' };
  }
  if (file.size > MAX_ATTACHMENT_SIZE) {
    return { valid: false, error: `Attachment must not exceed 5MB (file is ${(file.size / 1_048_576).toFixed(1)}MB)` };
  }
  return { valid: true };
}

/**
 * Validates a status transition using the VALID_STATUS_TRANSITIONS map.
 * Accepts iff the requested status is a valid next state for the current status.
 */
export function validateStatusTransition(
  current: FeedbackStatus,
  requested: FeedbackStatus
): ValidationResult {
  const allowed = VALID_STATUS_TRANSITIONS[current];
  if (!allowed || !allowed.includes(requested)) {
    return {
      valid: false,
      error: `Cannot transition from '${current}' to '${requested}'. Valid transitions: ${allowed?.length ? allowed.join(', ') : 'none (terminal state)'}`,
    };
  }
  return { valid: true };
}

/**
 * Validates operator action description text.
 * Accepts iff ≥10 characters.
 */
export function validateActionDescription(text: string): ValidationResult {
  if (text.length < MIN_ACTION_DESCRIPTION) {
    return { valid: false, error: `Action description must be at least ${MIN_ACTION_DESCRIPTION} characters (currently ${text.length})` };
  }
  return { valid: true };
}

/**
 * Validates operator decline reason text.
 * Accepts iff ≥20 characters and ≤1000 characters.
 */
export function validateDeclineReason(text: string): ValidationResult {
  if (text.length < MIN_DECLINE_REASON) {
    return { valid: false, error: `Decline reason must be at least ${MIN_DECLINE_REASON} characters (currently ${text.length})` };
  }
  if (text.length > MAX_DECLINE_REASON) {
    return { valid: false, error: `Decline reason must not exceed ${MAX_DECLINE_REASON} characters (currently ${text.length})` };
  }
  return { valid: true };
}

/**
 * Validates feedback category selection.
 * Accepts iff it's one of the 4 valid categories.
 */
export function validateCategory(category: string): ValidationResult {
  if (!VALID_CATEGORIES.includes(category as FeedbackCategory)) {
    return { valid: false, error: `Invalid category '${category}'. Must be one of: ${VALID_CATEGORIES.join(', ')}` };
  }
  return { valid: true };
}

// ─── Zod Schemas ────────────────────────────────────────────────────────────────

/** Zod enum for feedback categories. */
export const feedbackCategoryEnum = z.enum(['bug', 'feature_request', 'usability', 'praise']);

/** Zod enum for feedback status values. */
export const feedbackStatusEnum = z.enum(['received', 'reviewing', 'planned', 'shipped', 'declined']);

/** Zod enum for sentiment labels. */
export const feedbackSentimentEnum = z.enum(['positive', 'neutral', 'negative', 'frustrated']);

/** Zod schema for context snapshot captured at submission time. */
export const contextSnapshotSchema = z.object({
  pagePath: z.string().min(1, 'Page path is required'),
  activeModule: z.string().min(1, 'Active module is required'),
  projectId: z.string().nullable(),
  userRole: z.string().min(1, 'User role is required'),
  viewportWidth: z.number().int().positive('Viewport width must be positive'),
  viewportHeight: z.number().int().positive('Viewport height must be positive'),
});

/** Zod schema for feedback submission form data with full validation. */
export const feedbackSubmissionSchema = z.object({
  category: feedbackCategoryEnum,
  description: z.string()
    .max(MAX_DESCRIPTION_TOTAL, `Description must not exceed ${MAX_DESCRIPTION_TOTAL} characters`)
    .refine(
      (text) => text.replace(/\s/g, '').length >= MIN_DESCRIPTION_NON_WHITESPACE,
      { message: `Description must contain at least ${MIN_DESCRIPTION_NON_WHITESPACE} non-whitespace characters` }
    ),
  contextSnapshot: contextSnapshotSchema,
  attachmentUrls: z.array(z.string().url()).max(MAX_ATTACHMENTS, `Maximum of ${MAX_ATTACHMENTS} attachments allowed`).default([]),
});

// ─── Type Exports ───────────────────────────────────────────────────────────────

export type FeedbackSubmissionInput = z.infer<typeof feedbackSubmissionSchema>;
export type ContextSnapshotInput = z.infer<typeof contextSnapshotSchema>;
