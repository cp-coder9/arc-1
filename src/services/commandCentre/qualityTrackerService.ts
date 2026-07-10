/**
 * Project Command Centre — Quality Tracker Service
 *
 * Manages snag items, NCR tracking, inspection scheduling, and quality KPIs.
 * Integrates with the existing snagService for data persistence and bidirectional sync.
 * Persisted at `projects/{projectId}/snags/` (shared with site execution snagService).
 *
 * @module commandCentre/qualityTrackerService
 */

import {
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firebase';
import { getDemoDoc, getDemoCol } from '@/demo-seed/demoFirestore';
import { createSnagSchema } from '@/services/commandCentre/schemas';
import { recordAudit } from '@/services/commandCentre/commandCentreService';

// ── Types ────────────────────────────────────────────────────────────────────

/** Command Centre snag statuses (extends site execution model) */
export type QualitySnagStatus = 'open' | 'rectifying' | 'resolved' | 'closed';

export interface QualitySnagItem {
  id: string;
  projectId: string;
  description: string;
  location: string;
  severity: 'high' | 'medium' | 'low';
  assignedPartyId: string;
  status: QualitySnagStatus;
  resolutionDate?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface QualityStats {
  openSnags: number;
  resolvedThisWeek: number;
  activeNCRs: number;
  inspectionsDue: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const PROJECTS_COL = 'projects';
const SNAGS_COL = 'snags';

// ── Firestore Path Helpers ───────────────────────────────────────────────────

function snagsCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol(PROJECTS_COL, projectId, SNAGS_COL);
}

function snagDocument(projectId: string, snagId: string) {
  if (!projectId) throw new Error('projectId is required');
  if (!snagId) throw new Error('snagId is required');
  return getDemoDoc(PROJECTS_COL, projectId, SNAGS_COL, snagId);
}

// ── ID Generation ────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

// ── Pure Computation Functions (exported for testability) ────────────────────

/**
 * Computes resolution rate as a percentage: resolved / total * 100.
 * Returns 0 when total is 0.
 */
export function computeResolutionRate(resolvedCount: number, totalCount: number): number {
  if (totalCount === 0) return 0;
  return (resolvedCount / totalCount) * 100;
}

/**
 * Determines if a date falls within the current week (Monday to Sunday).
 */
export function isWithinCurrentWeek(dateStr: string, referenceDate?: Date): boolean {
  const ref = referenceDate ?? new Date();
  const date = new Date(dateStr);

  // Get Monday of the reference week
  const monday = new Date(ref);
  const dayOfWeek = monday.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  monday.setDate(monday.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  // Get Sunday end of the reference week
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return date >= monday && date <= sunday;
}

/**
 * Computes quality stats from a list of snags.
 */
export function computeQualityStatsFromSnags(
  snags: QualitySnagItem[],
  referenceDate?: Date,
): QualityStats {
  const openSnags = snags.filter(
    (s) => s.status === 'open' || s.status === 'rectifying',
  ).length;

  const resolvedThisWeek = snags.filter(
    (s) =>
      (s.status === 'resolved' || s.status === 'closed') &&
      s.resolutionDate &&
      isWithinCurrentWeek(s.resolutionDate, referenceDate),
  ).length;

  // Active NCRs: snags with high severity that are not yet resolved/closed
  const activeNCRs = snags.filter(
    (s) => s.severity === 'high' && s.status !== 'resolved' && s.status !== 'closed',
  ).length;

  // Inspections due: placeholder count (in production this would query inspection schedule)
  const inspectionsDue = 0;

  return { openSnags, resolvedThisWeek, activeNCRs, inspectionsDue };
}

// ── Snag CRUD Operations ─────────────────────────────────────────────────────

/**
 * Creates a new snag in the quality tracker.
 * Validates input against the createSnagSchema.
 */
export async function createSnag(
  projectId: string,
  data: { description: string; location: string; severity: 'high' | 'medium' | 'low'; assignedPartyId: string },
  actorId: string = 'system',
): Promise<QualitySnagItem> {
  // Validate input
  const parsed = createSnagSchema.parse(data);

  const now = new Date().toISOString();
  const snagRecord: Omit<QualitySnagItem, 'id'> = {
    projectId,
    description: parsed.description,
    location: parsed.location,
    severity: parsed.severity,
    assignedPartyId: parsed.assignedPartyId,
    status: 'open',
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const docRef = await addDoc(snagsCollection(projectId), snagRecord);

    // Fire-and-forget audit
    recordAudit({
      projectId,
      actorId,
      actorName: actorId,
      actionType: 'create',
      entityType: 'snag',
      entityId: docRef.id,
      after: snagRecord as unknown as Record<string, unknown>,
      timestamp: now,
    });

    return { id: docRef.id, ...snagRecord };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${SNAGS_COL}`);
  }
}

/**
 * Updates an existing snag's fields.
 */
export async function updateSnag(
  projectId: string,
  snagId: string,
  data: Partial<Pick<QualitySnagItem, 'description' | 'location' | 'severity' | 'assignedPartyId' | 'status'>>,
  actorId: string = 'system',
): Promise<QualitySnagItem> {
  try {
    const docRef = snagDocument(projectId, snagId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      throw new Error(`Snag '${snagId}' not found`);
    }

    const current = { id: snap.id, ...snap.data() } as QualitySnagItem;
    const now = new Date().toISOString();

    const updates: Record<string, unknown> = {
      ...data,
      updatedAt: now,
    };

    await updateDoc(docRef, updates);

    // Fire-and-forget audit
    recordAudit({
      projectId,
      actorId,
      actorName: actorId,
      actionType: 'update',
      entityType: 'snag',
      entityId: snagId,
      before: current as unknown as Record<string, unknown>,
      after: updates,
      timestamp: now,
    });

    return { ...current, ...data, updatedAt: now };
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${SNAGS_COL}/${snagId}`);
  }
}

/**
 * Resolves a snag: sets status to 'resolved', records resolution date,
 * and computes the updated resolution rate KPI.
 */
export async function resolveSnag(
  projectId: string,
  snagId: string,
  actorId: string = 'system',
): Promise<{ snag: QualitySnagItem; resolutionRate: number }> {
  try {
    const docRef = snagDocument(projectId, snagId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      throw new Error(`Snag '${snagId}' not found`);
    }

    const current = { id: snap.id, ...snap.data() } as QualitySnagItem;

    if (current.status === 'resolved' || current.status === 'closed') {
      throw new Error(`Snag '${snagId}' is already ${current.status}`);
    }

    const now = new Date().toISOString();
    const updates = {
      status: 'resolved' as const,
      resolutionDate: now,
      updatedAt: now,
    };

    await updateDoc(docRef, updates);

    // Fire-and-forget audit
    recordAudit({
      projectId,
      actorId,
      actorName: actorId,
      actionType: 'status_change',
      entityType: 'snag',
      entityId: snagId,
      before: { status: current.status },
      after: { status: 'resolved', resolutionDate: now },
      timestamp: now,
    });

    // Compute resolution rate — fetch all snags and calculate
    const allSnags = await getSnags(projectId);
    const resolvedCount = allSnags.filter(
      (s) => s.status === 'resolved' || s.status === 'closed',
    ).length + 1; // +1 for the snag just resolved (might not reflect in real-time read)
    const totalCount = allSnags.length;
    const resolutionRate = computeResolutionRate(resolvedCount, totalCount);

    const resolvedSnag: QualitySnagItem = { ...current, ...updates };
    return { snag: resolvedSnag, resolutionRate };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('not found') || error.message.includes('already'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${SNAGS_COL}/${snagId}`);
  }
}

// ── Query Operations ─────────────────────────────────────────────────────────

/**
 * Retrieves all snags for a project, ordered by creation date descending.
 */
export async function getSnags(projectId: string): Promise<QualitySnagItem[]> {
  try {
    const q = query(snagsCollection(projectId), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as QualitySnagItem));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${SNAGS_COL}`);
  }
}

/**
 * Computes quality stats for a project: open snags, resolved this week, active NCRs, inspections due.
 */
export async function getQualityStats(projectId: string): Promise<QualityStats> {
  const snags = await getSnags(projectId);
  return computeQualityStatsFromSnags(snags);
}

// ── Service Export ───────────────────────────────────────────────────────────

export const qualityTrackerService = {
  createSnag,
  updateSnag,
  resolveSnag,
  getSnags,
  getQualityStats,
  // Pure functions exported for testing
  computeResolutionRate,
  isWithinCurrentWeek,
  computeQualityStatsFromSnags,
  // Collection path constants (exported for Data Bridge consistency verification)
  SNAGS_COLLECTION_PATH: SNAGS_COL,
};

export default qualityTrackerService;
