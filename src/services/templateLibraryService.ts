import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import type { PracticeTemplate, TemplateCategory, TemplateVersion } from '@/types';
import type { UserRole } from '@/types';

const TEMPLATES_COL = 'templates';
const TEMPLATE_VERSIONS_COL = 'template_versions';

const VALID_CATEGORIES: TemplateCategory[] = ['appointment', 'certificate', 'report', 'submission', 'contract', 'invoice', 'general'];

function assertValidCategory(category: TemplateCategory): void {
  if (!VALID_CATEGORIES.includes(category)) throw new Error(`Invalid template category: ${category}`);
}

export async function createTemplate(input: {
  firmId: string;
  name: string;
  description?: string;
  category: TemplateCategory;
  fileUrl?: string;
  fileName?: string;
  roles?: UserRole[];
  tags?: string[];
  createdBy: string;
}): Promise<PracticeTemplate> {
  try {
    if (!input.firmId || !input.name || !input.category || !input.createdBy) {
      throw new Error('firmId, name, category, and createdBy are required.');
    }
    assertValidCategory(input.category);

    const now = new Date().toISOString();
    const ref = doc(collection(db, TEMPLATES_COL));
    const template: PracticeTemplate = {
      id: ref.id,
      firmId: input.firmId,
      name: input.name.trim(),
      description: input.description?.trim(),
      category: input.category,
      version: 1,
      fileUrl: input.fileUrl,
      fileName: input.fileName,
      roles: input.roles || [],
      tags: input.tags,
      isActive: true,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(ref, template);

    // Create initial version record
    const versionRef = doc(collection(db, TEMPLATE_VERSIONS_COL));
    const version: TemplateVersion = {
      id: versionRef.id,
      templateId: ref.id,
      version: 1,
      fileUrl: input.fileUrl,
      fileName: input.fileName,
      changes: 'Initial version',
      createdBy: input.createdBy,
      createdAt: now,
    };
    await setDoc(versionRef, version);

    return template;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, TEMPLATES_COL);
  }
}

export async function updateTemplate(id: string, updates: {
  name?: string;
  description?: string;
  category?: TemplateCategory;
  roles?: UserRole[];
  tags?: string[];
  isActive?: boolean;
}): Promise<void> {
  try {
    if (updates.category) assertValidCategory(updates.category);

    const data: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (updates.name !== undefined) data.name = updates.name.trim();
    if (updates.description !== undefined) data.description = updates.description.trim();
    if (updates.category !== undefined) data.category = updates.category;
    if (updates.roles !== undefined) data.roles = updates.roles;
    if (updates.tags !== undefined) data.tags = updates.tags;
    if (updates.isActive !== undefined) data.isActive = updates.isActive;

    await updateDoc(doc(db, TEMPLATES_COL, id), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${TEMPLATES_COL}/${id}`);
  }
}

export async function versionTemplate(templateId: string, input: {
  fileUrl?: string;
  fileName?: string;
  changes: string;
  createdBy: string;
}): Promise<PracticeTemplate> {
  try {
    if (!input.changes || !input.createdBy) {
      throw new Error('changes and createdBy are required.');
    }

    const templateSnap = await getDoc(doc(db, TEMPLATES_COL, templateId));
    if (!templateSnap.exists()) throw new Error('Template not found.');

    const template = { id: templateSnap.id, ...templateSnap.data() } as PracticeTemplate;
    const newVersion = template.version + 1;
    const now = new Date().toISOString();

    // Create new version record
    const versionRef = doc(collection(db, TEMPLATE_VERSIONS_COL));
    const version: TemplateVersion = {
      id: versionRef.id,
      templateId,
      version: newVersion,
      fileUrl: input.fileUrl || template.fileUrl,
      fileName: input.fileName || template.fileName,
      changes: input.changes,
      createdBy: input.createdBy,
      createdAt: now,
    };

    // Update template with new version and file info
    const batch = writeBatch(db);
    batch.set(versionRef, version);
    batch.update(doc(db, TEMPLATES_COL, templateId), {
      version: newVersion,
      fileUrl: input.fileUrl || template.fileUrl,
      fileName: input.fileName || template.fileName,
      updatedAt: now,
    });
    await batch.commit();

    return { ...template, version: newVersion, fileUrl: input.fileUrl || template.fileUrl, fileName: input.fileName || template.fileName, updatedAt: now };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${TEMPLATE_VERSIONS_COL}/${templateId}`);
  }
}

export async function getTemplate(id: string): Promise<PracticeTemplate | null> {
  try {
    const snap = await getDoc(doc(db, TEMPLATES_COL, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as PracticeTemplate) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${TEMPLATES_COL}/${id}`);
  }
}

export async function getFirmTemplates(firmId: string, filters?: { category?: TemplateCategory; isActive?: boolean }): Promise<PracticeTemplate[]> {
  try {
    const constraints = [where('firmId', '==', firmId), orderBy('name', 'asc')];
    if (filters?.category) constraints.unshift(where('category', '==', filters.category));
    if (filters?.isActive !== undefined) constraints.unshift(where('isActive', '==', filters.isActive));

    const q = query(collection(db, TEMPLATES_COL), ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as PracticeTemplate));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, TEMPLATES_COL);
  }
}

export async function getTemplatesByRole(firmId: string, role: UserRole): Promise<PracticeTemplate[]> {
  try {
    const allTemplates = await getFirmTemplates(firmId, { isActive: true });
    return allTemplates.filter((t) => t.roles.length === 0 || t.roles.includes(role));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, TEMPLATES_COL);
  }
}

export async function getTemplateVersions(templateId: string): Promise<TemplateVersion[]> {
  try {
    const q = query(
      collection(db, TEMPLATE_VERSIONS_COL),
      where('templateId', '==', templateId),
      orderBy('version', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as TemplateVersion));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${TEMPLATE_VERSIONS_COL}/${templateId}`);
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, TEMPLATES_COL, id));
    // Also clean up versions
    const versions = await getTemplateVersions(id);
    for (const v of versions) {
      batch.delete(doc(db, TEMPLATE_VERSIONS_COL, v.id));
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${TEMPLATES_COL}/${id}`);
  }
}

export function subscribeToFirmTemplates(firmId: string, callback: (templates: PracticeTemplate[]) => void): () => void {
  return onSnapshot(
    query(collection(db, TEMPLATES_COL), where('firmId', '==', firmId), orderBy('name', 'asc')),
    (snapshot) => callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as PracticeTemplate))),
    (error) => {
      console.error('Failed to subscribe to templates:', error);
      callback([]);
    }
  );
}

export const templateLibraryService = {
  createTemplate,
  updateTemplate,
  versionTemplate,
  getTemplate,
  getFirmTemplates,
  getTemplatesByRole,
  getTemplateVersions,
  deleteTemplate,
  subscribeToFirmTemplates,
};

export default templateLibraryService;
