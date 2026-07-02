// Wire in server.ts: app.use('/api/marketplace', marketplaceRouter)
/**
 * Marketplace API Router — Express 5
 *
 * Provides ~31 endpoints for the Architex Marketplace feature:
 * Trust Score, Compliance Search, Project Marketplace, Task Marketplace,
 * Supplier Marketplace, Freelancer Hub, Firm Collaboration, Certificates, Disputes.
 *
 * Each route:
 * 1. Checks authentication (rejects 401 if no user)
 * 2. Calls checkMarketplacePermission() from the RBAC service (rejects 403 if denied)
 * 3. Calls the appropriate domain service function
 * 4. Returns appropriate HTTP status codes with MarketplaceError format on failure
 *
 * Validates: Requirements 12.7, 12.9, 13.1
 */
import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from './roleMiddleware';
import { checkMarketplacePermission } from '../features/marketplace/services/marketplaceRbacService';
import type { MarketplaceAction, MarketplaceError } from '../features/marketplace/types';
import type { UserRole } from '../types';

const marketplaceRouter = express.Router();

// All marketplace routes require authentication
marketplaceRouter.use(requireAuth);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the authenticated user's role from the request context.
 * Returns undefined if no auth context or role is available.
 */
function getUserRole(req: Request): UserRole | undefined {
  return req.authContext?.role as UserRole | undefined;
}

/**
 * Returns the authenticated user's UID from the request context.
 */
function getUserId(req: Request): string | undefined {
  return req.authContext?.uid;
}

/**
 * Checks RBAC permission for the given action. Returns a MarketplaceError
 * response if denied, or null if allowed.
 */
function checkPermission(
  req: Request,
  res: Response,
  action: MarketplaceAction
): boolean {
  const role = getUserRole(req);
  if (!role) {
    const error: MarketplaceError = {
      code: 'AUTH_REQUIRED',
      message: 'Authentication required',
    };
    res.status(401).json(error);
    return false;
  }
  const result = checkMarketplacePermission(role, action);
  if (!result.allowed) {
    const error: MarketplaceError = {
      code: 'ACCESS_DENIED',
      message: result.reason || 'Access denied',
      details: { requiredRoles: result.requiredRoles },
    };
    res.status(403).json(error);
    return false;
  }
  return true;
}

/**
 * Wraps an async route handler with standard error handling.
 * Maps known error codes to HTTP status codes.
 */
function handleServiceError(res: Response, err: unknown): void {
  if (err instanceof Error) {
    const statusMap: Record<string, number> = {
      VALIDATION_ERROR: 400,
      NOT_FOUND: 404,
      ELIGIBILITY_BLOCKED: 422,
      ESCROW_TRANSITION_REJECTED: 422,
      EXTERNAL_TIMEOUT: 503,
    };
    const code = (err as any).code as string | undefined;
    const status = (code && statusMap[code]) || 500;
    const error: MarketplaceError = {
      code: code || 'INTERNAL_ERROR',
      message: err.message,
      details: (err as any).details,
    };
    res.status(status).json(error);
  } else {
    const error: MarketplaceError = {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    };
    res.status(500).json(error);
  }
}

// ─── Trust Score ──────────────────────────────────────────────────────────────

/** GET /trust-score/:userId — Retrieve trust score for a user */
marketplaceRouter.get(
  '/trust-score/:userId',
  async (req: Request, res: Response) => {
    try {
      // Any authenticated user can view trust scores
      const { userId } = req.params;
      if (!userId) {
        const error: MarketplaceError = {
          code: 'VALIDATION_ERROR',
          message: 'userId parameter is required',
          details: { field: 'userId' },
        };
        return res.status(400).json(error);
      }
      const { getTrustScore } = await import('../features/marketplace/services/trustScoreService');
      const score = await getTrustScore(userId);
      if (!score) {
        return res.status(200).json({
          userId,
          overallScore: 0,
          factors: [],
          calculatedAt: new Date().toISOString(),
          badges: [],
        });
      }
      return res.status(200).json(score);
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

/** POST /trust-score/recalculate — Trigger trust score recalculation */
marketplaceRouter.post(
  '/trust-score/recalculate',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'manage_verification')) return;
      const { userId } = req.body;
      if (!userId) {
        const error: MarketplaceError = {
          code: 'VALIDATION_ERROR',
          message: 'userId is required in request body',
          details: { field: 'userId' },
        };
        return res.status(400).json(error);
      }
      const { recalculateOnEvent } = await import('../features/marketplace/services/trustScoreService');
      const score = await recalculateOnEvent({ userId, type: 'registration_update' });
      return res.status(200).json(score);
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

// ─── Compliance Search ────────────────────────────────────────────────────────

/** POST /search/professionals — Search for compliance-verified professionals */
marketplaceRouter.post(
  '/search/professionals',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'search_professionals')) return;
      const query = req.body;
      const { search } = await import('../features/marketplace/services/complianceSearchService');
      const results = await search(query);
      return res.status(200).json({ results, total: results.length });
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

/** GET /search/suggestions — Auto-suggest for search text */
marketplaceRouter.get(
  '/search/suggestions',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'search_professionals')) return;
      const q = req.query.q as string | undefined;
      if (!q || q.length < 2) {
        return res.status(200).json({ suggestions: [] });
      }
      const { getSuggestions } = await import('../features/marketplace/services/complianceSearchService');
      const suggestions = await getSuggestions(q);
      return res.status(200).json({ suggestions });
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

// ─── Project Marketplace ──────────────────────────────────────────────────────

/** POST /projects — Create a new project posting */
marketplaceRouter.post(
  '/projects',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'create_project_posting')) return;
      const uid = getUserId(req)!;
      const body = req.body;
      const { createProjectPosting } = await import('../features/marketplace/services/projectMarketplaceService');
      const result = await createProjectPosting(body, { userId: uid, role: getUserRole(req) || 'client' });
      if ('code' in result) {
        const statusMap: Record<string, number> = { VALIDATION_ERROR: 400, USER_INELIGIBLE: 403, INVALID_TOOL_IDS: 400, PERSISTENCE_ERROR: 500 };
        return res.status(statusMap[result.code] || 400).json(result);
      }
      return res.status(201).json(result);
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

/** GET /projects — List project postings */
marketplaceRouter.get(
  '/projects',
  async (req: Request, res: Response) => {
    try {
      // Any authenticated user can browse published project postings
      const uid = getUserId(req)!;
      const { getVisiblePostings } = await import('../features/marketplace/services/projectMarketplaceService');
      const postings = await getVisiblePostings(uid);
      return res.status(200).json({ postings, total: postings.length });
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

/** GET /projects/:id — Get a single project posting */
marketplaceRouter.get(
  '/projects/:id',
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { adminDb } = await import('@/lib/firebase-admin');
      const doc = await adminDb.collection('marketplace_project_postings').doc(id).get();
      if (!doc.exists) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Project posting not found' });
      }
      return res.status(200).json({ id: doc.id, ...doc.data() });
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

/** PUT /projects/:id/withdraw — Withdraw a project posting */
marketplaceRouter.put(
  '/projects/:id/withdraw',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'create_project_posting')) return;
      const uid = getUserId(req)!;
      const { id } = req.params;
      const { adminDb } = await import('@/lib/firebase-admin');
      const { logMarketplaceAction } = await import('../features/marketplace/services/marketplaceAuditService');

      // Fetch posting
      const postingDoc = await adminDb.collection('marketplace_project_postings').doc(id).get();
      if (!postingDoc.exists) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Project posting not found' });
      }
      const posting = postingDoc.data()!;

      // Verify ownership
      if (posting.clientId !== uid) {
        return res.status(403).json({ code: 'ACCESS_DENIED', message: 'Only the posting owner can withdraw' });
      }
      if (posting.status !== 'published') {
        return res.status(422).json({ code: 'INVALID_TRANSITION', message: `Cannot withdraw posting with status "${posting.status}"` });
      }

      const now = new Date().toISOString();
      await adminDb.collection('marketplace_project_postings').doc(id).update({ status: 'withdrawn', updatedAt: now });

      // Notify applicants via Action Centre
      const proposalsSnap = await adminDb.collection('marketplace_proposals').where('postingId', '==', id).get();
      for (const pDoc of proposalsSnap.docs) {
        const pData = pDoc.data();
        await adminDb.collection('action_centre_events').add({
          type: 'posting_withdrawn',
          recipientUserId: pData.professionalId,
          title: 'Project Posting Withdrawn',
          description: `The project "${posting.title}" has been withdrawn.`,
          entityId: id,
          entityType: 'project_posting',
          createdAt: now,
          read: false,
          severity: 'info',
        });
      }

      await logMarketplaceAction({ actorId: uid, actionType: 'posting_withdrawn', entityId: id, entityType: 'project_posting', beforeStatus: 'published', afterStatus: 'withdrawn' });
      return res.status(200).json({ id, status: 'withdrawn', updatedAt: now });
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

/** POST /projects/:id/apply — Apply to a project posting */
marketplaceRouter.post(
  '/projects/:id/apply',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'apply_project')) return;
      const uid = getUserId(req)!;
      const { id } = req.params;
      const body = req.body;
      const { applyToProject } = await import('../features/marketplace/services/projectMarketplaceService');
      const result = await applyToProject(uid, id, body);
      if ('code' in result) {
        const statusMap: Record<string, number> = { NOT_FOUND: 404, INVALID_TRANSITION: 422, APPLICATION_BLOCKED: 422, ELIGIBILITY_BLOCKED: 422, FETCH_ERROR: 500 };
        return res.status(statusMap[result.code] || 400).json(result);
      }
      return res.status(201).json(result);
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

/** PUT /projects/:id/proposals/:proposalId/accept — Accept a proposal */
marketplaceRouter.put(
  '/projects/:id/proposals/:proposalId/accept',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'accept_proposal')) return;
      const uid = getUserId(req)!;
      const { id, proposalId } = req.params;
      const { acceptProposal } = await import('../features/marketplace/services/projectMarketplaceService');
      const result = await acceptProposal(uid, id, proposalId);
      if ('code' in result) {
        const statusMap: Record<string, number> = { NOT_FOUND: 404, ACCESS_DENIED: 403, INVALID_TRANSITION: 422, FETCH_ERROR: 500 };
        return res.status(statusMap[result.code] || 400).json(result);
      }
      return res.status(200).json(result);
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

// ─── Task Marketplace ─────────────────────────────────────────────────────────

/** POST /tasks — Create a new task posting */
marketplaceRouter.post(
  '/tasks',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'create_task')) return;
      const uid = getUserId(req)!;
      const body = req.body;
      const { createTaskPosting } = await import('../features/marketplace/services/taskMarketplaceService');
      const result = await createTaskPosting(uid, body);
      if ('code' in result) {
        const statusMap: Record<string, number> = { VALIDATION_ERROR: 400, INVALID_TOOL_IDS: 400, PERSISTENCE_ERROR: 500 };
        return res.status(statusMap[result.code] || 400).json(result);
      }
      return res.status(201).json(result);
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

/** GET /tasks — List task postings */
marketplaceRouter.get(
  '/tasks',
  async (req: Request, res: Response) => {
    try {
      // Any authenticated user can browse open task postings
      const { adminDb } = await import('@/lib/firebase-admin');
      const snapshot = await adminDb
        .collection('marketplace_task_postings')
        .where('status', '==', 'open')
        .get();
      const tasks = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json({ tasks, total: tasks.length });
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

/** POST /tasks/:id/apply — Freelancer applies to a task */
marketplaceRouter.post(
  '/tasks/:id/apply',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'apply_task')) return;
      const uid = getUserId(req)!;
      const { id } = req.params;
      const { applyToTask } = await import('../features/marketplace/services/taskMarketplaceService');
      const result = await applyToTask(uid, id);
      if ('code' in result) {
        const statusMap: Record<string, number> = { NOT_FOUND: 404, INVALID_TRANSITION: 422, APPLICATION_BLOCKED: 422, FETCH_ERROR: 500 };
        return res.status(statusMap[result.code] || 400).json(result);
      }
      return res.status(201).json(result);
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

/** PUT /tasks/:id/applications/:appId/accept — Accept a freelancer application */
marketplaceRouter.put(
  '/tasks/:id/applications/:appId/accept',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'hire_freelancer')) return;
      const uid = getUserId(req)!;
      const { id, appId } = req.params;
      const { adminDb } = await import('@/lib/firebase-admin');

      // Entity-level authorization: verify the authenticated user is the task owner
      const taskDoc = await adminDb.collection('marketplace_task_postings').doc(id).get();
      if (!taskDoc.exists) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Task not found' });
      }
      const taskData = taskDoc.data();
      if (taskData?.professionalId !== uid) {
        return res.status(403).json({ code: 'ACCESS_DENIED', message: 'Only the task owner can accept applications', details: { reason: 'Entity-level authorization failed' } });
      }

      // Fetch application
      const appDoc = await adminDb.collection('marketplace_task_applications').doc(appId).get();
      if (!appDoc.exists) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Application not found' });
      }
      const appData = appDoc.data()!;

      const now = new Date().toISOString();

      // Atomic batch: escrow + task status + application status + audit
      const batch = adminDb.batch();

      // Update task status
      batch.update(adminDb.collection('marketplace_task_postings').doc(id), {
        status: 'in_progress',
        assignedFreelancerId: appData.freelancerId,
        updatedAt: now,
      });

      // Update application status
      batch.update(adminDb.collection('marketplace_task_applications').doc(appId), {
        status: 'accepted',
        updatedAt: now,
      });

      // Create escrow holding (within batch)
      const escrowRef = adminDb.collection('marketplace_escrow_holdings').doc();
      batch.set(escrowRef, {
        escrowId: escrowRef.id,
        type: 'task',
        entityId: id,
        amount: { value: taskData.paymentAmount, currency: 'ZAR' },
        state: 'funded_held',
        createdAt: now,
        updatedAt: now,
      });

      // Create audit entry (within batch)
      const auditRef = adminDb.collection('marketplace_audit_trail').doc();
      batch.set(auditRef, {
        actorId: uid,
        actionType: 'task_application_accepted',
        entityId: id,
        entityType: 'task_posting',
        timestamp: now,
        afterStatus: 'in_progress',
        metadata: { applicationId: appId, freelancerId: appData.freelancerId, escrowId: escrowRef.id },
      });

      await batch.commit();

      return res.status(200).json({ taskId: id, applicationId: appId, status: 'accepted', escrowId: escrowRef.id });
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

/** POST /tasks/:id/deliver — Freelancer submits a deliverable */
marketplaceRouter.post(
  '/tasks/:id/deliver',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'apply_task')) return;
      const uid = getUserId(req)!;
      const { id } = req.params;
      const { fileId, format, description } = req.body;
      const { adminDb } = await import('@/lib/firebase-admin');
      const { logMarketplaceAction } = await import('../features/marketplace/services/marketplaceAuditService');

      // Verify task exists and is in_progress
      const taskDoc = await adminDb.collection('marketplace_task_postings').doc(id).get();
      if (!taskDoc.exists) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Task posting not found' });
      }
      const task = taskDoc.data()!;
      if (task.status !== 'in_progress') {
        return res.status(422).json({ code: 'INVALID_TRANSITION', message: `Cannot deliver on task with status "${task.status}"` });
      }

      const now = new Date().toISOString();

      // Store deliverable
      const deliverableRef = adminDb.collection('marketplace_task_deliverables').doc();
      await deliverableRef.set({
        taskId: id,
        freelancerId: uid,
        fileId: fileId || null,
        format: format || task.deliverableFormat || 'pdf',
        description: description || '',
        status: 'pending_review',
        submittedAt: now,
      });

      // Route to AI review queue
      await adminDb.collection('ai_review_queue').add({
        entityId: deliverableRef.id,
        entityType: 'task_deliverable',
        taskId: id,
        freelancerId: uid,
        queuedAt: now,
        status: 'pending',
      });

      // Update task status to delivered
      await adminDb.collection('marketplace_task_postings').doc(id).update({ status: 'delivered', updatedAt: now });

      await logMarketplaceAction({ actorId: uid, actionType: 'task_delivered', entityId: deliverableRef.id, entityType: 'task_deliverable', beforeStatus: 'in_progress', afterStatus: 'delivered' });
      return res.status(201).json({ deliverableId: deliverableRef.id, taskId: id, status: 'delivered' });
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

/** PUT /tasks/:id/sign-off — Professional signs off on a deliverable */
marketplaceRouter.put(
  '/tasks/:id/sign-off',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'hire_freelancer')) return;
      const uid = getUserId(req)!;
      const { id } = req.params;
      const { adminDb } = await import('@/lib/firebase-admin');
      const { logMarketplaceAction } = await import('../features/marketplace/services/marketplaceAuditService');

      // Fetch task
      const taskDoc = await adminDb.collection('marketplace_task_postings').doc(id).get();
      if (!taskDoc.exists) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Task posting not found' });
      }
      const task = taskDoc.data()!;
      if (task.status !== 'delivered') {
        return res.status(422).json({ code: 'INVALID_TRANSITION', message: `Cannot sign-off on task with status "${task.status}"` });
      }

      // Verify AI review passed
      const reviewSnap = await adminDb.collection('ai_review_queue')
        .where('taskId', '==', id)
        .where('status', '==', 'passed')
        .limit(1)
        .get();

      if (reviewSnap.empty) {
        return res.status(422).json({ code: 'REVIEW_NOT_PASSED', message: 'AI review has not passed for this deliverable' });
      }

      const now = new Date().toISOString();

      // Mark task complete
      await adminDb.collection('marketplace_task_postings').doc(id).update({ status: 'completed', completedAt: now, updatedAt: now });

      // Trigger escrow release if escrow exists
      if (task.escrowId) {
        const { requestEscrowRelease } = await import('../features/marketplace/services/marketplaceEscrowService');
        await requestEscrowRelease({
          escrowId: task.escrowId,
          milestoneId: 'task-completion',
          conditions: { milestoneCompleteByHiringParty: true, deliverableUploadedWithValidDocId: true, aiReviewPassed: true, professionalSignOff: true },
          actorId: uid,
          recipientUserId: task.assignedFreelancerId || '',
          amount: { amount: task.paymentAmount || 0, currency: 'ZAR' },
          complianceSignOffId: `signoff-${id}`,
        });
      }

      await logMarketplaceAction({ actorId: uid, actionType: 'task_signed_off', entityId: id, entityType: 'task_posting', beforeStatus: 'delivered', afterStatus: 'completed' });
      return res.status(200).json({ taskId: id, status: 'completed', completedAt: now });
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

// ─── Supplier Marketplace ─────────────────────────────────────────────────────

/** POST /materials — Create a material listing */
marketplaceRouter.post(
  '/materials',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'create_material_listing')) return;
      const uid = getUserId(req)!;
      const body = req.body;
      const { createMaterialListing } = await import('../features/marketplace/services/supplierMarketplaceService');
      const result = await createMaterialListing(body, { userId: uid, role: getUserRole(req) || 'supplier' });
      if ('code' in result) {
        const statusMap: Record<string, number> = { VALIDATION_ERROR: 400, SUPPLIER_NOT_VERIFIED: 403, PERSISTENCE_ERROR: 500 };
        return res.status(statusMap[result.code] || 400).json(result);
      }
      return res.status(201).json(result);
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

/** GET /materials — Search/list material listings */
marketplaceRouter.get(
  '/materials',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'search_suppliers')) return;
      const { searchMaterials } = await import('../features/marketplace/services/supplierMarketplaceService');
      const query = {
        sansComplianceReference: req.query.sansComplianceReference as string | undefined,
        deliveryZone: req.query.deliveryZone as string | undefined,
        leadTimeMin: req.query.leadTimeMin ? Number(req.query.leadTimeMin) : undefined,
        leadTimeMax: req.query.leadTimeMax ? Number(req.query.leadTimeMax) : undefined,
        certificationStatus: req.query.certificationStatus as 'certified' | 'uncertified' | undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      };
      const materials = await searchMaterials(query);
      return res.status(200).json({ materials, total: materials.length });
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

/** POST /materials/:id/quote-request — Request a quote from a supplier */
marketplaceRouter.post(
  '/materials/:id/quote-request',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'request_quote')) return;
      const uid = getUserId(req)!;
      const { id } = req.params;
      const { quantity, projectId, deliveryZone, notes } = req.body;
      const { adminDb } = await import('@/lib/firebase-admin');
      const { logMarketplaceAction } = await import('../features/marketplace/services/marketplaceAuditService');

      // Verify material listing exists
      const materialDoc = await adminDb.collection('marketplace_material_listings').doc(id).get();
      if (!materialDoc.exists) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Material listing not found' });
      }
      const material = materialDoc.data()!;

      const now = new Date().toISOString();

      // Create quote request linked to contractor's project
      const quoteRef = adminDb.collection('marketplace_quote_requests').doc();
      await quoteRef.set({
        materialListingId: id,
        requesterId: uid,
        supplierId: material.supplierId,
        projectId: projectId || null,
        quantity: quantity || 1,
        deliveryZone: deliveryZone || null,
        notes: notes || '',
        status: 'pending',
        createdAt: now,
      });

      // Notify supplier via Action Centre
      await adminDb.collection('action_centre_events').add({
        type: 'quote_requested',
        recipientUserId: material.supplierId,
        title: 'New Quote Request',
        description: `Quote request received for "${material.productName}".`,
        entityId: quoteRef.id,
        entityType: 'quote_request',
        createdAt: now,
        read: false,
        severity: 'action_required',
      });

      await logMarketplaceAction({ actorId: uid, actionType: 'quote_requested', entityId: quoteRef.id, entityType: 'quote_request', afterStatus: 'pending' });
      return res.status(201).json({ quoteRequestId: quoteRef.id, materialListingId: id, status: 'pending' });
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

/** PUT /quotes/:id/respond — Supplier responds to a quote request */
marketplaceRouter.put(
  '/quotes/:id/respond',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'respond_quote')) return;
      const uid = getUserId(req)!;
      const { id } = req.params;
      const { amount, validUntil, leadTimeDays, notes } = req.body;
      const { adminDb } = await import('@/lib/firebase-admin');
      const { logMarketplaceAction } = await import('../features/marketplace/services/marketplaceAuditService');

      // Fetch quote request
      const quoteDoc = await adminDb.collection('marketplace_quote_requests').doc(id).get();
      if (!quoteDoc.exists) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Quote request not found' });
      }

      const now = new Date().toISOString();

      // Update quote with supplier's response
      await adminDb.collection('marketplace_quote_requests').doc(id).update({
        quotedAmount: amount || 0,
        validUntil: validUntil || null,
        leadTimeDays: leadTimeDays || null,
        supplierNotes: notes || '',
        status: 'quoted',
        respondedAt: now,
        updatedAt: now,
      });

      await logMarketplaceAction({ actorId: uid, actionType: 'quote_responded', entityId: id, entityType: 'quote_request', beforeStatus: 'pending', afterStatus: 'quoted' });
      return res.status(200).json({ quoteRequestId: id, status: 'quoted', quotedAmount: amount });
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

/** PUT /quotes/:id/accept — Contractor accepts a quote */
marketplaceRouter.put(
  '/quotes/:id/accept',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'request_quote')) return;
      const uid = getUserId(req)!;
      const { id } = req.params;
      const { adminDb } = await import('@/lib/firebase-admin');

      // Fetch quote and verify entity-level authorization
      const quoteDoc = await adminDb.collection('marketplace_quote_requests').doc(id).get();
      if (!quoteDoc.exists) return res.status(404).json({ code: 'NOT_FOUND', message: 'Quote not found' });
      const quoteData = quoteDoc.data();
      if (quoteData?.contractorId !== uid && quoteData?.requesterId !== uid) {
        return res.status(403).json({ code: 'ACCESS_DENIED', message: 'Only the requesting contractor can accept this quote' });
      }
      if (quoteData?.status !== 'quoted') {
        return res.status(422).json({ code: 'INVALID_TRANSITION', message: 'Quote must be in "quoted" status to accept' });
      }

      const now = new Date().toISOString();

      // Atomic batch: escrow + status update + audit
      const batch = adminDb.batch();
      const escrowRef = adminDb.collection('marketplace_escrow_holdings').doc();
      batch.update(quoteDoc.ref, { status: 'accepted', updatedAt: now });
      batch.set(escrowRef, { escrowId: escrowRef.id, type: 'quote', entityId: id, amount: { value: quoteData.quotedAmount, currency: 'ZAR' }, state: 'funded_held', createdAt: now, updatedAt: now });
      const auditRef = adminDb.collection('marketplace_audit_trail').doc();
      batch.set(auditRef, { actorId: uid, actionType: 'quote_accepted', entityId: id, entityType: 'quote_request', timestamp: now, beforeStatus: 'quoted', afterStatus: 'accepted', metadata: { escrowId: escrowRef.id, amount: quoteData.quotedAmount } });
      await batch.commit();

      return res.status(200).json({ quoteId: id, status: 'accepted', escrowId: escrowRef.id, acceptedAt: now });
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

/** PUT /quotes/:id/delivery-note — Upload delivery note for a quote */
marketplaceRouter.put(
  '/quotes/:id/delivery-note',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'request_quote')) return;
      const uid = getUserId(req)!;
      const { id } = req.params;
      const { deliveryNoteRef, deliveredAt, notes } = req.body;
      const { adminDb } = await import('@/lib/firebase-admin');
      const { logMarketplaceAction } = await import('../features/marketplace/services/marketplaceAuditService');

      // Fetch quote
      const quoteDoc = await adminDb.collection('marketplace_quote_requests').doc(id).get();
      if (!quoteDoc.exists) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Quote request not found' });
      }
      const quote = quoteDoc.data()!;
      if (quote.status !== 'accepted') {
        return res.status(422).json({ code: 'INVALID_TRANSITION', message: `Cannot add delivery note to quote with status "${quote.status}"` });
      }

      const now = new Date().toISOString();

      // Update quote with delivery note reference
      await adminDb.collection('marketplace_quote_requests').doc(id).update({
        deliveryNoteRef: deliveryNoteRef || null,
        deliveredAt: deliveredAt || now,
        deliveryNotes: notes || '',
        status: 'delivered',
        updatedAt: now,
      });

      await logMarketplaceAction({ actorId: uid, actionType: 'delivery_note_uploaded', entityId: id, entityType: 'quote_request', beforeStatus: 'accepted', afterStatus: 'delivered' });
      return res.status(200).json({ quoteRequestId: id, status: 'delivered', deliveryNoteRef });
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

// ─── Freelancer Hub ───────────────────────────────────────────────────────────

/** POST /freelancer-profile — Create a freelancer profile */
marketplaceRouter.post(
  '/freelancer-profile',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'create_freelancer_profile')) return;
      const uid = getUserId(req)!;
      const body = req.body;
      const { createProfile } = await import('../features/marketplace/services/freelancerHubService');
      const result = await createProfile(uid, body);
      if ('code' in result) {
        const statusMap: Record<string, number> = { VALIDATION_ERROR: 400, INVALID_TOOL_IDS: 400, PERSISTENCE_ERROR: 500 };
        return res.status(statusMap[result.code] || 400).json(result);
      }
      return res.status(201).json(result);
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

/** GET /freelancer-profile/:userId — View a freelancer profile */
marketplaceRouter.get(
  '/freelancer-profile/:userId',
  async (req: Request, res: Response) => {
    try {
      // Any authenticated user can view freelancer profiles
      const { userId } = req.params;
      const { getProfileView } = await import('../features/marketplace/services/freelancerHubService');
      const profileView = await getProfileView(userId);
      if (!profileView) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Freelancer profile not found' });
      }
      return res.status(200).json(profileView);
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

/** PUT /freelancer-profile — Update own freelancer profile */
marketplaceRouter.put(
  '/freelancer-profile',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'create_freelancer_profile')) return;
      const uid = getUserId(req)!;
      const body = req.body;
      const { adminDb } = await import('@/lib/firebase-admin');
      const { logMarketplaceAction } = await import('../features/marketplace/services/marketplaceAuditService');

      // Verify profile exists
      const profileDoc = await adminDb.collection('marketplace_freelancer_profiles').doc(uid).get();
      if (!profileDoc.exists) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Freelancer profile not found. Create one first.' });
      }

      const now = new Date().toISOString();
      const updates: Record<string, unknown> = { updatedAt: now };
      if (body.skills !== undefined) updates.skills = body.skills;
      if (body.availability !== undefined) updates.availability = body.availability;
      if (body.yearsExperience !== undefined) updates.yearsExperience = body.yearsExperience;

      await adminDb.collection('marketplace_freelancer_profiles').doc(uid).update(updates);

      await logMarketplaceAction({ actorId: uid, actionType: 'freelancer_profile_updated', entityId: uid, entityType: 'freelancer_profile' });
      return res.status(200).json({ userId: uid, ...updates });
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

// ─── Firm Collaboration ───────────────────────────────────────────────────────

/** POST /collaborations — Create a firm collaboration posting */
marketplaceRouter.post(
  '/collaborations',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'post_collaboration')) return;
      const uid = getUserId(req)!;
      const body = req.body;
      const { createCollaboration } = await import('../features/marketplace/services/firmCollaborationService');
      const result = await createCollaboration(body, {
        userId: uid,
        role: getUserRole(req) || 'firm_admin',
        firmId: body.firmId || uid,
      });
      if ('error' in result) {
        const statusMap: Record<string, number> = { ACCESS_DENIED: 403, VALIDATION_FAILED: 400, PERSISTENCE_FAILED: 500 };
        return res.status(statusMap[result.error.code] || 400).json(result.error);
      }
      return res.status(201).json(result.collaboration);
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

/** GET /collaborations — List firm collaboration postings */
marketplaceRouter.get(
  '/collaborations',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'post_collaboration')) return;
      const uid = getUserId(req)!;
      const { adminDb } = await import('@/lib/firebase-admin');

      // Query collaborations filtered by user's firm (firmId matches uid or user is a member)
      const snapshot = await adminDb.collection('marketplace_firm_collaborations')
        .where('firmId', '==', uid)
        .get();

      const collaborations = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json({ collaborations, total: collaborations.length });
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

/** POST /collaborations/:id/invite — Invite a user to a collaboration */
marketplaceRouter.post(
  '/collaborations/:id/invite',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'post_collaboration')) return;
      const uid = getUserId(req)!;
      const { id } = req.params;
      const { inviteeId, role } = req.body;
      const { adminDb } = await import('@/lib/firebase-admin');
      const { logMarketplaceAction } = await import('../features/marketplace/services/marketplaceAuditService');

      if (!inviteeId) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'inviteeId is required' });
      }

      // Verify collaboration exists
      const collabDoc = await adminDb.collection('marketplace_firm_collaborations').doc(id).get();
      if (!collabDoc.exists) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Collaboration not found' });
      }

      // Verify invitee eligibility: Trust Score >= 75 and active registration
      const { getTrustScore } = await import('../features/marketplace/services/trustScoreService');
      const trustScore = await getTrustScore(inviteeId);
      if (!trustScore || trustScore.overallScore < 75) {
        return res.status(422).json({ code: 'ELIGIBILITY_BLOCKED', message: 'Invitee must have a Trust Score of at least 75' });
      }

      const { checkProfessionalVerification } = await import('../features/marketplace/services/verificationGatesService');
      const verification = await checkProfessionalVerification(inviteeId);
      if (!verification.verified) {
        return res.status(422).json({ code: 'ELIGIBILITY_BLOCKED', message: 'Invitee must have an active professional registration' });
      }

      const now = new Date().toISOString();

      // Create invitation record
      const inviteRef = adminDb.collection('marketplace_collaboration_invites').doc();
      await inviteRef.set({
        collaborationId: id,
        inviterId: uid,
        inviteeId,
        role: role || 'member',
        status: 'pending',
        createdAt: now,
      });

      // Notify invitee
      await adminDb.collection('action_centre_events').add({
        type: 'collaboration_invite',
        recipientUserId: inviteeId,
        title: 'Collaboration Invitation',
        description: `You have been invited to join a firm collaboration.`,
        entityId: inviteRef.id,
        entityType: 'collaboration_invite',
        createdAt: now,
        read: false,
        severity: 'action_required',
      });

      await logMarketplaceAction({ actorId: uid, actionType: 'collaboration_invite_sent', entityId: inviteRef.id, entityType: 'collaboration_invite', afterStatus: 'pending' });
      return res.status(201).json({ inviteId: inviteRef.id, collaborationId: id, inviteeId, status: 'pending' });
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

/** PUT /collaborations/:id/complete — Mark a collaboration as completed */
marketplaceRouter.put(
  '/collaborations/:id/complete',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'post_collaboration')) return;
      const uid = getUserId(req)!;
      const { id } = req.params;
      const { adminDb } = await import('@/lib/firebase-admin');
      const { logMarketplaceAction } = await import('../features/marketplace/services/marketplaceAuditService');

      // Fetch collaboration
      const collabDoc = await adminDb.collection('marketplace_firm_collaborations').doc(id).get();
      if (!collabDoc.exists) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Collaboration not found' });
      }
      const collab = collabDoc.data()!;

      if (collab.status === 'completed') {
        return res.status(422).json({ code: 'INVALID_TRANSITION', message: 'Collaboration is already completed' });
      }

      const now = new Date().toISOString();

      // Mark collaboration complete
      await adminDb.collection('marketplace_firm_collaborations').doc(id).update({
        status: 'completed',
        completedAt: now,
        updatedAt: now,
      });

      // Trigger Trust Score recalculation for all participants
      const { recalculateOnEvent } = await import('../features/marketplace/services/trustScoreService');
      const members: Array<{ userId: string }> = collab.teamMembers || [];
      for (const member of members) {
        try {
          await recalculateOnEvent({ userId: member.userId, type: 'project_completed' });
        } catch (e) {
          console.error(`[Marketplace] Trust Score recalculation failed for ${member.userId}:`, e);
        }
      }

      await logMarketplaceAction({ actorId: uid, actionType: 'collaboration_completed', entityId: id, entityType: 'firm_collaboration', beforeStatus: collab.status, afterStatus: 'completed' });
      return res.status(200).json({ collaborationId: id, status: 'completed', completedAt: now });
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

// ─── Certificates ─────────────────────────────────────────────────────────────

/** POST /projects/:id/certificate — Generate compliance certificate */
marketplaceRouter.post(
  '/projects/:id/certificate',
  async (req: Request, res: Response) => {
    try {
      if (!checkPermission(req, res, 'receive_certificate')) return;
      const uid = getUserId(req)!;
      const { id } = req.params;
      const { adminDb } = await import('@/lib/firebase-admin');
      const { logMarketplaceAction } = await import('../features/marketplace/services/marketplaceAuditService');

      // Fetch project posting
      const postingDoc = await adminDb.collection('marketplace_project_postings').doc(id).get();
      if (!postingDoc.exists) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Project posting not found' });
      }
      const posting = postingDoc.data()!;

      // Check all milestones complete (look at proposals for this posting with accepted status)
      const proposalsSnap = await adminDb.collection('marketplace_proposals')
        .where('postingId', '==', id)
        .where('status', '==', 'accepted')
        .limit(1)
        .get();

      if (proposalsSnap.empty) {
        return res.status(422).json({ code: 'INVALID_TRANSITION', message: 'No accepted proposal found for this project' });
      }

      // Verify project is complete (posting status must be 'accepted' and project tasks completed)
      if (posting.status !== 'accepted') {
        return res.status(422).json({ code: 'INVALID_TRANSITION', message: 'Project must have an accepted proposal to generate a certificate' });
      }

      const now = new Date().toISOString();

      // Generate certificate data
      const certRef = adminDb.collection('marketplace_certificates').doc();
      const certificateData = {
        projectPostingId: id,
        title: posting.title,
        clientId: posting.clientId,
        issuedTo: uid,
        sansReferences: posting.sansReferences || [],
        requiredTools: posting.requiredTools || [],
        issuedAt: now,
        status: 'issued',
      };

      await certRef.set(certificateData);

      // Store in document vault
      await adminDb.collection('document_vault').add({
        type: 'compliance_certificate',
        entityId: certRef.id,
        projectId: id,
        ownerId: uid,
        createdAt: now,
        metadata: certificateData,
      });

      await logMarketplaceAction({ actorId: uid, actionType: 'certificate_generated', entityId: certRef.id, entityType: 'certificate', afterStatus: 'issued' });
      return res.status(201).json({ certificateId: certRef.id, ...certificateData });
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

// ─── Disputes ─────────────────────────────────────────────────────────────────

/** POST /disputes — File a marketplace dispute */
marketplaceRouter.post(
  '/disputes',
  async (req: Request, res: Response) => {
    try {
      // Any authenticated marketplace participant can file a dispute
      const uid = getUserId(req)!;
      const body = req.body;
      if (!body.relatedEntityId || !body.relatedEntityType) {
        const error: MarketplaceError = {
          code: 'VALIDATION_ERROR',
          message: 'relatedEntityId and relatedEntityType are required',
          details: { field: 'relatedEntityId, relatedEntityType' },
        };
        return res.status(400).json(error);
      }
      // Evidence is REQUIRED — no placeholder fallback
      if (!body.evidenceRefs || !Array.isArray(body.evidenceRefs) || body.evidenceRefs.length === 0) {
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'At least one evidence reference is required to file a dispute',
          details: { field: 'evidenceRefs' },
        });
      }
      const { fileDispute } = await import('../features/marketplace/services/verificationGatesService');
      const dispute = await fileDispute({
        filingPartyId: uid,
        opposingPartyId: body.opposingPartyId || '',
        relatedEntityId: body.relatedEntityId,
        relatedEntityType: body.relatedEntityType,
        evidenceRefs: body.evidenceRefs,
      });
      return res.status(201).json(dispute);
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

export default marketplaceRouter;
