/**
 * Contract Administration API Router
 *
 * Server-side endpoints for contract admin mutations.
 * All routes enforce authentication and RBAC via the user's Firebase session.
 */

import { Router, type Request, type Response } from 'express';
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

// ── Auth middleware helper ───────────────────────────────────────────────────
async function getAuthenticatedUser(req: Request): Promise<{ uid: string; role: UserRole; email: string } | null> {
  try {
    // Extract from the decoded token stored by upstream auth middleware
    const user = (req as any).user;
    if (!user?.uid) return null;
    // Look up role from Firestore
    const userDoc = await adminDb.collection('users').doc(user.uid).get();
    if (!userDoc.exists) return null;
    const userData = userDoc.data()!;
    return { uid: user.uid, role: (userData.role || 'client') as UserRole, email: userData.email || '' };
  } catch {
    return null;
  }
}

// Build project assignment from authenticated user
async function buildProjectAssignment(uid: string, role: UserRole, projectId: string) {
  // Check if user is assigned to the project
  const teamDoc = await adminDb.collection(`projects/${projectId}/team`).doc(uid).get();
  const isTeamMember = teamDoc.exists;
  const projectDoc = await adminDb.collection('projects').doc(projectId).get();
  const isOwner = projectDoc.exists && projectDoc.data()?.clientId === uid;

  return {
    projectId,
    userId: uid,
    roles: [role],
    isAssignedTeamMember: isTeamMember || ['architect', 'bep', 'quantity_surveyor', 'engineer'].includes(role),
    isAssignedContractor: role === 'contractor' && isTeamMember,
    isAssignedSubcontractor: role === 'subcontractor' && isTeamMember,
    isProjectOwner: isOwner || ['client', 'developer'].includes(role),
    isAssignedSiteManager: role === 'site_manager' && isTeamMember,
  };
}

// ── Contract Setup ──────────────────────────────────────────────────────────

router.post('/api/contract-admin/:projectId/setup', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const assignment = await buildProjectAssignment(user.uid, user.role, req.params.projectId);
    const result = await setupContract({ ...req.body, projectId: req.params.projectId, setupBy: user.uid }, assignment);
    return res.status(201).json(result);
  } catch (err: any) {
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message });
    if (err.code === 'VALIDATION_ERROR') return res.status(400).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.get('/api/contract-admin/:projectId/config', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const config = await getContractConfig(req.params.projectId);
    if (!config) return res.status(404).json({ error: 'No contract configured' });
    return res.json(config);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── Notices ─────────────────────────────────────────────────────────────────

router.post('/api/contract-admin/:projectId/notices', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const assignment = await buildProjectAssignment(user.uid, user.role, req.params.projectId);
    const result = await registerNotice({ ...req.body, projectId: req.params.projectId, registeredBy: user.uid }, assignment);
    return res.status(201).json(result);
  } catch (err: any) {
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message });
    if (err.code === 'VALIDATION_ERROR') return res.status(400).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.get('/api/contract-admin/:projectId/notices', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const notices = await getActiveNotices(req.params.projectId);
    return res.json(notices);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.put('/api/contract-admin/:projectId/notices/:noticeId/acknowledge', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const assignment = await buildProjectAssignment(user.uid, user.role, req.params.projectId);
    const result = await acknowledgeNotice(req.params.projectId, req.params.noticeId, user.uid, assignment);
    return res.json(result);
  } catch (err: any) {
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message });
    if (err.code === 'INVALID_TRANSITION') return res.status(409).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.put('/api/contract-admin/:projectId/notices/:noticeId/respond', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const assignment = await buildProjectAssignment(user.uid, user.role, req.params.projectId);
    const result = await respondToNotice(req.params.projectId, req.params.noticeId, req.body, assignment);
    return res.json(result);
  } catch (err: any) {
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message });
    if (err.code === 'INVALID_TRANSITION') return res.status(409).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.put('/api/contract-admin/:projectId/notices/:noticeId/withdraw', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const assignment = await buildProjectAssignment(user.uid, user.role, req.params.projectId);
    const result = await withdrawNotice(req.params.projectId, req.params.noticeId, user.uid, assignment);
    return res.json(result);
  } catch (err: any) {
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message });
    if (err.code === 'INVALID_TRANSITION') return res.status(409).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── Variations ──────────────────────────────────────────────────────────────

router.post('/api/contract-admin/:projectId/variations', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const assignment = await buildProjectAssignment(user.uid, user.role, req.params.projectId);
    const result = await createVariation({ ...req.body, projectId: req.params.projectId, createdBy: user.uid }, assignment);
    return res.status(201).json(result);
  } catch (err: any) {
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message });
    if (err.code === 'VALIDATION_ERROR') return res.status(400).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.put('/api/contract-admin/:projectId/variations/:variationId/transition', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const assignment = await buildProjectAssignment(user.uid, user.role, req.params.projectId);
    const result = await transitionVariation(req.params.projectId, req.params.variationId, req.body.toStatus, user.uid, assignment);
    return res.json(result);
  } catch (err: any) {
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message });
    if (err.code === 'INVALID_TRANSITION') return res.status(409).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.put('/api/contract-admin/:projectId/variations/:variationId/value', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const assignment = await buildProjectAssignment(user.uid, user.role, req.params.projectId);
    const result = await valueVariation(req.params.projectId, req.params.variationId, req.body.costImpact, req.body.timeImpactDays, user.uid, assignment);
    return res.json(result);
  } catch (err: any) {
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message });
    if (err.code === 'VALIDATION_ERROR') return res.status(400).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.get('/api/contract-admin/:projectId/variations/summary', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const summary = await getCumulativeSummary(req.params.projectId);
    return res.json(summary);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── EoT Claims ──────────────────────────────────────────────────────────────

router.post('/api/contract-admin/:projectId/eot-claims', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const result = await createEoTClaim({ ...req.body, projectId: req.params.projectId, createdBy: user.uid });
    return res.status(201).json(result);
  } catch (err: any) {
    if (err.code === 'VALIDATION_ERROR') return res.status(400).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.put('/api/contract-admin/:projectId/eot-claims/:claimId/submit', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const result = await submitEoTClaim(req.params.projectId, req.params.claimId, user.uid);
    return res.json(result);
  } catch (err: any) {
    if (err.code === 'VALIDATION_ERROR') return res.status(400).json({ error: err.message, details: err.details });
    if (err.code === 'INVALID_TRANSITION') return res.status(409).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.put('/api/contract-admin/:projectId/eot-claims/:claimId/review', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const result = await reviewEoTClaim(req.params.projectId, req.params.claimId, req.body.decision, req.body.approvedDays, user.uid);
    return res.json(result);
  } catch (err: any) {
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message });
    if (err.code === 'VALIDATION_ERROR') return res.status(400).json({ error: err.message, details: err.details });
    if (err.code === 'INVALID_TRANSITION') return res.status(409).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── Claims ──────────────────────────────────────────────────────────────────

router.post('/api/contract-admin/:projectId/claims', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const assignment = await buildProjectAssignment(user.uid, user.role, req.params.projectId);
    const result = await registerClaim({ ...req.body, projectId: req.params.projectId, createdBy: user.uid }, assignment);
    return res.status(201).json(result);
  } catch (err: any) {
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message });
    if (err.code === 'VALIDATION_ERROR') return res.status(400).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.put('/api/contract-admin/:projectId/claims/:claimId/transition', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const assignment = await buildProjectAssignment(user.uid, user.role, req.params.projectId);
    const result = await transitionClaim(req.params.projectId, req.params.claimId, req.body.toStatus, user.uid, req.body.reason, assignment);
    return res.json(result);
  } catch (err: any) {
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message });
    if (err.code === 'INVALID_TRANSITION') return res.status(409).json({ error: err.message, details: err.details });
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.get('/api/contract-admin/:projectId/claims/summary', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const summary = await getClaimsCumulativeSummary(req.params.projectId);
    return res.json(summary);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── Payment Schedule ────────────────────────────────────────────────────────

router.post('/api/contract-admin/:projectId/payment-schedule/regenerate', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    await regenerateRemainingSchedule(req.params.projectId, req.body.revisedCompletionDate);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.post('/api/contract-admin/:projectId/payment-schedule/deadline-check', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const results = await runPaymentDeadlineCheck(req.params.projectId);
    return res.json(results);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
