import { vi } from 'vitest';
import * as firestore from 'firebase/firestore';
import type { Bid, TenderPackage } from '@/types';

const docMock = vi.mocked(firestore.doc) as any;
const writeBatchMock = vi.mocked(firestore.writeBatch) as any;
const callGeminiProxyMock = vi.fn();

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/services/geminiService', () => ({
  getLLMConfig: vi.fn().mockResolvedValue({ provider: 'gemini', apiKey: 'test', model: 'gemini-test' }),
  callGeminiProxy: callGeminiProxyMock,
  callOpenAICompatible: vi.fn(),
  withRetry: (fn: () => Promise<string>) => fn(),
}));

const tender: TenderPackage = { id: 'tender-1', projectId: 'project-1', jobId: 'job-1', title: 'Tender', description: 'Desc', scope: ['Works'], documents: [], deadline: '2026-02-01', estimatedBudget: 1000, requiredDisciplines: ['nhbrc'], status: 'published', createdBy: 'arch-1', createdAt: '2026-01-01T00:00:00.000Z' };
const bids: Bid[] = [
  { id: 'bid-1', tenderPackageId: 'tender-1', contractorId: 'c1', contractorName: 'A', totalAmount: 900, lineItems: [], proposedTimeline: '4 weeks', proposedStartDate: '2026-02-10', methodology: 'Good', qualifications: 'NHBRC', attachments: [], status: 'submitted', createdAt: '2026-01-02T00:00:00.000Z' },
  { id: 'bid-2', tenderPackageId: 'tender-1', contractorId: 'c2', contractorName: 'B', totalAmount: 1200, lineItems: [], proposedTimeline: '3 weeks', proposedStartDate: '2026-02-10', methodology: 'Fast', qualifications: 'CIDB', attachments: [], status: 'submitted', createdAt: '2026-01-03T00:00:00.000Z' },
];

describe('bidComparisonService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    docMock.mockImplementation((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }));
    writeBatchMock.mockReturnValue({ update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) });
    callGeminiProxyMock.mockResolvedValue(JSON.stringify({ report: '# Comparison\nBidder A best value.', scores: [{ bidderLabel: 'Bidder A', score: 91, notes: 'Best value' }, { bidderLabel: 'Bidder B', score: 76, notes: 'Higher risk' }] }));
  });

  it('parses structured AI comparison responses', async () => {
    const { parseBidComparisonResponse } = await import('../bidComparisonService');
    const result = parseBidComparisonResponse('```json\n{"report":"# Report","scores":[{"bidderLabel":"Bidder A","score":105,"notes":"Strong"}]}\n```', bids);
    expect(result.report).toBe('# Report');
    expect(result.scores[0]).toEqual({ bidId: 'bid-1', score: 100, notes: 'Strong' });
    expect(result.scores[1].score).toBe(0);
  });

  it('calls Gemini infrastructure and persists bid scores plus report', async () => {
    const { compareBids } = await import('../bidComparisonService');
    const result = await compareBids(tender, bids);
    expect(result.scores).toHaveLength(2);
    expect(callGeminiProxyMock).toHaveBeenCalled();
    const prompt = callGeminiProxyMock.mock.calls[0][1] as string;
    expect(prompt).toContain('Bidder A');
    expect(prompt).not.toContain('contractorId');
    expect(prompt).not.toContain('contractorName');
    expect(prompt).not.toContain('attachments');
    expect(prompt).not.toContain('c1');
    const batch = writeBatchMock.mock.results[0].value;
    expect(batch.update).toHaveBeenCalledWith(expect.objectContaining({ path: 'tender_packages/tender-1/bids/bid-1' }), expect.objectContaining({ aiScore: 91, aiNotes: 'Best value' }));
    expect(batch.update).toHaveBeenCalledWith(expect.objectContaining({ path: 'tender_packages/tender-1' }), expect.objectContaining({ aiComparisonReport: '# Comparison\nBidder A best value.', status: 'evaluating' }));
    expect(batch.commit).toHaveBeenCalled();
  });
});
