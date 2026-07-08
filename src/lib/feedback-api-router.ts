/**
 * Feedback Loop — API Routes
 *
 * Endpoints for the Intelligent Feedback Loop system: submission,
 * retrieval, cluster management, status transitions, rate limiting,
 * and POPIA-compliant data deletion.
 *
 * Mounted at `/api/feedback` in the main API router.
 */
import express from 'express';
import type { Request, Response } from 'express';

import { requireAuth, requireAdmin } from '../lib/roleMiddleware';
import { feedbackSubmissionSchema } from '../services/feedbackValidation';
import {
  submitFeedback,
  getUserSubmissions,
  getClusterList,
  getClusterDetail,
  checkRateLimit,
  softDeleteUserData,
  transitionClusterStatus,
} from '../services/feedbackService';
import type { ClusterFilters } from '../services/feedbackService';
import type { FeedbackCategory, FeedbackStatus } from '../services/feedbackTypes';
import {
  surfaceOperatorAction,
  createPendingReviewInboxItem,
} from '../services/feedbackAuditService';
import { shouldTriggerPendingReview } from '../services/feedbackEscalation';

const router = express.Router();

// All feedback routes require authentication.
router.use(requireAuth);

// ---------------------------------------------------------------------------
// POST /submit — Any authenticated user. Submit feedback (explicit or implicit).
// ---------------------------------------------------------------------------

router.post('/submit', async (req: Request, res: Response) => {
  try {
    const uid = req.authContext!.uid;

    // Check rate limit first (only for explicit submissions)
    const isImplicit = req.body.implicit === true;
    if (!isImplicit) {
      const rateStatus = await checkRateLimit(uid);
      if (!rateStatus.allowed) {
        return res.status(429).json({
          error: 'Rate limit exceeded. Maximum 10 submissions per 24-hour window.',
          remaining: rateStatus.remaining,
          resetsAt: rateStatus.resetsAt,
        });
      }
    }

    // Validate input using Zod schema
    const parsed = feedbackSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const submission = await submitFeedback(
      parsed.data,
      uid,
      isImplicit,
      isImplicit ? req.body.implicitMetadata : undefined,
    );

    return res.status(201).json(submission);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to submit feedback' });
  }
});

// ---------------------------------------------------------------------------
// GET /submissions — Self or platform_admin. List user's submissions.
// ---------------------------------------------------------------------------

router.get('/submissions', async (req: Request, res: Response) => {
  try {
    const uid = req.authContext!.uid;
    const submissions = await getUserSubmissions(uid);
    return res.json({ submissions });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to retrieve submissions' });
  }
});

// ---------------------------------------------------------------------------
// GET /clusters — platform_admin only. List clusters with filtering/pagination.
// Also triggers pending review inbox items for stale clusters (fire-and-forget).
// ---------------------------------------------------------------------------

router.get('/clusters', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { category, status, dateFrom, dateTo, page } = req.query;

    const filters: ClusterFilters = {};
    if (category) filters.category = category as FeedbackCategory;
    if (status) filters.status = status as FeedbackStatus;
    if (dateFrom) filters.dateFrom = dateFrom as string;
    if (dateTo) filters.dateTo = dateTo as string;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);

    const result = await getClusterList(filters, pageNum);

    // Check for stale clusters and create pending review inbox items (fire-and-forget)
    const now = new Date();
    for (const cluster of result.clusters) {
      if (shouldTriggerPendingReview(cluster.status, cluster.updatedAt, now)) {
        createPendingReviewInboxItem(cluster).catch(() => { /* non-blocking */ });
      }
    }

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to retrieve clusters' });
  }
});

// ---------------------------------------------------------------------------
// GET /clusters/:id — platform_admin only. Get cluster detail with submissions.
// ---------------------------------------------------------------------------

router.get('/clusters/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);

    const result = await getClusterDetail(id, page);
    return res.json(result);
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || 'Failed to retrieve cluster detail' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /clusters/:id/status — platform_admin only. Transition cluster status.
// ---------------------------------------------------------------------------

router.patch('/clusters/:id/status', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newStatus, actionDescription, declineReason, releaseNoteUrl } = req.body;
    const operatorId = req.authContext!.uid;

    if (!newStatus) {
      return res.status(400).json({ error: 'newStatus is required' });
    }
    if (!actionDescription) {
      return res.status(400).json({ error: 'actionDescription is required' });
    }

    const updatedCluster = await transitionClusterStatus(
      id,
      newStatus as FeedbackStatus,
      operatorId,
      actionDescription,
      { declineReason, releaseNoteUrl },
    );

    // Surface operator status change action in Action Centre activity log (fire-and-forget)
    surfaceOperatorAction(
      operatorId,
      `Status changed to "${newStatus}" — ${actionDescription}`,
      id,
    ).catch(() => { /* non-blocking, logged internally */ });

    return res.json(updatedCluster);
  } catch (err: any) {
    // Validation errors from the service layer (invalid transition, short description, etc.)
    if (
      err.message?.includes('Cannot transition') ||
      err.message?.includes('must be at least') ||
      err.message?.includes('must not exceed') ||
      err.message?.includes('required when')
    ) {
      return res.status(400).json({ error: err.message });
    }
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || 'Failed to transition cluster status' });
  }
});

// ---------------------------------------------------------------------------
// POST /clusters/:id/brief — platform_admin only. Generate AI feature brief.
// ---------------------------------------------------------------------------

router.post('/clusters/:id/brief', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const operatorId = req.authContext!.uid;

    // Surface brief generation action in Action Centre activity log (fire-and-forget)
    surfaceOperatorAction(
      operatorId,
      'Generated AI feature brief',
      id,
    ).catch(() => { /* non-blocking, logged internally */ });

    return res.status(501).json({
      error: 'Not Implemented',
      message: 'AI feature brief generation will be available in a future update.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to generate brief' });
  }
});

// ---------------------------------------------------------------------------
// GET /rate-limit — Any authenticated. Check remaining submissions.
// ---------------------------------------------------------------------------

router.get('/rate-limit', async (req: Request, res: Response) => {
  try {
    const uid = req.authContext!.uid;
    const rateStatus = await checkRateLimit(uid);
    return res.json({
      remaining: rateStatus.remaining,
      resetsAt: rateStatus.resetsAt,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to check rate limit' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /submissions/my-data — Self only. Soft-delete all user data (POPIA).
// ---------------------------------------------------------------------------

router.delete('/submissions/my-data', async (req: Request, res: Response) => {
  try {
    const uid = req.authContext!.uid;
    await softDeleteUserData(uid);
    return res.status(204).send();
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to delete user data' });
  }
});

export default router;
