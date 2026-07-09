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
  clientDecisionSchema,
  qsReviewSchema,
  standaloneWorkspaceCreateSchema,
  substitutionRequestSchema,
  substitutionApprovalSchema,
  packageAssignmentSchema,
} from '@/services/specforge/specforgeSchemas';
import {
  requestSubstitution,
  approveSubstitution,
  SubstitutionValidationError,
  SubstitutionItemNotFoundError,
  SubstitutionNotFoundError,
} from '@/services/specforge/substitutionService';
import type {
  SubstitutionRequestPayload,
  SubstitutionApprovalPayload,
} from '@/services/specforge/substitutionService';
import { recordDecision, ClientDecisionItemNotFoundError, ClientDecisionNotAcceptedError } from '@/services/specforge/clientDecisionService';
import { submitReview } from '@/services/specforge/qsReviewService';
import {
  create as createStandaloneWorkspace,
  list as listStandaloneWorkspaces,
  assignToProject as assignWorkspaceToProject,
} from '@/services/specforge/standaloneWorkspaceService';
import {
  SpecForgeValidationError,
  SpecForgeNotFoundError,
  SpecForgeCapabilityError,
} from '@/services/specforge/specforgeErrors';
import { search as catalogueSearch, uploadCsv as catalogueUploadCsv } from '@/services/specforge/productCatalogueAdapter';
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
import { createSupplierVisibilityFilter } from '@/services/specforge/supplierVisibilityFilter';
import type { SpecPackageAssignment } from '@/types/specforgeTypes';
import {
  createRfq,
  submitQuote,
  requestAward,
  approveAward,
  rejectAward,
  recordDelivery,
  confirmSiteAcceptance,
  uploadWarranty,
  ProcurementBaselineError,
  ProcurementValidationError,
  ProcurementNotFoundError,
  ProcurementCapabilityError,
} from '@/services/specforge/procurementLifecycleService';

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

// ── Supplier Visibility Filter instance (server-side only) ──────────────────
const supplierVisibility = createSupplierVisibilityFilter();

/**
 * Checks if the user's SpecForge role is supplier or subcontractor.
 * Used to apply server-side visibility filtering on GET endpoints.
 * Requirements: 7.1, 7.6
 */
function isSupplierOrSubcontractor(req: Request): boolean {
  const role = toSpecForgeRole(req.authContext!.role as UserRole);
  return role === 'supplier' || role === 'subcontractor';
}

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
 * Checks the project doc's `teamMembers` array for the user's UID.
 * Fail-closed: denies access when project membership cannot be verified,
 * except for admin/platform_admin roles which bypass membership checks.
 *
 * Requirements: 6.2
 */
const requireProjectMember: RequestHandler = async (req: Request, res: Response, next) => {
  const projectId = req.params.projectId;
  if (!projectId) {
    next();
    return;
  }

  // Admin/platform_admin bypass — always allowed
  const userRole = req.authContext!.role;
  if (userRole === 'admin' || userRole === 'platform_admin') {
    next();
    return;
  }

  try {
    const projectSnap = await adminDb.collection('projects').doc(projectId).get();
    if (!projectSnap.exists) {
      // Project doesn't exist — deny access (fail-closed)
      res.status(403).json({ error: 'Project not found' });
      return;
    }
    const projectData = projectSnap.data()!;
    const teamMembers: Array<{ userId?: string; uid?: string }> = projectData.teamMembers ?? [];
    if (teamMembers.length === 0) {
      // No team data — deny access (fail-closed)
      res.status(403).json({ error: 'Not a member of this project' });
      return;
    }
    const uid = req.authContext!.uid;
    const isMember = teamMembers.some(
      (m) => m.userId === uid || m.uid === uid,
    );
    // Also allow if user is the project owner/client
    const isOwner = projectData.clientId === uid ||
      projectData.ownerId === uid ||
      projectData.leadProfessionalId === uid ||
      projectData.leadBepId === uid ||
      projectData.leadArchitectId === uid;

    if (!isMember && !isOwner) {
      res.status(403).json({ error: 'Not a member of this project' });
      return;
    }
    next();
  } catch {
    // On failure to check, deny access (fail-closed)
    res.status(500).json({ error: 'Unable to verify project membership' });
  }
};

// ── Standalone Workspace Routes ───────────────────────────────────────────────
// These routes do NOT use :projectId — positioned before project-scoped routes.
// Requirements: 4.1, 4.2, 4.8

/**
 * POST /standalone-workspaces — Create a standalone SpecForge workspace.
 * Requires authentication (already enforced by router-level middleware).
 * Requirements: 4.1, 4.2, 4.10
 */
specforgeRouter.post('/standalone-workspaces', async (req: Request, res: Response) => {
  try {
    const parsed = standaloneWorkspaceCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { projectReference, scope, firmId, name } = parsed.data;
    const uid = req.authContext!.uid;

    const workspace = await createStandaloneWorkspace({
      uid,
      projectReference,
      scope,
      firmId,
      name,
    });

    res.status(201).json(workspace);
  } catch (err) {
    handleError(err, res);
  }
});

/**
 * GET /standalone-workspaces — List user's standalone workspaces.
 * Returns user-scoped + firm-scoped workspaces, max 100, ordered by updatedAt desc.
 * Requirements: 4.8
 */
specforgeRouter.get('/standalone-workspaces', async (req: Request, res: Response) => {
  try {
    const uid = req.authContext!.uid;

    // Extract firmIds from query param (comma-separated) or default to empty
    const firmIdsParam = req.query.firmIds;
    const firmIds: string[] = typeof firmIdsParam === 'string' && firmIdsParam.length > 0
      ? firmIdsParam.split(',').map(id => id.trim()).filter(Boolean)
      : [];

    const workspaces = await listStandaloneWorkspaces(uid, firmIds);

    res.status(200).json(workspaces);
  } catch (err) {
    handleError(err, res);
  }
});

/**
 * POST /standalone-workspaces/:workspaceId/assign — Assign standalone workspace to a project.
 * Requires projectId in the request body. Returns 409 if project already has a workspace.
 * Requirements: 4.4, 4.5, 4.6, 4.7
 */
specforgeRouter.post('/standalone-workspaces/:workspaceId/assign', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { projectId, scope, ownerId } = req.body;

    if (!projectId || typeof projectId !== 'string') {
      res.status(400).json({ error: 'projectId is required' });
      return;
    }
    if (!scope || !['user', 'firm'].includes(scope)) {
      res.status(400).json({ error: 'scope must be "user" or "firm"' });
      return;
    }

    const uid = req.authContext!.uid;
    const resolvedOwnerId = ownerId || uid;

    await assignWorkspaceToProject({
      workspaceId,
      scope,
      ownerId: resolvedOwnerId,
      projectId,
      userId: uid,
    });

    res.status(200).json({ assigned: true, workspaceId, projectId });
  } catch (err) {
    // Handle specific status codes from the service
    if (err instanceof Error && (err as any).status === 409) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof Error && (err as any).status === 404) {
      res.status(404).json({ error: err.message });
      return;
    }
    handleError(err, res);
  }
});

// ── Product Catalogue Routes ──────────────────────────────────────────────────
// These routes do NOT use :projectId — positioned before project-scoped routes.
// Requirements: 9.1, 9.3, 9.8

/**
 * GET /catalogue/search — Search the product catalogue with scope/pagination.
 * Extracts query, scope, offset, limit from query params.
 * Extracts userId and firmId from auth context.
 * Pagination: offset defaults to 0, limit defaults to 50, max 200 (clamped by service).
 * Requirements: 9.1, 9.2, 9.8
 */
specforgeRouter.get('/catalogue/search', async (req: Request, res: Response) => {
  try {
    const uid = req.authContext!.uid;
    const firmId = (req.authContext as any).firmId || (req.query.firmId as string) || '';

    const query = (req.query.query as string) || '';
    const scope = req.query.scope as string | undefined;
    const offsetParam = req.query.offset;
    const limitParam = req.query.limit;

    // Parse offset and limit — service handles clamping
    const offset = offsetParam ? Math.max(0, parseInt(String(offsetParam), 10) || 0) : undefined;
    const limit = limitParam ? parseInt(String(limitParam), 10) || undefined : undefined;

    // Validate scope if provided
    const validScopes = ['personal', 'practice', 'platform', 'manufacturer', 'standards'];
    if (scope && !validScopes.includes(scope)) {
      res.status(400).json({ error: `Invalid scope. Must be one of: ${validScopes.join(', ')}` });
      return;
    }

    const result = await catalogueSearch({
      query,
      scope: scope as any,
      userId: uid,
      firmId,
      offset,
      limit,
    });

    res.status(200).json(result);
  } catch (err) {
    handleError(err, res);
  }
});

/**
 * POST /catalogue/csv-upload — Upload a CSV file to import products into the catalogue.
 * Expects JSON body with base64-encoded `file` field.
 * Extracts firmId from auth context or request body.
 * Requirements: 9.3, 9.9
 */
specforgeRouter.post('/catalogue/csv-upload', async (req: Request, res: Response) => {
  try {
    const uid = req.authContext!.uid;
    const firmId = req.body.firmId || (req.authContext as any).firmId || '';

    if (!firmId) {
      res.status(400).json({ error: 'firmId is required (from auth context or request body)' });
      return;
    }

    const fileBase64 = req.body.file;
    if (!fileBase64 || typeof fileBase64 !== 'string') {
      res.status(400).json({ error: 'file field is required and must be a base64-encoded string' });
      return;
    }

    // Decode base64 to Buffer
    const fileBuffer = Buffer.from(fileBase64, 'base64');

    const result = await catalogueUploadCsv(firmId, fileBuffer, uid);

    res.status(200).json(result);
  } catch (err) {
    handleError(err, res);
  }
});

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
  if (err instanceof ProcurementBaselineError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof ProcurementValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof ProcurementNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof ProcurementCapabilityError) {
    res.status(403).json({ error: err.message });
    return;
  }
  if (err instanceof SubstitutionValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof SubstitutionItemNotFoundError) {
    res.status(409).json({ error: err.message });
    return;
  }
  if (err instanceof SubstitutionNotFoundError) {
    res.status(404).json({ error: err.message });
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

    let visibleItems: SpecItem[];

    // Supplier/subcontractor visibility: server-side package-scoped filtering (Requirements: 7.1, 7.4, 7.6)
    if (role === 'supplier' || role === 'subcontractor') {
      visibleItems = await supplierVisibility.getVisibleItems(projectId, req.authContext!.uid, role);
    } else {
      visibleItems = getVisibleSpecItems(workspace, role, req.authContext!.uid);
    }

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
 * POST /:projectId/substitutions — Request a substitution for a spec item.
 * Uses multi-gate substitution service with procurement impact detection.
 * Requirements: 11.1, 11.2
 */
specforgeRouter.post(
  '/:projectId/substitutions',
  requireCapability('request_substitution'),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const parsed = substitutionRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new SpecForgeValidationError(parsed.error.issues);
      }

      const result = await requestSubstitution(
        {
          projectId,
          userId: req.authContext!.uid,
          userName: (req.authContext!.decoded as Record<string, string>).displayName
            || (req.authContext!.decoded as Record<string, string>).name
            || (req.authContext!.decoded as Record<string, string>).email
            || undefined,
        },
        parsed.data as SubstitutionRequestPayload,
      );

      res.status(201).json({
        success: result.success,
        substitutionId: result.substitutionId,
        status: result.status,
        procurementImpactWarning: result.procurementImpactWarning,
      });
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * PATCH /:projectId/substitutions/:substitutionId — Approve or reject a substitution.
 * Uses multi-gate approval workflow: technical, client, and professional gates.
 * Requirements: 11.1, 11.2
 */
specforgeRouter.patch(
  '/:projectId/substitutions/:substitutionId',
  requireCapability('approve_substitution'),
  async (req: Request, res: Response) => {
    try {
      const { projectId, substitutionId } = req.params;
      const parsed = substitutionApprovalSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new SpecForgeValidationError(parsed.error.issues);
      }

      // Determine approverRole from the user's SpecForge role mapping
      const specRole = toSpecForgeRole(req.authContext!.role as UserRole);
      let approverRole: 'technical' | 'client' | 'professional' = 'technical';
      if (specRole === 'client' || specRole === 'developer') {
        approverRole = 'client';
      } else if (
        specRole === 'architect' ||
        specRole === 'engineer' ||
        specRole === 'energy_professional' ||
        specRole === 'fire_engineer'
      ) {
        approverRole = 'professional';
      }

      const result = await approveSubstitution(
        {
          projectId,
          substitutionId,
          userId: req.authContext!.uid,
          userName: (req.authContext!.decoded as Record<string, string>).displayName
            || (req.authContext!.decoded as Record<string, string>).name
            || (req.authContext!.decoded as Record<string, string>).email
            || undefined,
          approverRole,
        },
        parsed.data as SubstitutionApprovalPayload,
      );

      res.status(200).json({
        success: result.success,
        substitutionId: result.substitutionId,
        status: result.status,
        allApprovalsGranted: result.allApprovalsGranted,
        ...(result.replacementItemId && { replacementItemId: result.replacementItemId }),
      });
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * POST /:projectId/items/:itemId/client-decision — Record client approval/rejection.
 * Requirements: 5.1
 */
specforgeRouter.post(
  '/:projectId/items/:itemId/client-decision',
  requireCapability('approve_client_decision'),
  async (req: Request, res: Response) => {
    try {
      const { projectId, itemId } = req.params;
      const parsed = clientDecisionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
        return;
      }

      const result = await recordDecision(
        {
          projectId,
          itemId,
          userId: req.authContext!.uid,
          userName: (req.authContext!.decoded as Record<string, string>).displayName
            || (req.authContext!.decoded as Record<string, string>).name
            || undefined,
        },
        { decision: parsed.data.decision, comment: parsed.data.comment },
      );

      res.status(200).json(result);
    } catch (err) {
      if (err instanceof ClientDecisionItemNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof ClientDecisionNotAcceptedError) {
        res.status(400).json({ error: err.message });
        return;
      }
      handleError(err, res);
    }
  },
);

/**
 * POST /:projectId/items/:itemId/qs-review — Submit QS budget review.
 * Requirements: 6.1
 */
specforgeRouter.post(
  '/:projectId/items/:itemId/qs-review',
  requireCapability('review_budget'),
  async (req: Request, res: Response) => {
    try {
      const { projectId, itemId } = req.params;
      const parsed = qsReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
        return;
      }

      const result = await submitReview({
        projectId,
        itemId,
        reviewerUid: req.authContext!.uid,
        body: parsed.data,
      });

      res.status(result.status).json(result.data);
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * GET /:projectId/procurement — Get all procurement entries for a project.
 * Supplier/subcontractor roles see only entries matching their firm or assigned packages.
 * Requirements: 5.9, 7.1, 7.4, 7.6, 7.7
 */
specforgeRouter.get(
  '/:projectId/procurement',
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;

      // Supplier/subcontractor: apply server-side visibility filter
      if (isSupplierOrSubcontractor(req)) {
        const uid = req.authContext!.uid;
        const firmName = req.authContext!.userData?.firmName
          || req.authContext!.decoded?.firmName
          || '';
        const entries = await supplierVisibility.getVisibleProcurement(projectId, uid, firmName);
        res.status(200).json(entries);
        return;
      }

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

// ── RFQ Endpoint with Supplier Visibility ───────────────────────────────────

/**
 * GET /:projectId/rfqs — Get RFQs for a project.
 * Supplier/subcontractor roles see only RFQs where they are invited.
 * Requirements: 7.1, 7.4, 7.6, 7.8
 */
specforgeRouter.get(
  '/:projectId/rfqs',
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;

      // Supplier/subcontractor: apply server-side visibility filter
      if (isSupplierOrSubcontractor(req)) {
        const uid = req.authContext!.uid;
        const rfqs = await supplierVisibility.getVisibleRfqs(projectId, uid);
        res.status(200).json(rfqs);
        return;
      }

      // Non-supplier roles: return all RFQs for the project
      const rfqsSnapshot = await adminDb
        .collection('projects')
        .doc(projectId)
        .collection('rfqs')
        .get();

      const rfqs = rfqsSnapshot.empty
        ? []
        : rfqsSnapshot.docs.map((doc) => doc.data());

      res.status(200).json(rfqs);
    } catch (err) {
      handleError(err, res);
    }
  },
);

// ── Procurement Lifecycle Routes ────────────────────────────────────────────

/**
 * POST /:projectId/rfqs — Create an RFQ for the project.
 * Requires approved baseline. Delegates to procurementLifecycleService.createRfq.
 * Requirements: 10.1, 10.2
 */
specforgeRouter.post(
  '/:projectId/rfqs',
  requireCapability('update_procurement_status'),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { specItemIds, invitedSuppliers, dueDate, notes } = req.body;

      if (!specItemIds || !Array.isArray(specItemIds) || specItemIds.length === 0) {
        res.status(400).json({ error: 'specItemIds is required and must be a non-empty array' });
        return;
      }
      if (!invitedSuppliers || !Array.isArray(invitedSuppliers) || invitedSuppliers.length === 0) {
        res.status(400).json({ error: 'invitedSuppliers is required and must be a non-empty array' });
        return;
      }
      if (!dueDate || typeof dueDate !== 'string') {
        res.status(400).json({ error: 'dueDate is required and must be a string' });
        return;
      }

      const rfq = await createRfq(projectId, {
        specItemIds,
        invitedSuppliers,
        dueDate,
        notes,
        createdBy: req.authContext!.uid,
      });

      res.status(201).json(rfq);
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * POST /:projectId/rfqs/:rfqId/quotes — Submit a supplier quote for an RFQ.
 * Requirements: 10.2
 */
specforgeRouter.post(
  '/:projectId/rfqs/:rfqId/quotes',
  async (req: Request, res: Response) => {
    try {
      const { projectId, rfqId } = req.params;
      const {
        procurementEntryId,
        specItemId,
        supplierFirmName,
        unitRate,
        totalCost,
        leadTimeDays,
        warrantyTerms,
        warrantyDurationMonths,
        warrantyCoverageScope,
        bbbeeLevel,
        notes,
      } = req.body;

      if (!specItemId || typeof specItemId !== 'string') {
        res.status(400).json({ error: 'specItemId is required' });
        return;
      }
      if (typeof unitRate !== 'number' || unitRate <= 0) {
        res.status(400).json({ error: 'unitRate must be a positive number' });
        return;
      }
      if (typeof totalCost !== 'number' || totalCost <= 0) {
        res.status(400).json({ error: 'totalCost must be a positive number' });
        return;
      }

      const quote = await submitQuote(projectId, {
        procurementEntryId: procurementEntryId || '',
        specItemId,
        rfqId,
        supplierUid: req.authContext!.uid,
        supplierFirmName: supplierFirmName || '',
        unitRate,
        totalCost,
        leadTimeDays: leadTimeDays || 0,
        warrantyTerms: warrantyTerms || '',
        warrantyDurationMonths: warrantyDurationMonths || 0,
        warrantyCoverageScope: warrantyCoverageScope || '',
        bbbeeLevel: bbbeeLevel || 1,
        notes,
      });

      res.status(201).json(quote);
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * POST /:projectId/procurement/:entryId/award-request — Request award for a procurement entry.
 * Requires approved baseline check. Creates a pending_approval award request.
 * Requirements: 10.4
 */
specforgeRouter.post(
  '/:projectId/procurement/:entryId/award-request',
  requireCapability('update_procurement_status'),
  async (req: Request, res: Response) => {
    try {
      const { projectId, entryId } = req.params;
      const { specItemId, selectedSupplierUid, selectedQuoteId } = req.body;

      if (!specItemId || typeof specItemId !== 'string') {
        res.status(400).json({ error: 'specItemId is required' });
        return;
      }
      if (!selectedSupplierUid || typeof selectedSupplierUid !== 'string') {
        res.status(400).json({ error: 'selectedSupplierUid is required' });
        return;
      }
      if (!selectedQuoteId || typeof selectedQuoteId !== 'string') {
        res.status(400).json({ error: 'selectedQuoteId is required' });
        return;
      }

      const awardRequest = await requestAward(projectId, {
        procurementEntryId: entryId,
        specItemId,
        selectedSupplierUid,
        selectedQuoteId,
        requestedBy: req.authContext!.uid,
      });

      res.status(201).json(awardRequest);
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * PATCH /:projectId/award-requests/:awardId — Approve or reject an award request.
 * Requires approve_substitution or approve_technical_section capability.
 * Requirements: 10.4, 10.7
 */
specforgeRouter.patch(
  '/:projectId/award-requests/:awardId',
  requireCapability('approve_substitution'),
  async (req: Request, res: Response) => {
    try {
      const { projectId, awardId } = req.params;
      const { decision, reason } = req.body;

      if (!decision || !['approved', 'rejected'].includes(decision)) {
        res.status(400).json({ error: 'decision must be "approved" or "rejected"' });
        return;
      }

      const role = toSpecForgeRole(req.authContext!.role as UserRole);
      // Derive capabilities from the SpecForge role
      const capabilities: SpecCapability[] = [];
      if (specRoleCan(role!, 'approve_substitution')) {
        capabilities.push('approve_substitution');
      }
      if (specRoleCan(role!, 'approve_technical_section')) {
        capabilities.push('approve_technical_section');
      }

      if (decision === 'approved') {
        const po = await approveAward(projectId, awardId, req.authContext!.uid, capabilities);
        res.status(200).json({ decision: 'approved', purchaseOrder: po });
      } else {
        await rejectAward(projectId, awardId, req.authContext!.uid, reason || '');
        res.status(200).json({ decision: 'rejected', awardId });
      }
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * POST /:projectId/procurement/:entryId/delivery — Record a delivery for a procurement entry.
 * Requirements: 10.8
 */
specforgeRouter.post(
  '/:projectId/procurement/:entryId/delivery',
  requireCapability('update_procurement_status'),
  async (req: Request, res: Response) => {
    try {
      const { projectId, entryId } = req.params;
      const { poId, specItemId, quantityOrdered, quantityDelivered, rejectionReason } = req.body;

      if (!poId || typeof poId !== 'string') {
        res.status(400).json({ error: 'poId is required' });
        return;
      }
      if (!specItemId || typeof specItemId !== 'string') {
        res.status(400).json({ error: 'specItemId is required' });
        return;
      }
      if (typeof quantityOrdered !== 'number' || quantityOrdered <= 0) {
        res.status(400).json({ error: 'quantityOrdered must be a positive number' });
        return;
      }
      if (typeof quantityDelivered !== 'number' || quantityDelivered < 0) {
        res.status(400).json({ error: 'quantityDelivered must be a non-negative number' });
        return;
      }

      const delivery = await recordDelivery(projectId, {
        procurementEntryId: entryId,
        poId,
        specItemId,
        quantityOrdered,
        quantityDelivered,
        rejectionReason,
        recordedBy: req.authContext!.uid,
      });

      res.status(201).json(delivery);
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * POST /:projectId/procurement/:entryId/site-acceptance — Confirm site acceptance for a delivery.
 * Unblocks payment release path.
 * Requirements: 10.9
 */
specforgeRouter.post(
  '/:projectId/procurement/:entryId/site-acceptance',
  requireCapability('flag_site_conflict'),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { deliveryId } = req.body;

      if (!deliveryId || typeof deliveryId !== 'string') {
        res.status(400).json({ error: 'deliveryId is required' });
        return;
      }

      await confirmSiteAcceptance(projectId, deliveryId, req.authContext!.uid);

      res.status(200).json({ success: true, deliveryId, siteAccepted: true });
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * POST /:projectId/procurement/:entryId/warranty — Upload warranty documentation.
 * Requirements: 10.11
 */
specforgeRouter.post(
  '/:projectId/procurement/:entryId/warranty',
  requireCapability('update_procurement_status'),
  async (req: Request, res: Response) => {
    try {
      const { projectId, entryId } = req.params;
      const {
        specItemId,
        warrantyStartDate,
        warrantyDurationMonths,
        terms,
        documentRefs,
      } = req.body;

      if (!specItemId || typeof specItemId !== 'string') {
        res.status(400).json({ error: 'specItemId is required' });
        return;
      }
      if (!warrantyStartDate || typeof warrantyStartDate !== 'string') {
        res.status(400).json({ error: 'warrantyStartDate is required' });
        return;
      }
      if (typeof warrantyDurationMonths !== 'number' || warrantyDurationMonths <= 0) {
        res.status(400).json({ error: 'warrantyDurationMonths must be a positive number' });
        return;
      }
      if (!terms || typeof terms !== 'string') {
        res.status(400).json({ error: 'terms is required' });
        return;
      }
      if (!documentRefs || !Array.isArray(documentRefs) || documentRefs.length < 1) {
        res.status(400).json({ error: 'documentRefs must be a non-empty array (minimum 1 document reference)' });
        return;
      }

      const warranty = await uploadWarranty(projectId, {
        procurementEntryId: entryId,
        specItemId,
        warrantyStartDate,
        warrantyDurationMonths,
        terms,
        documentRefs,
        uploadedBy: req.authContext!.uid,
      });

      res.status(201).json(warranty);
    } catch (err) {
      handleError(err, res);
    }
  },
);

// ── Package Assignment CRUD Routes (Admin Use) ──────────────────────────────

/**
 * POST /:projectId/package-assignments — Create a package assignment.
 * Requires admin/lead role (edit_spec capability).
 * Requirements: 7.3
 */
specforgeRouter.post(
  '/:projectId/package-assignments',
  requireCapability('edit_spec'),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const parsed = packageAssignmentSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new SpecForgeValidationError(parsed.error.issues);
      }

      const validatedData = parsed.data;
      const assignment: SpecPackageAssignment = {
        id: `assign-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        packageId: validatedData.packageId,
        supplierUid: validatedData.supplierUid,
        firmName: validatedData.firmName,
        sectionIds: validatedData.sectionIds,
        itemIds: validatedData.itemIds,
        assignedAt: new Date().toISOString(),
        assignedBy: req.authContext!.uid,
        status: 'active',
      };

      await adminDb
        .collection('projects')
        .doc(projectId)
        .collection('specPackageAssignments')
        .doc(assignment.id)
        .set(assignment);

      // Audit event for package assignment creation
      await logSpecForgeAction({
        action: 'created',
        targetId: assignment.id,
        targetType: 'item',
        performedBy: req.authContext!.uid,
        projectId,
        newValue: JSON.stringify(assignment),
      });

      res.status(201).json(assignment);
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * GET /:projectId/package-assignments — List all package assignments for a project.
 * Requirements: 7.3, 7.4
 */
specforgeRouter.get(
  '/:projectId/package-assignments',
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;

      const snapshot = await adminDb
        .collection('projects')
        .doc(projectId)
        .collection('specPackageAssignments')
        .get();

      const assignments = snapshot.empty
        ? []
        : snapshot.docs.map((doc) => doc.data() as SpecPackageAssignment);

      res.status(200).json(assignments);
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * DELETE /:projectId/package-assignments/:assignmentId — Revoke a package assignment.
 * Sets status to 'revoked' rather than hard-deleting.
 * Requires admin/lead role (edit_spec capability).
 * Requirements: 7.3, 7.9
 */
specforgeRouter.delete(
  '/:projectId/package-assignments/:assignmentId',
  requireCapability('edit_spec'),
  async (req: Request, res: Response) => {
    try {
      const { projectId, assignmentId } = req.params;

      const docRef = adminDb
        .collection('projects')
        .doc(projectId)
        .collection('specPackageAssignments')
        .doc(assignmentId);

      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        res.status(404).json({ error: 'Package assignment not found' });
        return;
      }

      const revokedAt = new Date().toISOString();
      await docRef.update({
        status: 'revoked',
        revokedAt,
      });

      // Audit event for package assignment revocation
      await logSpecForgeAction({
        action: 'status_changed',
        targetId: assignmentId,
        targetType: 'item',
        performedBy: req.authContext!.uid,
        projectId,
        previousValue: 'active',
        newValue: 'revoked',
      });

      res.status(200).json({ revoked: assignmentId, revokedAt });
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
