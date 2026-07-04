/**
 * SpecForge API Router — Express 5 dedicated router for specification engine endpoints.
 *
 * Mounted at `/api/specforge` in both dev and production servers.
 * All routes require authentication via `requireAuth`.
 * Role-based capability enforcement via `requireCapability` middleware.
 *
 * Requirements: 4.1–4.12, 5.1–5.10, 6.1–6.4
 */
import { Router } from 'express';
import type { Request, Response, RequestHandler } from 'express';
import { requireAuth } from './roleMiddleware';
import { toSpecForgeRole } from '@/types/specforgeTypes';
import type { SpecApproval, SpecCapability, SpecForgeWorkspace, SpecIssueRecipient, SpecItem, SpecIssuer, SpecSection, SpecSubstitution } from '@/types/specforgeTypes';
import type { UserRole } from '@/types';
import { getSpecForgeRepository, initSpecForgeRepository, setSpecForgeRepository } from '@/services/specforge/specforgeRepository';
import type { SpecForgeRepository } from '@/services/specforge/specforgeRepository';
import { specRoleCan, issueSpecification, getVisibleSpecItems } from '@/services/specforge/specforgeService';
import {
  specItemSchema,
  specItemUpdateSchema,
  specSectionSchema,
  specSectionUpdateSchema,
  specApprovalSchema,
  specSubstitutionSchema,
  specProcurementEntryUpdateSchema,
  issueRequestSchema,
} from '@/services/specforge/specforgeSchemas';
import {
  SpecForgeValidationError,
  SpecForgeNotFoundError,
  SpecForgeCapabilityError,
} from '@/services/specforge/specforgeErrors';
import { logSpecForgeAction } from '@/services/specforge/specforgeAuditAdapter';
import { resolveDrawingRefs, buildDrawingWarnings } from '@/services/specforge/specforgeDrawingAdapter';
import type { DrawingRefResolution, StructuredWarning } from '@/services/specforge/specforgeDrawingAdapter';
import { adminDb } from '@/lib/firebase-admin';
import { getDefaultSectionsForDiscipline } from '@/services/specforge/specforgeDisciplineSections';
import {
  emitApprovalCreatedEvent,
  emitClientDecisionEvent,
  emitIssueNotifications,
  emitSubstitutionEvent,
  emitBudgetWarning,
  emitLongLeadWarning,
} from '@/services/specforge/specforgeInboxAdapter';
import { createSpecIssuedWorkflowEvent } from '@/services/projectPassportService';

const specforgeRouter = Router();

// ── Router-level auth: ALL specforge routes require authentication ───────────
specforgeRouter.use(requireAuth);

// ── Lazy-init production repository on first request (server-side only) ─────
let _repoInitialized = false;
specforgeRouter.use(async (_req, _res, next) => {
  if (!_repoInitialized) {
    _repoInitialized = true;
    const repo = await initSpecForgeRepository();
    setSpecForgeRepository(repo);
  }
  next();
});

// ── requireCapability middleware ─────────────────────────────────────────────

/**
 * Middleware that maps the authenticated user's platform role to a SpecForge role
 * and verifies they have the specified capability.
 *
 * Requirements: 6.1, 6.3, 6.4
 */
function requireCapability(capability: SpecCapability): RequestHandler {
  return (req: Request, res: Response, next) => {
    const role = toSpecForgeRole(req.authContext!.role as UserRole);
    if (!role) {
      res.status(403).json({ error: 'No SpecForge access for this role' });
      return;
    }
    if (!specRoleCan(role, capability)) {
      res.status(403).json({ error: `Capability denied: ${capability}` });
      return;
    }
    next();
  };
}

// ── requireProjectMember middleware ──────────────────────────────────────────

/**
 * Middleware that verifies the authenticated user is a member of the project team.
 * Uses the shared checkProjectMembership utility for canonical membership checks.
 *
 * Requirements: 6.2
 */
import { checkProjectMembership } from '@/lib/projectMembership';

const requireProjectMember: RequestHandler = async (req: Request, res: Response, next) => {
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: 'Project ID required' });
    return;
  }
  try {
    const uid = req.authContext!.uid;
    const role = req.authContext!.role || req.authContext!.normalizedRole || 'client';
    const membership = await checkProjectMembership(uid, role, projectId);

    if (!membership.isMember && !membership.isAdmin) {
      res.status(403).json({ error: 'Not a member of this project' });
      return;
    }
    next();
  } catch {
    res.status(500).json({ error: 'Authorization check failed' });
    return;
  }
};

// Apply project membership check to all :projectId routes
specforgeRouter.param('projectId', (req, _res, next) => {
  // The param callback just marks it so the middleware fires
  next();
});
specforgeRouter.use('/:projectId', requireProjectMember);

// ── Error mapper ─────────────────────────────────────────────────────────────

/**
 * Map domain errors to HTTP status codes.
 * - SpecForgeValidationError → 400
 * - SpecForgeCapabilityError → 403
 * - SpecForgeNotFoundError → 404
 * - Duplicate/conflict errors → 409
 * - Generic errors with known messages → 400
 * - All others → 500
 */
function handleError(err: unknown, res: Response): void {
  if (err instanceof SpecForgeValidationError) {
    res.status(400).json({ error: 'Validation failed', details: err.zodErrors });
    return;
  }
  if (err instanceof SpecForgeCapabilityError) {
    res.status(403).json({ error: err.message });
    return;
  }
  if (err instanceof SpecForgeNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof Error) {
    // Duplicate snapshot or conflict errors
    if (err.message.includes('already exists') || err.message.includes('duplicate')) {
      res.status(409).json({ error: err.message });
      return;
    }
    // Business logic errors (e.g., issue blocked by readiness findings)
    if (err.message.startsWith('Cannot issue') || err.message.startsWith('Role "')) {
      res.status(400).json({ error: err.message });
      return;
    }
    // Authentication errors
    if (err.message.includes('Authentication') || err.message.includes('auth')) {
      res.status(401).json({ error: err.message });
      return;
    }
  }
  console.error('[SpecForge API] Internal error:', err);
  res.status(500).json({ error: 'Internal server error' });
}

// ── Auto-Workspace Creation ──────────────────────────────────────────────────

/**
 * Creates a default workspace for a project that has no existing workspace.
 * Fetches project metadata from Firestore to populate the workspace name and
 * seed sections from the project's discipline (if defined).
 *
 * Requirements: 11.1, 11.2, 11.5
 */
async function createDefaultWorkspace(
  projectId: string,
  repo: SpecForgeRepository,
): Promise<SpecForgeWorkspace> {
  // Fetch project metadata from Firestore
  let projectName = 'Untitled Project';
  let discipline: string | undefined;
  let stage = 'design';
  let profile = '';

  try {
    const projectSnap = await adminDb.collection('projects').doc(projectId).get();
    if (projectSnap.exists) {
      const projectData = projectSnap.data()!;
      projectName = projectData.name || projectData.projectName || projectData.title || 'Untitled Project';
      discipline = projectData.discipline;
      stage = projectData.currentStage || 'design';
      profile = projectData.profile || projectData.category || '';

      // If no top-level discipline, try to derive from the lead professional's discipline
      if (!discipline && projectData.teamMembers && Array.isArray(projectData.teamMembers)) {
        const leadMember = projectData.teamMembers.find(
          (m: { role?: string; discipline?: string }) =>
            m.role === 'architect' || m.role === 'bep',
        );
        if (leadMember?.discipline) {
          discipline = leadMember.discipline;
        }
      }
    }
  } catch {
    // If we can't fetch project metadata, proceed with defaults
  }

  // Seed sections from discipline (or empty if no discipline defined)
  const sections: SpecSection[] = discipline
    ? getDefaultSectionsForDiscipline(discipline)
    : [];

  const workspace: SpecForgeWorkspace = {
    id: `ws-${projectId}`,
    projectId,
    projectName,
    stage,
    profile,
    revision: 'A',
    issueStatus: 'draft',
    sections,
    items: [],
  };

  // Persist to Firestore before returning
  await repo.saveWorkspace(workspace);

  return workspace;
}

// ── CRUD Routes ──────────────────────────────────────────────────────────────

/**
 * GET /:projectId/workspace — Retrieve workspace with role-filtered items.
 * If no workspace exists, auto-creates one seeded from project metadata.
 * Requirements: 4.1, 6.5–6.9, 10.3, 10.5, 10.6, 11.1, 11.2, 11.5
 */
specforgeRouter.get('/:projectId/workspace', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const repo = getSpecForgeRepository();
    let workspace = await repo.getWorkspace(projectId);

    if (!workspace) {
      // Auto-create workspace for this project (Requirements: 11.1, 11.2, 11.5)
      workspace = await createDefaultWorkspace(projectId, repo);
    }

    // Rehydrate items/sections from subcollections (Blocker #7)
    // Items/sections added via POST endpoints write to subcollections,
    // so we need to merge them into the workspace object.
    try {
      const itemsSnap = await adminDb.collection('projects').doc(projectId).collection('specItems').get();
      if (!itemsSnap.empty) {
        const subItems = itemsSnap.docs.map((doc) => doc.data() as SpecItem);
        const existingIds = new Set(workspace.items.map((i) => i.id));
        for (const item of subItems) {
          if (!existingIds.has(item.id)) {
            workspace.items.push(item);
          }
        }
      }

      const sectionsSnap = await adminDb.collection('projects').doc(projectId).collection('specSections').get();
      if (!sectionsSnap.empty) {
        const subSections = sectionsSnap.docs.map((doc) => doc.data() as SpecSection);
        const existingSectionIds = new Set(workspace.sections.map((s) => s.id));
        for (const section of subSections) {
          if (!existingSectionIds.has(section.id)) {
            workspace.sections.push(section);
          }
        }
      }
    } catch {
      // If subcollection queries fail, proceed with workspace data as-is
    }

    // Apply role-based item filtering
    const role = toSpecForgeRole(req.authContext!.role as UserRole);
    if (!role) {
      res.status(403).json({ error: 'No SpecForge access for this role' });
      return;
    }

    const visibleItems = getVisibleSpecItems(workspace, role, req.authContext!.uid);

    // Resolve drawing references for items that have them (Requirements: 10.3, 10.5, 10.6)
    const itemsWithDrawings = visibleItems.filter(
      (item) => item.drawingRefs && item.drawingRefs.length > 0,
    );

    let drawingResolutionsMap: Record<string, DrawingRefResolution> = {};
    let drawingWarnings: StructuredWarning[] = [];
    let degraded: { drawingRegister: boolean } | undefined;

    if (itemsWithDrawings.length > 0) {
      // Collect all unique drawing refs across all items
      const allRefs = Array.from(
        new Set(itemsWithDrawings.flatMap((item) => item.drawingRefs)),
      );

      // Resolve all refs in a single call
      const resolutionResult = await resolveDrawingRefs(allRefs, projectId);

      // Build lookup map keyed by drawingRef
      for (const resolution of resolutionResult.resolutions) {
        drawingResolutionsMap[resolution.drawingRef] = resolution;
      }

      // Build structured warnings for superseded drawings
      drawingWarnings = buildDrawingWarnings(resolutionResult.resolutions);

      // Set degraded flag if Drawing Register was unavailable
      if (resolutionResult.degraded) {
        degraded = { drawingRegister: true };
      }
    }

    // Enrich items with their resolved drawing data
    const enrichedItems = visibleItems.map((item) => {
      if (!item.drawingRefs || item.drawingRefs.length === 0) {
        return item;
      }
      const itemResolutions = item.drawingRefs
        .map((ref) => drawingResolutionsMap[ref])
        .filter(Boolean);
      return { ...item, drawingResolutions: itemResolutions };
    });

    const response: Record<string, unknown> = {
      ...workspace,
      items: enrichedItems,
    };

    if (drawingWarnings.length > 0) {
      response.drawingWarnings = drawingWarnings;
    }

    if (degraded) {
      response.degraded = degraded;
    }

    res.status(200).json(response);
  } catch (err) {
    handleError(err, res);
  }
});

/**
 * POST /:projectId/items — Create a new spec item.
 * Requirements: 4.2, 4.12
 */
specforgeRouter.post(
  '/:projectId/items',
  requireCapability('edit_spec'),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const parsed = specItemSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new SpecForgeValidationError(parsed.error.issues);
      }
      const item = parsed.data as SpecItem;
      const repo = getSpecForgeRepository();
      await repo.addItem(projectId, item);

      // Await audit log (Blocker #6)
      await logSpecForgeAction({
        action: 'created',
        targetId: item.id,
        targetType: 'item',
        performedBy: req.authContext!.uid,
        projectId,
        newValue: JSON.stringify(item),
      });

      // Wire inbox adapters (Blocker #9): check budget/long-lead warnings
      await emitBudgetWarning(item, projectId);
      await emitLongLeadWarning(item, projectId);

      res.status(201).json(item);
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * PATCH /:projectId/items/:itemId — Update an existing spec item.
 * Requirements: 4.3, 4.12
 */
specforgeRouter.patch(
  '/:projectId/items/:itemId',
  requireCapability('edit_spec'),
  async (req: Request, res: Response) => {
    try {
      const { projectId, itemId } = req.params;
      const parsed = specItemUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new SpecForgeValidationError(parsed.error.issues);
      }
      const updates = parsed.data as Partial<SpecItem>;
      const repo = getSpecForgeRepository();
      await repo.updateItem(projectId, itemId, updates);

      // Await audit log (Blocker #6)
      await logSpecForgeAction({
        action: 'updated',
        targetId: itemId,
        targetType: 'item',
        performedBy: req.authContext!.uid,
        projectId,
        newValue: JSON.stringify(updates),
      });

      // Wire inbox adapters (Blocker #9): emit client decision event if status becomes needs_decision
      if (updates.status === 'needs_decision') {
        const updatedItem: SpecItem = { id: itemId, ...updates } as SpecItem;
        await emitClientDecisionEvent(updatedItem, projectId);
      }

      // Check budget/long-lead warnings on cost/lead time changes
      if (updates.estimatedCost !== undefined || updates.budgetAllowance !== undefined || updates.leadTimeDays !== undefined) {
        const workspace = await repo.getWorkspace(projectId);
        const fullItem = workspace?.items.find(i => i.id === itemId);
        if (fullItem) {
          const merged = { ...fullItem, ...updates };
          await emitBudgetWarning(merged, projectId);
          await emitLongLeadWarning(merged, projectId);
        }
      }

      res.status(200).json({ id: itemId, ...updates });
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * DELETE /:projectId/items/:itemId — Delete a spec item.
 * Requirements: 4.4
 */
specforgeRouter.delete(
  '/:projectId/items/:itemId',
  requireCapability('edit_spec'),
  async (req: Request, res: Response) => {
    try {
      const { projectId, itemId } = req.params;
      const repo = getSpecForgeRepository();
      await repo.deleteItem(projectId, itemId);

      // Await audit log (Blocker #6)
      await logSpecForgeAction({
        action: 'status_changed',
        targetId: itemId,
        targetType: 'item',
        performedBy: req.authContext!.uid,
        projectId,
        newValue: 'deleted',
      });

      res.status(200).json({ deleted: itemId });
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * POST /:projectId/sections — Create a new spec section.
 * Requirements: 4.5, 4.12
 */
specforgeRouter.post(
  '/:projectId/sections',
  requireCapability('edit_spec'),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const parsed = specSectionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new SpecForgeValidationError(parsed.error.issues);
      }
      const section = parsed.data as SpecSection;
      const repo = getSpecForgeRepository();
      await repo.addSection(projectId, section);

      // Await audit log (Blocker #6)
      await logSpecForgeAction({
        action: 'created',
        targetId: section.id,
        targetType: 'section',
        performedBy: req.authContext!.uid,
        projectId,
        newValue: JSON.stringify(section),
      });

      res.status(201).json(section);
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * PATCH /:projectId/sections/:sectionId — Update an existing section.
 * Requirements: 4.6, 4.12
 */
specforgeRouter.patch(
  '/:projectId/sections/:sectionId',
  requireCapability('edit_spec'),
  async (req: Request, res: Response) => {
    try {
      const { projectId, sectionId } = req.params;
      const parsed = specSectionUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new SpecForgeValidationError(parsed.error.issues);
      }
      const updates = parsed.data as Partial<SpecSection>;
      const repo = getSpecForgeRepository();
      await repo.updateSection(projectId, sectionId, updates);

      // Await audit log (Blocker #6)
      await logSpecForgeAction({
        action: 'updated',
        targetId: sectionId,
        targetType: 'section',
        performedBy: req.authContext!.uid,
        projectId,
        newValue: JSON.stringify(updates),
      });

      res.status(200).json({ id: sectionId, ...updates });
    } catch (err) {
      handleError(err, res);
    }
  },
);

// ── Workflow Routes ──────────────────────────────────────────────────────────

/**
 * POST /:projectId/issue — Issue the specification (create snapshot).
 * Requirements: 5.1–5.3
 */
specforgeRouter.post(
  '/:projectId/issue',
  requireCapability('issue_spec'),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const parsed = issueRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new SpecForgeValidationError(parsed.error.issues);
      }

      const repo = getSpecForgeRepository();
      const workspace = await repo.getWorkspace(projectId);
      if (!workspace) {
        res.status(404).json({ error: 'Workspace not found' });
        return;
      }

      // Derive issuer from auth context, not request body (Blocker #8)
      const issuer: SpecIssuer = {
        userId: req.authContext!.uid,
        name: (req.authContext!.decoded as Record<string, string>).displayName
          || (req.authContext!.decoded as Record<string, string>).name
          || (req.authContext!.decoded as Record<string, string>).email
          || 'Unknown',
        role: toSpecForgeRole(req.authContext!.role as UserRole) || 'architect',
      };
      const { recipients } = parsed.data;
      const typedRecipients = recipients as SpecIssueRecipient[];
      const result = issueSpecification(workspace, issuer, typedRecipients);

      // Persist snapshot
      await repo.saveSnapshot(result.snapshot);

      // Await audit log (Blocker #6)
      await logSpecForgeAction({
        action: 'issued',
        targetId: result.snapshot.snapshotId,
        targetType: 'snapshot',
        performedBy: req.authContext!.uid,
        projectId,
        snapshotId: result.snapshot.snapshotId,
        revision: result.snapshot.revision,
        auditHash: result.snapshot.auditHash,
      });

      // Wire inbox/passport adapters (Blocker #9)
      await emitIssueNotifications(result.snapshot, typedRecipients);
      createSpecIssuedWorkflowEvent({
        projectId,
        snapshotId: result.snapshot.snapshotId,
        issuedAt: result.snapshot.issuedAt,
        revision: result.snapshot.revision,
      });

      res.status(201).json(result);
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * POST /:projectId/approvals — Create an approval record.
 * Requirements: 5.4
 */
specforgeRouter.post(
  '/:projectId/approvals',
  requireCapability('approve_technical_section'),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const parsed = specApprovalSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new SpecForgeValidationError(parsed.error.issues);
      }
      const approval = parsed.data as SpecApproval;
      const repo = getSpecForgeRepository();
      await repo.saveApproval(projectId, approval);

      // Await audit log (Blocker #6)
      await logSpecForgeAction({
        action: 'approved',
        targetId: approval.id,
        targetType: 'item',
        performedBy: req.authContext!.uid,
        projectId,
        newValue: JSON.stringify(approval),
      });

      // Wire inbox adapter (Blocker #9): emit approval created event
      try {
        const workspace = await repo.getWorkspace(projectId);
        const item = workspace?.items.find(i => i.id === approval.itemId);
        if (item) {
          await emitApprovalCreatedEvent(approval, item, projectId);
        }
      } catch {
        // Non-critical: don't fail the request if inbox emission fails
      }

      res.status(201).json(approval);
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * PATCH /:projectId/approvals/:approvalId — Update approval decision.
 * Requirements: 5.5
 */
specforgeRouter.patch(
  '/:projectId/approvals/:approvalId',
  requireCapability('approve_technical_section'),
  async (req: Request, res: Response) => {
    try {
      const { projectId, approvalId } = req.params;
      const { decision, comments } = req.body;

      if (!decision) {
        res.status(400).json({ error: 'decision is required' });
        return;
      }

      // Enforce decidedBy from auth context (Blocker #4)
      const decidedBy = req.authContext!.uid;

      const updates = {
        decision,
        decidedBy,
        decidedAt: new Date().toISOString(),
        ...(comments && { comments }),
      };

      const repo = getSpecForgeRepository();
      const approvals = await repo.getApprovals(projectId);
      const existing = approvals.find(a => a.id === approvalId);
      if (!existing) {
        throw new SpecForgeNotFoundError('Approval', approvalId);
      }

      const updated = { ...existing, ...updates };
      await repo.saveApproval(projectId, updated);

      // Await audit log (Blocker #6)
      await logSpecForgeAction({
        action: 'approved',
        targetId: approvalId,
        targetType: 'item',
        performedBy: req.authContext!.uid,
        projectId,
        previousValue: JSON.stringify(existing),
        newValue: JSON.stringify(updated),
      });

      res.status(200).json(updated);
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * POST /:projectId/substitutions — Create a substitution request.
 * Requirements: 5.6
 */
specforgeRouter.post(
  '/:projectId/substitutions',
  requireCapability('request_substitution'),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const parsed = specSubstitutionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new SpecForgeValidationError(parsed.error.issues);
      }
      const substitution = parsed.data as SpecSubstitution;
      const repo = getSpecForgeRepository();
      await repo.saveSubstitution(projectId, substitution);

      // Await audit log (Blocker #6)
      await logSpecForgeAction({
        action: 'substitution_requested',
        targetId: substitution.id,
        targetType: 'item',
        performedBy: req.authContext!.uid,
        projectId,
        newValue: JSON.stringify(substitution),
      });

      // Wire inbox adapter (Blocker #9): emit substitution event
      try {
        const workspace = await repo.getWorkspace(projectId);
        const item = workspace?.items.find(i => i.id === substitution.originalItemId);
        if (item) {
          await emitSubstitutionEvent(substitution, item, projectId);
        }
      } catch {
        // Non-critical: don't fail the request if inbox emission fails
      }

      res.status(201).json(substitution);
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * PATCH /:projectId/substitutions/:substitutionId — Update substitution status.
 * Requirements: 5.7
 */
specforgeRouter.patch(
  '/:projectId/substitutions/:substitutionId',
  requireCapability('approve_substitution'),
  async (req: Request, res: Response) => {
    try {
      const { projectId, substitutionId } = req.params;
      const { status, reviewComments } = req.body;

      if (!status) {
        res.status(400).json({ error: 'status is required' });
        return;
      }

      // Enforce reviewedBy from auth context (Blocker #4)
      const reviewedBy = req.authContext!.uid;

      const repo = getSpecForgeRepository();
      const substitutions = await repo.getSubstitutions(projectId);
      const existing = substitutions.find(s => s.id === substitutionId);
      if (!existing) {
        throw new SpecForgeNotFoundError('Substitution', substitutionId);
      }

      const updated: SpecSubstitution = {
        ...existing,
        status,
        reviewedBy,
        reviewedAt: new Date().toISOString(),
        ...(reviewComments && { reviewComments }),
      };
      await repo.saveSubstitution(projectId, updated);

      // Await audit log (Blocker #6)
      await logSpecForgeAction({
        action: 'substitution_resolved',
        targetId: substitutionId,
        targetType: 'item',
        performedBy: req.authContext!.uid,
        projectId,
        previousValue: JSON.stringify(existing),
        newValue: JSON.stringify(updated),
      });

      res.status(200).json(updated);
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * GET /:projectId/procurement — Get all procurement entries for a project.
 * Requirements: 5.9
 */
specforgeRouter.get(
  '/:projectId/procurement',
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const repo = getSpecForgeRepository();
      const entries = await repo.getProcurementEntries(projectId);
      res.status(200).json(entries);
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * PATCH /:projectId/procurement/:entryId — Update a procurement entry.
 * Requirements: 5.8
 */
specforgeRouter.patch(
  '/:projectId/procurement/:entryId',
  requireCapability('update_procurement_status'),
  async (req: Request, res: Response) => {
    try {
      const { projectId, entryId } = req.params;
      const parsed = specProcurementEntryUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new SpecForgeValidationError(parsed.error.issues);
      }
      const repo = getSpecForgeRepository();
      await repo.updateProcurementEntry(projectId, entryId, parsed.data);
      res.status(200).json({ id: entryId, ...parsed.data });
    } catch (err) {
      handleError(err, res);
    }
  },
);

// ── Read-Only Routes ─────────────────────────────────────────────────────────

/**
 * GET /:projectId/snapshots — Get all issue snapshots for a project.
 * Requirements: 4.10
 */
specforgeRouter.get(
  '/:projectId/snapshots',
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const repo = getSpecForgeRepository();
      const snapshots = await repo.getSnapshots(projectId);
      res.status(200).json(snapshots);
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * GET /:projectId/audit — Get audit events for a project.
 * Query param `limit` clamped to [1, 200], default 50.
 * Requirements: 4.11
 */
specforgeRouter.get(
  '/:projectId/audit',
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const rawLimit = req.query.limit;
      let limit = 50; // default
      if (rawLimit !== undefined) {
        const parsed = parseInt(String(rawLimit), 10);
        if (!isNaN(parsed)) {
          limit = Math.max(1, Math.min(200, parsed));
        }
      }
      const repo = getSpecForgeRepository();
      const events = await repo.getAuditEvents(projectId, limit);
      res.status(200).json(events);
    } catch (err) {
      handleError(err, res);
    }
  },
);

export default specforgeRouter;
