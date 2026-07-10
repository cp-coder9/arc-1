/**
 * Feedback Loop — Type Definitions
 *
 * Core types and interfaces for the Intelligent Feedback Loop system.
 * Covers submission, clustering, status transitions, context capture,
 * friction detection, and AI processing results.
 *
 * @module feedbackTypes
 */

import type { UserRole } from '@/types';

// ─── Union Types ────────────────────────────────────────────────────────────────

/** Lifecycle status of a feedback submission or cluster. */
export type FeedbackStatus = 'received' | 'reviewing' | 'planned' | 'shipped' | 'declined';

/** User-selected or AI-assigned feedback category. */
export type FeedbackCategory = 'bug' | 'feature_request' | 'usability' | 'praise';

/** Sentiment label assigned by the Intelligence Engine. */
export type FeedbackSentiment = 'positive' | 'neutral' | 'negative' | 'frustrated';

/** Types of friction signals detected by the behavioural hook. */
export type FrictionSignalType = 'repeated_errors' | 'workflow_abandonment' | 'rage_clicks';

// ─── Context Snapshot ───────────────────────────────────────────────────────────

/** Metadata automatically captured at submission time. */
export interface ContextSnapshot {
  pagePath: string;
  activeModule: string;
  projectId: string | null;
  userRole: UserRole;
  viewportWidth: number;
  viewportHeight: number;
}

// ─── Feedback Submission ────────────────────────────────────────────────────────

/** A single feedback record persisted to Firestore. */
export interface FeedbackSubmission {
  id: string;
  userId: string;
  category: FeedbackCategory;
  description: string;
  contextSnapshot: ContextSnapshot;
  attachmentUrls: string[];
  status: FeedbackStatus;
  implicit: boolean;
  implicitMetadata?: {
    frictionType: string;
    targetIdentifier: string;
    signalCount: number;
  };
  clusterId: string | null;
  aiCategory: string | null;
  sentiment: FeedbackSentiment | null;
  categoryMismatch: boolean;
  createdAt: string;  // ISO-8601 UTC
  updatedAt: string;
  softDeleted: boolean;
}

// ─── Feedback Cluster ───────────────────────────────────────────────────────────

/** Status history entry recording a single transition. */
export interface StatusHistoryEntry {
  from: string;
  to: string;
  operatorId: string;
  actionDescription: string;
  declineReason?: string;
  releaseNoteUrl?: string;
  timestamp: string;
}

/** AI-generated feature brief for feature_request clusters. */
export interface FeatureBrief {
  problemStatement: string;
  affectedRoles: string[];
  suggestedScope: string;
  estimatedImpact: string;
  generatedAt: string;
}

/** Sentiment breakdown counts for a cluster. */
export interface SentimentBreakdown {
  positive: number;
  neutral: number;
  negative: number;
  frustrated: number;
}

/** A group of deduplicated feedback submissions. */
export interface FeedbackCluster {
  id: string;
  title: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  occurrenceCount: number;
  distinctUserCount: number;
  distinctUserIds: string[];
  severityScore: number;  // 1–10 integer
  sentimentBreakdown: SentimentBreakdown;
  averageSentiment: string;
  submissionIds: string[];
  aiCategoryMismatchCount: number;
  open: boolean;
  lastSubmissionAt: string;
  statusHistory: StatusHistoryEntry[];
  featureBrief?: FeatureBrief;
  createdAt: string;
  updatedAt: string;
}

// ─── Form Data ──────────────────────────────────────────────────────────────────

/** Client-side form state for explicit feedback submission. */
export interface FeedbackFormData {
  category: FeedbackCategory;
  description: string;
  attachments: File[];
}

// ─── Friction Signal ────────────────────────────────────────────────────────────

/** A detected friction event from the behavioural monitoring hook. */
export interface FrictionSignal {
  type: FrictionSignalType;
  pagePath: string;
  targetIdentifier: string;
  count: number;
  timestamp: string;
}

// ─── Processing Result ──────────────────────────────────────────────────────────

/** Result returned by the Intelligence Engine after processing a submission. */
export interface ProcessingResult {
  clusterId: string;
  isNewCluster: boolean;
  similarityScore: number;
  sentiment: FeedbackSentiment;
  aiCategory: string;
  categoryMismatch: boolean;
}

// ─── Status Transition State Machine ────────────────────────────────────────────

/**
 * Valid status transitions map.
 *
 * Each key is a current status and its value is the set of statuses
 * it may transition to. Terminal states (shipped, declined) have no
 * valid next states.
 *
 * Transition rules:
 *   received  → reviewing, declined
 *   reviewing → planned, declined
 *   planned   → shipped
 *   shipped   → (none)
 *   declined  → (none)
 */
export const VALID_STATUS_TRANSITIONS: Record<FeedbackStatus, readonly FeedbackStatus[]> = {
  received: ['reviewing', 'declined'],
  reviewing: ['planned', 'declined'],
  planned: ['shipped'],
  shipped: [],
  declined: [],
} as const;
