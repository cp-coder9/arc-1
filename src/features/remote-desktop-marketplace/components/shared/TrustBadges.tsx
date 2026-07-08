import React from 'react';
import { ShieldCheck, Clock, CheckCircle, TrendingUp, Award } from 'lucide-react';
import type { OwnerProfile } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrustBadgesProps {
  profile: Pick<
    OwnerProfile,
    | 'isIdentityVerified'
    | 'isNewOwner'
    | 'avgResponseTimeHours'
    | 'bookingAcceptanceRate'
    | 'sessionCompletionRate'
  >;
  compact?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TrustBadges({ profile, compact = false }: TrustBadgesProps) {
  const {
    isIdentityVerified,
    isNewOwner,
    avgResponseTimeHours,
    bookingAcceptanceRate,
    sessionCompletionRate,
  } = profile;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? 6 : 8, alignItems: 'center' }}>
      {/* Verified Identity Badge */}
      {isIdentityVerified && (
        <span
          className="pill"
          style={{
            color: 'var(--teal)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <ShieldCheck size={14} />
          Verified
        </span>
      )}

      {/* New Owner Badge */}
      {isNewOwner && (
        <span
          className="pill"
          style={{
            color: 'var(--amber)',
            background: 'rgba(245,166,35,.08)',
            borderColor: 'rgba(245,166,35,.18)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Award size={14} />
          New Owner
        </span>
      )}

      {/* Metrics (only shown when not a new owner) */}
      {!isNewOwner && (
        <>
          {avgResponseTimeHours !== null && (
            <span
              className="pill"
              style={{
                color: 'var(--muted)',
                background: 'rgba(16,32,51,.04)',
                borderColor: 'var(--border)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Clock size={14} />
              {compact ? `${avgResponseTimeHours.toFixed(1)}h` : `${avgResponseTimeHours.toFixed(1)}h response`}
            </span>
          )}

          {bookingAcceptanceRate !== null && (
            <span
              className="pill"
              style={{
                color: 'var(--muted)',
                background: 'rgba(16,32,51,.04)',
                borderColor: 'var(--border)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <CheckCircle size={14} />
              {compact ? `${bookingAcceptanceRate}%` : `${bookingAcceptanceRate}% acceptance`}
            </span>
          )}

          {sessionCompletionRate !== null && (
            <span
              className="pill"
              style={{
                color: 'var(--muted)',
                background: 'rgba(16,32,51,.04)',
                borderColor: 'var(--border)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <TrendingUp size={14} />
              {compact ? `${sessionCompletionRate}%` : `${sessionCompletionRate}% completion`}
            </span>
          )}
        </>
      )}
    </div>
  );
}

export default TrustBadges;
