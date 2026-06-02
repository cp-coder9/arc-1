import { vi } from 'vitest';
import * as firestore from 'firebase/firestore';
import { PROJECT_STAGE_ORDER } from '@/types';
import { canTransition } from '../projectLifecycleService';
import { analyzeTenderBids } from '../agents/tenderAgent';
import { monitorConstructionDelivery } from '../agents/constructionAgent';
import { getDisciplineCoverage } from '../teamService';
import { archiveProject, CLOSEOUT_ARTIFACTS_REQUIRED_ERROR, summaryHasPersistedCloseoutArtifacts } from '../closeoutService';

vi.mock('@/lib/firebase', () => ({
  db: { name: 'mock-db' },
  handleFirestoreError: vi.fn((error: unknown) => { throw error; }),
  OperationType: { GET: 'get', UPDATE: 'update' },
}));

vi.mock('@/lib/uploadService', () => ({ uploadAndTrackFile: vi.fn() }));

vi.mock('../financialLedgerService', () => ({ getLedgerForProject: vi.fn().mockResolvedValue([]) }));

const docMock = vi.mocked(firestore.doc) as any;
const updateDocMock = vi.mocked(firestore.updateDoc) as any;
const runTransactionMock = vi.mocked(firestore.runTransaction) as any;

const snap = (id: string, data: Record<string, unknown>) => ({ id, exists: () => true, data: () => data });
const missingSnap = (id: string) => ({ id, exists: () => false, data: () => ({}) });

describe('Phase 6 lifecycle integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    docMock.mockImplementation((_db: unknown, ...path: string[]) => ({ type: 'doc', path, id: path[path.length - 1] }));
    updateDocMock.mockResolvedValue(undefined);
  });

  it('invokes lifecycle transition rules for happy path stage progression through closeout', () => {
    for (let index = 0; index < PROJECT_STAGE_ORDER.length - 1; index += 1) {
      expect(canTransition(PROJECT_STAGE_ORDER[index], PROJECT_STAGE_ORDER[index + 1])).toBe(true);
    }
    expect(canTransition('closeout', 'payments')).toBe(false);
  });

  it('invokes tender agent analysis and persists bid decision support data', async () => {
    const tender: any = { id: 'tender-1', title: 'Main Works', scope: ['Foundations', 'Roofing'], estimatedBudget: 100000 };
    const bids: any[] = [
      { id: 'bid-1', contractorName: 'Build Co', totalAmount: 100000, proposedTimeline: '10 weeks', qualifications: 'CIDB 5GB', methodology: 'Managed works', lineItems: [{ description: 'Foundations', quantity: 1, unitPrice: 40000, total: 40000 }] },
      { id: 'bid-2', contractorName: 'Risky Co', totalAmount: 60000, proposedTimeline: '8 weeks', qualifications: '', methodology: '', lineItems: [] },
    ];

    const analysis = await analyzeTenderBids(tender, bids);

    expect(analysis.scores['bid-2']).toBeGreaterThanOrEqual(50);
    expect(analysis.riskFlags).toEqual(expect.arrayContaining([expect.objectContaining({ bidId: 'bid-2', severity: 'high' })]));
    expect(analysis.boqVerification.missingScopeItems).toContain('Roofing');
    expect(updateDocMock).toHaveBeenCalledWith(expect.objectContaining({ path: ['tender_packages', 'tender-1'] }), expect.objectContaining({ status: 'evaluating', aiComparisonReport: expect.stringContaining('Bid Comparison') }));
  });

  it('invokes construction agent monitoring for schedule, RFI, and site-log risks', () => {
    const summary = monitorConstructionDelivery(
      [{ id: 'task-1', title: 'Slab', startDate: '2026-01-01', endDate: '2026-01-05', progress: 50, status: 'in_progress' } as any],
      [{ id: 'rfi-1', number: 'RFI-001', subject: 'Beam detail', dueDate: '2026-01-06', status: 'open' } as any],
      [{ id: 'log-1', date: '2026-01-07T00:00:00.000Z', workDescription: '', photos: [] } as any],
      new Date('2026-01-10T00:00:00.000Z')
    );

    expect(summary.progressPercent).toBe(50);
    expect(summary.alerts).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'schedule', severity: 'high' }), expect.objectContaining({ type: 'rfi', severity: 'high' }), expect.objectContaining({ type: 'site_log', severity: 'medium' })]));
    expect(summary.rfiSuggestions['rfi-1']).toContain('Review RFI RFI-001');
  });

  it('uses ledger decision data and team coverage logic from Phase 5 and Phase 2 services', () => {
    const ledger: any[] = [{ type: 'escrow_deposit', amount: 100000 }, { type: 'milestone_release', amount: 45000 }, { type: 'refund', amount: 5000 }];
    const escrowHeld = ledger.reduce((sum, entry) => entry.type === 'escrow_deposit' ? sum + entry.amount : sum - entry.amount, 0);
    const coverage = getDisciplineCoverage({ id: 'project-1', jobId: 'job-1', clientId: 'client-1', currentStage: 'coordination', stageHistory: [], createdAt: '2026-01-01', category: 'Residential', teamMembers: [{ userId: 'architect-1', role: 'architect', discipline: 'architecture', joinedAt: '2026-01-01', status: 'active' }, { userId: 'engineer-1', role: 'freelancer', discipline: 'structure', joinedAt: '2026-01-02', status: 'invited' }] } as any);

    expect(escrowHeld).toBe(50000);
    expect(coverage.filled).toEqual(['architecture']);
    expect(coverage.missing).toEqual(expect.arrayContaining(['structure']));
  });

  it('blocks closeout archive when durable persisted artifacts are missing and does not mutate state', async () => {
    const project = { id: 'project-1', jobId: 'job-1', clientId: 'client-1', leadArchitectId: 'architect-1', currentStage: 'payments', stageHistory: [], closeoutArtifacts: { completionCertificateUrl: 'https://files/cert.pdf' }, createdAt: '2026-01-01' };
    const transaction = { get: vi.fn(), update: vi.fn() };
    transaction.get.mockImplementation(async (ref: any) => ref.path[0] === 'projects' && ref.path.length === 2 ? snap('project-1', project) : missingSnap(ref.id));
    runTransactionMock.mockImplementation(async (_db: unknown, callback: (tx: any) => Promise<unknown>) => callback(transaction));

    await expect(archiveProject('project-1')).rejects.toThrow(CLOSEOUT_ARTIFACTS_REQUIRED_ERROR);

    expect(transaction.update).not.toHaveBeenCalled();
    expect(summaryHasPersistedCloseoutArtifacts({ project: project as any, job: null, teamMembers: [], tenders: [], ledgerEntries: [], budget: { planned: 0, actualReleased: 0, escrowHeld: 0 }, timeline: { startedAt: '2026-01-01', currentStage: 'payments' }, artifacts: project.closeoutArtifacts as any })).toBe(false);
  });

  it('archives atomically only after certificate and final report are persisted', async () => {
    const project = { id: 'project-1', jobId: 'job-1', clientId: 'client-1', leadArchitectId: 'architect-1', currentStage: 'payments', stageHistory: [{ stage: 'payments', enteredAt: '2026-01-01', actorId: 'architect-1' }], closeoutArtifacts: { completionCertificateUrl: 'https://files/cert.pdf', finalReport: '# Final report' }, closeoutGate: completeCloseoutGate(), createdAt: '2026-01-01' };
    const transaction = { get: vi.fn(), update: vi.fn() };
    transaction.get.mockImplementation(async (ref: any) => {
      if (ref.path[0] === 'projects' && ref.path.length === 2) return snap('project-1', project);
      if (ref.id === 'completion_certificate') return snap('completion_certificate', { type: 'completion_certificate', url: 'https://files/cert.pdf' });
      if (ref.id === 'final_report') return snap('final_report', { type: 'final_report', report: '# Final report' });
      return missingSnap(ref.id);
    });
    runTransactionMock.mockImplementation(async (_db: unknown, callback: (tx: any) => Promise<unknown>) => callback(transaction));

    await archiveProject('project-1');

    expect(transaction.update).toHaveBeenCalledWith(expect.objectContaining({ path: ['projects', 'project-1'] }), expect.objectContaining({ archived: true, currentStage: 'closeout' }));
    expect(transaction.update).toHaveBeenCalledWith(expect.objectContaining({ path: ['jobs', 'job-1'] }), expect.objectContaining({ status: 'completed' }));
  });
});

function completeCloseoutGate() {
  return {
    snags: [{ id: 'snag-1', title: 'Paint touch-up', status: 'closed' }],
    certificates: [{ id: 'cert-1', title: 'Electrical COC', status: 'approved', url: 'https://files/cert.pdf' }],
    warranties: [{ id: 'warranty-1', title: 'Waterproofing warranty', status: 'accepted', url: 'https://files/warranty.pdf' }],
    finalAccount: { status: 'approved', approvedBy: 'qs-1', approvedAt: '2026-08-01T00:00:00.000Z', amount: 125000 },
    handoverPack: { status: 'approved', url: 'https://files/handover.zip', documentCount: 5, approvedBy: 'architect-1', approvedAt: '2026-08-01T00:00:00.000Z' },
    unresolvedBlockers: [],
    audit: { reviewedBy: 'architect-1', reviewedAt: '2026-08-01T00:00:00.000Z', source: 'professional_review' },
  };
}
