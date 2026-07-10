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

  /**
   * Import fee table data into a source version's payload.
   * Accepts raw data (string for JSON/CSV) and updates the version's payload and content hash.
   */
  async importFeeTable(versionId: string, format: 'json' | 'csv', data: string): Promise<PersistedSourceVersion> {
    const doc = await this.db.get(this.collection, versionId);
    if (!doc) throw new Error(`Source version not found: ${versionId}`);

    const version = doc as unknown as PersistedSourceVersion;
    let feeTables: unknown;

    if (format === 'json') {
      try {
        feeTables = JSON.parse(data);
      } catch {
        throw new Error('Invalid JSON data for fee table import');
      }
    } else {
      // CSV: parse rows into structured fee table bands
      const lines = data.trim().split('\n');
      const startIdx = lines[0]?.toLowerCase().includes('complexity') ? 1 : 0;
      const tableMap = new Map<string, Array<Record<string, number>>>();
      for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        if (cols.length < 4) continue;
        const level = cols[0].toLowerCase();
        const band = { minValue: Number(cols[1]), maxValue: Number(cols[2]), feePercentage: Number(cols[3]) };
        if (!tableMap.has(level)) tableMap.set(level, []);
        tableMap.get(level)!.push(band);
      }
      feeTables = Array.from(tableMap.entries()).map(([level, bands]) => ({ complexityLevel: level, bands }));
    }

    const now = new Date().toISOString();
    const updatedPayload = { ...version.payload, feeTables };
    const newHash = this.computeHash(updatedPayload);

    await this.db.update(this.collection, versionId, {
      payload: updatedPayload,
      contentHash: newHash,
      updatedAt: now,
    });

    return { ...version, payload: updatedPayload, contentHash: newHash, updatedAt: now };
  }
}
