/**
 * FirmCommandCentreDashboard — Firm-wide portfolio dashboard for practice management.
 *
 * Follows Hero → Stat Row → Modules Grid → Panels content pattern.
 * Displays firm metrics, project portfolio, staff utilisation, and overdue invoices.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 15.5
 * @module FirmCommandCentreDashboard
 */

import { useState, useMemo } from 'react';
import {
  Building2,
  TrendingUp,
  DollarSign,
  Users,
  GitBranch,
  PieChart,
  BarChart2,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';
import type { UserProfile } from '@/types';
import type {
  FirmSummaryMetrics,
  ProjectPortfolioEntry,
  UtilisationMetrics,
  PracticeInvoice,
  DateRange,
} from '@/services/practiceManagement/types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface FirmCommandCentreDashboardProps {
  user: UserProfile;
  firmName?: string;
  activeProjectCount?: number;
  summaryMetrics?: FirmSummaryMetrics | null;
  portfolio?: ProjectPortfolioEntry[];
  utilisation?: UtilisationMetrics | null;
  overdueInvoices?: PracticeInvoice[];
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
    case 'warning': case 'at_risk': return 'var(--amber)';
    case 'over_run': case 'loss_making': return 'var(--red)';
    default: return 'var(--muted)';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'healthy': return 'Healthy';
    case 'warning': return 'Warning';
    case 'at_risk': return 'At Risk';
    case 'over_run': return 'Over-run';
    case 'loss_making': return 'Loss';
    default: return status;
  }
}

function trendIcon(trend: 'up' | 'down' | 'stable') {
  switch (trend) {
    case 'up': return <ArrowUpRight size={12} style={{ color: 'var(--green)' }} />;
    case 'down': return <ArrowDownRight size={12} style={{ color: 'var(--red)' }} />;
    case 'stable': return <Minus size={12} style={{ color: 'var(--muted)' }} />;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FirmCommandCentreDashboard({
  user,
  firmName = 'My Firm',
  activeProjectCount = 0,
  summaryMetrics,
  portfolio = [],
  utilisation,
  overdueInvoices = [],
  dateRange,
  onDateRangeChange,
}: FirmCommandCentreDashboardProps) {
  const [rangeType, setRangeType] = useState<'monthly' | 'quarterly' | 'annually'>(
    dateRange?.type ?? 'monthly',
  );

  const currentMonthRevenue = summaryMetrics?.totalRevenueCents ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 1. Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">FIRM COMMAND CENTRE</div>
            <h1>{firmName}</h1>
            <p className="sub">
              {activeProjectCount} active project{activeProjectCount !== 1 ? 's' : ''} · Revenue {formatCents(currentMonthRevenue)} this month
            </p>
          </div>
        </div>
        <div className="hero-pills">
          <span className="pill">
            <span className="dot"></span> {activeProjectCount} Active
          </span>
          {overdueInvoices.length > 0 && (
            <span className="pill" style={{ color: 'var(--red)', background: 'rgba(217,87,71,.06)', borderColor: 'rgba(217,87,71,.18)' }}>
              <span className="dot" style={{ background: 'var(--red)' }}></span> {overdueInvoices.length} Overdue
            </span>
          )}
        </div>
      </div>

      {/* 2. Stat Row */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--amber)' }}>
            {formatCents(summaryMetrics?.totalWipExposureCents ?? 0)}
          </div>
          <div className="stat-label">Total WIP</div>
        </div>
        <div className="stat-card">
          <div
            className="stat-value"
            style={{
              color: (summaryMetrics?.averageProjectMarginPercent ?? 0) >= 20
                ? 'var(--green)'
                : (summaryMetrics?.averageProjectMarginPercent ?? 0) >= 0
                  ? 'var(--amber)'
                  : 'var(--red)',
            }}
          >
            {(summaryMetrics?.averageProjectMarginPercent ?? 0).toFixed(1)}%
          </div>
          <div className="stat-label">Avg Margin</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--deep)' }}>
            {(summaryMetrics?.firmUtilisationPercent ?? utilisation?.firmAverage ?? 0).toFixed(0)}%
          </div>
          <div className="stat-label">Utilisation Rate</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--teal)' }}>
            {formatCents(summaryMetrics?.pipelineValueCents ?? 0)}
          </div>
          <div className="stat-label">Pipeline Value</div>
        </div>
      </div>

      {/* 3. Modules Grid */}
      <div className="modules">
        <div className="pillar-card">
          <h2>PROFITABILITY</h2>
          <p>Margin performance across active projects</p>
          <div className="tile-list">
            <span className="mini-tile"><span>◈</span> Avg {(summaryMetrics?.averageProjectMarginPercent ?? 0).toFixed(1)}%</span>
            <span className="mini-tile"><span>◈</span> Revenue {formatCents(summaryMetrics?.totalRevenueCents ?? 0)}</span>
          </div>
        </div>
        <div className="pillar-card">
          <h2>WORK IN PROGRESS</h2>
          <p>Unbilled work exposure</p>
          <div className="tile-list">
            <span className="mini-tile"><span>◈</span> WIP {formatCents(summaryMetrics?.totalWipExposureCents ?? 0)}</span>
            <span className="mini-tile"><span>◈</span> Write-offs {(summaryMetrics?.writeOffPercentage ?? 0).toFixed(1)}%</span>
          </div>
        </div>
        <div className="pillar-card">
          <h2>UTILISATION</h2>
          <p>Staff billable capacity usage</p>
          <div className="tile-list">
            <span className="mini-tile"><span>◈</span> Firm {(utilisation?.firmAverage ?? 0).toFixed(0)}%</span>
            <span className="mini-tile"><span>◈</span> Billable {utilisation?.billableHours ?? 0}h</span>
          </div>
        </div>
        <div className="pillar-card">
          <h2>PIPELINE</h2>
          <p>Weighted opportunity value</p>
          <div className="tile-list">
            <span className="mini-tile"><span>◈</span> Value {formatCents(summaryMetrics?.pipelineValueCents ?? 0)}</span>
            <span className="mini-tile"><span>◈</span> {portfolio.length} projects tracked</span>
          </div>
        </div>
      </div>

      {/* 4. Panels — Project Portfolio */}
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h2>Project Portfolio</h2>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['monthly', 'quarterly', 'annually'] as const).map((rt) => (
              <button
                key={rt}
                onClick={() => setRangeType(rt)}
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
              <th>Project</th>
              <th style={{ textAlign: 'right' }}>Fee</th>
              <th style={{ textAlign: 'right' }}>Costs</th>
              <th style={{ textAlign: 'right' }}>WIP</th>
              <th style={{ textAlign: 'right' }}>Margin</th>
              <th style={{ textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>
                  No projects in portfolio.
                </td>
              </tr>
            ) : (
              portfolio.map((p) => (
                <tr key={p.projectId}>
                  <td style={{ fontSize: 12, fontWeight: 500 }}>{p.projectName}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>{formatCents(p.feeCents)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>{formatCents(p.costsCents)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>{formatCents(p.wipCents)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: p.marginPercent >= 20 ? 'var(--green)' : p.marginPercent >= 0 ? 'var(--amber)' : 'var(--red)', fontWeight: 600 }}>
                    {p.marginPercent.toFixed(1)}%
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 10,
                      fontSize: 10,
                      fontWeight: 500,
                      color: statusColor(p.status),
                      background: `color-mix(in srgb, ${statusColor(p.status)} 10%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${statusColor(p.status)} 18%, transparent)`,
                    }}>
                      {statusLabel(p.status)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* Staff Utilisation Panel */}
      {utilisation && utilisation.byPerson.length > 0 && (
        <section className="panel">
          <h2>Staff Utilisation</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Staff Member</th>
                <th style={{ textAlign: 'right' }}>Utilisation</th>
                <th style={{ textAlign: 'center' }}>Trend</th>
              </tr>
            </thead>
            <tbody>
              {utilisation.byPerson.map((person) => (
                <tr key={person.userId}>
                  <td style={{ fontSize: 12 }}>{person.displayName}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: person.utilisation >= 80 ? 'var(--green)' : person.utilisation >= 60 ? 'var(--amber)' : 'var(--red)' }}>
                    {person.utilisation.toFixed(0)}%
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {trendIcon(person.trend)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(16,32,51,.03)', fontSize: 12, color: 'var(--muted)' }}>
            <span>Billable: {utilisation.billableHours}h · Non-billable: {utilisation.nonBillableHours}h</span>
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Total: {utilisation.totalHours}h</span>
          </div>
        </section>
      )}

      {/* Overdue Invoices Panel */}
      {overdueInvoices.length > 0 && (
        <section className="panel">
          <h2>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={14} style={{ color: 'var(--red)' }} />
              Overdue Invoices
            </span>
          </h2>
          <table className="table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Project</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Due Date</th>
                <th style={{ textAlign: 'center' }}>Days Overdue</th>
              </tr>
            </thead>
            <tbody>
              {overdueInvoices.map((inv) => {
                const daysOverdue = Math.max(0, Math.floor(
                  (Date.now() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24),
                ));
                return (
                  <tr key={inv.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                      {inv.invoiceNumber}
                    </td>
                    <td style={{ fontSize: 12 }}>{inv.description || inv.projectId}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11, fontWeight: 600 }}>
                      {formatCents(inv.totalCents)}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{inv.dueDate}</td>
                    <td style={{ textAlign: 'center', color: 'var(--red)', fontWeight: 600, fontSize: 11 }}>
                      {daysOverdue}d
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
