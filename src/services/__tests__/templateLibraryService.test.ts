import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as firestore from 'firebase/firestore';

const handleFirestoreErrorMock = vi.fn((error: unknown) => { throw error; });

vi.mock('@/lib/firebase', () => ({
  db: { name: 'test-db' },
  OperationType: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LIST: 'list', GET: 'get', WRITE: 'write' },
  handleFirestoreError: handleFirestoreErrorMock,
}));

const collectionMock = vi.mocked(firestore.collection) as any;
const docMock = vi.mocked(firestore.doc) as any;
const getDocMock = vi.mocked(firestore.getDoc) as any;
const getDocsMock = vi.mocked(firestore.getDocs) as any;
const setDocMock = vi.mocked(firestore.setDoc) as any;
const updateDocMock = vi.mocked(firestore.updateDoc) as any;
const writeBatchMock = vi.mocked(firestore.writeBatch) as any;
const queryMock = vi.mocked(firestore.query) as any;
const whereMock = vi.mocked(firestore.where) as any;
const orderByMock = vi.mocked(firestore.orderBy) as any;

const snap = (id: string, data: Record<string, unknown> | null) => ({
  id, exists: () => data !== null, data: () => data,
});

describe('templateLibraryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collectionMock.mockImplementation((_db: unknown, ...s: string[]) => ({ path: s.join('/') }));
    docMock.mockImplementation((dbOrCol: { path?: string } | unknown, ...s: string[]) => {
      if (s.length === 0) return { path: 'templates', id: 'generated-tmpl-id' };
      return { path: s.join('/'), id: s[s.length - 1] };
    });
    queryMock.mockImplementation((base: unknown, ...c: unknown[]) => ({ base, constraints: c }));
    whereMock.mockImplementation((field: string, op: string, value: unknown) => ({ field, op, value }));
    orderByMock.mockImplementation((field: string, dir: string) => ({ field, dir }));
    setDocMock.mockResolvedValue(undefined);
    updateDocMock.mockResolvedValue(undefined);
    getDocsMock.mockResolvedValue({ docs: [] });
    getDocMock.mockResolvedValue(snap('test-id', null));
    writeBatchMock.mockReturnValue({ set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) });
  });

  it('creates a template with initial version', async () => {
    const { createTemplate } = await import('../templateLibraryService');
    const template = await createTemplate({
      firmId: 'firm-1', name: 'Appointment Letter', category: 'appointment',
      roles: ['architect', 'bep'], tags: ['legal', 'onboarding'],
      createdBy: 'user-1',
    });
    expect(template).toEqual(expect.objectContaining({
      firmId: 'firm-1', name: 'Appointment Letter', category: 'appointment',
      version: 1, isActive: true, roles: ['architect', 'bep'],
      createdBy: 'user-1',
    }));
    // setDoc called twice: once for template, once for initial version
    expect(setDocMock).toHaveBeenCalledTimes(2);
  });

  it('throws for missing required fields', async () => {
    const { createTemplate } = await import('../templateLibraryService');
    await expect(createTemplate({
      firmId: '', name: '', category: '' as any, createdBy: '',
    })).rejects.toThrow();
  });

  it('throws for invalid category', async () => {
    const { createTemplate } = await import('../templateLibraryService');
    await expect(createTemplate({
      firmId: 'f1', name: 'Bad', category: 'invalid' as any, createdBy: 'u1',
    })).rejects.toThrow('Invalid template category');
  });

  it('updates template metadata', async () => {
    const { updateTemplate } = await import('../templateLibraryService');
    await updateTemplate('tmpl-1', { name: 'Updated Name', isActive: false });
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock.mock.calls[0][1].name).toBe('Updated Name');
    expect(updateDocMock.mock.calls[0][1].isActive).toBe(false);
  });

  it('creates a new version of a template', async () => {
    const { versionTemplate } = await import('../templateLibraryService');
    getDocMock.mockResolvedValueOnce(snap('tmpl-1', {
      firmId: 'firm-1', name: 'Letter', category: 'general', version: 3,
      fileUrl: 'old-url', fileName: 'old.pdf', roles: [], isActive: true,
      createdBy: 'u1', createdAt: '2024-01-01',
    }));
    const result = await versionTemplate('tmpl-1', {
      fileUrl: 'new-url', fileName: 'new.pdf',
      changes: 'Updated header and footer', createdBy: 'user-1',
    });
    expect(result.version).toBe(4);
    expect(writeBatchMock).toHaveBeenCalled();
  });

  it('throws when versioning non-existent template', async () => {
    const { versionTemplate } = await import('../templateLibraryService');
    getDocMock.mockResolvedValueOnce(snap('bad-id', null));
    await expect(versionTemplate('bad-id', {
      changes: 'Update', createdBy: 'u1',
    })).rejects.toThrow('Template not found');
  });

  it('gets firm templates with category filter', async () => {
    const { getFirmTemplates } = await import('../templateLibraryService');
    getDocsMock.mockResolvedValueOnce({
      docs: [
        snap('t1', { firmId: 'firm-1', name: 'Template A', category: 'report', version: 1, roles: [], isActive: true, createdBy: 'u1', createdAt: '2024-01-01' }),
      ],
    });
    const templates = await getFirmTemplates('firm-1', { category: 'report' });
    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe('Template A');
  });

  it('filters templates by role', async () => {
    const { getTemplatesByRole } = await import('../templateLibraryService');
    getDocsMock.mockResolvedValueOnce({
      docs: [
        snap('t1', { firmId: 'firm-1', name: 'Arch Only', category: 'general', version: 1, roles: ['architect'], isActive: true, createdBy: 'u1', createdAt: '2024-01-01' }),
        snap('t2', { firmId: 'firm-1', name: 'All Roles', category: 'general', version: 1, roles: [], isActive: true, createdBy: 'u1', createdAt: '2024-01-02' }),
        snap('t3', { firmId: 'firm-1', name: 'BEP Only', category: 'general', version: 1, roles: ['bep'], isActive: true, createdBy: 'u1', createdAt: '2024-01-03' }),
      ],
    });
    const templates = await getTemplatesByRole('firm-1', 'architect');
    // Should get 'Arch Only' and 'All Roles' (empty roles = all roles)
    expect(templates).toHaveLength(2);
  });

  it('gets template versions', async () => {
    const { getTemplateVersions } = await import('../templateLibraryService');
    getDocsMock.mockResolvedValueOnce({
      docs: [
        snap('v3', { templateId: 'tmpl-1', version: 3, changes: 'V3 changes', createdBy: 'u1', createdAt: '2024-03-01' }),
        snap('v2', { templateId: 'tmpl-1', version: 2, changes: 'V2 changes', createdBy: 'u1', createdAt: '2024-02-01' }),
        snap('v1', { templateId: 'tmpl-1', version: 1, changes: 'Initial', createdBy: 'u1', createdAt: '2024-01-01' }),
      ],
    });
    const versions = await getTemplateVersions('tmpl-1');
    expect(versions).toHaveLength(3);
    expect(versions[0].version).toBe(3); // Descending order
  });

  it('deletes template and its versions', async () => {
    const { deleteTemplate } = await import('../templateLibraryService');
    getDocsMock.mockResolvedValueOnce({ docs: [snap('v1', { templateId: 'tmpl-1', version: 1, changes: 'V1', createdBy: 'u1', createdAt: '2024-01-01' })] });
    await deleteTemplate('tmpl-1');
    expect(writeBatchMock).toHaveBeenCalled();
    // Batch delete should delete both template and version
  });
});
