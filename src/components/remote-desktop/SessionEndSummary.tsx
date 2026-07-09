/**
 * SessionEndSummary — Post-session usage summary
 *
 * Shows a usage summary after session end: booked window duration, actual
 * connected duration, applications used, files produced, and disconnection
 * reason. Displayed within 5 seconds of session end. Accessible from the
 * Action Centre until the usage log is finalised.
 *
 * Requirements: 12.3
 *
 * NOTE: This is a placeholder implementation. Full UI will be built in task 21.8.
 */

import { Clock, Monitor, FileText, Info } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface SessionEndSummaryProps {
  /** Session ID */
  sessionId: string;
  /** Booking ID */
  bookingId: string;
  /** Total booked duration in seconds */
  bookedDurationSeconds: number;
  /** Actual connected time in seconds */
  actualConnectedSeconds: number;
  /** List of application names used during the session */
  applicationsUsed: string[];
  /** Number of files produced */
  filesProduced: number;
  /** Reason for session disconnection */
  disconnectionReason: string;
  /** Callback to return to bookings */
  onReturnToBookings: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins}m ${secs}s`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

function formatReason(reason: string): string {
  switch (reason) {
    case 'user_disconnected':
      return 'You disconnected the session';
    case 'booking_window_expired':
      return 'Booking period ended';
    case 'reconnection_failed':
      return 'Connection could not be re-established';
    case 'consent_declined':
      return 'Recording consent declined';
    case 'owner_revoked':
      return 'Session terminated by resource owner';
    default:
      return reason.replace(/_/g, ' ');
  }
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function SessionEndSummary({
  sessionId,
  bookingId,
  bookedDurationSeconds,
  actualConnectedSeconds,
  applicationsUsed,
  filesProduced,
  disconnectionReason,
  onReturnToBookings,
}: SessionEndSummaryProps) {
  return (
    <div className="panel">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Info size={16} style={{ color: 'var(--teal)' }} />
        Session Summary
      </h2>

      {/* Stat Row */}
      <div className="stat-row" style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
        <div className="stat-card" style={{ flex: 1 }}>
          <div className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={16} style={{ color: 'var(--teal)' }} />
            {formatDuration(actualConnectedSeconds)}
          </div>
          <div className="stat-label">Connected Time</div>
        </div>
        <div className="stat-card" style={{ flex: 1 }}>
          <div className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={16} style={{ color: 'var(--muted)' }} />
            {formatDuration(bookedDurationSeconds)}
          </div>
          <div className="stat-label">Booked Window</div>
        </div>
        <div className="stat-card" style={{ flex: 1 }}>
          <div className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Monitor size={16} style={{ color: 'var(--teal)' }} />
            {applicationsUsed.length}
          </div>
          <div className="stat-label">Apps Used</div>
        </div>
        <div className="stat-card" style={{ flex: 1 }}>
          <div className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileText size={16} style={{ color: 'var(--teal)' }} />
            {filesProduced}
          </div>
          <div className="stat-label">Files Produced</div>
        </div>
      </div>

      {/* Details */}
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
        <strong style={{ color: 'var(--ink)' }}>Reason:</strong> {formatReason(disconnectionReason)}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 20 }}>
        Session: <span style={{ fontFamily: 'monospace' }}>{sessionId}</span> · Booking: <span style={{ fontFamily: 'monospace' }}>{bookingId}</span>
      </div>

      {/* Applications Used */}
      {applicationsUsed.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
            Applications Used
          </h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {applicationsUsed.map((app) => (
              <span key={app} className="pill" style={{ fontSize: 11 }}>
                {app}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn" type="button" onClick={onReturnToBookings}>
          Return to Bookings
        </button>
      </div>
    </div>
  );
}

export default SessionEndSummary;
