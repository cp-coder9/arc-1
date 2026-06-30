/**
 * Firestore SpecForge Repository — PLACEHOLDER
 * 
 * This file documents the intended Firestore collection structure for SpecForge.
 * When wired to live Firestore, implement SpecForgeRepository interface using:
 * 
 * Collections:
 *   projects/{projectId}/specWorkspaces/{workspaceId}
 *   projects/{projectId}/specSections/{sectionId}
 *   projects/{projectId}/specItems/{itemId}
 *   projects/{projectId}/specIssues/{issueId}
 *   projects/{projectId}/specApprovals/{approvalId}
 *   projects/{projectId}/specSubstitutions/{substitutionId}
 *   projects/{projectId}/specAuditEvents/{eventId}
 *   projects/{projectId}/specProcurement/{entryId}
 *   projects/{projectId}/specSnapshots/{snapshotId}
 * 
 * Security rules:
 *   - Only ownerRole can write spec items/sections
 *   - Issued snapshots are write-once (no updates/deletes)
 *   - Suppliers/subcontractors can only read items in their assigned package/section
 *   - Audit events are append-only
 *   - Client can only write approval decisions on clientDecision items
 * 
 * TODO: Implement FirestoreSpecForgeRepository using Firebase Admin SDK
 *       following the same interface as LocalSpecForgeRepository.
 */

export const SPECFORGE_FIRESTORE_COLLECTIONS = {
  workspaces: 'specWorkspaces',
  sections: 'specSections',
  items: 'specItems',
  issues: 'specIssues',
  approvals: 'specApprovals',
  substitutions: 'specSubstitutions',
  auditEvents: 'specAuditEvents',
  procurement: 'specProcurement',
  snapshots: 'specSnapshots',
} as const;

// Placeholder — implement when wiring to live Firestore
export class FirestoreSpecForgeRepository {
  // TODO: implement SpecForgeRepository interface
}
