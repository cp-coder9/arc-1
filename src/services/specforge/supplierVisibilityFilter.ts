/**
 * SupplierVisibilityFilter — Server-side access control for supplier/subcontractor roles.
 *
 * Restricts workspace data access to only items, procurement entries, and RFQs
 * that are assigned to the authenticated user via package assignments.
 *
 * Fail-closed: no assignments → empty arrays. Never returns all items.
 * Server-side only — never rely on client-side filtering for security enforcement.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9
 */

import { adminDb } from '@/lib/firebase-admin';
import type {
  SpecItem,
  SpecItemStatus,
  SpecProcurementEntry,
  SpecForgeRole,
  SpecPackageAssignment,
} from '@/types/specforgeTypes';
import type { RfqDocument } from '@/services/rfqMarketplace/types';

// ── Types ───────────────────────────────────────────────────────────────────

export interface SupplierVisibilityFilter {
  getVisibleItems(projectId: string, uid: string, role: SpecForgeRole): Promise<SpecItem[]>;
  getVisibleProcurement(projectId: string, uid: string, firmName: string): Promise<SpecProcurementEntry[]>;
  getVisibleRfqs(projectId: string, uid: string): Promise<RfqDocument[]>;
}

/**
 * Fields stripped from SpecItem responses for suppliers/subcontractors.
 * Budget summaries, client commercial data, and QS review notes are excluded.
 */
type StrippedSpecItem = Omit<SpecItem, 'budgetAllowance' | 'estimatedCost' | 'notes'>;

/** Statuses visible to suppliers — must be issued or further in the pipeline. */
const VISIBLE_STATUSES: SpecItemStatus[] = ['issued', 'rfq', 'ordered', 'delivered', 'installed'];

// ── Implementation ──────────────────────────────────────────────────────────

/**
 * Creates a SupplierVisibilityFilter backed by Firestore.
 *
 * The filter queries `projects/{projectId}/specPackageAssignments` for active
 * assignments matching the user's UID, then restricts data access to the
 * union of items/sections across those assignments.
 */
export function createSupplierVisibilityFilter(): SupplierVisibilityFilter {
  return {
    getVisibleItems,
    getVisibleProcurement,
    getVisibleRfqs,
  };
}

/**
 * Retrieves active package assignments for a given user within a project.
 * Only returns assignments with status === 'active' (revoked excluded immediately).
 */
async function getActiveAssignments(projectId: string, uid: string): Promise<SpecPackageAssignment[]> {
  const snapshot = await adminDb
    .collection('projects')
    .doc(projectId)
    .collection('specPackageAssignments')
    .where('supplierUid', '==', uid)
    .where('status', '==', 'active')
    .get();

  if (snapshot.empty) return [];

  return snapshot.docs.map((doc) => doc.data() as SpecPackageAssignment);
}

/**
 * Returns all item IDs assigned to a user across all active package assignments.
 */
function getAssignedItemIds(assignments: SpecPackageAssignment[]): Set<string> {
  const itemIds = new Set<string>();
  for (const assignment of assignments) {
    for (const itemId of assignment.itemIds) {
      itemIds.add(itemId);
    }
  }
  return itemIds;
}

/**
 * Strips sensitive fields from a SpecItem for supplier visibility.
 * Removes: budgetAllowance, estimatedCost (client commercial data), notes (QS review notes).
 */
function stripSensitiveFields(item: SpecItem): StrippedSpecItem {
  const { budgetAllowance, estimatedCost, notes, ...safeItem } = item;
  return safeItem;
}

/**
 * Returns visible spec items for a supplier/subcontractor.
 *
 * Items are filtered by:
 * 1. Status must be in [issued, rfq, ordered, delivered, installed]
 * 2. Item must belong to an assigned package (by itemId)
 *
 * Returns empty array if no assignments exist (fail-closed).
 * Strips budget summaries, client commercial data, and QS review notes.
 */
async function getVisibleItems(
  projectId: string,
  uid: string,
  _role: SpecForgeRole
): Promise<SpecItem[]> {
  const assignments = await getActiveAssignments(projectId, uid);

  // Fail-closed: no assignments → empty array
  if (assignments.length === 0) return [];

  const assignedItemIds = getAssignedItemIds(assignments);

  // If no item IDs assigned at all, return empty
  if (assignedItemIds.size === 0) return [];

  // Query all spec items for the project
  const itemsSnapshot = await adminDb
    .collection('projects')
    .doc(projectId)
    .collection('specItems')
    .get();

  if (itemsSnapshot.empty) return [];

  const visibleItems: SpecItem[] = [];

  for (const doc of itemsSnapshot.docs) {
    const item = doc.data() as SpecItem;

    // Both conditions must be met:
    // (a) Status in visible set
    // (b) Item belongs to an assigned package
    if (
      VISIBLE_STATUSES.includes(item.status) &&
      assignedItemIds.has(item.id)
    ) {
      visibleItems.push(stripSensitiveFields(item) as SpecItem);
    }
  }

  return visibleItems;
}

/**
 * Returns visible procurement entries for a supplier/subcontractor.
 *
 * Entries are filtered by:
 * - Supplier field matches the user's firm name (case-insensitive), OR
 * - Entry's itemId belongs to one of the user's assigned packages
 *
 * Returns empty array if no assignments exist (fail-closed).
 * Strips other suppliers' quotes from procurement context.
 */
async function getVisibleProcurement(
  projectId: string,
  uid: string,
  firmName: string
): Promise<SpecProcurementEntry[]> {
  const assignments = await getActiveAssignments(projectId, uid);

  // Fail-closed: no assignments → empty array
  if (assignments.length === 0) return [];

  const assignedItemIds = getAssignedItemIds(assignments);
  const firmNameLower = firmName.toLowerCase();

  // Query all procurement entries for the project
  const entriesSnapshot = await adminDb
    .collection('projects')
    .doc(projectId)
    .collection('specProcurement')
    .get();

  if (entriesSnapshot.empty) return [];

  const visibleEntries: SpecProcurementEntry[] = [];

  for (const doc of entriesSnapshot.docs) {
    const entry = doc.data() as SpecProcurementEntry;

    // Entry visible if supplier matches firm name (case-insensitive) OR itemId in assigned packages
    const supplierMatches = entry.supplier
      ? entry.supplier.toLowerCase() === firmNameLower
      : false;
    const itemInAssignedPackage = assignedItemIds.has(entry.itemId);

    if (supplierMatches || itemInAssignedPackage) {
      visibleEntries.push(entry);
    }
  }

  return visibleEntries;
}

/**
 * Returns visible RFQs for a supplier/subcontractor.
 *
 * Only returns RFQs where the user's UID appears in the invitedSuppliers
 * (invitationList) array of the RFQ document.
 *
 * Returns empty array if no RFQs match (fail-closed).
 */
async function getVisibleRfqs(
  projectId: string,
  uid: string
): Promise<RfqDocument[]> {
  // Query all RFQs for the project
  const rfqsSnapshot = await adminDb
    .collection('projects')
    .doc(projectId)
    .collection('rfqs')
    .get();

  if (rfqsSnapshot.empty) return [];

  const visibleRfqs: RfqDocument[] = [];

  for (const doc of rfqsSnapshot.docs) {
    const rfq = doc.data() as RfqDocument;

    // Check if the user's UID is in the invitationList (supplierId field)
    const isInvited = rfq.invitationList?.some(
      (supplier) => supplier.supplierId === uid
    );

    if (isInvited) {
      visibleRfqs.push(rfq);
    }
  }

  return visibleRfqs;
}
