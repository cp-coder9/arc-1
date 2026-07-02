/**
 * Conditions of Approval Register Service
 *
 * Manages conditions imposed on approved land use applications.
 * Tracks condition fulfillment, waiver processing, deadline monitoring,
 * and overall compliance status.
 *
 * Uses DI pattern consistent with other town-planning services.
 */

import { z } from 'zod';
import type { UserRole } from '@/types';
import type { ConditionOfApproval, ConditionStatus } from '../types';
import type { FirestoreDB } from './municipalityConfig';

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const ConditionInputSchema = z.object({
  conditionNumber: z.number().int().min(1, 'Condition number must be at least 1'),
  description: z.string().min(1, 'Description is required'),
  responsibleParty: z.string().optional(),
  deadline: z.string().optional(),
  notes: z.string().optional(),
});

export type ConditionInput = z.infer<typeof ConditionInputSchema>;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConditionActor {
  id: string;
  role: UserRole;
}

export interface ConditionAuditEntry {
  action: 'condition_created' | 'condition_status_updated' | 'condition_overdue_marked';
  actorId: string;
  actorRole: UserRole;
  timestamp: string;
  projectId: string;
  applicationId: string;
  conditionId: string;
  details: Record<string, unknown>;
}

export type ConditionAuditFn = (entry: ConditionAuditEntry) => Promise<void>;

export interface PassportUpdatePayload {
  projectId: string;
  applicationId: string;
  conditionsCompliant: boolean;
  summary: ConditionsSummary;
}

export type PassportUpdateFn = (payload: PassportUpdatePayload) => Promise<void>;

export interface ReadinessPayload {
  projectId: string;
  applicationId: string;
  conditionsCompliant: boolean;
  summary: ConditionsSummary;
}

export type ReadinessAdapterFn = (payload: ReadinessPayload) => Promise<void>;

export interface ConditionDeps {
  db: FirestoreDB;
  auditFn: ConditionAuditFn;
}

export interface ConditionsSummary {
  total: number;
  outstanding: number;
  inProgress: number;
  fulfilled: number;
  waived: number;
  overdue: number;
}

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── Status Transitions ──────────────────────────────────────────────────────

/**
 * Permitted condition status transitions:
 * - outstanding → in_progress (start working on condition)
 * - outstanding → waived (requires waiver reference + reason)
 * - in_progress → fulfilled (requires ≥1 evidence doc ID)
 * - in_progress → waived (requires waiver reference + reason)
 * - fulfilled → (no transitions — terminal)
 * - waived → (no transitions — terminal)
 */
export const CONDITION_STATUS_TRANSITIONS: Record<ConditionStatus, ConditionStatus[]> = {
  outstanding: ['in_progress', 'waived'],
  in_progress: ['fulfilled', 'waived'],
  fulfilled: [],
  waived: [],
};

// ─── Helper: Collection Path ─────────────────────────────────────────────────

function conditionsPath(projectId: string, applicationId: string): string {
  return `projects/${projectId}/townPlanning/applications/${applicationId}/conditions`;
}

// ─── Service Implementation ──────────────────────────────────────────────────

/**
 * Creates a new condition of approval.
 *
 * - Validates input with ConditionInputSchema
 * - Persists to Firestore
 * - Creates audit record
 * - Returns the created condition
 */
export async function createCondition(
  applicationId: string,
  projectId: string,
  input: unknown,
  actor: ConditionActor,
  deps: ConditionDeps
): Promise<ServiceResult<ConditionOfApproval>> {
  const { db, auditFn } = deps;

  // Validate input
  const parsed = ConditionInputSchema.safeParse(input);
  if (!parsed.success) {
    const messages = parsed.error.errors.map((e) => e.message).join(', ');
    return { success: false, error: `Validation failed: ${messages}` };
  }

  const validInput = parsed.data;
  const now = new Date().toISOString();

  const conditionData: Omit<ConditionOfApproval, 'id'> = {
    applicationId,
    conditionNumber: validInput.conditionNumber,
    description: validInput.description,
    responsibleParty: validInput.responsibleParty,
    deadline: validInput.deadline,
    status: 'outstanding',
    evidenceDocuments: [],
    notes: validInput.notes,
    createdAt: now,
    updatedAt: now,
  };

  // Persist to Firestore
  const path = conditionsPath(projectId, applicationId);
  const docRef = await db.collection(path).add(conditionData as unknown as Record<string, unknown>);

  const condition: ConditionOfApproval = {
    id: docRef.id,
    ...conditionData,
  };

  // Create audit record
  await auditFn({
    action: 'condition_created',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    projectId,
    applicationId,
    conditionId: docRef.id,
    details: {
      conditionNumber: validInput.conditionNumber,
      description: validInput.description,
    },
  });

  return { success: true, data: condition };
}

/**
 * Updates a condition's status following the state machine.
 *
 * Validates:
 * - Transition is permitted
 * - fulfilled requires ≥1 evidence document ID
 * - waived requires waiverReference + waiverReason
 * - No reverse from fulfilled/waived
 */
export async function updateConditionStatus(
  conditionId: string,
  applicationId: string,
  projectId: string,
  newStatus: ConditionStatus,
  evidence: {
    evidenceDocIds?: string[];
    waiverReference?: string;
    waiverReason?: string;
  },
  actor: ConditionActor,
  deps: ConditionDeps
): Promise<ServiceResult<ConditionOfApproval>> {
  const { db, auditFn } = deps;

  // Fetch existing condition
  const path = conditionsPath(projectId, applicationId);
  const docSnap = await db.collection(path).doc(conditionId).get();

  if (!docSnap.exists) {
    return { success: false, error: `Condition '${conditionId}' not found` };
  }

  const data = docSnap.data();
  if (!data) {
    return { success: false, error: `Condition '${conditionId}' has no data` };
  }

  const currentStatus = data.status as ConditionStatus;

  // Validate transition
  const permitted = CONDITION_STATUS_TRANSITIONS[currentStatus] ?? [];
  if (!permitted.includes(newStatus)) {
    return {
      success: false,
      error: `Invalid status transition: '${currentStatus}' → '${newStatus}'. Permitted: ${permitted.join(', ') || 'none (terminal state)'}`,
    };
  }

  // Validate evidence requirements for 'fulfilled'
  if (newStatus === 'fulfilled') {
    const evidenceDocs = evidence.evidenceDocIds ?? [];
    if (evidenceDocs.length === 0) {
      return {
        success: false,
        error: 'Transition to fulfilled requires at least 1 evidence document ID',
      };
    }
  }

  // Validate waiver requirements for 'waived'
  if (newStatus === 'waived') {
    if (!evidence.waiverReference || evidence.waiverReference.trim().length === 0) {
      return {
        success: false,
        error: 'Transition to waived requires a waiver reference',
      };
    }
    if (!evidence.waiverReason || evidence.waiverReason.trim().length === 0) {
      return {
        success: false,
        error: 'Transition to waived requires a waiver reason',
      };
    }
  }

  const now = new Date().toISOString();

  // Build update payload
  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    updatedAt: now,
  };

  if (newStatus === 'fulfilled' && evidence.evidenceDocIds) {
    const existingDocs = (data.evidenceDocuments as string[]) ?? [];
    updatePayload.evidenceDocuments = [...existingDocs, ...evidence.evidenceDocIds];
  }

  if (newStatus === 'waived') {
    updatePayload.waiverReference = evidence.waiverReference;
    updatePayload.waiverReason = evidence.waiverReason;
  }

  // Update in Firestore
  await db.collection(path).doc(conditionId).update(updatePayload);

  // Create audit record
  await auditFn({
    action: 'condition_status_updated',
    actorId: actor.id,
    actorRole: actor.role,
    timestamp: now,
    projectId,
    applicationId,
    conditionId,
    details: {
      previousStatus: currentStatus,
      newStatus,
      ...(evidence.evidenceDocIds ? { evidenceDocIds: evidence.evidenceDocIds } : {}),
      ...(evidence.waiverReference ? { waiverReference: evidence.waiverReference } : {}),
      ...(evidence.waiverReason ? { waiverReason: evidence.waiverReason } : {}),
    },
  });

  const updatedCondition: ConditionOfApproval = {
    id: conditionId,
    ...(data as unknown as Omit<ConditionOfApproval, 'id'>),
    status: newStatus,
    updatedAt: now,
    ...(newStatus === 'fulfilled' && evidence.evidenceDocIds
      ? { evidenceDocuments: [...((data.evidenceDocuments as string[]) ?? []), ...evidence.evidenceDocIds] }
      : {}),
    ...(newStatus === 'waived'
      ? { waiverReference: evidence.waiverReference, waiverReason: evidence.waiverReason }
      : {}),
  };

  return { success: true, data: updatedCondition };
}

/**
 * Returns true only when ALL conditions have status 'fulfilled' or 'waived'.
 * Returns false if there are no conditions or any are 'outstanding'/'in_progress'.
 */
export async function isConditionsCompliant(
  applicationId: string,
  projectId: string,
  db: FirestoreDB
): Promise<boolean> {
  const path = conditionsPath(projectId, applicationId);
  const snapshot = await db.collection(path).get();

  if (snapshot.empty) {
    return false;
  }

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data) return false;

    const status = data.status as ConditionStatus;
    if (status !== 'fulfilled' && status !== 'waived') {
      return false;
    }
  }

  return true;
}

/**
 * Returns a summary of all conditions for an application.
 */
export async function getConditionsSummary(
  applicationId: string,
  projectId: string,
  db: FirestoreDB
): Promise<ConditionsSummary> {
  const path = conditionsPath(projectId, applicationId);
  const snapshot = await db.collection(path).get();

  const summary: ConditionsSummary = {
    total: 0,
    outstanding: 0,
    inProgress: 0,
    fulfilled: 0,
    waived: 0,
    overdue: 0,
  };

  if (snapshot.empty) {
    return summary;
  }

  const today = new Date().toISOString().split('T')[0];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data) continue;

    summary.total++;
    const status = data.status as ConditionStatus;

    switch (status) {
      case 'outstanding':
        summary.outstanding++;
        break;
      case 'in_progress':
        summary.inProgress++;
        break;
      case 'fulfilled':
        summary.fulfilled++;
        break;
      case 'waived':
        summary.waived++;
        break;
    }

    // Check overdue: has deadline, deadline passed, and not fulfilled/waived
    if (data.deadline && status !== 'fulfilled' && status !== 'waived') {
      if ((data.deadline as string) < today) {
        summary.overdue++;
      }
    }
  }

  return summary;
}

/**
 * Checks conditions for overdue status and marks them.
 * A condition is overdue if its deadline has passed and its status is not fulfilled/waived.
 *
 * @param today - Optional date override for testing (defaults to current date)
 */
export async function checkOverdueConditions(
  applicationId: string,
  projectId: string,
  db: FirestoreDB,
  today?: string
): Promise<{ overdueIds: string[]; count: number }> {
  const currentDate = today ?? new Date().toISOString().split('T')[0];
  const path = conditionsPath(projectId, applicationId);
  const snapshot = await db.collection(path).get();

  const overdueIds: string[] = [];

  if (snapshot.empty) {
    return { overdueIds, count: 0 };
  }

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data) continue;

    const status = data.status as ConditionStatus;
    const deadline = data.deadline as string | undefined;

    // Mark as overdue if deadline passed and not in terminal state
    if (deadline && status !== 'fulfilled' && status !== 'waived') {
      if (deadline < currentDate) {
        overdueIds.push(doc.id);
      }
    }
  }

  return { overdueIds, count: overdueIds.length };
}

/**
 * Updates the Project Passport when all conditions are complete.
 * Called after a condition status update to check if compliance is achieved.
 */
export async function updatePassportOnComplete(
  applicationId: string,
  projectId: string,
  deps: { db: FirestoreDB; passportFn: PassportUpdateFn }
): Promise<{ compliant: boolean }> {
  const { db, passportFn } = deps;

  const compliant = await isConditionsCompliant(applicationId, projectId, db);
  const summary = await getConditionsSummary(applicationId, projectId, db);

  await passportFn({
    projectId,
    applicationId,
    conditionsCompliant: compliant,
    summary,
  });

  return { compliant };
}

/**
 * Exposes conditions compliance status to the Municipal Submission Readiness adapter.
 */
export async function exposeToReadinessAdapter(
  applicationId: string,
  projectId: string,
  deps: { db: FirestoreDB; readinessFn: ReadinessAdapterFn }
): Promise<{ compliant: boolean }> {
  const { db, readinessFn } = deps;

  const compliant = await isConditionsCompliant(applicationId, projectId, db);
  const summary = await getConditionsSummary(applicationId, projectId, db);

  await readinessFn({
    projectId,
    applicationId,
    conditionsCompliant: compliant,
    summary,
  });

  return { compliant };
}
