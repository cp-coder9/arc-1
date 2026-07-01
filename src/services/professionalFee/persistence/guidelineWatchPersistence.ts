/**
 * GuidelineWatchPersistence — Firestore persistence layer for the
 * FeeGuideUpdateService watch registry and change candidates.
 *
 * Responsibilities:
 * - Persist watch sources to `fee_guideline_watch/` collection
 * - Load watch sources from Firestore
 * - Persist change candidates to `fee_guideline_candidates/`
 * - List pending candidates for admin review
 * - Approve a candidate (creates verified source version, clears candidate)
 * - Dismiss a candidate (removes without action)
 * - Create admin inbox items for new change candidates
 */

import type { FirestoreAdapter } from './runPersistenceService';
import type { SourceVersionService, CreateSourceVersionInput } from './sourceVersionService';
import type { FeeGuideWatchSource, FeeGuideChangeCandidate } from '../guidelineUpdateService';
import { id } from '../ids';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PersistedCandidate {
  id: string;
  candidate: FeeGuideChangeCandidate;
  status: 'pending' | 'approved' | 'dismissed';
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface AdminInboxItem {
  id: string;
  type: 'GUIDELINE_CHANGE_DETECTED';
  title: string;
  message: string;
  candidateId: string;
  profession: string;
  body: string;
  createdAt: string;
  read: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowISO(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// GuidelineWatchPersistence
// ---------------------------------------------------------------------------

export class GuidelineWatchPersistence {
  private readonly db: FirestoreAdapter;
  private readonly sourceVersionService: SourceVersionService;
  private readonly watchCollection = 'fee_guideline_watch';
  private readonly candidatesCollection = 'fee_guideline_candidates';
  private readonly inboxCollection = 'admin_inbox';

  constructor(db: FirestoreAdapter, sourceVersionService: SourceVersionService) {
    this.db = db;
    this.sourceVersionService = sourceVersionService;
  }

  /**
   * Persist all watch sources to Firestore `fee_guideline_watch/` collection.
   * Each source is stored by its id.
   */
  async persistWatchRegistry(sources: FeeGuideWatchSource[]): Promise<void> {
    for (const source of sources) {
      await this.db.set(
        this.watchCollection,
        source.id,
        source as unknown as Record<string, unknown>,
      );
    }
  }

  /**
   * Load all watch sources from Firestore `fee_guideline_watch/` collection.
   */
  async loadWatchRegistry(): Promise<FeeGuideWatchSource[]> {
    const docs = await this.db.query(this.watchCollection, []);
    return docs as unknown as FeeGuideWatchSource[];
  }

  /**
   * Persist a change candidate to `fee_guideline_candidates/` collection.
   * Returns the persisted candidate with a generated id.
   */
  async persistCandidate(candidate: FeeGuideChangeCandidate): Promise<PersistedCandidate> {
    const now = nowISO();
    const persisted: PersistedCandidate = {
      id: id('gc'),
      candidate,
      status: 'pending',
      createdAt: now,
    };

    await this.db.set(
      this.candidatesCollection,
      persisted.id,
      persisted as unknown as Record<string, unknown>,
    );

    return persisted;
  }

  /**
   * List all pending candidates awaiting admin review.
   */
  async listCandidates(): Promise<PersistedCandidate[]> {
    const docs = await this.db.query(this.candidatesCollection, [
      { field: 'status', op: '==', value: 'pending' },
    ]);
    return docs as unknown as PersistedCandidate[];
  }

  /**
   * Approve a candidate — creates a new verified source version and marks
   * the candidate as approved.
   */
  async approveCandidate(
    candidateId: string,
    approvedBy: string,
    sourceTitle: string,
    effectiveDate: string,
  ): Promise<void> {
    const doc = await this.db.get(this.candidatesCollection, candidateId);
    if (!doc) {
      throw new Error(`Candidate not found: ${candidateId}`);
    }

    const persisted = doc as unknown as PersistedCandidate;
    if (persisted.status !== 'pending') {
      throw new Error(`Candidate is not pending: ${candidateId} (status: ${persisted.status})`);
    }

    // Create a new source version in draft state
    const createInput: CreateSourceVersionInput = {
      profession: persisted.candidate.profession,
      body: persisted.candidate.body,
      title: sourceTitle,
      effectiveDate,
      payload: {},
      createdBy: approvedBy,
    };

    const sourceVersion = await this.sourceVersionService.createSourceVersion(createInput);

    // Transition to verified
    await this.sourceVersionService.transitionStatus(sourceVersion.id, 'verified', approvedBy);

    // Mark candidate as approved
    const now = nowISO();
    await this.db.update(this.candidatesCollection, candidateId, {
      status: 'approved',
      resolvedAt: now,
      resolvedBy: approvedBy,
    });
  }

  /**
   * Dismiss a candidate — removes it from pending without creating a source version.
   */
  async dismissCandidate(candidateId: string): Promise<void> {
    const doc = await this.db.get(this.candidatesCollection, candidateId);
    if (!doc) {
      throw new Error(`Candidate not found: ${candidateId}`);
    }

    const persisted = doc as unknown as PersistedCandidate;
    if (persisted.status !== 'pending') {
      throw new Error(`Candidate is not pending: ${candidateId} (status: ${persisted.status})`);
    }

    const now = nowISO();
    await this.db.update(this.candidatesCollection, candidateId, {
      status: 'dismissed',
      resolvedAt: now,
    });
  }

  /**
   * Create an admin inbox item notifying of a new change candidate.
   */
  async createAdminInboxItem(candidate: PersistedCandidate): Promise<AdminInboxItem> {
    const item: AdminInboxItem = {
      id: id('inbox'),
      type: 'GUIDELINE_CHANGE_DETECTED',
      title: `Fee guideline change detected: ${candidate.candidate.body}`,
      message: candidate.candidate.message,
      candidateId: candidate.id,
      profession: candidate.candidate.profession,
      body: candidate.candidate.body,
      createdAt: candidate.createdAt,
      read: false,
    };

    await this.db.set(
      this.inboxCollection,
      item.id,
      item as unknown as Record<string, unknown>,
    );

    return item;
  }
}
