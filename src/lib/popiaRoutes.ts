/**
 * POPIA/PAIA Compliance API Routes
 *
 * Endpoints for data classification, consent management,
 * retention schedules, and breach notification workflow.
 */

import express from 'express';
import { requireAdmin, requireAuth } from './roleMiddleware';
import {
  recordConsent,
  hasActiveConsent,
  withdrawConsent,
  getUserConsents,
  getRequiredConsentPurposes,
  classifyDataObject,
  getRetentionSchedules,
  upsertRetentionSchedule,
  reportBreach,
  assessBreach,
  notifyRegulator,
  notifySubjects,
  remediateBreach,
  closeBreach,
  getBreaches,
  seedRetentionSchedules,
} from '../services/popiaComplianceService';

const router = express.Router();

// ── Consent endpoints ─────────────────────────────────────────────────────────

/**
 * POST /popia/consent — Record user consent
 */
router.post('/consent', requireAuth, async (req, res) => {
  try {
    const ctx = req.authContext!;
    const { purpose, status, classification } = req.body;

    if (!purpose || !status || !classification) {
      return res.status(400).json({ error: 'purpose, status, and classification are required' });
    }

    const record = await recordConsent({
      userId: ctx.uid,
      purpose,
      status,
      classification: Array.isArray(classification) ? classification : [classification],
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      metadata: req.body.metadata,
    });

    res.status(201).json({ consent: record });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * GET /popia/consent — Get user's consent records
 */
router.get('/consent', requireAuth, async (req, res) => {
  try {
    const ctx = req.authContext!;
    const records = await getUserConsents(ctx.uid);
    res.json({ consents: records });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /popia/consent/check — Check if user has active consent
 */
router.post('/consent/check', requireAuth, async (req, res) => {
  try {
    const ctx = req.authContext!;
    const { purpose } = req.body;
    if (!purpose) return res.status(400).json({ error: 'purpose is required' });

    const active = await hasActiveConsent(ctx.uid, purpose);
    res.json({ hasConsent: active, purpose });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /popia/consent/withdraw — Withdraw consent
 */
router.post('/consent/withdraw', requireAuth, async (req, res) => {
  try {
    const ctx = req.authContext!;
    const { purpose } = req.body;
    if (!purpose) return res.status(400).json({ error: 'purpose is required' });

    const record = await withdrawConsent(ctx.uid, purpose);
    if (!record) {
      return res.status(404).json({ error: 'No active consent found for this purpose' });
    }
    res.json({ consent: record });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * GET /popia/consent/required — Get required consent purposes for the user's role
 */
router.get('/consent/required', requireAuth, async (req, res) => {
  try {
    const ctx = req.authContext!;
    const purposes = getRequiredConsentPurposes(ctx.role || 'client');

    // Check which ones are already consented
    const consentStatuses = await Promise.all(
      purposes.map(async (purpose) => ({
        purpose,
        consented: await hasActiveConsent(ctx.uid, purpose),
      })),
    );

    res.json({ requiredPurposes: consentStatuses });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── Data classification ───────────────────────────────────────────────────────

/**
 * POST /popia/classify — Classify a data object
 */
router.post('/classify', requireAuth, async (req, res) => {
  try {
    const { data } = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'data object is required' });
    }

    const classification = classifyDataObject(data);
    res.json({ classification });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── Retention schedule endpoints (admin only) ─────────────────────────────────

/**
 * GET /popia/retention — Get all retention schedules
 */
router.get('/retention', requireAdmin, async (_req, res) => {
  try {
    // Seed defaults if none exist
    await seedRetentionSchedules();
    const schedules = await getRetentionSchedules();
    res.json({ schedules });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /popia/retention — Upsert a retention schedule
 */
router.post('/retention', requireAdmin, async (req, res) => {
  try {
    const schedule = await upsertRetentionSchedule(req.body);
    res.status(201).json({ schedule });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── Breach notification endpoints (admin only) ────────────────────────────────

/**
 * GET /popia/breaches — List breach notifications
 */
router.get('/breaches', requireAdmin, async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const breaches = await getBreaches(status as any);
    res.json({ breaches });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /popia/breaches/report — Report a breach
 */
router.post('/breaches/report', requireAdmin, async (req, res) => {
  try {
    const ctx = req.authContext!;
    const { title, description, severity, dataClasses, estimatedRecordsAffected, metadata } = req.body;

    if (!title || !description || !severity || !dataClasses) {
      return res.status(400).json({ error: 'title, description, severity, and dataClasses are required' });
    }

    const breach = await reportBreach({
      title,
      description,
      severity,
      dataClasses: Array.isArray(dataClasses) ? dataClasses : [dataClasses],
      estimatedRecordsAffected: Number(estimatedRecordsAffected) || 0,
      reportedBy: ctx.uid,
      metadata,
    });

    res.status(201).json({ breach });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /popia/breaches/:breachId/assess — Assess a breach
 */
router.post('/breaches/:breachId/assess', requireAdmin, async (req, res) => {
  try {
    const { breachId } = req.params;
    const { assessmentNotes, updatedSeverity } = req.body;

    if (!assessmentNotes) {
      return res.status(400).json({ error: 'assessmentNotes is required' });
    }

    const breach = await assessBreach(breachId, { assessmentNotes, updatedSeverity });
    if (!breach) return res.status(404).json({ error: 'Breach not found' });

    res.json({ breach });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /popia/breaches/:breachId/notify-regulator — Notify the regulator
 */
router.post('/breaches/:breachId/notify-regulator', requireAdmin, async (req, res) => {
  try {
    const { breachId } = req.params;
    const breach = await notifyRegulator(breachId);
    if (!breach) return res.status(404).json({ error: 'Breach not found' });

    res.json({ breach });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /popia/breaches/:breachId/notify-subjects — Notify affected subjects
 */
router.post('/breaches/:breachId/notify-subjects', requireAdmin, async (req, res) => {
  try {
    const { breachId } = req.params;
    const { subjectIds } = req.body;

    const breach = await notifySubjects(breachId, Array.isArray(subjectIds) ? subjectIds : undefined);
    if (!breach) return res.status(404).json({ error: 'Breach not found' });

    res.json({ breach });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /popia/breaches/:breachId/remediate — Record remediation steps
 */
router.post('/breaches/:breachId/remediate', requireAdmin, async (req, res) => {
  try {
    const { breachId } = req.params;
    const { remediationSteps } = req.body;

    if (!remediationSteps || !Array.isArray(remediationSteps)) {
      return res.status(400).json({ error: 'remediationSteps array is required' });
    }

    const breach = await remediateBreach(breachId, { remediationSteps });
    if (!breach) return res.status(404).json({ error: 'Breach not found' });

    res.json({ breach });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /popia/breaches/:breachId/close — Close breach after remediation
 */
router.post('/breaches/:breachId/close', requireAdmin, async (req, res) => {
  try {
    const { breachId } = req.params;
    const breach = await closeBreach(breachId);
    if (!breach) return res.status(404).json({ error: 'Breach not found' });

    res.json({ breach });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
