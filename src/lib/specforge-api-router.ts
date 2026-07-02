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
import type { SpecCapability, SpecForgeWorkspace, SpecSection } from '@/types/specforgeTypes';
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
      const repo = getSpecForgeRepository();
      await repo.addItem(projectId, parsed.data);

      // Fire-and-forget audit log
      logSpecForgeAction({
        action: 'created',
        targetId: parsed.data.id,
        targetType: 'item',
        performedBy: req.authContext!.uid,
        projectId,
        newValue: JSON.stringify(parsed.data),
      });

      res.status(201).json(parsed.data);
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
      const repo = getSpecForgeRepository();
      await repo.updateItem(projectId, itemId, parsed.data);

      // Fire-and-forget audit log
      logSpecForgeAction({
        action: 'updated',
        targetId: itemId,
        targetType: 'item',
        performedBy: req.authContext!.uid,
        projectId,
        newValue: JSON.stringify(parsed.data),
      });

      res.status(200).json({ id: itemId, ...parsed.data });
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

      // Fire-and-forget audit log
      logSpecForgeAction({
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
      const repo = getSpecForgeRepository();
      await repo.addSection(projectId, parsed.data);

      // Fire-and-forget audit log
      logSpecForgeAction({
        action: 'created',
        targetId: parsed.data.id,
        targetType: 'section',
        performedBy: req.authContext!.uid,
        projectId,
        newValue: JSON.stringify(parsed.data),
      });

      res.status(201).json(parsed.data);
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
      const repo = getSpecForgeRepository();
      await repo.updateSection(projectId, sectionId, parsed.data);

      // Fire-and-forget audit log
      logSpecForgeAction({
        action: 'updated',
        targetId: sectionId,
        targetType: 'section',
        performedBy: req.authContext!.uid,
        projectId,
        newValue: JSON.stringify(parsed.data),
      });

      res.status(200).json({ id: sectionId, ...parsed.data });
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

      const { issuer, recipients } = parsed.data;
      const result = issueSpecification(workspace, issuer, recipients);

      // Persist snapshot
      await repo.saveSnapshot(result.snapshot);

      // Fire-and-forget audit log
      logSpecForgeAction({
        action: 'issued',
        targetId: result.snapshot.snapshotId,
        targetType: 'snapshot',
        performedBy: req.authContext!.uid,
        projectId,
        snapshotId: result.snapshot.snapshotId,
        revision: result.snapshot.revision,
        auditHash: result.snapshot.auditHash,
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
  async (req: Request, res: Response) => {
    try {
      const parsed = specApprovalSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new SpecForgeValidationError(parsed.error.issues);
      }
      const repo = getSpecForgeRepository();
      await repo.saveApproval(parsed.data);

      // Fire-and-forget audit log
      logSpecForgeAction({
        action: 'approved',
        targetId: parsed.data.id,
        targetType: 'item',
        performedBy: req.authContext!.uid,
        projectId: req.params.projectId,
        newValue: JSON.stringify(parsed.data),
      });

      res.status(201).json(parsed.data);
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
  async (req: Request, res: Response) => {
    try {
      const { approvalId } = req.params;
      const { decision, decidedBy, comments } = req.body;

      if (!decision || !decidedBy) {
        res.status(400).json({ error: 'decision and decidedBy are required' });
        return;
      }

      const updates = {
        decision,
        decidedBy,
        decidedAt: new Date().toISOString(),
        ...(comments && { comments }),
      };

      // For approvals, we save a new version (the repo uses sectionId as key in demo mode)
      // In production, this would be a Firestore document update
      const repo = getSpecForgeRepository();
      const approvals = await repo.getApprovals(req.params.projectId);
      const existing = approvals.find(a => a.id === approvalId);
      if (!existing) {
        throw new SpecForgeNotFoundError('Approval', approvalId);
      }

      const updated = { ...existing, ...updates };
      await repo.saveApproval(updated);

      // Fire-and-forget audit log
      logSpecForgeAction({
        action: 'approved',
        targetId: approvalId,
        targetType: 'item',
        performedBy: req.authContext!.uid,
        projectId: req.params.projectId,
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
  async (req: Request, res: Response) => {
    try {
      const parsed = specSubstitutionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new SpecForgeValidationError(parsed.error.issues);
      }
      const repo = getSpecForgeRepository();
      await repo.saveSubstitution(parsed.data);

      // Fire-and-forget audit log
      logSpecForgeAction({
        action: 'substitution_requested',
        targetId: parsed.data.id,
        targetType: 'item',
        performedBy: req.authContext!.uid,
        projectId: req.params.projectId,
        newValue: JSON.stringify(parsed.data),
      });

      res.status(201).json(parsed.data);
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
  async (req: Request, res: Response) => {
    try {
      const { projectId, substitutionId } = req.params;
      const { status, reviewedBy, reviewComments } = req.body;

      if (!status || !reviewedBy) {
        res.status(400).json({ error: 'status and reviewedBy are required' });
        return;
      }

      const repo = getSpecForgeRepository();
      const substitutions = await repo.getSubstitutions(projectId);
      const existing = substitutions.find(s => s.id === substitutionId);
      if (!existing) {
        throw new SpecForgeNotFoundError('Substitution', substitutionId);
      }

      const updated = {
        ...existing,
        status,
        reviewedBy,
        reviewedAt: new Date().toISOString(),
        ...(reviewComments && { reviewComments }),
      };
      await repo.saveSubstitution(updated);

      // Fire-and-forget audit log
      logSpecForgeAction({
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
