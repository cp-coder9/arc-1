// ─── Pack 17: Workflow Router Service ───────────────────────────────────────
// Routes workflow events between dedicated apps, applying governance decisions
// and determining the required project record, file manager, notification, and
// command centre updates.

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
  Timestamp,
  type QueryConstraint,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type {
  DedicatedAppDefinition,
  DedicatedAppWorkflowEvent,
  GovernanceDecision,
  IntegrationPlan,
} from '@/services/lifecycleTypes';
import { evaluateDedicatedAppGovernance, governanceAllowsExecution } from './governanceGateService';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
// ─── Firestore Paths ─────────────────────────────────────────────────────────

const ROUTES_COL = 'workflow_routes';
const PROJECTS_COL = 'projects';

function routesCollection() {
  return getDemoCol( ROUTES_COL);
}

function projectRoutesCollection(projectId: string) {
  return getDemoCol( PROJECTS_COL, projectId, ROUTES_COL);
}

function routeDoc(routeId: string) {
  return getDemoDoc( ROUTES_COL, routeId);
}

// ─── Pure Business Logic ─────────────────────────────────────────────────────

export interface RoutedWorkflowEvent {
  eventId: string;
  appId: string;
  governance: GovernanceDecision;
  projectRecordRequired: boolean;
  fileManagerRequired: boolean;
  notificationRequired: boolean;
  commandCentreUpdateRequired: boolean;
  auditPayload: {
    tenantId: string;
    projectId?: string;
    actorId: string;
    appId: string;
    type: string;
    humanGate: string;
    riskLevel: string;
    createdAt: string;
  };
}

/**
 * Route a workflow event through governance and return routing metadata.
 * Determines which Architex spine systems need to be updated.
 */
export function routeWorkflowEvent(
  app: DedicatedAppDefinition,
  event: DedicatedAppWorkflowEvent,
): RoutedWorkflowEvent {
  const governance = evaluateDedicatedAppGovernance(app, event);

  return {
    eventId: event.eventId,
    appId: app.id,
    governance,
    projectRecordRequired: event.outputs.includes('ProjectRecord'),
    fileManagerRequired: event.outputs.includes('FileManagerAsset'),
    notificationRequired:
      event.outputs.includes('NotificationEvent') || event.outputs.includes('ProjectInboxItem'),
    commandCentreUpdateRequired:
      event.outputs.includes('ProjectDecision') ||
      event.outputs.includes('ProjectRiskSignal') ||
      event.outputs.includes('ProjectInboxItem'),
    auditPayload: {
      tenantId: event.tenantId,
      projectId: event.projectId,
      actorId: event.actorId,
      appId: app.id,
      type: event.type,
      humanGate: event.humanGate,
      riskLevel: event.riskLevel,
      createdAt: event.createdAt,
    },
  };
}

/**
 * Route a batch of workflow events for a single app.
 * Returns only those events that pass governance.
 */
export function routeAndFilterAllowedEvents(
  app: DedicatedAppDefinition,
  events: DedicatedAppWorkflowEvent[],
): RoutedWorkflowEvent[] {
  return events
    .map((event) => routeWorkflowEvent(app, event))
    .filter((routed) => governanceAllowsExecution(routed.governance));
}

/**
 * Check if a routed event requires human intervention before execution.
 */
export function requiresHumanGate(routed: RoutedWorkflowEvent): boolean {
  return routed.governance.status === 'requires_human' || routed.governance.humanGate !== 'none';
}

/**
 * Summarize the routing result for the app's dashboard.
 */
export function summarizeAppRouting(app: DedicatedAppDefinition, routed: RoutedWorkflowEvent[]) {
  return {
    appId: app.id,
    appName: app.name,
    totalEvents: routed.length,
    allowedEvents: routed.filter((r) => r.governance.status === 'allowed').length,
    blockedEvents: routed.filter((r) => r.governance.status === 'blocked').length,
    humanGateRequired: routed.filter(requiresHumanGate).length,
    updatesRequired: {
      projectRecord: routed.some((r) => r.projectRecordRequired),
      fileManager: routed.some((r) => r.fileManagerRequired),
      notification: routed.some((r) => r.notificationRequired),
      commandCentre: routed.some((r) => r.commandCentreUpdateRequired),
    },
  };
}

// ─── Firestore-backed Operations ─────────────────────────────────────────────

export type RouteStatus = 'pending' | 'routed' | 'executed' | 'blocked' | 'failed';

export interface WorkflowRouteRecord {
  routeId: string;
  projectId?: string;
  appId: string;
  event: DedicatedAppWorkflowEvent;
  routed: RoutedWorkflowEvent;
  status: RouteStatus;
  executedBy?: string;
  executedAt?: string;
  error?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Route a workflow event, evaluate governance, and persist the route. */
export async function createAndPersistRoute(
  app: DedicatedAppDefinition,
  event: DedicatedAppWorkflowEvent,
): Promise<WorkflowRouteRecord & { id: string }> {
  try {
    const routed = routeWorkflowEvent(app, event);
    const now = new Date().toISOString();
    const status: RouteStatus = routed.governance.status === 'blocked' ? 'blocked' : 'routed';

    const record: Omit<WorkflowRouteRecord, 'routeId'> = {
      projectId: event.projectId,
      appId: app.id,
      event,
      routed,
      status,
      createdAt: now,
    };

    const docRef = await addDoc(
      event.projectId
        ? projectRoutesCollection(event.projectId)
        : routesCollection(),
      record,
    );
    return { routeId: docRef.id, ...record, id: docRef.id };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${ROUTES_COL}`);
    throw error;
  }
}

/** Execute a previously routed workflow event. */
export async function executeRoute(routeId: string, executedBy: string): Promise<void> {
  try {
    await updateDoc(routeDoc(routeId), {
      status: 'executed',
      executedBy,
      executedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${ROUTES_COL}/${routeId}`);
  }
}

/** Mark a route as failed. */
export async function failRoute(routeId: string, errorMessage: string): Promise<void> {
  try {
    await updateDoc(routeDoc(routeId), {
      status: 'failed',
      error: errorMessage,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${ROUTES_COL}/${routeId}`);
  }
}

/** Get all routes for a project. */
export async function getProjectRoutes(
  projectId: string,
  statusFilter?: RouteStatus,
): Promise<(WorkflowRouteRecord & { id: string })[]> {
  try {
    const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];
    if (statusFilter) {
      constraints.unshift(where('status', '==', statusFilter));
    }
    const q = query(projectRoutesCollection(projectId), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      routeId: d.id,
      ...(d.data() as WorkflowRouteRecord),
      id: d.id,
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${ROUTES_COL}`);
    return [];
  }
}

/** Get a single route by ID. */
export async function getRoute(routeId: string): Promise<(WorkflowRouteRecord & { id: string }) | null> {
  try {
    const docSnap = await getDoc(routeDoc(routeId));
    if (!docSnap.exists()) return null;
    const data = docSnap.data() as WorkflowRouteRecord;
    return { routeId: docSnap.id, ...data, id: docSnap.id };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${ROUTES_COL}/${routeId}`);
    return null;
  }
}

/** Subscribe to real-time route updates for a project. */
export function subscribeToProjectRoutes(
  projectId: string,
  cb: (routes: (WorkflowRouteRecord & { id: string })[]) => void,
): () => void {
  const q = query(projectRoutesCollection(projectId), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) =>
      cb(snap.docs.map((d) => ({ routeId: d.id, ...(d.data() as WorkflowRouteRecord), id: d.id }))),
    (error) => {
      console.error('Error subscribing to workflow routes:', error);
      cb([]);
    },
  );
}

/** Route multiple events for an app and persist all routes. */
export async function routeAndPersistBatch(
  app: DedicatedAppDefinition,
  events: DedicatedAppWorkflowEvent[],
): Promise<(WorkflowRouteRecord & { id: string })[]> {
  const results: (WorkflowRouteRecord & { id: string })[] = [];
  for (const event of events) {
    const saved = await createAndPersistRoute(app, event);
    results.push(saved);
  }
  return results;
}

// ─── Aggregated Service Export ───────────────────────────────────────────────

export const workflowRouterService = {
  routeWorkflowEvent,
  routeAndFilterAllowedEvents,
  requiresHumanGate,
  summarizeAppRouting,
  createAndPersistRoute,
  executeRoute,
  failRoute,
  getProjectRoutes,
  getRoute,
  routeAndPersistBatch,
  subscribeToProjectRoutes,
};

export default workflowRouterService;
