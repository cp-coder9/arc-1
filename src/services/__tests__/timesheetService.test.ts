import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as firestore from 'firebase/firestore';

const handleFirestoreErrorMock = vi.fn((error: unknown) => { throw error; });

vi.mock('@/lib/firebase', () => ({
  db: { name: 'test-db' },
  OperationType: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LIST: 'list', GET: 'get', WRITE: 'write' },
  handleFirestoreError: handleFirestoreErrorMock,
}));

vi.mock('../notificationService', () => ({
  notificationService: {
    sendNotification: vi.fn().mockResolvedValue(undefined),
  },
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

describe('timesheetService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collectionMock.mockImplementation((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }));
    docMock.mockImplementation((dbOrCollection: { path?: string } | unknown, ...segments: string[]) => {
      if (segments.length === 0) return { path: 'timesheets', id: 'generated-entry-id' };
      return { path: segments.join('/'), id: segments[segments.length - 1] };
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

  it('logs time with valid data', async () => {
    const { logTime } = await import('../timesheetService');
    const entry = await logTime({
      userId: 'user-1', firmId: 'firm-1', date: '2024-06-01',
      startTime: '09:00', endTime: '17:00', description: 'Design work',
      billable: 'billable', hourlyRateCents: 100000,
    });

    expect(entry).toEqual(expect.objectContaining({
      userId: 'user-1', firmId: 'firm-1',
      durationMinutes: 480, // 8 hours
      description: 'Design work',
      billable: 'billable',
    }));
    // Total value: (480/60) * 100000 = 800000 cents
    expect(entry.totalValueCents).toBe(800000);
    expect(setDocMock).toHaveBeenCalledTimes(1);
  });

  it('throws for negative duration (end before start)', async () => {
    const { logTime } = await import('../timesheetService');
    await expect(logTime({
      userId: 'user-1', firmId: 'firm-1', date: '2024-06-01',
      startTime: '17:00', endTime: '09:00', description: 'Bad entry',
    })).rejects.toThrow('endTime must be after startTime');
  });

  it('throws for exceeding 24 hours', async () => {
    const { logTime } = await import('../timesheetService');
    await expect(logTime({
      userId: 'user-1', firmId: 'firm-1', date: '2024-06-01',
      startTime: '00:00', endTime: '25:00', description: 'Too long',
    })).rejects.toThrow();
  });

  it('non-billable entries have zero value', async () => {
    const { logTime } = await import('../timesheetService');
    const entry = await logTime({
      userId: 'user-1', firmId: 'firm-1', date: '2024-06-01',
      startTime: '09:00', endTime: '12:00', description: 'Admin',
      billable: 'non_billable', hourlyRateCents: 100000,
    });
    expect(entry.totalValueCents).toBe(0);
  });

  it('gets timesheet entries with filters', async () => {
    const { getTimesheetEntries } = await import('../timesheetService');
    getDocsMock.mockResolvedValueOnce({
      docs: [
        snap('e1', { userId: 'u1', firmId: 'firm-1', date: '2024-06-01', startTime: '09:00', endTime: '17:00', durationMinutes: 480, description: 'Work', billable: 'billable', createdAt: '2024-06-01' }),
      ],
    });
    const entries = await getTimesheetEntries({ firmId: 'firm-1', userId: 'u1' });
    expect(entries).toHaveLength(1);
  });

  it('computes timesheet summary', async () => {
    const { getTimesheetSummary } = await import('../timesheetService');
    getDocsMock.mockResolvedValueOnce({
      docs: [
        snap('e1', { userId: 'u1', firmId: 'firm-1', date: '2024-06-01', startTime: '09:00', endTime: '17:00', durationMinutes: 480, description: 'Work', billable: 'billable', totalValueCents: 800000, projectId: 'proj-1', createdAt: '2024-06-01' }),
      ],
    });
    const summary = await getTimesheetSummary({ firmId: 'firm-1', periodStart: '2024-06-01', periodEnd: '2024-06-30' });
    expect(summary.totalHours).toBe(8);
    expect(summary.billableHours).toBe(8);
    expect(summary.totalValueCents).toBe(800000);
    expect(summary.byProject['proj-1']).toBeDefined();
  });

  it('marks entries as invoiced', async () => {
    const { markTimesheetInvoiced } = await import('../timesheetService');
    await markTimesheetInvoiced(['e1', 'e2'], 'inv-1');
    expect(writeBatchMock).toHaveBeenCalled();
  });

  it('validates billable status', async () => {
    const { logTime } = await import('../timesheetService');
    await expect(logTime({
      userId: 'u1', firmId: 'firm-1', date: '2024-06-01',
      startTime: '09:00', endTime: '17:00', description: 'Work',
      billable: 'invalid_status' as any,
    })).rejects.toThrow('Invalid billable status');
  });

  it('reconciles fees for project', async () => {
    const { reconcileFees } = await import('../timesheetService');
    getDocsMock.mockResolvedValueOnce({
      docs: [
        snap('e1', { userId: 'u1', firmId: 'firm-1', date: '2024-06-01', startTime: '09:00', endTime: '17:00', durationMinutes: 480, description: 'Work', billable: 'billable', totalValueCents: 800000, projectId: 'proj-1', createdAt: '2024-06-01' }),
      ],
    });
    const reconciliations = await reconcileFees('proj-1', 750000);
    expect(reconciliations).toHaveLength(1);
    expect(reconciliations[0].varianceCents).toBe(-50000); // feeCharged - timesheetValue
  });
});
