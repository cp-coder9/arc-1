/**
 * FM Bridge — API Router
 *
 * Express router with dependency injection pattern for Post-Occupancy &
 * Facility Management Bridge (P2.8). Handles Zod validation at API boundary,
 * role-based auth middleware, subscription tier checks, and structured error
 * responses.
 *
 * Base path: /api/fm-bridge
 *
 * Requirements: 1.5, 1.6, 2.4, 3.8, 4.7, 7.1, 7.2
 */

import { Router, Request, Response } from 'express';

import type { UserProfile } from '@/types';
import type { SubscriptionState } from '../p2-shared/types';
import { evaluateSubscriptionAccess, transitionSubscription } from '../p2-shared/services/subscriptionEngine';

import type { BuildingAccessRecord, FMBuildingRole, FMSubscriptionTier } from './types';
import {
  CreateWarrantyItemSchema,
  CreateAssetItemSchema,
  LogDefectSchema,
  CreatePPMScheduleSchema,
  LodgeWarrantyClaimSchema,
} from './schemas';

import { validateHandoverEligibility, executeHandoverTransition } from './services/handoverTransition';
import type { ProjectHandoverData, ActorIdentity } from './services/handoverTransition';
import { validateAccess, canModify } from './services/buildingPassport';
import { validateWarrantyClaim } from './services/warrantyRegister';
import type { WarrantyClaimInput } from './services/warrantyRegister';

// ─── Error Response Types ─────────────────────────────────────────────────────

type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'SUBSCRIPTION_REQUIRED'
  | 'TIER_UPGRADE_REQUIRED'
  | 'SUBSCRIPTION_LAPSED'
  | 'FORBIDDEN'
  | 'INVALID_TRANSITION'
  | 'BUSINESS_RULE_VIOLATION';

interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

function validationError(errors: unknown): ErrorResponse {
  return { error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: errors } };
}

function forbiddenError(message: string): ErrorResponse {
  return { error: { code: 'FORBIDDEN', message } };
}

function subscriptionRequiredError(message: string): ErrorResponse {
  return { error: { code: 'SUBSCRIPTION_REQUIRED', message } };
}

function tierUpgradeError(requiredTier: FMSubscriptionTier): ErrorResponse {
  return { error: { code: 'TIER_UPGRADE_REQUIRED', message: `This feature requires the '${requiredTier}' subscription tier or above` } };
}

function subscriptionLapsedError(): ErrorResponse {
  return { error: { code: 'SUBSCRIPTION_LAPSED', message: 'Building subscription has lapsed. Renew to regain write access.' } };
}

function transitionError(message: string): ErrorResponse {
  return { error: { code: 'INVALID_TRANSITION', message } };
}

function businessRuleError(message: string, details?: unknown): ErrorResponse {
  return { error: { code: 'BUSINESS_RULE_VIOLATION', message, details } };
}

// ─── Subscription Tier Ordering ───────────────────────────────────────────────

const TIER_ORDER: Record<FMSubscriptionTier, number> = { basic: 0, standard: 1, premium: 2 };

function hasTierAccess(current: FMSubscriptionTier | 'trial', required: FMSubscriptionTier): boolean {
  if (current === 'trial') return true; // Trial grants Premium-level access
  return (TIER_ORDER[current] ?? -1) >= (TIER_ORDER[required] ?? 0);
}

// ─── Dependency Injection Interface ───────────────────────────────────────────

export interface FMBridgeRouterDeps {
  db: FirebaseFirestore.Firestore;
  getUser: (req: Request) => Promise<UserProfile | null>;
}

// ─── Router Factory ───────────────────────────────────────────────────────────

export function createFMBridgeRouter(deps: FMBridgeRouterDeps): Router {
  const { db, getUser } = deps;
  const router = Router();

  // ── Helper: Authenticate user ─────────────────────────────────────────────
  async function authenticate(req: Request, res: Response): Promise<UserProfile | null> {
    const user = await getUser(req);
    if (!user) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return null;
    }
    return user;
  }

  // ── Helper: Get building access records ───────────────────────────────────
  async function getBuildingAccessRecords(buildingId: string): Promise<BuildingAccessRecord[]> {
    const snap = await db.collection(`buildings/${buildingId}/access`).where('revokedAt', '==', null).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BuildingAccessRecord);
  }

  // ── Helper: Validate building access for user ───────────────────────────────
  async function validateBuildingAccess(
    buildingId: string,
    userId: string,
    res: Response
  ): Promise<BuildingAccessRecord | null> {
    const records = await getBuildingAccessRecords(buildingId);
    const result = validateAccess(records, userId);
    if (result.success === false) {
      res.status(403).json(forbiddenError(result.error.message));
      return null;
    }
    return result.data;
  }

  // ── Helper: Resolve subscription access level ─────────────────────────────
  function resolveSubscriptionAccess(sub: SubscriptionState): { accessLevel: string; reason?: string; daysRemaining?: number } | null {
    const result = evaluateSubscriptionAccess(sub, new Date());
    if (result.success === false) return null;
    return result.data;
  }

  // ── Helper: Get subscription state for building ─────────────────────────────
  async function getBuildingSubscription(buildingId: string): Promise<SubscriptionState | null> {
    const snap = await db.collection(`buildings/${buildingId}/subscriptions`)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as SubscriptionState;
  }

  // ── Helper: Check subscription tier access ──────────────────────────────────
  async function checkSubscriptionTier(
    buildingId: string,
    requiredTier: FMSubscriptionTier,
    res: Response
  ): Promise<boolean> {
    const sub = await getBuildingSubscription(buildingId);
    if (!sub) {
      res.status(402).json(subscriptionRequiredError('No active subscription for this building'));
      return false;
    }
    const access = resolveSubscriptionAccess(sub);
    if (!access) {
      res.status(402).json(subscriptionRequiredError('Unable to determine subscription access'));
      return false;
    }
    if (access.accessLevel === 'archived' || access.accessLevel === 'restricted') {
      res.status(402).json(subscriptionLapsedError());
      return false;
    }
    if (access.accessLevel === 'read_only') {
      res.status(402).json(subscriptionLapsedError());
      return false;
    }
    const currentTier = sub.tier as FMSubscriptionTier | 'trial';
    if (!hasTierAccess(currentTier, requiredTier)) {
      res.status(402).json(tierUpgradeError(requiredTier));
      return false;
    }
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // POST /handover — Initiate handover transition from construction to operations
  // ═══════════════════════════════════════════════════════════════════════════════
  router.post('/handover', async (req: Request, res: Response) => {
    try {
      const user = await authenticate(req, res);
      if (!user) return;

      const projectData = req.body as ProjectHandoverData;
      if (!projectData || !projectData.projectId) {
        res.status(400).json(validationError({ message: 'Project handover data is required' }));
        return;
      }

      // Validate eligibility (checks role + project status)
      const eligibilityResult = validateHandoverEligibility(
        { status: projectData.projectStatus, closeoutStatus: projectData.closeoutStatus },
        { uid: user.uid, role: user.role }
      );

      if (eligibilityResult.success === false) {
        res.status(422).json(businessRuleError(eligibilityResult.error.message));
        return;
      }

      const eligibility = eligibilityResult.data;
      if (!eligibility.eligible) {
        if (eligibility.reason?.includes('permission') || eligibility.reason?.includes('role')) {
          res.status(403).json(forbiddenError(eligibility.reason || 'Insufficient permissions'));
        } else {
          res.status(422).json(businessRuleError(eligibility.reason || 'Handover preconditions not met'));
        }
        return;
      }

      const actor: ActorIdentity = { uid: user.uid, role: user.role, displayName: user.displayName };
      const result = executeHandoverTransition(projectData, actor, new Date());

      if (result.success === false) {
        res.status(422).json(businessRuleError(result.error.message, result.error.details));
        return;
      }

      // Persist building passport
      const { buildingPassport, warranties, dlp, auditEvents } = result.data;
      const buildingRef = db.collection('buildings').doc(buildingPassport.id);
      await buildingRef.set({ ...buildingPassport });

      // Persist warranties
      const batch = db.batch();
      for (const warranty of warranties) {
        batch.set(buildingRef.collection('warranties').doc(warranty.id), warranty);
      }
      // Persist DLP
      batch.set(buildingRef.collection('dlp').doc(dlp.id), dlp);
      // Persist audit events
      for (const event of auditEvents) {
        batch.set(buildingRef.collection('audit').doc(event.id), event);
      }
      await batch.commit();

      res.status(201).json({ data: { buildingPassport, warranties, dlp } });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Handover transition failed' } });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // GET /buildings/:id/passport — Retrieve building passport
  // ═══════════════════════════════════════════════════════════════════════════════
  router.get('/buildings/:id/passport', async (req: Request, res: Response) => {
    try {
      const user = await authenticate(req, res);
      if (!user) return;

      const { id: buildingId } = req.params;
      const access = await validateBuildingAccess(buildingId, user.uid, res);
      if (!access) return;

      const doc = await db.doc(`buildings/${buildingId}`).get();
      if (!doc.exists) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Building passport not found' } });
        return;
      }

      res.status(200).json({ data: { id: doc.id, ...doc.data() } });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve passport' } });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // PUT /buildings/:id/passport — Update building passport
  // ═══════════════════════════════════════════════════════════════════════════════
  router.put('/buildings/:id/passport', async (req: Request, res: Response) => {
    try {
      const user = await authenticate(req, res);
      if (!user) return;

      const { id: buildingId } = req.params;
      const access = await validateBuildingAccess(buildingId, user.uid, res);
      if (!access) return;

      // Only building_owner and facility_manager can modify (Requirement 2.4)
      if (!canModify(access.role)) {
        res.status(403).json(forbiddenError('Read-only users cannot modify building records'));
        return;
      }

      // Subscription check for write access
      const tierOk = await checkSubscriptionTier(buildingId, 'basic', res);
      if (!tierOk) return;

      const updates = req.body;
      await db.doc(`buildings/${buildingId}`).update({ ...updates, updatedAt: new Date().toISOString() });

      const updated = await db.doc(`buildings/${buildingId}`).get();
      res.status(200).json({ data: { id: updated.id, ...updated.data() } });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update passport' } });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // GET /buildings/:id/warranties — List warranties for a building
  // ═══════════════════════════════════════════════════════════════════════════════
  router.get('/buildings/:id/warranties', async (req: Request, res: Response) => {
    try {
      const user = await authenticate(req, res);
      if (!user) return;

      const { id: buildingId } = req.params;
      const access = await validateBuildingAccess(buildingId, user.uid, res);
      if (!access) return;

      const snap = await db.collection(`buildings/${buildingId}/warranties`).get();
      const warranties = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      res.status(200).json({ data: warranties });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve warranties' } });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // POST /buildings/:id/warranties — Create a new warranty item (Req 3.7)
  // ═══════════════════════════════════════════════════════════════════════════════
  router.post('/buildings/:id/warranties', async (req: Request, res: Response) => {
    try {
      const user = await authenticate(req, res);
      if (!user) return;

      const { id: buildingId } = req.params;
      const access = await validateBuildingAccess(buildingId, user.uid, res);
      if (!access) return;

      if (!canModify(access.role)) {
        res.status(403).json(forbiddenError('Only building_owner or facility_manager can add warranties'));
        return;
      }

      // Subscription tier check — standard tier required for warranty management
      const tierOk = await checkSubscriptionTier(buildingId, 'standard', res);
      if (!tierOk) return;

      // Zod validation
      const parsed = CreateWarrantyItemSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(validationError(parsed.error.flatten()));
        return;
      }

      const data = parsed.data;
      const now = new Date().toISOString();
      const startDate = new Date(data.startDate);
      const expiryDate = new Date(startDate);
      expiryDate.setMonth(expiryDate.getMonth() + data.warrantyPeriodMonths);

      const warrantyItem = {
        buildingId,
        description: data.description,
        category: data.category,
        supplierName: data.supplierName,
        warrantyPeriodMonths: data.warrantyPeriodMonths,
        startDate: data.startDate,
        expiryDate: expiryDate.toISOString().split('T')[0],
        status: 'active' as const,
        sourceHandover: false,
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await db.collection(`buildings/${buildingId}/warranties`).add(warrantyItem);
      res.status(201).json({ data: { id: docRef.id, ...warrantyItem } });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create warranty' } });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // POST /buildings/:id/warranties/:wId/claims — Lodge a warranty claim (Req 3.5, 3.8)
  // ═══════════════════════════════════════════════════════════════════════════════
  router.post('/buildings/:id/warranties/:wId/claims', async (req: Request, res: Response) => {
    try {
      const user = await authenticate(req, res);
      if (!user) return;

      const { id: buildingId, wId: warrantyId } = req.params;
      const access = await validateBuildingAccess(buildingId, user.uid, res);
      if (!access) return;

      if (!canModify(access.role)) {
        res.status(403).json(forbiddenError('Only building_owner or facility_manager can lodge claims'));
        return;
      }

      const tierOk = await checkSubscriptionTier(buildingId, 'standard', res);
      if (!tierOk) return;

      // Zod validation
      const parsed = LodgeWarrantyClaimSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(validationError(parsed.error.flatten()));
        return;
      }

      // Fetch warranty to validate claim eligibility (Req 3.8 — reject if expired)
      const warrantyDoc = await db.doc(`buildings/${buildingId}/warranties/${warrantyId}`).get();
      if (!warrantyDoc.exists) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Warranty item not found' } });
        return;
      }

      const warranty = { id: warrantyDoc.id, ...warrantyDoc.data() } as import('./types').WarrantyItem;
      const claimInput: WarrantyClaimInput = {
        defectDescription: parsed.data.defectDescription,
        locationInBuilding: parsed.data.locationInBuilding,
        photographicEvidence: parsed.data.photographicEvidence,
        urgency: parsed.data.urgency,
      };
      const validationResult = validateWarrantyClaim(warranty, claimInput, new Date());
      if (validationResult.success === false) {
        res.status(422).json(businessRuleError(validationResult.error.message));
        return;
      }
      if (!validationResult.data.valid) {
        res.status(422).json(businessRuleError(
          validationResult.data.errors?.[0] || 'Warranty claim validation failed',
          { errors: validationResult.data.errors }
        ));
        return;
      }

      const now = new Date().toISOString();
      const claim = {
        warrantyId,
        buildingId,
        claimDate: now,
        defectDescription: claimInput.defectDescription,
        locationInBuilding: claimInput.locationInBuilding,
        photographicEvidence: claimInput.photographicEvidence,
        urgency: claimInput.urgency,
        stage: 'lodged' as const,
        stageHistory: [{ stage: 'lodged' as const, date: now, actor: user.uid }],
        createdAt: now,
        updatedAt: now,
      };

      const claimRef = await db.collection(`buildings/${buildingId}/warranties/${warrantyId}/claims`).add(claim);

      // Update warranty status to claimed
      await db.doc(`buildings/${buildingId}/warranties/${warrantyId}`).update({ status: 'claimed', updatedAt: now });

      res.status(201).json({ data: { id: claimRef.id, ...claim } });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to lodge claim' } });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // GET /buildings/:id/assets — List assets for a building
  // ═══════════════════════════════════════════════════════════════════════════════
  router.get('/buildings/:id/assets', async (req: Request, res: Response) => {
    try {
      const user = await authenticate(req, res);
      if (!user) return;

      const { id: buildingId } = req.params;
      const access = await validateBuildingAccess(buildingId, user.uid, res);
      if (!access) return;

      // Standard tier required for asset register access
      const tierOk = await checkSubscriptionTier(buildingId, 'standard', res);
      if (!tierOk) return;

      const snap = await db.collection(`buildings/${buildingId}/assets`).get();
      const assets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      res.status(200).json({ data: assets });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve assets' } });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // POST /buildings/:id/assets — Create a new asset (Req 4.1, 4.7)
  // ═══════════════════════════════════════════════════════════════════════════════
  router.post('/buildings/:id/assets', async (req: Request, res: Response) => {
    try {
      const user = await authenticate(req, res);
      if (!user) return;

      const { id: buildingId } = req.params;
      const access = await validateBuildingAccess(buildingId, user.uid, res);
      if (!access) return;

      // Requirement 4.7: only building_owner or facility_manager can create assets
      if (!canModify(access.role)) {
        res.status(403).json(forbiddenError('Only building_owner or facility_manager can modify asset records'));
        return;
      }

      const tierOk = await checkSubscriptionTier(buildingId, 'standard', res);
      if (!tierOk) return;

      // Zod validation
      const parsed = CreateAssetItemSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(validationError(parsed.error.flatten()));
        return;
      }

      const data = parsed.data;
      const now = new Date().toISOString();
      const assetIdentifier = `AST-${buildingId.slice(0, 4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

      const assetItem = {
        buildingId,
        assetIdentifier,
        description: data.description,
        category: data.category,
        locationInBuilding: data.locationInBuilding,
        manufacturer: data.manufacturer,
        modelNumber: data.modelNumber,
        serialNumber: data.serialNumber,
        installationDate: data.installationDate,
        expectedUsefulLifeYears: data.expectedUsefulLifeYears,
        replacementCostZAR: data.replacementCostZAR,
        condition: data.condition,
        lastInspectionDate: undefined,
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await db.collection(`buildings/${buildingId}/assets`).add(assetItem);
      res.status(201).json({ data: { id: docRef.id, ...assetItem } });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create asset' } });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // PUT /buildings/:id/assets — Update an existing asset
  // ═══════════════════════════════════════════════════════════════════════════════
  router.put('/buildings/:id/assets', async (req: Request, res: Response) => {
    try {
      const user = await authenticate(req, res);
      if (!user) return;

      const { id: buildingId } = req.params;
      const access = await validateBuildingAccess(buildingId, user.uid, res);
      if (!access) return;

      if (!canModify(access.role)) {
        res.status(403).json(forbiddenError('Only building_owner or facility_manager can modify asset records'));
        return;
      }

      const tierOk = await checkSubscriptionTier(buildingId, 'standard', res);
      if (!tierOk) return;

      const { assetId, ...updates } = req.body;
      if (!assetId) {
        res.status(400).json(validationError({ message: 'assetId is required in request body' }));
        return;
      }

      const assetDoc = await db.doc(`buildings/${buildingId}/assets/${assetId}`).get();
      if (!assetDoc.exists) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Asset not found' } });
        return;
      }

      await db.doc(`buildings/${buildingId}/assets/${assetId}`).update({ ...updates, updatedAt: new Date().toISOString() });
      const updated = await db.doc(`buildings/${buildingId}/assets/${assetId}`).get();
      res.status(200).json({ data: { id: updated.id, ...updated.data() } });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update asset' } });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // POST /buildings/:id/assets/import — Bulk import assets from CSV (Req 4.6)
  // ═══════════════════════════════════════════════════════════════════════════════
  router.post('/buildings/:id/assets/import', async (req: Request, res: Response) => {
    try {
      const user = await authenticate(req, res);
      if (!user) return;

      const { id: buildingId } = req.params;
      const access = await validateBuildingAccess(buildingId, user.uid, res);
      if (!access) return;

      if (!canModify(access.role)) {
        res.status(403).json(forbiddenError('Only building_owner or facility_manager can import assets'));
        return;
      }

      // Premium tier required for bulk import
      const tierOk = await checkSubscriptionTier(buildingId, 'premium', res);
      if (!tierOk) return;

      const { rows } = req.body;
      if (!Array.isArray(rows) || rows.length === 0) {
        res.status(400).json(validationError({ message: 'Request body must contain a non-empty "rows" array' }));
        return;
      }

      // Validate each row using Zod schema
      const validRows: Array<Record<string, unknown>> = [];
      const errors: Array<{ row: number; field: string; message: string }> = [];

      rows.forEach((row: unknown, index: number) => {
        const parsed = CreateAssetItemSchema.safeParse(row);
        if (parsed.success) {
          validRows.push(parsed.data as Record<string, unknown>);
        } else {
          for (const issue of parsed.error.issues) {
            errors.push({ row: index + 1, field: issue.path.join('.'), message: issue.message });
          }
        }
      });

      // Persist valid rows
      const now = new Date().toISOString();
      const created: Array<Record<string, unknown>> = [];
      const batch = db.batch();

      for (const row of validRows) {
        const assetIdentifier = `AST-${buildingId.slice(0, 4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6)}`;
        const assetItem = {
          buildingId,
          assetIdentifier,
          ...row,
          sourceHandover: false,
          createdAt: now,
          updatedAt: now,
        };
        const ref = db.collection(`buildings/${buildingId}/assets`).doc();
        batch.set(ref, assetItem);
        created.push({ id: ref.id, ...assetItem });
      }

      if (validRows.length > 0) {
        await batch.commit();
      }

      res.status(200).json({ data: { imported: created.length, errors, created } });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to import assets' } });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // GET /buildings/:id/dlp — List DLP records for a building
  // ═══════════════════════════════════════════════════════════════════════════════
  router.get('/buildings/:id/dlp', async (req: Request, res: Response) => {
    try {
      const user = await authenticate(req, res);
      if (!user) return;

      const { id: buildingId } = req.params;
      const access = await validateBuildingAccess(buildingId, user.uid, res);
      if (!access) return;

      const snap = await db.collection(`buildings/${buildingId}/dlp`).get();
      const dlpRecords = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      res.status(200).json({ data: dlpRecords });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve DLP records' } });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // POST /buildings/:id/dlp — Create a DLP record
  // ═══════════════════════════════════════════════════════════════════════════════
  router.post('/buildings/:id/dlp', async (req: Request, res: Response) => {
    try {
      const user = await authenticate(req, res);
      if (!user) return;

      const { id: buildingId } = req.params;
      const access = await validateBuildingAccess(buildingId, user.uid, res);
      if (!access) return;

      if (!canModify(access.role)) {
        res.status(403).json(forbiddenError('Only building_owner or facility_manager can create DLP records'));
        return;
      }

      const tierOk = await checkSubscriptionTier(buildingId, 'standard', res);
      if (!tierOk) return;

      const { startDate, endDate, durationDays, mainContractorRef, principalAgentRef } = req.body;
      if (!startDate || !endDate || !mainContractorRef || !principalAgentRef) {
        res.status(400).json(validationError({ message: 'startDate, endDate, mainContractorRef, and principalAgentRef are required' }));
        return;
      }

      const now = new Date().toISOString();
      const dlpRecord = {
        buildingId,
        startDate,
        endDate,
        durationDays: durationDays || 90,
        mainContractorRef,
        principalAgentRef,
        status: 'active' as const,
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await db.collection(`buildings/${buildingId}/dlp`).add(dlpRecord);
      res.status(201).json({ data: { id: docRef.id, ...dlpRecord } });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create DLP record' } });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // POST /buildings/:id/dlp/:dlpId/defects — Log a defect (Req 5.3, 5.7)
  // ═══════════════════════════════════════════════════════════════════════════════
  router.post('/buildings/:id/dlp/:dlpId/defects', async (req: Request, res: Response) => {
    try {
      const user = await authenticate(req, res);
      if (!user) return;

      const { id: buildingId, dlpId } = req.params;
      const access = await validateBuildingAccess(buildingId, user.uid, res);
      if (!access) return;

      if (!canModify(access.role)) {
        res.status(403).json(forbiddenError('Only building_owner or facility_manager can log defects'));
        return;
      }

      const tierOk = await checkSubscriptionTier(buildingId, 'standard', res);
      if (!tierOk) return;

      // Zod validation
      const parsed = LogDefectSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(validationError(parsed.error.flatten()));
        return;
      }

      // Check DLP exists
      const dlpDoc = await db.doc(`buildings/${buildingId}/dlp/${dlpId}`).get();
      if (!dlpDoc.exists) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'DLP record not found' } });
        return;
      }

      const dlpData = dlpDoc.data() as import('./types').DLPRecord;
      const data = parsed.data;
      const now = new Date();

      // Determine if defect is post-DLP (Requirement 5.7)
      const dlpEndDate = new Date(dlpData.endDate);
      const isPostDLP = now > dlpEndDate;

      const defect = {
        dlpId,
        buildingId,
        description: data.description,
        locationInBuilding: data.locationInBuilding,
        category: data.category,
        severity: data.severity,
        photographicEvidence: data.photographicEvidence,
        dateDiscovered: data.dateDiscovered,
        responsibleTrade: data.responsibleTrade,
        stage: 'logged' as const,
        isPostDLP,
        stageHistory: [{ stage: 'logged' as const, date: now.toISOString(), actor: user.uid }],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      const defectRef = await db.collection(`buildings/${buildingId}/dlp/${dlpId}/defects`).add(defect);

      const response: Record<string, unknown> = { id: defectRef.id, ...defect };
      if (isPostDLP) {
        response.notice = 'This defect was recorded after the defects liability period expired. Entitlement to rectification at contractor cost requires contractual and legal review.';
      }

      res.status(201).json({ data: response });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to log defect' } });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // GET /buildings/:id/maintenance — List maintenance schedules
  // ═══════════════════════════════════════════════════════════════════════════════
  router.get('/buildings/:id/maintenance', async (req: Request, res: Response) => {
    try {
      const user = await authenticate(req, res);
      if (!user) return;

      const { id: buildingId } = req.params;
      const access = await validateBuildingAccess(buildingId, user.uid, res);
      if (!access) return;

      // Premium tier required for maintenance scheduling
      const tierOk = await checkSubscriptionTier(buildingId, 'premium', res);
      if (!tierOk) return;

      const snap = await db.collection(`buildings/${buildingId}/maintenance`).get();
      const schedules = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      res.status(200).json({ data: schedules });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve maintenance schedules' } });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // POST /buildings/:id/maintenance — Create a PPM schedule entry (Req 6.1)
  // ═══════════════════════════════════════════════════════════════════════════════
  router.post('/buildings/:id/maintenance', async (req: Request, res: Response) => {
    try {
      const user = await authenticate(req, res);
      if (!user) return;

      const { id: buildingId } = req.params;
      const access = await validateBuildingAccess(buildingId, user.uid, res);
      if (!access) return;

      if (!canModify(access.role)) {
        res.status(403).json(forbiddenError('Only building_owner or facility_manager can create maintenance schedules'));
        return;
      }

      // Premium tier required for maintenance features
      const tierOk = await checkSubscriptionTier(buildingId, 'premium', res);
      if (!tierOk) return;

      // Zod validation
      const parsed = CreatePPMScheduleSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(validationError(parsed.error.flatten()));
        return;
      }

      const data = parsed.data;

      // Validate referenced asset exists (Requirement 6.8)
      const assetDoc = await db.doc(`buildings/${buildingId}/assets/${data.assetId}`).get();
      if (!assetDoc.exists) {
        res.status(422).json(businessRuleError(
          'Referenced asset does not exist in this building',
          { assetId: data.assetId }
        ));
        return;
      }

      const now = new Date().toISOString();
      const scheduleEntry = {
        buildingId,
        assetId: data.assetId,
        taskDescription: data.taskDescription,
        frequency: data.frequency,
        customIntervalDays: data.customIntervalDays,
        responsibleParty: data.responsibleParty,
        estimatedDurationHours: data.estimatedDurationHours,
        estimatedCostZAR: data.estimatedCostZAR,
        priority: data.priority,
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await db.collection(`buildings/${buildingId}/maintenance`).add(scheduleEntry);
      res.status(201).json({ data: { id: docRef.id, ...scheduleEntry } });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create maintenance schedule' } });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // POST /buildings/:id/subscription — Manage building subscription (Req 7.1, 7.2)
  // ═══════════════════════════════════════════════════════════════════════════════
  router.post('/buildings/:id/subscription', async (req: Request, res: Response) => {
    try {
      const user = await authenticate(req, res);
      if (!user) return;

      const { id: buildingId } = req.params;
      const access = await validateBuildingAccess(buildingId, user.uid, res);
      if (!access) return;

      // Only building_owner can manage subscription
      if (access.role !== 'building_owner') {
        res.status(403).json(forbiddenError('Only building_owner can manage subscriptions'));
        return;
      }

      const { action, tier, billingCycle } = req.body;
      const validActions = ['activate', 'upgrade', 'downgrade', 'cancel', 'renew', 'lapse'];
      if (!action || !validActions.includes(action)) {
        res.status(400).json(validationError({ message: `action must be one of: ${validActions.join(', ')}` }));
        return;
      }

      // Fetch current subscription state
      const sub = await getBuildingSubscription(buildingId);
      if (!sub && action !== 'activate') {
        res.status(422).json(businessRuleError('No existing subscription found. Use "activate" to create one.'));
        return;
      }

      if (action === 'activate' && !sub) {
        // Create new subscription
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + (billingCycle === 'annual' ? 12 : 1));

        const newSub: Omit<SubscriptionState, 'id'> = {
          entityType: 'building',
          entityId: buildingId,
          tier: tier || 'basic',
          status: 'active',
          trialStartDate: now.toISOString(),
          currentPeriodStart: now.toISOString(),
          currentPeriodEnd: periodEnd.toISOString(),
          billingCycle: billingCycle || 'monthly',
          holderId: user.uid,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        };

        const docRef = await db.collection(`buildings/${buildingId}/subscriptions`).add(newSub);
        res.status(201).json({ data: { id: docRef.id, ...newSub } });
        return;
      }

      // Transition existing subscription
      const result = transitionSubscription(
        sub!,
        action as 'activate' | 'upgrade' | 'downgrade' | 'cancel' | 'renew' | 'lapse',
        { newTier: tier, billingCycle },
        new Date()
      );

      if (result.success === false) {
        res.status(409).json(transitionError(result.error.message));
        return;
      }

      const { next, auditEvent } = result.data;

      // Persist updated subscription
      await db.doc(`buildings/${buildingId}/subscriptions/${sub!.id}`).set(next);
      // Persist audit event
      await db.collection(`buildings/${buildingId}/audit`).add(auditEvent);

      res.status(200).json({ data: next });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to manage subscription' } });
    }
  });

  return router;
}
