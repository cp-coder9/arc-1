/**
 * Finance / Payment / Escrow + Commercial Control — API Routes
 *
 * Pack 8: All money movement, trust/escrow wallets, card/EFT collections,
 * payouts and compliance-sensitive financial services must be executed by
 * third-party trusted and registered financial service providers through
 * approved connectors. Architex stores project/commercial records, approvals,
 * provider references, webhooks and audit trails.
 */
import express from 'express';
import type { Request, Response } from 'express';

// Finance services — pure functions, no Firebase dependency at route level
import {
  createCommercialBaseline,
  incorporateVariationIntoBaseline,
  calculateContingency,
} from '../services/finance/commercialBaselineService';
import {
  buildPaymentSchedule,
  buildCustomPaymentSchedule,
  findNextPaymentDue,
  totalScheduledAmount,
} from '../services/finance/paymentScheduleService';
import {
  createVariationRequest,
  approveAndIncorporateVariation,
  rejectVariation,
  reverseVariation,
} from '../services/finance/variationControlService';
import {
  submitPaymentClaim,
  disputeClaim,
  resolveDispute,
} from '../services/finance/claimSubmissionService';
import {
  certifyPaymentClaim,
  reviseCertificate,
  calculateNetPayable,
  approveCertificateForRelease,
} from '../services/finance/paymentCertificateService';
import {
  selectProvider,
  assessProviderReadiness,
  registerProvider,
  findProvidersByType,
} from '../services/finance/thirdPartyFinancialProviderRegistry';
import {
  createReleaseRequest,
  approveReleaseRequest,
  getReleaseBlockers,
} from '../services/finance/escrowReleaseRequestService';
import {
  recordProviderStatusEvent,
  parseProviderWebhook,
  confirmPaymentReceived,
  handlePaymentFailure,
} from '../services/finance/paymentProviderWebhookAdapter';
import {
  calculateRetention,
  createRetentionRecord,
  releaseRetention,
} from '../services/finance/retentionService';
import {
  createCashflowForecast,
  compareActualsVsForecast,
} from '../services/finance/cashflowForecastService';
import {
  createProjectRecords,
  createPaymentScheduleRecord,
} from '../services/finance/projectRecordAdapter';
import { createInboxEvents } from '../services/finance/inboxEventAdapter';
import { createAuditTrail } from '../services/finance/auditTrailService';
import { createAgentRecommendations } from '../services/finance/agentRecommendationService';
import { requireAuth, requireAdmin } from '../lib/roleMiddleware';

const router = express.Router();

// Router-level auth: ALL finance routes require authentication.
router.use(requireAuth);

// ---------------------------------------------------------------------------
// Commercial Baseline
// ---------------------------------------------------------------------------

/** POST /api/projects/:projectId/commercial-baseline */
router.post(
  '/api/projects/:projectId/commercial-baseline',
  async (req: Request, res: Response) => {
    try {
      const { award } = req.body;
      if (!award?.awardId || !award?.projectId) {
        return res.status(400).json({ error: 'Award snapshot with awardId and projectId required.' });
      }
      const baseline = createCommercialBaseline(award);
      return res.status(201).json(baseline);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

/** GET /api/projects/:projectId/commercial-baseline/contingency */
router.get(
  '/api/projects/:projectId/commercial-baseline/contingency',
  async (req: Request, res: Response) => {
    try {
      // In production, baseline would be fetched from Firestore
      // This endpoint computes contingency from a baseline passed in query or body
      const { baseline } = req.body;
      if (!baseline) {
        return res.status(400).json({ error: 'Baseline object required in body.' });
      }
      const contingency = calculateContingency(baseline);
      return res.json({ contingency, baselineId: baseline.baselineId });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

// ---------------------------------------------------------------------------
// Payment Schedule
// ---------------------------------------------------------------------------

/** GET /api/projects/:projectId/payment-schedule */
router.get(
  '/api/projects/:projectId/payment-schedule',
  async (req: Request, res: Response) => {
    try {
      const { baseline } = req.body;
      if (!baseline) {
        return res.status(400).json({ error: 'Baseline object required in body to generate schedule.' });
      }
      const schedule = buildPaymentSchedule(baseline);
      const nextDue = findNextPaymentDue(schedule);
      return res.json({
        schedule,
        nextDue,
        totalScheduled: totalScheduledAmount(schedule),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

/** POST /api/projects/:projectId/payment-schedule/custom */
router.post(
  '/api/projects/:projectId/payment-schedule/custom',
  async (req: Request, res: Response) => {
    try {
      const { baseline, milestones } = req.body;
      if (!baseline || !milestones) {
        return res.status(400).json({ error: 'Baseline and milestones array required.' });
      }
      const schedule = buildCustomPaymentSchedule(baseline, milestones);
      return res.status(201).json(schedule);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

// ---------------------------------------------------------------------------
// Variations
// ---------------------------------------------------------------------------

/** POST /api/projects/:projectId/variations */
router.post(
  '/api/projects/:projectId/variations',
  async (req: Request, res: Response) => {
    try {
      const { description, requestedBy, estimatedImpact, programmeImpactDays } = req.body;
      if (!description || !estimatedImpact) {
        return res.status(400).json({ error: 'description and estimatedImpact required.' });
      }
      const variation = createVariationRequest({
        description,
        requestedBy: requestedBy ?? 'contractor',
        estimatedImpact,
        programmeImpactDays: programmeImpactDays ?? 0,
      });
      return res.status(201).json(variation);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

/** PUT /api/projects/:projectId/variations/:variationId/approve */
router.put(
  '/api/projects/:projectId/variations/:variationId/approve',
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { baseline, variation } = req.body;
      if (!baseline || !variation) {
        return res.status(400).json({ error: 'baseline and variation objects required.' });
      }
      const result = approveAndIncorporateVariation(baseline, variation);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

/** PUT /api/projects/:projectId/variations/:variationId/reject */
router.put(
  '/api/projects/:projectId/variations/:variationId/reject',
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { variation, reviewerRole } = req.body;
      if (!variation) {
        return res.status(400).json({ error: 'variation object required.' });
      }
      const rejected = rejectVariation(variation, reviewerRole ?? 'lead_professional');
      return res.json(rejected);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

/** PUT /api/projects/:projectId/variations/:variationId/reverse */
router.put(
  '/api/projects/:projectId/variations/:variationId/reverse',
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { baseline, variation } = req.body;
      if (!baseline || !variation) {
        return res.status(400).json({ error: 'baseline and variation objects required.' });
      }
      const result = reverseVariation(baseline, variation);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

/** POST /api/projects/:projectId/claims */
router.post(
  '/api/projects/:projectId/claims',
  async (req: Request, res: Response) => {
    try {
      const { claimantRole, claimedAmount, linkedMilestoneId, linkedVariationIds, disputed, description } = req.body;
      if (!claimedAmount || !linkedMilestoneId) {
        return res.status(400).json({ error: 'claimedAmount and linkedMilestoneId required.' });
      }
      const claim = submitPaymentClaim({
        claimantRole: claimantRole ?? 'contractor',
        claimedAmount,
        linkedMilestoneId,
        linkedVariationIds,
        disputed,
        description,
      });
      return res.status(201).json(claim);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

/** PUT /api/projects/:projectId/claims/:claimId/dispute */
router.put(
  '/api/projects/:projectId/claims/:claimId/dispute',
  async (req: Request, res: Response) => {
    try {
      const { claim, reason } = req.body;
      if (!claim) {
        return res.status(400).json({ error: 'claim object required.' });
      }
      const disputed = disputeClaim(claim, reason);
      return res.json(disputed);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

/** PUT /api/projects/:projectId/claims/:claimId/resolve-dispute */
router.put(
  '/api/projects/:projectId/claims/:claimId/resolve-dispute',
  async (req: Request, res: Response) => {
    try {
      const { claim } = req.body;
      if (!claim) {
        return res.status(400).json({ error: 'claim object required.' });
      }
      const resolved = resolveDispute(claim);
      return res.json(resolved);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

// ---------------------------------------------------------------------------
// Payment Certificates
// ---------------------------------------------------------------------------

/** POST /api/projects/:projectId/payment-certificates */
router.post(
  '/api/projects/:projectId/payment-certificates',
  async (req: Request, res: Response) => {
    try {
      const { claim, baseline, certifiedAmount, reviewerRoles } = req.body;
      if (!claim || !baseline || !certifiedAmount) {
        return res.status(400).json({ error: 'claim, baseline, and certifiedAmount required.' });
      }
      const certificate = certifyPaymentClaim(claim, baseline, certifiedAmount, reviewerRoles);
      return res.status(201).json(certificate);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

/** PUT /api/projects/:projectId/payment-certificates/:certId/revise */
router.put(
  '/api/projects/:projectId/payment-certificates/:certId/revise',
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { previousCertificate, claim, baseline, newCertifiedAmount, reviewerRoles } = req.body;
      if (!previousCertificate || !claim || !baseline || !newCertifiedAmount) {
        return res.status(400).json({ error: 'previousCertificate, claim, baseline, and newCertifiedAmount required.' });
      }
      const revised = reviseCertificate(previousCertificate, claim, baseline, newCertifiedAmount, reviewerRoles);
      return res.json(revised);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

/** POST /api/projects/:projectId/payment-certificates/net-payable */
router.post(
  '/api/projects/:projectId/payment-certificates/net-payable',
  async (req: Request, res: Response) => {
    try {
      const { certificate, previousPaymentsTotal } = req.body;
      if (!certificate) {
        return res.status(400).json({ error: 'certificate object required.' });
      }
      const net = calculateNetPayable(certificate, previousPaymentsTotal ?? 0);
      return res.json(net);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

// ---------------------------------------------------------------------------
// Third-Party Financial Providers
// ---------------------------------------------------------------------------

/** GET /api/providers */
router.get('/api/providers', async (req: Request, res: Response) => {
  try {
    const { providerType } = req.query;
    // In production, providers would be loaded from Firestore
    // For now, this endpoint accepts a providers array in the body for lookup
    return res.json({ message: 'Provider registry endpoint. POST providers array to query.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** POST /api/providers/select */
router.post('/api/providers/select', async (req: Request, res: Response) => {
  try {
    const { providers, capability } = req.body;
    if (!providers || !capability) {
      return res.status(400).json({ error: 'providers array and capability required.' });
    }
    const selected = selectProvider(providers, capability);
    const readiness = assessProviderReadiness(selected);
    return res.json({ provider: selected, readiness });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** POST /api/providers/register */
router.post('/api/providers/register', async (req: Request, res: Response) => {
  try {
    const { providers, newProvider } = req.body;
    if (!providers || !newProvider) {
      return res.status(400).json({ error: 'providers array and newProvider object required.' });
    }
    const updated = registerProvider(providers, newProvider);
    return res.status(201).json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Escrow Release Requests
// ---------------------------------------------------------------------------

/** POST /api/projects/:projectId/release-requests */
router.post(
  '/api/projects/:projectId/release-requests',
  async (req: Request, res: Response) => {
    try {
      const { certificate, provider, approvals, requiredApprovals } = req.body;
      if (!certificate || !provider) {
        return res.status(400).json({ error: 'certificate and provider objects required.' });
      }
      const release = createReleaseRequest(
        certificate,
        provider,
        approvals ?? [],
        requiredApprovals,
      );
      const blockers = getReleaseBlockers(release, provider);
      return res.status(201).json({ release, blockers });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

/** PUT /api/projects/:projectId/release-requests/:releaseId/approve */
router.put(
  '/api/projects/:projectId/release-requests/:releaseId/approve',
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { releaseRequest, approverRole, provider } = req.body;
      if (!releaseRequest || !approverRole || !provider) {
        return res.status(400).json({ error: 'releaseRequest, approverRole, and provider required.' });
      }
      const updated = approveReleaseRequest(releaseRequest, approverRole, provider);
      return res.json(updated);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

// ---------------------------------------------------------------------------
// Provider Webhooks
// ---------------------------------------------------------------------------

/** POST /api/webhooks/payment-provider */
router.post('/api/webhooks/payment-provider', async (req: Request, res: Response) => {
  try {
    const parsed = parseProviderWebhook(req.body);
    if (!parsed.valid) {
      return res.status(400).json({ valid: false, errors: parsed.errors });
    }
    // In production, this would verify webhook signatures and update Firestore
    return res.status(200).json({ valid: true, event: parsed.event });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** POST /api/webhooks/payment-provider/confirm */
router.post('/api/webhooks/payment-provider/confirm', async (req: Request, res: Response) => {
  try {
    const { releaseRequest, providerReference } = req.body;
    if (!releaseRequest || !providerReference) {
      return res.status(400).json({ error: 'releaseRequest and providerReference required.' });
    }
    const confirmed = confirmPaymentReceived(releaseRequest, providerReference);
    const event = recordProviderStatusEvent(confirmed);
    return res.json({ release: confirmed, providerEvent: event });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** POST /api/webhooks/payment-provider/failure */
router.post('/api/webhooks/payment-provider/failure', async (req: Request, res: Response) => {
  try {
    const { releaseRequest, reason } = req.body;
    if (!releaseRequest || !reason) {
      return res.status(400).json({ error: 'releaseRequest and reason required.' });
    }
    const { request: updated, event } = handlePaymentFailure(releaseRequest, reason);
    return res.json({ release: updated, providerEvent: event });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

/** POST /api/projects/:projectId/retention/calculate */
router.post(
  '/api/projects/:projectId/retention/calculate',
  async (req: Request, res: Response) => {
    try {
      const { certifiedAmount, retentionPercent } = req.body;
      if (!certifiedAmount || retentionPercent === undefined) {
        return res.status(400).json({ error: 'certifiedAmount and retentionPercent required.' });
      }
      const amount = calculateRetention(certifiedAmount, retentionPercent);
      return res.json(amount);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

/** POST /api/projects/:projectId/retention/records */
router.post(
  '/api/projects/:projectId/retention/records',
  async (req: Request, res: Response) => {
    try {
      const { projectId, certificateId, amountHeld, percent, scheduledReleaseDate } = req.body;
      const record = createRetentionRecord({
        projectId,
        certificateId,
        amountHeld,
        percent,
        scheduledReleaseDate,
      });
      return res.status(201).json(record);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

/** PUT /api/projects/:projectId/retention/:retentionId/release */
router.put(
  '/api/projects/:projectId/retention/:retentionId/release',
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { retentionRecord, releaseAmount } = req.body;
      if (!retentionRecord || !releaseAmount) {
        return res.status(400).json({ error: 'retentionRecord and releaseAmount required.' });
      }
      const updated = releaseRetention(retentionRecord, releaseAmount);
      return res.json(updated);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

// ---------------------------------------------------------------------------
// Cashflow Forecast
// ---------------------------------------------------------------------------

/** POST /api/projects/:projectId/cashflow-forecast */
router.post(
  '/api/projects/:projectId/cashflow-forecast',
  async (req: Request, res: Response) => {
    try {
      const { projectId, schedule, certificate, notes } = req.body;
      if (!projectId || !schedule || !certificate) {
        return res.status(400).json({ error: 'projectId, schedule, and certificate required.' });
      }
      const forecast = createCashflowForecast(projectId, schedule, certificate, notes);
      return res.status(201).json(forecast);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

/** POST /api/projects/:projectId/cashflow-forecast/compare */
router.post(
  '/api/projects/:projectId/cashflow-forecast/compare',
  async (req: Request, res: Response) => {
    try {
      const { forecast, actualPaidToDate } = req.body;
      if (!forecast) {
        return res.status(400).json({ error: 'forecast object required.' });
      }
      const comparison = compareActualsVsForecast(forecast, actualPaidToDate ?? 0);
      return res.json(comparison);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

// ---------------------------------------------------------------------------
// Project Records, Inbox Events, Audit & Recommendations (compound endpoint)
// ---------------------------------------------------------------------------

/** POST /api/projects/:projectId/finance/workflow-summary */
router.post(
  '/api/projects/:projectId/finance/workflow-summary',
  async (req: Request, res: Response) => {
    try {
      const { baseline, variation, certificate, release, provider, schedule } = req.body;
      if (!baseline || !variation || !certificate || !release) {
        return res.status(400).json({
          error: 'baseline, variation, certificate, and release objects required.',
        });
      }
      const records = createProjectRecords(baseline, variation, certificate, release);
      const inbox = createInboxEvents(certificate, release, variation);
      const audit = createAuditTrail(baseline, variation, certificate, release);
      const providerNotes = provider ? assessProviderReadiness(provider) : ['Provider not specified.'];
      const recommendations = createAgentRecommendations(certificate, release, providerNotes);

      return res.json({
        projectId: req.params.projectId,
        records,
        inbox,
        audit,
        recommendations,
        summary: {
          contractSum: baseline.currentContractSum,
          variationsTotal: baseline.approvedVariationsTotal,
          certifiedAmount: certificate.certifiedAmount,
          retentionHeld: certificate.retentionHeld,
          approvedForRelease: certificate.approvedForRelease,
          releaseStatus: release.status,
          providerId: release.providerId,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
);

export default router;
