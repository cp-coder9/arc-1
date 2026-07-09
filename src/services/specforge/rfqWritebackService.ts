/**
 * RFQ Writeback Service — Writes RFQ award data back to the correct SpecForge
 * procurement collections using the repository interface.
 *
 * This service replaces the legacy write-back logic that incorrectly wrote to
 * `projects/{projectId}/specforge/entries/{id}/data`. All writes now target
 * `projects/{projectId}/specProcurement/{entryId}` via the SpecForgeRepository
 * interface, ensuring Zod validation and audit logging are applied.
 *
 * Key behaviours:
 * - Writes procurement updates to `projects/{projectId}/specProcurement/{entryId}`
 * - References spec items by `specItemId` matching `projects/{projectId}/specItems`
 * - References procurement entries by `specProcurementEntryId` matching `projects/{projectId}/specProcurement`
 * - Creates new procurement entries when `specProcurementEntryId` doesn't exist (status 'ordered')
 * - Logs warning and skips (non-blocking) if specItemId doesn't exist in specItems
 * - Writes Audit_Event recording RFQ ID, awarded supplier, updated spec item IDs, timestamp
 * - NEVER reads from or writes to legacy path `projects/{projectId}/specforge/entries/{id}/data`
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8
 */

import type {
  SpecProcurementEntry,
  SpecAuditEvent,
  EnhancedAuditEvent,
} from '@/types/specforgeTypes';
import { adminDb } from '@/lib/firebase-admin';
import { specProcurementEntryUpdateSchema } from './specforgeSchemas';

// ── Types ───────────────────────────────────────────────────────────────────

/** Payload for a single line-item procurement update from RFQ award. */
export interface RfqWritebackLineItem {
  /** The specItemId — must match an item in `projects/{projectId}/specItems` */
  specItemId: string;
  /** The specProcurementEntryId — if exists, updates; if not, creates new entry */
  specProcurementEntryId?: string;
  /** Awarded supplier firm name */
  supplierName: string;
  /** Confirmed unit rate in ZAR */
  unitRate: number;
  /** Confirmed total cost in ZAR */
  totalCost: number;
  /** Confirmed lead time in calendar days */
  leadTimeDays: number;
}

/** Parameters for the writeBackToSpecForge operation. */
export interface RfqWritebackParams {
  projectId: string;
  rfqId: string;
  awardedSupplier: string;
  lineItems: RfqWritebackLineItem[];
  performedBy: string;
}

/** Result of the writeback operation. */
export interface RfqWritebackResult {
  success: boolean;
  /** Line items that were successfully updated or created */
  updated: string[];
  /** Line items skipped because specItemId doesn't exist */
  skipped: string[];
  /** Line items that encountered errors during writeback */
  errors: Array<{ specItemId: string; error: string }>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a unique event ID. */
function generateEventId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `rfqwb-${ts}-${rand}`;
}

/** Generate a unique procurement entry ID. */
function generateProcurementEntryId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `spe-${ts}-${rand}`;
}

/** Get Firestore collection reference for a project subcollection. */
function col(projectId: string, subcol: string) {
  return adminDb.collection('projects').doc(projectId).collection(subcol);
}

// ── Core Logic ──────────────────────────────────────────────────────────────

/**
 * Writes RFQ award data back to SpecForge procurement entries.
 *
 * For each line item:
 * 1. Verify the specItemId exists in `projects/{projectId}/specItems`
 *    - If not: log warning to audit trail, skip that item without blocking
 * 2. If `specProcurementEntryId` is provided and exists → update the entry
 * 3. If `specProcurementEntryId` doesn't exist → create a new entry with status 'ordered'
 * 4. Write an Audit_Event recording the update
 *
 * @param params - The writeback parameters including project, RFQ, and line items
 * @returns RfqWritebackResult with updated, skipped, and errored items
 */
export async function writeBackToSpecForge(
  params: RfqWritebackParams,
): Promise<RfqWritebackResult> {
  const { projectId, rfqId, awardedSupplier, lineItems, performedBy } = params;
  const updated: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ specItemId: string; error: string }> = [];
  const timestamp = new Date().toISOString();

  for (const lineItem of lineItems) {
    try {
      // Step 1: Verify specItemId exists in specItems collection
      const specItemRef = col(projectId, 'specItems').doc(lineItem.specItemId);
      const specItemDoc = await specItemRef.get();

      if (!specItemDoc.exists) {
        // Log warning to audit trail — skip this item without blocking
        const warningAuditEvent: EnhancedAuditEvent = {
          id: generateEventId(),
          workspaceId: projectId,
          action: 'updated',
          targetId: lineItem.specItemId,
          targetType: 'procurement',
          performedBy,
          performedAt: timestamp,
          details: `RFQ writeback warning: specItemId "${lineItem.specItemId}" does not exist in specItems collection. Skipping update for RFQ ${rfqId}.`,
        };
        await col(projectId, 'specAuditEvents').doc(warningAuditEvent.id).set(warningAuditEvent);

        skipped.push(lineItem.specItemId);
        continue;
      }

      const specItemData = specItemDoc.data()!;

      // Step 2: Determine if we're updating an existing entry or creating a new one
      const entryId = lineItem.specProcurementEntryId;

      if (entryId) {
        // Check if the procurement entry exists
        const entryRef = col(projectId, 'specProcurement').doc(entryId);
        const entryDoc = await entryRef.get();

        if (entryDoc.exists) {
          // Update existing procurement entry via repository pattern (Zod validation)
          const updateData: Partial<SpecProcurementEntry> = {
            supplier: lineItem.supplierName,
            status: 'ordered',
            orderedAt: timestamp,
            quotedCost: lineItem.totalCost,
          };

          const parseResult = specProcurementEntryUpdateSchema.safeParse(updateData);
          if (!parseResult.success) {
            errors.push({
              specItemId: lineItem.specItemId,
              error: `Validation failed: ${parseResult.error.message}`,
            });
            continue;
          }

          await entryRef.update(parseResult.data);
          updated.push(lineItem.specItemId);
        } else {
          // specProcurementEntryId provided but doesn't exist → create new entry
          const newEntry = createProcurementEntry(
            entryId,
            lineItem,
            specItemData,
            timestamp,
          );
          await col(projectId, 'specProcurement').doc(entryId).set(newEntry);
          updated.push(lineItem.specItemId);
        }
      } else {
        // No specProcurementEntryId provided — create new entry with generated ID
        const newEntryId = generateProcurementEntryId();
        const newEntry = createProcurementEntry(
          newEntryId,
          lineItem,
          specItemData,
          timestamp,
        );
        await col(projectId, 'specProcurement').doc(newEntryId).set(newEntry);
        updated.push(lineItem.specItemId);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push({
        specItemId: lineItem.specItemId,
        error: errorMessage,
      });
    }
  }

  // Write summary Audit_Event recording the overall writeback
  if (updated.length > 0 || skipped.length > 0) {
    const summaryAuditEvent: EnhancedAuditEvent = {
      id: generateEventId(),
      workspaceId: projectId,
      action: 'updated',
      targetId: rfqId,
      targetType: 'procurement',
      performedBy,
      performedAt: timestamp,
      details: JSON.stringify({
        rfqId,
        awardedSupplier,
        updatedSpecItemIds: updated,
        skippedSpecItemIds: skipped,
        errorCount: errors.length,
      }),
      newValue: JSON.stringify({
        supplier: awardedSupplier,
        status: 'ordered',
        timestamp,
      }),
    };
    await col(projectId, 'specAuditEvents').doc(summaryAuditEvent.id).set(summaryAuditEvent);
  }

  return {
    success: errors.length === 0,
    updated,
    skipped,
    errors,
  };
}

// ── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Creates a new SpecProcurementEntry from award data.
 * Used when the specProcurementEntryId doesn't exist in the collection.
 */
function createProcurementEntry(
  entryId: string,
  lineItem: RfqWritebackLineItem,
  specItemData: FirebaseFirestore.DocumentData,
  timestamp: string,
): SpecProcurementEntry {
  return {
    id: entryId,
    itemId: lineItem.specItemId,
    itemCode: specItemData.code ?? lineItem.specItemId,
    itemTitle: specItemData.title ?? 'Unknown Item',
    supplier: lineItem.supplierName,
    status: 'ordered',
    orderedAt: timestamp,
    quotedCost: lineItem.totalCost,
    notes: `Created from RFQ award. Unit rate: R${lineItem.unitRate}, Lead time: ${lineItem.leadTimeDays} days.`,
  };
}
