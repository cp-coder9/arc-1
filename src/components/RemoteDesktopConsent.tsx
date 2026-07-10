/**
 * RemoteDesktopConsent — POPIA-Compliant Recording & Screenshot Consent
 *
 * Displays a POPIA consent prompt before any media stream is established.
 * Includes: purpose of recording, retention period (90 days or dispute
 * resolution), who has access (Resource_Owner, Resource_Consumer,
 * Platform_Admin), and the consumer's right to decline.
 *
 * If the consumer declines or does not respond within 60 seconds, the
 * session is cancelled with a "consent_declined" event.
 *
 * Renders within the Architex OS shell content area — no custom chrome.
 * Uses platform CSS tokens (var(--teal), var(--ink), etc.) and class system.
 *
 * Validates: Requirements 2.1, 2.2, 2.6
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Shield, Eye, Clock, Users, AlertTriangle } from 'lucide-react';
import type { UserProfile } from '@/types';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface RemoteDesktopConsentProps {
  /** Current authenticated user */
  user: UserProfile;
  /** Whether recording is enabled on the target host */
  recordingEnabled: boolean;
  /** Consent text version identifier */
  consentTextVersion?: string;
  /** Resource owner display name (for access disclosure) */
  ownerDisplayName?: string;
  /** Callback when consent is accepted */
  onAccept: () => void;
  /** Callback when consent is declined or times out */
  onDecline: (reason: 'declined' | 'timeout') => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const CONSENT_TIMEOUT_SECONDS = 60;
const RETENTION_DAYS = 90;

// ─── Component ──────────────────────────────────────────────────────────────────

export function RemoteDesktopConsent({
  user,
  recordingEnabled,
  consentTextVersion = '1.0',
  ownerDisplayName = 'Resource Owner',
  onAccept,
  onDecline,
}: RemoteDesktopConsentProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(CONSENT_TIMEOUT_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const declinedRef = useRef(false);

  // Auto-decline on timeout
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          if (!declinedRef.current) {
            declinedRef.current = true;
            onDecline('timeout');
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [onDecline]);

  const handleAccept = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    onAccept();
  }, [onAccept]);

  const handleDecline = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    declinedRef.current = true;
    onDecline('declined');
  }, [onDecline]);

  // Progress bar percentage
  const progressPercent = (remainingSeconds / CONSENT_TIMEOUT_SECONDS) * 100;
  const isUrgent = remainingSeconds <= 15;

  return (
    <div className="panel" style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Shield size={28} style={{ color: 'var(--teal)', flexShrink: 0 }} />
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
            POPIA Recording Consent
          </h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>
            Version {consentTextVersion} · Required before session can proceed
          </p>
        </div>
      </div>

      {/* Consent Information Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
        {/* Purpose */}
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <Eye size={16} style={{ color: 'var(--teal)', flexShrink: 0 }} />
            <h3 style={sectionTitleStyle}>Purpose of Recording</h3>
          </div>
          <p style={sectionTextStyle}>
            This remote desktop session {recordingEnabled ? 'will be' : 'may be'} recorded for
            quality assurance and dispute resolution purposes. The recording captures the
            application window stream shared during the session to protect both parties in the
            event of a dispute.
          </p>
        </div>

        {/* Retention Period */}
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <Clock size={16} style={{ color: 'var(--teal)', flexShrink: 0 }} />
            <h3 style={sectionTitleStyle}>Retention Period</h3>
          </div>
          <p style={sectionTextStyle}>
            Recordings are stored securely for a maximum of <strong>{RETENTION_DAYS} days</strong> from
            the session date, or until any active dispute related to this session is resolved —
            whichever is later. After this period, recordings are permanently deleted.
          </p>
        </div>

        {/* Access Rights */}
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <Users size={16} style={{ color: 'var(--teal)', flexShrink: 0 }} />
            <h3 style={sectionTitleStyle}>Who Has Access</h3>
          </div>
          <p style={sectionTextStyle}>
            Access to the recording is strictly limited to:
          </p>
          <ul style={listStyle}>
            <li><strong>You</strong> ({user.displayName || user.email}) — as the Resource Consumer</li>
            <li><strong>{ownerDisplayName}</strong> — as the Resource Owner</li>
            <li><strong>Platform Administrators</strong> — for dispute resolution only</li>
          </ul>
        </div>

        {/* Right to Decline */}
        <div style={{ ...sectionStyle, borderColor: 'rgba(245,166,35,.18)', background: 'rgba(245,166,35,.04)' }}>
          <div style={sectionHeaderStyle}>
            <AlertTriangle size={16} style={{ color: 'var(--amber)', flexShrink: 0 }} />
            <h3 style={{ ...sectionTitleStyle, color: 'var(--amber)' }}>Your Right to Decline</h3>
          </div>
          <p style={sectionTextStyle}>
            You have the right to decline this consent. However, if you decline or do not respond
            within {CONSENT_TIMEOUT_SECONDS} seconds, the session cannot proceed and will be
            cancelled. No charges will be applied for a cancelled session.
          </p>
        </div>
      </div>

      {/* Timeout Progress Bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            Time to respond
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: isUrgent ? 'var(--red)' : 'var(--muted)',
            }}
          >
            {remainingSeconds}s remaining
          </span>
        </div>
        <div
          style={{
            height: 4,
            borderRadius: 2,
            background: 'var(--border)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progressPercent}%`,
              borderRadius: 2,
              background: isUrgent ? 'var(--red)' : 'var(--teal)',
              transition: 'width 1s linear, background 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button
          className="btn"
          type="button"
          onClick={handleDecline}
          style={{
            border: '1px solid var(--border)',
            background: 'rgba(255,255,255,.7)',
            color: 'var(--ink)',
          }}
        >
          Decline
        </button>
        <button className="btn" type="button" onClick={handleAccept}>
          Accept &amp; Connect
        </button>
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'rgba(255,255,255,.5)',
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 8,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--deep)',
  margin: 0,
};

const sectionTextStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--ink)',
  lineHeight: 1.5,
  margin: 0,
};

const listStyle: React.CSSProperties = {
  margin: '8px 0 0',
  paddingLeft: 20,
  fontSize: 13,
  color: 'var(--ink)',
  lineHeight: 1.8,
};

export default RemoteDesktopConsent;
