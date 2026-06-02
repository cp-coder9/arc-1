import { beforeEach, describe, expect, it, vi } from 'vitest';

const uploadAndTrackFileMock = vi.hoisted(() => vi.fn());
const getDocMock = vi.hoisted(() => vi.fn());
const getDocsMock = vi.hoisted(() => vi.fn());
const docMock = vi.hoisted(() => vi.fn((_: unknown, collectionPath: string, id?: string) => ({ collectionPath, id })));
const collectionMock = vi.hoisted(() => vi.fn((_: unknown, path: string) => ({ path })));
const queryMock = vi.hoisted(() => vi.fn((collectionRef: unknown, ...constraints: unknown[]) => ({ collectionRef, constraints })));
const whereMock = vi.hoisted(() => vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })));
const pdfDocMock = vi.hoisted(() => ({
  addPage: vi.fn(),
  embedStandardFont: vi.fn((fontName: string) => ({ fontName })),
  save: vi.fn(),
}));
const PDFDocumentCreateMock = vi.hoisted(() => vi.fn());
const drawTextMock = vi.hoisted(() => vi.fn());
const drawRectangleMock = vi.hoisted(() => vi.fn());
const drawCircleMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/firebase', () => ({ db: { name: 'mock-db' } }));
vi.mock('../../lib/firebase', () => ({ db: { name: 'mock-db' } }));
vi.mock('../lib/uploadService', () => ({ uploadAndTrackFile: uploadAndTrackFileMock }));
vi.mock('../../lib/uploadService', () => ({ uploadAndTrackFile: uploadAndTrackFileMock }));
vi.mock('firebase/firestore', () => ({
  doc: docMock,
  getDoc: getDocMock,
  collection: collectionMock,
  getDocs: getDocsMock,
  query: queryMock,
  where: whereMock,
}));
vi.mock('pdf-lib', () => ({
  PDFDocument: { create: PDFDocumentCreateMock },
  PDFPage: class MockPDFPage {},
  StandardFonts: { Helvetica: 'Helvetica', HelveticaBold: 'HelveticaBold', Courier: 'Courier' },
  PageSizes: { A4: [595, 842] },
  rgb: (r: number, g: number, b: number) => ({ r, g, b }),
}));

const makePage = () => ({
  getSize: vi.fn(() => ({ width: 595, height: 842 })),
  drawText: drawTextMock,
  drawRectangle: drawRectangleMock,
  drawCircle: drawCircleMock,
});

const makeDocSnapshot = (id: string, data: Record<string, unknown> | null) => ({
  id,
  exists: () => data !== null,
  data: () => data,
});

const { pdfGenerationService } = await import('../pdfGenerationService');

describe('pdfGenerationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date('2026-05-15T12:00:00.000Z'));
    pdfDocMock.addPage.mockImplementation(() => makePage());
    pdfDocMock.save.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    PDFDocumentCreateMock.mockResolvedValue(pdfDocMock);
    uploadAndTrackFileMock.mockResolvedValue('https://files.example/submission.pdf');
  });

  it('wraps long text without exceeding the configured character width where words allow it', () => {
    const wrapped = (pdfGenerationService as unknown as { wrapText: (text: string, maxWidth: number) => string[] })
      .wrapText('The council submission package includes reviewed drawings and supporting compliance evidence.', 24);

    expect(wrapped.length).toBeGreaterThan(1);
    expect(wrapped.every(line => line.length <= 24)).toBe(true);
    expect(wrapped.join(' ')).toBe('The council submission package includes reviewed drawings and supporting compliance evidence.');
  });

  it('generates and uploads a council submission package from mocked Firestore data', async () => {
    getDocMock.mockImplementation(async (ref: { collectionPath: string; id?: string }) => {
      if (ref.collectionPath === 'council_submissions') {
        return makeDocSnapshot('submission-1', {
          jobId: 'job-1',
          referenceNumber: 'REF-123',
          municipality: 'COJ',
          documents: [{ name: 'Approved drawing set' }],
        });
      }
      if (ref.collectionPath === 'jobs') {
        return makeDocSnapshot('job-1', {
          id: 'job-1',
          title: 'New dwelling',
          category: 'Residential',
          clientId: 'client-1',
          selectedArchitectId: 'architect-1',
        });
      }
      if (ref.collectionPath === 'users' && ref.id === 'client-1') {
        return makeDocSnapshot('client-1', { displayName: 'Client User', email: 'client@example.com' });
      }
      if (ref.collectionPath === 'users' && ref.id === 'architect-1') {
        return makeDocSnapshot('architect-1', { displayName: 'Architect User', email: 'architect@example.com' });
      }
      return makeDocSnapshot('missing', null);
    });
    getDocsMock.mockResolvedValue({
      docs: [makeDocSnapshot('drawing-1', {
        status: 'approved',
        drawingName: 'Plans A1',
        drawingUrl: 'https://files.example/plans-a1.pdf',
        aiFeedback: 'Compliant with checked SANS requirements.',
        aiStructuredFeedback: [{ name: 'Fire safety', issues: [] }],
      })],
    });

    const result = await pdfGenerationService.generateCouncilSubmissionPackage('submission-1', 'admin-1');

    expect(result).toEqual({
      url: 'https://files.example/submission.pdf',
      fileName: expect.stringMatching(/^council-submission-REF-123-\d+\.pdf$/),
    });
    expect(PDFDocumentCreateMock).toHaveBeenCalledTimes(1);
    expect(pdfDocMock.addPage).toHaveBeenCalledTimes(4);
    expect(uploadAndTrackFileMock).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({
      fileName: expect.stringMatching(/^council-submission-REF-123-\d+\.pdf$/),
      fileType: 'application/pdf',
      fileSize: 4,
      uploadedBy: 'admin-1',
      context: 'submission',
      jobId: 'job-1',
    }));
    expect(collectionMock).toHaveBeenCalledWith(expect.anything(), 'jobs/job-1/submissions');
    expect(whereMock).toHaveBeenCalledWith('status', '==', 'approved');
    expect(drawTextMock).toHaveBeenCalledWith(expect.stringContaining('Reference: REF-123'), expect.any(Object));
  });

  it('throws before PDF creation when required submission data is missing', async () => {
    getDocMock.mockResolvedValue(makeDocSnapshot('submission-1', null));

    await expect(pdfGenerationService.generateCouncilSubmissionPackage('submission-1', 'admin-1'))
      .rejects.toThrow('Failed to fetch submission data');
    expect(PDFDocumentCreateMock).not.toHaveBeenCalled();
    expect(uploadAndTrackFileMock).not.toHaveBeenCalled();
  });
});
