/**
 * TermsPersistenceService — manages terms templates with versioning.
 *
 * Uses the same FirestoreAdapter interface from runPersistenceService.ts
 * for storage abstraction. When a clause is edited, the ENTIRE template
 * is versioned (new record with incremented version). The old version
 * stays in the store unchanged.
 */

import type { FeeTermsTemplateRecord, TermsClause } from './types';
import type { FirestoreAdapter } from './runPersistenceService';
import { id } from '../ids';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowISO(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// TermsPersistenceService
// ---------------------------------------------------------------------------

export class TermsPersistenceService {
  private readonly db: FirestoreAdapter;
  private readonly collection = 'fee_terms_templates';

  constructor(db: FirestoreAdapter) {
    this.db = db;
  }

  /**
   * Create a new terms template.
   */
  async createTemplate(
    name: string,
    professionTags: string[],
    clauses: TermsClause[],
    createdBy: string,
  ): Promise<FeeTermsTemplateRecord> {
    const now = nowISO();
    const template: FeeTermsTemplateRecord = {
      id: id('tmpl'),
      name,
      professionTags,
      version: 1,
      clauses,
      legalReviewFlag: false,
      createdBy,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.set(this.collection, template.id, template as unknown as Record<string, unknown>);
    return template;
  }

  /**
   * List templates, optionally filtered by profession tags.
   * Returns templates where any tag in professionTags matches any of the query tags.
   */
  async getTemplates(professionTags?: string[]): Promise<FeeTermsTemplateRecord[]> {
    // Query all templates from the collection
    const allDocs = await this.db.query(this.collection, []);
    const templates = allDocs as unknown as FeeTermsTemplateRecord[];

    if (!professionTags || professionTags.length === 0) {
      return templates;
    }

    // Filter by checking if any tag in template's professionTags matches query tags
    return templates.filter((template) =>
      template.professionTags.some((tag) => professionTags.includes(tag)),
    );
  }

  /**
   * Edit a clause within a template — creates a NEW version record.
   * The old version stays in the store unchanged.
   * Returns the new version.
   */
  async editClause(
    templateId: string,
    clauseId: string,
    newText: string,
  ): Promise<FeeTermsTemplateRecord> {
    const doc = await this.db.get(this.collection, templateId);
    if (!doc) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const original = doc as unknown as FeeTermsTemplateRecord;

    // Validate clause exists in the template
    const clauseIndex = original.clauses.findIndex((c) => c.id === clauseId);
    if (clauseIndex === -1) {
      throw new Error(`Clause not found: ${clauseId} in template ${templateId}`);
    }

    // Create updated clauses array with the edited clause
    const now = nowISO();
    const updatedClauses: TermsClause[] = original.clauses.map((clause) => {
      if (clause.id === clauseId) {
        return { ...clause, text: newText, editedAt: now };
      }
      return { ...clause };
    });

    // Create new version record
    const newVersion: FeeTermsTemplateRecord = {
      id: id('tmpl'),
      name: original.name,
      professionTags: [...original.professionTags],
      version: original.version + 1,
      clauses: updatedClauses,
      legalReviewFlag: false, // Reset legal review on edit
      createdBy: original.createdBy,
      previousVersionId: original.id,
      createdAt: original.createdAt,
      updatedAt: now,
    };

    await this.db.set(this.collection, newVersion.id, newVersion as unknown as Record<string, unknown>);
    return newVersion;
  }

  /**
   * Mark a template as legally reviewed.
   */
  async setLegalReviewFlag(
    templateId: string,
    reviewedBy: string,
  ): Promise<FeeTermsTemplateRecord> {
    const doc = await this.db.get(this.collection, templateId);
    if (!doc) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const now = nowISO();
    await this.db.update(this.collection, templateId, {
      legalReviewFlag: true,
      legalReviewedAt: now,
      legalReviewedBy: reviewedBy,
      updatedAt: now,
    });

    const template = doc as unknown as FeeTermsTemplateRecord;
    return {
      ...template,
      legalReviewFlag: true,
      legalReviewedAt: now,
      legalReviewedBy: reviewedBy,
      updatedAt: now,
    };
  }

  /**
   * Get a single template by ID (useful for retrieving previous versions).
   */
  async getTemplate(templateId: string): Promise<FeeTermsTemplateRecord | null> {
    const doc = await this.db.get(this.collection, templateId);
    if (!doc) return null;
    return doc as unknown as FeeTermsTemplateRecord;
  }
}
