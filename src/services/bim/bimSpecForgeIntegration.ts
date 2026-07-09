/**
 * BIM SpecForge Integration Service
 *
 * Orchestrates the full SpecForge sync flow:
 * 1. Fetch BoQ → create spec items → store links → return results
 * 2. Fetch current BoQ → fetch previous links → compare → flag user overrides → return comparison
 * 3. Detect model supersession for procurement packages
 * 4. Record procurement issuance events in audit trail
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.5, 9.6
 */

import { createSpecForgeItems, compareExtractions } from './bimSpecForgeAdapter';
import { emitAuditEvent, getDocumentRecord, getActiveDocuments } from './bimIntegrationService';
import type {
  BoqDocument,
  BoqSpecForgeLink,
  ExtractionComparison,
  ProcurementPackage,
} from './types';

// ─── In-memory SpecForge link storage ─────────────────────────────────────
// In production, stored in Firestore at projects/{projectId}/bimSpecForgeLinks/{linkId}

const specForgeLinksByBoqId = new Map<string, BoqSpecForgeLink[]>();

// In-memory BoQ store (in production: Firestore at projects/{projectId}/bimBoqs/{boqId})
const boqStore = new Map<string, BoqDocument>();

// In-memory procurement issuance events
export interface ProcurementIssuanceEvent {
  packageId: string;
  projectId: string;
  recipientCount: number;
  issuedAt: string;
  issuedBy: string;
}

const procurementIssuanceEvents: ProcurementIssuanceEvent[] = [];

// ─── BoQ Store Management ─────────────────────────────────────────────────

/**
 * Stores a BoQ document for later retrieval during sync/compare operations.
 */
export function storeBoq(boq: BoqDocument): void {
  boqStore.set(boq.boqId, boq);
}

/**
 * Retrieves a BoQ document by ID.
 */
export function getBoq(boqId: string): BoqDocument | undefined {
  return boqStore.get(boqId);
}

// ─── SpecForge Sync ───────────────────────────────────────────────────────

export interface SpecForgeSyncResult {
  boqId: string;
  workspaceId: string;
  linksCreated: number;
  links: BoqSpecForgeLink[];
  sectionsCreated: string[];
}

/**
 * Orchestrates the full SpecForge sync flow:
 * 1. Fetches the BoQ by ID
 * 2. Creates SpecForge spec items from BoQ line items (one per line item)
 * 3. Creates sections in SpecForge if missing (identified by unique trade sections)
 * 4. Stores BoqSpecForgeLink records for future comparison
 * 5. Emits audit event
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4
 *
 * @param boqId - The BoQ document to sync
 * @param workspaceId - The SpecForge workspace to sync into
 * @param actorUid - The user performing the sync
 * @returns Sync result with created links and section info
 * @throws Error if BoQ not found
 */
export function syncSpecForge(
  boqId: string,
  workspaceId: string,
  actorUid: string,
): SpecForgeSyncResult {
  // 1. Fetch the BoQ
  const boq = boqStore.get(boqId);
  if (!boq) {
    throw new Error(`BoQ "${boqId}" not found.`);
  }

  // 2. Create SpecForge items (delegates to adapter)
  const links = createSpecForgeItems(boq, workspaceId);

  // 3. Identify sections that would need creation in SpecForge
  // (unique trade sections from the BoQ that represent new SpecForge sections)
  const sectionsCreated = [...new Set(boq.sections.map((s) => s.tradeSection))];

  // 4. Store links for future comparison
  specForgeLinksByBoqId.set(boqId, links);

  // 5. Emit audit event
  emitAuditEvent('bim_boq_generated', actorUid, boqId, boq.projectId, {
    subAction: 'specforge_sync',
    workspaceId,
    linksCreated: links.length,
    sectionsCreated,
  });

  return {
    boqId,
    workspaceId,
    linksCreated: links.length,
    links,
    sectionsCreated,
  };
}

// ─── SpecForge Comparison ─────────────────────────────────────────────────

export interface SpecForgeComparisonResult {
  boqId: string;
  comparison: ExtractionComparison;
  userOverriddenItems: BoqSpecForgeLink[];
  hasPreviousLinks: boolean;
}

/**
 * Orchestrates the comparison flow:
 * 1. Fetches the current BoQ
 * 2. Fetches previous SpecForge links for this BoQ (or its predecessor)
 * 3. Compares current BoQ against previously linked items
 * 4. Flags user-edited SpecForge items (userOverridden=true) without overwriting
 * 5. Returns the ExtractionComparison with discrepancy flags
 *
 * Requirements: 8.5, 8.6
 *
 * @param boqId - The current BoQ to compare
 * @returns Comparison result with user override flags
 * @throws Error if BoQ not found
 */
export function compareSpecForge(boqId: string): SpecForgeComparisonResult {
  // 1. Fetch the current BoQ
  const boq = boqStore.get(boqId);
  if (!boq) {
    throw new Error(`BoQ "${boqId}" not found.`);
  }

  // 2. Fetch previous links — first check direct match, then check by extractionId
  let previousLinks = specForgeLinksByBoqId.get(boqId) || [];

  // If no direct match, look for links from any BoQ in the same project
  if (previousLinks.length === 0) {
    for (const [, links] of specForgeLinksByBoqId) {
      if (links.length > 0 && links[0].extractionId !== boq.extractionId) {
        previousLinks = links;
        break;
      }
    }
  }

  if (previousLinks.length === 0) {
    // No previous links exist — return empty comparison
    return {
      boqId,
      comparison: {
        previousExtractionId: '',
        currentExtractionId: boq.extractionId,
        added: [],
        removed: [],
        changed: [],
      },
      userOverriddenItems: [],
      hasPreviousLinks: false,
    };
  }

  // 3. Identify user-overridden items (Requirement 8.6)
  const userOverriddenItems = previousLinks.filter((link) => link.userOverridden);

  // 4. Compare current BoQ against previous links
  const comparison = compareExtractions(boq, previousLinks);

  return {
    boqId,
    comparison,
    userOverriddenItems,
    hasPreviousLinks: true,
  };
}

// ─── Model Supersession Detection for Procurement ─────────────────────────

export interface ModelSupersessionWarning {
  isSuperseded: boolean;
  currentModelId?: string;
  supersededModelId?: string;
  message?: string;
}

/**
 * Checks if the source model for a procurement package has been superseded
 * by a newer upload. Returns a warning when outdated.
 *
 * Requirement 9.6: Display warning when procurement package references
 * superseded model.
 *
 * @param pkg - The procurement package to check
 * @returns Warning details if the model is superseded
 */
export function checkModelSupersession(pkg: ProcurementPackage): ModelSupersessionWarning {
  // Look up the BoQ to find its source extraction and file
  const boq = boqStore.get(pkg.boqId);
  if (!boq) {
    return { isSuperseded: false };
  }

  // Check the document register for the source model's status
  // The extractionId encodes the file reference — look for active docs in the same project
  const activeDocuments = getActiveDocuments(boq.projectId);
  const sourceDocument = getDocumentRecord(boq.extractionId);

  // If there's a source document and it's been superseded
  if (sourceDocument && sourceDocument.status === 'superseded') {
    // Find what superseded it
    const newerModel = activeDocuments.find(
      (doc) => doc.documentId === sourceDocument.supersededBy,
    );

    return {
      isSuperseded: true,
      currentModelId: newerModel?.documentId,
      supersededModelId: sourceDocument.documentId,
      message: `Quantities may be outdated. Source model "${sourceDocument.fileName}" has been superseded${newerModel ? ` by "${newerModel.fileName}"` : ''}. Consider re-extracting from the latest model.`,
    };
  }

  // Also check if the project has newer active documents than what the BoQ references
  // This handles cases where the document was uploaded after the BoQ was generated
  if (activeDocuments.length > 0 && sourceDocument) {
    const sourceDate = new Date(sourceDocument.createdAt).getTime();
    const newerDocs = activeDocuments.filter(
      (doc) => new Date(doc.createdAt).getTime() > sourceDate && doc.documentId !== sourceDocument.documentId,
    );

    if (newerDocs.length > 0) {
      return {
        isSuperseded: true,
        currentModelId: newerDocs[0].documentId,
        supersededModelId: sourceDocument.documentId,
        message: `A newer model version exists for this project. The procurement package references an older extraction. Consider re-extracting from the latest model.`,
      };
    }
  }

  return { isSuperseded: false };
}

// ─── Procurement Issuance ─────────────────────────────────────────────────

export interface ProcurementIssuanceResult {
  packageId: string;
  issuedAt: string;
  recipientCount: number;
  auditRecorded: boolean;
  supersessionWarning?: ModelSupersessionWarning;
}

/**
 * Records a procurement package issuance event in the audit trail.
 * Also checks for model supersession and returns a warning if applicable.
 *
 * Requirement 9.5: Record issuance event in audit trail with packageId,
 * recipient count, and timestamp.
 * Requirement 9.6: Display warning when procurement package references
 * superseded model.
 *
 * @param packageId - The procurement package being issued
 * @param projectId - The project context
 * @param recipientCount - Number of recipients
 * @param actorUid - The user issuing the package
 * @param pkg - Optional procurement package for supersession check
 * @returns Issuance result with audit confirmation and optional warning
 */
export function recordProcurementIssuance(
  packageId: string,
  projectId: string,
  recipientCount: number,
  actorUid: string,
  pkg?: ProcurementPackage,
): ProcurementIssuanceResult {
  const issuedAt = new Date().toISOString();

  // Record in audit trail (Requirement 9.5)
  emitAuditEvent('bim_procurement_package_issued', actorUid, packageId, projectId, {
    recipientCount,
    issuedAt,
  });

  // Store issuance event
  procurementIssuanceEvents.push({
    packageId,
    projectId,
    recipientCount,
    issuedAt,
    issuedBy: actorUid,
  });

  // Check model supersession (Requirement 9.6)
  let supersessionWarning: ModelSupersessionWarning | undefined;
  if (pkg) {
    supersessionWarning = checkModelSupersession(pkg);
    if (supersessionWarning.isSuperseded) {
      // Mark the package as referencing a superseded model
      pkg.modelSuperseded = true;
    }
  }

  return {
    packageId,
    issuedAt,
    recipientCount,
    auditRecorded: true,
    supersessionWarning: supersessionWarning?.isSuperseded ? supersessionWarning : undefined,
  };
}

// ─── Link Management ──────────────────────────────────────────────────────

/**
 * Retrieves stored SpecForge links for a given BoQ.
 */
export function getSpecForgeLinks(boqId: string): BoqSpecForgeLink[] {
  return specForgeLinksByBoqId.get(boqId) || [];
}

/**
 * Stores SpecForge links (used when importing existing links or for testing).
 */
export function storeSpecForgeLinks(boqId: string, links: BoqSpecForgeLink[]): void {
  specForgeLinksByBoqId.set(boqId, links);
}

/**
 * Marks a specific link as user-overridden (when a user manually edits
 * the SpecForge item's quantity).
 *
 * Requirement 8.6: Flag discrepancy without overwriting user edit.
 */
export function markLinkAsUserOverridden(
  boqId: string,
  boqLineItemId: string,
  newQuantity?: number,
): boolean {
  const links = specForgeLinksByBoqId.get(boqId);
  if (!links) return false;

  const link = links.find((l) => l.boqLineItemId === boqLineItemId);
  if (!link) return false;

  link.userOverridden = true;
  if (newQuantity !== undefined) {
    link.currentModelQuantity = newQuantity;
  }

  return true;
}

// ─── Query Helpers ────────────────────────────────────────────────────────

/** Returns all stored procurement issuance events (for testing/audit queries). */
export function getProcurementIssuanceEvents(): ProcurementIssuanceEvent[] {
  return [...procurementIssuanceEvents];
}

/** Clears all in-memory stores (for testing). */
export function clearSpecForgeIntegrationState(): void {
  specForgeLinksByBoqId.clear();
  boqStore.clear();
  procurementIssuanceEvents.length = 0;
}
