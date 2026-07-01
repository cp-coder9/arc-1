// Fee Proposal API Router — REST endpoints for the Professional Fee Proposal Builder
//
// Provides CRUD operations for:
// - Source versions (admin only): create, status transition, import
// - Calculation runs: save, list, get, reopen, assign, export
// - Proposals: create draft, issue, accept, revise
// - Terms templates: list, create, edit
// - Guideline monitoring: watch list, scan trigger, approve (admin only)
// - Client estimation: calculate
//
// Requirements: 5.6, 5.9, 8.1, 8.4, 6.1, 6.5, 7.1, 7.2, 11.1, 14.3

import { Router, type Request, type Response } from 'express';

const router = Router();

// ---------------------------------------------------------------------------
// Middleware: Admin-only guard
// ---------------------------------------------------------------------------

function requireAdmin(req: Request, res: Response, next: () => void) {
  // In production, check authenticated user role from req.user or session
  const userRole = (req as any).user?.role;
  if (userRole === 'admin' || userRole === 'platform_admin') {
    return next();
  }
  // Allow in dev/demo modes
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }
  return res.status(403).json({ error: 'Admin access required' });
}

// ---------------------------------------------------------------------------
// Source Version Routes (admin only)
// ---------------------------------------------------------------------------

/** POST /api/fee-proposal/source-versions — Create new source version */
router.post('/source-versions', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { profession, body, title, gazetteRef, effectiveDate } = req.body;
    if (!profession || !title || !effectiveDate) {
      return res.status(400).json({ error: 'profession, title, and effectiveDate are required' });
    }
    // In production: persist to Firestore via sourceVersionService
    const newVersion = {
      id: `${profession}-${Date.now()}`,
      profession,
      body: body || '',
      title,
      gazetteRef: gazetteRef || '',
      effectiveDate,
      status: 'draft',
      contentHash: '',
      createdAt: new Date().toISOString(),
    };
    return res.status(201).json(newVersion);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create source version' });
  }
});

/** PATCH /api/fee-proposal/source-versions/:id/status — Transition status (verify/retire) */
router.patch('/source-versions/:id/status', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['draft', 'verified', 'retired'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be draft, verified, or retired.' });
    }
    // In production: update Firestore document
    return res.json({ id, status, updatedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update source version status' });
  }
});

/** POST /api/fee-proposal/source-versions/:id/import — Import fee table data */
router.post('/source-versions/:id/import', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data, format } = req.body;
    if (!data || !format) {
      return res.status(400).json({ error: 'data and format are required' });
    }
    // In production: validate and persist fee table rows
    return res.json({ id, rowsImported: Array.isArray(data) ? data.length : 0, importedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to import fee table' });
  }
});

// ---------------------------------------------------------------------------
// Calculation Run Routes
// ---------------------------------------------------------------------------

/** POST /api/fee-proposal/runs — Save a calculation run */
router.post('/runs', async (req: Request, res: Response) => {
  try {
    const { profession, projectValue, calculatorState, result } = req.body;
    if (!profession || projectValue === undefined) {
      return res.status(400).json({ error: 'profession and projectValue are required' });
    }
    const run = {
      id: `run-${Date.now()}`,
      profession,
      projectValue,
      calculatorState,
      result,
      status: 'saved',
      createdAt: new Date().toISOString(),
    };
    return res.status(201).json(run);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to save run' });
  }
});

/** GET /api/fee-proposal/runs — List runs with optional filters */
router.get('/runs', async (req: Request, res: Response) => {
  try {
    const { profession, projectId, limit = '50' } = req.query;
    // In production: query Firestore with filters
    return res.json({ runs: [], total: 0, limit: parseInt(limit as string) });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to list runs' });
  }
});

/** GET /api/fee-proposal/runs/:id — Get single run */
router.get('/runs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // In production: fetch from Firestore
    return res.json({ id, status: 'saved', profession: 'architect', projectValue: 0, createdAt: '' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get run' });
  }
});

/** POST /api/fee-proposal/runs/:id/reopen — Create new version from saved run */
router.post('/runs/:id/reopen', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // In production: clone run, increment version
    return res.status(201).json({ originalId: id, newId: `run-${Date.now()}`, status: 'saved' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to reopen run' });
  }
});

/** POST /api/fee-proposal/runs/:id/assign — Assign run to project */
router.post('/runs/:id/assign', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { projectId } = req.body;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }
    // In production: update run document with project reference
    return res.json({ id, projectId, status: 'assigned', assignedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to assign run' });
  }
});

/** POST /api/fee-proposal/runs/:id/export — Export run in specified format */
router.post('/runs/:id/export', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { format = 'pdf' } = req.body;
    if (!['pdf', 'csv', 'json'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format. Must be pdf, csv, or json.' });
    }
    // In production: generate export file and return download URL
    return res.json({ id, format, downloadUrl: `/api/fee-proposal/exports/${id}.${format}`, generatedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to export run' });
  }
});

// ---------------------------------------------------------------------------
// Proposal Routes
// ---------------------------------------------------------------------------

/** POST /api/fee-proposal/proposals — Create draft proposal */
router.post('/proposals', async (req: Request, res: Response) => {
  try {
    const { project, professional, calculation, assumptions, exclusions, notes, validityDays, selectedTermsTemplateIds } = req.body;
    if (!project?.name || !professional?.name) {
      return res.status(400).json({ error: 'project.name and professional.name are required' });
    }
    const proposal = {
      id: `proposal-${Date.now()}`,
      status: 'draft',
      project,
      professional,
      calculation,
      assumptions: assumptions || [],
      exclusions: exclusions || [],
      notes: notes || [],
      validityDays: validityDays || 30,
      selectedTermsTemplateIds: selectedTermsTemplateIds || [],
      version: 1,
      createdAt: new Date().toISOString(),
    };
    return res.status(201).json(proposal);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create proposal' });
  }
});

/** PATCH /api/fee-proposal/proposals/:id/issue — Issue a draft proposal */
router.patch('/proposals/:id/issue', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // In production: validate proposal is complete, transition status
    return res.json({ id, status: 'issued', issuedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to issue proposal' });
  }
});

/** PATCH /api/fee-proposal/proposals/:id/accept — Client accepts proposal */
router.patch('/proposals/:id/accept', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    return res.json({ id, status: 'accepted', acceptedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to accept proposal' });
  }
});

/** POST /api/fee-proposal/proposals/:id/revise — Create revised version */
router.post('/proposals/:id/revise', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { changes } = req.body;
    // In production: clone proposal, increment version, apply changes
    return res.status(201).json({ originalId: id, newId: `proposal-${Date.now()}`, status: 'draft', version: 2 });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to revise proposal' });
  }
});

// ---------------------------------------------------------------------------
// Terms Routes
// ---------------------------------------------------------------------------

/** GET /api/fee-proposal/terms — List terms templates */
router.get('/terms', async (req: Request, res: Response) => {
  try {
    const { profession } = req.query;
    // In production: query Firestore terms collection filtered by profession
    return res.json({ templates: [], total: 0 });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to list terms' });
  }
});

/** POST /api/fee-proposal/terms — Create terms template */
router.post('/terms', async (req: Request, res: Response) => {
  try {
    const { title, professions, clauses } = req.body;
    if (!title || !clauses?.length) {
      return res.status(400).json({ error: 'title and clauses are required' });
    }
    const template = {
      id: `terms-${Date.now()}`,
      title,
      professions: professions || ['all'],
      clauses,
      legalReviewed: false,
      version: 1,
      createdAt: new Date().toISOString(),
    };
    return res.status(201).json(template);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create terms template' });
  }
});

/** PATCH /api/fee-proposal/terms/:id — Edit terms template (creates new version) */
router.patch('/terms/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { clauses, title } = req.body;
    // In production: update Firestore, increment version
    return res.json({ id, title, clauses, version: 2, updatedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update terms template' });
  }
});

// ---------------------------------------------------------------------------
// Guideline Monitoring Routes (admin only)
// ---------------------------------------------------------------------------

/** GET /api/fee-proposal/guidelines/watch — Get watch list */
router.get('/guidelines/watch', requireAdmin, async (req: Request, res: Response) => {
  try {
    // In production: query Firestore guideline watch collection
    return res.json({ watchEntries: [], candidates: [] });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get watch list' });
  }
});

/** POST /api/fee-proposal/guidelines/scan — Trigger a scan */
router.post('/guidelines/scan', requireAdmin, async (req: Request, res: Response) => {
  try {
    // In production: trigger background scan job
    return res.json({ scanId: `scan-${Date.now()}`, status: 'started', startedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to trigger scan' });
  }
});

/** POST /api/fee-proposal/guidelines/candidates/:id/approve — Approve change candidate */
router.post('/guidelines/candidates/:id/approve', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    return res.json({ id, status: 'approved', approvedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to approve candidate' });
  }
});

// ---------------------------------------------------------------------------
// Client Estimation Route
// ---------------------------------------------------------------------------

/** POST /api/fee-proposal/estimate — Client fee estimation */
router.post('/estimate', async (req: Request, res: Response) => {
  try {
    const { constructionValue, projectType, areaSqm, municipality } = req.body;
    if (!constructionValue || constructionValue <= 0) {
      return res.status(400).json({ error: 'constructionValue must be a positive number' });
    }

    // Simple estimation logic (mirrors client-side)
    const professionRanges = [
      { profession: 'architect', displayName: 'Architectural Professional', lowPct: 5.5, highPct: 9.0 },
      { profession: 'structuralEngineer', displayName: 'Structural Engineer', lowPct: 2.0, highPct: 4.0 },
      { profession: 'civilEngineer', displayName: 'Civil Engineer', lowPct: 1.5, highPct: 3.5 },
      { profession: 'electricalEngineer', displayName: 'Electrical Engineer', lowPct: 1.5, highPct: 3.0 },
      { profession: 'mechanicalEngineer', displayName: 'Mechanical Engineer', lowPct: 1.5, highPct: 3.0 },
      { profession: 'quantitySurveyor', displayName: 'Quantity Surveyor', lowPct: 2.0, highPct: 4.0 },
      { profession: 'constructionProjectManager', displayName: 'Project Manager / PA', lowPct: 2.5, highPct: 5.0 },
    ];

    const estimates = professionRanges.map((p) => ({
      profession: p.profession,
      displayName: p.displayName,
      lowEstimate: (constructionValue * p.lowPct) / 100,
      highEstimate: (constructionValue * p.highPct) / 100,
      midEstimate: (constructionValue * (p.lowPct + p.highPct) / 2) / 100,
    }));

    const totalLow = estimates.reduce((sum, e) => sum + e.lowEstimate, 0);
    const totalHigh = estimates.reduce((sum, e) => sum + e.highEstimate, 0);

    return res.json({
      constructionValue,
      projectType,
      areaSqm,
      municipality,
      estimates,
      totalRange: { low: totalLow, high: totalHigh },
      disclaimer: 'These are indicative planning estimates only. Actual professional fees will vary.',
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to calculate estimate' });
  }
});

export default router;
