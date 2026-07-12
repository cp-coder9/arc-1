// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, handleFirestoreError: vi.fn(), OperationType: {} }));
vi.mock('@/demo-seed/demoFirestore', () => ({
  getDemoCol: vi.fn((...parts: string[]) => ({ path: parts.join('/') })),
  getDemoDoc: vi.fn((...parts: string[]) => ({ path: parts.join('/') })),
}));
vi.mock('@/services/itpService', () => ({ getITPs: vi.fn(), getAllItems: vi.fn() }));
vi.mock('@/services/ncrService', () => ({ getNcrs: vi.fn() }));

import * as firestore from 'firebase/firestore';
import { getITPs, getAllItems } from '@/services/itpService';
import { getNcrs } from '@/services/ncrService';
import {
  getQualitySummary,
  persistITPProjectRecord,
  persistQualityContribution,
} from '@/services/itpPassportAdapter';
import {
  createHoldPointRequestEvent,
  persistActionCentreEvent,
  resolveActionItem,
} from '@/services/itpActionCentreAdapter';
import type { ITP } from '@/types';

const itp: ITP = {
  id: 'itp-1', projectId: 'p-1', title: 'Concrete', description: '',
  constructionStage: 'foundations', revisionNumber: 1, status: 'approved',
  createdBy: 'u-1', createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z', isDeleted: false,
};

describe('durable ITP spine integrations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes the mapped ProjectRecord to the project spine with a deterministic id', async () => {
    const setDoc = vi.mocked(firestore.setDoc).mockResolvedValue(undefined);
    await persistITPProjectRecord(itp);
    expect(setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'projects/p-1/project_records/itp-1' }),
      expect.objectContaining({ id: 'itp-1', recordType: 'inspection_test_plan' }),
      { merge: true },
    );
  });

  it('persists the quality contribution and propagates write failures', async () => {
    vi.mocked(firestore.setDoc).mockRejectedValueOnce(new Error('write denied'));
    await expect(persistQualityContribution('p-1', {
      totalITPs: 0, itpsByStatus: { draft: 0, approved: 0, in_progress: 0, completed: 0, superseded: 0, deleted: 0 },
      complianceScore: null, complianceScoreUnavailable: true, openHoldPointBreaches: 0,
      pendingMaterialTests: 0, openNCRsLinkedToITPs: 0,
      evidenceState: 'unavailable', unavailableSources: ['itps'],
    })).rejects.toThrow('write denied');
  });

  it('marks partial evidence explicitly instead of treating failed sources as zero', async () => {
    vi.mocked(getITPs).mockResolvedValue([itp]);
    vi.mocked(getAllItems).mockResolvedValue([]);
    vi.mocked(firestore.getDocs)
      .mockRejectedValueOnce(new Error('material tests unavailable'))
      .mockRejectedValueOnce(new Error('inspection requests unavailable'))
      .mockRejectedValueOnce(new Error('material tests unavailable'));
    vi.mocked(getNcrs).mockRejectedValue(new Error('ncr unavailable'));

    const summary = await getQualitySummary('p-1');
    expect(summary.evidenceState).toBe('partial');
    expect(summary.complianceScore).toBeNull();
    expect(summary.complianceScoreUnavailable).toBe(true);
    expect(summary.unavailableSources).toEqual(expect.arrayContaining(['material_tests', 'inspection_requests', 'ncrs']));
  });

  it('persists Action Centre events and durable resolution, propagating failures', async () => {
    const event = createHoldPointRequestEvent({
      projectId: 'p-1', itpTitle: 'Concrete', itemTitle: 'Cube test', itemId: 'item-1',
      requestedDate: '2026-02-01T00:00:00.000Z', assignedRoles: ['engineer'],
    });
    const setDoc = vi.mocked(firestore.setDoc).mockResolvedValue(undefined);
    await persistActionCentreEvent(event);
    expect(setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: `projects/p-1/inbox_events/${event.id}` }), event, { merge: false },
    );

    vi.mocked(firestore.updateDoc).mockRejectedValueOnce(new Error('resolution failed'));
    await expect(resolveActionItem('p-1', event.id)).rejects.toThrow('resolution failed');
  });
});
