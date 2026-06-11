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

describe('invoiceReadinessService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collectionMock.mockImplementation((_db: unknown, ...s: string[]) => ({ path: s.join('/') }));
    docMock.mockImplementation((dbOrCol: { path?: string } | unknown, ...s: string[]) => {
      if (s.length === 0) return { path: 'invoice_readiness', id: 'generated-id' };
      if (s[0] === 'timesheets') return { path: s.join('/'), id: s[s.length - 1] };
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

  it('checks invoice readiness with valid timesheet', async () => {
    const { checkInvoiceReadiness } = await import('../invoiceReadinessService');
    getDocMock.mockResolvedValueOnce(snap('ts-1', { totalValueCents: 500000, invoiced: false }));
    const check = await checkInvoiceReadiness({
      firmId: 'firm-1', projectId: 'proj-1', timesheetIds: ['ts-1'],
    });
    expect(check.readyForInvoice).toBe(true);
    expect(check.totalAmountCents).toBe(500000);
    expect(check.blockers).toHaveLength(0);
  });

  it('blocks readiness when timesheet not found', async () => {
    const { checkInvoiceReadiness } = await import('../invoiceReadinessService');
    getDocMock.mockResolvedValueOnce(snap('ts-1', null));
    const check = await checkInvoiceReadiness({
      firmId: 'firm-1', projectId: 'proj-1', timesheetIds: ['ts-1'],
    });
    expect(check.readyForInvoice).toBe(false);
    expect(check.blockers).toHaveLength(1);
  });

  it('warns when timesheet already invoiced', async () => {
    const { checkInvoiceReadiness } = await import('../invoiceReadinessService');
    getDocMock.mockResolvedValueOnce(snap('ts-1', { totalValueCents: 300000, invoiced: true }));
    const check = await checkInvoiceReadiness({
      firmId: 'firm-1', projectId: 'proj-1', timesheetIds: ['ts-1'],
    });
    expect(check.warnings).toHaveLength(1);
    expect(check.warnings[0]).toContain('already invoiced');
  });

  it('blocks when no timesheets provided', async () => {
    const { checkInvoiceReadiness } = await import('../invoiceReadinessService');
    const check = await checkInvoiceReadiness({
      firmId: 'firm-1', projectId: 'proj-1', timesheetIds: [],
    });
    expect(check.readyForInvoice).toBe(false);
  });

  it('gets ready but not yet invoiced checks', async () => {
    const { getReadyInvoices } = await import('../invoiceReadinessService');
    getDocsMock.mockResolvedValueOnce({
      docs: [
        snap('r1', { firmId: 'firm-1', projectId: 'proj-1', readyForInvoice: true, invoiced: false, totalAmountCents: 100000, currency: 'ZAR', checkedAt: '2024-01-01', createdAt: '2024-01-01' }),
      ],
    });
    const checks = await getReadyInvoices('firm-1');
    expect(checks).toHaveLength(1);
    expect(checks[0].readyForInvoice).toBe(true);
  });

  it('marks readiness check as invoiced', async () => {
    const { markInvoiced } = await import('../invoiceReadinessService');
    await markInvoiced('r1', 'inv-1');
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock.mock.calls[0][1].invoiced).toBe(true);
    expect(updateDocMock.mock.calls[0][1].invoiceId).toBe('inv-1');
  });

  it('deletes a readiness check', async () => {
    const { deleteInvoiceReadinessCheck } = await import('../invoiceReadinessService');
    await deleteInvoiceReadinessCheck('r1');
    expect(writeBatchMock).toHaveBeenCalled();
  });

  it('throws for missing required fields', async () => {
    const { checkInvoiceReadiness } = await import('../invoiceReadinessService');
    await expect(checkInvoiceReadiness({ firmId: '', projectId: '', timesheetIds: [] })).rejects.toThrow();
  });
});
