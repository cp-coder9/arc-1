import { vi } from 'vitest';
import * as firestore from 'firebase/firestore';
import { Project } from '@/types';
import { recordTransaction } from '../financialLedgerService';

vi.mock('@/lib/firebase', () => ({
  db: { name: 'mock-db' },
  auth: { currentUser: { uid: 'user-1', getIdToken: vi.fn().mockResolvedValue('mock-token') } },
}));

vi.mock('@/services/notificationService', () => ({
  notificationService: {
    notifyPaymentReleased: vi.fn().mockResolvedValue(undefined),
    notifyEscrowFunded: vi.fn().mockResolvedValue(undefined),
    notifyRefundProcessed: vi.fn().mockResolvedValue(undefined),
    notifyInvoiceSent: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/services/financialLedgerService', () => ({
  recordTransaction: vi.fn().mockResolvedValue('ledger-1'),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

const collectionMock = vi.mocked(firestore.collection) as any;
const docMock = vi.mocked(firestore.doc) as any;
const getDocMock = vi.mocked(firestore.getDoc) as any;
const setDocMock = vi.mocked(firestore.setDoc) as any;
const updateDocMock = vi.mocked(firestore.updateDoc) as any;
const runTransactionMock = vi.mocked(firestore.runTransaction) as any;
const recordTransactionMock = vi.mocked(recordTransaction) as any;
let paymentService: typeof import('../paymentService').paymentService;

const snap = (id: string, data: Record<string, unknown>) => ({
  id,
  exists: () => true,
  data: () => data,
});

const project: Project = {
  id: 'project-1',
  jobId: 'job-1',
  clientId: 'client-1',
  leadArchitectId: 'architect-1',
  currentStage: 'compliance',
  stageHistory: [],
  teamMembers: [],
  createdAt: '2026-01-01T00:00:00.000Z',
};

const escrow = {
  jobId: 'job-1',
  linkedProjectId: 'project-1',
  totalAmount: 100000,
  heldAmount: 100000,
  releasedAmount: 0,
  platformFeeAmount: 5000,
  refundedAmount: 0,
  status: 'funded',
  milestones: [
    { id: 'intake', name: 'Intake & Brief Confirmation', stage: 'intake', percentage: 10, amount: 10000, status: 'released', releasedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'appointment', name: 'Professional Appointment', stage: 'appointment', percentage: 15, amount: 15000, status: 'released', releasedAt: '2026-01-02T00:00:00.000Z' },
    { id: 'compliance', name: 'Compliance Documentation', stage: 'compliance', percentage: 25, amount: 25000, status: 'release_requested', requestedAt: '2026-01-03T00:00:00.000Z' },
    { id: 'tender', name: 'Tender & Procurement', stage: 'tender', percentage: 20, amount: 20000, status: 'funded' },
    { id: 'delivery', name: 'Construction Delivery', stage: 'delivery', percentage: 20, amount: 20000, status: 'funded' },
    { id: 'closeout', name: 'Close-out & Handover', stage: 'closeout', percentage: 10, amount: 10000, status: 'funded' },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('PaymentService Phase 5 stage escrow', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    collectionMock.mockImplementation((_db: unknown, path: string) => ({ type: 'collection', path }));
    docMock.mockImplementation((_dbOrCollection: unknown, path?: string, id?: string) => ({ type: 'doc', path, id }));
    setDocMock.mockResolvedValue(undefined);
    updateDocMock.mockResolvedValue(undefined);
    recordTransactionMock.mockResolvedValue('ledger-1');
    getDocMock.mockImplementation(async (ref: any) => {
      if (ref.path === 'projects') return snap('project-1', project as unknown as Record<string, unknown>);
      if (ref.path === 'escrow') return snap('job-1', escrow as Record<string, unknown>);
      return { id: 'missing', exists: () => false, data: () => ({}) };
    });
    paymentService = (await import('../paymentService')).paymentService;
  });

  it('initializeStageEscrow creates six milestones with expected percentages and amounts', async () => {
    await paymentService.initializeStageEscrow(project, 100000);

    expect(setDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'escrow', id: 'job-1' }),
      expect.objectContaining({ linkedProjectId: 'project-1', totalAmount: 100000, heldAmount: 100000 }),
      { merge: true }
    );
    const savedEscrow = setDocMock.mock.calls[0][1];
    expect(savedEscrow.milestones).toHaveLength(6);
    expect(savedEscrow.milestones.map((milestone: any) => [milestone.stage, milestone.percentage, milestone.amount])).toEqual([
      ['intake', 10, 10000],
      ['appointment', 15, 15000],
      ['compliance', 25, 25000],
      ['tender', 20, 20000],
      ['delivery', 20, 20000],
      ['closeout', 10, 10000],
    ]);
    expect(recordTransactionMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'escrow_deposit', amount: 100000, direction: 'credit' }));
  });

  it('requestStageRelease marks only the matching milestone as release_requested', async () => {
    await paymentService.requestStageRelease('project-1', 'delivery');

    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const updatePayload = updateDocMock.mock.calls[0][1];
    expect(updatePayload.milestones.filter((milestone: any) => milestone.status === 'release_requested').map((milestone: any) => milestone.stage)).toEqual(['compliance', 'delivery']);
    expect(updatePayload.milestones.find((milestone: any) => milestone.stage === 'tender').status).toBe('funded');
  });

  it('approveStageRelease rejects non-requested milestone release', async () => {
    const notRequestedEscrow = { ...escrow, milestones: escrow.milestones.map((milestone) => milestone.stage === 'compliance' ? { ...milestone, status: 'funded' } : milestone) };
    runTransactionMock.mockImplementation(async (_db: unknown, callback: (transaction: any) => Promise<unknown>) => callback({
      get: vi.fn(async (ref: any) => ref.path === 'projects'
        ? snap('project-1', project as unknown as Record<string, unknown>)
        : snap('job-1', notRequestedEscrow as Record<string, unknown>)),
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    }));

    await expect(paymentService.approveStageRelease('project-1', 'compliance', 'admin-1')).rejects.toThrow('Milestone release must be requested before approval');
  });

  it('approveStageRelease atomically writes escrow update, ledger entry, invoice, and VAT-inclusive totals', async () => {
    const transaction = { get: vi.fn(), set: vi.fn(), update: vi.fn(), delete: vi.fn() };
    transaction.get.mockImplementation(async (ref: any) => ref.path === 'projects'
      ? snap('project-1', project as unknown as Record<string, unknown>)
      : snap('job-1', escrow as Record<string, unknown>));
    runTransactionMock.mockImplementation(async (_db: unknown, callback: (tx: any) => Promise<unknown>) => callback(transaction));

    await paymentService.approveStageRelease('project-1', 'compliance', 'admin-1');

    expect(runTransactionMock).toHaveBeenCalledTimes(1);
    expect(transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'escrow', id: 'job-1' }),
      expect.objectContaining({ releasedAmount: 25000, heldAmount: 75000, status: 'partially_released' })
    );
    expect(transaction.set).toHaveBeenCalledTimes(2);
    const ledgerEntry = transaction.set.mock.calls.find((call: any[]) => call[1].type === 'milestone_release')?.[1];
    expect(ledgerEntry).toEqual(expect.objectContaining({ type: 'milestone_release', amount: 25000, direction: 'debit', escrowMilestoneId: 'compliance' }));
    const invoice = transaction.set.mock.calls.find((call: any[]) => call[1].invoiceNumber)?.[1];
    expect(invoice).toEqual(expect.objectContaining({ subtotal: 21739, taxAmount: 3261, taxRate: 15, totalAmount: 25000 }));
    expect(invoice.items[0]).toEqual(expect.objectContaining({ unitPrice: 21739, total: 21739 }));
  });
});
