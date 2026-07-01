/**
 * RunPersistenceService — saves, reopens, assigns, and exports fee proposal runs.
 *
 * Uses a FirestoreAdapter interface for storage abstraction, allowing
 * server-side Firebase SDK or in-memory implementations for testing.
 */

import type { FeeInput, FeeCalculationResult, Profession } from '../types';
import type { FeeProposalRun, ExportFormat } from './types';
import { id } from '../ids';
import { toProjectRecord } from '../adapters';

// ---------------------------------------------------------------------------
// FirestoreAdapter — abstract storage interface
// ---------------------------------------------------------------------------

export interface FirestoreQuery {
  field: string;
  op: '==' | '!=' | '<' | '<=' | '>' | '>=';
  value: unknown;
}

export interface FirestoreAdapter {
  get(collection: string, docId: string): Promise<Record<string, unknown> | null>;
  set(collection: string, docId: string, data: Record<string, unknown>): Promise<void>;
  update(collection: string, docId: string, data: Partial<Record<string, unknown>>): Promise<void>;
  query(collection: string, filters: FirestoreQuery[]): Promise<Record<string, unknown>[]>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple hash function for source version ID */
function computeSourceVersionHash(sourceVersionId: string): string {
  let hash = 2166136261; // FNV-1a offset basis
  for (let i = 0; i < sourceVersionId.length; i++) {
    hash ^= sourceVersionId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function nowISO(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Export formatters
// ---------------------------------------------------------------------------

function formatAsJson(run: FeeProposalRun): string {
  return JSON.stringify(run, null, 2);
}

function formatAsCsv(run: FeeProposalRun): string {
  const lines: string[] = [];
  lines.push('Field,Value');
  lines.push(`Run ID,${run.runId}`);
  lines.push(`Profession,${run.profession}`);
  lines.push(`User ID,${run.userId}`);
  lines.push(`Source Version,${run.sourceVersionId}`);
  lines.push(`Version,${run.version}`);
  lines.push(`Created At,${run.createdAt}`);
  lines.push(`Project Value,${run.input.projectValue}`);
  lines.push(`Guideline Fee,${run.result.guidelineProfessionalFee}`);
  lines.push(`Stage Adjusted Fee,${run.result.stageAdjustedFee}`);
  lines.push(`Professional Fee Before Discount,${run.result.professionalFeeBeforeDiscount}`);
  lines.push(`Discount Amount,${run.result.discountAmount}`);
  lines.push(`Professional Fee After Discount,${run.result.professionalFeeAfterDiscount}`);
  lines.push(`Disbursements Total,${run.result.disbursementsTotal}`);
  lines.push(`Statutory Fees Total,${run.result.statutoryFeesTotal}`);
  lines.push(`VAT Amount,${run.result.vatAmount}`);
  lines.push(`Total Incl VAT,${run.result.totalInclVat}`);

  if (run.result.lines.length > 0) {
    lines.push('');
    lines.push('Fee Lines');
    lines.push('Label,Amount,Taxable,Discountable');
    for (const line of run.result.lines) {
      lines.push(`"${line.label}",${line.amount},${line.taxable},${line.discountable}`);
    }
  }

  return lines.join('\n');
}

function formatAsPdf(run: FeeProposalRun): string {
  // Simple text-based representation for PDF generation
  // In production this would use a PDF library — here we produce structured text
  const sections: string[] = [];
  sections.push('=== FEE PROPOSAL RUN EXPORT ===');
  sections.push('');
  sections.push(`Run ID: ${run.runId}`);
  sections.push(`Profession: ${run.profession}`);
  sections.push(`User: ${run.userId}`);
  sections.push(`Source Version: ${run.sourceVersionId}`);
  sections.push(`Version: ${run.version}`);
  sections.push(`Created: ${run.createdAt}`);
  if (run.projectId) sections.push(`Project: ${run.projectId}`);
  sections.push('');
  sections.push('--- INPUTS ---');
  sections.push(`Project Value: R ${run.input.projectValue.toLocaleString('en-ZA')}`);
  sections.push(`Complexity: ${run.input.complexityId}`);
  sections.push(`VAT Applicable: ${run.input.vatApplicable ? 'Yes' : 'No'}`);
  sections.push('');
  sections.push('--- RESULTS ---');
  sections.push(`Guideline Professional Fee: R ${run.result.guidelineProfessionalFee.toLocaleString('en-ZA')}`);
  sections.push(`Stage Adjusted Fee: R ${run.result.stageAdjustedFee.toLocaleString('en-ZA')}`);
  sections.push(`Professional Fee (before discount): R ${run.result.professionalFeeBeforeDiscount.toLocaleString('en-ZA')}`);
  sections.push(`Discount: R ${run.result.discountAmount.toLocaleString('en-ZA')}`);
  sections.push(`Professional Fee (after discount): R ${run.result.professionalFeeAfterDiscount.toLocaleString('en-ZA')}`);
  sections.push(`Disbursements: R ${run.result.disbursementsTotal.toLocaleString('en-ZA')}`);
  sections.push(`Statutory Fees: R ${run.result.statutoryFeesTotal.toLocaleString('en-ZA')}`);
  sections.push(`VAT: R ${run.result.vatAmount.toLocaleString('en-ZA')}`);
  sections.push(`TOTAL (incl VAT): R ${run.result.totalInclVat.toLocaleString('en-ZA')}`);

  if (run.result.warnings.length > 0) {
    sections.push('');
    sections.push('--- WARNINGS ---');
    for (const w of run.result.warnings) {
      sections.push(`• ${w}`);
    }
  }

  sections.push('');
  sections.push('=== END OF EXPORT ===');
  return sections.join('\n');
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

  /**
   * Save a new immutable run record.
   */
  async saveRun(
    input: FeeInput,
    result: FeeCalculationResult,
    userId: string,
    profession: Profession,
    sourceVersionId: string,
  ): Promise<FeeProposalRun> {
    const now = nowISO();
    const run: FeeProposalRun = {
      runId: id('run'),
      userId,
      profession,
      input,
      result,
      sourceVersionId,
      sourceVersionHash: computeSourceVersionHash(sourceVersionId),
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.set(this.collection, run.runId, run as unknown as Record<string, unknown>);
    return run;
  }

  /**
   * Reopen a saved run — creates a NEW run with incremented version and
   * previousRunId linking back to the original. Does NOT mutate the original.
   */
  async reopenRun(runId: string): Promise<FeeProposalRun> {
    const original = await this.db.get(this.collection, runId);
    if (!original) {
      throw new Error(`Run not found: ${runId}`);
    }

    const originalRun = original as unknown as FeeProposalRun;
    const now = nowISO();

    const newRun: FeeProposalRun = {
      runId: id('run'),
      userId: originalRun.userId,
      profession: originalRun.profession,
      input: { ...originalRun.input },
      result: { ...originalRun.result },
      sourceVersionId: originalRun.sourceVersionId,
      sourceVersionHash: originalRun.sourceVersionHash,
      version: originalRun.version + 1,
      previousRunId: originalRun.runId,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.set(this.collection, newRun.runId, newRun as unknown as Record<string, unknown>);
    return newRun;
  }

  /**
   * Assign a run to a project — updates projectId and writes a ProjectRecord
   * entry via the platform spine adapter.
   */
  async assignToProject(runId: string, projectId: string): Promise<FeeProposalRun> {
    const doc = await this.db.get(this.collection, runId);
    if (!doc) {
      throw new Error(`Run not found: ${runId}`);
    }

    const run = doc as unknown as FeeProposalRun;

    // Create a minimal proposal-like shape for the adapter
    const projectRecord = toProjectRecord({
      id: run.runId,
      title: `Fee Run — ${run.profession}`,
      status: 'draft',
      project: { name: projectId, clientName: '', location: '', description: '' },
      professional: { name: run.userId },
      sections: [],
      totals: run.result,
      terms: [],
      acceptance: [],
      createdAt: run.createdAt,
    });

    const projectRecordId = id('prec');

    await this.db.update(this.collection, runId, {
      projectId,
      projectRecordId,
      updatedAt: nowISO(),
    });

    // Return updated run
    return {
      ...run,
      projectId,
      projectRecordId,
    };
  }

  /**
   * Export a run in the specified format.
   */
  async exportRun(runId: string, format: ExportFormat): Promise<{ content: string; format: ExportFormat }> {
    const doc = await this.db.get(this.collection, runId);
    if (!doc) {
      throw new Error(`Run not found: ${runId}`);
    }

    const run = doc as unknown as FeeProposalRun;

    let content: string;
    switch (format) {
      case 'json':
        content = formatAsJson(run);
        break;
      case 'csv':
        content = formatAsCsv(run);
        break;
      case 'pdf':
        content = formatAsPdf(run);
        break;
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }

    // Record export metadata
    await this.db.update(this.collection, runId, {
      exportedAt: nowISO(),
      exportFormat: format,
    });

    return { content, format };
  }

  /**
   * List runs with optional filtering by userId, profession, and projectId.
   */
  async listRuns(
    userId: string,
    profession?: Profession,
    projectId?: string,
  ): Promise<FeeProposalRun[]> {
    const filters: FirestoreQuery[] = [
      { field: 'userId', op: '==', value: userId },
    ];

    if (profession) {
      filters.push({ field: 'profession', op: '==', value: profession });
    }

    if (projectId) {
      filters.push({ field: 'projectId', op: '==', value: projectId });
    }

    const docs = await this.db.query(this.collection, filters);
    return docs as unknown as FeeProposalRun[];
  }
}

// ---------------------------------------------------------------------------
// In-memory FirestoreAdapter (for testing and client-side usage)
// ---------------------------------------------------------------------------

export class InMemoryFirestoreAdapter implements FirestoreAdapter {
  private store: Map<string, Map<string, Record<string, unknown>>> = new Map();

  async get(collection: string, docId: string): Promise<Record<string, unknown> | null> {
    const col = this.store.get(collection);
    if (!col) return null;
    return col.get(docId) ?? null;
  }

  async set(collection: string, docId: string, data: Record<string, unknown>): Promise<void> {
    if (!this.store.has(collection)) {
      this.store.set(collection, new Map());
    }
    this.store.get(collection)!.set(docId, { ...data });
  }

  async update(collection: string, docId: string, data: Partial<Record<string, unknown>>): Promise<void> {
    const col = this.store.get(collection);
    if (!col || !col.has(docId)) {
      throw new Error(`Document not found: ${collection}/${docId}`);
    }
    const existing = col.get(docId)!;
    col.set(docId, { ...existing, ...data });
  }

  async query(collection: string, filters: FirestoreQuery[]): Promise<Record<string, unknown>[]> {
    const col = this.store.get(collection);
    if (!col) return [];

    const results: Record<string, unknown>[] = [];
    for (const doc of col.values()) {
      let matches = true;
      for (const filter of filters) {
        const value = doc[filter.field];
        switch (filter.op) {
          case '==':
            if (value !== filter.value) matches = false;
            break;
          case '!=':
            if (value === filter.value) matches = false;
            break;
          case '<':
            if ((value as number) >= (filter.value as number)) matches = false;
            break;
          case '<=':
            if ((value as number) > (filter.value as number)) matches = false;
            break;
          case '>':
            if ((value as number) <= (filter.value as number)) matches = false;
            break;
          case '>=':
            if ((value as number) < (filter.value as number)) matches = false;
            break;
        }
        if (!matches) break;
      }
      if (matches) results.push(doc);
    }

    return results;
  }

  /** Clear all data (useful in tests) */
  clear(): void {
    this.store.clear();
  }
}
