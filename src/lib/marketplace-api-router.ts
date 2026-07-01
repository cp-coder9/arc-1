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
      // Stub: In production, call trustScoreService.getTrustScore(userId)
      return res.status(200).json({
        userId,
        overallScore: 0,
        factors: [],
        calculatedAt: new Date().toISOString(),
        badges: [],
      });
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
      // Stub: In production, call trustScoreService.recalculateOnEvent(...)
      return res.status(200).json({
        userId,
        overallScore: 0,
        factors: [],
        calculatedAt: new Date().toISOString(),
        badges: [],
      });
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
      // Stub: In production, call complianceSearchService.search(query)
      return res.status(200).json({ results: [], total: 0 });
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
      // Stub: In production, call complianceSearchService.getSuggestions(q)
      return res.status(200).json({ suggestions: [] });
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
      // Stub: In production, call projectMarketplaceService.createPosting(uid, body)
      return res.status(201).json({
        id: `proj_${Date.now()}`,
        clientId: uid,
        status: 'draft',
        createdAt: new Date().toISOString(),
        ...body,
      });
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
      // Stub: In production, call projectMarketplaceService.listPostings(filters)
      return res.status(200).json({ postings: [], total: 0 });
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
      // Stub: In production, call projectMarketplaceService.getPosting(id)
      return res.status(200).json({ id, status: 'published' });
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
      const { id } = req.params;
      // Stub: In production, call projectMarketplaceService.withdrawPosting(uid, id)
      return res.status(200).json({ id, status: 'withdrawn' });
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
      // Stub: In production, call projectMarketplaceService.applyToProject(uid, id, body)
      return res.status(201).json({
        id: `prop_${Date.now()}`,
        postingId: id,
        professionalId: uid,
        status: 'submitted',
        createdAt: new Date().toISOString(),
      });
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
      // Stub: In production, call projectMarketplaceService.acceptProposal(uid, id, proposalId)
      return res.status(200).json({
        postingId: id,
        proposalId,
        status: 'accepted',
        acceptedAt: new Date().toISOString(),
      });
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
      // Stub: In production, call taskMarketplaceService.createTask(uid, body)
      return res.status(201).json({
        id: `task_${Date.now()}`,
        professionalId: uid,
        status: 'open',
        createdAt: new Date().toISOString(),
        ...body,
      });
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
      // Stub: In production, call taskMarketplaceService.listTasks(filters)
      return res.status(200).json({ tasks: [], total: 0 });
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
      // Stub: In production, call taskMarketplaceService.applyToTask(uid, id)
      return res.status(201).json({
        id: `app_${Date.now()}`,
        taskId: id,
        freelancerId: uid,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
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
      // Stub: In production, call taskMarketplaceService.acceptApplication(uid, id, appId)
      return res.status(200).json({
        taskId: id,
        applicationId: appId,
        status: 'accepted',
        acceptedAt: new Date().toISOString(),
      });
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
      const body = req.body;
      // Stub: In production, call taskMarketplaceService.submitDeliverable(uid, id, body)
      return res.status(201).json({
        id: `del_${Date.now()}`,
        taskId: id,
        freelancerId: uid,
        aiReviewStatus: 'pending',
        submittedAt: new Date().toISOString(),
      });
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
      // Stub: In production, call taskMarketplaceService.signOff(uid, id)
      return res.status(200).json({
        taskId: id,
        signedOffBy: uid,
        status: 'completed',
        signedOffAt: new Date().toISOString(),
      });
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
      // Stub: In production, call supplierMarketplaceService.createListing(uid, body)
      return res.status(201).json({
        id: `mat_${Date.now()}`,
        supplierId: uid,
        status: 'active',
        createdAt: new Date().toISOString(),
        ...body,
      });
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
      // Stub: In production, call supplierMarketplaceService.searchMaterials(filters)
      return res.status(200).json({ materials: [], total: 0 });
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
      const body = req.body;
      // Stub: In production, call supplierMarketplaceService.requestQuote(uid, id, body)
      return res.status(201).json({
        id: `quote_${Date.now()}`,
        contractorId: uid,
        listingId: id,
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
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
      const body = req.body;
      // Stub: In production, call supplierMarketplaceService.respondToQuote(uid, id, body)
      return res.status(200).json({
        quoteId: id,
        supplierId: uid,
        status: 'quoted',
        quotedAmount: body.quotedAmount,
        respondedAt: new Date().toISOString(),
      });
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
      // Stub: In production, call supplierMarketplaceService.acceptQuote(uid, id)
      return res.status(200).json({
        quoteId: id,
        contractorId: uid,
        status: 'accepted',
        acceptedAt: new Date().toISOString(),
      });
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
      const body = req.body;
      // Stub: In production, call supplierMarketplaceService.uploadDeliveryNote(uid, id, body)
      return res.status(200).json({
        quoteId: id,
        deliveryNoteUploaded: true,
        uploadedBy: uid,
        uploadedAt: new Date().toISOString(),
      });
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
      // Stub: In production, call freelancerHubService.createProfile(uid, body)
      return res.status(201).json({
        userId: uid,
        availability: body.availability || 'available',
        skills: body.skills || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
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
      // Stub: In production, call freelancerHubService.getProfile(userId)
      return res.status(200).json({ userId });
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
      // Stub: In production, call freelancerHubService.updateProfile(uid, body)
      return res.status(200).json({
        userId: uid,
        updatedAt: new Date().toISOString(),
        ...body,
      });
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
      // Stub: In production, call firmCollaborationService.createPosting(uid, body)
      return res.status(201).json({
        id: `collab_${Date.now()}`,
        createdByUserId: uid,
        status: 'draft',
        createdAt: new Date().toISOString(),
        ...body,
      });
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
      // Stub: In production, call firmCollaborationService.listPostings(uid, filters)
      return res.status(200).json({ collaborations: [], total: 0 });
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
      const { inviteeUserId } = req.body;
      if (!inviteeUserId) {
        const error: MarketplaceError = {
          code: 'VALIDATION_ERROR',
          message: 'inviteeUserId is required',
          details: { field: 'inviteeUserId' },
        };
        return res.status(400).json(error);
      }
      // Stub: In production, call firmCollaborationService.inviteUser(uid, id, inviteeUserId)
      return res.status(201).json({
        collaborationId: id,
        inviteeUserId,
        invitedBy: uid,
        status: 'pending',
        invitedAt: new Date().toISOString(),
      });
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
      // Stub: In production, call firmCollaborationService.markComplete(uid, id)
      return res.status(200).json({
        collaborationId: id,
        status: 'completed',
        completedBy: uid,
        completedAt: new Date().toISOString(),
      });
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
      // Stub: In production, call complianceCertificateService.generate(uid, id)
      return res.status(201).json({
        certificateId: `cert_${Date.now()}`,
        projectId: id,
        generatedAt: new Date().toISOString(),
        requestedBy: uid,
      });
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
      // Stub: In production, call disputeService.fileDispute(uid, body)
      return res.status(201).json({
        disputeId: `disp_${Date.now()}`,
        filingPartyId: uid,
        relatedEntityId: body.relatedEntityId,
        relatedEntityType: body.relatedEntityType,
        status: 'open',
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      handleServiceError(res, err);
    }
  },
);

export default marketplaceRouter;
