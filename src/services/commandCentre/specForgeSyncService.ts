/**
 * Project Command Centre — SpecForge Bidirectional Sync Service
 *
 * Links Command Centre entities to SpecForge items for bidirectional
 * traceability. Persists links at `projects/{projectId}/specforge_links/`.
 *
 * @module commandCentre/specForgeSyncService
 */

import {
  getDocs,
  addDoc,
  query,
  where,
  updateDoc,
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firebase';
import { getDemoCol } from '@/demo-seed/demoFirestore';
import type { SpecForgeLink } from '@/services/commandCentre/types';

// ── Collection Constants ─────────────────────────────────────────────────────

const PROJECTS_COL = 'projects';
const SPECFORGE_LINKS_COL = 'specforge_links';

// ── Firestore Path Helpers ───────────────────────────────────────────────────

function linksCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol(PROJECTS_COL, projectId, SPECFORGE_LINKS_COL);
}

// ── Link Management ──────────────────────────────────────────────────────────

/**
 * Links a Command Centre entity (task, procurement_order, or activity) to a
 * SpecForge specification item. Creates a bidirectional link record.
 */
export async function linkToSpecForgeItem(
  projectId: string,
  entityType: SpecForgeLink['linkedEntityType'],
  entityId: string,
  specForgeItemId: string,
  itemTitle: string,
  itemStatus: string,
): Promise<SpecForgeLink> {
  const link: SpecForgeLink = {
    specForgeItemId,
    itemTitle,
    itemStatus,
    linkedEntityType: entityType,
    linkedEntityId: entityId,
  };

  try {
    await addDoc(linksCollection(projectId), {
      ...link,
      projectId,
      createdAt: new Date().toISOString(),
    });
    return link;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${SPECFORGE_LINKS_COL}`);
    throw error;
  }
}

/**
 * Retrieves all SpecForge links for a given entity type and ID.
 */
export async function getLinkedSpecForgeItems(
  projectId: string,
  entityType: SpecForgeLink['linkedEntityType'],
  entityId: string,
): Promise<SpecForgeLink[]> {
  try {
    const q = query(
      linksCollection(projectId),
      where('linkedEntityType', '==', entityType),
      where('linkedEntityId', '==', entityId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as SpecForgeLink);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${SPECFORGE_LINKS_COL}`);
    return [];
  }
}

/**
 * Handles SpecForge item status changes by updating all linked entities'
 * link records with the new status.
 */
export async function onSpecForgeStatusChange(
  projectId: string,
  specForgeItemId: string,
  newStatus: string,
): Promise<number> {
  try {
    const q = query(
      linksCollection(projectId),
      where('specForgeItemId', '==', specForgeItemId),
    );
    const snap = await getDocs(q);

    let updatedCount = 0;
    for (const docSnap of snap.docs) {
      await updateDoc(docSnap.ref, { itemStatus: newStatus, updatedAt: new Date().toISOString() });
      updatedCount++;
    }

    return updatedCount;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${SPECFORGE_LINKS_COL}`);
    return 0;
  }
}

/**
 * Inherits a SpecForge reference onto a procurement order, linking the
 * specification details (reference and material info) to the order.
 */
export async function inheritSpecForgeReference(
  projectId: string,
  procurementOrderId: string,
  specForgeItemId: string,
  itemTitle: string,
  itemStatus: string,
): Promise<SpecForgeLink> {
  return linkToSpecForgeItem(
    projectId,
    'procurement_order',
    procurementOrderId,
    specForgeItemId,
    itemTitle,
    itemStatus,
  );
}

// ── Service Export ───────────────────────────────────────────────────────────

export const specForgeSyncService = {
  linkToSpecForgeItem,
  getLinkedSpecForgeItems,
  onSpecForgeStatusChange,
  inheritSpecForgeReference,
};

export default specForgeSyncService;
