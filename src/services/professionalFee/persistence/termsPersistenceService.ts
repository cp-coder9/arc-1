/**
 * TermsPersistenceService — CRUD for terms templates with versioning.
 *
 * Manages professional appointment terms templates: create, edit clauses,
 * and list/filter by profession.
 */

import type { FirestoreAdapter, QueryFilter } from './runPersistenceService';
import type { Profession } from '../types';
import { id as generateId } from '../ids';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PersistedTermsTemplate {
  id: string;
  title: string;
  professions: string[];
  clauses: string[];
  legalReviewed: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateInput {
  title: string;
  professions?: string[];
  clauses: string[];
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
   * List templates, optionally filtered by profession.
   */
  async getTemplates(profession?: string): Promise<PersistedTermsTemplate[]> {
    // Query all and filter in-memory since professions is an array field
    const docs = await this.db.query(this.collection, []);
    const templates = docs as unknown as PersistedTermsTemplate[];
    if (!profession) return templates;
    return templates.filter(
      (t) => t.professions.includes('all') || t.professions.includes(profession)
    );
  }

  /**
   * Create a new terms template.
   */
  async createTemplate(input: CreateTemplateInput): Promise<PersistedTermsTemplate> {
    const now = new Date().toISOString();
    const template: PersistedTermsTemplate = {
      id: generateId('terms'),
      title: input.title,
      professions: input.professions ?? ['all'],
      clauses: input.clauses,
      legalReviewed: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.set(this.collection, template.id, template as unknown as Record<string, unknown>);
    return template;
  }

  /**
   * Edit a template's clauses (increments version).
   */
  async editClause(templateId: string, updates: { clauses?: string[]; title?: string }): Promise<PersistedTermsTemplate> {
    const doc = await this.db.get(this.collection, templateId);
    if (!doc) throw new Error(`Terms template not found: ${templateId}`);

    const template = doc as unknown as PersistedTermsTemplate;
    const now = new Date().toISOString();
    const patched: Partial<Record<string, unknown>> = {
      version: template.version + 1,
      updatedAt: now,
    };
    if (updates.clauses) patched.clauses = updates.clauses;
    if (updates.title) patched.title = updates.title;

    await this.db.update(this.collection, templateId, patched);
    return { ...template, ...patched } as unknown as PersistedTermsTemplate;
  }
}
