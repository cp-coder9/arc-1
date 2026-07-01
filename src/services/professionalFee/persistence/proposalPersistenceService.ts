/**
 * ProposalPersistenceService — manages fee proposal lifecycle:
 * create draft, issue (with responsibility gate), revise, and accept.
 *
 * Uses the same FirestoreAdapter interface as RunPersistenceService for
 * storage abstraction. Issued proposals are immutable — no field mutations
 * are permitted after issue.
 */

import type { ProposalInput, ProposalDocument } from '../types';
import type { FeeProposalRecord, ProposalStatus } from './types';
import type { FirestoreAdapter } from './runPersistenceService';
import { id } from '../ids';
import { ProposalBuilderService } from '../proposalBuilder';
import { TermsLibraryService } from '../terms';
import { toProjectRecord, toInboxEvent, toAppointmentDraft } from '../adapters';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowISO(): string {
  return new Date().toISOString();
}

/** FNV-1a hash for audit sealing */
function fnv1a(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `proposal-fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`;
}

function computeAuditHash(record: FeeProposalRecord): string {
  return fnv1a(JSON.stringify({
    id: record.id,
    document: record.document,
    runId: record.runId,
    sourceVersionId: record.sourceVersionId,
    validityDays: record.validityDays,
    version: record.version,
  }));
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
   * Create a draft proposal from a calculator run and proposal input.
   */
  async createDraft(
    runId: string,
    proposalInput: ProposalInput,
    userId: string,
    profession: ProposalInput extends { calculation: { profession: infer P } } ? P : string,
    sourceVersionId: string,
    projectId?: string,
    clientId?: string,
  ): Promise<FeeProposalRecord> {
    const now = nowISO();

    // Build the proposal document using ProposalBuilderService
    const termsService = new TermsLibraryService();
    const builder = new ProposalBuilderService(termsService);
    const document = builder.buildDraft(proposalInput);

    const validUntil = new Date(
      Date.now() + proposalInput.validityDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const record: FeeProposalRecord = {
      id: document.id,
      userId,
      profession: proposalInput.calculation.profession,
      status: 'draft',
      document,
      runId,
      sourceVersionId,
      projectId,
      clientId,
      validityDays: proposalInput.validityDays,
      validUntil,
      responsibilityConfirmed: false,
      version: 1,
      createdAt: now,
    };

    await this.db.set(this.collection, record.id, record as unknown as Record<string, unknown>);
    return record;
  }

  /**
   * Issue a proposal — seals it with an audit hash and makes it immutable.
   * REJECTS if responsibilityConfirmed is false.
   */
  async issueProposal(proposalId: string, responsibilityConfirmed: boolean): Promise<FeeProposalRecord> {
    if (!responsibilityConfirmed) {
      throw new Error('Professional responsibility confirmation is required before issuing a proposal');
    }

    const doc = await this.db.get(this.collection, proposalId);
    if (!doc) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }

    const record = doc as unknown as FeeProposalRecord;

    if (record.status === 'issued') {
      throw new Error(`Proposal is already issued and immutable: ${proposalId}`);
    }

    const now = nowISO();
    const updatedRecord: FeeProposalRecord = {
      ...record,
      status: 'issued',
      responsibilityConfirmed: true,
      responsibilityConfirmedAt: now,
      issuedAt: now,
      document: { ...record.document, status: 'issued' },
    };

    // Compute and seal with audit hash
    updatedRecord.auditHash = computeAuditHash(updatedRecord);
    updatedRecord.document.auditHash = updatedRecord.auditHash;

    await this.db.set(this.collection, proposalId, updatedRecord as unknown as Record<string, unknown>);
    return updatedRecord;
  }

  /**
   * Revise a proposal — creates a NEW version with a new ID, incremented version,
   * and previousVersionId pointing to the original. Supersedes the original.
   */
  async reviseProposal(proposalId: string): Promise<FeeProposalRecord> {
    const doc = await this.db.get(this.collection, proposalId);
    if (!doc) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }

    const original = doc as unknown as FeeProposalRecord;
    const now = nowISO();

    // Supersede the original
    await this.db.update(this.collection, proposalId, {
      status: 'superseded' as ProposalStatus,
    });

    // Create new revision
    const newId = id('proposal');
    const revised: FeeProposalRecord = {
      ...original,
      id: newId,
      status: 'draft',
      version: original.version + 1,
      previousVersionId: original.id,
      responsibilityConfirmed: false,
      responsibilityConfirmedAt: undefined,
      auditHash: undefined,
      issuedAt: undefined,
      acceptedAt: undefined,
      createdAt: now,
      document: {
        ...original.document,
        id: newId,
        status: 'draft',
        auditHash: undefined,
      },
    };

    await this.db.set(this.collection, newId, revised as unknown as Record<string, unknown>);
    return revised;
  }

  /**
   * Accept a proposal — sets status to 'accepted' with an acceptedAt timestamp.
   * Triggers platform spine events.
   */
  async acceptProposal(proposalId: string): Promise<FeeProposalRecord> {
    const doc = await this.db.get(this.collection, proposalId);
    if (!doc) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }

    const record = doc as unknown as FeeProposalRecord;

    if (record.status !== 'issued') {
      throw new Error(`Cannot accept proposal with status '${record.status}' — must be 'issued'`);
    }

    const now = nowISO();

    await this.db.update(this.collection, proposalId, {
      status: 'accepted' as ProposalStatus,
      acceptedAt: now,
    });

    const accepted: FeeProposalRecord = {
      ...record,
      status: 'accepted',
      acceptedAt: now,
    };

    // Trigger platform spine events
    toProjectRecord(accepted.document);
    toInboxEvent(accepted.document);
    toAppointmentDraft(accepted.document);

    return accepted;
  }

  /**
   * Attempt to update an issued proposal — throws to enforce immutability.
   */
  async updateProposal(proposalId: string, _data: Partial<Record<string, unknown>>): Promise<void> {
    const doc = await this.db.get(this.collection, proposalId);
    if (!doc) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }

    const record = doc as unknown as FeeProposalRecord;

    if (record.status === 'issued' || record.status === 'accepted') {
      throw new Error(`Cannot mutate proposal with status '${record.status}' — issued proposals are immutable`);
    }

    await this.db.update(this.collection, proposalId, _data);
  }

  /**
   * Get a proposal by ID.
   */
  async getProposal(proposalId: string): Promise<FeeProposalRecord | null> {
    const doc = await this.db.get(this.collection, proposalId);
    if (!doc) return null;
    return doc as unknown as FeeProposalRecord;
  }
}
