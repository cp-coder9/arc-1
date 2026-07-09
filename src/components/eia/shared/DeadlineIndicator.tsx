// DeadlineIndicator — Time remaining / overdue display with colour tokens
// Requirements: 4.2, 4.6, 5.4–5.5

import React from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

export interface DeadlineIndicatorProps {
  /** ISO 8601 deadline date string */
  deadline: string;
  /** Optional statutory days for this phase (to show elapsed percentage) */
  statutoryDays?: number;
  /** Optional start date for elapsed percentage calculation (ISO 8601) */
  startDate?: string;
  /** Current date override for testing. Defaults to new Date(). */
  now?: Date;
}

/**
 * Calculates the number of days between two dates (positive = future, negative = past).
 */
function daysUntil(deadline: string, now: Date): number {
  const deadlineDate = new Date(deadline);
  const diffMs = deadlineDate.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Calculates elapsed percentage based on start date and statutory days.
 */
function calculateElapsedPercentage(startDate: string, statutoryDays: number, now: Date): number {
  const start = new Date(startDate);
  const elapsedMs = now.getTime() - start.getTime();
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
  const percentage = (elapsedDays / statutoryDays) * 100;
  return Math.min(Math.max(percentage, 0), 100);
}

/**
 * Returns colour token based on days remaining:
 * - Green for >14 days remaining
 * - Amber for ≤14 days remaining
 * - Red for overdue
 */
function getStatusColor(daysRemaining: number): string {
  if (daysRemaining < 0) return 'var(--red)';
  if (daysRemaining <= 14) return 'var(--amber)';
  return 'var(--green)';
}

function getStatusBackground(daysRemaining: number): string {
  if (daysRemaining < 0) return 'rgba(217,87,71,.06)';
  if (daysRemaining <= 14) return 'rgba(245,166,35,.06)';
  return 'rgba(74,222,128,.06)';
}

function getStatusBorder(daysRemaining: number): string {
  if (daysRemaining < 0) return 'rgba(217,87,71,.18)';
  if (daysRemaining <= 14) return 'rgba(245,166,35,.18)';
  return 'rgba(74,222,128,.18)';
}

/**
 * DeadlineIndicator shows days remaining or "OVERDUE" with semantic colour coding.
 * Green for >14 days remaining, amber for ≤14 days, red for overdue.
 * Optionally shows percentage elapsed if statutoryDays is provided.
 */
export function DeadlineIndicator({
  deadline,
  statutoryDays,
  startDate,
  now: nowProp,
}: DeadlineIndicatorProps) {
  const now = nowProp ?? new Date();
  const remaining = daysUntil(deadline, now);
  const isOverdue = remaining < 0;
  const color = getStatusColor(remaining);
  const bgColor = getStatusBackground(remaining);
  const borderColor = getStatusBorder(remaining);

  const elapsed =
    statutoryDays && startDate
      ? calculateElapsedPercentage(startDate, statutoryDays, now)
      : undefined;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 12,
        background: bgColor,
        border: `1px solid ${borderColor}`,
        fontFamily: 'var(--font)',
      }}
      role="status"
      aria-label={isOverdue ? 'Deadline overdue' : `${remaining} days remaining`}
    >
      {isOverdue ? (
        <AlertTriangle size={14} style={{ color, flexShrink: 0 }} aria-hidden="true" />
      ) : (
        <Clock size={14} style={{ color, flexShrink: 0 }} aria-hidden="true" />
      )}

      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color,
          letterSpacing: isOverdue ? 0.5 : 0,
        }}
      >
        {isOverdue ? 'OVERDUE' : `${remaining} day${remaining === 1 ? '' : 's'}`}
      </span>

      {!isOverdue && (
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>remaining</span>
      )}

      {isOverdue && (
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          ({Math.abs(remaining)} day{Math.abs(remaining) === 1 ? '' : 's'} past)
        </span>
      )}

      {/* Elapsed percentage bar */}
      {elapsed !== undefined && (
        <div
          style={{
            width: 48,
            height: 4,
            borderRadius: 2,
            background: 'var(--border)',
            overflow: 'hidden',
            marginLeft: 4,
          }}
          role="progressbar"
          aria-valuenow={Math.round(elapsed)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${Math.round(elapsed)}% of statutory time elapsed`}
        >
          <div
            style={{
              width: `${elapsed}%`,
              height: '100%',
              borderRadius: 2,
              background: color,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      )}
    </div>
  );
}

export default DeadlineIndicator;
