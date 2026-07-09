/**
 * Standalone Workspace Service — Unit Tests
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock Firestore (hoisted) ────────────────────────────────────────────────

const { mockSet, mockDelete, mockGet, mockDocFn, mockCollectionFn, mockBatchCommit } = vi.hoisted(() => {
  const mockSet = vi.fn().mockResolvedValue(undefined);
  const mockDelete = vi.fn().mockResolvedValue(undefined);
  const mockGet = vi.fn().mockResolvedValue({ exists: false, data: () => null });
  const mockBatchCommit = vi.fn().mockResolvedValue(undefined);

  const mockDocFn = vi.fn().mockImplementation(() => ({
    id: 'mock-doc-id',
    get: mockGet,
    set: mockSet,
    delete: mockDelete,
    collection: vi.fn().mockImplementation(() => ({
      doc: mockDocFn,
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
    })),
  }));

  const mockCollectionFn = vi.fn().mockImplementation(() => ({
    doc: mockDocFn,
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  }));

  return { mockSet, mockDelete, mockGet, mockDocFn, mockCollectionFn, mockBatchCommit };
});

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: mockCollectionFn,
    batch: vi.fn(() => ({
      set: vi.fn(),
      delete: vi.fn(),
      commit: mockBatchCommit,
    })),
  },
}));

import { create, list, assignToProject } from '../standaloneWorkspaceService';
import { SpecForgeValidationError } from '../specforgeErrors';

// ── Tests ───────────────────────────────────────────────────────────────────

describe('standaloneWorkspaceService', () => {
  beforeEach(() => {
    // Only clear call history, not implementations (hoisted mocks need their implementations)
    mockSet.mockClear();
    mockDelete.mockClear();
    mockGet.mockClear();
    mockDocFn.mockClear();
    mockBatchCommit.mockClear();

    // Restore the default mockCollectionFn implementation
    mockCollectionFn.mockImplementation(() => ({
      doc: mockDocFn,
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
    }));

    // Restore default mockDocFn implementation
    mockDocFn.mockImplementation(() => ({
      id: 'mock-doc-id',
      get: mockGet,
      set: mockSet,
      delete: mockDelete,
      collection: vi.fn().mockImplementation(() => ({
        doc: mockDocFn,
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
      })),
    }));

    // Restore default mockGet
    mockGet.mockResolvedValue({ exists: false, data: () => null });
  });

  describe('create()', () => {
    it('creates a user-scoped standalone workspace with correct fields', async () => {
      const result = await create({
        uid: 'user-001',
        projectReference: 'Beach House, Camps Bay',
        scope: 'user',
        name: 'Beach House Spec',
      });

      expect(result.scope).toBe('user');
      expect(result.ownerId).toBe('user-001');
      expect(result.projectReference).toBe('Beach House, Camps Bay');
      expect(result.projectName).toBe('Beach House Spec');
      expect(result.id).toMatch(/^sw-/);
      expect(result.projectId).toBe('');
      expect(result.profile).toBe('standalone');
      expect(result.issueStatus).toBe('draft');
      expect(result.stage).toBe('brief');
      expect(result.revision).toBe('0.1');
      expect(result.sections).toEqual([]);
      expect(result.items).toEqual([]);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      expect(new Date(result.createdAt).toISOString()).toBe(result.createdAt);
    });

    it('creates a firm-scoped standalone workspace', async () => {
      const result = await create({
        uid: 'user-001',
        projectReference: 'Office Complex, Sandton',
        scope: 'firm',
        firmId: 'firm-abc',
        name: 'Sandton Office',
      });

      expect(result.scope).toBe('firm');
      expect(result.ownerId).toBe('firm-abc');
      expect(result.projectReference).toBe('Office Complex, Sandton');
    });

    it('throws SpecForgeValidationError when projectReference is empty', async () => {
      await expect(
        create({
          uid: 'user-001',
          projectReference: '',
          scope: 'user',
          name: 'Test',
        }),
      ).rejects.toThrow(SpecForgeValidationError);
    });

    it('throws SpecForgeValidationError when projectReference exceeds 500 chars', async () => {
      const longRef = 'x'.repeat(501);
      await expect(
        create({
          uid: 'user-001',
          projectReference: longRef,
          scope: 'user',
          name: 'Test',
        }),
      ).rejects.toThrow(SpecForgeValidationError);
    });

    it('accepts projectReference at exactly 500 chars', async () => {
      const maxRef = 'x'.repeat(500);
      const result = await create({
        uid: 'user-001',
        projectReference: maxRef,
        scope: 'user',
        name: 'Test',
      });

      expect(result.projectReference).toBe(maxRef);
      expect(result.projectReference.length).toBe(500);
    });

    it('accepts projectReference at exactly 1 char', async () => {
      const result = await create({
        uid: 'user-001',
        projectReference: 'A',
        scope: 'user',
        name: 'Test',
      });

      expect(result.projectReference).toBe('A');
    });

    it('throws when firm scope is used without firmId', async () => {
      await expect(
        create({
          uid: 'user-001',
          projectReference: 'Some project',
          scope: 'firm',
          name: 'Test',
        }),
      ).rejects.toThrow('firmId is required for firm-scoped workspaces');
    });

    it('throws SpecForgeValidationError when name is empty', async () => {
      await expect(
        create({
          uid: 'user-001',
          projectReference: 'Valid reference',
          scope: 'user',
          name: '',
        }),
      ).rejects.toThrow(SpecForgeValidationError);
    });

    it('throws SpecForgeValidationError when name exceeds 200 chars', async () => {
      const longName = 'n'.repeat(201);
      await expect(
        create({
          uid: 'user-001',
          projectReference: 'Valid reference',
          scope: 'user',
          name: longName,
        }),
      ).rejects.toThrow(SpecForgeValidationError);
    });

    it('persists to Firestore via set()', async () => {
      await create({
        uid: 'user-001',
        projectReference: 'My House',
        scope: 'user',
        name: 'My House Spec',
      });

      // The collection -> doc -> set chain should have been called
      expect(mockCollectionFn).toHaveBeenCalledWith('users');
      expect(mockSet).toHaveBeenCalledTimes(1);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'user',
          ownerId: 'user-001',
          projectReference: 'My House',
          projectName: 'My House Spec',
        }),
      );
    });

    it('persists firm-scoped workspace to firms collection', async () => {
      await create({
        uid: 'user-001',
        projectReference: 'Firm Project',
        scope: 'firm',
        firmId: 'firm-123',
        name: 'Firm Spec',
      });

      expect(mockCollectionFn).toHaveBeenCalledWith('firms');
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'firm',
          ownerId: 'firm-123',
        }),
      );
    });
  });

  describe('list()', () => {
    it('returns empty array when no workspaces exist', async () => {
      const result = await list('user-001', []);
      expect(result).toEqual([]);
    });

    it('queries user-scoped collection', async () => {
      await list('user-001', []);

      expect(mockCollectionFn).toHaveBeenCalledWith('users');
    });

    it('queries firm-scoped collections for each firmId', async () => {
      await list('user-001', ['firm-a', 'firm-b']);

      expect(mockCollectionFn).toHaveBeenCalledWith('firms');
    });

    it('returns combined results sorted by updatedAt descending', async () => {
      const userWorkspace = {
        id: 'sw-user-1',
        scope: 'user',
        ownerId: 'user-001',
        updatedAt: '2024-01-15T10:00:00.000Z',
        createdAt: '2024-01-01T00:00:00.000Z',
        projectReference: 'User project',
        projectId: '',
        projectName: 'Test',
        stage: 'brief',
        profile: 'standalone',
        revision: '0.1',
        issueStatus: 'draft',
        sections: [],
        items: [],
      };

      const firmWorkspace = {
        id: 'sw-firm-1',
        scope: 'firm',
        ownerId: 'firm-a',
        updatedAt: '2024-01-20T10:00:00.000Z',
        createdAt: '2024-01-02T00:00:00.000Z',
        projectReference: 'Firm project',
        projectId: '',
        projectName: 'Firm Test',
        stage: 'brief',
        profile: 'standalone',
        revision: '0.1',
        issueStatus: 'draft',
        sections: [],
        items: [],
      };

      // Override mock to return data for this test
      const mockOrderBy = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockReturnThis();

      let callCount = 0;
      const mockGetForList = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            empty: false,
            docs: [{ data: () => userWorkspace }],
          });
        }
        return Promise.resolve({
          empty: false,
          docs: [{ data: () => firmWorkspace }],
        });
      });

      mockCollectionFn.mockImplementation(() => ({
        doc: vi.fn().mockReturnValue({
          collection: vi.fn().mockReturnValue({
            orderBy: mockOrderBy,
            limit: mockLimit,
            get: mockGetForList,
          }),
        }),
      }));

      // Ensure orderBy and limit return the object with get
      mockOrderBy.mockReturnValue({ limit: mockLimit, get: mockGetForList });
      mockLimit.mockReturnValue({ get: mockGetForList });

      const result = await list('user-001', ['firm-a']);

      expect(result.length).toBe(2);
      // Firm workspace is newer, should come first
      expect(result[0].id).toBe('sw-firm-1');
      expect(result[1].id).toBe('sw-user-1');
    });
  });

  describe('assignToProject()', () => {
    it('throws 404 when workspace does not exist', async () => {
      // Wire mock so the source doc doesn't exist
      mockCollectionFn.mockImplementation((colName: string) => {
        if (colName === 'users') {
          return {
            doc: vi.fn().mockReturnValue({
              collection: vi.fn().mockReturnValue({
                doc: vi.fn().mockReturnValue({
                  id: 'nonexistent',
                  get: vi.fn().mockResolvedValue({
                    exists: false,
                    data: () => null,
                  }),
                  collection: vi.fn().mockReturnValue({
                    get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          doc: mockDocFn,
          get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
        };
      });

      try {
        await assignToProject({
          workspaceId: 'nonexistent',
          scope: 'user',
          ownerId: 'user-001',
          projectId: 'proj-001',
          userId: 'user-001',
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.status).toBe(404);
        expect(err.message).toContain('not found');
      }
    });

    it('throws 409 when project already has an active workspace', async () => {
      const existingWorkspace = {
        id: 'sw-existing',
        scope: 'user',
        ownerId: 'user-001',
        projectReference: 'Test project',
        projectId: '',
        projectName: 'Test',
        stage: 'brief',
        profile: 'standalone',
        revision: '0.1',
        issueStatus: 'draft',
        sections: [],
        items: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      // Mock: standalone workspace exists, project already has workspace
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => existingWorkspace,
      });

      // Mock for the specWorkspaces check — project already has a workspace
      const mockSpecWorkspacesGet = vi.fn().mockResolvedValue({
        empty: false,
        docs: [{ id: 'existing-ws' }],
      });

      mockCollectionFn.mockImplementation((colName: string) => {
        if (colName === 'users') {
          return {
            doc: vi.fn().mockReturnValue({
              collection: vi.fn().mockReturnValue({
                doc: vi.fn().mockReturnValue({
                  id: 'sw-existing',
                  get: vi.fn().mockResolvedValue({
                    exists: true,
                    data: () => existingWorkspace,
                  }),
                  collection: vi.fn().mockReturnValue({
                    get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
                  }),
                }),
              }),
            }),
          };
        }
        if (colName === 'projects') {
          return {
            doc: vi.fn().mockReturnValue({
              collection: vi.fn((subcol: string) => {
                if (subcol === 'specWorkspaces') {
                  return {
                    limit: vi.fn().mockReturnValue({
                      get: mockSpecWorkspacesGet,
                    }),
                    doc: vi.fn().mockReturnValue({
                      id: 'ws-id',
                      set: mockSet,
                    }),
                  };
                }
                return {
                  doc: vi.fn().mockReturnValue({ id: 'doc', set: mockSet }),
                  get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
                };
              }),
            }),
          };
        }
        return {
          doc: mockDocFn,
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
        };
      });

      try {
        await assignToProject({
          workspaceId: 'sw-existing',
          scope: 'user',
          ownerId: 'user-001',
          projectId: 'proj-001',
          userId: 'user-001',
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.status).toBe(409);
        expect(err.message).toContain('already has an active workspace');
      }
    });

    it('validates projectReference is between 1 and 500 chars', async () => {
      const invalidWorkspace = {
        id: 'sw-bad',
        scope: 'user',
        ownerId: 'user-001',
        projectReference: '',
        projectId: '',
        projectName: 'Test',
        stage: 'brief',
        profile: 'standalone',
        revision: '0.1',
        issueStatus: 'draft',
        sections: [],
        items: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockCollectionFn.mockImplementation((colName: string) => {
        if (colName === 'users') {
          return {
            doc: vi.fn().mockReturnValue({
              collection: vi.fn().mockReturnValue({
                doc: vi.fn().mockReturnValue({
                  id: 'sw-bad',
                  get: vi.fn().mockResolvedValue({
                    exists: true,
                    data: () => invalidWorkspace,
                  }),
                  collection: vi.fn().mockReturnValue({
                    get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
                  }),
                }),
              }),
            }),
          };
        }
        if (colName === 'projects') {
          return {
            doc: vi.fn().mockReturnValue({
              collection: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
                }),
                doc: vi.fn().mockReturnValue({ id: 'doc', set: mockSet }),
              }),
            }),
          };
        }
        return {
          doc: mockDocFn,
          get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
        };
      });

      await expect(
        assignToProject({
          workspaceId: 'sw-bad',
          scope: 'user',
          ownerId: 'user-001',
          projectId: 'proj-001',
          userId: 'user-001',
        }),
      ).rejects.toThrow('projectReference must be between 1 and 500 characters');
    });
  });
});
