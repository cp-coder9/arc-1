// ─── Pack 17: Integration Spine Service ─────────────────────────────────────
// Cross-app integration orchestration for dedicated apps.
// Builds integration plans that describe what each app needs for full
// Architex spine integration (backend, frontend, native, test, release gate).

import {
  collection,

  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type {
  DedicatedAppDefinition,
  IntegrationPlan,
} from '@/services/lifecycleTypes';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
// ─── Firestore Paths ─────────────────────────────────────────────────────────

const APPS_COL = 'dedicated_apps';
const INTEGRATION_COL = 'integration_plans';

function appDoc(appId: string) {
  return getDemoDoc( APPS_COL, appId);
}

function appsCollection() {
  return getDemoCol( APPS_COL);
}

function integrationPlanDoc(appId: string) {
  return getDemoDoc( APPS_COL, appId, INTEGRATION_COL, 'current');
}

// ─── Pure Business Logic ─────────────────────────────────────────────────────

/**
 * Build a comprehensive integration plan for a single dedicated app.
 * Determines backend, frontend, native, test, and release gate needs
 * based on the app's definition properties.
 */
export function buildIntegrationPlan(app: DedicatedAppDefinition): IntegrationPlan {
  const backendNeeds: string[] = [
    'tenant/project auth',
    'audit trail',
    'ProjectRecord event writer',
  ];
  const frontendNeeds: string[] = [
    'Command Centre card',
    'Mobile Inbox item',
    'admin status panel',
  ];
  const nativeNeeds: string[] = [];
  const testNeeds: string[] = [
    'unit tests for governance gates',
    'workflow event snapshot test',
    'release gate smoke test',
  ];
  const releaseGateChecks: string[] = [
    'build/version provenance',
    'API route health',
    'permission check',
    'audit event check',
  ];

  if (app.requiresDeviceOrHostAgent) {
    nativeNeeds.push(
      'signed app/plugin/agent build',
      'device registration',
      'auto-update/version policy',
    );
  }

  if (app.requiresOfflineSupport) {
    backendNeeds.push('sync queue', 'conflict resolution');
  }

  if (app.spineOutputs.includes('FileManagerAsset')) {
    backendNeeds.push('FileManager upload/link API');
  }

  if (app.spineOutputs.includes('NotificationEvent')) {
    backendNeeds.push('notification dispatch API');
  }

  if (app.spineOutputs.includes('PaymentGovernanceRecord')) {
    backendNeeds.push('provider webhook verification and human release gate');
  }

  // App-specific needs
  if (app.id === 'revit_cad_connector') {
    nativeNeeds.push('Revit add-in manifest', 'Autodesk API integration', 'IFC/PDF/DWG export permissions');
  }

  if (app.id === 'secure_remote_desktop') {
    nativeNeeds.push('selected-window capture', 'input filter', 'session workspace sandbox');
  }

  return {
    appId: app.id,
    phase: app.priority <= 2 ? 'foundation'
      : app.priority <= 6 ? 'mvp'
      : app.priority <= 9 ? 'hardening'
      : 'scale',
    backendNeeds: Array.from(new Set(backendNeeds)),
    frontendNeeds: Array.from(new Set(frontendNeeds)),
    nativeNeeds: Array.from(new Set(nativeNeeds)),
    testNeeds: Array.from(new Set(testNeeds)),
    releaseGateChecks: Array.from(new Set(releaseGateChecks)),
  };
}

/**
 * Build integration plans for all provided dedicated apps.
 */
export function buildAllIntegrationPlans(apps: DedicatedAppDefinition[]): IntegrationPlan[] {
  return apps.map(buildIntegrationPlan);
}

// ─── Firestore-backed Operations ─────────────────────────────────────────────

export interface IntegrationPlanRecord {
  planId: string;
  appId: string;
  plan: IntegrationPlan;
  status: 'draft' | 'approved' | 'in_progress' | 'completed';
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Create or update an integration plan for an app in Firestore. */
export async function saveIntegrationPlan(
  app: DedicatedAppDefinition,
  notes?: string,
): Promise<void> {
  try {
    const plan = buildIntegrationPlan(app);
    const now = new Date().toISOString();

    await setDoc(
      integrationPlanDoc(app.id),
      {
        appId: app.id,
        plan,
        status: 'draft',
        notes,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${APPS_COL}/${app.id}/${INTEGRATION_COL}/current`);
  }
}

/** Get the current integration plan for an app. */
export async function getIntegrationPlan(
  appId: string,
): Promise<(IntegrationPlanRecord & { id: string }) | null> {
  try {
    const docSnap = await getDoc(integrationPlanDoc(appId));
    if (!docSnap.exists()) return null;
    const data = docSnap.data() as IntegrationPlanRecord;
    return { ...data, id: docSnap.id, planId: docSnap.id };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${APPS_COL}/${appId}/${INTEGRATION_COL}/current`);
    return null;
  }
}

/** Persist a dedicated app definition to Firestore. */
export async function saveAppDefinition(app: DedicatedAppDefinition): Promise<void> {
  try {
    await setDoc(appDoc(app.id), {
      ...app,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${APPS_COL}/${app.id}`);
  }
}

/** Get all dedicated app definitions from Firestore. */
export async function getAllAppDefinitions(): Promise<(DedicatedAppDefinition & { id: string })[]> {
  try {
    const snap = await getDocs(appsCollection());
    return snap.docs.map((d) => ({ ...(d.data() as DedicatedAppDefinition), id: d.id }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, APPS_COL);
    return [];
  }
}

/** Approve an integration plan (move from draft to approved). */
export async function approveIntegrationPlan(appId: string, approvedBy: string): Promise<void> {
  try {
    await updateDoc(integrationPlanDoc(appId), {
      status: 'approved',
      approvedBy,
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${APPS_COL}/${appId}/${INTEGRATION_COL}/current`);
  }
}

/** Subscribe to real-time integration plan updates for an app. */
export function subscribeToIntegrationPlan(
  appId: string,
  cb: (plan: (IntegrationPlanRecord & { id: string }) | null) => void,
): () => void {
  return onSnapshot(
    integrationPlanDoc(appId),
    (docSnap) => {
      if (!docSnap.exists()) {
        cb(null);
        return;
      }
      cb({ ...(docSnap.data() as IntegrationPlanRecord), id: docSnap.id, planId: docSnap.id });
    },
    (error) => {
      console.error('Error subscribing to integration plan:', error);
      cb(null);
    },
  );
}

// ─── Aggregated Service Export ───────────────────────────────────────────────

export const integrationSpineService = {
  buildIntegrationPlan,
  buildAllIntegrationPlans,
  saveIntegrationPlan,
  getIntegrationPlan,
  saveAppDefinition,
  getAllAppDefinitions,
  approveIntegrationPlan,
  subscribeToIntegrationPlan,
};

export default integrationSpineService;
