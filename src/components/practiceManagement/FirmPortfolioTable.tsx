/**
 * FirmPortfolioTable — Project portfolio table with fee, costs, WIP, margin, and status.
 *
 * Supports date range filtering (monthly, quarterly, annually) for period-specific views.
 * Renders inside the AppShell 3-column grid using CSS token classes.
 *
 * Requirements: 12.2, 12.5
 * @module practiceManagement/FirmPortfolioTable
 */

import { useState, useMemo } from 'react';
import { Table2, Filter, TrendingUp, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import type { UserProfile } from '@/types';
import type { ProjectPortfolioEntry, DateRange } from '@/services/practiceManagement/types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface FirmPortfolioTableProps {
  user: UserProfile;
  portfolio?: ProjectPortfolioEntry[];
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange) => void;
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

function statusColor(status: string): string {
  switch (status) {
    case 'healthy': return 'var(--green)';
    case 'warning': return 'var(--amber)';
    case 'over_run': return 'var(--red)';
    case 'loss_making': return 'var(--red)';
    default: return 'var(--muted)';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'healthy': return 'Healthy';
    case 'warning': return 'Warning';
    case 'over_run': return 'Over-run';
    case 'loss_making': return 'Loss';
    default: return status;
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'healthy': return <CheckCircle size={12} style={{ color: 'var(--green)' }} />;
    case 'warning': return <AlertTriangle size={12} style={{ color: 'var(--amber)' }} />;
    case 'over_run': case 'loss_making': return <XCircle size={12} style={{ color: 'var(--red)' }} />;
    default: return null;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FirmPortfolioTable({
  user,
  portfolio = [],
  dateRange,
  onDateRangeChange,
}: FirmPortfolioTableProps) {
  const [rangeType, setRangeType] = useState<'monthly' | 'quarterly' | 'annually'>(
    dateRange?.type ?? 'monthly',
  );
  const [sortField, setSortField] = useState<'name' | 'fee' | 'margin' | 'wip'>('name');
  const [sortAsc, setSortAsc] = useState(true);

  // Compute summary
  const summary = useMemo(() => {
    const totalFee = portfolio.reduce((s, p) => s + p.feeCents, 0);
    const totalCosts = portfolio.reduce((s, p) => s + p.costsCents, 0);
    const totalWip = portfolio.reduce((s, p) => s + p.wipCents, 0);
    const avgMargin = portfolio.length > 0
      ? portfolio.reduce((s, p) => s + p.marginPercent, 0) / portfolio.length
      : 0;
    const healthyCount = portfolio.filter((p) => p.status === 'healthy').length;
    const atRiskCount = portfolio.filter((p) => p.status === 'warning' || p.status === 'over_run' || p.status === 'loss_making').length;
    return { totalFee, totalCosts, totalWip, avgMargin, healthyCount, atRiskCount };
  }, [portfolio]);

  // Sorted
  const sorted = useMemo(() => {
    const copy = [...portfolio];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = a.projectName.localeCompare(b.projectName); break;
        case 'fee': cmp = a.feeCents - b.feeCents; break;
        case 'margin': cmp = a.marginPercent - b.marginPercent; break;
        case 'wip': cmp = a.wipCents - b.wipCents; break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [portfolio, sortField, sortAsc]);

  function handleSort(field: typeof sortField) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  }

  function handleRangeChange(type: 'monthly' | 'quarterly' | 'annually') {
    setRangeType(type);
    const now = new Date();
    const from = now.toISOString().split('T')[0];
    let to = from;
    if (type === 'monthly') {
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    } else if (type === 'quarterly') {
      to = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString().split('T')[0];
    } else {
      to = new Date(now.getFullYear(), 11, 31).toISOString().split('T')[0];
    }
    onDateRangeChange?.({ type, from, to });
  }

  // ─── Empty State ─────────────────────────────────────────────────────────

  if (portfolio.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
          <Table2 size={28} style={{ color: 'var(--muted)', marginBottom: 8 }} />
          <h2 style={{ color: 'var(--ink)', fontSize: 15, marginBottom: 6 }}>No Portfolio Data</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Project portfolio data will appear once projects with fee structures are active.
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
            <div className="eyebrow">FIRM PORTFOLIO</div>
            <h1>Project Portfolio</h1>
            <p className="sub">{portfolio.length} projects · {rangeType} view</p>
          </div>
        </div>
        <div className="hero-pills">
          <span className="pill" style={{ color: 'var(--green)', background: 'rgba(74,222,128,.1)', borderColor: 'rgba(74,222,128,.18)' }}>
            <span className="dot" style={{ background: 'var(--green)' }}></span> {summary.healthyCount} Healthy
          </span>
          {summary.atRiskCount > 0 && (
            <span className="pill" style={{ color: 'var(--red)', background: 'rgba(217,87,71,.06)', borderColor: 'rgba(217,87,71,.18)' }}>
              <span className="dot" style={{ background: 'var(--red)' }}></span> {summary.atRiskCount} At Risk
            </span>
          )}
        </div>
      </div>

      {/* Stat Row */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--deep)' }}>{formatCents(summary.totalFee)}</div>
          <div className="stat-label">Total Fee</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--ink)' }}>{formatCents(summary.totalCosts)}</div>
          <div className="stat-label">Total Costs</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{formatCents(summary.totalWip)}</div>
          <div className="stat-label">Total WIP</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: summary.avgMargin >= 20 ? 'var(--green)' : summary.avgMargin >= 0 ? 'var(--amber)' : 'var(--red)' }}>
            {summary.avgMargin.toFixed(1)}%
          </div>
          <div className="stat-label">Avg Margin</div>
        </div>
      </div>

      {/* Portfolio Table Panel */}
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Projects</h2>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <Filter size={12} style={{ color: 'var(--muted)' }} />
            {(['monthly', 'quarterly', 'annually'] as const).map((rt) => (
              <button
                key={rt}
                onClick={() => handleRangeChange(rt)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: rangeType === rt ? 'var(--aqua)' : 'rgba(255,255,255,.7)',
                  color: rangeType === rt ? 'var(--deep)' : 'var(--muted)',
                  fontSize: 11,
                  fontWeight: rangeType === rt ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {rt.charAt(0).toUpperCase() + rt.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>
                Project {sortField === 'name' ? (sortAsc ? '↑' : '↓') : ''}
              </th>
              <th onClick={() => handleSort('fee')} style={{ textAlign: 'right', cursor: 'pointer' }}>
                Fee {sortField === 'fee' ? (sortAsc ? '↑' : '↓') : ''}
              </th>
              <th style={{ textAlign: 'right' }}>Costs</th>
              <th onClick={() => handleSort('wip')} style={{ textAlign: 'right', cursor: 'pointer' }}>
                WIP {sortField === 'wip' ? (sortAsc ? '↑' : '↓') : ''}
              </th>
              <th onClick={() => handleSort('margin')} style={{ textAlign: 'right', cursor: 'pointer' }}>
                Margin {sortField === 'margin' ? (sortAsc ? '↑' : '↓') : ''}
              </th>
              <th style={{ textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.projectId}>
                <td style={{ fontSize: 12, fontWeight: 500 }}>{p.projectName}</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>
                  {formatCents(p.feeCents)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>
                  {formatCents(p.costsCents)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>
                  {formatCents(p.wipCents)}
                </td>
                <td style={{
                  textAlign: 'right',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  fontWeight: 600,
                  color: p.marginPercent >= 20 ? 'var(--green)' : p.marginPercent >= 0 ? 'var(--amber)' : 'var(--red)',
                }}>
                  {p.marginPercent.toFixed(1)}%
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 10,
                    fontSize: 10,
                    fontWeight: 500,
                    color: statusColor(p.status),
                    background: `color-mix(in srgb, ${statusColor(p.status)} 10%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${statusColor(p.status)} 18%, transparent)`,
                  }}>
                    {statusIcon(p.status)} {statusLabel(p.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Summary footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 12,
          padding: '10px 14px',
          borderRadius: 8,
          background: 'rgba(16,32,51,.03)',
          fontSize: 12,
          color: 'var(--muted)',
        }}>
          <span>{portfolio.length} project{portfolio.length !== 1 ? 's' : ''}</span>
          <span>
            Fee: {formatCents(summary.totalFee)} · Costs: {formatCents(summary.totalCosts)} · WIP: {formatCents(summary.totalWip)}
          </span>
        </div>
      </section>
    </div>
  );
}
