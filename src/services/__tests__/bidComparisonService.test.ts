import { vi } from 'vitest';
import * as firestore from 'firebase/firestore';
import type { Bid, TenderPackage } from '../../types';

type DocMock = ReturnType<typeof vi.fn<(...args: unknown[]) => unknown>>;
type UpdateDocMock = ReturnType<typeof vi.fn<(...args: unknown[]) => Promise<void>>>;

const docMock = firestore.doc as unknown as DocMock;
const updateDocMock = firestore.updateDoc as unknown as UpdateDocMock;

vi.mock('@/lib/firebase', () => ({ db: { name: 'mock-db' } }));

const tender: TenderPackage = {
  id: 'tender-1',
  projectId: 'project-1',
  jobId: 'job-1',
  title: 'Main Works',
  description: 'Main construction works',
  scope: ['Foundations'],
  documents: [],
  deadline: '2026-06-30',
  estimatedBudget: 150000,
  requiredDisciplines: ['architecture'],
  status: 'closed',
  createdBy: 'architect-1',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const bids: Bid[] = [
  { id: 'bid-expensive', tenderPackageId: 'tender-1', contractorId: 'contractor-2', contractorName: 'Premium Build', totalAmount: 140000, lineItems: [], proposedTimeline: '8 weeks', proposedStartDate: '2026-07-01', methodology: 'Fast track', qualifications: 'CIDB 6GB', attachments: [], verificationId: 'contractor-1_contractor_CIDB_CIDB-5GB', status: 'submitted', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'bid-cheap', tenderPackageId: 'tender-1', contractorId: 'contractor-1', contractorName: 'Value Build', totalAmount: 100000, lineItems: [], proposedTimeline: '10 weeks', proposedStartDate: '2026-07-01', methodology: 'Standard', qualifications: 'CIDB 5GB', attachments: [], verificationId: 'contractor-1_contractor_CIDB_CIDB-5GB', status: 'submitted', createdAt: '2026-01-01T00:00:00.000Z' },
];

describe('bidComparisonService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    docMock.mockImplementation((_db: unknown, ...pathSegments: unknown[]) => {
      const rawPath = pathSegments.map(String);
      const segments = rawPath.length === 1 && rawPath[0].includes('/') ? rawPath[0].split('/') : rawPath;
      return { type: 'doc', path: segments, id: segments[segments.length - 1] };
    });
    updateDocMock.mockResolvedValue(undefined);
  });

  it('scores lower bids higher, writes AI fields, and returns markdown report', async () => {
    const { compareBids } = await import('../bidComparisonService');

    const result = await compareBids(tender, bids);

    expect(result.scores['bid-cheap']).toBeGreaterThan(result.scores['bid-expensive']);
    expect(result.report).toContain('## Bid Comparison: Main Works');
    expect(result.report).toContain('| Contractor | Amount | Timeline | Score |');
    expect(updateDocMock).toHaveBeenCalledWith(expect.objectContaining({ path: ['tender_packages', 'tender-1', 'bids', 'bid-cheap'] }), expect.objectContaining({ aiScore: result.scores['bid-cheap'], aiNotes: expect.stringContaining('Value Build') }));
    expect(updateDocMock).toHaveBeenCalledWith(expect.objectContaining({ path: ['tender_packages', 'tender-1'] }), expect.objectContaining({ status: 'evaluating', aiComparisonReport: result.report }));
  });
});
