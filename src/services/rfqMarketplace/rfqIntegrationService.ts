// ─── RFQ Integration Service ─────────────────────────────────────────────────
// Handles SpecForge write-back, Project Passport records, and Action Centre events.
// Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8
//
// The writeBackToSpecForge function delegates to rfqWritebackService which:
// - Writes to `projects/{projectId}/specProcurement/{entryId}` (correct path)
// - Applies Zod validation via the repository interface
// - Writes audit events to `projects/{projectId}/specAuditEvents`
// - NEVER reads from or writes to legacy path `projects/{projectId}/specforge/entries/{id}/data`

import { getDoc, setDoc } from 'firebase/firestore';
import { getDemoDoc } from '../../demo-seed/demoFirestore';
import type { RfqStatus, ProcurementStatus } from './types';
import {
  writeBackToSpecForge as writeBackToSpecForgeService,
  type RfqWritebackParams,
  type RfqWritebackResult,
  type RfqWritebackLineItem,
} from '../specforge/rfqWritebackService';
import { adminDb } from '@/lib/firebase-admin';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A SpecForge procurement entry update payload written on award. */
export interface SpecForgeProcurementUpdate {
  specForgeItemId: string;
  supplierName: string;
  unitRate: number;
  totalCost: number;
  leadTimeDays: number;
  status: ProcurementStatus;
}

/** A Project Passport record for an RFQ lifecycle event. */
export interface RfqProjectRecord {
  rfqId: string;
  rfqNumber: string;
  rfqTitle: string;
  stage: RfqStatus;
  awardedSupplier?: string;
  totalQuotedValue?: number;
  transitionTimestamp: string;
}

/** An Action Centre workflow event for RFQ-related actions. */
export interface RfqWorkflowEvent {
  rfqId: string;
  projectId: string;
  eventType: 'deadline_reminder' | 'approval_overdue' | 'zero_quote_alert';
  targetRoles: string[];
  message: string;
  actionUrl: string;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generates a unique ID with a given prefix. */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── writeBackToSpecForge ────────────────────────────────────────────────────

/**
 * Writes procurement data back to SpecForge on award.
 *
 * Delegates to `rfqWritebackService.writeBackToSpecForge()` which writes to the
 * correct path `projects/{projectId}/specProcurement/{entryId}` using the
 * repository interface with Zod validation and audit logging.
 *
 * NEVER reads from or writes to the legacy path
 * `projects/{projectId}/specforge/entries/{id}/data`.
 *
 * Validates: Requirement 8.1, 8.2, 8.4, 8.8
 */
export async function writeBackToSpecForge(params: {
  projectId: string;
  rfqId: string;
  updates: SpecForgeProcurementUpdate[];
  performedBy?: string;
}): Promise<{ success: boolean; skipped: string[]; errors: string[] }> {
  const { projectId, rfqId, updates, performedBy } = params;

  // Map the legacy SpecForgeProcurementUpdate[] to RfqWritebackLineItem[]
  const lineItems: RfqWritebackLineItem[] = updates.map((update) => ({
    specItemId: update.specForgeItemId,
    supplierName: update.supplierName,
    unitRate: update.unitRate,
    totalCost: update.totalCost,
    leadTimeDays: update.leadTimeDays,
  }));

  // Derive awarded supplier from the first update (all should be same supplier in an award)
  const awardedSupplier = updates.length > 0 ? updates[0].supplierName : 'Unknown';

  // Delegate to rfqWritebackService — handles Zod validation, audit logging,
  // and writes to the correct specProcurement collection path
  const writebackParams: RfqWritebackParams = {
    projectId,
    rfqId,
    awardedSupplier,
    lineItems,
    performedBy: performedBy ?? 'system',
  };

  const result: RfqWritebackResult = await writeBackToSpecForgeService(writebackParams);

  return {
    success: result.success,
    skipped: result.skipped,
    errors: result.errors.map((e) => `Failed to update ${e.specItemId}: ${e.error}`),
  };
}

// ─── writeProjectPassportRecord ──────────────────────────────────────────────

/**
 * Writes a ProjectRecord to the Project Passport on each RFQ status transition.
 * Records the RFQ number, title, current stage, awarded supplier (if applicable),
 * total quoted value (if applicable), and transition timestamp.
 *
 * Validates: Requirement 8.3
 */
export async function writeProjectPassportRecord(
  projectId: string,
  record: RfqProjectRecord
): Promise<{ success: boolean }> {
  const recordId = generateId('ppr');

  const projectRecord = {
    id: recordId,
    recordType: 'quote_comparison',
    moduleKey: 'procurement',
    phase: 'tender_procurement',
    rfqId: record.rfqId,
    rfqNumber: record.rfqNumber,
    rfqTitle: record.rfqTitle,
    stage: record.stage,
    awardedSupplier: record.awardedSupplier ?? null,
    totalQuotedValue: record.totalQuotedValue ?? null,
    transitionTimestamp: record.transitionTimestamp,
    createdAt: new Date().toISOString(),
  };

  const docRef = getDemoDoc(
    'projects', projectId,
    'passport', 'records',
    recordId, 'data'
  );
  await setDoc(docRef, projectRecord);

  return { success: true };
}

// ─── emitWorkflowEvent ───────────────────────────────────────────────────────

/**
 * Emits a WorkflowEvent to the Action Centre inbox.
 * Used for:
 * - Deadline reminders (48h before deadline, quotes unreviewed)
 * - Pending approval reminders (24h overdue)
 * - Zero-quote alerts (deadline passed with no responses)
 *
 * Validates: Requirement 8.4
 */
export async function emitWorkflowEvent(
  event: RfqWorkflowEvent
): Promise<{ success: boolean }> {
  const eventId = generateId('wfe');

  const workflowEvent = {
    id: eventId,
    rfqId: event.rfqId,
    projectId: event.projectId,
    eventType: event.eventType,
    targetRoles: event.targetRoles,
    message: event.message,
    actionUrl: event.actionUrl,
    createdAt: event.createdAt,
    read: false,
    dismissed: false,
  };

  const docRef = getDemoDoc(
    'projects', event.projectId,
    'actionCentre', 'events',
    eventId, 'data'
  );
  await setDoc(docRef, workflowEvent);

  return { success: true };
}

// ─── logAuditEvent ───────────────────────────────────────────────────────────

/**
 * Logs an immutable RFQ state transition to the audit trail.
 * All state transitions, approvals, recommendations, and integration events
 * are recorded at projects/{pid}/rfqs/{rfqId}/audit/{eventId}.
 *
 * Validates: Requirement 8.3 (audit trail aspect)
 */
export async function logAuditEvent(params: {
  projectId: string;
  rfqId: string;
  action: string;
  performedBy: string;
  details: Record<string, unknown>;
  timestamp: string;
}): Promise<{ success: boolean }> {
  const { projectId, rfqId, action, performedBy, details, timestamp } = params;
  const eventId = generateId('aud');

  const auditRecord = {
    id: eventId,
    rfqId,
    action,
    performedBy,
    details,
    timestamp,
    immutable: true,
    createdAt: new Date().toISOString(),
  };

  const docRef = getDemoDoc(
    'projects', projectId,
    'rfqs', rfqId,
    'audit', eventId
  );
  await setDoc(docRef, auditRecord);

  return { success: true };
}

// ─── getProcurementStatus ────────────────────────────────────────────────────

/**
 * Reads the current ProcurementStatus for a SpecForge-linked specification item.
 * Enables the bidirectional link: SpecForge workspace displays the current
 * procurement lifecycle stage for each linked item.
 *
 * Reads from `projects/{projectId}/specProcurement` — the correct SpecForge
 * procurement collection. NEVER reads from the legacy path
 * `projects/{projectId}/specforge/entries/{id}/data`.
 *
 * Validates: Requirement 8.5, 8.8
 */
export async function getProcurementStatus(
  projectId: string,
  specForgeItemId: string
): Promise<ProcurementStatus | null> {
  // Query specProcurement collection for entries matching this spec item
  const procurementCol = adminDb
    .collection('projects')
    .doc(projectId)
    .collection('specProcurement');

  const snapshot = await procurementCol
    .where('itemId', '==', specForgeItemId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const data = snapshot.docs[0].data();
  return (data.status as ProcurementStatus) ?? null;
}

// ─── getPackageScopeLink ─────────────────────────────────────────────────────

/**
 * Returns the Package_Scope title and ID from an RFQ document.
 * Maintains the bidirectional link: RFQ detail view displays the originating
 * Package_Scope title and ID.
 *
 * Validates: Requirement 8.5
 */
export async function getPackageScopeLink(
  projectId: string,
  rfqId: string
): Promise<{ packageScopeId: string; packageScopeTitle: string } | null> {
  const rfqRef = getDemoDoc('projects', projectId, 'rfqs', rfqId);
  const snapshot = await getDoc(rfqRef);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  if (!data.packageScopeId || !data.packageScopeTitle) {
    return null;
  }

  return {
    packageScopeId: data.packageScopeId as string,
    packageScopeTitle: data.packageScopeTitle as string,
  };
}
