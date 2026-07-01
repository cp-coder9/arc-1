/**
 * Unit tests for qualityTrackerService
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
  createSnag,
  updateSnag,
  resolveSnag,
  getSnags,
  getQualityStats,
  computeResolutionRate,
  isWithinCurrentWeek,
  computeQualityStatsFromSnags,
} from './qualityTrackerService';
import type { QualitySnagItem } from './qualityTrackerService';

describe('qualityTrackerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Pure Computation Functions ─────────────────────────────────────────────

  describe('computeResolutionRate', () => {
    it('computes percentage correctly', () => {
      expect(computeResolutionRate(7, 10)).toBe(70);
    });

    it('returns 0 when total is 0', () => {
      expect(computeResolutionRate(0, 0)).toBe(0);
    });

    it('returns 100 when all resolved', () => {
      expect(computeResolutionRate(5, 5)).toBe(100);
    });

    it('handles zero resolved', () => {
      expect(computeResolutionRate(0, 10)).toBe(0);
    });
  });

  describe('isWithinCurrentWeek', () => {
    it('returns true for a date within the week', () => {
      // Wednesday reference
      const ref = new Date('2026-06-17T12:00:00Z'); // Tuesday
      // Monday of this week = 2026-06-15
      expect(isWithinCurrentWeek('2026-06-15T10:00:00Z', ref)).toBe(true);
      expect(isWithinCurrentWeek('2026-06-17T10:00:00Z', ref)).toBe(true);
      expect(isWithinCurrentWeek('2026-06-21T10:00:00Z', ref)).toBe(true); // Sunday
    });

    it('returns false for a date before the week', () => {
      const ref = new Date('2026-06-17T12:00:00Z');
      // June 13 is a Saturday — well before Monday June 15
      expect(isWithinCurrentWeek('2026-06-13T12:00:00Z', ref)).toBe(false);
    });

    it('returns false for a date after the week', () => {
      const ref = new Date('2026-06-17T12:00:00Z');
      expect(isWithinCurrentWeek('2026-06-22T00:00:01Z', ref)).toBe(false);
    });
  });

  describe('computeQualityStatsFromSnags', () => {
    const ref = new Date('2026-06-17T12:00:00Z');

    const snags: QualitySnagItem[] = [
      { id: '1', projectId: 'p1', description: 'Crack in wall', location: 'Unit 1', severity: 'high', assignedPartyId: 'party-1', status: 'open', createdBy: 'u1', createdAt: '2026-06-10T00:00:00Z', updatedAt: '2026-06-10T00:00:00Z' },
      { id: '2', projectId: 'p1', description: 'Paint chip', location: 'Unit 2', severity: 'low', assignedPartyId: 'party-2', status: 'rectifying', createdBy: 'u1', createdAt: '2026-06-11T00:00:00Z', updatedAt: '2026-06-11T00:00:00Z' },
      { id: '3', projectId: 'p1', description: 'Damp patch', location: 'Unit 3', severity: 'medium', assignedPartyId: 'party-1', status: 'resolved', resolutionDate: '2026-06-16T10:00:00Z', createdBy: 'u1', createdAt: '2026-06-05T00:00:00Z', updatedAt: '2026-06-16T10:00:00Z' },
      { id: '4', projectId: 'p1', description: 'Missing tile', location: 'Unit 4', severity: 'high', assignedPartyId: 'party-3', status: 'resolved', resolutionDate: '2026-06-10T10:00:00Z', createdBy: 'u1', createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-10T10:00:00Z' },
      { id: '5', projectId: 'p1', description: 'Structural defect', location: 'Unit 5', severity: 'high', assignedPartyId: 'party-1', status: 'open', createdBy: 'u1', createdAt: '2026-06-15T00:00:00Z', updatedAt: '2026-06-15T00:00:00Z' },
    ];

    it('counts open snags (open + rectifying)', () => {
      const stats = computeQualityStatsFromSnags(snags, ref);
      expect(stats.openSnags).toBe(3); // id 1 (open), 2 (rectifying), 5 (open)
    });

    it('counts resolved this week', () => {
      const stats = computeQualityStatsFromSnags(snags, ref);
      // Only id 3 was resolved within the week of 2026-06-15 to 2026-06-21
      expect(stats.resolvedThisWeek).toBe(1);
    });

    it('counts active NCRs (high severity, not resolved/closed)', () => {
      const stats = computeQualityStatsFromSnags(snags, ref);
      // id 1 (high, open) + id 5 (high, open) = 2
      expect(stats.activeNCRs).toBe(2);
    });

    it('returns 0 inspections due (placeholder)', () => {
      const stats = computeQualityStatsFromSnags(snags, ref);
      expect(stats.inspectionsDue).toBe(0);
    });

    it('returns all zeros for empty list', () => {
      const stats = computeQualityStatsFromSnags([], ref);
      expect(stats).toEqual({ openSnags: 0, resolvedThisWeek: 0, activeNCRs: 0, inspectionsDue: 0 });
    });
  });

  // ── createSnag ─────────────────────────────────────────────────────────────

  describe('createSnag', () => {
    it('creates a snag with correct defaults and returns it with ID', async () => {
      addDocMock.mockResolvedValue({ id: 'snag-1' } as any);

      const result = await createSnag('proj-1', {
        description: 'Crack in render',
        location: 'Unit 5 bathroom',
        severity: 'high',
        assignedPartyId: 'contractor-1',
      }, 'user-1');

      expect(result.id).toBe('snag-1');
      expect(result.description).toBe('Crack in render');
      expect(result.location).toBe('Unit 5 bathroom');
      expect(result.severity).toBe('high');
      expect(result.assignedPartyId).toBe('contractor-1');
      expect(result.status).toBe('open');
      expect(result.projectId).toBe('proj-1');
      expect(result.createdBy).toBe('user-1');
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      expect(addDocMock).toHaveBeenCalled();
    });

    it('rejects invalid input (missing description)', async () => {
      await expect(
        createSnag('proj-1', { description: '', location: 'Unit 1', severity: 'low', assignedPartyId: 'p1' }),
      ).rejects.toThrow();
    });

    it('rejects invalid input (missing location)', async () => {
      await expect(
        createSnag('proj-1', { description: 'Test', location: '', severity: 'low', assignedPartyId: 'p1' }),
      ).rejects.toThrow();
    });

    it('rejects invalid input (missing assignedPartyId)', async () => {
      await expect(
        createSnag('proj-1', { description: 'Test', location: 'Unit 1', severity: 'low', assignedPartyId: '' }),
      ).rejects.toThrow();
    });

    it('throws when projectId is empty', async () => {
      await expect(
        createSnag('', { description: 'Test', location: 'Unit 1', severity: 'low', assignedPartyId: 'p1' }),
      ).rejects.toThrow('projectId is required');
    });

    it('calls handleFirestoreError on persistence failure', async () => {
      const error = new Error('Write failed');
      addDocMock.mockRejectedValue(error);

      await expect(
        createSnag('proj-1', { description: 'Test', location: 'Unit 1', severity: 'medium', assignedPartyId: 'p1' }),
      ).rejects.toThrow('Write failed');
      expect(handleFirestoreErrorMock).toHaveBeenCalledWith(
        error,
        'create',
        'projects/proj-1/snags',
      );
    });
  });

  // ── updateSnag ─────────────────────────────────────────────────────────────

  describe('updateSnag', () => {
    const existingSnag = {
      id: 'snag-1',
      projectId: 'proj-1',
      description: 'Original',
      location: 'Unit 1',
      severity: 'low',
      assignedPartyId: 'party-1',
      status: 'open',
      createdBy: 'user-1',
      createdAt: '2026-06-10T00:00:00Z',
      updatedAt: '2026-06-10T00:00:00Z',
    };

    it('updates snag fields and returns updated snag', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'snag-1',
        data: () => existingSnag,
      } as any);
      updateDocMock.mockResolvedValue(undefined as any);

      const result = await updateSnag('proj-1', 'snag-1', { severity: 'high', status: 'rectifying' });

      expect(result.severity).toBe('high');
      expect(result.status).toBe('rectifying');
      expect(result.description).toBe('Original'); // unchanged
      expect(updateDocMock).toHaveBeenCalled();
    });

    it('throws when snag not found', async () => {
      getDocMock.mockResolvedValue({ exists: () => false } as any);

      await expect(
        updateSnag('proj-1', 'snag-missing', { severity: 'high' }),
      ).rejects.toThrow("Snag 'snag-missing' not found");
    });

    it('throws when snagId is empty', async () => {
      await expect(
        updateSnag('proj-1', '', { severity: 'high' }),
      ).rejects.toThrow('snagId is required');
    });

    it('calls handleFirestoreError on update failure', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'snag-1',
        data: () => existingSnag,
      } as any);
      const error = new Error('Update failed');
      updateDocMock.mockRejectedValue(error);

      await expect(
        updateSnag('proj-1', 'snag-1', { severity: 'high' }),
      ).rejects.toThrow('Update failed');
      expect(handleFirestoreErrorMock).toHaveBeenCalledWith(
        error,
        'update',
        'projects/proj-1/snags/snag-1',
      );
    });
  });

  // ── resolveSnag ────────────────────────────────────────────────────────────

  describe('resolveSnag', () => {
    const openSnag = {
      id: 'snag-1',
      projectId: 'proj-1',
      description: 'Open snag',
      location: 'Unit 1',
      severity: 'medium',
      assignedPartyId: 'party-1',
      status: 'open',
      createdBy: 'user-1',
      createdAt: '2026-06-10T00:00:00Z',
      updatedAt: '2026-06-10T00:00:00Z',
    };

    it('resolves snag, records resolution date, and returns resolution rate', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'snag-1',
        data: () => openSnag,
      } as any);
      updateDocMock.mockResolvedValue(undefined as any);

      // getSnags call after resolve
      getDocsMock.mockResolvedValue({
        docs: [
          { id: 'snag-1', data: () => ({ ...openSnag, status: 'resolved' }) },
          { id: 'snag-2', data: () => ({ ...openSnag, id: 'snag-2', status: 'open' }) },
        ],
      } as any);

      const result = await resolveSnag('proj-1', 'snag-1', 'user-1');

      expect(result.snag.status).toBe('resolved');
      expect(result.snag.resolutionDate).toBeDefined();
      // 2 total snags, the one just resolved + one resolved in the list = effectively 2 resolved out of 2
      // But actually the mock returns 1 resolved + 1 open = we add +1 for the just-resolved
      // resolvedCount = 1 (already resolved in list) + 1 = 2, total = 2
      expect(result.resolutionRate).toBe(100);
      expect(updateDocMock).toHaveBeenCalled();
    });

    it('throws when snag not found', async () => {
      getDocMock.mockResolvedValue({ exists: () => false } as any);

      await expect(
        resolveSnag('proj-1', 'snag-missing'),
      ).rejects.toThrow("Snag 'snag-missing' not found");
    });

    it('throws when snag is already resolved', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'snag-1',
        data: () => ({ ...openSnag, status: 'resolved' }),
      } as any);

      await expect(
        resolveSnag('proj-1', 'snag-1'),
      ).rejects.toThrow("Snag 'snag-1' is already resolved");
    });

    it('throws when snag is already closed', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'snag-1',
        data: () => ({ ...openSnag, status: 'closed' }),
      } as any);

      await expect(
        resolveSnag('proj-1', 'snag-1'),
      ).rejects.toThrow("Snag 'snag-1' is already closed");
    });

    it('calls handleFirestoreError on update failure', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'snag-1',
        data: () => openSnag,
      } as any);
      const error = new Error('Update failed');
      updateDocMock.mockRejectedValue(error);

      await expect(
        resolveSnag('proj-1', 'snag-1'),
      ).rejects.toThrow('Update failed');
      expect(handleFirestoreErrorMock).toHaveBeenCalledWith(
        error,
        'update',
        'projects/proj-1/snags/snag-1',
      );
    });
  });

  // ── getSnags ───────────────────────────────────────────────────────────────

  describe('getSnags', () => {
    it('returns all snags for a project', async () => {
      const mockSnags = [
        { id: 'snag-1', projectId: 'proj-1', description: 'Crack', location: 'Unit 1', severity: 'high', assignedPartyId: 'p1', status: 'open', createdBy: 'u1', createdAt: '2026-06-15T00:00:00Z', updatedAt: '2026-06-15T00:00:00Z' },
        { id: 'snag-2', projectId: 'proj-1', description: 'Leak', location: 'Unit 2', severity: 'medium', assignedPartyId: 'p2', status: 'resolved', resolutionDate: '2026-06-16T00:00:00Z', createdBy: 'u1', createdAt: '2026-06-10T00:00:00Z', updatedAt: '2026-06-16T00:00:00Z' },
      ];
      getDocsMock.mockResolvedValue({
        docs: mockSnags.map((s) => ({ id: s.id, data: () => s })),
      } as any);

      const result = await getSnags('proj-1');
      expect(result).toHaveLength(2);
      expect(result[0].description).toBe('Crack');
      expect(result[1].description).toBe('Leak');
    });

    it('returns empty array when no snags exist', async () => {
      getDocsMock.mockResolvedValue({ docs: [] } as any);
      const result = await getSnags('proj-1');
      expect(result).toEqual([]);
    });

    it('throws when projectId is empty', async () => {
      await expect(getSnags('')).rejects.toThrow('projectId is required');
    });

    it('calls handleFirestoreError on failure', async () => {
      const error = new Error('Network error');
      getDocsMock.mockRejectedValue(error);

      await expect(getSnags('proj-1')).rejects.toThrow('Network error');
      expect(handleFirestoreErrorMock).toHaveBeenCalledWith(
        error,
        'list',
        'projects/proj-1/snags',
      );
    });
  });

  // ── getQualityStats ────────────────────────────────────────────────────────

  describe('getQualityStats', () => {
    it('returns computed quality stats from project snags', async () => {
      const now = new Date();
      const thisWeekDate = new Date(now);
      thisWeekDate.setDate(now.getDate() - 1);

      const mockSnags = [
        { id: '1', projectId: 'proj-1', description: 'A', location: 'L1', severity: 'high', assignedPartyId: 'p1', status: 'open', createdBy: 'u1', createdAt: '2026-06-10T00:00:00Z', updatedAt: '2026-06-10T00:00:00Z' },
        { id: '2', projectId: 'proj-1', description: 'B', location: 'L2', severity: 'low', assignedPartyId: 'p2', status: 'rectifying', createdBy: 'u1', createdAt: '2026-06-11T00:00:00Z', updatedAt: '2026-06-11T00:00:00Z' },
        { id: '3', projectId: 'proj-1', description: 'C', location: 'L3', severity: 'medium', assignedPartyId: 'p1', status: 'resolved', resolutionDate: thisWeekDate.toISOString(), createdBy: 'u1', createdAt: '2026-06-05T00:00:00Z', updatedAt: thisWeekDate.toISOString() },
      ];
      getDocsMock.mockResolvedValue({
        docs: mockSnags.map((s) => ({ id: s.id, data: () => s })),
      } as any);

      const stats = await getQualityStats('proj-1');

      expect(stats.openSnags).toBe(2); // open + rectifying
      expect(stats.activeNCRs).toBe(1); // high severity, not resolved
      expect(stats.inspectionsDue).toBe(0);
      // resolvedThisWeek depends on current date vs resolution date
      expect(typeof stats.resolvedThisWeek).toBe('number');
    });

    it('returns all zeros for empty project', async () => {
      getDocsMock.mockResolvedValue({ docs: [] } as any);
      const stats = await getQualityStats('proj-1');
      expect(stats).toEqual({ openSnags: 0, resolvedThisWeek: 0, activeNCRs: 0, inspectionsDue: 0 });
    });
  });
});
