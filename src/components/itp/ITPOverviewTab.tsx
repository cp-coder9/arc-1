import React from 'react';
import type { ITPStatus, ConstructionStage, InspectionItemStatus } from '@/services/itpTypes';

// ── Mock data for initial implementation (service calls wired in task 17.1) ──

interface ITPSummary {
  id: string;
  title: string;
  constructionStage: ConstructionStage;
  revisionNumber: number;
  status: ITPStatus;
  itemsCount: number;
  passedCount: number;
  ncrCount: number;
}

interface HoldPointAttention {
  id: string;
  itpTitle: string;
  itemTitle: string;
  status: 'pending' | 'breached';
  requestedDate: string;
  inspectorRole: string;
}

interface ITPOverviewStats {
  complianceScore: number;
  totalITPs: number;
  holdPointBreaches: number;
  pendingTests: number;
  openNCRs: number;
}

const MOCK_STATS: ITPOverviewStats = {
  complianceScore: 87.5,
  totalITPs: 12,
  holdPointBreaches: 2,
  pendingTests: 8,
  openNCRs: 3,
};

const MOCK_ITPS: ITPSummary[] = [
  {
    id: 'itp-001',
    title: 'Foundation Concrete Works',
    constructionStage: 'foundations',
    revisionNumber: 2,
    status: 'in_progress',
    itemsCount: 14,
    passedCount: 9,
    ncrCount: 1,
  },
  {
    id: 'itp-002',
    title: 'Structural Steelwork Erection',
    constructionStage: 'superstructure',
    revisionNumber: 1,
    status: 'approved',
    itemsCount: 22,
    passedCount: 0,
    ncrCount: 0,
  },
  {
    id: 'itp-003',
    title: 'Roof Waterproofing & Membrane',
    constructionStage: 'roof',
    revisionNumber: 1,
    status: 'draft',
    itemsCount: 8,
    passedCount: 0,
    ncrCount: 0,
  },
  {
    id: 'itp-004',
    title: 'Earthworks & Bulk Fill',
    constructionStage: 'earthworks',
    revisionNumber: 3,
    status: 'completed',
    itemsCount: 10,
    passedCount: 10,
    ncrCount: 2,
  },
  {
    id: 'itp-005',
    title: 'External Envelope Brickwork',
    constructionStage: 'external_envelope',
    revisionNumber: 1,
    status: 'in_progress',
    itemsCount: 18,
    passedCount: 12,
    ncrCount: 0,
  },
];

const MOCK_HOLD_POINTS: HoldPointAttention[] = [
  {
    id: 'hp-001',
    itpTitle: 'Foundation Concrete Works',
    itemTitle: 'Rebar placement inspection before pour',
    status: 'pending',
    requestedDate: '2026-07-02T09:00:00Z',
    inspectorRole: 'engineer',
  },
  {
    id: 'hp-002',
    itpTitle: 'Foundation Concrete Works',
    itemTitle: 'DPC membrane continuity check',
    status: 'breached',
    requestedDate: '2026-06-28T14:00:00Z',
    inspectorRole: 'engineer',
  },
  {
    id: 'hp-003',
    itpTitle: 'External Envelope Brickwork',
    itemTitle: 'Cavity wall tie spacing verification',
    status: 'pending',
    requestedDate: '2026-07-04T10:00:00Z',
    inspectorRole: 'architect',
  },
];

// ── Helper functions ──

function getStatusChipClass(status: ITPStatus): string {
  switch (status) {
    case 'approved':
    case 'completed':
      return 'chip chip-approved';
    case 'draft':
      return 'chip chip-draft';
    case 'in_progress':
      return 'chip chip-needs_decision';
    case 'superseded':
    case 'deleted':
      return 'chip chip-rejected';
    default:
      return 'chip chip-draft';
  }
}

function formatStage(stage: ConstructionStage): string {
  return stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getProgressPercentage(passed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((passed / total) * 100);
}

// ── Component ──

export default function ITPOverviewTab() {
  const stats = MOCK_STATS;
  const itps = MOCK_ITPS;
  const holdPoints = MOCK_HOLD_POINTS;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Stat Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--green)' }}>
            {stats.complianceScore}%
          </div>
          <div className="stat-label">Compliance Score</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.totalITPs}</div>
          <div className="stat-label">Total ITPs</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--red)' }}>
            {stats.holdPointBreaches}
          </div>
          <div className="stat-label">Hold Point Breaches</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--amber)' }}>
            {stats.pendingTests}
          </div>
          <div className="stat-label">Pending Tests</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--red)' }}>
            {stats.openNCRs}
          </div>
          <div className="stat-label">Open NCRs</div>
        </div>
      </div>

      {/* ITP List Panel */}
      <section className="panel">
        <h2 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--deep)', marginBottom: 14 }}>
          Inspection Test Plans
        </h2>
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Stage</th>
              <th>Rev</th>
              <th>Status</th>
              <th>Items</th>
              <th>Progress</th>
              <th>NCRs</th>
            </tr>
          </thead>
          <tbody>
            {itps.map((itp) => {
              const progress = getProgressPercentage(itp.passedCount, itp.itemsCount);
              return (
                <tr key={itp.id}>
                  <td style={{ fontWeight: 500, color: 'var(--ink)' }}>{itp.title}</td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{formatStage(itp.constructionStage)}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                    R{itp.revisionNumber}
                  </td>
                  <td>
                    <span className={getStatusChipClass(itp.status)}>
                      {itp.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{itp.itemsCount}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          flex: 1,
                          height: 6,
                          borderRadius: 3,
                          background: 'var(--border)',
                          overflow: 'hidden',
                          minWidth: 60,
                        }}
                      >
                        <div
                          style={{
                            width: `${progress}%`,
                            height: '100%',
                            borderRadius: 3,
                            background: progress === 100 ? 'var(--green)' : 'var(--teal)',
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 32 }}>
                        {progress}%
                      </span>
                    </div>
                  </td>
                  <td>
                    {itp.ncrCount > 0 ? (
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)' }}>
                        {itp.ncrCount}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>0</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Hold Points Attention Panel */}
      <section className="panel">
        <h2 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--deep)', marginBottom: 14 }}>
          Hold Points Requiring Attention
        </h2>
        {holdPoints.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>
            No hold points requiring attention.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {holdPoints.map((hp) => (
              <div key={hp.id} className="action-card">
                <div>
                  <strong style={{ fontSize: 13, color: 'var(--ink)' }}>{hp.itemTitle}</strong>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {hp.itpTitle} · {hp.inspectorRole} · {new Date(hp.requestedDate).toLocaleDateString()}
                  </span>
                </div>
                <span
                  className={hp.status === 'breached' ? 'chip chip-rejected' : 'chip chip-needs_decision'}
                >
                  {hp.status === 'breached' ? 'Breached' : 'Pending'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
