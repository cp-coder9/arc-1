/**
 * Project Command Centre — StaleBadge Component
 *
 * Displays a visual indicator when a referenced document/drawing/specification
 * has been superseded by a newer revision.
 *
 * Badge shows:
 * - Referenced revision code
 * - Current latest revision
 * - Supersession date (ISO-8601)
 * - Link to latest version
 *
 * @module commandCentre/StaleBadge
 * @validates Requirements 18.1, 18.2, 18.3, 18.4
 */

import type { StaleSourceWarning } from '@/services/commandCentre/staleWarningService';

// ── Types ────────────────────────────────────────────────────────────────────

interface StaleBadgeProps {
  /** The stale warning data to display. */
  warning: StaleSourceWarning;
  /** Callback when the user acknowledges the warning. */
  onAcknowledge?: () => void;
  /** Whether to render in compact mode (e.g., inline in a table row). */
  compact?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function StaleBadge({ warning, onAcknowledge, compact = false }: StaleBadgeProps) {
  if (warning.acknowledged) return null;

  const supersededDate = new Date(warning.supersededAt).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  if (compact) {
    return (
      <span
        className="pill"
        style={{
          color: 'var(--amber)',
          background: 'rgba(245,166,35,.08)',
          borderColor: 'rgba(245,166,35,.18)',
          fontSize: 10,
          cursor: 'pointer',
        }}
        title={`Superseded on ${supersededDate}. Referenced: Rev ${warning.referencedRevision}, Latest: Rev ${warning.currentRevision}`}
        onClick={onAcknowledge}
      >
        <span className="dot" style={{ background: 'var(--amber)' }}></span>
        Stale (Rev {warning.referencedRevision} → {warning.currentRevision})
      </span>
    );
  }

  return (
    <div
      className="panel"
      style={{
        borderColor: 'rgba(245,166,35,.3)',
        background: 'rgba(245,166,35,.03)',
        padding: 12,
        borderRadius: 12,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            className="dot"
            style={{ background: 'var(--amber)', width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }}
          ></span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--amber)' }}>
            Stale Source Warning
          </span>
        </div>

        {/* Details */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
          <div>
            <span style={{ fontWeight: 500 }}>Referenced:</span> Rev {warning.referencedRevision}
          </div>
          <div>
            <span style={{ fontWeight: 500 }}>Latest:</span> Rev {warning.currentRevision}
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <span style={{ fontWeight: 500 }}>Superseded:</span> {supersededDate}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <a
            href={warning.latestDocumentLink}
            className="btn"
            style={{ fontSize: 10, padding: '4px 10px', height: 'auto', textDecoration: 'none' }}
          >
            View Latest
          </a>
          {onAcknowledge && (
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: 10, padding: '4px 10px', height: 'auto', border: '1px solid var(--border)', borderRadius: 8, background: 'rgba(255,255,255,.7)', cursor: 'pointer' }}
              onClick={onAcknowledge}
            >
              Acknowledge
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
