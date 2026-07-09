// ─── Form Template Service ──────────────────────────────────────────────────
// CRUD operations, search/filter, version management, and municipality-priority
// sorting for form templates in the Firestore `form_templates` collection.
// Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  getCountFromServer,
  Timestamp,
  writeBatch,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { FormTemplate, TemplateFilters } from '@/services/forms/formTypes';

const COLLECTION_NAME = 'form_templates';
const DEFAULT_PAGE_SIZE = 20;

// ─── Helpers ────────────────────────────────────────────────────────────────

function templatesRef() {
  return collection(db, COLLECTION_NAME);
}

function templateDocRef(id: string) {
  return doc(db, COLLECTION_NAME, id);
}

function generateId(): string {
  return doc(collection(db, COLLECTION_NAME)).id;
}

// ─── Create ─────────────────────────────────────────────────────────────────

/**
 * Creates a new form template in Firestore.
 * Requirements: 1.6 — platform admins can add custom templates with
 * category, municipalities[], lifecycleStage, and formType.
 */
export async function createTemplate(
  template: Omit<FormTemplate, 'id' | 'createdAt' | 'updatedAt'>
): Promise<FormTemplate> {
  const id = generateId();
  const now = Timestamp.now();

  const newTemplate: FormTemplate = {
    ...template,
    id,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(templateDocRef(id), newTemplate);
  return newTemplate;
}

// ─── Read ───────────────────────────────────────────────────────────────────

/**
 * Retrieves a single template by ID.
 */
export async function getTemplate(id: string): Promise<FormTemplate | null> {
  const snap = await getDoc(templateDocRef(id));
  if (!snap.exists()) return null;
  return snap.data() as FormTemplate;
}

// ─── Search / Filter ────────────────────────────────────────────────────────

export interface SearchResult {
  templates: FormTemplate[];
  totalPages: number;
}

/**
 * Searches templates with filters, pagination (max 20/page), and optional
 * municipality-priority sorting.
 *
 * Requirements:
 * 1.2 — filter by category, municipality, lifecycle stage, form type; 2s response; 20/page
 * 1.3 — caller receives empty array + totalPages=0 when no results match
 * 1.5 — municipality-priority: templates for the given municipality appear first
 */
export async function searchTemplates(
  filters: TemplateFilters,
  priorityMunicipality?: string
): Promise<SearchResult> {
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const page = filters.page ?? 1;

  // Build query constraints — Firestore requires composite indexes for multi-field queries.
  // We always filter to isLatest=true so users see current versions only.
  const constraints: QueryConstraint[] = [
    where('isLatest', '==', true),
  ];

  if (filters.category) {
    constraints.push(where('category', '==', filters.category));
  }

  if (filters.municipality) {
    constraints.push(where('municipalities', 'array-contains', filters.municipality));
  }

  if (filters.lifecycleStage) {
    constraints.push(where('lifecycleStages', 'array-contains', filters.lifecycleStage));
  }

  if (filters.formType) {
    constraints.push(where('formType', '==', filters.formType));
  }

  // Get total count for pagination
  const countQuery = query(templatesRef(), ...constraints);
  const countSnap = await getCountFromServer(countQuery);
  const totalCount = countSnap.data().count;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  if (totalCount === 0) {
    return { templates: [], totalPages: 0 };
  }

  // Fetch the page of results ordered by name
  const dataConstraints: QueryConstraint[] = [
    ...constraints,
    orderBy('name', 'asc'),
    limit(pageSize * page), // Fetch up to current page offset
  ];

  const dataQuery = query(templatesRef(), ...dataConstraints);
  const dataSnap = await getDocs(dataQuery);

  // Slice to the requested page
  const startIndex = (page - 1) * pageSize;
  const allDocs = dataSnap.docs.slice(startIndex, startIndex + pageSize);
  let templates = allDocs.map((d) => d.data() as FormTemplate);

  // Client-side text search filter (for name matching)
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    templates = templates.filter(
      (t) =>
        t.name.toLowerCase().includes(searchLower) ||
        t.formType.toLowerCase().includes(searchLower)
    );
  }

  // Municipality-priority sorting: templates matching the priority municipality come first
  if (priorityMunicipality) {
    templates = sortByMunicipalityPriority(templates, priorityMunicipality);
  }

  return { templates, totalPages };
}

/**
 * Sorts templates so those matching the given municipality appear first,
 * preserving alphabetical order within each group.
 * Requirement 1.5
 */
function sortByMunicipalityPriority(
  templates: FormTemplate[],
  municipality: string
): FormTemplate[] {
  const priority: FormTemplate[] = [];
  const rest: FormTemplate[] = [];

  for (const t of templates) {
    if (t.municipalities.includes(municipality)) {
      priority.push(t);
    } else {
      rest.push(t);
    }
  }

  return [...priority, ...rest];
}

// ─── Update ─────────────────────────────────────────────────────────────────

/**
 * Updates a template's metadata. Does not create a new version —
 * use `publishNewVersion` for version bumps.
 */
export async function updateTemplate(
  id: string,
  updates: Partial<FormTemplate>
): Promise<FormTemplate> {
  const ref = templateDocRef(id);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error(`Template not found: ${id}`);
  }

  const updatedFields = {
    ...updates,
    updatedAt: Timestamp.now(),
  };

  // Prevent overwriting system-managed fields
  delete (updatedFields as Partial<FormTemplate>).id;
  delete (updatedFields as Partial<FormTemplate>).createdAt;

  await updateDoc(ref, updatedFields);

  const updatedSnap = await getDoc(ref);
  return updatedSnap.data() as FormTemplate;
}

// ─── Version Management ─────────────────────────────────────────────────────

/**
 * Publishes a new version of an existing template.
 * - Creates a new template document with incremented version and isLatest=true
 * - Marks the previous version as isLatest=false
 * - Existing FormInstances retain their original template version (by templateId + templateVersion)
 *
 * Requirement 1.7: new version becomes default for new instances; previous versions
 * remain accessible for existing instances that used them.
 */
export async function publishNewVersion(
  templateId: string,
  updates: Partial<FormTemplate>
): Promise<FormTemplate> {
  const existingRef = templateDocRef(templateId);
  const existingSnap = await getDoc(existingRef);

  if (!existingSnap.exists()) {
    throw new Error(`Template not found: ${templateId}`);
  }

  const existing = existingSnap.data() as FormTemplate;
  const now = Timestamp.now();
  const newVersion = existing.version + 1;
  const newId = generateId();

  // Build new version document
  const newTemplate: FormTemplate = {
    ...existing,
    ...updates,
    id: newId,
    version: newVersion,
    isLatest: true,
    createdAt: now,
    updatedAt: now,
  };

  // Prevent updates from overriding critical linkage fields
  newTemplate.category = updates.category ?? existing.category;
  newTemplate.formType = updates.formType ?? existing.formType;

  // Atomic batch: mark old as not latest, create new version
  const batch = writeBatch(db);
  batch.update(existingRef, { isLatest: false, updatedAt: now });
  batch.set(doc(db, COLLECTION_NAME, newId), newTemplate);
  await batch.commit();

  return newTemplate;
}
