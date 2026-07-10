/**
 * RunPersistenceService — Save, load, reopen, assign, and export fee calculation runs.
 * Also exports the FirestoreAdapter interface and InMemoryFirestoreAdapter for testing.
 */

import type { Profession } from '../types';
import { id as generateId } from '../ids';

// ---------------------------------------------------------------------------
// Firestore Adapter Interface
// ---------------------------------------------------------------------------

export interface QueryFilter {
  field: string;
  op: '==' | '!=' | '>' | '<' | '>=' | '<=';
  value: unknown;
}

export interface FirestoreAdapter {
  get(collection: string, docId: string): Promise<Record<string, unknown> | null>;
  set(collection: string, docId: string, data: Record<string, unknown>): Promise<void>;
  update(collection: string, docId: string, data: Partial<Record<string, unknown>>): Promise<void>;
  delete(collection: string, docId: string): Promise<void>;
  query(collection: string, filters: QueryFilter[]): Promise<Record<string, unknown>[]>;
}

// ---------------------------------------------------------------------------
// In-memory adapter for testing
// ---------------------------------------------------------------------------

export class InMemoryFirestoreAdapter implements FirestoreAdapter {
  private store = new Map<string, Map<string, Record<string, unknown>>>();

  private getCollection(collection: string): Map<string, Record<string, unknown>> {
    if (!this.store.has(collection)) {
      this.store.set(collection, new Map());
    }
    return this.store.get(collection)!;
  }

  async get(collection: string, docId: string): Promise<Record<string, unknown> | null> {
    return this.getCollection(collection).get(docId) ?? null;
  }

  async set(collection: string, docId: string, data: Record<string, unknown>): Promise<void> {
    this.getCollection(collection).set(docId, { ...data });
  }

  async update(collection: string, docId: string, data: Partial<Record<string, unknown>>): Promise<void> {
    const col = this.getCollection(collection);
    const existing = col.get(docId);
    if (!existing) throw new Error(`Document not found: ${collection}/${docId}`);
    col.set(docId, { ...existing, ...data });
  }

  async delete(collection: string, docId: string): Promise<void> {
    this.getCollection(collection).delete(docId);
  }

  async query(collection: string, filters: QueryFilter[]): Promise<Record<string, unknown>[]> {
    const col = this.getCollection(collection);
    const results: Record<string, unknown>[] = [];
    for (const doc of col.values()) {
      let match = true;
      for (const filter of filters) {
        const val = doc[filter.field];
        switch (filter.op) {
          case '==': match = val === filter.value; break;
          case '!=': match = val !== filter.value; break;
          case '>': match = (val as number) > (filter.value as number); break;
          case '<': match = (val as number) < (filter.value as number); break;
          case '>=': match = (val as number) >= (filter.value as number); break;
          case '<=': match = (val as number) <= (filter.value as number); break;
        }
        if (!match) break;
      }
      if (match) results.push(doc);
    }
    return results;
  }
}

// ---------------------------------------------------------------------------
// Run Persistence Types
// ---------------------------------------------------------------------------

export interface PersistedRun {
  id: string;
  profession: Profession;
  projectValue: number;
  calculatorState: Record<string, unknown>;
  result: Record<string, unknown> | null;
  status: 'saved' | 'assigned' | 'exported';
  projectId?: string;
  version: number;
  parentRunId?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// RunPersistenceService
// ---------------------------------------------------------------------------

export class RunPersistenceService {
  private readonly db: FirestoreAdapter;
  private readonly collection = 'fee_proposal_runs';

  constructor(db: FirestoreAdapter) {
    this.db = db;
  }

  async save(input: Omit<PersistedRun, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<PersistedRun> {
    const now = new Date().toISOString();
    const run: PersistedRun = {
      ...input,
      id: generateId('run'),
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.set(this.collection, run.id, run as unknown as Record<string, unknown>);
    return run;
  }

  async get(runId: string): Promise<PersistedRun | null> {
    const doc = await this.db.get(this.collection, runId);
    return doc as unknown as PersistedRun | null;
  }

  async list(filters?: { profession?: Profession; projectId?: string }): Promise<PersistedRun[]> {
    const queryFilters: QueryFilter[] = [];
    if (filters?.profession) queryFilters.push({ field: 'profession', op: '==', value: filters.profession });
    if (filters?.projectId) queryFilters.push({ field: 'projectId', op: '==', value: filters.projectId });
    const docs = await this.db.query(this.collection, queryFilters);
    return docs as unknown as PersistedRun[];
  }

  async reopen(runId: string): Promise<PersistedRun> {
    const original = await this.get(runId);
    if (!original) throw new Error(`Run not found: ${runId}`);
    const now = new Date().toISOString();
    const newRun: PersistedRun = {
      ...original,
      id: generateId('run'),
      version: original.version + 1,
      parentRunId: runId,
      status: 'saved',
      createdAt: now,
      updatedAt: now,
    };
    await this.db.set(this.collection, newRun.id, newRun as unknown as Record<string, unknown>);
    return newRun;
  }

  async assign(runId: string, projectId: string): Promise<PersistedRun> {
    const run = await this.get(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    const now = new Date().toISOString();
    await this.db.update(this.collection, runId, { projectId, status: 'assigned', updatedAt: now });
    return { ...run, projectId, status: 'assigned', updatedAt: now };
  }

  async export(runId: string, format: 'pdf' | 'csv' | 'json'): Promise<{ content: string; format: string }> {
    const run = await this.get(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    const now = new Date().toISOString();
    await this.db.update(this.collection, runId, { status: 'exported', updatedAt: now });

    let content: string;
    switch (format) {
      case 'json':
        content = JSON.stringify(run, null, 2);
        break;
      case 'csv': {
        const lines = ['Field,Value'];
        lines.push(`Run ID,${run.id}`);
        lines.push(`Profession,${run.profession}`);
        lines.push(`Project Value,${run.projectValue}`);
        lines.push(`Status,${run.status}`);
        lines.push(`Version,${run.version}`);
        lines.push(`Created,${run.createdAt}`);
        content = lines.join('\n');
        break;
      }
      case 'pdf':
        content = `=== FEE PROPOSAL RUN EXPORT ===\nRun ID: ${run.id}\nProfession: ${run.profession}\nProject Value: R ${run.projectValue.toLocaleString('en-ZA')}\nStatus: ${run.status}\nVersion: ${run.version}\nCreated: ${run.createdAt}\n=== END ===`;
        break;
    }
    return { content, format };
  }
}
