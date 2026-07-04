/**
 * ProposalPersistenceService — CRUD for fee proposals with lifecycle transitions.
 *
 * Manages proposals: create drafts, issue, accept, and create revisions.
 */

import type { FirestoreAdapter, QueryFilter } from './runPersistenceService';
import { id as generateId } from '../ids';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PersistedProposal {
  id: string;
  status: 'draft' | 'issued' | 'accepted' | 'superseded';
  project: Record<string, unknown>;
  professional: Record<string, unknown>;
  calculation: Record<string, unknown> | null;
  assumptions: string[];
  exclusions: string[];
  notes: string[];
  validityDays: number;
  selectedTermsTemplateIds: string[];
  version: number;
  parentProposalId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProposalInput {
  project: Record<string, unknown>;
  professional: Record<string, unknown>;
  calculation?: Record<string, unknown>;
  assumptions?: string[];
  exclusions?: string[];
  notes?: string[];
  validityDays?: number;
  selectedTermsTemplateIds?: string[];
}

// ---------------------------------------------------------------------------
// ProposalPersistenceService
// ---------------------------------------------------------------------------

export class ProposalPersistenceService {
  private readonly db: FirestoreAdapter;
  private readonly collection = 'fee_proposals';

  constructor(db: FirestoreAdapter) {
    this.db = db;
  }

  /**
   * Create a draft proposal.
   */
  async createDraft(input: CreateProposalInput): Promise<PersistedProposal> {
    const now = new Date().toISOString();
    const proposal: PersistedProposal = {
      id: generateId('proposal'),
      status: 'draft',
      project: input.project,
      professional: input.professional,
      calculation: input.calculation ?? null,
      assumptions: input.assumptions ?? [],
      exclusions: input.exclusions ?? [],
      notes: input.notes ?? [],
      validityDays: input.validityDays ?? 30,
      selectedTermsTemplateIds: input.selectedTermsTemplateIds ?? [],
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.set(this.collection, proposal.id, proposal as unknown as Record<string, unknown>);
    return proposal;
  }

  /**
   * Transition proposal status: draft → issued, issued → accepted.
   */
  async transition(proposalId: string, newStatus: 'issued' | 'accepted'): Promise<PersistedProposal> {
    const doc = await this.db.get(this.collection, proposalId);
    if (!doc) throw new Error(`Proposal not found: ${proposalId}`);

    const proposal = doc as unknown as PersistedProposal;

    if (newStatus === 'issued' && proposal.status !== 'draft') {
      throw new Error(`Cannot issue: proposal is ${proposal.status}, must be draft`);
    }
    if (newStatus === 'accepted' && proposal.status !== 'issued') {
      throw new Error(`Cannot accept: proposal is ${proposal.status}, must be issued`);
    }

    const now = new Date().toISOString();
    const updates: Partial<Record<string, unknown>> = { status: newStatus, updatedAt: now };
    await this.db.update(this.collection, proposalId, updates);
    return { ...proposal, ...updates } as unknown as PersistedProposal;
  }

  /**
   * Create a revised version of a proposal (marks original as superseded).
   */
  async revise(proposalId: string, changes?: Partial<CreateProposalInput>): Promise<PersistedProposal> {
    const doc = await this.db.get(this.collection, proposalId);
    if (!doc) throw new Error(`Proposal not found: ${proposalId}`);

    const original = doc as unknown as PersistedProposal;
    const now = new Date().toISOString();

    // Mark original as superseded
    await this.db.update(this.collection, proposalId, { status: 'superseded', updatedAt: now });

    // Create new revision
    const revised: PersistedProposal = {
      ...original,
      ...(changes?.project && { project: changes.project }),
      ...(changes?.professional && { professional: changes.professional }),
      ...(changes?.calculation && { calculation: changes.calculation }),
      ...(changes?.assumptions && { assumptions: changes.assumptions }),
      ...(changes?.exclusions && { exclusions: changes.exclusions }),
      ...(changes?.notes && { notes: changes.notes }),
      id: generateId('proposal'),
      status: 'draft',
      version: original.version + 1,
      parentProposalId: proposalId,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.set(this.collection, revised.id, revised as unknown as Record<string, unknown>);
    return revised;
  }

  /**
   * Get a single proposal by ID.
   */
  async get(proposalId: string): Promise<PersistedProposal | null> {
    const doc = await this.db.get(this.collection, proposalId);
    return doc as unknown as PersistedProposal | null;
  }

  /**
   * List proposals with optional filters.
   */
  async list(filters?: { status?: string }): Promise<PersistedProposal[]> {
    const queryFilters: QueryFilter[] = [];
    if (filters?.status) queryFilters.push({ field: 'status', op: '==', value: filters.status });
    const docs = await this.db.query(this.collection, queryFilters);
    return docs as unknown as PersistedProposal[];
  }
}
