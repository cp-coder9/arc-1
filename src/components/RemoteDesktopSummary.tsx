/**
 * RemoteDesktopSummary — Post-Session Summary Panel
 *
 * Displayed when a session ends (by any mechanism). Shows: total connected
 * time, applications used, files produced (count and total size),
 * disconnection reason, and file handoff status with a link to the
 * booking detail view.
 *
 * Renders within the Architex OS shell — no custom chrome.
 * Uses platform CSS tokens and class system.
 *
 * Validates: Requirements 10.4, 10.6
 */

import React from 'react';
import { Clock, Monitor, FileText, Info, ArrowRight, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import type { UserProfile } from '@/types';
import type { ManifestApprovalStatus } from '@/services/remoteDesktop/types';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface RemoteDesktopSummaryProps {
  /** Current authenticated user */
  user: UserProfile;
  /** Session ID */
  sessionId: string;
  /** Booking ID */
  bookingId: string;
  /** Total connected time in seconds */
  totalConnectedSeconds: number;
  /** List of application names used during the session */
  applicationsUsed: string[];
  /** Number of files produced */
  filesProducedCount: number;
  /** Total file size in bytes */
  totalFileSizeBytes: number;
  /** Reason for disconnection */
  disconnectionReason: string;
  /** File handoff status */
  fileHandoffStatus: ManifestApprovalStatus | 'none';
  /** Callback: return to bookings / marketplace */
  onReturnToBookings: () => void;
  /** Callback: view booking detail */
  onViewBooking?: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatReason(reason: string): string {
  const reasonMap: Record<string, string> = {
    user_disconnected: 'You ended the session',
    booking_window_expired: 'Booking period ended',
    reconnection_failed: 'Connection could not be re-established',
    consent_declined: 'Recording consent declined',
    owner_revoked: 'Session terminated by resource owner',
    policy_violation_full_desktop: 'Policy violation: full desktop detected',
    session_terminated_security_timeout: 'Security timeout (unreviewed incident)',
    host_went_offline: 'Host went offline',
  };
  return reasonMap[reason] ?? reason.replace(/_/g, ' ');
}

function getHandoffStatusInfo(status: ManifestApprovalStatus | 'none'): {
  label: string;
  color: string;
  Icon: typeof CheckCircle;
} {
  switch (status) {
    case 'approved':
      return { label: 'Files Approved', color: 'var(--green)', Icon: CheckCircle };
    case 'pending':
      return { label: 'Awaiting Owner Approval', color: 'var(--amber)', Icon: AlertTriangle };
    case 'rejected':
      return { label: 'Files Rejected', color: 'var(--red)', Icon: XCircle };
    case 'expired':
      return { label: 'Handoff Expired', color: 'var(--muted)', Icon: XCircle };
    case 'none':
    default:
      return { label: 'No Files to Transfer', color: 'var(--muted)', Icon: Info };
  }
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function RemoteDesktopSummary({
  user,
  sessionId,
  bookingId,
  totalConnectedSeconds,
  applicationsUsed,
  filesProducedCount,
  totalFileSizeBytes,
  disconnectionReason,
  fileHandoffStatus,
  onReturnToBookings,
  onViewBooking,
}: RemoteDesktopSummaryProps) {
  const handoffInfo = getHandoffStatusInfo(fileHandoffStatus);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">REMOTE DESKTOP</div>
            <h1>Session Complete</h1>
            <p className="sub">
              Booking {bookingId} · {user.displayName || user.email}
            </p>
          </div>
        </div>
        <div className="hero-pills">
          <span className="pill">
            <span className="dot" /> Completed
          </span>
        </div>
      </div>

      {/* Stat Row */}
      <div className="stat-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <div className="stat-card">
          <div className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={16} style={{ color: 'var(--teal)' }} />
            {formatDuration(totalConnectedSeconds)}
          </div>
          <div className="stat-label">Connected Time</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Monitor size={16} style={{ color: 'var(--teal)' }} />
            {applicationsUsed.length}
          </div>
          <div className="stat-label">Apps Used</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileText size={16} style={{ color: 'var(--teal)' }} />
            {filesProducedCount}
          </div>
          <div className="stat-label">Files Produced</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: 16 }}>
            {formatBytes(totalFileSizeBytes)}
          </div>
          <div className="stat-label">Total File Size</div>
        </div>
      </div>

      {/* Details Panel */}
      <div className="panel">
        <h2 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--deep)', marginBottom: 14 }}>
          Session Details
        </h2>

        <table className="table" style={{ width: '100%' }}>
          <tbody>
            <tr>
              <td style={labelCellStyle}>Disconnection Reason</td>
              <td style={valueCellStyle}>{formatReason(disconnectionReason)}</td>
            </tr>
            <tr>
              <td style={labelCellStyle}>File Handoff</td>
              <td style={valueCellStyle}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <handoffInfo.Icon size={14} style={{ color: handoffInfo.color }} />
                  <span style={{ color: handoffInfo.color }}>{handoffInfo.label}</span>
                </span>
              </td>
            </tr>
            <tr>
              <td style={labelCellStyle}>Session ID</td>
              <td style={{ ...valueCellStyle, fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                {sessionId}
              </td>
            </tr>
            <tr>
              <td style={labelCellStyle}>Booking ID</td>
              <td style={{ ...valueCellStyle, fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                {bookingId}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Applications Used */}
        {applicationsUsed.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, marginBottom: 8 }}>
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
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn" type="button" onClick={onReturnToBookings}>
          Return to Bookings
        </button>
        {onViewBooking && (
          <button
            className="btn"
            type="button"
            onClick={onViewBooking}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,.7)',
              color: 'var(--ink)',
            }}
          >
            View Booking Detail
            <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const labelCellStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--muted)',
  padding: '8px 10px',
  whiteSpace: 'nowrap',
  width: 160,
};

const valueCellStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--ink)',
  padding: '8px 10px',
};

export default RemoteDesktopSummary;
