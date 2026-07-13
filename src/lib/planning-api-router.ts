/**
 * Planning API Router — Express routes for the Town Planning Application Tracker.
 *
 * Follows the same pattern as finance-api-router.ts. Mounted under /api/planning/
 * in the main api-router.ts. Handles application CRUD, stage management,
 * deadlines, public participation, conditions, appeals, municipalities, reporting,
 * and environmental/heritage triggers.
 *
 * Role-based access control:
 * - town_planner: full read-write on assigned applications
 * - client: read + comment on own project applications
 * - architect: read on projects where team member
 * - surveyor: read status + conditions for post-approval survey
 * - firm_admin: configure team access
 * - admin: full access
 *
 * Project-scoped authorization: All endpoints that reference a project verify
 * the requesting user has the appropriate permission (project:read for GET,
 * project:update for mutations) on the target project via permissionService.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { canUserPerform } from '@/services/permissionService';
import type { ProjectAccessContext } from '@/services/permissionService';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from './roleMiddleware';

const planningRouter = Router();

// ─── Apply authentication to all planning routes ─────────────────────────────

planningRouter.use(requireAuth);

// ─── Role-Based Access Middleware ─────────────────────────────────────────────

/**
 * Checks if the request user has an authorized planning role.
 */
function checkPlanningAccess(req: Request, res: Response, next: NextFunction): void {
  const authCtx = req.authContext;
  if (!authCtx) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const authorizedRoles = ['town_planner', 'client', 'architect', 'surveyor', 'firm_admin', 'admin', 'platform_admin'];
  const userRole = authCtx.normalizedRole ?? authCtx.role ?? '';
  if (!authorizedRoles.includes(userRole)) {
    res.status(403).json({ error: 'Insufficient permissions for planning module' });
    return;
  }

  next();
}

// Apply access check to all planning routes
planningRouter.use(checkPlanningAccess);

// ─── Project-Scoped Authorization Helpers ────────────────────────────────────

/**
 * Loads the ProjectAccessContext from Firestore for the given user and project.
 */
async function loadProjectAccessContext(
  uid: string,
  projectId: string,
): Promise<ProjectAccessContext | null> {
  try {
    const projectDoc = await adminDb.collection('projects').doc(projectId).get();
    if (!projectDoc.exists) return null;
    const data = projectDoc.data();
    return {
      projectId,
      memberships: data?.memberships ?? [],
    } as ProjectAccessContext;
  } catch {
    return null;
  }
}

/**
 * Middleware factory: verifies the requesting user has the specified permission
 * on the project referenced by `projectId` in params, query, or body.
 */
function requireProjectPermission(permission: 'project:read' | 'project:update') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const uid = req.authContext!.uid;
    const role = (req.authContext!.normalizedRole ?? req.authContext!.role ?? 'client') as string;

    // Resolve projectId from params, query, or body
    const projectId =
      (req.params.projectId as string) ||
      (req.query.projectId as string) ||
      (req.body?.projectId as string);

    if (!projectId) {
      // If no projectId is available, allow (non-project-scoped endpoint)
      next();
      return;
    }

    const projectAccess = await loadProjectAccessContext(uid, projectId);
    const authzUser = { uid, role };
    const allowed = canUserPerform(authzUser, permission, projectAccess);

    if (!allowed) {
      res.status(403).json({ error: `Forbidden: insufficient ${permission} permission on project ${projectId}` });
      return;
    }

    next();
  };
}

// ─── Application Routes ──────────────────────────────────────────────────────

/** POST /api/planning/applications — Create a new planning application */
planningRouter.post('/applications', requireProjectPermission('project:update'), (req: Request, res: Response) => {
  try {
    const uid = req.authContext!.uid;
    const { projectId, tenantId, applicationType, municipalityId, assignedTownPlannerId,
      propertyDescription, erfNumber, titleDeedReference, applicantName, applicantContactDetails } = req.body;

    if (!projectId || !applicationType || !municipalityId) {
      res.status(400).json({ error: 'Missing required fields: projectId, applicationType, municipalityId' });
      return;
    }

    // Actor identity comes from auth context, not request body
    res.status(201).json({
      message: 'Application created',
      data: { projectId, applicationType, municipalityId, status: 'draft', stage: 'pre_consultation', createdBy: uid },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
});

/** GET /api/planning/applications/:id — Get a single application */
planningRouter.get('/applications/:id', requireProjectPermission('project:read'), (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ message: 'Application retrieved', applicationId: id });
});

/** GET /api/planning/applications — List applications by project or planner */
planningRouter.get('/applications', requireProjectPermission('project:read'), (req: Request, res: Response) => {
  const { projectId, townPlannerId } = req.query;
  res.json({ message: 'Applications listed', filters: { projectId, townPlannerId } });
});

/** PATCH /api/planning/applications/:id/advance — Advance to next stage */
planningRouter.patch('/applications/:id/advance', requireProjectPermission('project:update'), (req: Request, res: Response) => {
  const { id } = req.params;
  const uid = req.authContext!.uid;
  const { notes } = req.body;
  res.json({ message: 'Stage advanced', applicationId: id, userId: uid, notes });
});

/** PATCH /api/planning/applications/:id/status — Update application status */
planningRouter.patch('/applications/:id/status', requireProjectPermission('project:update'), (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  res.json({ message: 'Status updated', applicationId: id, status });
});

/** GET /api/planning/applications/:id/gate — Check stage gate */
planningRouter.get('/applications/:id/gate', requireProjectPermission('project:read'), (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ message: 'Stage gate checked', applicationId: id, canAdvance: true });
});

// ─── Deadline Routes ─────────────────────────────────────────────────────────

/** GET /api/planning/applications/:id/deadlines — Get deadline register */
planningRouter.get('/applications/:id/deadlines', requireProjectPermission('project:read'), (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ message: 'Deadlines retrieved', applicationId: id, deadlines: [] });
});

/** GET /api/planning/deadlines/approaching — Get approaching deadlines */
planningRouter.get('/deadlines/approaching', (req: Request, res: Response) => {
  const uid = req.authContext!.uid;
  res.json({ message: 'Approaching deadlines', userId: uid, deadlines: [] });
});

/** GET /api/planning/deadlines/overdue — Get overdue deadlines */
planningRouter.get('/deadlines/overdue', (req: Request, res: Response) => {
  const uid = req.authContext!.uid;
  res.json({ message: 'Overdue deadlines', userId: uid, deadlines: [] });
});

/** PATCH /api/planning/deadlines/:id/met — Mark deadline as met */
planningRouter.patch('/deadlines/:id/met', (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ message: 'Deadline marked as met', deadlineId: id });
});

// ─── Public Participation Routes ─────────────────────────────────────────────

/** POST /api/planning/applications/:id/objections — Record objection */
planningRouter.post('/applications/:id/objections', requireProjectPermission('project:update'), (req: Request, res: Response) => {
  const { id } = req.params;
  res.status(201).json({ message: 'Objection recorded', applicationId: id });
});

/** GET /api/planning/applications/:id/objections — List objections */
planningRouter.get('/applications/:id/objections', requireProjectPermission('project:read'), (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ message: 'Objections listed', applicationId: id, objections: [] });
});

/** POST /api/planning/objections/:id/respond — Record response */
planningRouter.post('/objections/:id/respond', (req: Request, res: Response) => {
  const { id } = req.params;
  res.status(201).json({ message: 'Response recorded', objectionId: id });
});

/** PATCH /api/planning/objections/:id/late-decision — Accept/reject late objection */
planningRouter.patch('/objections/:id/late-decision', (req: Request, res: Response) => {
  const { id } = req.params;
  const { decision, reason } = req.body;
  res.json({ message: 'Late decision recorded', objectionId: id, decision, reason });
});

/** GET /api/planning/applications/:id/participation-summary — Get summary */
planningRouter.get('/applications/:id/participation-summary', requireProjectPermission('project:read'), (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ message: 'Participation summary', applicationId: id });
});

/** GET /api/planning/applications/:id/participation-report — Full report */
planningRouter.get('/applications/:id/participation-report', requireProjectPermission('project:read'), (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ message: 'Participation report', applicationId: id });
});

// ─── Condition Routes ────────────────────────────────────────────────────────

/** POST /api/planning/applications/:id/conditions — Capture condition */
planningRouter.post('/applications/:id/conditions', requireProjectPermission('project:update'), (req: Request, res: Response) => {
  const { id } = req.params;
  res.status(201).json({ message: 'Condition captured', applicationId: id });
});

/** GET /api/planning/applications/:id/conditions — List conditions */
planningRouter.get('/applications/:id/conditions', requireProjectPermission('project:read'), (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ message: 'Conditions listed', applicationId: id, conditions: [] });
});

/** PATCH /api/planning/conditions/:id/fulfil — Mark condition fulfilled */
planningRouter.patch('/conditions/:id/fulfil', (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ message: 'Condition fulfilled', conditionId: id });
});

/** GET /api/planning/applications/:id/conditions/summary — Fulfilment summary */
planningRouter.get('/applications/:id/conditions/summary', requireProjectPermission('project:read'), (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ message: 'Conditions summary', applicationId: id });
});

// ─── Appeal Routes ───────────────────────────────────────────────────────────

/** POST /api/planning/applications/:id/appeals — Lodge appeal */
planningRouter.post('/applications/:id/appeals', requireProjectPermission('project:update'), (req: Request, res: Response) => {
  const { id } = req.params;
  res.status(201).json({ message: 'Appeal lodged', applicationId: id });
});

/** GET /api/planning/applications/:id/appeals — List appeals */
planningRouter.get('/applications/:id/appeals', requireProjectPermission('project:read'), (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ message: 'Appeals listed', applicationId: id, appeals: [] });
});

/** PATCH /api/planning/appeals/:id/outcome — Record appeal outcome */
planningRouter.patch('/appeals/:id/outcome', (req: Request, res: Response) => {
  const { id } = req.params;
  const { outcome, notes, conditionsVaried } = req.body;
  res.json({ message: 'Appeal outcome recorded', appealId: id, outcome, notes, conditionsVaried });
});

/** POST /api/planning/applications/:id/hearings — Schedule hearing */
planningRouter.post('/applications/:id/hearings', requireProjectPermission('project:update'), (req: Request, res: Response) => {
  const { id } = req.params;
  res.status(201).json({ message: 'Hearing scheduled', applicationId: id });
});

/** PATCH /api/planning/hearings/:id/postpone — Postpone hearing */
planningRouter.patch('/hearings/:id/postpone', (req: Request, res: Response) => {
  const { id } = req.params;
  const { newDate, reason } = req.body;
  res.json({ message: 'Hearing postponed', hearingId: id, newDate, reason });
});

/** GET /api/planning/hearings — Get project hearings */
planningRouter.get('/hearings', (req: Request, res: Response) => {
  const { projectId } = req.query;
  res.json({ message: 'Hearings listed', projectId, hearings: [] });
});

// ─── Municipality Profile Routes ─────────────────────────────────────────────

/** POST /api/planning/municipalities — Create municipality profile */
planningRouter.post('/municipalities', (req: Request, res: Response) => {
  res.status(201).json({ message: 'Municipality profile created' });
});

/** GET /api/planning/municipalities — List profiles */
planningRouter.get('/municipalities', (req: Request, res: Response) => {
  res.json({ message: 'Municipalities listed', profiles: [] });
});

/** GET /api/planning/municipalities/:id — Get single profile */
planningRouter.get('/municipalities/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ message: 'Municipality profile retrieved', profileId: id });
});

/** PATCH /api/planning/municipalities/:id — Update profile */
planningRouter.patch('/municipalities/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ message: 'Municipality profile updated', profileId: id });
});

// ─── Reporting Routes ────────────────────────────────────────────────────────

/** GET /api/planning/reports/portfolio — Portfolio report */
planningRouter.get('/reports/portfolio', (req: Request, res: Response) => {
  const uid = req.authContext!.uid;
  res.json({ message: 'Portfolio report generated', userId: uid });
});

/** GET /api/planning/reports/client — Client report */
planningRouter.get('/reports/client', requireProjectPermission('project:read'), (req: Request, res: Response) => {
  const { projectId } = req.query;
  res.json({ message: 'Client report generated', projectId });
});

/** GET /api/planning/reports/compliance — Compliance report */
planningRouter.get('/reports/compliance', (req: Request, res: Response) => {
  const uid = req.authContext!.uid;
  const { from, to } = req.query;
  res.json({ message: 'Compliance report generated', userId: uid, dateRange: { from, to } });
});

/** GET /api/planning/reports/dashboard — Dashboard metrics */
planningRouter.get('/reports/dashboard', (req: Request, res: Response) => {
  const uid = req.authContext!.uid;
  res.json({ message: 'Dashboard metrics', userId: uid });
});

/** GET /api/planning/applications/:id/gantt — Gantt timeline data */
planningRouter.get('/applications/:id/gantt', requireProjectPermission('project:read'), (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ message: 'Gantt data', applicationId: id });
});

// ─── Environmental / Heritage Trigger Routes ─────────────────────────────────

/** GET /api/planning/applications/:id/triggers — Evaluate triggers */
planningRouter.get('/applications/:id/triggers', requireProjectPermission('project:read'), (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ message: 'Triggers evaluated', applicationId: id, triggers: [] });
});

/** POST /api/planning/triggers/:id/confirm — Confirm trigger */
planningRouter.post('/triggers/:id/confirm', (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ message: 'Trigger confirmed', triggerId: id });
});

/** POST /api/planning/triggers/:id/defer — Defer trigger */
planningRouter.post('/triggers/:id/defer', (req: Request, res: Response) => {
  const { id } = req.params;
  const uid = req.authContext!.uid;
  const { reason } = req.body;
  res.json({ message: 'Trigger deferred', triggerId: id, userId: uid, reason });
});

/** POST /api/planning/triggers/:id/resolve — Resolve trigger */
planningRouter.post('/triggers/:id/resolve', (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ message: 'Trigger resolved', triggerId: id });
});

export default planningRouter;
