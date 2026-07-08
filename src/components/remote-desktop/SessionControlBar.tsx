/**
 * SessionControlBar — Session control bar for the Browser Viewer
 *
 * Displays session metadata (elapsed time, remaining time, connection quality,
 * active application, file handoff status) and provides session controls
 * (disconnect, fullscreen toggle, quality selector, report issue).
 *
 * Uses Architex OS design tokens (var(--teal), var(--muted), etc.) and
 * platform CSS classes (.pill, .btn, .btn-secondary).
 *
 * Requirements: 6.4, 6.7
 */

import React from 'react';
import { Wifi, Clock, Maximize, Power, AlertCircle } from 'lucide-react';
import type { ConnectionQuality } from './hooks/useBandwidthMonitor';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface SessionControlBarProps {
  /** Elapsed session time in seconds */
  elapsedSeconds: number;
  /** Remaining time until hard expiry in seconds */
  remainingSeconds: number;
  /** Current latency in milliseconds, null if unavailable */
  latencyMs: number | null;
  /** Estimated bandwidth in Mbps, null if unavailable */
  bandwidthMbps: number | null;
  /** Derived connection quality tier */
  quality: ConnectionQuality;
  /** Name of the currently active application */
  activeApp: string;
  /** File handoff status text (e.g. "2 files pending") */
  fileHandoffStatus: string;
  /** Whether the countdown warning state is active */
  showCountdownWarning: boolean;
  /** Whether the expiry notification state is active */
  showExpiryNotification: boolean;
  /** Callback to disconnect the session */
  onDisconnect: () => void;
  /** Callback to toggle fullscreen mode */
  onToggleFullscreen: () => void;
  /** Callback when quality profile is changed */
  onQualityChange: (profile: string) => void;
  /** Callback to report an issue */
  onReportIssue: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const QUALITY_PROFILES = ['High', 'Balanced', 'Low'] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Format seconds as HH:MM:SS
 */
function formatTime(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Get the color token for the connection quality indicator.
 */
function getQualityColor(quality: ConnectionQuality): string {
  switch (quality) {
    case 'good':
      return 'var(--green)';
    case 'fair':
      return 'var(--amber)';
    case 'poor':
      return 'var(--red)';
    default:
      return 'var(--muted)';
  }
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const barStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  height: 36,
  padding: '0 14px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'rgba(255,255,255,.74)',
  fontFamily: 'var(--font)',
  fontSize: 12,
  color: 'var(--ink)',
  flexWrap: 'nowrap',
  overflow: 'hidden',
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  whiteSpace: 'nowrap',
};

const separatorStyle: React.CSSProperties = {
  width: 1,
  height: 20,
  background: 'var(--border)',
  flexShrink: 0,
};

const warningBarStyle: React.CSSProperties = {
  ...barStyle,
  border: '1px solid rgba(245,166,35,.3)',
  background: 'rgba(245,166,35,.06)',
};

const expiryBarStyle: React.CSSProperties = {
  ...barStyle,
  border: '1px solid rgba(217,87,71,.3)',
  background: 'rgba(217,87,71,.06)',
};

// ─── Component ──────────────────────────────────────────────────────────────────

export function SessionControlBar({
  elapsedSeconds,
  remainingSeconds,
  latencyMs,
  bandwidthMbps,
  quality,
  activeApp,
  fileHandoffStatus,
  showCountdownWarning,
  showExpiryNotification,
  onDisconnect,
  onToggleFullscreen,
  onQualityChange,
  onReportIssue,
}: SessionControlBarProps) {
  // Determine bar style based on warning state
  const currentBarStyle = showExpiryNotification
    ? expiryBarStyle
    : showCountdownWarning
      ? warningBarStyle
      : barStyle;

  const qualityColor = getQualityColor(quality);

  return (
    <div style={currentBarStyle} role="toolbar" aria-label="Session controls">
      {/* Elapsed Time */}
      <div style={sectionStyle} title="Elapsed time">
        <Clock size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
        <span style={{ color: 'var(--muted)' }}>{formatTime(elapsedSeconds)}</span>
      </div>

      {/* Remaining Time */}
      <div
        style={sectionStyle}
        title="Remaining time"
      >
        <span
          style={{
            fontWeight: 600,
            color: showExpiryNotification
              ? 'var(--red)'
              : showCountdownWarning
                ? 'var(--amber)'
                : 'var(--ink)',
          }}
        >
          {formatTime(remainingSeconds)}
        </span>
      </div>

      <div style={separatorStyle} />

      {/* Connection Quality */}
      <div style={sectionStyle} title={`Connection: ${quality}`}>
        <Wifi size={14} style={{ color: qualityColor, flexShrink: 0 }} />
        <span className="pill" style={{ fontSize: 10, color: qualityColor, padding: '2px 8px' }}>
          {latencyMs !== null ? `${latencyMs}ms` : '—'}
          {bandwidthMbps !== null ? ` · ${bandwidthMbps} Mbps` : ''}
        </span>
      </div>

      <div style={separatorStyle} />

      {/* Active Application */}
      <div style={{ ...sectionStyle, minWidth: 0 }} title={`Active: ${activeApp}`}>
        <span
          style={{
            color: 'var(--deep)',
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 140,
          }}
        >
          {activeApp || '—'}
        </span>
      </div>

      {/* File Handoff Status */}
      {fileHandoffStatus && (
        <>
          <div style={separatorStyle} />
          <div style={sectionStyle}>
            <span style={{ color: 'var(--muted)', fontSize: 11 }}>{fileHandoffStatus}</span>
          </div>
        </>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {/* Quality Profile Selector */}
        <select
          className="btn-secondary"
          aria-label="Quality profile"
          style={{
            height: 28,
            fontSize: 11,
            padding: '0 8px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'rgba(255,255,255,.7)',
            color: 'var(--ink)',
            cursor: 'pointer',
            fontFamily: 'var(--font)',
          }}
          onChange={(e) => onQualityChange(e.target.value)}
          defaultValue="Balanced"
        >
          {QUALITY_PROFILES.map((profile) => (
            <option key={profile} value={profile}>
              {profile}
            </option>
          ))}
        </select>

        {/* Toggle Fullscreen */}
        <button
          className="btn-secondary"
          type="button"
          onClick={onToggleFullscreen}
          title="Toggle fullscreen"
          aria-label="Toggle fullscreen"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'rgba(255,255,255,.7)',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <Maximize size={14} style={{ color: 'var(--ink)' }} />
        </button>

        {/* Report Issue */}
        <button
          className="btn-secondary"
          type="button"
          onClick={onReportIssue}
          title="Report issue"
          aria-label="Report issue"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'rgba(255,255,255,.7)',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <AlertCircle size={14} style={{ color: 'var(--amber)' }} />
        </button>

        {/* Disconnect */}
        <button
          className="btn"
          type="button"
          onClick={onDisconnect}
          title="Disconnect session"
          aria-label="Disconnect session"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            height: 28,
            padding: '0 10px',
            borderRadius: 8,
            border: '1px solid rgba(217,87,71,.18)',
            background: 'rgba(217,87,71,.06)',
            color: 'var(--red)',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 500,
            fontFamily: 'var(--font)',
          }}
        >
          <Power size={13} />
          <span>Disconnect</span>
        </button>
      </div>
    </div>
  );
}

export default SessionControlBar;
