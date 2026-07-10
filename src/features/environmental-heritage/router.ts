/**
 * Environmental & Heritage Module — API Router
 *
 * Express router for Environmental & Heritage Impact Assessment endpoints.
 * Uses dependency injection pattern for testability.
 * Mounted at `/api/environmental` in both dev and production servers.
 *
 * Role-based access: town_planner, developer, architect, bep, energy_professional, platform_admin
 * All responses include a `disclaimer` field with advisory-only text.
 *
 * Requirements: 15.6, 15.7, 16.7, 16.8, 17.7, 18.8, 19.9, 20.8
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ZodIssue } from 'zod';

import {
  CreateScreeningSchema,
  CreateEAApplicationSchema,
  CreateHeritageAssessmentSchema,
  CreateRODConditionSchema,
  CreateEMPrRecordSchema,
  CreateECOAuditSchema,
  LogEnvironmentalIncidentSchema,
} from './schemas';

import { generateScreeningReport } from './services/eiaChecker';
import { transitionEAApplication, getPermittedTransitions } from './services/eaTracker';
import { transitionHeritageAssessment, getPermittedHeritageTransitions } from './services/heritageWorkflow';
import { transitionCondition } from './services/rodRegister';

import type { UserProfile } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const DISCLAIMER_TEXT =
  'This information is advisory only and does not constitute environmental, heritage, or legal advice. ' +
  'The applicant must engage registered professionals and confirm requirements with the competent authority. ' +
  'Refer to the full gazetted regulations for definitive text.';

const ALLOWED_ROLES = [
  'town_planner',
  'developer',
  'architect',
  'bep',
  'energy_professional',
  'platform_admin',
] as const;

// ─── Dependency Injection Interface ───────────────────────────────────────────

interface EnvironmentalRouterDeps {
  db: FirebaseFirestore.Firestore;
  getUser: (req: Request) => Promise<UserProfile | null>;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Extracts error from a failed ServiceResult (works around TS discriminated union narrowing) */
function getServiceError(result: { success: false; error: { code: string; message: string; details?: unknown } }): { code: string; message: string } {
  return result.error;
}

function isAllowedRole(role: string | undefined): boolean {
  return !!role && (ALLOWED_ROLES as readonly string[]).includes(role);
}

function validationError(res: Response, issues: ZodIssue[]): void {
  res.status(400).json({
    status: 400,
    error: 'VALIDATION_ERROR',
    details: issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    disclaimer: DISCLAIMER_TEXT,
  });
}

function forbiddenError(res: Response, message: string): void {
  res.status(403).json({
    status: 403,
    error: 'FORBIDDEN',
    message,
    disclaimer: DISCLAIMER_TEXT,
  });
}

function transitionError(
  res: Response,
  currentState: string,
  attemptedTarget: string,
  permittedTargets: string[],
): void {
  res.status(409).json({
    status: 409,
    error: 'INVALID_TRANSITION',
    currentState,
    attemptedTarget,
    permittedTargets,
    disclaimer: DISCLAIMER_TEXT,
  });
}

function businessRuleError(res: Response, rule: string, message: string, details?: Record<string, unknown>): void {
  res.status(422).json({
    status: 422,
    error: 'BUSINESS_RULE_VIOLATION',
    rule,
    message,
    details,
    disclaimer: DISCLAIMER_TEXT,
  });
}

// ─── Router Factory ───────────────────────────────────────────────────────────

export function createEnvironmentalRouter(deps: EnvironmentalRouterDeps): Router {
  const router = Router();
  const { db, getUser } = deps;

  // ── Auth & Role Guard Middleware ──────────────────────────────────────────
  router.use(async (req: Request, res: Response, next) => {
    try {
      const user = await getUser(req);
      if (!user) {
        res.status(401).json({ error: 'Authentication required', disclaimer: DISCLAIMER_TEXT });
        return;
      }

      if (!isAllowedRole(user.role)) {
        forbiddenError(
          res,
          `Access denied. Required role(s): ${ALLOWED_ROLES.join(', ')}`,
        );
        return;
      }

      // Attach user to request for downstream handlers
      (req as any)._envUser = user;
      next();
    } catch {
      res.status(401).json({ error: 'Authentication failed', disclaimer: DISCLAIMER_TEXT });
    }
  });

  // ── Helper to get user from request ─────────────────────────────────────
  function getReqUser(req: Request): UserProfile {
    return (req as any)._envUser as UserProfile;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // POST /screenings — Create EIA screening report
  // Requirements: 15.6, 15.7
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/screenings', async (req: Request, res: Response) => {
    try {
      const parsed = CreateScreeningSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, parsed.error.issues);
        return;
      }

      const data = parsed.data;
      const user = getReqUser(req);

      // Province required for accurate LN3 assessment (Req 15.7)
      if (!data.geographicContext.province || data.geographicContext.province.trim() === '') {
        businessRuleError(res, 'PROVINCE_REQUIRED',
          'Province is required for accurate Listing Notice 3 assessment.');
        return;
      }

      const result = generateScreeningReport(
        { projectId: data.projectId, projectName: data.projectName },
        data.activitiesSelected as import('./types').SelectedActivity[],
        data.geographicContext as import('./types').GeographicContext,
        { uid: user.uid, displayName: user.displayName || user.email || user.uid },
        new Date(),
      );

      if (!result.success) {
        const err = getServiceError(result as any);
        businessRuleError(res, err.code, err.message);
        return;
      }

      // Persist to Firestore
      const screening = result.data;
      await db
        .collection(`projects/${data.projectId}/environmental/screenings`)
        .doc(screening.id)
        .set(screening);

      res.status(201).json({ data: screening, disclaimer: DISCLAIMER_TEXT });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error', disclaimer: DISCLAIMER_TEXT });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // GET /ea-applications — List EA applications for a project
  // ════════════════════════════════════════════════════════════════════════════
  router.get('/ea-applications', async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId as string;
      if (!projectId) {
        res.status(400).json({
          status: 400,
          error: 'VALIDATION_ERROR',
          details: [{ field: 'projectId', message: 'projectId query parameter is required' }],
          disclaimer: DISCLAIMER_TEXT,
        });
        return;
      }

      const snapshot = await db
        .collection(`projects/${projectId}/environmental/ea-applications`)
        .orderBy('createdAt', 'desc')
        .get();

      const applications = snapshot.docs.map((doc) => doc.data());
      res.status(200).json({ data: applications, disclaimer: DISCLAIMER_TEXT });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error', disclaimer: DISCLAIMER_TEXT });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // POST /ea-applications — Create EA application
  // Requirement: 16.8
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/ea-applications', async (req: Request, res: Response) => {
    try {
      const parsed = CreateEAApplicationSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, parsed.error.issues);
        return;
      }

      const data = parsed.data;
      const user = getReqUser(req);
      const projectId = req.body.projectId as string;
      if (!projectId) {
        res.status(400).json({
          status: 400,
          error: 'VALIDATION_ERROR',
          details: [{ field: 'projectId', message: 'projectId is required' }],
          disclaimer: DISCLAIMER_TEXT,
        });
        return;
      }

      const now = new Date().toISOString();
      const id = generateId('ea');

      const application = {
        id,
        projectId,
        ...data,
        screeningId: data.screeningId || null,
        currentStage: 'pre_application',
        stageHistory: [{ stage: 'pre_application', date: now.split('T')[0], actor: user.uid }],
        createdAt: now,
        updatedAt: now,
      };

      await db
        .collection(`projects/${projectId}/environmental/ea-applications`)
        .doc(id)
        .set(application);

      res.status(201).json({ data: application, disclaimer: DISCLAIMER_TEXT });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error', disclaimer: DISCLAIMER_TEXT });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // PUT /ea-applications/:id/transition — Advance EA application stage
  // Requirement: 16.8
  // ════════════════════════════════════════════════════════════════════════════
  router.put('/ea-applications/:id/transition', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { projectId, targetStage } = req.body;
      const user = getReqUser(req);

      if (!projectId || !targetStage) {
        res.status(400).json({
          status: 400,
          error: 'VALIDATION_ERROR',
          details: [
            ...(!projectId ? [{ field: 'projectId', message: 'projectId is required' }] : []),
            ...(!targetStage ? [{ field: 'targetStage', message: 'targetStage is required' }] : []),
          ],
          disclaimer: DISCLAIMER_TEXT,
        });
        return;
      }

      // Fetch existing application
      const docRef = db
        .collection(`projects/${projectId}/environmental/ea-applications`)
        .doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        res.status(404).json({ error: 'EA application not found', disclaimer: DISCLAIMER_TEXT });
        return;
      }

      const application = doc.data() as any;

      // Attempt transition using service
      const result = transitionEAApplication(application, targetStage, { actorId: user.uid });

      if (!result.success) {
        const err = getServiceError(result as any);
        businessRuleError(res, err.code, err.message);
        return;
      }

      if (!result.data.valid) {
        // Get permitted transitions for error response
        const assessmentType = application.assessmentType as 'basic_assessment' | 'scoping_and_eir';
        const permitted = getPermittedTransitions(assessmentType, application.currentStage);
        const permittedTargets = permitted.success ? permitted.data : [];
        transitionError(res, application.currentStage, targetStage, permittedTargets);
        return;
      }

      const updated = result.data.next;
      await docRef.update({
        currentStage: updated.currentStage,
        stageHistory: updated.stageHistory,
        updatedAt: updated.updatedAt,
        ...(updated.decisionOutcome ? { decisionOutcome: updated.decisionOutcome } : {}),
        ...(updated.decisionDate ? { decisionDate: updated.decisionDate } : {}),
        ...(updated.appealPeriodEndDate ? { appealPeriodEndDate: updated.appealPeriodEndDate } : {}),
      });

      res.status(200).json({ data: updated, disclaimer: DISCLAIMER_TEXT });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error', disclaimer: DISCLAIMER_TEXT });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // GET /heritage — List heritage assessments for a project
  // ════════════════════════════════════════════════════════════════════════════
  router.get('/heritage', async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId as string;
      if (!projectId) {
        res.status(400).json({
          status: 400,
          error: 'VALIDATION_ERROR',
          details: [{ field: 'projectId', message: 'projectId query parameter is required' }],
          disclaimer: DISCLAIMER_TEXT,
        });
        return;
      }

      const snapshot = await db
        .collection(`projects/${projectId}/environmental/heritage`)
        .orderBy('createdAt', 'desc')
        .get();

      const assessments = snapshot.docs.map((doc) => doc.data());
      res.status(200).json({ data: assessments, disclaimer: DISCLAIMER_TEXT });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error', disclaimer: DISCLAIMER_TEXT });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // POST /heritage — Create heritage assessment
  // Requirement: 17.7
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/heritage', async (req: Request, res: Response) => {
    try {
      const parsed = CreateHeritageAssessmentSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, parsed.error.issues);
        return;
      }

      const data = parsed.data;
      const user = getReqUser(req);
      const projectId = req.body.projectId as string;
      if (!projectId) {
        res.status(400).json({
          status: 400,
          error: 'VALIDATION_ERROR',
          details: [{ field: 'projectId', message: 'projectId is required' }],
          disclaimer: DISCLAIMER_TEXT,
        });
        return;
      }

      const now = new Date().toISOString();
      const id = generateId('hrt');

      const assessment = {
        id,
        projectId,
        ...data,
        currentStage: 'notification_submitted',
        stageHistory: [{ stage: 'notification_submitted', date: now.split('T')[0], actor: user.uid }],
        createdAt: now,
        updatedAt: now,
      };

      await db
        .collection(`projects/${projectId}/environmental/heritage`)
        .doc(id)
        .set(assessment);

      res.status(201).json({ data: assessment, disclaimer: DISCLAIMER_TEXT });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error', disclaimer: DISCLAIMER_TEXT });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // PUT /heritage/:id/transition — Advance heritage assessment stage
  // Requirement: 17.7
  // ════════════════════════════════════════════════════════════════════════════
  router.put('/heritage/:id/transition', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { projectId, targetStage, practitioner, permitReferenceNumber, conditions } = req.body;
      const user = getReqUser(req);

      if (!projectId || !targetStage) {
        res.status(400).json({
          status: 400,
          error: 'VALIDATION_ERROR',
          details: [
            ...(!projectId ? [{ field: 'projectId', message: 'projectId is required' }] : []),
            ...(!targetStage ? [{ field: 'targetStage', message: 'targetStage is required' }] : []),
          ],
          disclaimer: DISCLAIMER_TEXT,
        });
        return;
      }

      // Fetch existing assessment
      const docRef = db
        .collection(`projects/${projectId}/environmental/heritage`)
        .doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        res.status(404).json({ error: 'Heritage assessment not found', disclaimer: DISCLAIMER_TEXT });
        return;
      }

      const assessment = doc.data() as any;

      // Attempt transition using service
      const result = transitionHeritageAssessment(assessment, targetStage, {
        actorId: user.uid,
        practitioner,
        permitReferenceNumber,
        conditions,
      });

      if (!result.success) {
        const err = getServiceError(result as any);
        businessRuleError(res, err.code, err.message);
        return;
      }

      if (!result.data.valid) {
        const permitted = getPermittedHeritageTransitions(assessment.currentStage);
        const permittedTargets = permitted.success ? permitted.data : [];
        transitionError(res, assessment.currentStage, targetStage, permittedTargets);
        return;
      }

      const updated = result.data.next;
      await docRef.update({
        currentStage: updated.currentStage,
        stageHistory: updated.stageHistory,
        updatedAt: updated.updatedAt,
        ...(updated.assessmentPractitioner ? { assessmentPractitioner: updated.assessmentPractitioner } : {}),
        ...(updated.permitReferenceNumber ? { permitReferenceNumber: updated.permitReferenceNumber } : {}),
        ...(updated.determinationDate ? { determinationDate: updated.determinationDate } : {}),
        ...(updated.conditions ? { conditions: updated.conditions } : {}),
      });

      res.status(200).json({ data: updated, disclaimer: DISCLAIMER_TEXT });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error', disclaimer: DISCLAIMER_TEXT });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // GET /rod-conditions — List ROD conditions for a project
  // ════════════════════════════════════════════════════════════════════════════
  router.get('/rod-conditions', async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId as string;
      if (!projectId) {
        res.status(400).json({
          status: 400,
          error: 'VALIDATION_ERROR',
          details: [{ field: 'projectId', message: 'projectId query parameter is required' }],
          disclaimer: DISCLAIMER_TEXT,
        });
        return;
      }

      const snapshot = await db
        .collection(`projects/${projectId}/environmental/rod-conditions`)
        .orderBy('createdAt', 'desc')
        .get();

      const conditions = snapshot.docs.map((doc) => doc.data());
      res.status(200).json({ data: conditions, disclaimer: DISCLAIMER_TEXT });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error', disclaimer: DISCLAIMER_TEXT });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // POST /rod-conditions — Create ROD condition
  // Requirement: 18.8
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/rod-conditions', async (req: Request, res: Response) => {
    try {
      const parsed = CreateRODConditionSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, parsed.error.issues);
        return;
      }

      const data = parsed.data;
      const user = getReqUser(req);
      const projectId = req.body.projectId as string;
      if (!projectId) {
        res.status(400).json({
          status: 400,
          error: 'VALIDATION_ERROR',
          details: [{ field: 'projectId', message: 'projectId is required' }],
          disclaimer: DISCLAIMER_TEXT,
        });
        return;
      }

      const now = new Date().toISOString();
      const id = generateId('rod');

      const condition = {
        id,
        projectId,
        ...data,
        state: 'outstanding',
        evidence: [],
        stageHistory: [{ state: 'outstanding', date: now.split('T')[0], actor: user.uid }],
        createdAt: now,
        updatedAt: now,
      };

      await db
        .collection(`projects/${projectId}/environmental/rod-conditions`)
        .doc(id)
        .set(condition);

      res.status(201).json({ data: condition, disclaimer: DISCLAIMER_TEXT });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error', disclaimer: DISCLAIMER_TEXT });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // PUT /rod-conditions/:id/transition — Advance ROD condition state
  // Requirement: 18.8
  // ════════════════════════════════════════════════════════════════════════════
  router.put('/rod-conditions/:id/transition', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { projectId, targetState } = req.body;
      const user = getReqUser(req);

      if (!projectId || !targetState) {
        res.status(400).json({
          status: 400,
          error: 'VALIDATION_ERROR',
          details: [
            ...(!projectId ? [{ field: 'projectId', message: 'projectId is required' }] : []),
            ...(!targetState ? [{ field: 'targetState', message: 'targetState is required' }] : []),
          ],
          disclaimer: DISCLAIMER_TEXT,
        });
        return;
      }

      // Fetch existing condition
      const docRef = db
        .collection(`projects/${projectId}/environmental/rod-conditions`)
        .doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        res.status(404).json({ error: 'ROD condition not found', disclaimer: DISCLAIMER_TEXT });
        return;
      }

      const condition = doc.data() as any;

      // Attempt transition using service
      const result = transitionCondition(
        condition,
        targetState,
        { id: user.uid, displayName: user.displayName || user.email || user.uid },
      );

      if (!result.success) {
        const err = getServiceError(result as any);
        businessRuleError(res, err.code, err.message);
        return;
      }

      if (!result.data.valid) {
        // Determine permitted targets for the error response
        const stateOrder = ['outstanding', 'in_progress', 'evidence_submitted', 'verified_compliant'];
        const currentIdx = stateOrder.indexOf(condition.state);
        const permittedTargets = currentIdx < stateOrder.length - 1
          ? [stateOrder[currentIdx + 1]]
          : [];
        transitionError(res, condition.state, targetState, permittedTargets);
        return;
      }

      const updated = result.data.next;
      await docRef.update({
        state: updated.state,
        stageHistory: updated.stageHistory,
        updatedAt: updated.updatedAt,
      });

      res.status(200).json({ data: updated, disclaimer: DISCLAIMER_TEXT });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error', disclaimer: DISCLAIMER_TEXT });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // GET /empr — List EMPr records for a project
  // ════════════════════════════════════════════════════════════════════════════
  router.get('/empr', async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId as string;
      if (!projectId) {
        res.status(400).json({
          status: 400,
          error: 'VALIDATION_ERROR',
          details: [{ field: 'projectId', message: 'projectId query parameter is required' }],
          disclaimer: DISCLAIMER_TEXT,
        });
        return;
      }

      const snapshot = await db
        .collection(`projects/${projectId}/environmental/empr`)
        .orderBy('createdAt', 'desc')
        .get();

      const records = snapshot.docs.map((doc) => doc.data());
      res.status(200).json({ data: records, disclaimer: DISCLAIMER_TEXT });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error', disclaimer: DISCLAIMER_TEXT });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // POST /empr — Create EMPr record
  // Requirement: 19.9
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/empr', async (req: Request, res: Response) => {
    try {
      const parsed = CreateEMPrRecordSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, parsed.error.issues);
        return;
      }

      const data = parsed.data;
      const user = getReqUser(req);
      const projectId = req.body.projectId as string;
      if (!projectId) {
        res.status(400).json({
          status: 400,
          error: 'VALIDATION_ERROR',
          details: [{ field: 'projectId', message: 'projectId is required' }],
          disclaimer: DISCLAIMER_TEXT,
        });
        return;
      }

      const now = new Date().toISOString();
      const id = generateId('empr');

      const record = {
        id,
        projectId,
        ...data,
        createdAt: now,
        updatedAt: now,
      };

      await db
        .collection(`projects/${projectId}/environmental/empr`)
        .doc(id)
        .set(record);

      res.status(201).json({ data: record, disclaimer: DISCLAIMER_TEXT });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error', disclaimer: DISCLAIMER_TEXT });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // POST /empr/:id/audits — Create ECO audit for EMPr
  // Requirement: 19.9
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/empr/:id/audits', async (req: Request, res: Response) => {
    try {
      const { id: emprId } = req.params;
      const parsed = CreateECOAuditSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, parsed.error.issues);
        return;
      }

      const data = parsed.data;
      const user = getReqUser(req);
      const projectId = req.body.projectId as string;
      if (!projectId) {
        res.status(400).json({
          status: 400,
          error: 'VALIDATION_ERROR',
          details: [{ field: 'projectId', message: 'projectId is required' }],
          disclaimer: DISCLAIMER_TEXT,
        });
        return;
      }

      // Verify EMPr record exists
      const emprDoc = await db
        .collection(`projects/${projectId}/environmental/empr`)
        .doc(emprId)
        .get();

      if (!emprDoc.exists) {
        res.status(404).json({ error: 'EMPr record not found', disclaimer: DISCLAIMER_TEXT });
        return;
      }

      const now = new Date().toISOString();
      const auditId = generateId('aud');

      const audit = {
        id: auditId,
        emprId,
        projectId,
        ...data,
        auditReportRef: data.auditReportRef || null,
        correctiveActions: [],
        createdAt: now,
      };

      await db
        .collection(`projects/${projectId}/environmental/empr/${emprId}/audits`)
        .doc(auditId)
        .set(audit);

      res.status(201).json({ data: audit, disclaimer: DISCLAIMER_TEXT });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error', disclaimer: DISCLAIMER_TEXT });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // POST /empr/:id/incidents — Log environmental incident
  // Requirement: 19.9
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/empr/:id/incidents', async (req: Request, res: Response) => {
    try {
      const { id: emprId } = req.params;
      const parsed = LogEnvironmentalIncidentSchema.safeParse(req.body);
      if (!parsed.success) {
        validationError(res, parsed.error.issues);
        return;
      }

      const data = parsed.data;
      const user = getReqUser(req);
      const projectId = req.body.projectId as string;

      if (!projectId) {
        res.status(400).json({
          status: 400,
          error: 'VALIDATION_ERROR',
          details: [{ field: 'projectId', message: 'projectId is required' }],
          disclaimer: DISCLAIMER_TEXT,
        });
        return;
      }

      // Verify EMPr record exists
      const emprDoc = await db
        .collection(`projects/${projectId}/environmental/empr`)
        .doc(emprId)
        .get();

      if (!emprDoc.exists) {
        res.status(404).json({ error: 'EMPr record not found', disclaimer: DISCLAIMER_TEXT });
        return;
      }

      const now = new Date().toISOString();
      const incidentId = generateId('inc');

      const incident = {
        id: incidentId,
        emprId,
        projectId,
        ...data,
        reportedBy: user.uid,
        createdAt: now,
      };

      await db
        .collection(`projects/${projectId}/environmental/empr/${emprId}/incidents`)
        .doc(incidentId)
        .set(incident);

      res.status(201).json({ data: incident, disclaimer: DISCLAIMER_TEXT });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error', disclaimer: DISCLAIMER_TEXT });
    }
  });

  return router;
}
