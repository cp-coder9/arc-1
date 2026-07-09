/**
 * ProfitabilityPanel — Per-project profitability view with stage drill-down.
 *
 * Shows fee earned, time cost, disbursements, write-offs, net profit, margin %
 * with status pills (profitable, at-risk, loss-making) and per-stage breakdown.
 *
 * Renders inside the AppShell 3-column grid using CSS token classes.
 * Follows the Hero → Stat Row → Panels content pattern.
 *
 * Requirements: 6.2, 6.5, 15.1, 15.2
 * @module practiceManagement/ProfitabilityPanel
 */

import React, { useState, useMemo } from 'react';
import { PieChart, ChevronDown, ChevronRight } from 'lucide-react';
import type { UserProfile } from '@/types';
import type {
  ProfitabilityResult,
  SacapWorkStage,
} from '@/services/practiceManagement/types';
import { SACAP_STAGE_LABELS } from '@/services/practiceManagement/types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface ProfitabilityPanelProps {
  user: UserProfile;
  projectId?: string;
  projectName?: string;
  projectProfitability?: ProfitabilityResult | null;
  stageProfitability?: ProfitabilityResult[];
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

function statusColor(status: 'profitable' | 'at_risk' | 'loss_making'): string {
  switch (status) {
    case 'profitable':
      return 'var(--green)';
    case 'at_risk':
      return 'var(--amber)';
    case 'loss_making':
      return 'var(--red)';
  }
}

function statusLabel(status: 'profitable' | 'at_risk' | 'loss_making'): string {
  switch (status) {
    case 'profitable':
      return 'Profitable';
    case 'at_risk':
      return 'At Risk';
    case 'loss_making':
      return 'Loss Making';
  }
}

function statusPillStyle(status: 'profitable' | 'at_risk' | 'loss_making'): React.CSSProperties {
  const color = statusColor(status);
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    fontWeight: 500,
    padding: '3px 10px',
    borderRadius: 999,
    color,
    background: `color-mix(in srgb, ${color} 10%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} 18%, transparent)`,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProfitabilityPanel({
  user,
  projectName = 'Project',
  projectProfitability,
  stageProfitability = [],
}: ProfitabilityPanelProps) {
  const [expandedStage, setExpandedStage] = useState<SacapWorkStage | null>(null);

  const summary = useMemo(() => {
    if (!projectProfitability) {
      return {
        feeEarned: 0,
        timeCost: 0,
        disbursements: 0,
        writeOffs: 0,
        netProfit: 0,
        margin: 0,
        status: 'profitable' as const,
      };
    }
    return {
      feeEarned: projectProfitability.feeEarnedCents,
      timeCost: projectProfitability.timeCostCents,
      disbursements: projectProfitability.disbursementsCents,
      writeOffs: projectProfitability.writeOffsCents,
      netProfit: projectProfitability.netProfitCents,
      margin: projectProfitability.marginPercent,
      status: projectProfitability.status,
    };
  }, [projectProfitability]);

  // ─── Empty State ─────────────────────────────────────────────────────────

  if (!projectProfitability) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
          <PieChart size={28} style={{ color: 'var(--muted)', marginBottom: 8 }} />
          <h2 style={{ color: 'var(--ink)', fontSize: 15, marginBottom: 6 }}>
            No Profitability Data
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Profitability analysis will appear once fee structures, timesheets, and
            expenses are recorded for this project.
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
            <div className="eyebrow">PROFITABILITY</div>
            <h1>{projectName}</h1>
            <p className="sub">
              Margin analysis · {stageProfitability.length} stage
              {stageProfitability.length !== 1 ? 's' : ''} tracked
            </p>
          </div>
        </div>
        <div className="hero-pills">
          <span style={statusPillStyle(summary.status)}>
            <span
              className="dot"
              style={{ background: statusColor(summary.status) }}
            ></span>
            {statusLabel(summary.status)}
          </span>
        </div>
      </div>

      {/* Stat Row */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--deep)' }}>
            {formatCents(summary.feeEarned)}
          </div>
          <div className="stat-label">Fee Earned</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--ink)' }}>
            {formatCents(summary.timeCost + summary.disbursements + summary.writeOffs)}
          </div>
          <div className="stat-label">Total Costs</div>
        </div>
        <div className="stat-card">
          <div
            className="stat-value"
            style={{ color: summary.netProfit >= 0 ? 'var(--green)' : 'var(--red)' }}
          >
            {formatCents(summary.netProfit)}
          </div>
          <div className="stat-label">Net Profit</div>
        </div>
        <div className="stat-card">
          <div
            className="stat-value"
            style={{ color: statusColor(summary.status) }}
          >
            {summary.margin.toFixed(1)}%
          </div>
          <div className="stat-label">Margin</div>
        </div>
      </div>

      {/* Cost Breakdown Panel */}
      <section className="panel">
        <h2>Cost Breakdown</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
          }}
        >
          <div className="stat-card">
            <div className="stat-value" style={{ fontSize: 16, color: 'var(--ink)' }}>
              {formatCents(summary.timeCost)}
            </div>
            <div className="stat-label">Time Costs</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ fontSize: 16, color: 'var(--ink)' }}>
              {formatCents(summary.disbursements)}
            </div>
            <div className="stat-label">Disbursements</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ fontSize: 16, color: 'var(--amber)' }}>
              {formatCents(summary.writeOffs)}
            </div>
            <div className="stat-label">Write-Offs</div>
          </div>
        </div>
      </section>

      {/* Stage Profitability Table */}
      {stageProfitability.length > 0 && (
        <section className="panel">
          <h2>Per-Stage Profitability</h2>
          <table className="table">
            <thead>
              <tr>
                <th></th>
                <th>Stage</th>
                <th style={{ textAlign: 'right' }}>Fee Earned</th>
                <th style={{ textAlign: 'right' }}>Time Cost</th>
                <th style={{ textAlign: 'right' }}>Disbursements</th>
                <th style={{ textAlign: 'right' }}>Write-Offs</th>
                <th style={{ textAlign: 'right' }}>Net Profit</th>
                <th style={{ textAlign: 'right' }}>Margin</th>
                <th style={{ textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {stageProfitability.map((stage) => {
                const isExpanded = expandedStage === stage.stage;
                return (
                  <tr
                    key={stage.stage ?? stage.projectId}
                    onClick={() =>
                      setExpandedStage(
                        isExpanded ? null : (stage.stage ?? null),
                      )
                    }
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ width: 24 }}>
                      {isExpanded ? (
                        <ChevronDown size={14} style={{ color: 'var(--muted)' }} />
                      ) : (
                        <ChevronRight size={14} style={{ color: 'var(--muted)' }} />
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {stage.stage ? stageLabel(stage.stage) : 'Overall'}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>
                      {formatCents(stage.feeEarnedCents)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>
                      {formatCents(stage.timeCostCents)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>
                      {formatCents(stage.disbursementsCents)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>
                      {formatCents(stage.writeOffsCents)}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontFamily: 'monospace',
                        fontSize: 11,
                        fontWeight: 600,
                        color: stage.netProfitCents >= 0 ? 'var(--green)' : 'var(--red)',
                      }}
                    >
                      {formatCents(stage.netProfitCents)}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontFamily: 'monospace',
                        fontSize: 11,
                        color: statusColor(stage.status),
                        fontWeight: 600,
                      }}
                    >
                      {stage.marginPercent.toFixed(1)}%
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={statusPillStyle(stage.status)}>
                        {statusLabel(stage.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Expanded Stage Detail */}
      {expandedStage && (() => {
        const stage = stageProfitability.find((s) => s.stage === expandedStage);
        if (!stage) return null;
        const totalCosts = stage.timeCostCents + stage.disbursementsCents + stage.writeOffsCents;
        const costPercent = stage.feeEarnedCents > 0
          ? (totalCosts / stage.feeEarnedCents) * 100
          : 0;

        return (
          <section className="panel">
            <h2>{stageLabel(expandedStage)} — Detail</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Margin bar */}
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
                  <span>Cost to fee ratio</span>
                  <span style={{ color: statusColor(stage.status), fontWeight: 600 }}>
                    {costPercent.toFixed(1)}% of fee consumed
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
                      width: `${Math.min(costPercent, 100)}%`,
                      borderRadius: 4,
                      background: statusColor(stage.status),
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>

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
                <span>Net margin for this stage</span>
                <span
                  style={{
                    fontWeight: 600,
                    color: statusColor(stage.status),
                  }}
                >
                  {stage.marginPercent.toFixed(1)}%
                </span>
              </div>
            </div>
          </section>
        );
      })()}
    </div>
  );
}
