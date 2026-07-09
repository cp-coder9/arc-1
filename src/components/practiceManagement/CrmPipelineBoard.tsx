/**
 * CrmPipelineBoard — Pipeline opportunities board with weighted values and win/lose actions.
 *
 * Displays pipeline opportunities with probability, weighted values,
 * high-confidence indicators, and quick win/lose transition actions.
 *
 * Requirements: 13.1, 13.2, 13.3, 15.5
 * @module practiceManagement/CrmPipelineBoard
 */

import { useState, useMemo } from 'react';
import { GitBranch, Trophy, XCircle, TrendingUp, Star, DollarSign } from 'lucide-react';
import type { UserProfile } from '@/types';
import type { PipelineOpportunity, BillingRateRole } from '@/services/practiceManagement/types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface CrmPipelineBoardProps {
  user: UserProfile;
  opportunities?: PipelineOpportunity[];
  onWin?: (id: string) => void;
  onLose?: (id: string, reason: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
});

function formatCents(cents: number): string {
  return currency.format(cents / 100);
}

function probabilityColor(probability: number): string {
  if (probability >= 75) return 'var(--green)';
  if (probability >= 50) return 'var(--amber)';
  return 'var(--muted)';
}

const ROLE_LABELS: Record<BillingRateRole, string> = {
  architect: 'Architect',
  technologist: 'Technologist',
  technician: 'Technician',
  draughtsperson: 'Draughtsperson',
  admin: 'Admin',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function CrmPipelineBoard({
  user,
  opportunities = [],
  onWin,
  onLose,
}: CrmPipelineBoardProps) {
  const [loseConfirmId, setLoseConfirmId] = useState<string | null>(null);
  const [loseReason, setLoseReason] = useState('');

  // Stats
  const stats = useMemo(() => {
    const total = opportunities.length;
    const highConfidence = opportunities.filter((o) => o.isHighConfidence).length;
    const totalWeighted = opportunities.reduce((sum, o) => sum + o.weightedValueCents, 0);
    const totalFee = opportunities.reduce((sum, o) => sum + (o.estimatedValueCents ?? 0), 0);
    return { total, highConfidence, totalWeighted, totalFee };
  }, [opportunities]);

  // Sort by probability descending
  const sorted = useMemo(
    () => [...opportunities].sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0)),
    [opportunities],
  );

  function handleLoseConfirm(id: string) {
    if (loseReason.trim()) {
      onLose?.(id, loseReason.trim());
      setLoseConfirmId(null);
      setLoseReason('');
    }
  }

  // ─── Empty State ─────────────────────────────────────────────────────────

  if (opportunities.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
          <GitBranch size={28} style={{ color: 'var(--muted)', marginBottom: 8 }} />
          <h2 style={{ color: 'var(--ink)', fontSize: 15, marginBottom: 6 }}>No Pipeline Opportunities</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Pipeline opportunities will appear here once they are created.
          </p>
        </section>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">CRM PIPELINE</div>
            <h1>Pipeline Board</h1>
            <p className="sub">{stats.total} opportunities · {stats.highConfidence} high-confidence</p>
          </div>
        </div>
        <div className="hero-pills">
          <span className="pill">
            <span className="dot"></span> {formatCents(stats.totalWeighted)} weighted
          </span>
        </div>
      </div>

      {/* Stat Row */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--deep)' }}>{stats.total}</div>
          <div className="stat-label">Opportunities</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--green)' }}>{stats.highConfidence}</div>
          <div className="stat-label">High Confidence</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--teal)' }}>{formatCents(stats.totalWeighted)}</div>
          <div className="stat-label">Weighted Value</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--ink)' }}>{formatCents(stats.totalFee)}</div>
          <div className="stat-label">Total Fee Value</div>
        </div>
      </div>

      {/* Pipeline Table */}
      <section className="panel">
        <h2>Opportunities</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Project</th>
              <th style={{ textAlign: 'right' }}>Estimated Fee</th>
              <th style={{ textAlign: 'center' }}>Probability</th>
              <th style={{ textAlign: 'right' }}>Weighted Value</th>
              <th>Disciplines</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((opp) => (
              <tr key={opp.id ?? opp.projectId}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {opp.isHighConfidence && (
                      <Star size={12} style={{ color: 'var(--amber)', fill: 'var(--amber)' }} />
                    )}
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{opp.title ?? opp.projectId}</span>
                  </div>
                  {opp.expectedStartDate && (
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                      Expected start: {opp.expectedStartDate}
                    </div>
                  )}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: 'var(--ink)' }}>
                  {formatCents(opp.estimatedFeeCents ?? 0)}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 600,
                    color: probabilityColor(opp.probability ?? 0),
                    background: `color-mix(in srgb, ${probabilityColor(opp.probability ?? 0)} 12%, transparent)`,
                  }}>
                    {opp.probability ?? 0}%
                  </span>
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: 'var(--teal)' }}>
                  {formatCents(opp.weightedValueCents)}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {opp.requiredDisciplines?.slice(0, 3).map((d) => (
                      <span key={d} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(25,183,176,.08)', color: 'var(--deep)', border: '1px solid rgba(25,183,176,.15)' }}>
                        {ROLE_LABELS[d] ?? d}
                      </span>
                    ))}
                    {(opp.requiredDisciplines?.length ?? 0) > 3 && (
                      <span style={{ fontSize: 9, color: 'var(--muted)' }}>+{(opp.requiredDisciplines?.length ?? 0) - 3}</span>
                    )}
                  </div>
                </td>
                <td style={{ textAlign: 'center' }}>
                  {opp.isHighConfidence ? (
                    <span className="chip chip-approved" style={{ fontSize: 10 }}>High</span>
                  ) : (
                    <span className="chip chip-draft" style={{ fontSize: 10 }}>Active</span>
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {loseConfirmId === (opp.id ?? opp.projectId) ? (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Reason..."
                        value={loseReason}
                        onChange={(e) => setLoseReason(e.target.value)}
                        style={{ fontSize: 10, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', width: 80 }}
                      />
                      <button
                        onClick={() => handleLoseConfirm(opp.id ?? opp.projectId)}
                        style={{ fontSize: 9, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--red)', background: 'rgba(217,87,71,.06)', color: 'var(--red)', cursor: 'pointer' }}
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => { setLoseConfirmId(null); setLoseReason(''); }}
                        style={{ fontSize: 9, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', cursor: 'pointer' }}
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button
                        onClick={() => onWin?.(opp.id ?? opp.projectId)}
                        title="Mark as Won"
                        style={{
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: '1px solid rgba(74,222,128,.18)',
                          background: 'rgba(74,222,128,.06)',
                          color: 'var(--green)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                          fontSize: 10,
                        }}
                      >
                        <Trophy size={11} /> Win
                      </button>
                      <button
                        onClick={() => setLoseConfirmId(opp.id ?? opp.projectId)}
                        title="Mark as Lost"
                        style={{
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: '1px solid rgba(217,87,71,.18)',
                          background: 'rgba(217,87,71,.06)',
                          color: 'var(--red)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                          fontSize: 10,
                        }}
                      >
                        <XCircle size={11} /> Lose
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* High Confidence Panel */}
      {stats.highConfidence > 0 && (
        <section className="panel">
          <h2>High-Confidence Opportunities (≥75%)</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginTop: 10 }}>
            {sorted.filter((o) => o.isHighConfidence).map((opp) => (
              <div
                key={opp.id ?? opp.projectId}
                className="action-card"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(74,222,128,.15)', background: 'rgba(74,222,128,.03)' }}
              >
                <div>
                  <strong style={{ fontSize: 12, color: 'var(--ink)' }}>{opp.title ?? opp.projectId}</strong>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {opp.probability}% · {formatCents(opp.weightedValueCents)} weighted
                  </div>
                </div>
                <DollarSign size={16} style={{ color: 'var(--green)' }} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
