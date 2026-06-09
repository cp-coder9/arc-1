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

describe('registrationRenewalService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collectionMock.mockImplementation((_db: unknown, ...s: string[]) => ({ path: s.join('/') }));
    docMock.mockImplementation((dbOrCol: { path?: string } | unknown, ...s: string[]) => {
      if (s.length === 0) return { path: 'registrations', id: 'generated-reg-id' };
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

  it('registers a professional with SACAP', async () => {
    const { registerProfessional } = await import('../registrationRenewalService');
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 2);
    const reg = await registerProfessional({
      userId: 'user-1', firmId: 'firm-1', body: 'SACAP',
      registrationNumber: 'SACAP-12345', expiryDate: futureDate.toISOString(),
      cpdPointsRequired: 30, cpdPointsEarned: 15,
    });
    expect(reg).toEqual(expect.objectContaining({
      userId: 'user-1', firmId: 'firm-1', body: 'SACAP',
      registrationNumber: 'SACAP-12345', status: 'active',
      cpdPointsRequired: 30, cpdPointsEarned: 15,
    }));
    expect(setDocMock).toHaveBeenCalledTimes(1);
  });

  it('detects expiring-soon registration', async () => {
    const { registerProfessional } = await import('../registrationRenewalService');
    const soonDate = new Date();
    soonDate.setDate(soonDate.getDate() + 30); // 30 days = expiring soon
    const reg = await registerProfessional({
      userId: 'user-1', firmId: 'firm-1', body: 'ECSA',
      registrationNumber: 'ECSA-67890', expiryDate: soonDate.toISOString(),
    });
    expect(reg.status).toBe('expiring_soon');
  });

  it('detects expired registration', async () => {
    const { registerProfessional } = await import('../registrationRenewalService');
    const pastDate = new Date();
    pastDate.setFullYear(pastDate.getFullYear() - 1);
    const reg = await registerProfessional({
      userId: 'user-1', firmId: 'firm-1', body: 'SACAP',
      registrationNumber: 'OLD-123', expiryDate: pastDate.toISOString(),
    });
    expect(reg.status).toBe('expired');
  });

  it('throws for invalid registration body', async () => {
    const { registerProfessional } = await import('../registrationRenewalService');
    await expect(registerProfessional({
      userId: 'u1', firmId: 'f1', body: 'INVALID' as any,
      registrationNumber: 'N', expiryDate: '2025-01-01',
    })).rejects.toThrow('Invalid registration body');
  });

  it('updates CPD points and detects shortfall', async () => {
    const { updateCpdPoints } = await import('../registrationRenewalService');
    getDocMock.mockResolvedValueOnce(snap('reg-1', {
      userId: 'u1', firmId: 'f1', body: 'SACAP', cpdPointsRequired: 30,
      cpdPointsEarned: 25, expiryDate: '2026-01-01',
    }));
    await updateCpdPoints('reg-1', 2, 'actor-1'); // total = 27, still shortfall of 3
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock.mock.calls[0][1].cpdPointsEarned).toBe(27);
    // Notification should be called for shortfall
  });

  it('throws for negative CPD points', async () => {
    const { updateCpdPoints } = await import('../registrationRenewalService');
    getDocMock.mockResolvedValueOnce(snap('reg-1', { cpdPointsEarned: 10 }));
    await expect(updateCpdPoints('reg-1', -5, 'actor-1')).rejects.toThrow('CPD points earned cannot be negative');
  });

  it('checks renewal eligibility', async () => {
    const { checkRenewalEligibility } = await import('../registrationRenewalService');
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    getDocMock.mockResolvedValueOnce(snap('reg-1', {
      body: 'SACAP', status: 'active', cpdPointsRequired: 30, cpdPointsEarned: 35,
      expiryDate: futureDate.toISOString(),
    }));
    const result = await checkRenewalEligibility('reg-1');
    expect(result.eligible).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it('blocks renewal with CPD shortfall', async () => {
    const { checkRenewalEligibility } = await import('../registrationRenewalService');
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    getDocMock.mockResolvedValueOnce(snap('reg-1', {
      body: 'ECSA', status: 'active', cpdPointsRequired: 30, cpdPointsEarned: 10,
      expiryDate: futureDate.toISOString(),
    }));
    const result = await checkRenewalEligibility('reg-1');
    expect(result.eligible).toBe(false);
    expect(result.blockers.some((b) => b.includes('CPD shortfall'))).toBe(true);
  });

  it('renews a registration', async () => {
    const { renewRegistration } = await import('../registrationRenewalService');
    getDocMock.mockResolvedValueOnce(snap('reg-1', {
      userId: 'u1', firmId: 'f1', body: 'SACAP', cpdPointsRequired: 30, cpdPointsEarned: 30,
    }));
    const newDate = new Date();
    newDate.setFullYear(newDate.getFullYear() + 3);
    await renewRegistration('reg-1', newDate.toISOString(), 'actor-1');
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock.mock.calls[0][1].expiryDate).toBe(newDate.toISOString());
    expect(updateDocMock.mock.calls[0][1].status).toBe('active');
  });

  it('sends renewal reminders', async () => {
    const { sendRenewalReminders } = await import('../registrationRenewalService');
    const nearFuture = new Date();
    nearFuture.setDate(nearFuture.getDate() + 45);
    getDocsMock.mockResolvedValueOnce({
      docs: [
        snap('r1', { userId: 'u1', firmId: 'f1', body: 'SACAP', expiryDate: nearFuture.toISOString(), status: 'expiring_soon', renewalReminderSent: false, registrationNumber: 'N1', cpdPointsRequired: 30, cpdPointsEarned: 20, createdAt: '2024-01-01' }),
      ],
    });
    const sent = await sendRenewalReminders('firm-1');
    expect(sent).toBe(1);
  });
});
