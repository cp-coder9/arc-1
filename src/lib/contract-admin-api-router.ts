/**
 * Contract Administration API Router
 *
 * Server-side endpoints for contract admin mutations.
 * All routes enforce authentication via requireAuth middleware.
 * Mounted at `/api/contract-admin` in server.ts and api-server.ts.
 */

import { Router, type Request, type Response } from 'express';
import { requireAuth } from './roleMiddleware';
import type { UserRole } from '@/types';
import {
  setupContract,
  getContractConfig,
} from '@/services/contractAdmin/contractEngineService';
import {
  registerNotice,
  acknowledgeNotice,
  respondToNotice,
  withdrawNotice,
  getActiveNotices,
} from '@/services/contractAdmin/noticeEngineService';
import {
  createVariation,
  transitionVariation,
  valueVariation,
  getCumulativeSummary,
} from '@/services/contractAdmin/variationRegisterService';
import {
  createEoTClaim,
  submitEoTClaim,
  reviewEoTClaim,
} from '@/services/contractAdmin/eotEngineService';
import {
  regenerateRemainingSchedule,
  runPaymentDeadlineCheck,
} from '@/services/contractAdmin/paymentSchedulerService';
import {
  registerClaim,
  transitionClaim,
  getCumulativeSummary as getClaimsCumulativeSummary,
} from '@/services/contractAdmin/claimsRegisterService';
import { adminDb } from '@/lib/firebase-admin';

const router = Router();

// ── Auth middleware: ALL contract-admin routes require authentication ────────
router.use(requireAuth);

// ── Project authorization helper ────────────────────────────────────────────
async function buildProjectAssignment(uid: string, role: string, projectId: string) {
  const teamDoc = await adminDb.collection(`projects/${projectId}/team`).doc(uid).get();
  const isTeamMember = teamDoc.exists;
  const projectDoc = await adminDb.collection('projects').doc(projectId).get();
  const projectData = projectDoc.exists ? projectDoc.data() : null;
  const isOwner = projectData?.clientId === uid;
  const isAdmin = role === 'admin' || role === 'platform_admin';

  return {
    projectId,
    userId: uid,
    roles: [role] as UserRole[],
    isAssignedTeamMember: isAdmin || isTeamMember,
    isAssignedContractor: isTeamMember && role === 'contractor',
    isAssignedSubcontractor: isTeamMember && role === 'subcontractor',
    isProjectOwner: isOwner,
    isAssignedSiteManager: isTeamMember && role === 'site_manager',
  };
}

// ── Contract Setup ──────────────────────────────────────────────────────────

router.post('/:projectId/setup', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    const assignment = await buildProjectAssignment(ctx.uid, ctx.normalizedRole || 'client', req.params.projectId);
    const result = await setupContract({ ...req.body, projectId: req.params.projectId, setupBy: ctx.uid }, assignment);
    return res.status(201).json(result);
  } catch (err: any) {
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message });
    if (err.code === 'VALIDATION_ERROR') return res.status(400).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.get('/:projectId/config', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    const config = await getContractConfig(req.params.projectId);
    if (!config) return res.status(404).json({ error: 'No contract configured' });
    return res.json(config);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.put('/:projectId/config', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    const { field, value } = req.body;
    if (!field) return res.status(400).json({ error: 'field is required' });
    // Update the specific parameter in the contract config
    const configRef = adminDb.collection(`projects/${req.params.projectId}/contractAdmin`).doc('config');
    await configRef.set({ [field]: value }, { merge: true });
    return res.json({ success: true, field, value });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── Notices ─────────────────────────────────────────────────────────────────

router.post('/:projectId/notices', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    const assignment = await buildProjectAssignment(ctx.uid, ctx.normalizedRole || 'client', req.params.projectId);
    const result = await registerNotice({ ...req.body, projectId: req.params.projectId, registeredBy: ctx.uid }, assignment);
    return res.status(201).json(result);
  } catch (err: any) {
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message });
    if (err.code === 'VALIDATION_ERROR') return res.status(400).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.get('/:projectId/notices', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    const notices = await getActiveNotices(req.params.projectId);
    return res.json(notices);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.put('/:projectId/notices/:noticeId/acknowledge', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    const assignment = await buildProjectAssignment(ctx.uid, ctx.normalizedRole || 'client', req.params.projectId);
    const result = await acknowledgeNotice(req.params.projectId, req.params.noticeId, ctx.uid, assignment);
    return res.json(result);
  } catch (err: any) {
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message });
    if (err.code === 'INVALID_TRANSITION') return res.status(409).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.put('/:projectId/notices/:noticeId/respond', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    const assignment = await buildProjectAssignment(ctx.uid, ctx.normalizedRole || 'client', req.params.projectId);
    const result = await respondToNotice(req.params.projectId, req.params.noticeId, req.body, assignment);
    return res.json(result);
  } catch (err: any) {
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message });
    if (err.code === 'INVALID_TRANSITION') return res.status(409).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.put('/:projectId/notices/:noticeId/withdraw', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    const assignment = await buildProjectAssignment(ctx.uid, ctx.normalizedRole || 'client', req.params.projectId);
    const result = await withdrawNotice(req.params.projectId, req.params.noticeId, ctx.uid, assignment);
    return res.json(result);
  } catch (err: any) {
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message });
    if (err.code === 'INVALID_TRANSITION') return res.status(409).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── Variations ──────────────────────────────────────────────────────────────

router.post('/:projectId/variations', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    const assignment = await buildProjectAssignment(ctx.uid, ctx.normalizedRole || 'client', req.params.projectId);
    const result = await createVariation({ ...req.body, projectId: req.params.projectId, createdBy: ctx.uid }, assignment);
    return res.status(201).json(result);
  } catch (err: any) {
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message });
    if (err.code === 'VALIDATION_ERROR') return res.status(400).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.put('/:projectId/variations/:variationId/transition', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    const assignment = await buildProjectAssignment(ctx.uid, ctx.normalizedRole || 'client', req.params.projectId);
    const result = await transitionVariation(req.params.projectId, req.params.variationId, req.body.toStatus, ctx.uid, assignment);
    return res.json(result);
  } catch (err: any) {
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message });
    if (err.code === 'INVALID_TRANSITION') return res.status(409).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.put('/:projectId/variations/:variationId/value', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    const assignment = await buildProjectAssignment(ctx.uid, ctx.normalizedRole || 'client', req.params.projectId);
    const result = await valueVariation(req.params.projectId, req.params.variationId, req.body.costImpact, req.body.timeImpactDays, ctx.uid, assignment);
    return res.json(result);
  } catch (err: any) {
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message });
    if (err.code === 'VALIDATION_ERROR') return res.status(400).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.put('/:projectId/variations/:variationId/link-specforge', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    const { specForgeRef } = req.body;
    if (!specForgeRef) return res.status(400).json({ error: 'specForgeRef is required' });
    const variationRef = adminDb
      .collection(`projects/${req.params.projectId}/contractAdmin/variations/items`)
      .doc(req.params.variationId);
    await variationRef.set({ specForgeRef, linkedAt: new Date().toISOString() }, { merge: true });
    return res.json({ success: true, variationId: req.params.variationId, specForgeRef });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.get('/:projectId/variations/summary', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    const summary = await getCumulativeSummary(req.params.projectId);
    return res.json(summary);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── EoT Claims ──────────────────────────────────────────────────────────────

router.post('/:projectId/eot-claims', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    const result = await createEoTClaim({ ...req.body, projectId: req.params.projectId, createdBy: ctx.uid });
    return res.status(201).json(result);
  } catch (err: any) {
    if (err.code === 'VALIDATION_ERROR') return res.status(400).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.put('/:projectId/eot-claims/:claimId/submit', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    const result = await submitEoTClaim(req.params.projectId, req.params.claimId, ctx.uid);
    return res.json(result);
  } catch (err: any) {
    if (err.code === 'VALIDATION_ERROR') return res.status(400).json({ error: err.message, details: err.details });
    if (err.code === 'INVALID_TRANSITION') return res.status(409).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.put('/:projectId/eot-claims/:claimId/review', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    const result = await reviewEoTClaim(req.params.projectId, req.params.claimId, req.body.decision, req.body.approvedDays, ctx.uid);
    return res.json(result);
  } catch (err: any) {
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message });
    if (err.code === 'VALIDATION_ERROR') return res.status(400).json({ error: err.message, details: err.details });
    if (err.code === 'INVALID_TRANSITION') return res.status(409).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── Claims ──────────────────────────────────────────────────────────────────

router.post('/:projectId/claims', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    const assignment = await buildProjectAssignment(ctx.uid, ctx.normalizedRole || 'client', req.params.projectId);
    const result = await registerClaim({ ...req.body, projectId: req.params.projectId, createdBy: ctx.uid }, assignment);
    return res.status(201).json(result);
  } catch (err: any) {
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message });
    if (err.code === 'VALIDATION_ERROR') return res.status(400).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.put('/:projectId/claims/:claimId/transition', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    const assignment = await buildProjectAssignment(ctx.uid, ctx.normalizedRole || 'client', req.params.projectId);
    const result = await transitionClaim(req.params.projectId, req.params.claimId, req.body.toStatus, ctx.uid, req.body.reason, assignment);
    return res.json(result);
  } catch (err: any) {
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message });
    if (err.code === 'INVALID_TRANSITION') return res.status(409).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.put('/:projectId/claims/:claimId/dissatisfaction', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'reason is required' });
    const claimRef = adminDb
      .collection(`projects/${req.params.projectId}/contractAdmin/claims/items`)
      .doc(req.params.claimId);
    await claimRef.set({
      dissatisfaction: { registeredBy: ctx.uid, reason, registeredAt: new Date().toISOString() },
    }, { merge: true });
    return res.json({ success: true, claimId: req.params.claimId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.put('/:projectId/claims/:claimId/evidence', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    const { evidence } = req.body;
    if (!evidence) return res.status(400).json({ error: 'evidence is required' });
    const claimRef = adminDb
      .collection(`projects/${req.params.projectId}/contractAdmin/claims/items`)
      .doc(req.params.claimId);
    await claimRef.set({
      evidence,
      evidenceLinkedAt: new Date().toISOString(),
      evidenceLinkedBy: ctx.uid,
    }, { merge: true });
    return res.json({ success: true, claimId: req.params.claimId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.get('/:projectId/claims/summary', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    const summary = await getClaimsCumulativeSummary(req.params.projectId);
    return res.json(summary);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── Payment Schedule ────────────────────────────────────────────────────────

router.post('/:projectId/payment-schedule/regenerate', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    await regenerateRemainingSchedule(req.params.projectId, req.body.revisedCompletionDate);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.post('/:projectId/payment-schedule/deadline-check', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    const results = await runPaymentDeadlineCheck(req.params.projectId);
    return res.json(results);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.post('/:projectId/payment-schedule/link-certificate', async (req: Request, res: Response) => {
  try {
    const ctx = req.authContext;
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    const { entryId, certificateRef } = req.body;
    if (!entryId || !certificateRef) return res.status(400).json({ error: 'entryId and certificateRef are required' });
    const entryRef = adminDb
      .collection(`projects/${req.params.projectId}/contractAdmin/paymentSchedule/entries`)
      .doc(entryId);
    await entryRef.set({
      certificateRef,
      linkedAt: new Date().toISOString(),
      linkedBy: ctx.uid,
    }, { merge: true });
    return res.json({ success: true, entryId, certificateRef });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
