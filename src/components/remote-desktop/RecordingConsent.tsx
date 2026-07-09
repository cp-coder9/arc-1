/**
 * RecordingConsent — Recording consent dialog for Remote Desktop sessions
 *
 * Displays a "Recording Active" indicator when recording is enabled and
 * requires consent acceptance before streaming starts. If declined or no
 * response within 60 seconds, the connection is cancelled.
 *
 * Requirements: 16.2, 16.3
 *
 * NOTE: This is a placeholder implementation. Full UI will be built in task 21.6.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Video } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface RecordingConsentProps {
  /** Callback when user accepts consent */
  onAccept: () => void;
  /** Callback when user declines or timeout expires */
  onDecline: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const CONSENT_TIMEOUT_SECONDS = 60;

// ─── Component ──────────────────────────────────────────────────────────────────

export function RecordingConsent({ onAccept, onDecline }: RecordingConsentProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(CONSENT_TIMEOUT_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-decline on timeout
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          onDecline();
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
    onDecline();
  }, [onDecline]);

  return (
    <div className="panel" style={{ textAlign: 'center', padding: 48 }}>
      <Video size={48} style={{ color: 'var(--teal)', marginBottom: 14 }} />
      <h2 style={{ color: 'var(--ink)', marginBottom: 8 }}>Recording Consent</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8, maxWidth: 480, margin: '0 auto 8px' }}>
        This session may be recorded for quality and dispute resolution purposes.
        The recording will be stored securely and accessible only to the resource owner,
        you, and platform administrators.
      </p>
      <p style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 20 }}>
        Auto-decline in {remainingSeconds}s
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button className="btn" type="button" onClick={handleAccept}>
          Accept &amp; Connect
        </button>
        <button className="btn-secondary" type="button" onClick={handleDecline}>
          Decline
        </button>
      </div>
    </div>
  );
}

export default RecordingConsent;
