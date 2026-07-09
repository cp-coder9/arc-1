/**
 * FeeTrackerPanel — Per-project fee health display with SACAP stage breakdown.
 *
 * Shows agreed fee, time costs, disbursements, net position per stage with
 * visual indicators for healthy/warning/over-run status.
 *
 * Renders inside the AppShell 3-column grid using CSS token classes.
 * Follows the Hero → Stat Row → Panels content pattern.
 *
 * Requirements: 4.2, 15.1, 15.2
 * @module practiceManagement/FeeTrackerPanel
 */

import { useState, useMemo } from 'react';
import { Target, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import type { UserProfile } from '@/types';
import type {
  FeeStageBreakdown,
  FeeHealthMetrics,
  ProjectFeeStructure,
  SacapWorkStage,
} from '@/services/practiceManagement/types';
import { SACAP_STAGE_LABELS } from '@/services/practiceManagement/types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface FeeTrackerPanelProps {
  user: UserProfile;
  projectId?: string;
  projectName?: string;
  feeStructure?: ProjectFeeStructure | null;
  stageBreakdown?: FeeStageBreakdown[];
  healthMetrics?: FeeHealthMetrics | null;
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

function stageLabel(stage: SacapWorkStage): string {
  return SACAP_STAGE_LABELS[stage] ?? stage;
}

function statusColor(status: 'healthy' | 'warning' | 'over_run'): string {
  switch (status) {
    case 'healthy':
      return 'var(--green)';
    case 'warning':
      return 'var(--amber)';
    case 'over_run':
      return 'var(--red)';
  }
}

function statusIcon(status: 'healthy' | 'warning' | 'over_run') {
  switch (status) {
    case 'healthy':
      return <CheckCircle size={14} style={{ color: 'var(--green)' }} />;
    case 'warning':
      return <AlertTriangle size={14} style={{ color: 'var(--amber)' }} />;
    case 'over_run':
      return <XCircle size={14} style={{ color: 'var(--red)' }} />;
  }
}

function statusLabel(status: 'healthy' | 'warning' | 'over_run'): string {
  switch (status) {
    case 'healthy':
      return 'Healthy';
    case 'warning':
      return 'Warning';
    case 'over_run':
      return 'Over-run';
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FeeTrackerPanel({
  user,
  projectName = 'Project',
  feeStructure,
  stageBreakdown = [],
  healthMetrics,
}: FeeTrackerPanelProps) {
  const [expandedStage, setExpandedStage] = useState<SacapWorkStage | null>(null);

  // Derive summary stats
  const summary = useMemo(() => {
    if (!healthMetrics) {
      return {
        totalFee: 0,
        totalCosts: 0,
        netPosition: 0,
        overRunCount: 0,
        warningCount: 0,
        healthyCount: stageBreakdown.length,
      };
    }
    return {
      totalFee: healthMetrics.totalFeeCents,
      totalCosts: healthMetrics.totalCostsIncurredCents,
      netPosition: healthMetrics.netPositionCents,
      overRunCount: healthMetrics.overRunStages.length,
      warningCount: healthMetrics.warningStages.length,
      healthyCount:
        stageBreakdown.length -
        healthMetrics.overRunStages.length -
        healthMetrics.warningStages.length,
    };
  }, [healthMetrics, stageBreakdown]);

  const overallStatus: 'healthy' | 'warning' | 'over_run' = useMemo(() => {
    if (summary.overRunCount > 0) return 'over_run';
    if (summary.warningCount > 0) return 'warning';
    return 'healthy';
  }, [summary]);

  const feeBasisLabel = feeStructure
    ? feeStructure.feeBasis.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : '—';

  // ─── Empty State ─────────────────────────────────────────────────────────

  if (!feeStructure && stageBreakdown.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
          <Target size={28} style={{ color: 'var(--muted)', marginBottom: 8 }} />
          <h2 style={{ color: 'var(--ink)', fontSize: 15, marginBottom: 6 }}>
            No Fee Structure Defined
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Define a professional fee structure for this project to track fee health by
            SACAP work stage.
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
            <div className="eyebrow">FEE TRACKER</div>
            <h1>{projectName}</h1>
            <p className="sub">
              {feeBasisLabel} · {stageBreakdown.length} stage
              {stageBreakdown.length !== 1 ? 's' : ''} tracked
            </p>
          </div>
        </div>
        <div className="hero-pills">
          <span
            className="pill"
            style={{
              color: statusColor(overallStatus),
              background: `color-mix(in srgb, ${statusColor(overallStatus)} 10%, transparent)`,
              borderColor: `color-mix(in srgb, ${statusColor(overallStatus)} 18%, transparent)`,
            }}
          >
            <span
              className="dot"
              style={{ background: statusColor(overallStatus) }}
            ></span>{' '}
            {statusLabel(overallStatus)}
          </span>
        </div>
      </div>

      {/* Stat Row */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--deep)' }}>
            {formatCents(summary.totalFee)}
          </div>
          <div className="stat-label">Agreed Fee</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--ink)' }}>
            {formatCents(summary.totalCosts)}
          </div>
          <div className="stat-label">Costs Incurred</div>
        </div>
        <div className="stat-card">
          <div
            className="stat-value"
            style={{ color: summary.netPosition >= 0 ? 'var(--green)' : 'var(--red)' }}
          >
            {formatCents(summary.netPosition)}
          </div>
          <div className="stat-label">Net Position</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            <span style={{ color: 'var(--green)', marginRight: 4 }}>
              {summary.healthyCount}
            </span>
            <span style={{ color: 'var(--amber)', marginRight: 4 }}>
              {summary.warningCount}
            </span>
            <span style={{ color: 'var(--red)' }}>{summary.overRunCount}</span>
          </div>
          <div className="stat-label">Stages (H / W / O)</div>
        </div>
      </div>

      {/* Stage Breakdown Panel */}
      <section className="panel">
        <h2>Stage Breakdown</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Stage</th>
              <th style={{ textAlign: 'right' }}>Agreed Fee</th>
              <th style={{ textAlign: 'right' }}>Time Costs</th>
              <th style={{ textAlign: 'right' }}>Disbursements</th>
              <th style={{ textAlign: 'right' }}>Net Position</th>
              <th style={{ textAlign: 'right' }}>% Used</th>
              <th style={{ textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {stageBreakdown.map((stage) => (
              <tr
                key={stage.stage}
                onClick={() =>
                  setExpandedStage(
                    expandedStage === stage.stage ? null : stage.stage,
                  )
                }
                style={{ cursor: 'pointer' }}
              >
                <td style={{ fontSize: 12 }}>{stageLabel(stage.stage)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>
                  {formatCents(stage.agreedFeeCents)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>
                  {formatCents(stage.timeCostsCents)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>
                  {formatCents(stage.disbursementsCents)}
                </td>
                <td
                  style={{
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    fontSize: 11,
                    color: stage.netPositionCents >= 0 ? 'var(--green)' : 'var(--red)',
                    fontWeight: 600,
                  }}
                >
                  {formatCents(stage.netPositionCents)}
                </td>
                <td
                  style={{
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    fontSize: 11,
                    color: statusColor(stage.status),
                  }}
                >
                  {stage.percentUsed.toFixed(1)}%
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      color: statusColor(stage.status),
                    }}
                  >
                    {statusIcon(stage.status)}
                    {statusLabel(stage.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Expanded Stage Detail */}
      {expandedStage && (
        <section className="panel">
          <h2>{stageLabel(expandedStage)} — Detail</h2>
          {(() => {
            const stage = stageBreakdown.find((s) => s.stage === expandedStage);
            if (!stage) return null;
            const totalCosts = stage.timeCostsCents + stage.disbursementsCents;
            const barWidth = Math.min(stage.percentUsed, 120);

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Progress bar */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 11,
                      color: 'var(--muted)',
                      marginBottom: 4,
                    }}
                  >
                    <span>Fee consumed</span>
                    <span style={{ color: statusColor(stage.status), fontWeight: 600 }}>
                      {stage.percentUsed.toFixed(1)}%
                    </span>
                  </div>
                  <div
                    style={{
                      height: 8,
                      borderRadius: 4,
                      background: 'var(--border)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(barWidth, 100)}%`,
                        borderRadius: 4,
                        background: statusColor(stage.status),
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>

                {/* Cost breakdown */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: 10,
                  }}
                >
                  <div className="stat-card">
                    <div className="stat-value" style={{ fontSize: 16, color: 'var(--deep)' }}>
                      {formatCents(stage.agreedFeeCents)}
                    </div>
                    <div className="stat-label">Agreed Fee</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value" style={{ fontSize: 16, color: 'var(--ink)' }}>
                      {formatCents(stage.timeCostsCents)}
                    </div>
                    <div className="stat-label">Time Costs</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value" style={{ fontSize: 16, color: 'var(--ink)' }}>
                      {formatCents(stage.disbursementsCents)}
                    </div>
                    <div className="stat-label">Disbursements</div>
                  </div>
                  <div className="stat-card">
                    <div
                      className="stat-value"
                      style={{
                        fontSize: 16,
                        color: stage.netPositionCents >= 0 ? 'var(--green)' : 'var(--red)',
                      }}
                    >
                      {formatCents(stage.netPositionCents)}
                    </div>
                    <div className="stat-label">Net Position</div>
                  </div>
                </div>

                {/* Total costs summary line */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(16,32,51,0.03)',
                    fontSize: 12,
                    color: 'var(--muted)',
                  }}
                >
                  <span>Total costs (time + disbursements)</span>
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                    {formatCents(totalCosts)}
                  </span>
                </div>
              </div>
            );
          })()}
        </section>
      )}
    </div>
  );
}
