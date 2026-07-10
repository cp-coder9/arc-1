/**
 * RemoteDesktopSessionBar — Persistent Session Control Bar
 *
 * Displays a persistent session control bar during active remote desktop
 * sessions showing: elapsed time (HH:MM:SS, 1s update), remaining time
 * (HH:MM:SS, 1s update), list of allowed applications (max 10), connection
 * quality indicator, file handoff status, and blocked actions.
 *
 * Countdown warnings: amber at 5min remaining, red at 1min remaining.
 *
 * Renders within the Architex OS shell — no custom chrome.
 * Uses platform CSS tokens and class system.
 *
 * Validates: Requirements 10.1, 10.2, 10.3
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  Wifi,
  Monitor,
  FileText,
  Power,
  Maximize,
  AlertCircle,
  Lock,
  ShieldOff,
  FolderX,
  AppWindow,
  Clipboard,
  Download,
} from 'lucide-react';
import type { UserProfile } from '@/types';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type ConnectionQuality = 'good' | 'fair' | 'poor' | 'unknown';

export interface RemoteDesktopSessionBarProps {
  /** Current authenticated user */
  user: UserProfile;
  /** Elapsed session time in seconds */
  elapsedSeconds: number;
  /** Remaining time until session hard expiry in seconds */
  remainingSeconds: number;
  /** Allowed application names */
  allowedApps: string[];
  /** Currently active application name */
  activeApp?: string;
  /** Connection quality tier */
  quality: ConnectionQuality;
  /** Latency in milliseconds */
  latencyMs: number | null;
  /** Bandwidth in Mbps */
  bandwidthMbps: number | null;
  /** File handoff status text */
  fileHandoffStatus?: string;
  /** Whether clipboard transfer is enabled */
  clipboardEnabled?: boolean;
  /** Callback: end session */
  onEndSession: () => void;
  /** Callback: toggle fullscreen */
  onToggleFullscreen: () => void;
  /** Callback: report issue */
  onReportIssue: () => void;
  /** Callback: quality change */
  onQualityChange?: (profile: string) => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const AMBER_THRESHOLD_SECONDS = 5 * 60;  // 5 minutes
const RED_THRESHOLD_SECONDS = 60;         // 1 minute

const BLOCKED_ACTIONS = [
  { icon: Monitor, label: 'Full desktop access' },
  { icon: FolderX, label: 'File system browsing' },
  { icon: Download, label: 'Installing software' },
  { icon: AppWindow, label: 'Accessing other applications' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatTime(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getQualityColor(quality: ConnectionQuality): string {
  switch (quality) {
    case 'good': return 'var(--green)';
    case 'fair': return 'var(--amber)';
    case 'poor': return 'var(--red)';
    default: return 'var(--muted)';
  }
}

function getTimerColor(remainingSeconds: number): string {
  if (remainingSeconds <= RED_THRESHOLD_SECONDS) return 'var(--red)';
  if (remainingSeconds <= AMBER_THRESHOLD_SECONDS) return 'var(--amber)';
  return 'var(--ink)';
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function RemoteDesktopSessionBar({
  user,
  elapsedSeconds,
  remainingSeconds,
  allowedApps,
  activeApp,
  quality,
  latencyMs,
  bandwidthMbps,
  fileHandoffStatus,
  clipboardEnabled = false,
  onEndSession,
  onToggleFullscreen,
  onReportIssue,
  onQualityChange,
}: RemoteDesktopSessionBarProps) {
  const [showEndConfirmation, setShowEndConfirmation] = useState(false);
  const [showBlockedActions, setShowBlockedActions] = useState(false);

  const timerColor = getTimerColor(remainingSeconds);
  const qualityColor = getQualityColor(quality);
  const isWarning = remainingSeconds <= AMBER_THRESHOLD_SECONDS;
  const isCritical = remainingSeconds <= RED_THRESHOLD_SECONDS;

  const handleEndSession = useCallback(() => {
    setShowEndConfirmation(true);
  }, []);

  const handleConfirmEnd = useCallback(() => {
    setShowEndConfirmation(false);
    onEndSession();
  }, [onEndSession]);

  const handleCancelEnd = useCallback(() => {
    setShowEndConfirmation(false);
  }, []);

  // Blocked actions list includes clipboard when disabled
  const allBlockedActions = clipboardEnabled
    ? BLOCKED_ACTIONS
    : [...BLOCKED_ACTIONS, { icon: Clipboard, label: 'Clipboard transfer' }];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Main Control Bar */}
      <div
        role="toolbar"
        aria-label="Session controls"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          height: 40,
          padding: '0 14px',
          borderRadius: 12,
          border: `1px solid ${isCritical ? 'rgba(217,87,71,.3)' : isWarning ? 'rgba(245,166,35,.3)' : 'var(--border)'}`,
          background: isCritical
            ? 'rgba(217,87,71,.04)'
            : isWarning
              ? 'rgba(245,166,35,.04)'
              : 'rgba(255,255,255,.74)',
          fontFamily: 'var(--font)',
          fontSize: 12,
          color: 'var(--ink)',
          flexWrap: 'nowrap',
          overflow: 'hidden',
        }}
      >
        {/* Elapsed Time */}
        <div style={sectionStyle} title="Elapsed time">
          <Clock size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <span style={{ color: 'var(--muted)' }}>{formatTime(elapsedSeconds)}</span>
        </div>

        {/* Separator */}
        <div style={separatorStyle} />

        {/* Remaining Time */}
        <div style={sectionStyle} title="Remaining time">
          <span style={{ fontWeight: 600, color: timerColor }}>
            {formatTime(remainingSeconds)}
          </span>
          {isWarning && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: timerColor,
                textTransform: 'uppercase',
              }}
            >
              {isCritical ? 'EXPIRING' : 'LOW'}
            </span>
          )}
        </div>

        <div style={separatorStyle} />

        {/* Connection Quality */}
        <div style={sectionStyle} title={`Connection: ${quality}`}>
          <Wifi size={14} style={{ color: qualityColor, flexShrink: 0 }} />
          <span style={{ color: qualityColor, fontSize: 11 }}>
            {latencyMs !== null ? `${latencyMs}ms` : '—'}
            {bandwidthMbps !== null ? ` · ${bandwidthMbps} Mbps` : ''}
          </span>
        </div>

        <div style={separatorStyle} />

        {/* Active App */}
        <div style={{ ...sectionStyle, minWidth: 0 }} title={`Active: ${activeApp || 'None'}`}>
          <Monitor size={14} style={{ color: 'var(--teal)', flexShrink: 0 }} />
          <span
            style={{
              color: 'var(--deep)',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 120,
              whiteSpace: 'nowrap',
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
              <FileText size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>{fileHandoffStatus}</span>
            </div>
          </>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {/* Blocked Actions Toggle */}
          <button
            type="button"
            onClick={() => setShowBlockedActions((v) => !v)}
            title="View blocked actions"
            aria-label="View blocked actions"
            aria-expanded={showBlockedActions}
            style={iconBtnStyle}
          >
            <Lock size={14} style={{ color: 'var(--muted)' }} />
          </button>

          {/* Report Issue */}
          <button
            type="button"
            onClick={onReportIssue}
            title="Report issue"
            aria-label="Report issue"
            style={iconBtnStyle}
          >
            <AlertCircle size={14} style={{ color: 'var(--amber)' }} />
          </button>

          {/* Fullscreen */}
          <button
            type="button"
            onClick={onToggleFullscreen}
            title="Toggle fullscreen"
            aria-label="Toggle fullscreen"
            style={iconBtnStyle}
          >
            <Maximize size={14} style={{ color: 'var(--ink)' }} />
          </button>

          {/* End Session */}
          <button
            type="button"
            className="btn"
            onClick={handleEndSession}
            title="End session"
            aria-label="End session"
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
            End Session
          </button>
        </div>
      </div>

      {/* Blocked Actions Panel (toggled) */}
      {showBlockedActions && (
        <div
          className="panel"
          style={{ padding: '12px 14px' }}
          role="region"
          aria-label="Blocked actions"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <ShieldOff size={14} style={{ color: 'var(--muted)' }} />
            <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', margin: 0 }}>
              Blocked Actions
            </h3>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {allBlockedActions.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="pill"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11,
                  color: 'var(--muted)',
                  background: 'rgba(16,32,51,.04)',
                  borderColor: 'var(--border)',
                }}
              >
                <Icon size={12} />
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Allowed Applications (compact) */}
      {allowedApps.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Allowed:
          </span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {allowedApps.slice(0, 10).map((app) => (
              <span
                key={app}
                className="pill"
                style={{
                  fontSize: 10,
                  padding: '2px 8px',
                  color: app === activeApp ? 'var(--teal)' : 'var(--muted)',
                  background: app === activeApp ? 'rgba(25,183,176,.08)' : 'rgba(16,32,51,.03)',
                  borderColor: app === activeApp ? 'rgba(25,183,176,.18)' : 'var(--border)',
                }}
              >
                {app}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Countdown Warning Banner */}
      {isWarning && !showEndConfirmation && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 10,
            border: `1px solid ${isCritical ? 'rgba(217,87,71,.3)' : 'rgba(245,166,35,.3)'}`,
            background: isCritical ? 'rgba(217,87,71,.06)' : 'rgba(245,166,35,.06)',
            fontSize: 12,
            color: isCritical ? 'var(--red)' : 'var(--amber)',
            fontWeight: 500,
          }}
        >
          <Clock size={14} />
          {isCritical
            ? 'Session ending in less than 1 minute. Save your work now.'
            : 'Less than 5 minutes remaining. Please save your work.'}
        </div>
      )}

      {/* End Session Confirmation Dialog */}
      {showEndConfirmation && (
        <div
          className="panel"
          role="alertdialog"
          aria-labelledby="end-session-title"
          aria-describedby="end-session-desc"
          style={{ padding: 20, border: '1px solid rgba(217,87,71,.18)' }}
        >
          <h3
            id="end-session-title"
            style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}
          >
            End Remote Session?
          </h3>
          <p
            id="end-session-desc"
            style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.5 }}
          >
            This will end your remote session. Any unsaved work in remote applications may be lost.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn"
              onClick={handleCancelEnd}
              style={{
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,.7)',
                color: 'var(--ink)',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleConfirmEnd}
              style={{
                border: '1px solid rgba(217,87,71,.18)',
                background: 'rgba(217,87,71,.06)',
                color: 'var(--red)',
              }}
            >
              <Power size={13} style={{ marginRight: 4 }} />
              End Session
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

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

const iconBtnStyle: React.CSSProperties = {
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
};

export default RemoteDesktopSessionBar;
