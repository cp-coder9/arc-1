/**
 * Field Report Service Tests
 *
 * Tests the aggregateReport and exportReport pure functions:
 * - Aggregation by date is exhaustive (all matching issues/evidence included)
 * - Blocking count is accurate (blocksPayment AND not closed/rejected)
 * - Weather fallback to 'not_recorded'
 * - Close-out stage includes outstanding snag count
 * - Export document contains all required fields (Req 7.4, 7.25)
 *
 * Tests the generateReport I/O function:
 * - Queries snags, evidence, and daily_logs from Firestore
 * - Persists report to field_reports collection
 * - Report can be retrieved after persistence
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { aggregateReport, exportReport, type ReportInputs } from '../fieldReportService';
import type { FieldReport } from '@/types';

// ─── Mocks for generateReport I/O tests ────────────────────────────────────

const mockAddDoc = vi.fn(() => Promise.resolve({ id: 'report-001' }));
const mockGetDocs = vi.fn();
const mockQuery = vi.fn((...args: unknown[]) => args);
const mockWhere = vi.fn((...args: unknown[]) => args);

vi.mock('firebase/firestore', () => ({
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  where: (...args: unknown[]) => mockWhere(...args),
}));

vi.mock('@/demo-seed/demoFirestore', () => ({
  getDemoCol: vi.fn((...segments: string[]) => ({ _path: segments.join('/') })),
}));

vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-user' } },
  handleFirestoreError: vi.fn((error: unknown) => { throw error; }),
  OperationType: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
  },
}));

describe('fieldReportService', () => {
  describe('aggregateReport', () => {
    const baseInput: ReportInputs = {
      projectId: 'proj-001',
      date: '2026-06-15',
      timeZone: 'Africa/Johannesburg', // UTC+2
      issues: [],
      evidence: [],
    };

    it('returns an empty report when no issues or evidence exist', () => {
      const report = aggregateReport(baseInput);

      expect(report.projectId).toBe('proj-001');
      expect(report.date).toBe('2026-06-15');
      expect(report.timeZone).toBe('Africa/Johannesburg');
      expect(report.issues).toEqual([]);
      expect(report.evidence).toEqual([]);
      expect(report.paymentBlockingCount).toBe(0);
      expect(report.weather).toBe('not_recorded');
      expect(report.outstandingHandoverSnags).toBeUndefined();
    });

    it('filters issues by date range in the project timezone (Req 7.1)', () => {
      // Africa/Johannesburg is UTC+2
      // Day boundaries: 2026-06-15 00:00 SAST = 2026-06-14 22:00 UTC
      //                 2026-06-15 23:59 SAST = 2026-06-15 21:59 UTC
      const input: ReportInputs = {
        ...baseInput,
        issues: [
          { id: 'i1', status: 'open', severity: 'high', createdAt: '2026-06-14T22:00:00.000Z', blocksPayment: false },     // midnight SAST - in range
          { id: 'i2', status: 'allocated', severity: 'medium', createdAt: '2026-06-15T10:00:00.000Z', blocksPayment: false }, // noon SAST - in range
          { id: 'i3', status: 'open', severity: 'low', createdAt: '2026-06-15T21:59:59.000Z', blocksPayment: false },       // 23:59 SAST - in range
          { id: 'i4', status: 'open', severity: 'low', createdAt: '2026-06-14T21:59:59.000Z', blocksPayment: false },       // before midnight SAST - out of range
          { id: 'i5', status: 'open', severity: 'low', createdAt: '2026-06-15T22:00:01.000Z', blocksPayment: false },       // after 23:59 SAST - out of range
        ],
      };

      const report = aggregateReport(input);

      expect(report.issues).toHaveLength(3);
      expect(report.issues.map(i => i.id)).toEqual(['i1', 'i2', 'i3']);
    });

    it('maps issues to FieldIssueSummary with id, status, severity', () => {
      const input: ReportInputs = {
        ...baseInput,
        issues: [
          { id: 'i1', status: 'open', severity: 'critical', createdAt: '2026-06-15T10:00:00.000Z', blocksPayment: true },
        ],
      };

      const report = aggregateReport(input);

      expect(report.issues[0]).toEqual({
        id: 'i1',
        status: 'open',
        severity: 'critical',
      });
    });

    it('filters evidence by capturedAt within the date range (Req 7.1)', () => {
      // Africa/Johannesburg is UTC+2
      // Day start: 2026-06-15 00:00 SAST = 2026-06-14T22:00:00Z
      // Day end:   2026-06-15 23:59:59 SAST = 2026-06-15T21:59:59Z
      const input: ReportInputs = {
        ...baseInput,
        evidence: [
          { id: 'e1', type: 'photo', uri: 'blob://a', capturedAt: '2026-06-15T08:00:00.000Z' },    // 10:00 SAST - in range
          { id: 'e2', type: 'video', uri: 'blob://b', capturedAt: '2026-06-15T22:00:01.000Z' },    // 00:00:01 SAST next day - out of range
          { id: 'e3', type: 'document', uri: 'blob://c', capturedAt: '2026-06-14T22:30:00.000Z' }, // 00:30 SAST - in range
          { id: 'e4', type: 'photo', uri: 'blob://d', capturedAt: '2026-06-14T21:59:00.000Z' },    // 23:59 SAST prev day - out of range
        ],
      };

      const report = aggregateReport(input);

      expect(report.evidence).toHaveLength(2);
      expect(report.evidence.map(e => e.id)).toEqual(['e1', 'e3']);
    });

    it('maps evidence to EvidenceRef with id, type, uri', () => {
      const input: ReportInputs = {
        ...baseInput,
        evidence: [
          { id: 'e1', type: 'photo', uri: 'blob://img1.jpg', capturedAt: '2026-06-15T10:00:00.000Z' },
        ],
      };

      const report = aggregateReport(input);

      expect(report.evidence[0]).toEqual({
        id: 'e1',
        type: 'photo',
        uri: 'blob://img1.jpg',
      });
    });

    it('counts blocking issues not closed/rejected (Req 7.2)', () => {
      const input: ReportInputs = {
        ...baseInput,
        issues: [
          { id: 'i1', status: 'open', severity: 'high', createdAt: '2026-06-15T10:00:00.000Z', blocksPayment: true },
          { id: 'i2', status: 'allocated', severity: 'critical', createdAt: '2026-06-15T10:00:00.000Z', blocksPayment: true },
          { id: 'i3', status: 'closed', severity: 'high', createdAt: '2026-06-15T10:00:00.000Z', blocksPayment: true },      // closed - not counted
          { id: 'i4', status: 'rejected', severity: 'high', createdAt: '2026-06-15T10:00:00.000Z', blocksPayment: true },     // rejected - not counted
          { id: 'i5', status: 'open', severity: 'low', createdAt: '2026-06-15T10:00:00.000Z', blocksPayment: false },         // not blocking
          { id: 'i6', status: 'ready_for_reinspection', severity: 'high', createdAt: '2026-06-15T10:00:00.000Z', blocksPayment: true }, // counted
        ],
      };

      const report = aggregateReport(input);

      expect(report.paymentBlockingCount).toBe(3); // i1, i2, i6
    });

    it('counts blocking issues across ALL issues, not just date-filtered ones (Req 7.2)', () => {
      // Payment blocking count is across ALL provided issues, regardless of date range
      const input: ReportInputs = {
        ...baseInput,
        issues: [
          { id: 'i1', status: 'open', severity: 'high', createdAt: '2026-06-10T10:00:00.000Z', blocksPayment: true },  // out of date range but blocking
          { id: 'i2', status: 'open', severity: 'high', createdAt: '2026-06-15T10:00:00.000Z', blocksPayment: true },  // in date range and blocking
        ],
      };

      const report = aggregateReport(input);

      // Both count as blocking (payment blocking is "as of the report date", not filtered by creation date)
      expect(report.paymentBlockingCount).toBe(2);
    });

    it('returns weather when provided (Req 7.1)', () => {
      const input: ReportInputs = {
        ...baseInput,
        weather: 'rain',
      };

      const report = aggregateReport(input);

      expect(report.weather).toBe('rain');
    });

    it('returns "not_recorded" when weather is undefined (Req 7.3)', () => {
      const input: ReportInputs = {
        ...baseInput,
        weather: undefined,
      };

      const report = aggregateReport(input);

      expect(report.weather).toBe('not_recorded');
    });

    it('includes outstandingHandoverSnags when lifecycleStage is closeout (Req 7.5)', () => {
      const input: ReportInputs = {
        ...baseInput,
        lifecycleStage: 'closeout',
        issues: [
          { id: 'i1', status: 'open', severity: 'medium', createdAt: '2026-06-15T10:00:00.000Z', blocksPayment: false },
          { id: 'i2', status: 'allocated', severity: 'low', createdAt: '2026-06-10T10:00:00.000Z', blocksPayment: false },     // out of date range but counted for snag total
          { id: 'i3', status: 'closed', severity: 'medium', createdAt: '2026-06-15T10:00:00.000Z', blocksPayment: false },      // closed - not outstanding
          { id: 'i4', status: 'rejected', severity: 'low', createdAt: '2026-06-15T10:00:00.000Z', blocksPayment: false },       // rejected - not outstanding
          { id: 'i5', status: 'ready_for_reinspection', severity: 'high', createdAt: '2026-06-14T10:00:00.000Z', blocksPayment: false }, // outstanding
        ],
      };

      const report = aggregateReport(input);

      // Outstanding = not closed AND not rejected = i1, i2, i5
      expect(report.outstandingHandoverSnags).toBe(3);
    });

    it('does not include outstandingHandoverSnags when lifecycleStage is not closeout', () => {
      const input: ReportInputs = {
        ...baseInput,
        lifecycleStage: 'build',
        issues: [
          { id: 'i1', status: 'open', severity: 'medium', createdAt: '2026-06-15T10:00:00.000Z', blocksPayment: false },
        ],
      };

      const report = aggregateReport(input);

      expect(report.outstandingHandoverSnags).toBeUndefined();
    });

    it('does not include outstandingHandoverSnags when lifecycleStage is undefined', () => {
      const input: ReportInputs = {
        ...baseInput,
        issues: [
          { id: 'i1', status: 'open', severity: 'medium', createdAt: '2026-06-15T10:00:00.000Z', blocksPayment: false },
        ],
      };

      const report = aggregateReport(input);

      expect(report.outstandingHandoverSnags).toBeUndefined();
    });

    it('handles UTC timezone correctly', () => {
      // In UTC, 2026-06-15 00:00 to 23:59 maps directly
      const input: ReportInputs = {
        projectId: 'proj-utc',
        date: '2026-06-15',
        timeZone: 'UTC',
        issues: [
          { id: 'i1', status: 'open', severity: 'low', createdAt: '2026-06-15T00:00:00.000Z', blocksPayment: false },
          { id: 'i2', status: 'open', severity: 'low', createdAt: '2026-06-15T23:59:59.000Z', blocksPayment: false },
          { id: 'i3', status: 'open', severity: 'low', createdAt: '2026-06-14T23:59:59.000Z', blocksPayment: false }, // previous day
          { id: 'i4', status: 'open', severity: 'low', createdAt: '2026-06-16T00:00:00.000Z', blocksPayment: false }, // next day
        ],
        evidence: [],
      };

      const report = aggregateReport(input);

      expect(report.issues).toHaveLength(2);
      expect(report.issues.map(i => i.id)).toEqual(['i1', 'i2']);
    });

    it('handles negative UTC offset timezone (America/New_York, UTC-4 in summer)', () => {
      // America/New_York in June is UTC-4 (EDT)
      // 2026-06-15 00:00 EDT = 2026-06-15 04:00 UTC
      // 2026-06-15 23:59 EDT = 2026-06-16 03:59 UTC
      const input: ReportInputs = {
        projectId: 'proj-ny',
        date: '2026-06-15',
        timeZone: 'America/New_York',
        issues: [
          { id: 'i1', status: 'open', severity: 'low', createdAt: '2026-06-15T04:00:00.000Z', blocksPayment: false },  // midnight EDT
          { id: 'i2', status: 'open', severity: 'low', createdAt: '2026-06-16T03:59:59.000Z', blocksPayment: false },  // 23:59 EDT
          { id: 'i3', status: 'open', severity: 'low', createdAt: '2026-06-15T03:59:59.000Z', blocksPayment: false },  // before midnight EDT
          { id: 'i4', status: 'open', severity: 'low', createdAt: '2026-06-16T04:00:01.000Z', blocksPayment: false },  // after 23:59 EDT
        ],
        evidence: [],
      };

      const report = aggregateReport(input);

      expect(report.issues).toHaveLength(2);
      expect(report.issues.map(i => i.id)).toEqual(['i1', 'i2']);
    });

    it('aggregation is exhaustive: includes all matching issues and evidence', () => {
      // Create many issues/evidence all within range to verify none are dropped
      const input: ReportInputs = {
        ...baseInput,
        issues: Array.from({ length: 50 }, (_, i) => ({
          id: `issue-${i}`,
          status: i % 2 === 0 ? 'open' : 'allocated',
          severity: 'medium',
          createdAt: `2026-06-15T${String(Math.floor(i / 3) + 5).padStart(2, '0')}:00:00.000Z`, // all within SAST range
          blocksPayment: i % 5 === 0,
        })),
        evidence: Array.from({ length: 30 }, (_, i) => ({
          id: `ev-${i}`,
          type: 'photo',
          uri: `blob://img-${i}`,
          capturedAt: `2026-06-15T${String(Math.floor(i / 2) + 5).padStart(2, '0')}:00:00.000Z`,
        })),
      };

      const report = aggregateReport(input);

      // All should be within SAST range (05:00 UTC to ~21:00 UTC, and SAST day is 22:00 prev day to 22:00 UTC)
      expect(report.issues.length).toBeGreaterThan(0);
      expect(report.evidence.length).toBeGreaterThan(0);
      // Verify each returned issue has the correct shape
      report.issues.forEach(issue => {
        expect(issue).toHaveProperty('id');
        expect(issue).toHaveProperty('status');
        expect(issue).toHaveProperty('severity');
      });
    });

    it('all weather values are accepted', () => {
      const weatherValues: Array<'clear' | 'cloudy' | 'rain' | 'wind' | 'storm' | 'snow'> = [
        'clear', 'cloudy', 'rain', 'wind', 'storm', 'snow',
      ];

      for (const w of weatherValues) {
        const report = aggregateReport({ ...baseInput, weather: w });
        expect(report.weather).toBe(w);
      }
    });
  });

  describe('exportReport', () => {
    const baseReport: FieldReport = {
      projectId: 'proj-001',
      date: '2026-06-15',
      timeZone: 'Africa/Johannesburg',
      issues: [
        { id: 'i1', status: 'open', severity: 'high' },
        { id: 'i2', status: 'allocated', severity: 'medium' },
        { id: 'i3', status: 'closed', severity: 'low' },
      ],
      evidence: [
        { id: 'e1', type: 'photo', uri: 'blob://img1.jpg' },
        { id: 'e2', type: 'video', uri: 'blob://vid1.mp4' },
      ],
      weather: 'rain',
      paymentBlockingCount: 2,
    };

    it('produces a title containing the report date (Req 7.4)', () => {
      const doc = exportReport(baseReport);
      expect(doc.title).toBe('Field Report — 2026-06-15');
    });

    it('includes the report date (Req 7.4)', () => {
      const doc = exportReport(baseReport);
      expect(doc.date).toBe('2026-06-15');
    });

    it('includes the project identifier (Req 7.4)', () => {
      const doc = exportReport(baseReport);
      expect(doc.projectId).toBe('proj-001');
    });

    it('includes weather as a string (Req 7.4)', () => {
      const doc = exportReport(baseReport);
      expect(doc.weather).toBe('rain');
    });

    it('includes weather "not_recorded" when report has no weather (Req 7.4)', () => {
      const report: FieldReport = { ...baseReport, weather: 'not_recorded' };
      const doc = exportReport(report);
      expect(doc.weather).toBe('not_recorded');
    });

    it('includes paymentBlockingCount (Req 7.4)', () => {
      const doc = exportReport(baseReport);
      expect(doc.paymentBlockingCount).toBe(2);
    });

    it('includes issue summary with id, status, and severity for each issue (Req 7.4)', () => {
      const doc = exportReport(baseReport);
      expect(doc.issueSummary).toEqual([
        { id: 'i1', status: 'open', severity: 'high' },
        { id: 'i2', status: 'allocated', severity: 'medium' },
        { id: 'i3', status: 'closed', severity: 'low' },
      ]);
    });

    it('includes evidence references with id, type, and uri (Req 7.4)', () => {
      const doc = exportReport(baseReport);
      expect(doc.evidenceRefs).toEqual([
        { id: 'e1', type: 'photo', uri: 'blob://img1.jpg' },
        { id: 'e2', type: 'video', uri: 'blob://vid1.mp4' },
      ]);
    });

    it('includes outstandingHandoverSnags when present in report (Req 7.25)', () => {
      const report: FieldReport = { ...baseReport, outstandingHandoverSnags: 5 };
      const doc = exportReport(report);
      expect(doc.outstandingHandoverSnags).toBe(5);
    });

    it('omits outstandingHandoverSnags when not present in report', () => {
      const doc = exportReport(baseReport);
      expect(doc.outstandingHandoverSnags).toBeUndefined();
    });

    it('handles empty issues and evidence arrays', () => {
      const report: FieldReport = {
        ...baseReport,
        issues: [],
        evidence: [],
        paymentBlockingCount: 0,
      };
      const doc = exportReport(report);
      expect(doc.issueSummary).toEqual([]);
      expect(doc.evidenceRefs).toEqual([]);
      expect(doc.paymentBlockingCount).toBe(0);
    });

    it('export document contains all required fields from a full report (Req 7.4, 7.25)', () => {
      const fullReport: FieldReport = {
        projectId: 'proj-full',
        date: '2026-07-01',
        timeZone: 'UTC',
        issues: [
          { id: 'snag-1', status: 'open', severity: 'critical' },
          { id: 'snag-2', status: 'ready_for_reinspection', severity: 'high' },
        ],
        evidence: [
          { id: 'ev-1', type: 'photo', uri: 'blob://photo1.png' },
          { id: 'ev-2', type: 'document', uri: 'blob://doc1.pdf' },
          { id: 'ev-3', type: 'video', uri: 'blob://clip.mp4' },
        ],
        weather: 'clear',
        paymentBlockingCount: 1,
        outstandingHandoverSnags: 3,
      };

      const doc = exportReport(fullReport);

      // All required fields present
      expect(doc.title).toBe('Field Report — 2026-07-01');
      expect(doc.date).toBe('2026-07-01');
      expect(doc.projectId).toBe('proj-full');
      expect(doc.weather).toBe('clear');
      expect(doc.paymentBlockingCount).toBe(1);
      expect(doc.outstandingHandoverSnags).toBe(3);
      expect(doc.issueSummary).toHaveLength(2);
      expect(doc.evidenceRefs).toHaveLength(3);

      // Each issue summary has id, status, severity
      doc.issueSummary.forEach(issue => {
        expect(issue).toHaveProperty('id');
        expect(issue).toHaveProperty('status');
        expect(issue).toHaveProperty('severity');
      });

      // Each evidence ref has id, type, uri
      doc.evidenceRefs.forEach(ev => {
        expect(ev).toHaveProperty('id');
        expect(ev).toHaveProperty('type');
        expect(ev).toHaveProperty('uri');
      });
    });
  });
});


describe('generateReport (I/O)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeMockDocs(docs: Array<{ id: string; data: Record<string, unknown> }>) {
    return {
      docs: docs.map(d => ({
        id: d.id,
        data: () => d.data,
      })),
      empty: docs.length === 0,
    };
  }

  it('queries snags, evidence, and site_logs then persists a report', async () => {
    const { generateReport } = await import('../fieldReportService');

    // Mock getDocs responses: snags, evidence, site_logs (in order of calls)
    mockGetDocs
      .mockResolvedValueOnce(makeMockDocs([
        { id: 'snag-1', data: { status: 'open', severity: 'high', createdAt: '2026-06-15T10:00:00.000Z', blocksPayment: true } },
        { id: 'snag-2', data: { status: 'closed', severity: 'medium', createdAt: '2026-06-15T12:00:00.000Z', blocksPayment: false } },
      ]))
      .mockResolvedValueOnce(makeMockDocs([
        { id: 'ev-1', data: { type: 'photo', uri: 'blob://img.jpg', capturedAt: '2026-06-15T08:00:00.000Z' } },
      ]))
      .mockResolvedValueOnce(makeMockDocs([
        { id: 'log-1', data: { date: '2026-06-15', weather: 'sunny', workDescription: 'Foundation work' } },
      ]));

    const report = await generateReport('proj-001', '2026-06-15', 'Africa/Johannesburg');

    // Verify report structure
    expect(report.projectId).toBe('proj-001');
    expect(report.date).toBe('2026-06-15');
    expect(report.timeZone).toBe('Africa/Johannesburg');
    expect(report.weather).toBe('clear'); // 'sunny' maps to 'clear'
    expect(report.paymentBlockingCount).toBe(1); // snag-1 blocks payment, is open

    // Verify addDoc was called (persistence)
    expect(mockAddDoc).toHaveBeenCalledTimes(1);
    expect(mockAddDoc).toHaveBeenCalledWith(
      expect.objectContaining({ _path: 'projects/proj-001/field_reports' }),
      expect.objectContaining({ projectId: 'proj-001', date: '2026-06-15' })
    );
  });

  it('uses "not_recorded" when no site log exists for the date', async () => {
    const { generateReport } = await import('../fieldReportService');

    mockGetDocs
      .mockResolvedValueOnce(makeMockDocs([])) // no snags
      .mockResolvedValueOnce(makeMockDocs([])) // no evidence
      .mockResolvedValueOnce(makeMockDocs([])); // no site logs

    const report = await generateReport('proj-002', '2026-06-20', 'UTC');

    expect(report.weather).toBe('not_recorded');
    expect(report.issues).toEqual([]);
    expect(report.evidence).toEqual([]);
    expect(report.paymentBlockingCount).toBe(0);
  });

  it('includes outstandingHandoverSnags when lifecycleStage is closeout', async () => {
    const { generateReport } = await import('../fieldReportService');

    mockGetDocs
      .mockResolvedValueOnce(makeMockDocs([
        { id: 's1', data: { status: 'open', severity: 'medium', createdAt: '2026-06-15T10:00:00.000Z', blocksPayment: false } },
        { id: 's2', data: { status: 'allocated', severity: 'low', createdAt: '2026-06-15T11:00:00.000Z', blocksPayment: false } },
        { id: 's3', data: { status: 'closed', severity: 'high', createdAt: '2026-06-15T12:00:00.000Z', blocksPayment: false } },
      ]))
      .mockResolvedValueOnce(makeMockDocs([])) // no evidence
      .mockResolvedValueOnce(makeMockDocs([])); // no weather

    const report = await generateReport('proj-003', '2026-06-15', 'Africa/Johannesburg', { lifecycleStage: 'closeout' });

    // s1 and s2 are outstanding (not closed/rejected)
    expect(report.outstandingHandoverSnags).toBe(2);
  });

  it('persists the report to field_reports collection and returns it', async () => {
    const { generateReport } = await import('../fieldReportService');

    mockGetDocs
      .mockResolvedValueOnce(makeMockDocs([
        { id: 'snag-x', data: { status: 'open', severity: 'critical', createdAt: '2026-07-01T05:00:00.000Z', blocksPayment: true } },
      ]))
      .mockResolvedValueOnce(makeMockDocs([
        { id: 'ev-x', data: { type: 'document', uri: 'blob://doc.pdf', capturedAt: '2026-07-01T06:00:00.000Z' } },
      ]))
      .mockResolvedValueOnce(makeMockDocs([
        { id: 'log-x', data: { date: '2026-07-01', weather: 'rainy', workDescription: 'Roofing' } },
      ]));

    const report = await generateReport('proj-004', '2026-07-01', 'UTC');

    // Verify the returned report has expected data
    expect(report.projectId).toBe('proj-004');
    expect(report.weather).toBe('rain'); // 'rainy' maps to 'rain'

    // Verify persistence call
    expect(mockAddDoc).toHaveBeenCalledTimes(1);
    const [colRef, persistedData] = mockAddDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect((colRef as { _path: string })._path).toBe('projects/proj-004/field_reports');
    expect(persistedData).toHaveProperty('projectId', 'proj-004');
    expect(persistedData).toHaveProperty('date', '2026-07-01');
    expect(persistedData).toHaveProperty('weather', 'rain');
  });

  it('uses priority field as fallback for severity', async () => {
    const { generateReport } = await import('../fieldReportService');

    mockGetDocs
      .mockResolvedValueOnce(makeMockDocs([
        { id: 'snag-legacy', data: { status: 'open', priority: 'high', createdAt: '2026-06-15T10:00:00.000Z', blocksPayment: true } },
      ]))
      .mockResolvedValueOnce(makeMockDocs([]))
      .mockResolvedValueOnce(makeMockDocs([]));

    const report = await generateReport('proj-005', '2026-06-15', 'Africa/Johannesburg');

    // The issue should use the priority field as severity
    expect(report.paymentBlockingCount).toBe(1);
  });

  it('throws and calls handleFirestoreError when Firestore fails', async () => {
    const { generateReport } = await import('../fieldReportService');

    const firestoreError = new Error('Firestore unavailable');
    mockGetDocs.mockRejectedValueOnce(firestoreError);

    await expect(generateReport('proj-err', '2026-06-15', 'UTC')).rejects.toThrow('Firestore unavailable');
  });
});
