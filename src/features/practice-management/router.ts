/**
 * Practice Management Module — Express API Router (P2.9)
 *
 * Dependency-injected Express router for small/medium firm practice management.
 * Base path: /api/practice
 *
 * Key enforcement:
 * - Firm-level data isolation: all queries scoped to user's firmId
 * - FirmRole checks: firm_admin or owner for mutations
 * - Subscription tier gating: Essentials vs Professional
 * - Zod validation at API boundary
 *
 * Requirements: 14.1, 14.2, 14.3, 14.9
 */

import { Router, Request, Response } from 'express';
import type { UserProfile, FirmRole } from '@/types';
import type { PracticeSubscriptionTier } from './types';
import {
  CreateEnquirySchema,
  CreateTimesheetEntrySchema,
  InvoiceConfigSchema,
  CreateAllocationSchema,
  CreateComplianceRecordSchema,
} from './schemas';
import { evaluateSubscriptionAccess } from '../p2-shared/services/subscriptionEngine';
import type { SubscriptionState } from '../p2-shared/types';

// ─── Dependency Injection Interface ───────────────────────────────────────────

export interface PracticeRouterDeps {
  db: FirebaseFirestore.Firestore;
  getUser: (req: Request) => Promise<UserProfile | null>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Features available per subscription tier */
const TIER_FEATURES: Record<PracticeSubscriptionTier, string[]> = {
  essentials: ['enquiries', 'timesheets', 'billing_basic', 'compliance'],
  professional: [
    'enquiries', 'timesheets', 'billing_basic', 'compliance',
    'wip', 'profitability', 'capacity', 'billing_advanced',
  ],
};

/** Roles allowed to mutate practice data (create/update/approve) */
const MUTATION_ROLES: FirmRole[] = ['owner', 'admin'];

// ─── Helper Functions ─────────────────────────────────────────────────────────

function sendError(res: Response, status: number, code: string, message: string, details?: unknown): void {
  const body: ErrorResponse = { error: { code, message, ...(details && { details }) } };
  res.status(status).json(body);
}

function hasMutationAccess(firmRole: FirmRole | undefined): boolean {
  return !!firmRole && MUTATION_ROLES.includes(firmRole);
}

function hasFeatureAccess(tier: PracticeSubscriptionTier, feature: string): boolean {
  return TIER_FEATURES[tier]?.includes(feature) ?? false;
}

// ─── Router Factory ───────────────────────────────────────────────────────────

export function createPracticeRouter(deps: PracticeRouterDeps): Router {
  const router = Router();
  const { db, getUser } = deps;

  // ─── Middleware: Auth + Firm Isolation ─────────────────────────────────────

  /**
   * Extracts authenticated user, validates firm membership, and loads
   * subscription state. Attaches context to res.locals for downstream use.
   */
  async function extractFirmContext(
    req: Request,
    res: Response,
  ): Promise<{
    user: UserProfile;
    firmId: string;
    firmRole: FirmRole;
    subscriptionTier: PracticeSubscriptionTier;
  } | null> {
    const user = await getUser(req);
    if (!user) {
      sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return null;
    }

    // Firm-level data isolation: user must belong to a firm
    const firmId = user.primaryFirmId;
    if (!firmId) {
      sendError(res, 403, 'NO_FIRM', 'User is not associated with a firm');
      return null;
    }

    const firmRole = user.firmRole;
    if (!firmRole) {
      sendError(res, 403, 'NO_FIRM_ROLE', 'User does not have a firm role assigned');
      return null;
    }

    // Load subscription state for the firm
    const subsSnap = await db
      .collection('firms').doc(firmId)
      .collection('practice').doc('subscription')
      .get();

    if (!subsSnap.exists) {
      sendError(res, 402, 'NO_SUBSCRIPTION', 'Practice management subscription required');
      return null;
    }

    const subscriptionState = subsSnap.data() as SubscriptionState;
    const accessResult = evaluateSubscriptionAccess(subscriptionState, new Date());

    if (!accessResult.success) {
      sendError(res, 500, 'SUBSCRIPTION_ERROR', 'Failed to evaluate subscription access');
      return null;
    }

    const { accessLevel } = accessResult.data;

    if (accessLevel === 'archived') {
      sendError(res, 402, 'SUBSCRIPTION_ARCHIVED', 'Subscription archived — reactivation required');
      return null;
    }

    if (accessLevel === 'restricted') {
      sendError(res, 402, 'SUBSCRIPTION_EXPIRED', 'Trial expired — subscription activation required');
      return null;
    }

    // read_only blocks mutations (checked per-route)
    // Determine effective tier
    const tier = (subscriptionState.tier as PracticeSubscriptionTier) || 'essentials';

    return { user, firmId, firmRole, subscriptionTier: tier };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // ENQUIRY PIPELINE — GET /enquiries, POST /enquiries, PUT /enquiries/:id
  // Feature: 'enquiries' (Essentials + Professional)
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/enquiries', async (req: Request, res: Response) => {
    try {
      const ctx = await extractFirmContext(req, res);
      if (!ctx) return;

      if (!hasFeatureAccess(ctx.subscriptionTier, 'enquiries')) {
        return sendError(res, 402, 'FEATURE_GATED', 'Enquiry pipeline requires an active subscription');
      }

      const snapshot = await db
        .collection('firms').doc(ctx.firmId)
        .collection('practice').doc('data')
        .collection('enquiries')
        .orderBy('lastActivityDate', 'desc')
        .get();

      const enquiries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json({ data: enquiries });
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch enquiries');
    }
  });

  router.post('/enquiries', async (req: Request, res: Response) => {
    try {
      const ctx = await extractFirmContext(req, res);
      if (!ctx) return;

      if (!hasMutationAccess(ctx.firmRole)) {
        return sendError(res, 403, 'INSUFFICIENT_ROLE', 'Only firm_admin or owner can create enquiries');
      }

      if (!hasFeatureAccess(ctx.subscriptionTier, 'enquiries')) {
        return sendError(res, 402, 'FEATURE_GATED', 'Enquiry pipeline requires an active subscription');
      }

      const parseResult = CreateEnquirySchema.safeParse(req.body);
      if (!parseResult.success) {
        return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid enquiry data', parseResult.error.flatten());
      }

      const now = new Date().toISOString();
      const enquiryData = {
        ...parseResult.data,
        firmId: ctx.firmId,
        currentStage: 'lead' as const,
        stageHistory: [{ stage: 'lead', date: now, actor: ctx.user.uid }],
        lastActivityDate: now,
        createdBy: ctx.user.uid,
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await db
        .collection('firms').doc(ctx.firmId)
        .collection('practice').doc('data')
        .collection('enquiries')
        .add(enquiryData);

      res.status(201).json({ data: { id: docRef.id, ...enquiryData } });
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create enquiry');
    }
  });

  router.put('/enquiries/:id', async (req: Request, res: Response) => {
    try {
      const ctx = await extractFirmContext(req, res);
      if (!ctx) return;

      if (!hasMutationAccess(ctx.firmRole)) {
        return sendError(res, 403, 'INSUFFICIENT_ROLE', 'Only firm_admin or owner can update enquiries');
      }

      if (!hasFeatureAccess(ctx.subscriptionTier, 'enquiries')) {
        return sendError(res, 402, 'FEATURE_GATED', 'Enquiry pipeline requires an active subscription');
      }

      const { id } = req.params;
      const docRef = db
        .collection('firms').doc(ctx.firmId)
        .collection('practice').doc('data')
        .collection('enquiries').doc(id);

      const existing = await docRef.get();
      if (!existing.exists) {
        return sendError(res, 404, 'NOT_FOUND', 'Enquiry not found');
      }

      const now = new Date().toISOString();
      const updateData = { ...req.body, updatedAt: now, lastActivityDate: now };
      await docRef.update(updateData);

      res.json({ data: { id, ...existing.data(), ...updateData } });
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update enquiry');
    }
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // WIP TRACKING — GET /wip, GET /wip/:projectId
  // Feature: 'wip' (Professional only)
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/wip', async (req: Request, res: Response) => {
    try {
      const ctx = await extractFirmContext(req, res);
      if (!ctx) return;

      if (!hasFeatureAccess(ctx.subscriptionTier, 'wip')) {
        return sendError(res, 402, 'FEATURE_GATED', 'WIP tracking requires Professional tier subscription');
      }

      const projectsSnap = await db
        .collection('firms').doc(ctx.firmId)
        .collection('practice').doc('data')
        .collection('projects')
        .where('status', '==', 'active')
        .get();

      const projects = projectsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json({ data: projects });
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch WIP data');
    }
  });

  router.get('/wip/:projectId', async (req: Request, res: Response) => {
    try {
      const ctx = await extractFirmContext(req, res);
      if (!ctx) return;

      if (!hasFeatureAccess(ctx.subscriptionTier, 'wip')) {
        return sendError(res, 402, 'FEATURE_GATED', 'WIP tracking requires Professional tier subscription');
      }

      const { projectId } = req.params;
      const projectDoc = await db
        .collection('firms').doc(ctx.firmId)
        .collection('practice').doc('data')
        .collection('projects').doc(projectId)
        .get();

      if (!projectDoc.exists) {
        return sendError(res, 404, 'NOT_FOUND', 'Project not found');
      }

      res.json({ data: { id: projectDoc.id, ...projectDoc.data() } });
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch project WIP');
    }
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // TIMESHEETS — GET /timesheets, POST /timesheets, POST /timesheets/submit,
  //              POST /timesheets/approve
  // Feature: 'timesheets' (Essentials + Professional)
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/timesheets', async (req: Request, res: Response) => {
    try {
      const ctx = await extractFirmContext(req, res);
      if (!ctx) return;

      if (!hasFeatureAccess(ctx.subscriptionTier, 'timesheets')) {
        return sendError(res, 402, 'FEATURE_GATED', 'Timesheets require an active subscription');
      }

      // Staff see only their own; firm_admin/owner see all
      let query = db
        .collection('firms').doc(ctx.firmId)
        .collection('practice').doc('data')
        .collection('timesheets') as FirebaseFirestore.Query;

      if (!hasMutationAccess(ctx.firmRole)) {
        query = query.where('staffId', '==', ctx.user.uid);
      }

      const snapshot = await query.orderBy('date', 'desc').limit(200).get();
      const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json({ data: entries });
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch timesheets');
    }
  });

  router.post('/timesheets', async (req: Request, res: Response) => {
    try {
      const ctx = await extractFirmContext(req, res);
      if (!ctx) return;

      if (!hasFeatureAccess(ctx.subscriptionTier, 'timesheets')) {
        return sendError(res, 402, 'FEATURE_GATED', 'Timesheets require an active subscription');
      }

      const parseResult = CreateTimesheetEntrySchema.safeParse(req.body);
      if (!parseResult.success) {
        return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid timesheet entry', parseResult.error.flatten());
      }

      const now = new Date().toISOString();
      const entryData = {
        ...parseResult.data,
        firmId: ctx.firmId,
        staffId: ctx.user.uid,
        status: 'draft' as const,
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await db
        .collection('firms').doc(ctx.firmId)
        .collection('practice').doc('data')
        .collection('timesheets')
        .add(entryData);

      res.status(201).json({ data: { id: docRef.id, ...entryData } });
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create timesheet entry');
    }
  });

  router.post('/timesheets/submit', async (req: Request, res: Response) => {
    try {
      const ctx = await extractFirmContext(req, res);
      if (!ctx) return;

      if (!hasFeatureAccess(ctx.subscriptionTier, 'timesheets')) {
        return sendError(res, 402, 'FEATURE_GATED', 'Timesheets require an active subscription');
      }

      const { entryIds, weekStart } = req.body as { entryIds?: string[]; weekStart?: string };
      if (!entryIds || !Array.isArray(entryIds) || entryIds.length === 0) {
        return sendError(res, 422, 'VALIDATION_ERROR', 'entryIds array is required');
      }
      if (!weekStart) {
        return sendError(res, 422, 'VALIDATION_ERROR', 'weekStart date is required');
      }

      const batch = db.batch();
      const now = new Date().toISOString();

      for (const entryId of entryIds) {
        const ref = db
          .collection('firms').doc(ctx.firmId)
          .collection('practice').doc('data')
          .collection('timesheets').doc(entryId);
        batch.update(ref, { status: 'submitted', updatedAt: now });
      }

      await batch.commit();
      res.json({ data: { submitted: entryIds.length, weekStart } });
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to submit timesheets');
    }
  });

  router.post('/timesheets/approve', async (req: Request, res: Response) => {
    try {
      const ctx = await extractFirmContext(req, res);
      if (!ctx) return;

      if (!hasMutationAccess(ctx.firmRole)) {
        return sendError(res, 403, 'INSUFFICIENT_ROLE', 'Only firm_admin or owner can approve timesheets');
      }

      if (!hasFeatureAccess(ctx.subscriptionTier, 'timesheets')) {
        return sendError(res, 402, 'FEATURE_GATED', 'Timesheets require an active subscription');
      }

      const { entryIds } = req.body as { entryIds?: string[] };
      if (!entryIds || !Array.isArray(entryIds) || entryIds.length === 0) {
        return sendError(res, 422, 'VALIDATION_ERROR', 'entryIds array is required');
      }

      const batch = db.batch();
      const now = new Date().toISOString();

      for (const entryId of entryIds) {
        const ref = db
          .collection('firms').doc(ctx.firmId)
          .collection('practice').doc('data')
          .collection('timesheets').doc(entryId);
        batch.update(ref, {
          status: 'approved',
          approvedBy: ctx.user.uid,
          approvedAt: now,
          updatedAt: now,
        });
      }

      await batch.commit();
      res.json({ data: { approved: entryIds.length, approvedBy: ctx.user.uid } });
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to approve timesheets');
    }
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // BILLING — POST /billing/generate, POST /billing/approve
  // Feature: 'billing_basic' (Essentials) / 'billing_advanced' (Professional)
  // ═══════════════════════════════════════════════════════════════════════════

  router.post('/billing/generate', async (req: Request, res: Response) => {
    try {
      const ctx = await extractFirmContext(req, res);
      if (!ctx) return;

      if (!hasMutationAccess(ctx.firmRole)) {
        return sendError(res, 403, 'INSUFFICIENT_ROLE', 'Only firm_admin or owner can generate invoices');
      }

      if (!hasFeatureAccess(ctx.subscriptionTier, 'billing_basic')) {
        return sendError(res, 402, 'FEATURE_GATED', 'Billing requires an active subscription');
      }

      const parseResult = InvoiceConfigSchema.safeParse(req.body);
      if (!parseResult.success) {
        return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid billing configuration', parseResult.error.flatten());
      }

      const { projectId, groupBy, billingModel } = parseResult.data;

      // Advanced billing models (fixed_fee, percentage_of_construction) require Professional
      if (billingModel !== 'hourly' && !hasFeatureAccess(ctx.subscriptionTier, 'billing_advanced')) {
        return sendError(
          res, 402, 'FEATURE_GATED',
          'Advanced billing models (fixed_fee, percentage_of_construction) require Professional tier',
        );
      }

      // Fetch approved unbilled timesheets for the project
      const timesheetsSnap = await db
        .collection('firms').doc(ctx.firmId)
        .collection('practice').doc('data')
        .collection('timesheets')
        .where('projectId', '==', projectId)
        .where('status', '==', 'approved')
        .get();

      const entries = timesheetsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      res.json({
        data: {
          projectId,
          billingModel,
          groupBy,
          entries: entries.length,
          status: 'draft',
        },
      });
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate invoice');
    }
  });

  router.post('/billing/approve', async (req: Request, res: Response) => {
    try {
      const ctx = await extractFirmContext(req, res);
      if (!ctx) return;

      if (!hasMutationAccess(ctx.firmRole)) {
        return sendError(res, 403, 'INSUFFICIENT_ROLE', 'Only firm_admin or owner can approve invoices');
      }

      if (!hasFeatureAccess(ctx.subscriptionTier, 'billing_basic')) {
        return sendError(res, 402, 'FEATURE_GATED', 'Billing requires an active subscription');
      }

      const { invoiceId } = req.body as { invoiceId?: string };
      if (!invoiceId) {
        return sendError(res, 422, 'VALIDATION_ERROR', 'invoiceId is required');
      }

      const invoiceRef = db
        .collection('firms').doc(ctx.firmId)
        .collection('practice').doc('data')
        .collection('invoices').doc(invoiceId);

      const invoiceDoc = await invoiceRef.get();
      if (!invoiceDoc.exists) {
        return sendError(res, 404, 'NOT_FOUND', 'Invoice not found');
      }

      const invoice = invoiceDoc.data();
      if (invoice?.status !== 'draft') {
        return sendError(res, 409, 'CONFLICT', 'Only draft invoices can be approved');
      }

      const now = new Date().toISOString();
      await invoiceRef.update({
        status: 'approved',
        approvedBy: ctx.user.uid,
        approvedAt: now,
        updatedAt: now,
      });

      res.json({ data: { invoiceId, status: 'approved', approvedBy: ctx.user.uid } });
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to approve invoice');
    }
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // PROFITABILITY — GET /profitability
  // Feature: 'profitability' (Professional only)
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/profitability', async (req: Request, res: Response) => {
    try {
      const ctx = await extractFirmContext(req, res);
      if (!ctx) return;

      if (!hasFeatureAccess(ctx.subscriptionTier, 'profitability')) {
        return sendError(res, 402, 'FEATURE_GATED', 'Profitability dashboard requires Professional tier subscription');
      }

      // Staff/coordinator only see their own projects unless explicitly granted visibility
      const projectsSnap = await db
        .collection('firms').doc(ctx.firmId)
        .collection('practice').doc('data')
        .collection('projects')
        .get();

      const projects = projectsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json({ data: projects });
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch profitability data');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CAPACITY PLANNING — GET /capacity, POST /capacity/allocations
  // Feature: 'capacity' (Professional only)
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/capacity', async (req: Request, res: Response) => {
    try {
      const ctx = await extractFirmContext(req, res);
      if (!ctx) return;

      if (!hasFeatureAccess(ctx.subscriptionTier, 'capacity')) {
        return sendError(res, 402, 'FEATURE_GATED', 'Capacity planning requires Professional tier subscription');
      }

      const allocationsSnap = await db
        .collection('firms').doc(ctx.firmId)
        .collection('practice').doc('data')
        .collection('allocations')
        .get();

      const allocations = allocationsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json({ data: allocations });
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch capacity data');
    }
  });

  router.post('/capacity/allocations', async (req: Request, res: Response) => {
    try {
      const ctx = await extractFirmContext(req, res);
      if (!ctx) return;

      if (!hasMutationAccess(ctx.firmRole)) {
        return sendError(res, 403, 'INSUFFICIENT_ROLE', 'Only firm_admin or owner can manage allocations');
      }

      if (!hasFeatureAccess(ctx.subscriptionTier, 'capacity')) {
        return sendError(res, 402, 'FEATURE_GATED', 'Capacity planning requires Professional tier subscription');
      }

      const parseResult = CreateAllocationSchema.safeParse(req.body);
      if (!parseResult.success) {
        return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid allocation data', parseResult.error.flatten());
      }

      const now = new Date().toISOString();
      const allocationData = {
        ...parseResult.data,
        firmId: ctx.firmId,
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await db
        .collection('firms').doc(ctx.firmId)
        .collection('practice').doc('data')
        .collection('allocations')
        .add(allocationData);

      res.status(201).json({ data: { id: docRef.id, ...allocationData } });
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create allocation');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STAFF COMPLIANCE — GET /staff/compliance, POST /staff/compliance,
  //                    PUT /staff/compliance/:id
  // Feature: 'compliance' (Essentials + Professional)
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/staff/compliance', async (req: Request, res: Response) => {
    try {
      const ctx = await extractFirmContext(req, res);
      if (!ctx) return;

      if (!hasFeatureAccess(ctx.subscriptionTier, 'compliance')) {
        return sendError(res, 402, 'FEATURE_GATED', 'Staff compliance tracking requires an active subscription');
      }

      const snapshot = await db
        .collection('firms').doc(ctx.firmId)
        .collection('practice').doc('data')
        .collection('compliance')
        .get();

      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json({ data: records });
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch compliance records');
    }
  });

  router.post('/staff/compliance', async (req: Request, res: Response) => {
    try {
      const ctx = await extractFirmContext(req, res);
      if (!ctx) return;

      if (!hasMutationAccess(ctx.firmRole)) {
        return sendError(res, 403, 'INSUFFICIENT_ROLE', 'Only firm_admin or owner can manage compliance records');
      }

      if (!hasFeatureAccess(ctx.subscriptionTier, 'compliance')) {
        return sendError(res, 402, 'FEATURE_GATED', 'Staff compliance tracking requires an active subscription');
      }

      const parseResult = CreateComplianceRecordSchema.safeParse(req.body);
      if (!parseResult.success) {
        return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid compliance record data', parseResult.error.flatten());
      }

      const now = new Date().toISOString();
      const recordData = {
        ...parseResult.data,
        firmId: ctx.firmId,
        staffDisplayName: req.body.staffDisplayName || '',
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await db
        .collection('firms').doc(ctx.firmId)
        .collection('practice').doc('data')
        .collection('compliance')
        .add(recordData);

      res.status(201).json({ data: { id: docRef.id, ...recordData } });
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create compliance record');
    }
  });

  router.put('/staff/compliance/:id', async (req: Request, res: Response) => {
    try {
      const ctx = await extractFirmContext(req, res);
      if (!ctx) return;

      if (!hasMutationAccess(ctx.firmRole)) {
        return sendError(res, 403, 'INSUFFICIENT_ROLE', 'Only firm_admin or owner can update compliance records');
      }

      if (!hasFeatureAccess(ctx.subscriptionTier, 'compliance')) {
        return sendError(res, 402, 'FEATURE_GATED', 'Staff compliance tracking requires an active subscription');
      }

      const { id } = req.params;
      const docRef = db
        .collection('firms').doc(ctx.firmId)
        .collection('practice').doc('data')
        .collection('compliance').doc(id);

      const existing = await docRef.get();
      if (!existing.exists) {
        return sendError(res, 404, 'NOT_FOUND', 'Compliance record not found');
      }

      const now = new Date().toISOString();
      const updateData = { ...req.body, updatedAt: now };
      await docRef.update(updateData);

      res.json({ data: { id, ...existing.data(), ...updateData } });
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update compliance record');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUBSCRIPTION — POST /subscription
  // ═══════════════════════════════════════════════════════════════════════════

  router.post('/subscription', async (req: Request, res: Response) => {
    try {
      const user = await getUser(req);
      if (!user) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
      }

      const firmId = user.primaryFirmId;
      if (!firmId) {
        return sendError(res, 403, 'NO_FIRM', 'User is not associated with a firm');
      }

      const firmRole = user.firmRole;
      if (!hasMutationAccess(firmRole)) {
        return sendError(res, 403, 'INSUFFICIENT_ROLE', 'Only firm_admin or owner can manage subscriptions');
      }

      const { action, tier, billingCycle } = req.body as {
        action?: string;
        tier?: string;
        billingCycle?: string;
      };

      if (!action) {
        return sendError(res, 422, 'VALIDATION_ERROR', 'Subscription action is required');
      }

      const validActions = ['activate', 'upgrade', 'downgrade', 'cancel', 'renew'];
      if (!validActions.includes(action)) {
        return sendError(res, 422, 'VALIDATION_ERROR', `Invalid action. Must be one of: ${validActions.join(', ')}`);
      }

      const validTiers: PracticeSubscriptionTier[] = ['essentials', 'professional'];
      if (tier && !validTiers.includes(tier as PracticeSubscriptionTier)) {
        return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid tier. Must be essentials or professional');
      }

      const validCycles = ['monthly', 'annual'];
      if (billingCycle && !validCycles.includes(billingCycle)) {
        return sendError(res, 422, 'VALIDATION_ERROR', 'Invalid billingCycle. Must be monthly or annual');
      }

      const subsRef = db
        .collection('firms').doc(firmId)
        .collection('practice').doc('subscription');

      const subsSnap = await subsRef.get();
      const now = new Date().toISOString();

      if (!subsSnap.exists && action === 'activate') {
        // Create new subscription (trial or activation)
        const newSub: Partial<SubscriptionState> = {
          entityType: 'firm',
          entityId: firmId,
          tier: tier || 'essentials',
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          billingCycle: (billingCycle as 'monthly' | 'annual') || 'monthly',
          holderId: user.uid,
          createdAt: now,
          updatedAt: now,
        };
        await subsRef.set(newSub);
        return res.status(201).json({ data: newSub });
      }

      if (!subsSnap.exists) {
        return sendError(res, 404, 'NOT_FOUND', 'No subscription to modify — use activate first');
      }

      // Update existing subscription
      const updateData = {
        ...(tier && { tier }),
        ...(billingCycle && { billingCycle }),
        updatedAt: now,
      };
      await subsRef.update(updateData);

      res.json({ data: { action, ...updateData } });
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to manage subscription');
    }
  });

  return router;
}
