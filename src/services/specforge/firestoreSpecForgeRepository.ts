/**
 * FirestoreSpecForgeRepository — Production persistence implementation.
 *
 * Implements SpecForgeRepository using Firebase Admin SDK (Firestore).
 * All write methods validate input against Zod schemas before persisting.
 *
 * Subcollections live under `projects/{projectId}/`:
 *   - specWorkspaces/{workspaceId}
 *   - specItems/{itemId}
 *   - specSections/{sectionId}
 *   - specSnapshots/{snapshotId}
 *   - specAuditEvents/{eventId}
 *   - specApprovals/{approvalId}
 *   - specSubstitutions/{subId}
 *   - specProcurement/{entryId}
 *
 * Requirements: 1.1–1.10, 2.1–2.7, 3.1–3.8
 */

import { adminDb } from '@/lib/firebase-admin';
import type { SpecForgeRepository } from './specforgeRepository';
import type {
  SpecForgeWorkspace,
  SpecItem,
  SpecSection,
  SpecIssueSnapshot,
  SpecAuditEvent,
  SpecProcurementEntry,
  SpecApproval,
  SpecSubstitution,
} from '@/types/specforgeTypes';
import {
  specWorkspaceSchema,
  specItemSchema,
  specItemUpdateSchema,
  specSectionSchema,
  specSectionUpdateSchema,
  specIssueSnapshotSchema,
  specAuditEventSchema,
  specApprovalSchema,
  specSubstitutionSchema,
  specProcurementEntryUpdateSchema,
} from './specforgeSchemas';
import { SpecForgeValidationError, SpecForgeNotFoundError, SpecForgeImmutableError } from './specforgeErrors';

export class FirestoreSpecForgeRepository implements SpecForgeRepository {
  // ── Helper ──────────────────────────────────────────────────────────────

  /**
   * Returns a Firestore CollectionReference for a subcollection under the project.
   */
  private col(projectId: string, subcol: string) {
    return adminDb.collection('projects').doc(projectId).collection(subcol);
  }

  // ── Workspace ───────────────────────────────────────────────────────────

  async getWorkspace(projectId: string): Promise<SpecForgeWorkspace | null> {
    const snapshot = await this.col(projectId, 'specWorkspaces').limit(1).get();
    if (snapshot.empty) return null;
    return snapshot.docs[0].data() as SpecForgeWorkspace;
  }

  async saveWorkspace(workspace: SpecForgeWorkspace): Promise<void> {
    const result = specWorkspaceSchema.safeParse(workspace);
    if (!result.success) {
      throw new SpecForgeValidationError(result.error.issues);
    }
    await this.col(workspace.projectId, 'specWorkspaces')
      .doc(workspace.id)
      .set(result.data, { merge: true });
  }

  // ── Items ───────────────────────────────────────────────────────────────

  async addItem(projectId: string, item: SpecItem): Promise<void> {
    const result = specItemSchema.safeParse(item);
    if (!result.success) {
      throw new SpecForgeValidationError(result.error.issues);
    }
    await this.col(projectId, 'specItems').doc(item.id).set(result.data);
  }

  async updateItem(projectId: string, itemId: string, updates: Partial<SpecItem>): Promise<void> {
    const result = specItemUpdateSchema.safeParse(updates);
    if (!result.success) {
      throw new SpecForgeValidationError(result.error.issues);
    }

    const docRef = this.col(projectId, 'specItems').doc(itemId);
    const doc = await docRef.get();
    if (!doc.exists) {
      throw new SpecForgeNotFoundError('SpecItem', itemId);
    }

    await docRef.update(result.data);
  }

  async deleteItem(projectId: string, itemId: string): Promise<void> {
    const docRef = this.col(projectId, 'specItems').doc(itemId);
    const doc = await docRef.get();
    if (!doc.exists) {
      throw new SpecForgeNotFoundError('SpecItem', itemId);
    }

    await docRef.delete();
  }

  // ── Sections ────────────────────────────────────────────────────────────

  async addSection(projectId: string, section: SpecSection): Promise<void> {
    const result = specSectionSchema.safeParse(section);
    if (!result.success) {
      throw new SpecForgeValidationError(result.error.issues);
    }
    await this.col(projectId, 'specSections').doc(section.id).set(result.data);
  }

  async updateSection(projectId: string, sectionId: string, updates: Partial<SpecSection>): Promise<void> {
    const result = specSectionUpdateSchema.safeParse(updates);
    if (!result.success) {
      throw new SpecForgeValidationError(result.error.issues);
    }

    const docRef = this.col(projectId, 'specSections').doc(sectionId);
    const doc = await docRef.get();
    if (!doc.exists) {
      throw new SpecForgeNotFoundError('SpecSection', sectionId);
    }

    await docRef.update(result.data);
  }

  // ── Snapshots (immutable, write-once) ────────────────────────────────────

  async saveSnapshot(snapshot: SpecIssueSnapshot): Promise<void> {
    const result = specIssueSnapshotSchema.safeParse(snapshot);
    if (!result.success) {
      throw new SpecForgeValidationError(result.error.issues);
    }

    try {
      await this.col(snapshot.projectId, 'specSnapshots')
        .doc(snapshot.snapshotId)
        .create(result.data);
    } catch (err: unknown) {
      // Firestore create() throws code 6 (ALREADY_EXISTS) if document exists
      if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 6) {
        throw new SpecForgeImmutableError(
          `Snapshot ${snapshot.snapshotId} already exists and cannot be overwritten`
        );
      }
      throw err;
    }
  }

  /** Snapshots are immutable — no update or delete methods are exposed. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private updateSnapshot(_projectId: string, _snapshotId: string, _updates: unknown): never {
    throw new SpecForgeImmutableError('SpecIssueSnapshot');
  }

  /** Snapshots are immutable — no update or delete methods are exposed. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private deleteSnapshot(_projectId: string, _snapshotId: string): never {
    throw new SpecForgeImmutableError('SpecIssueSnapshot');
  }

  async getSnapshots(projectId: string): Promise<SpecIssueSnapshot[]> {
    const snapshot = await this.col(projectId, 'specSnapshots')
      .orderBy('issuedAt', 'desc')
      .limit(500)
      .get();
    return snapshot.docs.map((doc) => doc.data() as SpecIssueSnapshot);
  }

  // ── Audit (immutable, append-only) ───────────────────────────────────────

  async logAuditEvent(event: SpecAuditEvent): Promise<void> {
    const result = specAuditEventSchema.safeParse(event);
    if (!result.success) {
      throw new SpecForgeValidationError(result.error.issues);
    }

    // Use create() for append-only semantics — no overwrites possible
    await this.col(event.workspaceId, 'specAuditEvents')
      .doc(event.id)
      .create(result.data);
  }

  /** Audit events are append-only — no update method is exposed. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private updateAuditEvent(_projectId: string, _eventId: string, _updates: unknown): never {
    throw new SpecForgeImmutableError('SpecAuditEvent');
  }

  /** Audit events are append-only — no delete method is exposed. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private deleteAuditEvent(_projectId: string, _eventId: string): never {
    throw new SpecForgeImmutableError('SpecAuditEvent');
  }

  async getAuditEvents(projectId: string, limit?: number): Promise<SpecAuditEvent[]> {
    const effectiveLimit = Math.min(Math.max(limit || 50, 1), 500);
    const snapshot = await this.col(projectId, 'specAuditEvents')
      .orderBy('performedAt', 'desc')
      .limit(effectiveLimit)
      .get();
    return snapshot.docs.map((doc) => doc.data() as SpecAuditEvent);
  }

  // ── Procurement ──────────────────────────────────────────────────────────

  async getProcurementEntries(projectId: string): Promise<SpecProcurementEntry[]> {
    const snapshot = await this.col(projectId, 'specProcurement').get();
    return snapshot.docs.map((doc) => doc.data() as SpecProcurementEntry);
  }

  async updateProcurementEntry(projectId: string, entryId: string, updates: Partial<SpecProcurementEntry>): Promise<void> {
    const result = specProcurementEntryUpdateSchema.safeParse(updates);
    if (!result.success) {
      throw new SpecForgeValidationError(result.error.issues);
    }

    const docRef = this.col(projectId, 'specProcurement').doc(entryId);
    const doc = await docRef.get();
    if (!doc.exists) {
      throw new SpecForgeNotFoundError('SpecProcurementEntry', entryId);
    }

    await docRef.update(result.data);
  }

  // ── Approvals ──────────────────────────────────────────────────────────

  async saveApproval(projectId: string, approval: SpecApproval): Promise<void> {
    const result = specApprovalSchema.safeParse(approval);
    if (!result.success) {
      throw new SpecForgeValidationError(result.error.issues);
    }
    await this.col(projectId, 'specApprovals').doc(approval.id).set(result.data);
  }

  async getApprovals(projectId: string): Promise<SpecApproval[]> {
    const snapshot = await this.col(projectId, 'specApprovals')
      .orderBy('requestedAt', 'desc')
      .get();
    return snapshot.docs.map((doc) => doc.data() as SpecApproval);
  }

  // ── Substitutions ──────────────────────────────────────────────────────

  async saveSubstitution(projectId: string, substitution: SpecSubstitution): Promise<void> {
    const result = specSubstitutionSchema.safeParse(substitution);
    if (!result.success) {
      throw new SpecForgeValidationError(result.error.issues);
    }
    await this.col(projectId, 'specSubstitutions').doc(substitution.id).set(result.data);
  }

  async getSubstitutions(projectId: string): Promise<SpecSubstitution[]> {
    const snapshot = await this.col(projectId, 'specSubstitutions')
      .orderBy('requestedAt', 'desc')
      .get();
    return snapshot.docs.map((doc) => doc.data() as SpecSubstitution);
  }
}
