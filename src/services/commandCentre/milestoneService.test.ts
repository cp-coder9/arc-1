/**
 * Unit tests for milestoneService
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

vi.mock('@/services/commandCentre/commandCentreService', () => ({
  recordAudit: vi.fn(),
}));

const getDocMock = vi.mocked(firestore.getDoc);
const addDocMock = vi.mocked(firestore.addDoc);
const getDocsMock = vi.mocked(firestore.getDocs);
const updateDocMock = vi.mocked(firestore.updateDoc);

import {
  createMilestone,
  updateMilestone,
  completeMilestone,
  getMilestones,
  detectOverdue,
  markOverdue,
} from './milestoneService';

describe('milestoneService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── createMilestone ──────────────────────────────────────────────────────

  describe('createMilestone', () => {
    beforeEach(() => {
      addDocMock.mockResolvedValue({ id: 'ms-1' } as any);
    });

    it('creates a milestone with required fields', async () => {
      const result = await createMilestone('proj-1', {
        name: 'Foundation complete',
        plannedDate: '2026-03-15',
        createdBy: 'user-1',
      });

      expect(result.name).toBe('Foundation complete');
      expect(result.plannedDate).toBe('2026-03-15');
      expect(result.status).toBe('pending');
      expect(result.projectId).toBe('proj-1');
      expect(result.createdBy).toBe('user-1');
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      expect(addDocMock).toHaveBeenCalledOnce();
    });

    it('creates milestone with optional linked certificate and activity', async () => {
      const result = await createMilestone('proj-1', {
        name: 'Roof stage',
        plannedDate: '2026-05-20',
        linkedCertificateId: 'cert-1',
        linkedActivityId: 'act-1',
        createdBy: 'user-1',
      });

      expect(result.linkedCertificateId).toBe('cert-1');
      expect(result.linkedActivityId).toBe('act-1');
    });

    it('attaches NHBRC checklist when category is nhbrc_inspection with valid stage', async () => {
      const result = await createMilestone('proj-1', {
        name: 'NHBRC Foundation Inspection',
        plannedDate: '2026-04-01',
        category: 'nhbrc_inspection',
        nhbrcStage: 1,
        createdBy: 'user-1',
      });

      expect(result.category).toBe('nhbrc_inspection');
      expect(result.nhbrcStage).toBe(1);
      expect(result.documentationChecklist).toBeDefined();
      expect(result.documentationChecklist!.length).toBeGreaterThan(0);
      expect(result.documentationChecklist).toContain('Foundation excavation complete and open for inspection');
    });

    it('attaches stage 4 (roof) NHBRC checklist', async () => {
      const result = await createMilestone('proj-1', {
        name: 'NHBRC Roof Inspection',
        plannedDate: '2026-06-01',
        category: 'nhbrc_inspection',
        nhbrcStage: 4,
        createdBy: 'user-1',
      });

      expect(result.documentationChecklist).toContain('Roof structure complete and tied down');
      expect(result.documentationChecklist).toContain('Truss design engineer certificate (ITC-SA A19)');
    });

    it('does not attach checklist for general category', async () => {
      const result = await createMilestone('proj-1', {
        name: 'General milestone',
        plannedDate: '2026-04-01',
        category: 'general',
        createdBy: 'user-1',
      });

      expect(result.documentationChecklist).toBeUndefined();
    });

    it('does not attach checklist when nhbrcStage is missing', async () => {
      const result = await createMilestone('proj-1', {
        name: 'NHBRC Inspection (no stage)',
        plannedDate: '2026-04-01',
        category: 'nhbrc_inspection',
        createdBy: 'user-1',
      });

      expect(result.documentationChecklist).toBeUndefined();
    });

    it('rejects when name is empty', async () => {
      await expect(
        createMilestone('proj-1', {
          name: '',
          plannedDate: '2026-03-15',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('Validation failed');
    });

    it('rejects when plannedDate is not ISO format', async () => {
      await expect(
        createMilestone('proj-1', {
          name: 'Test',
          plannedDate: '15/03/2026',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('Validation failed');
    });

    it('throws when projectId is empty', async () => {
      await expect(
        createMilestone('', {
          name: 'Test',
          plannedDate: '2026-03-15',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('projectId is required');
    });

    it('calls handleFirestoreError on persistence failure', async () => {
      const error = new Error('Write failed');
      addDocMock.mockRejectedValue(error);

      await expect(
        createMilestone('proj-1', {
          name: 'Test',
          plannedDate: '2026-03-15',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('Write failed');
      expect(handleFirestoreErrorMock).toHaveBeenCalledWith(
        error,
        'create',
        'projects/proj-1/milestones',
      );
    });
  });

  // ── updateMilestone ──────────────────────────────────────────────────────

  describe('updateMilestone', () => {
    const existingMilestone = {
      id: 'ms-1',
      projectId: 'proj-1',
      name: 'Foundation',
      plannedDate: '2026-03-15',
      status: 'pending' as const,
      category: 'general' as const,
      createdBy: 'user-1',
      createdAt: '2026-01-10T08:00:00.000Z',
      updatedAt: '2026-01-10T08:00:00.000Z',
    };

    it('updates milestone name', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'ms-1',
        data: () => existingMilestone,
      } as any);
      updateDocMock.mockResolvedValue(undefined as any);

      const result = await updateMilestone('proj-1', 'ms-1', { name: 'Foundation Complete' });

      expect(result.name).toBe('Foundation Complete');
      expect(updateDocMock).toHaveBeenCalled();
    });

    it('attaches NHBRC checklist when category is changed to nhbrc_inspection', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'ms-1',
        data: () => existingMilestone,
      } as any);
      updateDocMock.mockResolvedValue(undefined as any);

      const result = await updateMilestone('proj-1', 'ms-1', {
        category: 'nhbrc_inspection',
        nhbrcStage: 3,
      });

      expect(result.category).toBe('nhbrc_inspection');
      expect(result.nhbrcStage).toBe(3);
      expect(result.documentationChecklist).toBeDefined();
      expect(result.documentationChecklist).toContain('Wall plate level confirmed');
    });

    it('clears checklist when category changes away from nhbrc_inspection', async () => {
      const nhbrcMilestone = {
        ...existingMilestone,
        category: 'nhbrc_inspection' as const,
        nhbrcStage: 2,
        documentationChecklist: ['Item 1', 'Item 2'],
      };
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'ms-1',
        data: () => nhbrcMilestone,
      } as any);
      updateDocMock.mockResolvedValue(undefined as any);

      const result = await updateMilestone('proj-1', 'ms-1', { category: 'general' });

      expect(result.documentationChecklist).toBeUndefined();
    });

    it('throws when milestone not found', async () => {
      getDocMock.mockResolvedValue({ exists: () => false } as any);

      await expect(
        updateMilestone('proj-1', 'ms-missing', { name: 'Updated' }),
      ).rejects.toThrow("Milestone 'ms-missing' not found");
    });

    it('calls handleFirestoreError on update failure', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'ms-1',
        data: () => existingMilestone,
      } as any);
      const error = new Error('Update failed');
      updateDocMock.mockRejectedValue(error);

      await expect(
        updateMilestone('proj-1', 'ms-1', { name: 'Updated' }),
      ).rejects.toThrow('Update failed');
      expect(handleFirestoreErrorMock).toHaveBeenCalledWith(
        error,
        'update',
        'projects/proj-1/milestones/ms-1',
      );
    });
  });

  // ── completeMilestone ────────────────────────────────────────────────────

  describe('completeMilestone', () => {
    const existingMilestone = {
      id: 'ms-1',
      projectId: 'proj-1',
      name: 'Foundation',
      plannedDate: '2026-03-15',
      status: 'on_track' as const,
      linkedCertificateId: 'cert-1',
      createdBy: 'user-1',
      createdAt: '2026-01-10T08:00:00.000Z',
      updatedAt: '2026-01-10T08:00:00.000Z',
    };

    it('marks milestone as complete with actual date', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'ms-1',
        data: () => existingMilestone,
      } as any);
      updateDocMock.mockResolvedValue(undefined as any);

      const result = await completeMilestone('proj-1', 'ms-1');

      expect(result.milestone.status).toBe('complete');
      expect(result.milestone.actualDate).toBeDefined();
      expect(result.milestone.actualDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(updateDocMock).toHaveBeenCalled();
    });

    it('generates Action Centre event when linked certificate exists', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'ms-1',
        data: () => existingMilestone,
      } as any);
      updateDocMock.mockResolvedValue(undefined as any);

      const result = await completeMilestone('proj-1', 'ms-1');

      expect(result.actionEvent).toBeDefined();
      expect(result.actionEvent!.type).toBe('financial');
      expect(result.actionEvent!.title).toContain('Foundation');
      expect(result.actionEvent!.title).toContain('completed');
      expect(result.actionEvent!.priority).toBe('high');
      expect(result.actionEvent!.sourceSubsystem).toBe('milestones');
      expect(result.actionEvent!.sourceEntityId).toBe('ms-1');
      expect(result.actionEvent!.status).toBe('pending');
    });

    it('does not generate Action Centre event when no linked certificate', async () => {
      const unlinkedMilestone = { ...existingMilestone, linkedCertificateId: undefined };
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'ms-1',
        data: () => unlinkedMilestone,
      } as any);
      updateDocMock.mockResolvedValue(undefined as any);

      const result = await completeMilestone('proj-1', 'ms-1');

      expect(result.actionEvent).toBeUndefined();
    });

    it('throws when milestone not found', async () => {
      getDocMock.mockResolvedValue({ exists: () => false } as any);

      await expect(
        completeMilestone('proj-1', 'ms-missing'),
      ).rejects.toThrow("Milestone 'ms-missing' not found");
    });

    it('throws when milestoneId is empty', async () => {
      await expect(completeMilestone('proj-1', '')).rejects.toThrow('milestoneId is required');
    });

    it('calls handleFirestoreError on update failure', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'ms-1',
        data: () => existingMilestone,
      } as any);
      const error = new Error('Update failed');
      updateDocMock.mockRejectedValue(error);

      await expect(completeMilestone('proj-1', 'ms-1')).rejects.toThrow('Update failed');
      expect(handleFirestoreErrorMock).toHaveBeenCalledWith(
        error,
        'update',
        'projects/proj-1/milestones/ms-1',
      );
    });
  });

  // ── getMilestones ────────────────────────────────────────────────────────

  describe('getMilestones', () => {
    it('returns milestones sorted by planned date ascending', async () => {
      const mockMilestones = [
        { id: 'ms-1', name: 'First', plannedDate: '2026-02-01' },
        { id: 'ms-2', name: 'Second', plannedDate: '2026-03-15' },
        { id: 'ms-3', name: 'Third', plannedDate: '2026-05-01' },
      ];
      getDocsMock.mockResolvedValue({
        docs: mockMilestones.map((m) => ({ id: m.id, data: () => m })),
      } as any);

      const result = await getMilestones('proj-1');

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('First');
      expect(result[1].name).toBe('Second');
      expect(result[2].name).toBe('Third');
    });

    it('returns empty array when no milestones exist', async () => {
      getDocsMock.mockResolvedValue({ docs: [] } as any);
      const result = await getMilestones('proj-1');
      expect(result).toEqual([]);
    });

    it('throws when projectId is empty', async () => {
      await expect(getMilestones('')).rejects.toThrow('projectId is required');
    });

    it('calls handleFirestoreError on query failure', async () => {
      const error = new Error('Query failed');
      getDocsMock.mockRejectedValue(error);

      await expect(getMilestones('proj-1')).rejects.toThrow('Query failed');
      expect(handleFirestoreErrorMock).toHaveBeenCalledWith(
        error,
        'list',
        'projects/proj-1/milestones',
      );
    });
  });

  // ── detectOverdue ────────────────────────────────────────────────────────

  describe('detectOverdue', () => {
    it('detects overdue milestone when planned date is past', () => {
      const milestone = {
        id: 'ms-1',
        projectId: 'proj-1',
        name: 'Foundation',
        plannedDate: '2026-01-15',
        status: 'on_track' as const,
        createdBy: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      const result = detectOverdue(milestone, '2026-02-01');

      expect(result.isOverdue).toBe(true);
      expect(result.actionEvent).toBeDefined();
      expect(result.actionEvent!.type).toBe('planning');
      expect(result.actionEvent!.title).toContain('overdue');
      expect(result.actionEvent!.priority).toBe('high');
      expect(result.actionEvent!.sourceSubsystem).toBe('milestones');
    });

    it('does not flag milestone when planned date is in the future', () => {
      const milestone = {
        id: 'ms-1',
        projectId: 'proj-1',
        name: 'Foundation',
        plannedDate: '2026-06-15',
        status: 'on_track' as const,
        createdBy: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      const result = detectOverdue(milestone, '2026-02-01');

      expect(result.isOverdue).toBe(false);
      expect(result.actionEvent).toBeUndefined();
    });

    it('does not flag milestone when planned date equals current date', () => {
      const milestone = {
        id: 'ms-1',
        projectId: 'proj-1',
        name: 'Foundation',
        plannedDate: '2026-02-01',
        status: 'on_track' as const,
        createdBy: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      const result = detectOverdue(milestone, '2026-02-01');

      expect(result.isOverdue).toBe(false);
      expect(result.actionEvent).toBeUndefined();
    });

    it('does not flag completed milestones', () => {
      const milestone = {
        id: 'ms-1',
        projectId: 'proj-1',
        name: 'Foundation',
        plannedDate: '2026-01-15',
        actualDate: '2026-01-14',
        status: 'complete' as const,
        createdBy: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-14T00:00:00.000Z',
      };

      const result = detectOverdue(milestone, '2026-02-01');

      expect(result.isOverdue).toBe(false);
      expect(result.actionEvent).toBeUndefined();
    });

    it('does not re-flag already overdue milestones', () => {
      const milestone = {
        id: 'ms-1',
        projectId: 'proj-1',
        name: 'Foundation',
        plannedDate: '2026-01-15',
        status: 'overdue' as const,
        createdBy: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-16T00:00:00.000Z',
      };

      const result = detectOverdue(milestone, '2026-02-01');

      expect(result.isOverdue).toBe(true);
      expect(result.actionEvent).toBeUndefined();
    });

    it('detects overdue for pending milestones', () => {
      const milestone = {
        id: 'ms-1',
        projectId: 'proj-1',
        name: 'NHBRC Stage 2',
        plannedDate: '2026-01-10',
        status: 'pending' as const,
        category: 'nhbrc_inspection' as const,
        createdBy: 'user-1',
        createdAt: '2025-12-01T00:00:00.000Z',
        updatedAt: '2025-12-01T00:00:00.000Z',
      };

      const result = detectOverdue(milestone, '2026-01-11');

      expect(result.isOverdue).toBe(true);
      expect(result.actionEvent).toBeDefined();
    });
  });

  // ── markOverdue ──────────────────────────────────────────────────────────

  describe('markOverdue', () => {
    const existingMilestone = {
      id: 'ms-1',
      projectId: 'proj-1',
      name: 'Foundation',
      plannedDate: '2026-01-15',
      status: 'on_track' as const,
      createdBy: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    it('updates milestone status to overdue and returns action event', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'ms-1',
        data: () => existingMilestone,
      } as any);
      updateDocMock.mockResolvedValue(undefined as any);

      const result = await markOverdue('proj-1', 'ms-1');

      expect(result.milestone.status).toBe('overdue');
      expect(result.actionEvent).toBeDefined();
      expect(result.actionEvent.type).toBe('planning');
      expect(result.actionEvent.title).toContain('overdue');
      expect(result.actionEvent.priority).toBe('high');
      expect(result.actionEvent.sourceSubsystem).toBe('milestones');
      expect(updateDocMock).toHaveBeenCalled();
    });

    it('throws when milestone not found', async () => {
      getDocMock.mockResolvedValue({ exists: () => false } as any);

      await expect(markOverdue('proj-1', 'ms-missing')).rejects.toThrow(
        "Milestone 'ms-missing' not found",
      );
    });

    it('calls handleFirestoreError on update failure', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'ms-1',
        data: () => existingMilestone,
      } as any);
      const error = new Error('Update failed');
      updateDocMock.mockRejectedValue(error);

      await expect(markOverdue('proj-1', 'ms-1')).rejects.toThrow('Update failed');
      expect(handleFirestoreErrorMock).toHaveBeenCalledWith(
        error,
        'update',
        'projects/proj-1/milestones/ms-1',
      );
    });
  });
});
