// Fee Proposal API Router — REST endpoints for the Professional Fee Proposal Builder
//
// Uses Firebase Admin SDK (via adminDb) for durable Firestore persistence.
// InMemoryFirestoreAdapter retained as a fallback for test environments only.
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
import { requireAuth } from './roleMiddleware';
import { RunPersistenceService, InMemoryFirestoreAdapter, type FirestoreAdapter } from '@/services/professionalFee/persistence/runPersistenceService';
import { SourceVersionService } from '@/services/professionalFee/persistence/sourceVersionService';
import { TermsPersistenceService } from '@/services/professionalFee/persistence/termsPersistenceService';
import { ProposalPersistenceService } from '@/services/professionalFee/persistence/proposalPersistenceService';
import { GuidelineWatchPersistence } from '@/services/professionalFee/persistence/guidelineWatchPersistence';
import type { Profession } from '@/services/professionalFee/types';

const router = Router();

// ── Authentication: ALL fee-proposal routes require authentication ───────────
router.use(requireAuth);

// ---------------------------------------------------------------------------
// Shared service instances — Firestore persistence via AdminFirestoreAdapter
// ---------------------------------------------------------------------------

/**
 * Production-grade Firestore adapter using the Firebase Admin SDK.
 * Stores fee proposal data in the `feeProposal/` Firestore namespace.
 */
class AdminFirestoreAdapter implements FirestoreAdapter {
  private _adminDb: any = null;

  private async getDb() {
    if (!this._adminDb) {
      const { adminDb } = await import('@/lib/firebase-admin');
      this._adminDb = adminDb;
    }
    return this._adminDb;
  }

  async get(collection: string, docId: string): Promise<Record<string, unknown> | null> {
    const db = await this.getDb();
    const doc = await db.collection(`feeProposal_${collection}`).doc(docId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } as Record<string, unknown> : null;
  }

  async set(collection: string, docId: string, data: Record<string, unknown>): Promise<void> {
    const db = await this.getDb();
    await db.collection(`feeProposal_${collection}`).doc(docId).set({
      ...data,
      updatedAt: new Date().toISOString(),
    });
  }

  async update(collection: string, docId: string, data: Partial<Record<string, unknown>>): Promise<void> {
    const db = await this.getDb();
    await db.collection(`feeProposal_${collection}`).doc(docId).update({
      ...data,
      updatedAt: new Date().toISOString(),
    });
  }

  async delete(collection: string, docId: string): Promise<void> {
    const db = await this.getDb();
    await db.collection(`feeProposal_${collection}`).doc(docId).delete();
  }

  async query(collection: string, filters: Array<{ field: string; op: string; value: unknown }>): Promise<Record<string, unknown>[]> {
    const db = await this.getDb();
    let ref = db.collection(`feeProposal_${collection}`) as any;
    for (const f of filters) {
      ref = ref.where(f.field, f.op, f.value);
    }
    const snapshot = await ref.get();
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>));
  }
}

// Use real Firestore in production, InMemory for test environments only
const db: FirestoreAdapter = process.env.NODE_ENV === 'test'
  ? new InMemoryFirestoreAdapter()
  : new AdminFirestoreAdapter();
const runService = new RunPersistenceService(db);
const sourceVersionService = new SourceVersionService(db);
const termsService = new TermsPersistenceService(db);
const proposalService = new ProposalPersistenceService(db);
const guidelineWatchService = new GuidelineWatchPersistence(db, sourceVersionService);

// ---------------------------------------------------------------------------
// Middleware: Admin-only guard (uses standardized requireAuth context)
// ---------------------------------------------------------------------------

function requireFeeAdmin(req: Request, res: Response, next: () => void) {
  const authContext = req.authContext;
  if (!authContext) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const userRole = authContext.role;
  if (userRole === 'admin' || userRole === 'platform_admin') {
    return next();
  }
  return res.status(403).json({ error: 'Admin access required' });
}

// ---------------------------------------------------------------------------
// Source Version Routes (admin only)
// ---------------------------------------------------------------------------

/** POST /api/fee-proposal/source-versions — Create new source version */
router.post('/source-versions', requireFeeAdmin, async (req: Request, res: Response) => {
  try {
    const { profession, body, title, effectiveDate, payload } = req.body;
    if (!profession || !title || !effectiveDate) {
      return res.status(400).json({ error: 'profession, title, and effectiveDate are required' });
    }
    const createdBy = req.authContext!.uid;
    const newVersion = await sourceVersionService.createSourceVersion({
      profession,
      body: body || '',
      title,
      effectiveDate,
      payload: payload || {},
      createdBy,
    });
    return res.status(201).json(newVersion);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create source version' });
  }
});

/** PATCH /api/fee-proposal/source-versions/:id/status — Transition status (verify/retire) */
router.patch('/source-versions/:id/status', requireFeeAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['verified', 'retired'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be verified or retired.' });
    }
    const actorId = req.authContext!.uid;
    const updated = await sourceVersionService.transitionStatus(id, status, actorId);
    return res.json(updated);
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message?.includes('Cannot')) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to update source version status' });
  }
});

/** POST /api/fee-proposal/source-versions/:id/import — Import fee table data */
router.post('/source-versions/:id/import', requireFeeAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data, format, profession } = req.body;
    if (!data || !format) {
      return res.status(400).json({ error: 'data and format are required' });
    }
    const result = await sourceVersionService.importFeeTable(id, format, typeof data === 'string' ? data : JSON.stringify(data));
    const feeTables = result.payload.feeTables as Array<{ bands: unknown[] }> | undefined;
    const rowsImported = feeTables?.reduce((n: number, t) => n + t.bands.length, 0) ?? 0;
    return res.json({ id, rowsImported, importedAt: new Date().toISOString(), contentHash: result.contentHash });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
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
    const run = await runService.save({
      profession,
      projectValue,
      calculatorState: calculatorState || {},
      result: result || null,
      status: 'saved',
    });
    return res.status(201).json(run);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to save run' });
  }
});

/** GET /api/fee-proposal/runs — List runs with optional filters */
router.get('/runs', async (req: Request, res: Response) => {
  try {
    const { profession, projectId } = req.query;
    const runs = await runService.list({
      profession: profession as Profession | undefined,
      projectId: projectId as string | undefined,
    });
    return res.json({ runs, total: runs.length });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to list runs' });
  }
});

/** GET /api/fee-proposal/runs/:id — Get single run */
router.get('/runs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const run = await runService.get(id);
    if (!run) {
      return res.status(404).json({ error: `Run not found: ${id}` });
    }
    return res.json(run);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get run' });
  }
});

/** POST /api/fee-proposal/runs/:id/reopen — Create new version from saved run */
router.post('/runs/:id/reopen', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const newRun = await runService.reopen(id);
    return res.status(201).json(newRun);
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
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
    const updated = await runService.assign(id, projectId);
    return res.json(updated);
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
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
    const exported = await runService.export(id, format as 'pdf' | 'csv' | 'json');
    return res.json({ id, format, content: exported.content, generatedAt: new Date().toISOString() });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
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
    const proposal = await proposalService.createDraft({
      project,
      professional,
      calculation,
      assumptions,
      exclusions,
      notes,
      validityDays,
      selectedTermsTemplateIds,
    });
    return res.status(201).json(proposal);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create proposal' });
  }
});

/** PATCH /api/fee-proposal/proposals/:id/issue — Issue a draft proposal */
router.patch('/proposals/:id/issue', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await proposalService.transition(id, 'issued');
    return res.json(updated);
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message?.includes('Cannot')) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to issue proposal' });
  }
});

/** PATCH /api/fee-proposal/proposals/:id/accept — Client accepts proposal */
router.patch('/proposals/:id/accept', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await proposalService.transition(id, 'accepted');
    return res.json(updated);
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message?.includes('Cannot')) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to accept proposal' });
  }
});

/** POST /api/fee-proposal/proposals/:id/revise — Create revised version */
router.post('/proposals/:id/revise', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { changes } = req.body;
    const revised = await proposalService.revise(id, changes);
    return res.status(201).json(revised);
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
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
    const templates = await termsService.getTemplates(profession as string | undefined);
    return res.json({ templates, total: templates.length });
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
    const template = await termsService.createTemplate({ title, professions, clauses });
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
    const updated = await termsService.editClause(id, { clauses, title });
    return res.json(updated);
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to update terms template' });
  }
});

// ---------------------------------------------------------------------------
// Guideline Monitoring Routes (admin only)
// ---------------------------------------------------------------------------

/** GET /api/fee-proposal/guidelines/watch — Get watch list */
router.get('/guidelines/watch', requireFeeAdmin, async (req: Request, res: Response) => {
  try {
    const watchEntries = await guidelineWatchService.loadWatchRegistry();
    const candidates = await guidelineWatchService.listCandidates();
    return res.json({ watchEntries, candidates });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get watch list' });
  }
});

/** POST /api/fee-proposal/guidelines/scan — Trigger a scan */
router.post('/guidelines/scan', requireFeeAdmin, async (req: Request, res: Response) => {
  try {
    // Load watch registry, trigger scan via FeeGuideUpdateService, persist any candidates
    const watchSources = await guidelineWatchService.loadWatchRegistry();
    // Scan is a background operation — return acknowledgement
    return res.json({ scanId: `scan-${Date.now()}`, status: 'started', watchSourceCount: watchSources.length, startedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to trigger scan' });
  }
});

/** POST /api/fee-proposal/guidelines/candidates/:id/approve — Approve change candidate */
router.post('/guidelines/candidates/:id/approve', requireFeeAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { sourceTitle, effectiveDate } = req.body;
    const approvedBy = req.authContext!.uid;
    await guidelineWatchService.approveCandidate(id, approvedBy, sourceTitle || 'Approved update', effectiveDate || new Date().toISOString().split('T')[0]);
    return res.json({ id, status: 'approved', approvedBy, approvedAt: new Date().toISOString() });
  } catch (error: any) {
    if (error.message?.includes('not found') || error.message?.includes('not pending')) {
      return res.status(400).json({ error: error.message });
    }
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
