/**
 * Project Command Centre — Milestone Service
 *
 * Manages milestone CRUD, NHBRC inspection milestone support with stage-specific
 * documentation checklists, overdue detection with Action Centre events, and
 * completion notification to linked payment certificate holders.
 * Persists to Firestore `projects/{projectId}/milestones/`.
 *
 * @module commandCentre/milestoneService
 */

import {
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firebase';
import { getDemoDoc, getDemoCol } from '@/demo-seed/demoFirestore';
import { recordAudit } from '@/services/commandCentre/commandCentreService';
import { createMilestoneSchema } from '@/services/commandCentre/schemas';
import { getNHBRCChecklist } from '@/services/commandCentre/saContextService';
import type { NHBRCStageNumber } from '@/services/commandCentre/saContextService';
import type { CommandCentreMilestone, CommandCentreAction } from '@/services/commandCentre/types';

// ── ID Generation ────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

// ── Collection Constants ─────────────────────────────────────────────────────

const PROJECTS_COL = 'projects';
const MILESTONES_COL = 'milestones';

// ── Firestore Path Helpers ───────────────────────────────────────────────────

function milestonesCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol(PROJECTS_COL, projectId, MILESTONES_COL);
}

function milestoneDocument(projectId: string, milestoneId: string) {
  if (!projectId) throw new Error('projectId is required');
  if (!milestoneId) throw new Error('milestoneId is required');
  return getDemoDoc(PROJECTS_COL, projectId, MILESTONES_COL, milestoneId);
}

// ── Input Types ──────────────────────────────────────────────────────────────

export interface CreateMilestoneData {
  name: string;
  plannedDate: string;
  linkedCertificateId?: string;
  linkedActivityId?: string;
  category?: 'general' | 'nhbrc_inspection' | 'municipal_submission';
  nhbrcStage?: number;
  createdBy: string;
}

export interface UpdateMilestoneData {
  name?: string;
  plannedDate?: string;
  linkedCertificateId?: string;
  linkedActivityId?: string;
  category?: 'general' | 'nhbrc_inspection' | 'municipal_submission';
  nhbrcStage?: number;
  status?: CommandCentreMilestone['status'];
}

// ── CRUD Operations ──────────────────────────────────────────────────────────

/**
 * Creates a new milestone. Validates required fields with Zod schema.
 * If category is 'nhbrc_inspection' and nhbrcStage is provided, attaches
 * the NHBRC documentation checklist from saContextService.
 *
 * New milestones start with status 'pending'.
 */
export async function createMilestone(
  projectId: string,
  data: CreateMilestoneData,
): Promise<CommandCentreMilestone> {
  // Validate required fields via Zod
  const validation = createMilestoneSchema.safeParse({
    name: data.name,
    plannedDate: data.plannedDate,
    linkedCertificateId: data.linkedCertificateId,
    linkedActivityId: data.linkedActivityId,
    category: data.category,
  });

  if (!validation.success) {
    throw new Error(`Validation failed: ${validation.error.issues.map((i) => i.message).join(', ')}`);
  }

  const now = new Date().toISOString();
  const id = generateId();

  // Attach NHBRC checklist if category is nhbrc_inspection and stage is provided
  let documentationChecklist: string[] | undefined;
  if (data.category === 'nhbrc_inspection' && data.nhbrcStage != null) {
    documentationChecklist = getNHBRCChecklist(data.nhbrcStage as NHBRCStageNumber);
  }

  const milestone: CommandCentreMilestone = {
    id,
    projectId,
    name: data.name,
    plannedDate: data.plannedDate,
    status: 'pending',
    linkedCertificateId: data.linkedCertificateId,
    linkedActivityId: data.linkedActivityId,
    category: data.category,
    nhbrcStage: data.nhbrcStage,
    documentationChecklist,
    createdBy: data.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await addDoc(milestonesCollection(projectId), milestone);

    // Fire-and-forget audit
    void recordAudit({
      projectId,
      actorId: data.createdBy,
      actorName: data.createdBy,
      actionType: 'create',
      entityType: 'milestone',
      entityId: id,
      after: { name: milestone.name, plannedDate: milestone.plannedDate, category: milestone.category },
      timestamp: now,
    });

    return milestone;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${MILESTONES_COL}`);
    throw error;
  }
}

/**
 * Updates an existing milestone's fields. Records audit entry with before/after.
 * If category is changed to 'nhbrc_inspection' with a valid nhbrcStage,
 * attaches the NHBRC documentation checklist.
 */
export async function updateMilestone(
  projectId: string,
  milestoneId: string,
  data: UpdateMilestoneData,
): Promise<CommandCentreMilestone> {
  const docRef = milestoneDocument(projectId, milestoneId);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      throw new Error(`Milestone '${milestoneId}' not found in project ${projectId}`);
    }

    const existing = snap.data() as CommandCentreMilestone;
    const now = new Date().toISOString();

    // Determine if we need to re-attach NHBRC checklist
    const effectiveCategory = data.category ?? existing.category;
    const effectiveStage = data.nhbrcStage ?? existing.nhbrcStage;
    let documentationChecklist = existing.documentationChecklist;

    if (effectiveCategory === 'nhbrc_inspection' && effectiveStage != null) {
      // Re-attach checklist if category or stage changed
      if (data.category !== undefined || data.nhbrcStage !== undefined) {
        documentationChecklist = getNHBRCChecklist(effectiveStage as NHBRCStageNumber);
      }
    } else if (effectiveCategory !== 'nhbrc_inspection') {
      // Clear checklist if category is no longer nhbrc_inspection
      documentationChecklist = undefined;
    }

    const updates: Partial<CommandCentreMilestone> & { updatedAt: string } = {
      ...data,
      documentationChecklist,
      updatedAt: now,
    };

    await updateDoc(docRef, updates);

    const updatedMilestone: CommandCentreMilestone = { ...existing, ...updates };

    // Fire-and-forget audit
    void recordAudit({
      projectId,
      actorId: existing.createdBy,
      actorName: existing.createdBy,
      actionType: 'update',
      entityType: 'milestone',
      entityId: milestoneId,
      before: data as Record<string, unknown>,
      after: updates as Record<string, unknown>,
      timestamp: now,
    });

    return updatedMilestone;
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${MILESTONES_COL}/${milestoneId}`);
    throw error;
  }
}

/**
 * Marks a milestone as complete. Records the actual completion date,
 * and generates an Action Centre notification event for linked payment
 * certificate holders.
 */
export async function completeMilestone(
  projectId: string,
  milestoneId: string,
): Promise<{ milestone: CommandCentreMilestone; actionEvent?: CommandCentreAction }> {
  const docRef = milestoneDocument(projectId, milestoneId);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      throw new Error(`Milestone '${milestoneId}' not found in project ${projectId}`);
    }

    const existing = snap.data() as CommandCentreMilestone;
    const now = new Date().toISOString();
    const today = now.slice(0, 10); // YYYY-MM-DD

    const updates = {
      status: 'complete' as const,
      actualDate: today,
      updatedAt: now,
    };

    await updateDoc(docRef, updates);

    const completedMilestone: CommandCentreMilestone = { ...existing, ...updates };

    // Fire-and-forget audit
    void recordAudit({
      projectId,
      actorId: existing.createdBy,
      actorName: existing.createdBy,
      actionType: 'status_change',
      entityType: 'milestone',
      entityId: milestoneId,
      before: { status: existing.status },
      after: { status: 'complete', actualDate: today },
      timestamp: now,
    });

    // Generate Action Centre event to notify linked certificate holders
    let actionEvent: CommandCentreAction | undefined;
    if (existing.linkedCertificateId) {
      actionEvent = {
        id: generateId(),
        projectId,
        type: 'financial',
        title: `Milestone "${existing.name}" completed — linked payment certificate ready`,
        description: `Milestone "${existing.name}" has been completed on ${today}. Payment certificate ${existing.linkedCertificateId} can now be processed.`,
        assigneeId: existing.createdBy,
        dueDate: today,
        priority: 'high',
        sourceSubsystem: 'milestones',
        sourceEntityId: milestoneId,
        status: 'pending',
        createdAt: now,
      };
    }

    return { milestone: completedMilestone, actionEvent };
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${MILESTONES_COL}/${milestoneId}`);
    throw error;
  }
}

/**
 * Retrieves all milestones for a project, sorted by planned date ascending.
 */
export async function getMilestones(projectId: string): Promise<CommandCentreMilestone[]> {
  try {
    const q = query(milestonesCollection(projectId), orderBy('plannedDate', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...d.data(), id: d.id } as CommandCentreMilestone));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${MILESTONES_COL}`);
    throw error;
  }
}

// ── Overdue Detection ────────────────────────────────────────────────────────

/**
 * Checks a milestone for overdue status. If the planned date has passed and
 * the milestone is not complete, changes its status to 'overdue' and returns
 * an Action Centre event.
 *
 * @param milestone - The milestone to check
 * @param currentDate - The current date (YYYY-MM-DD), defaults to today
 * @returns Object with updated milestone and optional action event if overdue
 */
export function detectOverdue(
  milestone: CommandCentreMilestone,
  currentDate?: string,
): { isOverdue: boolean; actionEvent?: CommandCentreAction } {
  const today = currentDate ?? new Date().toISOString().slice(0, 10);

  // Already complete or already overdue — no action needed
  if (milestone.status === 'complete' || milestone.status === 'overdue') {
    return { isOverdue: milestone.status === 'overdue' };
  }

  // Check if planned date has passed
  if (milestone.plannedDate < today) {
    const actionEvent: CommandCentreAction = {
      id: generateId(),
      projectId: milestone.projectId,
      type: 'planning',
      title: `Milestone "${milestone.name}" is overdue`,
      description: `Milestone "${milestone.name}" was planned for ${milestone.plannedDate} but has not been completed.`,
      assigneeId: milestone.createdBy,
      dueDate: milestone.plannedDate,
      priority: 'high',
      sourceSubsystem: 'milestones',
      sourceEntityId: milestone.id,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    return { isOverdue: true, actionEvent };
  }

  return { isOverdue: false };
}

/**
 * Marks a milestone as overdue in Firestore and returns the Action Centre event.
 * Called when detectOverdue identifies an overdue milestone.
 */
export async function markOverdue(
  projectId: string,
  milestoneId: string,
): Promise<{ milestone: CommandCentreMilestone; actionEvent: CommandCentreAction }> {
  const docRef = milestoneDocument(projectId, milestoneId);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      throw new Error(`Milestone '${milestoneId}' not found in project ${projectId}`);
    }

    const existing = snap.data() as CommandCentreMilestone;
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    const updates = {
      status: 'overdue' as const,
      updatedAt: now,
    };

    await updateDoc(docRef, updates);

    const updatedMilestone: CommandCentreMilestone = { ...existing, ...updates };

    // Fire-and-forget audit
    void recordAudit({
      projectId,
      actorId: 'system',
      actorName: 'System',
      actionType: 'status_change',
      entityType: 'milestone',
      entityId: milestoneId,
      before: { status: existing.status },
      after: { status: 'overdue' },
      timestamp: now,
    });

    const actionEvent: CommandCentreAction = {
      id: generateId(),
      projectId,
      type: 'planning',
      title: `Milestone "${existing.name}" is overdue`,
      description: `Milestone "${existing.name}" was planned for ${existing.plannedDate} but has not been completed.`,
      assigneeId: existing.createdBy,
      dueDate: today,
      priority: 'high',
      sourceSubsystem: 'milestones',
      sourceEntityId: milestoneId,
      status: 'pending',
      createdAt: now,
    };

    return { milestone: updatedMilestone, actionEvent };
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${MILESTONES_COL}/${milestoneId}`);
    throw error;
  }
}

// ── Service Export ───────────────────────────────────────────────────────────

export const milestoneService = {
  createMilestone,
  updateMilestone,
  completeMilestone,
  getMilestones,
  detectOverdue,
  markOverdue,
};

export default milestoneService;
