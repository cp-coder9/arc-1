/**
 * SourceVersionService — Manage fee table source versions lifecycle.
 *
 * Provides CRUD and status transitions for verified/draft/retired source versions.
 * Used by GuidelineWatchPersistence to create verified versions when candidates are approved.
 */

import type { FirestoreAdapter, QueryFilter } from './runPersistenceService';
import type { Profession } from '../types';
import { id as generateId } from '../ids';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PersistedSourceVersion {
  id: string;
  profession: Profession;
  body: string;
  title: string;
  effectiveDate: string;
  status: 'draft' | 'verified' | 'retired';
  payload: Record<string, unknown>;
  contentHash: string;
  approvedBy?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSourceVersionInput {
  profession: Profession;
  body: string;
  title: string;
  effectiveDate: string;
  payload: Record<string, unknown>;
  createdBy: string;
}

// ---------------------------------------------------------------------------
// SourceVersionService
// ---------------------------------------------------------------------------

export class SourceVersionService {
  private readonly db: FirestoreAdapter;
  private readonly collection = 'fee_source_versions';

  constructor(db: FirestoreAdapter) {
    this.db = db;
  }

  /**
   * Create a new source version in draft status.
   */
  async createSourceVersion(input: CreateSourceVersionInput): Promise<PersistedSourceVersion> {
    const now = new Date().toISOString();
    const version: PersistedSourceVersion = {
      id: generateId('sv'),
      profession: input.profession,
      body: input.body,
      title: input.title,
      effectiveDate: input.effectiveDate,
      status: 'draft',
      payload: input.payload,
      contentHash: this.computeHash(input.payload),
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.set(this.collection, version.id, version as unknown as Record<string, unknown>);
    return version;
  }

  /**
   * Transition a source version's status (draft → verified, verified → retired).
   */
  async transitionStatus(versionId: string, newStatus: 'verified' | 'retired', actorId: string): Promise<PersistedSourceVersion> {
    const doc = await this.db.get(this.collection, versionId);
    if (!doc) throw new Error(`Source version not found: ${versionId}`);

    const version = doc as unknown as PersistedSourceVersion;

    // Validate transitions
    if (newStatus === 'verified' && version.status !== 'draft') {
      throw new Error(`Cannot verify: version is ${version.status}, must be draft`);
    }
    if (newStatus === 'retired' && version.status !== 'verified') {
      throw new Error(`Cannot retire: version is ${version.status}, must be verified`);
    }

    const now = new Date().toISOString();
    const updates: Partial<Record<string, unknown>> = {
      status: newStatus,
      updatedAt: now,
    };
    if (newStatus === 'verified') {
      updates.approvedBy = actorId;
    }

    await this.db.update(this.collection, versionId, updates);
    return { ...version, ...updates } as unknown as PersistedSourceVersion;
  }

  /**
   * Get the currently active (verified) source version for a profession.
   * Returns the most recently verified version, or null if none exists.
   */
  async getActiveVersion(profession: Profession): Promise<PersistedSourceVersion | null> {
    const filters: QueryFilter[] = [
      { field: 'profession', op: '==', value: profession },
      { field: 'status', op: '==', value: 'verified' },
    ];
    const docs = await this.db.query(this.collection, filters);
    if (docs.length === 0) return null;
    // Return the most recently created one
    const sorted = (docs as unknown as PersistedSourceVersion[]).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return sorted[0];
  }

  /**
   * List all source versions, optionally filtered by profession.
   */
  async list(profession?: Profession): Promise<PersistedSourceVersion[]> {
    const filters: QueryFilter[] = profession
      ? [{ field: 'profession', op: '==', value: profession }]
      : [];
    const docs = await this.db.query(this.collection, filters);
    return docs as unknown as PersistedSourceVersion[];
  }

  /**
   * Compute a simple content hash for payload verification.
   */
  private computeHash(payload: Record<string, unknown>): string {
    const str = JSON.stringify(payload);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `hash:${Math.abs(hash).toString(16).padStart(8, '0')}`;
  }
}
