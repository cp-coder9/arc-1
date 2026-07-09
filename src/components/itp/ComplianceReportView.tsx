import React from 'react';
import type { UserProfile } from '@/types';
import type { InspectionItemStatus, InspectionType } from '@/services/itpTypes';

export interface ComplianceReportViewProps {
  user: UserProfile;
}

// ── Mock compliance report data — service wiring in task 17.1 ──

interface ReportItem {
  sequenceNumber: number;
  title: string;
  inspectionType: InspectionType;
  status: InspectionItemStatus;
  outcome: 'pass' | 'fail' | 'conditional_pass' | 'pending';
  signedOffBy?: string;
  signedOffAt?: string;
  ncrId?: string;
}

interface LinkedNCR {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium';
  status: 'open' | 'in_review' | 'verified_closed';
}

interface LinkedTestResult {
  id: string;
  materialType: string;
  testMethod: string;
  resultValue: string;
  passFail: 'pass' | 'fail';
  testDate: string;
}

const MOCK_REPORT = {
  itpTitle: 'Foundation Concrete Works',
  status: 'in_progress' as const,
  revisionNumber: 2,
  generatedAt: '2026-07-01T12:00:00Z',
  complianceScore: 87.5,
  summary: {
    total: 14,
    passed: 9,
    failed: 2,
    conditional: 1,
    pending: 2,
  },
};

const MOCK_REPORT_ITEMS: ReportItem[] = [
  { sequenceNumber: 1, title: 'Excavation level verification', inspectionType: 'hold_point', status: 'passed', outcome: 'pass', signedOffBy: 'J. van der Merwe (Pr.Eng)', signedOffAt: '2026-06-15T09:00:00Z' },
  { sequenceNumber: 2, title: 'Rebar placement inspection before pour', inspectionType: 'hold_point', status: 'passed', outcome: 'pass', signedOffBy: 'J. van der Merwe (Pr.Eng)', signedOffAt: '2026-06-18T11:00:00Z' },
  { sequenceNumber: 3, title: 'DPC membrane continuity check', inspectionType: 'hold_point', status: 'failed', outcome: 'fail', signedOffBy: 'J. van der Merwe (Pr.Eng)', signedOffAt: '2026-06-22T11:00:00Z', ncrId: 'NCR-0042' },
  { sequenceNumber: 4, title: 'Concrete cube test at 7 days', inspectionType: 'witness_point', status: 'passed', outcome: 'pass', signedOffBy: 'A. Naidoo (Pr.Eng)', signedOffAt: '2026-06-20T16:00:00Z' },
  { sequenceNumber: 5, title: 'Formwork alignment surveillance', inspectionType: 'surveillance', status: 'conditional', outcome: 'conditional_pass', signedOffBy: 'K. Mokoena', signedOffAt: '2026-06-20T10:00:00Z' },
  { sequenceNumber: 6, title: 'Concrete placement and vibration', inspectionType: 'surveillance', status: 'pending', outcome: 'pending' },
  { sequenceNumber: 7, title: 'Strip foundations dimensions', inspectionType: 'hold_point', status: 'passed', outcome: 'pass', signedOffBy: 'J. van der Merwe (Pr.Eng)', signedOffAt: '2026-06-16T14:00:00Z' },
  { sequenceNumber: 8, title: 'Concrete 28-day cube test', inspectionType: 'witness_point', status: 'passed', outcome: 'pass', signedOffBy: 'A. Naidoo (Pr.Eng)', signedOffAt: '2026-06-28T10:00:00Z' },
  { sequenceNumber: 9, title: 'Backfill compaction verification', inspectionType: 'hold_point', status: 'passed', outcome: 'pass', signedOffBy: 'J. van der Merwe (Pr.Eng)', signedOffAt: '2026-06-25T09:30:00Z' },
  { sequenceNumber: 10, title: 'Soil bearing capacity check', inspectionType: 'hold_point', status: 'passed', outcome: 'pass', signedOffBy: 'J. van der Merwe (Pr.Eng)', signedOffAt: '2026-06-14T08:00:00Z' },
  { sequenceNumber: 11, title: 'Starter bar alignment', inspectionType: 'witness_point', status: 'passed', outcome: 'pass', signedOffBy: 'A. Naidoo (Pr.Eng)', signedOffAt: '2026-06-19T14:00:00Z' },
  { sequenceNumber: 12, title: 'Drainage pipe slope verification', inspectionType: 'surveillance', status: 'passed', outcome: 'pass', signedOffBy: 'K. Mokoena', signedOffAt: '2026-06-21T15:00:00Z' },
  { sequenceNumber: 13, title: 'Waterproofing application', inspectionType: 'hold_point', status: 'failed', outcome: 'fail', signedOffBy: 'J. van der Merwe (Pr.Eng)', signedOffAt: '2026-06-26T11:00:00Z', ncrId: 'NCR-0045' },
  { sequenceNumber: 14, title: 'Curing regime monitoring', inspectionType: 'surveillance', status: 'pending', outcome: 'pending' },
];

const MOCK_NCRS: LinkedNCR[] = [
  { id: 'NCR-0042', title: 'DPC membrane tear at east wall junction', severity: 'high', status: 'in_review' },
  { id: 'NCR-0045', title: 'Waterproofing inadequate coverage on north footing', severity: 'critical', status: 'open' },
];

const MOCK_TEST_RESULTS: LinkedTestResult[] = [
  { id: 'result-001', materialType: 'Concrete', testMethod: 'SANS 3001-GR1', resultValue: '28.5 MPa', passFail: 'pass', testDate: '2026-06-18' },
  { id: 'result-002', materialType: 'Concrete', testMethod: 'SANS 3001-GR1', resultValue: '34.2 MPa', passFail: 'pass', testDate: '2026-06-28' },
  { id: 'result-003', materialType: 'Soil', testMethod: 'SANS 3001-GR30', resultValue: '95.1%', passFail: 'pass', testDate: '2026-06-25' },
];

// ── Helpers ──

function getOutcomeChipStyle(outcome: string): React.CSSProperties {
  switch (outcome) {
    case 'pass':
      return { color: 'var(--green)', background: 'rgba(74,222,128,.1)', borderColor: 'rgba(74,222,128,.18)' };
    case 'fail':
      return { color: 'var(--red)', background: 'rgba(217,87,71,.08)', borderColor: 'rgba(217,87,71,.18)' };
    case 'conditional_pass':
      return { color: 'var(--amber)', background: 'rgba(245,166,35,.08)', borderColor: 'rgba(245,166,35,.18)' };
    default:
      return { color: 'var(--muted)', background: 'rgba(16,32,51,.04)', borderColor: 'var(--border)' };
  }
}

function formatOutcome(outcome: string): string {
  switch (outcome) {
    case 'pass': return 'Pass';
    case 'fail': return 'Fail';
    case 'conditional_pass': return 'Conditional';
    case 'pending': return 'Pending';
    default: return outcome;
  }
}

function getSeverityStyle(severity: string): React.CSSProperties {
  switch (severity) {
    case 'critical': return { color: 'var(--red)', fontWeight: 700 };
    case 'high': return { color: 'var(--red)', fontWeight: 600 };
    case 'medium': return { color: 'var(--amber)', fontWeight: 600 };
    default: return { color: 'var(--muted)' };
  }
}

/**
 * ComplianceReportView — Full compliance report for an ITP.
 * Shows summary stats, all items with outcomes, linked NCRs,
 * and linked test results.
 *
 * Requirements: 10.4, 8.2
 */
export default function ComplianceReportView({ user }: ComplianceReportViewProps) {
  const report = MOCK_REPORT;
  const items = MOCK_REPORT_ITEMS;
  const ncrs = MOCK_NCRS;
  const testResults = MOCK_TEST_RESULTS;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Report Header */}
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
              Compliance Report
            </h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
              {report.itpTitle} · Revision {report.revisionNumber}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="chip chip-needs_decision">
              {report.status.replace(/_/g, ' ')}
            </span>
            <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
              Generated: {new Date(report.generatedAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Compliance Score */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: 14,
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--aqua)',
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 800, color: report.complianceScore >= 80 ? 'var(--green)' : 'var(--red)' }}>
            {report.complianceScore}%
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--deep)' }}>Compliance Score</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              Based on passed inspections and material tests
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10 }}>
          <div className="stat-card">
            <div className="stat-value">{report.summary.total}</div>
            <div className="stat-label">Total Items</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--green)' }}>{report.summary.passed}</div>
            <div className="stat-label">Passed</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--red)' }}>{report.summary.failed}</div>
            <div className="stat-label">Failed</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--amber)' }}>{report.summary.conditional}</div>
            <div className="stat-label">Conditional</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--muted)' }}>{report.summary.pending}</div>
            <div className="stat-label">Pending</div>
          </div>
        </div>
      </section>

      {/* Items with Outcomes */}
      <section className="panel">
        <h2 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--deep)', marginBottom: 14 }}>
          Inspection Items &amp; Outcomes
        </h2>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Title</th>
              <th>Type</th>
              <th>Outcome</th>
              <th>Signed Off By</th>
              <th>Date</th>
              <th>NCR</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const outcomeStyle = getOutcomeChipStyle(item.outcome);
              return (
                <tr key={item.sequenceNumber}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                    {item.sequenceNumber}
                  </td>
                  <td style={{ fontWeight: 500, color: 'var(--ink)', fontSize: 12 }}>
                    {item.title}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' }}>
                    {item.inspectionType.replace(/_/g, ' ')}
                  </td>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        fontSize: 10,
                        fontWeight: 600,
                        borderRadius: 99,
                        border: `1px solid ${outcomeStyle.borderColor}`,
                        ...outcomeStyle,
                      }}
                    >
                      {formatOutcome(item.outcome)}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {item.signedOffBy ?? '—'}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
                    {item.signedOffAt ? new Date(item.signedOffAt).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    {item.ncrId ? (
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--red)', fontFamily: 'monospace' }}>
                        {item.ncrId}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Linked NCRs */}
      <section className="panel">
        <h2 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--deep)', marginBottom: 14 }}>
          Linked Non-Conformance Reports
        </h2>
        {ncrs.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>
            No NCRs linked to this ITP.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>NCR ID</th>
                <th>Title</th>
                <th>Severity</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ncrs.map((ncr) => (
                <tr key={ncr.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>
                    {ncr.id}
                  </td>
                  <td style={{ fontWeight: 500, color: 'var(--ink)', fontSize: 12 }}>
                    {ncr.title}
                  </td>
                  <td>
                    <span style={{ fontSize: 11, textTransform: 'capitalize', ...getSeverityStyle(ncr.severity) }}>
                      {ncr.severity}
                    </span>
                  </td>
                  <td>
                    <span className={ncr.status === 'verified_closed' ? 'chip chip-approved' : ncr.status === 'open' ? 'chip chip-rejected' : 'chip chip-needs_decision'}>
                      {ncr.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Linked Test Results */}
      <section className="panel">
        <h2 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--deep)', marginBottom: 14 }}>
          Linked Test Results
        </h2>
        {testResults.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>
            No test results linked to this ITP.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Test Method</th>
                <th>Result</th>
                <th>Pass/Fail</th>
                <th>Test Date</th>
              </tr>
            </thead>
            <tbody>
              {testResults.map((result) => (
                <tr key={result.id}>
                  <td style={{ fontWeight: 500, color: 'var(--ink)' }}>{result.materialType}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                    {result.testMethod}
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--ink)' }}>{result.resultValue}</td>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        fontSize: 10,
                        fontWeight: 600,
                        borderRadius: 99,
                        ...getOutcomeChipStyle(result.passFail),
                        border: `1px solid ${getOutcomeChipStyle(result.passFail).borderColor}`,
                      }}
                    >
                      {result.passFail === 'pass' ? 'Pass' : 'Fail'}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
                    {result.testDate}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
