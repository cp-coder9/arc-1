/**
 * WipReport — Firm-wide WIP report table showing per-project WIP positions.
 *
 * Displays: project name, agreed fee, costs incurred, invoiced, collected,
 * WIP balance, and loss indicator for each active project.
 *
 * Renders inside the AppShell 3-column grid using CSS token classes.
 * Follows the Hero → Stat Row → Panels content pattern.
 *
 * Requirements: 5.2, 15.1, 15.2
 * @module practiceManagement/WipReport
 */

import { useMemo } from 'react';
import { TrendingUp, AlertTriangle } from 'lucide-react';
import type { UserProfile } from '@/types';
import type { WipReport as WipReportData, WipPosition } from '@/services/practiceManagement/types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface WipReportProps {
  user: UserProfile;
  wipReport?: WipReportData | null;
  projectNames?: Record<string, string>;
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

// ─── Component ───────────────────────────────────────────────────────────────

export default function WipReport({
  user,
  wipReport,
  projectNames = {},
}: WipReportProps) {
  const projects: WipPosition[] = wipReport?.projects ?? [];

  const summary = useMemo(() => {
    if (!wipReport) {
      return {
        totalFee: 0,
        totalCosts: 0,
        totalInvoiced: 0,
        totalCollected: 0,
        totalWip: 0,
        lossCount: 0,
      };
    }
    return {
      totalFee: wipReport.totalAgreedFeeCents,
      totalCosts: wipReport.totalCostsIncurredCents,
      totalInvoiced: wipReport.totalInvoicedCents,
      totalCollected: wipReport.totalCollectedCents,
      totalWip: wipReport.totalWipBalanceCents,
      lossCount: projects.filter((p) => p.isLoss).length,
    };
  }, [wipReport, projects]);

  // ─── Empty State ─────────────────────────────────────────────────────────

  if (!wipReport || projects.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
          <TrendingUp size={28} style={{ color: 'var(--muted)', marginBottom: 8 }} />
          <h2 style={{ color: 'var(--ink)', fontSize: 15, marginBottom: 6 }}>
            No WIP Data Available
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            WIP positions will appear here once projects have fee structures, approved
            timesheets, and invoiced amounts.
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
            <div className="eyebrow">WORK IN PROGRESS</div>
            <h1>WIP Report</h1>
            <p className="sub">
              {projects.length} active project{projects.length !== 1 ? 's' : ''} ·
              Calculated {wipReport.calculatedAt ? new Date(wipReport.calculatedAt).toLocaleDateString('en-ZA') : 'now'}
            </p>
          </div>
        </div>
        <div className="hero-pills">
          {summary.lossCount > 0 && (
            <span
              className="pill"
              style={{
                color: 'var(--red)',
                background: 'rgba(217,87,71,.08)',
                borderColor: 'rgba(217,87,71,.18)',
              }}
            >
              <span className="dot" style={{ background: 'var(--red)' }}></span>{' '}
              {summary.lossCount} Loss-making
            </span>
          )}
          <span className="pill">
            <span className="dot"></span> {projects.length} Projects
          </span>
        </div>
      </div>

      {/* Stat Row */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--deep)' }}>
            {formatCents(summary.totalFee)}
          </div>
          <div className="stat-label">Total Agreed Fees</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--ink)' }}>
            {formatCents(summary.totalCosts)}
          </div>
          <div className="stat-label">Total Costs</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--teal)' }}>
            {formatCents(summary.totalInvoiced)}
          </div>
          <div className="stat-label">Total Invoiced</div>
        </div>
        <div className="stat-card">
          <div
            className="stat-value"
            style={{ color: summary.totalWip >= 0 ? 'var(--green)' : 'var(--red)' }}
          >
            {formatCents(summary.totalWip)}
          </div>
          <div className="stat-label">Total WIP Balance</div>
        </div>
      </div>

      {/* WIP Table Panel */}
      <section className="panel">
        <h2>WIP Positions by Project</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Project</th>
              <th style={{ textAlign: 'right' }}>Agreed Fee</th>
              <th style={{ textAlign: 'right' }}>Costs</th>
              <th style={{ textAlign: 'right' }}>Invoiced</th>
              <th style={{ textAlign: 'right' }}>Collected</th>
              <th style={{ textAlign: 'right' }}>WIP Balance</th>
              <th style={{ textAlign: 'center' }}>Loss</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.projectId}>
                <td style={{ fontSize: 12, fontWeight: 500 }}>
                  {projectNames[project.projectId] ?? project.projectId}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>
                  {formatCents(project.agreedFeeCents)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>
                  {formatCents(project.costsIncurredCents)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>
                  {formatCents(project.amountInvoicedCents)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>
                  {formatCents(project.amountCollectedCents)}
                </td>
                <td
                  style={{
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    fontSize: 11,
                    fontWeight: 600,
                    color: project.wipBalanceCents >= 0 ? 'var(--green)' : 'var(--red)',
                  }}
                >
                  {formatCents(project.wipBalanceCents)}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {project.isLoss ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        fontSize: 11,
                        color: 'var(--red)',
                      }}
                    >
                      <AlertTriangle size={12} /> Loss
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Totals Summary Row */}
      <section className="panel">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 0',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
            Firm Totals
          </span>
          <div style={{ display: 'flex', gap: 20, fontSize: 12, fontFamily: 'monospace' }}>
            <span>
              <span style={{ color: 'var(--muted)', marginRight: 4 }}>Costs:</span>
              {formatCents(summary.totalCosts)}
            </span>
            <span>
              <span style={{ color: 'var(--muted)', marginRight: 4 }}>Collected:</span>
              {formatCents(summary.totalCollected)}
            </span>
            <span style={{ fontWeight: 600, color: summary.totalWip >= 0 ? 'var(--green)' : 'var(--red)' }}>
              <span style={{ color: 'var(--muted)', marginRight: 4 }}>WIP:</span>
              {formatCents(summary.totalWip)}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
