/**
 * SourceVersionService — manages fee source version lifecycle.
 *
 * Handles creation, status transitions, fee table imports, and active version queries
 * for fee guide tariff data from South African council bodies.
 */

import type { Profession } from '../types';
import type {
  FeeSourceVersionRecord,
  FeeSourceVersionPayload,
  SourceVersionStatus,
} from './types';
import type { FirestoreAdapter } from './runPersistenceService';
import { id } from '../ids';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowISO(): string {
  return new Date().toISOString();
}

/** FNV-1a hash of a string, returned as 8-char hex. */
function fnv1a(input: string): string {
  let hash = 2166136261; // FNV-1a offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Compute content hash from the payload. */
function computeContentHash(payload: FeeSourceVersionPayload): string {
  return fnv1a(JSON.stringify(payload));
}

// ---------------------------------------------------------------------------
// Valid status transitions
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<SourceVersionStatus, SourceVersionStatus[]> = {
  'demo-seed': ['draft'],
  draft: ['verified'],
  verified: ['retired'],
  retired: [],
};

// ---------------------------------------------------------------------------
// Create input
// ---------------------------------------------------------------------------

export interface CreateSourceVersionInput {
  profession: Profession;
  body: string;
  title: string;
  effectiveDate: string;
  boardNoticeRef?: string;
  payload: FeeSourceVersionPayload;
  createdBy: string;
  previousVersionId?: string;
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
   * Create a new source version record with status 'draft'.
   */
  async createSourceVersion(data: CreateSourceVersionInput): Promise<FeeSourceVersionRecord> {
    const now = nowISO();
    const record: FeeSourceVersionRecord = {
      id: id('sv'),
      profession: data.profession,
      body: data.body,
      title: data.title,
      effectiveDate: data.effectiveDate,
      boardNoticeRef: data.boardNoticeRef,
      status: 'draft',
      payload: data.payload,
      contentHash: computeContentHash(data.payload),
      createdBy: data.createdBy,
      previousVersionId: data.previousVersionId,
      createdAt: now,
    };

    await this.db.set(this.collection, record.id, record as unknown as Record<string, unknown>);
    return record;
  }

  /**
   * Transition a source version to a new status.
   *
   * Valid transitions:
   * - demo-seed → draft
   * - draft → verified (requires approvedBy)
   * - verified → retired
   *
   * When transitioning to 'verified', retires the currently active version for that profession.
   */
  async transitionStatus(
    versionId: string,
    newStatus: SourceVersionStatus,
    approvedBy?: string,
  ): Promise<FeeSourceVersionRecord> {
    const doc = await this.db.get(this.collection, versionId);
    if (!doc) {
      throw new Error(`Source version not found: ${versionId}`);
    }

    const record = doc as unknown as FeeSourceVersionRecord;
    const allowed = VALID_TRANSITIONS[record.status];

    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Invalid status transition: ${record.status} → ${newStatus}. ` +
        `Allowed transitions from '${record.status}': [${allowed.join(', ')}]`,
      );
    }

    if (newStatus === 'verified' && !approvedBy) {
      throw new Error('Verification requires an approvedBy value');
    }

    const now = nowISO();
    const updates: Partial<Record<string, unknown>> = { status: newStatus };

    if (newStatus === 'verified') {
      updates.approvedBy = approvedBy;
      updates.verifiedAt = now;

      // Retire previously active version for this profession
      await this.retireActiveVersion(record.profession, versionId);
    }

    if (newStatus === 'retired') {
      updates.retiredAt = now;
    }

    await this.db.update(this.collection, versionId, updates);

    return {
      ...record,
      ...updates,
    } as unknown as FeeSourceVersionRecord;
  }

  /**
   * Import fee table data from a structured format (CSV or JSON string)
   * into the source version's payload feeTables field.
   */
  async importFeeTable(
    versionId: string,
    format: 'csv' | 'json',
    data: string,
  ): Promise<FeeSourceVersionRecord> {
    const doc = await this.db.get(this.collection, versionId);
    if (!doc) {
      throw new Error(`Source version not found: ${versionId}`);
    }

    const record = doc as unknown as FeeSourceVersionRecord;
    let parsedTables: unknown;

    if (format === 'json') {
      try {
        parsedTables = JSON.parse(data);
      } catch {
        throw new Error('Invalid JSON data for fee table import');
      }
    } else {
      // CSV parsing: expect rows with complexityLevel,minValue,maxValue,feePercentage,baseFee,rateAboveMin
      parsedTables = this.parseCsvFeeTable(data);
    }

    const updatedPayload: FeeSourceVersionPayload = {
      ...record.payload,
      feeTables: parsedTables as FeeSourceVersionPayload['feeTables'],
    };

    const newHash = computeContentHash(updatedPayload);

    await this.db.update(this.collection, versionId, {
      payload: updatedPayload,
      contentHash: newHash,
    });

    return {
      ...record,
      payload: updatedPayload,
      contentHash: newHash,
    };
  }

  /**
   * Get the most recent verified source version for a given profession.
   * Returns null if no verified version exists.
   */
  async getActiveVersion(profession: Profession): Promise<FeeSourceVersionRecord | null> {
    const docs = await this.db.query(this.collection, [
      { field: 'profession', op: '==', value: profession },
      { field: 'status', op: '==', value: 'verified' },
    ]);

    if (docs.length === 0) return null;

    // Return the most recent by createdAt
    const sorted = (docs as unknown as FeeSourceVersionRecord[]).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return sorted[0];
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Retire the currently active (verified) version for a profession,
   * excluding the version being verified.
   */
  private async retireActiveVersion(profession: Profession, excludeId: string): Promise<void> {
    const docs = await this.db.query(this.collection, [
      { field: 'profession', op: '==', value: profession },
      { field: 'status', op: '==', value: 'verified' },
    ]);

    const now = nowISO();
    for (const doc of docs) {
      const existing = doc as unknown as FeeSourceVersionRecord;
      if (existing.id !== excludeId) {
        await this.db.update(this.collection, existing.id, {
          status: 'retired',
          retiredAt: now,
        });
      }
    }
  }

  /**
   * Parse CSV fee table data into SACAPFeeTable array.
   * Expected format: complexityLevel,minValue,maxValue,feePercentage[,baseFee,rateAboveMin]
   */
  private parseCsvFeeTable(csv: string): FeeSourceVersionPayload['feeTables'] {
    const lines = csv.trim().split('\n');
    // Skip header if present
    const startIdx = lines[0]?.toLowerCase().includes('complexity') ? 1 : 0;

    const tableMap = new Map<string, Array<{
      minValue: number;
      maxValue: number;
      feePercentage: number;
      baseFee?: number;
      rateAboveMin?: number;
    }>>();

    for (let i = startIdx; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      if (cols.length < 4) continue;

      const complexityLevel = cols[0].toLowerCase();
      const band = {
        minValue: Number(cols[1]),
        maxValue: Number(cols[2]),
        feePercentage: Number(cols[3]),
        ...(cols[4] ? { baseFee: Number(cols[4]) } : {}),
        ...(cols[5] ? { rateAboveMin: Number(cols[5]) } : {}),
      };

      if (!tableMap.has(complexityLevel)) {
        tableMap.set(complexityLevel, []);
      }
      tableMap.get(complexityLevel)!.push(band);
    }

    return Array.from(tableMap.entries()).map(([level, bands]) => ({
      complexityLevel: level as 'low' | 'medium' | 'high',
      bands,
    }));
  }
}
