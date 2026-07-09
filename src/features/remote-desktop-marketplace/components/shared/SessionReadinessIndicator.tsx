import React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SessionReadiness = 'ready' | 'stale' | 'unreachable';

export interface SessionReadinessIndicatorProps {
  lastHeartbeatAt: string | null;
  /** Override the current time for testing purposes */
  now?: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Determines the session readiness based on heartbeat timing:
 * - Ready: heartbeat within 60 seconds
 * - Stale: heartbeat between 61 seconds and 5 minutes
 * - Unreachable: heartbeat older than 5 minutes or null
 */
export function getSessionReadiness(
  lastHeartbeatAt: string | null,
  now: Date = new Date()
): SessionReadiness {
  if (!lastHeartbeatAt) return 'unreachable';

  const heartbeatTime = new Date(lastHeartbeatAt).getTime();
  const elapsed = now.getTime() - heartbeatTime;
  const seconds = elapsed / 1000;

  if (seconds <= 60) return 'ready';
  if (seconds <= 300) return 'stale';
  return 'unreachable';
}

// ─── Status Config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  SessionReadiness,
  { label: string; dotColor: string; textColor: string; bgColor: string; borderColor: string }
> = {
  ready: {
    label: 'Ready',
    dotColor: 'var(--green)',
    textColor: 'var(--green)',
    bgColor: 'rgba(74,222,128,.1)',
    borderColor: 'rgba(74,222,128,.18)',
  },
  stale: {
    label: 'Stale',
    dotColor: 'var(--amber)',
    textColor: 'var(--amber)',
    bgColor: 'rgba(245,166,35,.08)',
    borderColor: 'rgba(245,166,35,.18)',
  },
  unreachable: {
    label: 'Unreachable',
    dotColor: 'var(--red)',
    textColor: 'var(--red)',
    bgColor: 'rgba(217,87,71,.06)',
    borderColor: 'rgba(217,87,71,.18)',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function SessionReadinessIndicator({
  lastHeartbeatAt,
  now,
}: SessionReadinessIndicatorProps) {
  const status = getSessionReadiness(lastHeartbeatAt, now);
  const config = STATUS_CONFIG[status];

  return (
    <span
      className="pill"
      style={{
        color: config.textColor,
        background: config.bgColor,
        borderColor: config.borderColor,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
      aria-label={`Session status: ${config.label}`}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: config.dotColor,
          flexShrink: 0,
        }}
      />
      {config.label}
    </span>
  );
}

export default SessionReadinessIndicator;
