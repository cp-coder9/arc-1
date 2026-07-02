/**
 * Town Planning & Land Development Workflow — Express Router
 *
 * Module 4 (Compliance + Municipal Readiness) API routes.
 * All endpoints are prefixed with `/api/town-planning/` (mounted externally).
 *
 * Auth: Placeholder middleware extracts user info from x-user-id / x-user-role headers.
 * Access control: Uses checkPermission from the access control service.
 * Error handling: Returns 400 (validation), 403 (auth), 404 (not found), 500 (internal).
 */

import { Router } from 'express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { UserRole } from '@/types';
import type { TownPlanningAction } from './types';
import { checkPermission } from './services/accessControl';
import { adminDb } from '@/lib/firebase-admin';

// ─── Router Instance ─────────────────────────────────────────────────────────

const townPlanningRouter = Router();

// ─── Audit No-op ─────────────────────────────────────────────────────────────

/** No-op audit function for route-level DI. Actual auditing is handled by adapters. */
const noopAudit = async (_entry: any): Promise<void> => { /* TODO: wire to auditAdapter */ };

/** No-op passport function for route-level DI. */
const noopPassport = async (_payload: any): Promise<void> => { /* TODO: wire to passportAdapter */ };

/** No-op action centre function. */
const noopActionCentre = async (_payload: any): Promise<void> => { /* TODO: wire to actionCentreAdapter */ };

// ─── Auth Context Types ──────────────────────────────────────────────────────

interface TownPlanningAuthContext {
  userId: string;
  role: UserRole;
  roles: UserRole[];
}

declare global {
  namespace Express {
    interface Request {
      tpAuth?: TownPlanningAuthContext;
    }
  }
}

// ─── Placeholder Auth Middleware ──────────────────────────────────────────────

/**
 * Extracts user info from request headers (placeholder until real Firebase auth).
 * Uses x-user-id and x-user-role headers. Falls back to authContext if available.
 */
const extractAuth: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const userId = req.headers['x-user-id'] as string | undefined;
  const role = req.headers['x-user-role'] as string | undefined;

  // Fall back to authContext from requireAuth middleware if present
  if (!userId && req.authContext) {
    req.tpAuth = {
      userId: req.authContext.uid,
      role: (req.authContext.role || 'client') as UserRole,
      roles: [(req.authContext.role || 'client') as UserRole],
    };
    return next();
  }

  if (!userId) {
    res.status(401).json({ error: 'Missing x-user-id header' });
    return;
  }

  const userRole = (role || 'client') as UserRole;
  req.tpAuth = {
    userId,
    role: userRole,
    roles: [userRole],
  };
  next();
};

// ─── Access Control Middleware Factory ────────────────────────────────────────

/**
 * Creates middleware that checks if the user has permission for the given action.
 * Extracts projectId from params or query.
 */
function requireAction(action: TownPlanningAction) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const auth = req.tpAuth;
    if (!auth) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const projectId = req.params.projectId || req.params.id || (req.query.projectId as string) || req.body?.projectId;
    if (!projectId) {
      res.status(400).json({ error: 'Project context required (projectId)' });
      return;
    }

    const result = await checkPermission({
      userId: auth.userId,
      projectId,
      action,
      roles: auth.roles,
      isProjectMember: true, // Placeholder: assume membership for now
    });

    if (!result.allowed) {
      res.status(403).json({ error: result.reason || 'Access denied' });
      return;
    }

    next();
  };
}

// ─── Error Wrapper ───────────────────────────────────────────────────────────

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/**
 * Wraps async route handlers to catch errors and return appropriate HTTP codes.
 */
function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch((err: any) => {
      console.error('[TownPlanning] Route error:', err);
      const status = err.status || err.statusCode || 500;
      const message = err.message || 'Internal server error';
      res.status(status).json({ error: message });
    });
  };
}

// ─── Helper: Service Result → Response ───────────────────────────────────────

function sendServiceResult(res: Response, result: { success: boolean; data?: any; error?: string }, successStatus = 200): void {
  if (result.success) {
    res.status(successStatus).json({ data: result.data });
  } else {
    const status = result.error?.includes('not found') ? 404 : 400;
    res.status(status).json({ error: result.error });
  }
}

// ─── Apply Auth Middleware to All Routes ─────────────────────────────────────

townPlanningRouter.use(extractAuth);

// ═══════════════════════════════════════════════════════════════════════════════
// APPLICATION ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/** POST /applications — Create a new land use application */
townPlanningRouter.post('/applications', requireAction('create_application'), asyncHandler(async (req, res) => {
  const { createApplication } = await import('./services/applicationEngine');
  const auth = req.tpAuth!;
  const { projectId, ...params } = req.body;

  const result = await createApplication(projectId, params, { id: auth.userId, role: auth.role }, {
    db: adminDb as any,
    auditFn: noopAudit,
    passportFn: noopPassport,
  });

  sendServiceResult(res, result, 201);
}));

/** GET /applications?projectId= — List applications by project */
townPlanningRouter.get('/applications', requireAction('view_application'), asyncHandler(async (req, res) => {
  const { listApplicationsByProject } = await import('./services/applicationEngine');
  const projectId = req.query.projectId as string;
  if (!projectId) {
    res.status(400).json({ error: 'projectId query parameter is required' });
    return;
  }
  const applications = await listApplicationsByProject(projectId, adminDb as any);
  res.json({ data: applications });
}));

/** GET /applications/:id — Get a single application */
townPlanningRouter.get('/applications/:id', requireAction('view_application'), asyncHandler(async (req, res) => {
  const { getApplication } = await import('./services/applicationEngine');
  const projectId = req.query.projectId as string;
  if (!projectId) {
    res.status(400).json({ error: 'projectId query parameter is required' });
    return;
  }
  const application = await getApplication(req.params.id, projectId, adminDb as any);
  if (!application) {
    res.status(404).json({ error: `Application '${req.params.id}' not found` });
    return;
  }
  res.json({ data: application });
}));

/** PATCH /applications/:id — Update an application */
townPlanningRouter.patch('/applications/:id', requireAction('manage_workflow'), asyncHandler(async (req, res) => {
  const projectId = req.body.projectId || (req.query.projectId as string);
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }
  const collectionPath = `projects/${projectId}/townPlanning/applications`;
  const docRef = adminDb.collection(collectionPath).doc(req.params.id);
  const docSnap = await docRef.get();
  if (!docSnap.exists) {
    res.status(404).json({ error: `Application '${req.params.id}' not found` });
    return;
  }
  const { projectId: _p, ...updateData } = req.body;
  await docRef.update({ ...updateData, updatedAt: new Date().toISOString() });
  const updated = await docRef.get();
  res.json({ data: { id: updated.id, ...updated.data() } });
}));

/** POST /applications/:id/transition — Transition workflow stage */
townPlanningRouter.post('/applications/:id/transition', requireAction('manage_workflow'), asyncHandler(async (req, res) => {
  const { transitionStage } = await import('./services/workflowTracker');
  const auth = req.tpAuth!;
  const projectId = req.body.projectId || (req.query.projectId as string);
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }
  try {
    const result = await transitionStage(
      req.params.id,
      projectId,
      req.body.targetStage,
      req.body.params || {},
      { id: auth.userId, role: auth.role },
      { db: adminDb as any, auditFn: async () => {}, actionCentreFn: async () => {} }
    );
    res.json({ data: result });
  } catch (err: any) {
    if (err.name === 'TransitionError') {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

/** GET /applications/:id/transitions — Get stage history */
townPlanningRouter.get('/applications/:id/transitions', requireAction('view_application'), asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string;
  if (!projectId) {
    res.status(400).json({ error: 'projectId query parameter is required' });
    return;
  }
  const collectionPath = `projects/${projectId}/townPlanning/applications/${req.params.id}/transitions`;
  const snapshot = await adminDb.collection(collectionPath).get();
  const transitions = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  res.json({ data: transitions });
}));

/** GET /applications/:id/deadlines — Get active deadlines */
townPlanningRouter.get('/applications/:id/deadlines', requireAction('view_application'), asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string;
  if (!projectId) {
    res.status(400).json({ error: 'projectId query parameter is required' });
    return;
  }
  const collectionPath = `projects/${projectId}/townPlanning/applications/${req.params.id}/deadlines`;
  const snapshot = await adminDb.collection(collectionPath).get();
  const deadlines = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  res.json({ data: deadlines });
}));

// ═══════════════════════════════════════════════════════════════════════════════
// COMMENT/OBJECTION ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/** POST /applications/:id/comments — Register a comment/objection */
townPlanningRouter.post('/applications/:id/comments', requireAction('manage_comments'), asyncHandler(async (req, res) => {
  const { registerComment } = await import('./services/commentRegister');
  const auth = req.tpAuth!;
  const projectId = req.body.projectId || (req.query.projectId as string);
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }
  const { advertisingEndDate, ...commentInput } = req.body;
  const result = await registerComment(
    req.params.id,
    projectId,
    commentInput,
    advertisingEndDate || '',
    { id: auth.userId, role: auth.role },
    { db: adminDb as any, auditFn: noopAudit }
  );
  sendServiceResult(res, result, 201);
}));

/** GET /applications/:id/comments — List comments for application */
townPlanningRouter.get('/applications/:id/comments', requireAction('view_application'), asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string;
  if (!projectId) {
    res.status(400).json({ error: 'projectId query parameter is required' });
    return;
  }
  const collectionPath = `projects/${projectId}/townPlanning/applications/${req.params.id}/comments`;
  const snapshot = await adminDb.collection(collectionPath).get();
  const comments = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  res.json({ data: comments });
}));

/** PATCH /comments/:commentId — Update comment status/response */
townPlanningRouter.patch('/comments/:commentId', asyncHandler(async (req, res) => {
  const { updateCommentStatus, addResponse } = await import('./services/commentRegister');
  const auth = req.tpAuth!;
  const { applicationId, projectId, status, response } = req.body;
  if (!applicationId || !projectId) {
    res.status(400).json({ error: 'applicationId and projectId are required' });
    return;
  }

  // Check permission manually since commentId isn't a projectId
  const permResult = await checkPermission({
    userId: auth.userId, projectId, action: 'manage_comments',
    roles: auth.roles, isProjectMember: true,
  });
  if (!permResult.allowed) {
    res.status(403).json({ error: permResult.reason || 'Access denied' });
    return;
  }

  if (response) {
    const result = await addResponse(
      req.params.commentId, applicationId, projectId, { response },
      { id: auth.userId, role: auth.role },
      { db: adminDb as any, auditFn: noopAudit }
    );
    sendServiceResult(res, result);
  } else if (status) {
    const result = await updateCommentStatus(
      req.params.commentId, applicationId, projectId, status,
      { id: auth.userId, role: auth.role },
      { db: adminDb as any, auditFn: noopAudit }
    );
    sendServiceResult(res, result);
  } else {
    res.status(400).json({ error: 'Either status or response must be provided' });
  }
}));

// ═══════════════════════════════════════════════════════════════════════════════
// CONDITIONS ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/** POST /applications/:id/conditions — Create a condition */
townPlanningRouter.post('/applications/:id/conditions', requireAction('manage_conditions'), asyncHandler(async (req, res) => {
  const { createCondition } = await import('./services/conditionsRegister');
  const auth = req.tpAuth!;
  const projectId = req.body.projectId || (req.query.projectId as string);
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }
  const result = await createCondition(
    req.params.id, projectId, req.body,
    { id: auth.userId, role: auth.role },
    { db: adminDb as any, auditFn: noopAudit }
  );
  sendServiceResult(res, result, 201);
}));

/** GET /applications/:id/conditions — List conditions + summary */
townPlanningRouter.get('/applications/:id/conditions', requireAction('view_conditions'), asyncHandler(async (req, res) => {
  const { getConditionsSummary } = await import('./services/conditionsRegister');
  const projectId = req.query.projectId as string;
  if (!projectId) {
    res.status(400).json({ error: 'projectId query parameter is required' });
    return;
  }
  const collectionPath = `projects/${projectId}/townPlanning/applications/${req.params.id}/conditions`;
  const snapshot = await adminDb.collection(collectionPath).get();
  const conditions = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const summary = await getConditionsSummary(req.params.id, projectId, adminDb as any);
  res.json({ data: { conditions, summary } });
}));

/** PATCH /conditions/:conditionId — Update condition status */
townPlanningRouter.patch('/conditions/:conditionId', asyncHandler(async (req, res) => {
  const { updateConditionStatus } = await import('./services/conditionsRegister');
  const auth = req.tpAuth!;
  const { applicationId, projectId, status, evidenceDocuments, waiverReference, waiverReason } = req.body;
  if (!applicationId || !projectId) {
    res.status(400).json({ error: 'applicationId and projectId are required' });
    return;
  }

  const permResult = await checkPermission({
    userId: auth.userId, projectId, action: 'manage_conditions',
    roles: auth.roles, isProjectMember: true,
  });
  if (!permResult.allowed) {
    res.status(403).json({ error: permResult.reason || 'Access denied' });
    return;
  }

  const result = await updateConditionStatus(
    req.params.conditionId, applicationId, projectId, status,
    { evidenceDocIds: evidenceDocuments, waiverReference, waiverReason },
    { id: auth.userId, role: auth.role },
    { db: adminDb as any, auditFn: noopAudit }
  );
  sendServiceResult(res, result);
}));

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT CHECKLIST ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/** GET /applications/:id/checklist — Get document checklist */
townPlanningRouter.get('/applications/:id/checklist', requireAction('view_documents'), asyncHandler(async (req, res) => {
  const { generateDocumentChecklist, getCompletenessIndicator } = await import('./services/applicationEngine');
  const projectId = req.query.projectId as string;
  if (!projectId) {
    res.status(400).json({ error: 'projectId query parameter is required' });
    return;
  }

  // Try to get existing checklist first
  const checklistPath = `projects/${projectId}/townPlanning/applications/${req.params.id}/checklist`;
  const snapshot = await adminDb.collection(checklistPath).get();

  if (snapshot.empty) {
    // Generate checklist if it doesn't exist yet
    const result = await generateDocumentChecklist(req.params.id, projectId, adminDb as any);
    if (!result.success) {
      sendServiceResult(res, result);
      return;
    }
    const completeness = await getCompletenessIndicator(req.params.id, projectId, adminDb as any);
    res.json({ data: { items: result.data, completeness } });
  } else {
    const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const completeness = await getCompletenessIndicator(req.params.id, projectId, adminDb as any);
    res.json({ data: { items, completeness } });
  }
}));

/** PATCH /checklist/:itemId — Update checklist item */
townPlanningRouter.patch('/checklist/:itemId', asyncHandler(async (req, res) => {
  const { updateDocumentChecklistItem } = await import('./services/applicationEngine');
  const auth = req.tpAuth!;
  const { applicationId, projectId, status, documentId, notApplicableReason } = req.body;
  if (!applicationId || !projectId) {
    res.status(400).json({ error: 'applicationId and projectId are required' });
    return;
  }

  const permResult = await checkPermission({
    userId: auth.userId, projectId, action: 'view_documents',
    roles: auth.roles, isProjectMember: true,
  });
  if (!permResult.allowed) {
    res.status(403).json({ error: permResult.reason || 'Access denied' });
    return;
  }

  const result = await updateDocumentChecklistItem(
    applicationId, req.params.itemId, { status, documentId, notApplicableReason },
    projectId, { id: auth.userId, role: auth.role },
    { db: adminDb as any, auditFn: noopAudit }
  );
  sendServiceResult(res, result);
}));

// ═══════════════════════════════════════════════════════════════════════════════
// APPEAL ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/** POST /applications/:id/appeals — File an appeal */
townPlanningRouter.post('/applications/:id/appeals', requireAction('manage_workflow'), asyncHandler(async (req, res) => {
  const { fileAppeal } = await import('./services/appealTracker');
  const auth = req.tpAuth!;
  const projectId = req.body.projectId || (req.query.projectId as string);
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }
  const result = await fileAppeal(
    req.params.id, projectId, req.body,
    { id: auth.userId, role: auth.role },
    { db: adminDb as any, auditFn: noopAudit }
  );
  sendServiceResult(res, result, 201);
}));

/** GET /applications/:id/appeals — List appeals */
townPlanningRouter.get('/applications/:id/appeals', requireAction('view_application'), asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string;
  if (!projectId) {
    res.status(400).json({ error: 'projectId query parameter is required' });
    return;
  }
  const collectionPath = `projects/${projectId}/townPlanning/applications/${req.params.id}/appeals`;
  const snapshot = await adminDb.collection(collectionPath).get();
  const appeals = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  res.json({ data: appeals });
}));

/** PATCH /appeals/:appealId — Update appeal stage */
townPlanningRouter.patch('/appeals/:appealId', asyncHandler(async (req, res) => {
  const { transitionAppealStage } = await import('./services/appealTracker');
  const auth = req.tpAuth!;
  const { applicationId, projectId, targetStage, outcome, outcomeReasons, hearingDate, notes } = req.body;
  if (!applicationId || !projectId) {
    res.status(400).json({ error: 'applicationId and projectId are required' });
    return;
  }

  const permResult = await checkPermission({
    userId: auth.userId, projectId, action: 'manage_workflow',
    roles: auth.roles, isProjectMember: true,
  });
  if (!permResult.allowed) {
    res.status(403).json({ error: permResult.reason || 'Access denied' });
    return;
  }

  const result = await transitionAppealStage(
    req.params.appealId, targetStage,
    { outcome, outcomeReasons, hearingDate, notes },
    projectId,
    { id: auth.userId, role: auth.role },
    { db: adminDb as any, auditFn: noopAudit }
  );
  sendServiceResult(res, result);
}));

// ═══════════════════════════════════════════════════════════════════════════════
// PROPERTY INTELLIGENCE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/** GET /property/:projectId — Get property intelligence */
townPlanningRouter.get('/property/:projectId', requireAction('view_property'), asyncHandler(async (req, res) => {
  const { getPropertyData } = await import('./services/propertyRegister');
  const result = await getPropertyData(req.params.projectId, adminDb as any);
  if (!result) {
    res.status(404).json({ error: `Property intelligence not found for project '${req.params.projectId}'` });
    return;
  }
  res.json({ data: result });
}));

/** PATCH /property/:projectId — Update property field */
townPlanningRouter.patch('/property/:projectId', requireAction('update_property'), asyncHandler(async (req, res) => {
  const { updatePropertyField } = await import('./services/propertyRegister');
  const auth = req.tpAuth!;
  const { field, value } = req.body;
  if (!field) {
    res.status(400).json({ error: 'field is required' });
    return;
  }
  const result = await updatePropertyField(
    req.params.projectId, field, value,
    { id: auth.userId, role: auth.role },
    { db: adminDb as any, auditFn: noopAudit }
  );
  sendServiceResult(res, result);
}));

/** POST /property/:projectId/conditions — Add restrictive condition */
townPlanningRouter.post('/property/:projectId/conditions', requireAction('update_property'), asyncHandler(async (req, res) => {
  const { addRestrictiveCondition } = await import('./services/propertyRegister');
  const auth = req.tpAuth!;
  const result = await addRestrictiveCondition(
    req.params.projectId, req.body,
    { id: auth.userId, role: auth.role },
    { db: adminDb as any, auditFn: noopAudit }
  );
  sendServiceResult(res, result, 201);
}));

/** POST /property/:projectId/servitudes — Add servitude */
townPlanningRouter.post('/property/:projectId/servitudes', requireAction('update_property'), asyncHandler(async (req, res) => {
  const { addServitude } = await import('./services/propertyRegister');
  const auth = req.tpAuth!;
  const result = await addServitude(
    req.params.projectId, req.body,
    { id: auth.userId, role: auth.role },
    { db: adminDb as any, auditFn: noopAudit }
  );
  sendServiceResult(res, result, 201);
}));

// ═══════════════════════════════════════════════════════════════════════════════
// SDP ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/** POST /sdp — Initiate SDP workflow */
townPlanningRouter.post('/sdp', requireAction('manage_sdp'), asyncHandler(async (req, res) => {
  const { initiateSDP } = await import('./services/sdpEngine');
  const auth = req.tpAuth!;
  const { projectId, municipalityId } = req.body;
  if (!projectId || !municipalityId) {
    res.status(400).json({ error: 'projectId and municipalityId are required' });
    return;
  }
  const result = await initiateSDP(
    projectId, municipalityId,
    { id: auth.userId, role: auth.role },
    { db: adminDb as any, auditFn: noopAudit }
  );
  sendServiceResult(res, result, 201);
}));

/** GET /sdp/:sdpId — Get SDP status */
townPlanningRouter.get('/sdp/:sdpId', asyncHandler(async (req, res) => {
  const auth = req.tpAuth!;
  const projectId = req.query.projectId as string;
  if (!projectId) {
    res.status(400).json({ error: 'projectId query parameter is required' });
    return;
  }

  const permResult = await checkPermission({
    userId: auth.userId, projectId, action: 'view_application',
    roles: auth.roles, isProjectMember: true,
  });
  if (!permResult.allowed) {
    res.status(403).json({ error: permResult.reason || 'Access denied' });
    return;
  }

  const collectionPath = `projects/${projectId}/townPlanning/sdp`;
  const docSnap = await adminDb.collection(collectionPath).doc(req.params.sdpId).get();
  if (!docSnap.exists) {
    res.status(404).json({ error: `SDP '${req.params.sdpId}' not found` });
    return;
  }
  res.json({ data: { id: docSnap.id, ...docSnap.data() } });
}));

/** PATCH /sdp/:sdpId/checklist/:itemId — Update SDP checklist item */
townPlanningRouter.patch('/sdp/:sdpId/checklist/:itemId', asyncHandler(async (req, res) => {
  const { updateChecklistItem } = await import('./services/sdpEngine');
  const auth = req.tpAuth!;
  const { projectId, status, linkedDocumentIds } = req.body;
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  const permResult = await checkPermission({
    userId: auth.userId, projectId, action: 'manage_sdp',
    roles: auth.roles, isProjectMember: true,
  });
  if (!permResult.allowed) {
    res.status(403).json({ error: permResult.reason || 'Access denied' });
    return;
  }

  const result = await updateChecklistItem(
    req.params.sdpId, req.params.itemId,
    { status, linkedDocumentIds },
    projectId,
    { id: auth.userId, role: auth.role },
    { db: adminDb as any, auditFn: noopAudit }
  );
  sendServiceResult(res, result);
}));

/** POST /sdp/:sdpId/transition — Transition SDP stage */
townPlanningRouter.post('/sdp/:sdpId/transition', asyncHandler(async (req, res) => {
  const { transitionSDPStage } = await import('./services/sdpEngine');
  const auth = req.tpAuth!;
  const { projectId, targetStage, notes } = req.body;
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  const permResult = await checkPermission({
    userId: auth.userId, projectId, action: 'manage_sdp',
    roles: auth.roles, isProjectMember: true,
  });
  if (!permResult.allowed) {
    res.status(403).json({ error: permResult.reason || 'Access denied' });
    return;
  }

  const result = await transitionSDPStage(
    req.params.sdpId, targetStage, { notes },
    projectId,
    { id: auth.userId, role: auth.role },
    { db: adminDb as any, auditFn: noopAudit }
  );
  sendServiceResult(res, result);
}));

// ═══════════════════════════════════════════════════════════════════════════════
// SUBDIVISION ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/** GET /subdivisions/:subdivisionId — Get subdivision record */
townPlanningRouter.get('/subdivisions/:subdivisionId', asyncHandler(async (req, res) => {
  const auth = req.tpAuth!;
  const projectId = req.query.projectId as string;
  if (!projectId) {
    res.status(400).json({ error: 'projectId query parameter is required' });
    return;
  }

  const permResult = await checkPermission({
    userId: auth.userId, projectId, action: 'view_application',
    roles: auth.roles, isProjectMember: true,
  });
  if (!permResult.allowed) {
    res.status(403).json({ error: permResult.reason || 'Access denied' });
    return;
  }

  const collectionPath = `projects/${projectId}/townPlanning/subdivisions`;
  const docSnap = await adminDb.collection(collectionPath).doc(req.params.subdivisionId).get();
  if (!docSnap.exists) {
    res.status(404).json({ error: `Subdivision '${req.params.subdivisionId}' not found` });
    return;
  }
  res.json({ data: { id: docSnap.id, ...docSnap.data() } });
}));

/** POST /subdivisions/:id/sg-transition — Transition SG diagram stage */
townPlanningRouter.post('/subdivisions/:id/sg-transition', asyncHandler(async (req, res) => {
  const { transitionSGDiagramStage } = await import('./services/subdivisionEngine');
  const auth = req.tpAuth!;
  const { projectId, targetStage, sgDiagramReference, newErfNumbers, notes } = req.body;
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  const permResult = await checkPermission({
    userId: auth.userId, projectId, action: 'manage_subdivision',
    roles: auth.roles, isProjectMember: true,
  });
  if (!permResult.allowed) {
    res.status(403).json({ error: permResult.reason || 'Access denied' });
    return;
  }

  const result = await transitionSGDiagramStage(
    req.params.id, targetStage,
    { sgDiagramReference, newErfNumbers, notes },
    projectId,
    { id: auth.userId, role: auth.role },
    { db: adminDb as any, auditFn: noopAudit }
  );
  sendServiceResult(res, result);
}));

/** POST /subdivisions/:id/td-transition — Transition title deed stage */
townPlanningRouter.post('/subdivisions/:id/td-transition', asyncHandler(async (req, res) => {
  const { transitionTitleDeedStage } = await import('./services/subdivisionEngine');
  const auth = req.tpAuth!;
  const { projectId, targetStage, notes } = req.body;
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  const permResult = await checkPermission({
    userId: auth.userId, projectId, action: 'manage_subdivision',
    roles: auth.roles, isProjectMember: true,
  });
  if (!permResult.allowed) {
    res.status(403).json({ error: permResult.reason || 'Access denied' });
    return;
  }

  const result = await transitionTitleDeedStage(
    req.params.id, targetStage, { notes },
    projectId,
    { id: auth.userId, role: auth.role },
    { db: adminDb as any, auditFn: noopAudit }
  );
  sendServiceResult(res, result);
}));

// ═══════════════════════════════════════════════════════════════════════════════
// MUNICIPALITY CONFIG ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/** GET /municipalities — List municipality profiles */
townPlanningRouter.get('/municipalities', asyncHandler(async (req, res) => {
  const { listMunicipalities } = await import('./services/municipalityConfig');
  const result = await listMunicipalities(adminDb as any);
  res.json({ data: result });
}));

/** GET /municipalities/:id — Get municipality profile */
townPlanningRouter.get('/municipalities/:id', asyncHandler(async (req, res) => {
  const { getMunicipalityProfile } = await import('./services/municipalityConfig');
  const result = await getMunicipalityProfile(req.params.id, adminDb as any);
  if (!result) {
    res.status(404).json({ error: `Municipality profile '${req.params.id}' not found` });
    return;
  }
  res.json({ data: result });
}));

/** POST /municipalities — Create municipality profile */
townPlanningRouter.post('/municipalities', asyncHandler(async (req, res) => {
  const { createMunicipalityProfile } = await import('./services/municipalityConfig');
  const auth = req.tpAuth!;

  const permResult = await checkPermission({
    userId: auth.userId, projectId: 'global', action: 'configure_municipality',
    roles: auth.roles, isProjectMember: true,
  });
  if (!permResult.allowed) {
    res.status(403).json({ error: permResult.reason || 'Access denied' });
    return;
  }

  const result = await createMunicipalityProfile(
    req.body,
    { id: auth.userId, role: auth.role },
    adminDb as any,
    noopAudit
  );
  sendServiceResult(res, result, 201);
}));

/** PATCH /municipalities/:id — Update municipality profile */
townPlanningRouter.patch('/municipalities/:id', asyncHandler(async (req, res) => {
  const { updateMunicipalityProfile } = await import('./services/municipalityConfig');
  const auth = req.tpAuth!;

  const permResult = await checkPermission({
    userId: auth.userId, projectId: 'global', action: 'configure_municipality',
    roles: auth.roles, isProjectMember: true,
  });
  if (!permResult.allowed) {
    res.status(403).json({ error: permResult.reason || 'Access denied' });
    return;
  }

  const result = await updateMunicipalityProfile(
    req.params.id, req.body,
    { id: auth.userId, role: auth.role },
    adminDb as any,
    noopAudit
  );
  sendServiceResult(res, result);
}));

// ═══════════════════════════════════════════════════════════════════════════════
// DEPENDENCY STATUS ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════════

/** GET /dependency-status/:projectId — Get sequential dependency chain status */
townPlanningRouter.get('/dependency-status/:projectId', requireAction('view_application'), asyncHandler(async (req, res) => {
  const { checkReadiness, getProgressIndicator } = await import('./services/sequentialDependency');

  const readiness = await checkReadiness(req.params.projectId, adminDb as any);
  const progress = await getProgressIndicator(req.params.projectId, adminDb as any);

  res.json({ data: { readiness, progress } });
}));

// ─── Export ──────────────────────────────────────────────────────────────────

export default townPlanningRouter;
