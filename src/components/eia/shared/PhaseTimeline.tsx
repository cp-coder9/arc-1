// PhaseTimeline — Workflow phase visualizer (active/complete/pending/overdue states)
// Requirements: 4.2, 4.6, 5.4–5.5

import React from 'react';
import { CheckCircle2, Clock, Circle, AlertCircle } from 'lucide-react';
import type { PhaseRecord, PhaseStatus } from '@/services/eia/eiaTypes';

export interface PhaseTimelineProps {
  /** Array of phase records to display */
  phases: PhaseRecord[];
  /** The current active phase identifier */
  currentPhase: string;
  /** Render direction. Defaults to horizontal. */
  direction?: 'horizontal' | 'vertical';
}

/** Maps phase status to colour token and icon */
function getPhaseStyle(status: PhaseStatus): {
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
} {
  switch (status) {
    case 'completed':
      return {
        color: 'var(--green)',
        bgColor: 'rgba(74,222,128,.1)',
        borderColor: 'rgba(74,222,128,.18)',
        icon: <CheckCircle2 size={16} style={{ color: 'var(--green)' }} aria-hidden="true" />,
      };
    case 'active':
      return {
        color: 'var(--teal)',
        bgColor: 'rgba(25,183,176,.08)',
        borderColor: 'rgba(25,183,176,.18)',
        icon: <Clock size={16} style={{ color: 'var(--teal)' }} aria-hidden="true" />,
      };
    case 'overdue':
      return {
        color: 'var(--red)',
        bgColor: 'rgba(217,87,71,.06)',
        borderColor: 'rgba(217,87,71,.18)',
        icon: <AlertCircle size={16} style={{ color: 'var(--red)' }} aria-hidden="true" />,
      };
    case 'pending':
    default:
      return {
        color: 'var(--muted)',
        bgColor: 'rgba(16,32,51,.04)',
        borderColor: 'var(--border)',
        icon: <Circle size={16} style={{ color: 'var(--muted)' }} aria-hidden="true" />,
      };
  }
}

/** Formats a phase name for display (snake_case → Title Case) */
function formatPhaseName(phase: string): string {
  return phase
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * PhaseTimeline renders a step-based workflow visualization for EIA phases.
 * Colour-codes: completed (green), active (teal), pending (muted), overdue (red).
 */
export function PhaseTimeline({ phases, currentPhase, direction = 'horizontal' }: PhaseTimelineProps) {
  const isVertical = direction === 'vertical';

  return (
    <div
      role="list"
      aria-label="Phase timeline"
      style={{
        display: 'flex',
        flexDirection: isVertical ? 'column' : 'row',
        gap: isVertical ? 0 : 0,
        overflowX: isVertical ? undefined : 'auto',
        paddingBottom: isVertical ? 0 : 4,
      }}
    >
      {phases.map((phaseRecord, index) => {
        const style = getPhaseStyle(phaseRecord.status);
        const isLast = index === phases.length - 1;
        const isCurrent = phaseRecord.phase === currentPhase;

        return (
          <div
            key={phaseRecord.phase}
            role="listitem"
            aria-current={isCurrent ? 'step' : undefined}
            style={{
              display: 'flex',
              flexDirection: isVertical ? 'row' : 'column',
              alignItems: isVertical ? 'flex-start' : 'center',
              flex: isVertical ? undefined : '1 0 auto',
              minWidth: isVertical ? undefined : 120,
              position: 'relative',
            }}
          >
            {/* Connector + Node */}
            <div
              style={{
                display: 'flex',
                flexDirection: isVertical ? 'column' : 'row',
                alignItems: 'center',
                ...(isVertical ? { marginRight: 12 } : { marginBottom: 8, width: '100%' }),
              }}
            >
              {/* Node circle */}
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: style.bgColor,
                  border: `1.5px solid ${style.borderColor}`,
                  flexShrink: 0,
                  zIndex: 1,
                }}
              >
                {style.icon}
              </div>

              {/* Connector line */}
              {!isLast && (
                <div
                  aria-hidden="true"
                  style={
                    isVertical
                      ? {
                          width: 2,
                          flex: 1,
                          minHeight: 24,
                          background: 'var(--border)',
                          margin: '4px 0',
                          alignSelf: 'center',
                        }
                      : {
                          height: 2,
                          flex: 1,
                          background: 'var(--border)',
                          margin: '0 4px',
                        }
                  }
                />
              )}
            </div>

            {/* Phase label + status */}
            <div
              style={{
                textAlign: isVertical ? 'left' : 'center',
                ...(isVertical ? { paddingBottom: 16 } : {}),
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: isCurrent ? style.color : 'var(--ink)',
                  fontFamily: 'var(--font)',
                  whiteSpace: 'nowrap',
                }}
              >
                {formatPhaseName(phaseRecord.phase)}
              </div>

              {/* Status pill */}
              <span
                className="pill"
                style={{
                  fontSize: 9,
                  marginTop: 4,
                  color: style.color,
                  background: style.bgColor,
                  borderColor: style.borderColor,
                  display: 'inline-flex',
                }}
              >
                {phaseRecord.status}
              </span>

              {/* Deadline display */}
              {phaseRecord.deadline && phaseRecord.status === 'active' && (
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--muted)',
                    marginTop: 4,
                    fontFamily: 'var(--font)',
                  }}
                >
                  Due: {new Date(phaseRecord.deadline).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default PhaseTimeline;
