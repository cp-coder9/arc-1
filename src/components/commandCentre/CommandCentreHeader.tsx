'use client';

import React from 'react';
import type { CommandCentreView } from '@/services/commandCentre/types';
import { useProjectContext, type ProjectPhase } from '@/components/commandCentre/ProjectContextProvider';
import { buildBreadcrumb, getViewLabel } from '@/components/commandCentre/breadcrumbUtils';

// ── Types ────────────────────────────────────────────────────────────────────

export type HealthStatus = 'on_track' | 'at_risk' | 'delayed' | 'healthy' | 'over_budget' | 'compliant' | 'non_compliant';

interface HealthIndicators {
  schedule: HealthStatus;
  budget: HealthStatus;
  compliance: HealthStatus;
}

interface CommandCentreHeaderProps {
  activeView: CommandCentreView;
  projectId: string;
  /** Optional health indicators — defaults to 'on_track'/'healthy'/'compliant' */
  healthIndicators?: HealthIndicators;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<ProjectPhase, string> = {
  onboarding: 'Onboarding',
  feasibility: 'Feasibility',
  appointment: 'Appointment',
  concept_design: 'Concept Design',
  design_development: 'Design Development',
  municipal_submission: 'Municipal Submission',
  tender_procurement: 'Tender & Procurement',
  construction_execution: 'Construction',
  closeout: 'Close-out',
};

/**
 * Maps a health status to a color token class for the pill indicator.
 * Green = on_track/healthy/compliant
 * Amber = at_risk
 * Red = delayed/over_budget/non_compliant
 */
function healthToColor(status: HealthStatus): string {
  switch (status) {
    case 'on_track':
    case 'healthy':
    case 'compliant':
      return 'var(--green)';
    case 'at_risk':
      return 'var(--amber)';
    case 'delayed':
    case 'over_budget':
    case 'non_compliant':
      return 'var(--red)';
    default:
      return 'var(--muted)';
  }
}

function healthLabel(status: HealthStatus): string {
  switch (status) {
    case 'on_track': return 'On Track';
    case 'at_risk': return 'At Risk';
    case 'delayed': return 'Delayed';
    case 'healthy': return 'Healthy';
    case 'over_budget': return 'Over Budget';
    case 'compliant': return 'Compliant';
    case 'non_compliant': return 'Non-Compliant';
    default: return 'Unknown';
  }
}

// ── Health Pill Component ────────────────────────────────────────────────────

const HealthPill = React.memo(function HealthPill({
  label,
  status,
}: {
  label: string;
  status: HealthStatus;
}) {
  const color = healthToColor(status);
  const displayLabel = healthLabel(status);

  return (
    <span
      className="pill"
      style={{
        color,
        borderColor: color,
        background: `color-mix(in srgb, ${color} 8%, transparent)`,
        fontSize: '11px',
        padding: '2px 10px',
        borderRadius: '999px',
        border: '1px solid',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        className="dot"
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: color,
          display: 'inline-block',
        }}
      />
      {label}: {displayLabel}
    </span>
  );
});

// ── Breadcrumb Display Component ─────────────────────────────────────────────

const BreadcrumbBar = React.memo(function BreadcrumbBar({
  projectName,
  viewId,
}: {
  projectName: string;
  viewId: CommandCentreView;
}) {
  const breadcrumbString = buildBreadcrumb(projectName, viewId);
  const segments = breadcrumbString.split(' › ');

  return (
    <nav aria-label="Command Centre Breadcrumbs" className="flex items-center gap-1 text-xs">
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        return (
          <span key={index} className="flex items-center gap-1">
            {index > 0 && (
              <span style={{ color: 'var(--muted)' }} aria-hidden="true">›</span>
            )}
            <span
              style={{
                color: isLast ? 'var(--ink)' : 'var(--muted)',
                fontWeight: isLast ? 500 : 400,
              }}
              {...(isLast ? { 'aria-current': 'page' as const } : {})}
            >
              {segment}
            </span>
          </span>
        );
      })}
    </nav>
  );
});

// ── Main Header Component (Memoized) ────────────────────────────────────────

/**
 * CommandCentreHeader — Persistent header displaying:
 * 1. Breadcrumbs in the Top Bar area (Architex › Command Centre › ProjectName › ViewLabel)
 * 2. Active project name and lifecycle stage
 * 3. Health indicators (schedule, budget, compliance) as colored pills
 *
 * Uses React.memo to prevent re-renders during subsystem view transitions.
 * The header remains visually stable — no re-render or visual shift during transitions.
 *
 * Requirements: 6.3, 6.4
 */
const CommandCentreHeader = React.memo(function CommandCentreHeader({
  activeView,
  projectId,
  healthIndicators,
}: CommandCentreHeaderProps) {
  const { context } = useProjectContext();

  // Derive display values from project context
  const projectName = context?.projectName ?? 'Project';
  const lifecyclePhase = context?.lifecyclePhase ?? 'onboarding';
  const phaseLabel = PHASE_LABELS[lifecyclePhase] ?? 'Unknown Phase';

  // Default health indicators if not provided
  const health: HealthIndicators = healthIndicators ?? {
    schedule: 'on_track',
    budget: 'healthy',
    compliance: 'compliant',
  };

  const viewLabel = getViewLabel(activeView);

  return (
    <header
      style={{
        borderBottom: '1px solid var(--border)',
        background: 'rgba(255,255,255,.74)',
        backdropFilter: 'blur(8px)',
        padding: '8px 20px',
        flexShrink: 0,
      }}
    >
      {/* Top row: Breadcrumbs */}
      <BreadcrumbBar projectName={projectName} viewId={activeView} />

      {/* Bottom row: Project name, lifecycle stage, health indicators */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '6px',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        {/* Left side: Project identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1
            style={{
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--ink)',
              margin: 0,
              lineHeight: 1.3,
            }}
          >
            {projectName}
          </h1>
          <span
            className="pill"
            style={{
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'var(--deep)',
              background: 'var(--aqua)',
              border: '1px solid var(--mint)',
              padding: '2px 8px',
              borderRadius: '999px',
            }}
          >
            {phaseLabel}
          </span>
          <span
            style={{
              fontSize: '12px',
              color: 'var(--muted)',
            }}
          >
            › {viewLabel}
          </span>
        </div>

        {/* Right side: Health indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <HealthPill label="Schedule" status={health.schedule} />
          <HealthPill label="Budget" status={health.budget} />
          <HealthPill label="Compliance" status={health.compliance} />
        </div>
      </div>
    </header>
  );
});

export default CommandCentreHeader;

// Re-export for external use
export { buildBreadcrumb, getViewLabel } from '@/components/commandCentre/breadcrumbUtils';
