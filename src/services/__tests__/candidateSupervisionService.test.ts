import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as firestore from 'firebase/firestore';

const handleFirestoreErrorMock = vi.fn((error: unknown) => { throw error; });

vi.mock('@/lib/firebase', () => ({
  db: { name: 'test-db' },
  OperationType: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LIST: 'list', GET: 'get', WRITE: 'write' },
  handleFirestoreError: handleFirestoreErrorMock,
}));

vi.mock('../notificationService', () => ({
  notificationService: { sendNotification: vi.fn().mockResolvedValue(undefined) },
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

describe('candidateSupervisionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collectionMock.mockImplementation((_db: unknown, ...s: string[]) => ({ path: s.join('/') }));
    docMock.mockImplementation((dbOrCol: { path?: string } | unknown, ...s: string[]) => {
      if (s.length === 0) return { path: 'supervision_logs', id: 'generated-log-id' };
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

  it('creates a supervision log with required fields', async () => {
    const { createSupervisionLog } = await import('../candidateSupervisionService');
    const log = await createSupervisionLog({
      candidateId: 'cand-1', mentorId: 'mentor-1', firmId: 'firm-1',
      periodStart: '2024-01-01', periodEnd: '2024-01-31',
      hoursLogged: 160, activities: 'Site supervision and drawing review',
      sacapCategory: 'Professional Architect',
    });
    expect(log).toEqual(expect.objectContaining({
      candidateId: 'cand-1', mentorId: 'mentor-1', firmId: 'firm-1',
      hoursLogged: 160, status: 'draft',
    }));
    expect(setDocMock).toHaveBeenCalledTimes(1);
  });

  it('throws for missing required fields', async () => {
    const { createSupervisionLog } = await import('../candidateSupervisionService');
    await expect(createSupervisionLog({
      candidateId: '', mentorId: '', firmId: '', periodStart: '',
      periodEnd: '', hoursLogged: 0, activities: '',
    })).rejects.toThrow();
  });

  it('submits draft log for review', async () => {
    const { submitForReview } = await import('../candidateSupervisionService');
    getDocMock.mockResolvedValueOnce(snap('log-1', { status: 'draft', mentorId: 'mentor-1' }));
    await submitForReview('log-1', 'cand-1');
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock.mock.calls[0][1].status).toBe('submitted');
  });

  it('prevents submitting a non-draft log', async () => {
    const { submitForReview } = await import('../candidateSupervisionService');
    getDocMock.mockResolvedValueOnce(snap('log-1', { status: 'signed_off', mentorId: 'mentor-1' }));
    await expect(submitForReview('log-1', 'cand-1')).rejects.toThrow('Cannot submit a log with status');
  });

  it('mentor reviews a submitted log', async () => {
    const { reviewLog } = await import('../candidateSupervisionService');
    getDocMock.mockResolvedValueOnce(snap('log-1', { status: 'submitted', mentorId: 'mentor-1' }));
    await reviewLog('log-1', 'mentor-1', 'Good progress.');
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock.mock.calls[0][1].status).toBe('reviewed');
  });

  it('prevents review by non-mentor', async () => {
    const { reviewLog } = await import('../candidateSupervisionService');
    getDocMock.mockResolvedValueOnce(snap('log-1', { status: 'submitted', mentorId: 'mentor-1' }));
    await expect(reviewLog('log-1', 'wrong-mentor', 'Notes')).rejects.toThrow('Only the assigned mentor');
  });

  it('mentor signs off a reviewed log', async () => {
    const { signOffLog } = await import('../candidateSupervisionService');
    getDocMock.mockResolvedValueOnce(snap('log-1', { status: 'reviewed', mentorId: 'mentor-1' }));
    await signOffLog('log-1', 'mentor-1');
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock.mock.calls[0][1].status).toBe('signed_off');
    expect(updateDocMock.mock.calls[0][1].signedOffBy).toBe('mentor-1');
  });

  it('rejects a log with reason', async () => {
    const { rejectLog } = await import('../candidateSupervisionService');
    getDocMock.mockResolvedValueOnce(snap('log-1', { status: 'submitted', mentorId: 'mentor-1' }));
    await rejectLog('log-1', 'mentor-1', 'Insufficient detail.');
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock.mock.calls[0][1].status).toBe('rejected');
    expect(updateDocMock.mock.calls[0][1].rejectedReason).toBe('Insufficient detail.');
  });

  it('gets candidate logs', async () => {
    const { getCandidateLogs } = await import('../candidateSupervisionService');
    getDocsMock.mockResolvedValueOnce({
      docs: [
        snap('l1', { candidateId: 'cand-1', mentorId: 'm1', firmId: 'firm-1', periodStart: '2024-01-01', periodEnd: '2024-01-31', hoursLogged: 160, activities: 'Work', status: 'signed_off', createdAt: '2024-02-01' }),
      ],
    });
    const logs = await getCandidateLogs('cand-1', 'firm-1');
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('signed_off');
  });

  it('gets mentor logs', async () => {
    const { getMentorLogs } = await import('../candidateSupervisionService');
    getDocsMock.mockResolvedValueOnce({ docs: [] });
    const logs = await getMentorLogs('mentor-1', 'firm-1');
    expect(logs).toHaveLength(0);
  });

  it('deletes a supervision log', async () => {
    const { deleteSupervisionLog } = await import('../candidateSupervisionService');
    await deleteSupervisionLog('log-1');
    expect(writeBatchMock).toHaveBeenCalled();
  });
});
