/**
 * IncomeForecastChart — Rolling 12-month income forecast visualisation.
 *
 * Displays a stacked bar chart by confidence level (confirmed, probable, pipeline)
 * with monthly breakdown and project-level detail on expansion.
 *
 * Requirements: 11.1, 11.2, 11.4, 15.5
 * @module practiceManagement/IncomeForecastChart
 */

import { useState, useMemo } from 'react';
import { BarChart2, TrendingUp, ChevronDown, ChevronRight } from 'lucide-react';
import type { UserProfile } from '@/types';
import type { MonthlyForecastEntry, IncomeForecast, ForecastConfidence } from '@/services/practiceManagement/types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface IncomeForecastChartProps {
  user: UserProfile;
  forecast?: IncomeForecast | null;
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

function shortMonth(month: string): string {
  const [year, m] = month.split('-');
  const date = new Date(Number(year), Number(m) - 1, 1);
  return date.toLocaleDateString('en-ZA', { month: 'short' });
}

function confidenceColor(confidence: ForecastConfidence): string {
  switch (confidence) {
    case 'confirmed': return 'var(--green)';
    case 'probable': return 'var(--amber)';
    case 'pipeline': return 'var(--teal)';
  }
}

function confidenceBg(confidence: ForecastConfidence): string {
  switch (confidence) {
    case 'confirmed': return 'rgba(74,222,128,.2)';
    case 'probable': return 'rgba(245,166,35,.15)';
    case 'pipeline': return 'rgba(25,183,176,.15)';
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function IncomeForecastChart({
  user,
  forecast,
}: IncomeForecastChartProps) {
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const months = forecast?.months ?? [];

  const totals = useMemo(() => ({
    confirmed: forecast?.totalConfirmedCents ?? 0,
    probable: forecast?.totalProbableCents ?? 0,
    pipeline: forecast?.totalPipelineCents ?? 0,
    total: (forecast?.totalConfirmedCents ?? 0) + (forecast?.totalProbableCents ?? 0) + (forecast?.totalPipelineCents ?? 0),
  }), [forecast]);

  const maxMonthly = useMemo(
    () => Math.max(...months.map((m) => m.totalCents), 1),
    [months],
  );

  // ─── Empty State ─────────────────────────────────────────────────────────

  if (!forecast || months.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
          <BarChart2 size={28} style={{ color: 'var(--muted)', marginBottom: 8 }} />
          <h2 style={{ color: 'var(--ink)', fontSize: 15, marginBottom: 6 }}>No Forecast Data</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Income forecast data will appear once projects and pipeline entries are configured.
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
            <div className="eyebrow">INCOME FORECAST</div>
            <h1>Rolling 12-Month Forecast</h1>
            <p className="sub">
              {months.length} months · Generated {forecast.generatedAt ? new Date(forecast.generatedAt).toLocaleDateString('en-ZA') : 'recently'}
            </p>
          </div>
        </div>
        <div className="hero-pills">
          <span className="pill">
            <span className="dot"></span> {formatCents(totals.total)} total
          </span>
        </div>
      </div>

      {/* Stat Row */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--green)' }}>{formatCents(totals.confirmed)}</div>
          <div className="stat-label">Confirmed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{formatCents(totals.probable)}</div>
          <div className="stat-label">Probable</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--teal)' }}>{formatCents(totals.pipeline)}</div>
          <div className="stat-label">Pipeline</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--deep)' }}>{formatCents(totals.total)}</div>
          <div className="stat-label">Total Forecast</div>
        </div>
      </div>

      {/* Chart Panel — Stacked Bars */}
      <section className="panel">
        <h2>Monthly Breakdown</h2>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontSize: 11, color: 'var(--muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--green)' }} /> Confirmed
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--amber)' }} /> Probable
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--teal)' }} /> Pipeline
          </span>
        </div>

        {/* Stacked bar chart */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 160, marginBottom: 8 }}>
          {months.map((m) => {
            const confirmedPct = (m.confirmedCents / maxMonthly) * 100;
            const probablePct = (m.probableCents / maxMonthly) * 100;
            const pipelinePct = (m.pipelineCents / maxMonthly) * 100;

            return (
              <div
                key={m.month}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  height: '100%',
                  cursor: 'pointer',
                  borderRadius: '4px 4px 0 0',
                  overflow: 'hidden',
                }}
                onClick={() => setExpandedMonth(expandedMonth === m.month ? null : m.month)}
                title={`${shortMonth(m.month)}: ${formatCents(m.totalCents)}`}
              >
                {/* Pipeline (top) */}
                <div style={{ height: `${pipelinePct}%`, background: 'var(--teal)', minHeight: m.pipelineCents > 0 ? 2 : 0 }} />
                {/* Probable (middle) */}
                <div style={{ height: `${probablePct}%`, background: 'var(--amber)', minHeight: m.probableCents > 0 ? 2 : 0 }} />
                {/* Confirmed (bottom) */}
                <div style={{ height: `${confirmedPct}%`, background: 'var(--green)', minHeight: m.confirmedCents > 0 ? 2 : 0 }} />
              </div>
            );
          })}
        </div>

        {/* Month labels */}
        <div style={{ display: 'flex', gap: 4 }}>
          {months.map((m) => (
            <div key={m.month} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--muted)' }}>
              {shortMonth(m.month)}
            </div>
          ))}
        </div>
      </section>

      {/* Detail Panel — Expandable Month Breakdown */}
      <section className="panel">
        <h2>Monthly Detail</h2>
        <table className="table">
          <thead>
            <tr>
              <th></th>
              <th>Month</th>
              <th style={{ textAlign: 'right' }}>Confirmed</th>
              <th style={{ textAlign: 'right' }}>Probable</th>
              <th style={{ textAlign: 'right' }}>Pipeline</th>
              <th style={{ textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <>
                <tr
                  key={m.month}
                  onClick={() => setExpandedMonth(expandedMonth === m.month ? null : m.month)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ width: 20 }}>
                    {expandedMonth === m.month
                      ? <ChevronDown size={12} style={{ color: 'var(--muted)' }} />
                      : <ChevronRight size={12} style={{ color: 'var(--muted)' }} />}
                  </td>
                  <td style={{ fontSize: 12, fontWeight: 500 }}>{shortMonth(m.month)} {m.month.split('-')[0]}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: 'var(--green)' }}>
                    {formatCents(m.confirmedCents)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: 'var(--amber)' }}>
                    {formatCents(m.probableCents)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: 'var(--teal)' }}>
                    {formatCents(m.pipelineCents)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: 'var(--ink)' }}>
                    {formatCents(m.totalCents)}
                  </td>
                </tr>
                {/* Expanded project detail */}
                {expandedMonth === m.month && m.projects.length > 0 && m.projects.map((p, idx) => (
                  <tr key={`${m.month}-${p.projectId}-${idx}`} style={{ background: 'rgba(16,32,51,.02)' }}>
                    <td></td>
                    <td style={{ fontSize: 11, color: 'var(--muted)', paddingLeft: 16 }}>
                      {p.projectName}
                    </td>
                    <td colSpan={3} style={{ textAlign: 'right', fontSize: 10 }}>
                      <span
                        className="pill"
                        style={{
                          fontSize: 9,
                          padding: '2px 6px',
                          color: confidenceColor(p.confidence),
                          background: confidenceBg(p.confidence),
                          borderColor: confidenceColor(p.confidence),
                        }}
                      >
                        {p.confidence}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: 'var(--ink)' }}>
                      {formatCents(p.amountCents)}
                    </td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
