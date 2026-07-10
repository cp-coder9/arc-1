/**
 * Firestore-backed ToolRun repository.
 *
 * Collection paths:
 *   Production: tenants/{tenantId}/toolRuns/{runId}
 *   Demo mode:  demo/{uid}/toolRuns/{runId}
 *
 * Implements the ToolRunRepository interface with cursor-based pagination.
 *
 * Save has retry logic: 1s delay, one retry on failure (Req 3.8).
 * Failed runs are persisted with the same structure as successful runs (Req 3.7).
 *
 * Requirements: 3.1, 3.2, 3.5, 3.7, 3.8
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { ToolRunRepository } from './repository';
import type { ToolRun, PaginatedResult, ListByToolParams, ListByProjectParams } from './types';
import { toFirestoreDocument, fromFirestoreDocument } from './firestoreMapper';
import type { FirestoreToolRunDocument } from './firestoreMapper';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const RETRY_DELAY_MS = 1000;

function clampPageSize(pageSize?: number): number {
  const size = pageSize ?? DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(1, size), MAX_PAGE_SIZE);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FirestoreRepositoryOptions {
  /** When true, paths are scoped to demo/{uid}/toolRuns/{runId} */
  demoMode?: boolean;
  /** Required when demoMode is true */
  demoUid?: string;
}

/**
 * Firestore-backed ToolRun repository with cursor-based pagination.
 *
 * Collection paths:
 * - Production: tenants/{tenantId}/toolRuns/{runId}
 * - Demo mode:  demo/{uid}/toolRuns/{runId}
 */
export class FirestoreToolRunRepository implements ToolRunRepository {
  constructor(
    private readonly db: Firestore,
    private readonly options: FirestoreRepositoryOptions = {}
  ) {}

  private getCollectionPath(tenantId: string): string {
    if (this.options.demoMode && this.options.demoUid) {
      return `demo/${this.options.demoUid}/toolRuns`;
    }
    return `tenants/${tenantId}/toolRuns`;
  }

  /**
   * Persist a ToolRun to Firestore with retry logic.
   * On first failure, waits 1s then retries once (Req 3.8).
   * Failed runs (status === 'failed') are persisted with
   * the same structure as successful runs (Req 3.7).
   */
  async save(run: ToolRun): Promise<ToolRun> {
    const collectionPath = this.getCollectionPath(run.tenantId);
    const docRef = this.db.collection(collectionPath).doc(run.id);
    const data = toFirestoreDocument(run);

    try {
      await docRef.set(data);
    } catch {
      // Retry once after 1s delay (Req 3.8)
      await delay(RETRY_DELAY_MS);
      await docRef.set(data);
    }

    return run;
  }

  /**
   * Retrieve a ToolRun by its id.
   * Requires tenantId to locate the correct collection path.
   */
  async getById(id: string, tenantId?: string): Promise<ToolRun | undefined> {
    if (!tenantId) return undefined;

    const collectionPath = this.getCollectionPath(tenantId);
    const docRef = this.db.collection(collectionPath).doc(id);
    const snapshot = await docRef.get();

    if (!snapshot.exists) return undefined;

    return fromFirestoreDocument(id, snapshot.data() as FirestoreToolRunDocument);
  }

  /**
   * List runs by user, ordered by createdAt DESC.
   */
  async listByUser(tenantId: string, userId: string, limit = 20): Promise<ToolRun[]> {
    const collectionPath = this.getCollectionPath(tenantId);
    const q = this.db
      .collection(collectionPath)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(clampPageSize(limit));

    const snapshot = await q.get();
    return snapshot.docs.map((d) =>
      fromFirestoreDocument(d.id, d.data() as FirestoreToolRunDocument)
    );
  }

  /**
   * List runs by tool for a specific user with cursor-based pagination.
   * Filters by tenantId, userId, toolId; ordered by createdAt DESC.
   * Default page size 20, max 50.
   */
  async listByTool(params: ListByToolParams): Promise<PaginatedResult<ToolRun>> {
    const { tenantId, userId, toolId, pageSize, cursor } = params;
    const size = clampPageSize(pageSize);
    const collectionPath = this.getCollectionPath(tenantId);

    let q = this.db
      .collection(collectionPath)
      .where('userId', '==', userId)
      .where('toolId', '==', toolId)
      .orderBy('createdAt', 'desc')
      .limit(size + 1); // Fetch one extra to determine hasMore

    if (cursor) {
      q = q.startAfter(cursor);
    }

    const snapshot = await q.get();
    const docs = snapshot.docs;
    const hasMore = docs.length > size;
    const resultDocs = hasMore ? docs.slice(0, size) : docs;

    const items = resultDocs.map((d) =>
      fromFirestoreDocument(d.id, d.data() as FirestoreToolRunDocument)
    );

    const lastItem = items[items.length - 1];

    return {
      items,
      cursor: lastItem ? lastItem.createdAt : null,
      hasMore,
    };
  }

  /**
   * List runs by project with cursor-based pagination.
   * Filters by tenantId, assignment.projectId; ordered by createdAt DESC.
   * Default page size 20, max 50.
   */
  async listByProject(params: ListByProjectParams): Promise<PaginatedResult<ToolRun>> {
    const { tenantId, projectId, pageSize, cursor } = params;
    const size = clampPageSize(pageSize);
    const collectionPath = this.getCollectionPath(tenantId);

    let q = this.db
      .collection(collectionPath)
      .where('assignment.projectId', '==', projectId)
      .orderBy('createdAt', 'desc')
      .limit(size + 1); // Fetch one extra to determine hasMore

    if (cursor) {
      q = q.startAfter(cursor);
    }

    const snapshot = await q.get();
    const docs = snapshot.docs;
    const hasMore = docs.length > size;
    const resultDocs = hasMore ? docs.slice(0, size) : docs;

    const items = resultDocs.map((d) =>
      fromFirestoreDocument(d.id, d.data() as FirestoreToolRunDocument)
    );

    const lastItem = items[items.length - 1];

    return {
      items,
      cursor: lastItem ? lastItem.createdAt : null,
      hasMore,
    };
  }
}
