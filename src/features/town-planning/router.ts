/**
 * Town Planning API Router
 *
 * Express Router for all town planning endpoints.
 * Mounted at /api/town-planning/ in the main server.
 *
 * Authentication: Firebase token via requireAuth middleware (authContext),
 * with header-based fallback in dev/test only.
 * Authorization: Project membership check for project-scoped resources.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { UserRole } from '@/types';
import { checkPermission, buildActorContext } from './services/accessControl';
import type { FirestoreDB } from './services/accessControl';
import {
  createApplication,
  getApplication,
  listApplicationsByProject,
  persistApplication,
  ApplicationValidationError,
} from './services/applicationEngine';
import {
  transitionStage,
  TransitionError,
  getStageHistory,
  getDeadlines,
  persistTransition,
} from './services/workflowTracker';
import {
  createCondition,
  updateConditionStatus,
  getConditionsSummary,
  isConditionsCompliant,
  loadConditions,
  persistCondition,
  ConditionStatusError,
} from './services/conditionsRegister';
import { checkReadiness, getProgressIndicator } from './services/sequentialDependency';
import {
  StageTransitionParamsSchema,
  ConditionInputSchema,
  CommentInputSchema,
  AppealInputSchema,
  ChecklistItemUpdateSchema,
} from './schemas';

// ─── Router Factory ───────────────────────────────────────────────────────────

export interface TownPlanningRouterDeps {
  db: FirestoreDB;
}

/**
 * Create the town planning Express router.
 * Uses dependency injection for Firestore.
 */
export function createTownPlanningRouter(deps: TownPlanningRouterDeps): Router {
  const router = Router();
  const { db } = deps;

  // ─── Auth Middleware ────────────────────────────────────────────────────────

  function extractActor(req: Request) {
    // Primary: Use Firebase auth context from requireAuth middleware
    if ((req as any).authContext) {
      const authCtx = (req as any).authContext;
      return buildActorContext(authCtx.uid, authCtx.role || 'client');
    }

    // Fallback (dev/test only): Header-based auth
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      const userId = req.headers['x-user-id'] as string | undefined;
      const role = req.headers['x-user-role'] as UserRole | undefined;
      if (userId && role) {
        return buildActorContext(userId, role);
      }
    }

    return null;
  }

  async function requireProjectAccess(req: Request, res: Response, projectId: string | undefined): Promise<boolean> {
    const actor = (req as any).__tpActor;
    if (!actor) {
      res.status(401).json({ error: 'Authentication required' });
      return false;
    }

    // Admin/platform_admin bypass project membership
    if (actor.role === 'admin' || actor.role === 'platform_admin') {
      return true;
    }

    if (!projectId) {
      res.status(400).json({ error: 'Project context required' });
      return false;
    }

    const { checkProjectMembership } = await import('./services/projectMembership');
    const result = await checkProjectMembership(db, actor.userId, projectId);

    if (!result.isMember) {
      res.status(403).json({ error: 'Access denied: not a project team member', reason: result.reason });
      return false;
    }

    return true;
  }

  // ─── Applications ─────────────────────────────────────────────────────────

  // POST /api/town-planning/applications
  router.post('/applications', async (req: Request, res: Response) => {
    try {
      const actor = extractActor(req);
      if (!actor) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      (req as any).__tpActor = actor;

      const permCheck = checkPermission(actor.role, 'create_application');
      if (!permCheck.allowed) {
        res.status(403).json({ error: permCheck.reason });
        return;
      }

      const projectId = req.body.projectId as string | undefined;
      const hasAccess = await requireProjectAccess(req, res, projectId);
      if (!hasAccess) return;

      // Use a simple sequence counter (in production, use Firestore counter)
      const seq = Date.now() % 10000;
      const application = createApplication(req.body, seq);
      await persistApplication(db, application);

      res.status(201).json(application);
    } catch (err) {
      if (err instanceof ApplicationValidationError) {
        res.status(400).json({ error: err.message, details: err.details });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/town-planning/applications/:id
  router.get('/applications/:id', async (req: Request, res: Response) => {
    try {
      const actor = extractActor(req);
      if (!actor) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      (req as any).__tpActor = actor;

      const permCheck = checkPermission(actor.role, 'view_application');
      if (!permCheck.allowed) {
        res.status(403).json({ error: permCheck.reason });
        return;
      }

      const application = await getApplication(db, req.params.id);
      if (!application) {
        res.status(404).json({ error: 'Application not found' });
        return;
      }

      const hasAccess = await requireProjectAccess(req, res, application.projectId);
      if (!hasAccess) return;

      res.json(application);
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/town-planning/projects/:projectId/applications
  router.get('/projects/:projectId/applications', async (req: Request, res: Response) => {
    try {
      const actor = extractActor(req);
      if (!actor) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      (req as any).__tpActor = actor;

      const permCheck = checkPermission(actor.role, 'view_application');
      if (!permCheck.allowed) {
        res.status(403).json({ error: permCheck.reason });
        return;
      }

      const hasAccess = await requireProjectAccess(req, res, req.params.projectId);
      if (!hasAccess) return;

      const applications = await listApplicationsByProject(db, req.params.projectId);
      res.json(applications);
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── Stage Transitions ────────────────────────────────────────────────────

  // POST /api/town-planning/applications/:id/transition
  router.post('/applications/:id/transition', async (req: Request, res: Response) => {
    try {
      const actor = extractActor(req);
      if (!actor) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      (req as any).__tpActor = actor;

      const permCheck = checkPermission(actor.role, 'transition_stage');
      if (!permCheck.allowed) {
        res.status(403).json({ error: permCheck.reason });
        return;
      }

      const parseResult = StageTransitionParamsSchema.safeParse({
        ...req.body,
        applicationId: req.params.id,
      });
      if (!parseResult.success) {
        res.status(400).json({ error: 'Invalid input', details: parseResult.error.issues });
        return;
      }

      const application = await getApplication(db, req.params.id);
      if (!application) {
        res.status(404).json({ error: 'Application not found' });
        return;
      }

      const hasAccess = await requireProjectAccess(req, res, application.projectId);
      if (!hasAccess) return;

      const updated = transitionStage(
        application,
        parseResult.data.targetStage,
        parseResult.data.triggeredBy,
        parseResult.data.notes,
      );

      await persistTransition(db, req.params.id, updated);

      // Fire Action Centre event
      const { createActionCentreEvent } = await import('./adapters/actionCentreAdapter');
      await createActionCentreEvent(db, {
        projectId: application.projectId,
        applicationId: req.params.id,
        type: 'stage_transition',
        title: `Application ${application.referenceNumber} moved to ${updated.currentStage}`,
        description: `Stage transition: ${application.currentStage} → ${updated.currentStage}`,
        severity: 'info',
        targetUserId: actor.userId,
        createdAt: new Date().toISOString(),
      });

      res.json(updated);
    } catch (err) {
      if (err instanceof TransitionError) {
        res.status(422).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/town-planning/applications/:id/history
  router.get('/applications/:id/history', async (req: Request, res: Response) => {
    try {
      const actor = extractActor(req);
      if (!actor) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      (req as any).__tpActor = actor;

      const application = await getApplication(db, req.params.id);
      if (!application) {
        res.status(404).json({ error: 'Application not found' });
        return;
      }

      const hasAccess = await requireProjectAccess(req, res, application.projectId);
      if (!hasAccess) return;

      res.json(getStageHistory(application));
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/town-planning/applications/:id/deadlines
  router.get('/applications/:id/deadlines', async (req: Request, res: Response) => {
    try {
      const actor = extractActor(req);
      if (!actor) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      (req as any).__tpActor = actor;

      const application = await getApplication(db, req.params.id);
      if (!application) {
        res.status(404).json({ error: 'Application not found' });
        return;
      }

      const hasAccess = await requireProjectAccess(req, res, application.projectId);
      if (!hasAccess) return;

      res.json(getDeadlines(application));
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── Conditions ───────────────────────────────────────────────────────────

  // POST /api/town-planning/applications/:id/conditions
  router.post('/applications/:id/conditions', async (req: Request, res: Response) => {
    try {
      const actor = extractActor(req);
      if (!actor) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      (req as any).__tpActor = actor;

      const permCheck = checkPermission(actor.role, 'add_condition');
      if (!permCheck.allowed) {
        res.status(403).json({ error: permCheck.reason });
        return;
      }

      const application = await getApplication(db, req.params.id);
      if (!application) {
        res.status(404).json({ error: 'Application not found' });
        return;
      }

      const hasAccess = await requireProjectAccess(req, res, application.projectId);
      if (!hasAccess) return;

      const parseResult = ConditionInputSchema.safeParse({
        ...req.body,
        applicationId: req.params.id,
      });
      if (!parseResult.success) {
        res.status(400).json({ error: 'Invalid input', details: parseResult.error.issues });
        return;
      }

      const condition = createCondition(parseResult.data, actor.userId);
      await persistCondition(db, condition);

      // Fire Action Centre event
      const { createActionCentreEvent } = await import('./adapters/actionCentreAdapter');
      await createActionCentreEvent(db, {
        projectId: application.projectId,
        applicationId: req.params.id,
        type: 'condition_overdue',
        title: `New condition added: ${condition.description.substring(0, 50)}`,
        description: `Condition #${condition.conditionNumber} created and requires compliance`,
        severity: 'info',
        createdAt: new Date().toISOString(),
      });

      res.status(201).json(condition);
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /api/town-planning/conditions/:id/status
  router.patch('/conditions/:id/status', async (req: Request, res: Response) => {
    try {
      const actor = extractActor(req);
      if (!actor) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      (req as any).__tpActor = actor;

      const permCheck = checkPermission(actor.role, 'update_condition');
      if (!permCheck.allowed) {
        res.status(403).json({ error: permCheck.reason });
        return;
      }

      const { targetStatus, waiverReason, evidence } = req.body;
      if (!targetStatus) {
        res.status(400).json({ error: 'targetStatus is required' });
        return;
      }

      // Load condition
      const docRef = db.collection('town_planning_conditions').doc(req.params.id);
      const doc = await docRef.get();
      if (!doc.exists) {
        res.status(404).json({ error: 'Condition not found' });
        return;
      }

      const condData = doc.data();
      const applicationId = condData?.applicationId as string;
      if (applicationId) {
        const application = await getApplication(db, applicationId);
        if (application) {
          const hasAccess = await requireProjectAccess(req, res, application.projectId);
          if (!hasAccess) return;
        }
      }

      const condition = { id: req.params.id, ...doc.data() } as unknown as import('./types').ConditionOfApproval;
      const updated = updateConditionStatus(condition, targetStatus, actor.userId, {
        waiverReason,
        evidence,
      });

      await persistCondition(db, updated);
      res.json(updated);
    } catch (err) {
      if (err instanceof ConditionStatusError) {
        res.status(422).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/town-planning/applications/:id/conditions
  router.get('/applications/:id/conditions', async (req: Request, res: Response) => {
    try {
      const actor = extractActor(req);
      if (!actor) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      (req as any).__tpActor = actor;

      const application = await getApplication(db, req.params.id);
      if (application) {
        const hasAccess = await requireProjectAccess(req, res, application.projectId);
        if (!hasAccess) return;
      }

      const conditions = await loadConditions(db, req.params.id);
      const summary = getConditionsSummary(conditions);
      const compliant = isConditionsCompliant(conditions);

      res.json({ conditions, summary, compliant });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── Sequential Dependency ────────────────────────────────────────────────

  // GET /api/town-planning/projects/:projectId/progress
  router.get('/projects/:projectId/progress', async (req: Request, res: Response) => {
    try {
      const actor = extractActor(req);
      if (!actor) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      (req as any).__tpActor = actor;

      const hasAccess = await requireProjectAccess(req, res, req.params.projectId);
      if (!hasAccess) return;

      // Load application for this project (first one found)
      const applications = await listApplicationsByProject(db, req.params.projectId);
      const application = applications.length > 0 ? applications[0] : null;

      // SDP and building plan would come from their respective collections
      // For now, return progress based on available data
      const progress = getProgressIndicator(application, null, false);
      res.json(progress);
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/town-planning/projects/:projectId/readiness-check
  router.post('/projects/:projectId/readiness-check', async (req: Request, res: Response) => {
    try {
      const actor = extractActor(req);
      if (!actor) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      (req as any).__tpActor = actor;

      const hasAccess = await requireProjectAccess(req, res, req.params.projectId);
      if (!hasAccess) return;

      const { targetPhase } = req.body;
      if (!targetPhase) {
        res.status(400).json({ error: 'targetPhase is required' });
        return;
      }

      const applications = await listApplicationsByProject(db, req.params.projectId);
      const application = applications.length > 0 ? applications[0] : null;

      const readiness = checkReadiness(targetPhase, application, null);
      res.json(readiness);
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
