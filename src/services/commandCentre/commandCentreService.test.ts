/**
 * Unit tests for commandCentreService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as firestore from 'firebase/firestore';

const handleFirestoreErrorMock = vi.fn((error: unknown) => { throw error; });

vi.mock('@/lib/firebase', () => ({
  db: { name: 'test-db' },
  OperationType: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
  },
  handleFirestoreError: (...args: unknown[]) => handleFirestoreErrorMock(...args),
}));

vi.mock('@/demo-seed/demoFirestore', () => ({
  getDemoDoc: (...segments: string[]) => ({ path: segments.join('/'), type: 'doc' }),
  getDemoCol: (...segments: string[]) => ({ path: segments.join('/'), type: 'col' }),
}));

const getDocMock = vi.mocked(firestore.getDoc);
const setDocMock = vi.mocked(firestore.setDoc);
const addDocMock = vi.mocked(firestore.addDoc);
const getDocsMock = vi.mocked(firestore.getDocs);
const whereMock = vi.mocked(firestore.where);

import {
  getConfig,
  updateConfig,
  initializeCommandCentre,
  recordAudit,
  getAuditTrail,
} from './commandCentreService';

describe('commandCentreService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getConfig', () => {
    it('returns config when document exists', async () => {
      const mockConfig = {
        projectId: 'proj-1',
        complexityMode: 'full',
        contractValue: 10_000_000,
        projectType: 'commercial',
        integrations: [],
      };
      getDocMock.mockResolvedValue({ exists: () => true, data: () => mockConfig } as any);

      const result = await getConfig('proj-1');
      expect(result).toEqual(mockConfig);
    });

    it('returns null when document does not exist', async () => {
      getDocMock.mockResolvedValue({ exists: () => false, data: () => null } as any);

      const result = await getConfig('proj-nonexistent');
      expect(result).toBeNull();
    });

    it('throws when projectId is empty', async () => {
      await expect(getConfig('')).rejects.toThrow('projectId is required');
    });

    it('calls handleFirestoreError on Firestore failure', async () => {
      const error = new Error('Network error');
      getDocMock.mockRejectedValue(error);

      await expect(getConfig('proj-1')).rejects.toThrow('Network error');
      expect(handleFirestoreErrorMock).toHaveBeenCalledWith(
        error,
        'get',
        'projects/proj-1/command_centre_config/settings',
      );
    });
  });

  describe('updateConfig', () => {
    it('merges config into existing document', async () => {
      setDocMock.mockResolvedValue(undefined as any);

      await updateConfig('proj-1', { complexityMode: 'full' });
      expect(setDocMock).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'projects/proj-1/command_centre_config/settings' }),
        { complexityMode: 'full' },
        { merge: true },
      );
    });

    it('calls handleFirestoreError on Firestore failure', async () => {
      const error = new Error('Permission denied');
      setDocMock.mockRejectedValue(error);

      await expect(updateConfig('proj-1', {})).rejects.toThrow('Permission denied');
      expect(handleFirestoreErrorMock).toHaveBeenCalledWith(
        error,
        'update',
        'projects/proj-1/command_centre_config/settings',
      );
    });
  });

  describe('initializeCommandCentre', () => {
    it('creates config with full mode when contract value >= 5M', async () => {
      setDocMock.mockResolvedValue(undefined as any);

      const result = await initializeCommandCentre('proj-1', {
        contractValue: 6_000_000,
        projectType: 'commercial',
      });

      expect(result).toEqual({
        projectId: 'proj-1',
        complexityMode: 'full',
        contractValue: 6_000_000,
        projectType: 'commercial',
        integrations: [
          { module: 'specforge', connected: false },
          { module: 'project_passport', connected: false },
          { module: 'document_intelligence', connected: false },
          { module: 'payment_gateway', connected: false },
        ],
      });
      expect(setDocMock).toHaveBeenCalled();
    });

    it('creates config with simple mode when contract value < 5M', async () => {
      setDocMock.mockResolvedValue(undefined as any);

      const result = await initializeCommandCentre('proj-2', {
        contractValue: 3_000_000,
        projectType: 'residential',
      });

      expect(result.complexityMode).toBe('simple');
    });

    it('uses explicit complexityMode override when provided', async () => {
      setDocMock.mockResolvedValue(undefined as any);

      const result = await initializeCommandCentre('proj-3', {
        contractValue: 100_000_000,
        projectType: 'industrial',
        complexityMode: 'simple',
      });

      expect(result.complexityMode).toBe('simple');
    });

    it('uses full mode at exactly 5M threshold', async () => {
      setDocMock.mockResolvedValue(undefined as any);

      const result = await initializeCommandCentre('proj-4', {
        contractValue: 5_000_000,
        projectType: 'mixed-use',
      });

      expect(result.complexityMode).toBe('full');
    });

    it('calls handleFirestoreError on Firestore failure', async () => {
      const error = new Error('Write failed');
      setDocMock.mockRejectedValue(error);

      await expect(
        initializeCommandCentre('proj-1', { contractValue: 1_000_000, projectType: 'residential' }),
      ).rejects.toThrow('Write failed');
      expect(handleFirestoreErrorMock).toHaveBeenCalledWith(
        error,
        'create',
        'projects/proj-1/command_centre_config/settings',
      );
    });
  });

  describe('recordAudit', () => {
    it('appends an audit entry with generated ID', async () => {
      addDocMock.mockResolvedValue({ id: 'generated-id' } as any);

      await recordAudit({
        projectId: 'proj-1',
        actorId: 'user-1',
        actorName: 'Test User',
        actionType: 'create',
        entityType: 'task',
        entityId: 'task-1',
        timestamp: '2025-01-01T00:00:00.000Z',
      });

      expect(addDocMock).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'projects/proj-1/audit_trail' }),
        expect.objectContaining({
          projectId: 'proj-1',
          actorId: 'user-1',
          actorName: 'Test User',
          actionType: 'create',
          entityType: 'task',
          entityId: 'task-1',
          timestamp: '2025-01-01T00:00:00.000Z',
        }),
      );
    });

    it('uses provided ID when given', async () => {
      addDocMock.mockResolvedValue({ id: 'doc-id' } as any);

      await recordAudit({
        id: 'custom-id-123',
        projectId: 'proj-1',
        actorId: 'user-1',
        actorName: 'Test User',
        actionType: 'update',
        entityType: 'milestone',
        entityId: 'ms-1',
        timestamp: '2025-01-01T00:00:00.000Z',
      });

      expect(addDocMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'custom-id-123' }),
      );
    });

    it('does NOT throw on Firestore failure (fire-and-forget)', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      addDocMock.mockRejectedValue(new Error('Write failed'));

      // Should not throw
      await recordAudit({
        projectId: 'proj-1',
        actorId: 'user-1',
        actorName: 'Test User',
        actionType: 'create',
        entityType: 'risk',
        entityId: 'risk-1',
        timestamp: '2025-01-01T00:00:00.000Z',
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[CommandCentre] Audit trail write failed:',
        'Write failed',
        expect.objectContaining({ projectId: 'proj-1', entityType: 'risk', actionType: 'create' }),
      );
      consoleErrorSpy.mockRestore();
    });

    it('records before and after values', async () => {
      addDocMock.mockResolvedValue({ id: 'doc-id' } as any);

      await recordAudit({
        projectId: 'proj-1',
        actorId: 'user-1',
        actorName: 'Test User',
        actionType: 'status_change',
        entityType: 'task',
        entityId: 'task-1',
        before: { status: 'todo' },
        after: { status: 'in_progress' },
        timestamp: '2025-01-01T00:00:00.000Z',
      });

      expect(addDocMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          before: { status: 'todo' },
          after: { status: 'in_progress' },
        }),
      );
    });
  });

  describe('getAuditTrail', () => {
    it('returns audit entries sorted by timestamp descending', async () => {
      const mockEntries = [
        { id: 'a1', projectId: 'proj-1', actorId: 'u1', actorName: 'User 1', actionType: 'create', entityType: 'task', entityId: 't1', timestamp: '2025-01-02T00:00:00Z' },
        { id: 'a2', projectId: 'proj-1', actorId: 'u2', actorName: 'User 2', actionType: 'update', entityType: 'risk', entityId: 'r1', timestamp: '2025-01-01T00:00:00Z' },
      ];
      getDocsMock.mockResolvedValue({
        docs: mockEntries.map((e) => ({ id: e.id, data: () => e })),
      } as any);

      const result = await getAuditTrail('proj-1');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('a1');
      expect(result[1].id).toBe('a2');
    });

    it('applies entityType filter', async () => {
      getDocsMock.mockResolvedValue({ docs: [] } as any);

      await getAuditTrail('proj-1', { entityType: 'task' });

      expect(whereMock).toHaveBeenCalledWith('entityType', '==', 'task');
    });

    it('applies actionType filter', async () => {
      getDocsMock.mockResolvedValue({ docs: [] } as any);

      await getAuditTrail('proj-1', { actionType: 'create' });

      expect(whereMock).toHaveBeenCalledWith('actionType', '==', 'create');
    });

    it('applies actorId filter', async () => {
      getDocsMock.mockResolvedValue({ docs: [] } as any);

      await getAuditTrail('proj-1', { actorId: 'user-123' });

      expect(whereMock).toHaveBeenCalledWith('actorId', '==', 'user-123');
    });

    it('applies date range filters', async () => {
      getDocsMock.mockResolvedValue({ docs: [] } as any);

      await getAuditTrail('proj-1', {
        startDate: '2025-01-01T00:00:00Z',
        endDate: '2025-01-31T23:59:59Z',
      });

      expect(whereMock).toHaveBeenCalledWith('timestamp', '>=', '2025-01-01T00:00:00Z');
      expect(whereMock).toHaveBeenCalledWith('timestamp', '<=', '2025-01-31T23:59:59Z');
    });

    it('applies multiple filters together', async () => {
      getDocsMock.mockResolvedValue({ docs: [] } as any);

      await getAuditTrail('proj-1', {
        entityType: 'milestone',
        actionType: 'status_change',
        actorId: 'user-1',
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      });

      expect(whereMock).toHaveBeenCalledWith('entityType', '==', 'milestone');
      expect(whereMock).toHaveBeenCalledWith('actionType', '==', 'status_change');
      expect(whereMock).toHaveBeenCalledWith('actorId', '==', 'user-1');
      expect(whereMock).toHaveBeenCalledWith('timestamp', '>=', '2025-01-01');
      expect(whereMock).toHaveBeenCalledWith('timestamp', '<=', '2025-12-31');
    });

    it('calls handleFirestoreError on Firestore failure', async () => {
      const error = new Error('Query failed');
      getDocsMock.mockRejectedValue(error);

      await expect(getAuditTrail('proj-1')).rejects.toThrow('Query failed');
      expect(handleFirestoreErrorMock).toHaveBeenCalledWith(
        error,
        'list',
        'projects/proj-1/audit_trail',
      );
    });
  });
});
