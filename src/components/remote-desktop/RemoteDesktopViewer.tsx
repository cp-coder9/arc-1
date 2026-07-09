/**
 * RemoteDesktopViewer — Top-level Browser Viewer component
 *
 * Renders the full remote desktop session experience within the Architex OS
 * shell content area. Integrates all hooks (WebRTC, signalling, input capture,
 * session timer, bandwidth monitor) and orchestrates child components through
 * a session state machine:
 *
 *   consent → connecting → connected → reconnecting → disconnected → summary
 *
 * Implements a beforeunload confirmation to prevent accidental tab closure
 * during an active session.
 *
 * Requirements: 6.1, 6.6
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Monitor } from 'lucide-react';
import type { UserProfile } from '@/types';

// ─── Hooks ──────────────────────────────────────────────────────────────────────
import { useWebRTCSession } from './hooks/useWebRTCSession';
import { useSignalling } from './hooks/useSignalling';
import { useInputCapture } from './hooks/useInputCapture';
import { useSessionTimer } from './hooks/useSessionTimer';
import { useBandwidthMonitor } from './hooks/useBandwidthMonitor';

// ─── Child Components ───────────────────────────────────────────────────────────
import SessionViewport from './SessionViewport';
import SessionControlBar from './SessionControlBar';
import { QualitySelector, type QualitySelectorProfile } from './QualitySelector';
import ReconnectionOverlay from './ReconnectionOverlay';
import RecordingConsent from './RecordingConsent';
import FileManifestPanel from './FileManifestPanel';
import SessionEndSummary from './SessionEndSummary';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type SessionPhase =
  | 'consent'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'summary';

export interface SessionSummary {
  sessionId: string;
  bookingId: string;
  bookedDurationSeconds: number;
  actualConnectedSeconds: number;
  applicationsUsed: string[];
  filesProduced: number;
  disconnectionReason: string;
}

export interface RemoteDesktopViewerProps {
  /** Current authenticated user */
  user: UserProfile;
  /** Booking reference for this session */
  bookingId: string;
  /** Session token issued by the Session Broker */
  sessionToken: string;
  /** Callback when the session ends (navigates back to bookings) */
  onSessionEnd: (summary: SessionSummary) => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const RECONNECT_INTERVAL_MS = 5_000;
const MAX_RECONNECT_ATTEMPTS = 12;
const BEFOREUNLOAD_MESSAGE = 'Leaving this page will disconnect your remote session.';

// ─── Component ──────────────────────────────────────────────────────────────────

export function RemoteDesktopViewer({
  user,
  bookingId,
  sessionToken,
  onSessionEnd,
}: RemoteDesktopViewerProps) {
  // ── Session State Machine ──────────────────────────────────────────────────

  const [phase, setPhase] = useState<SessionPhase>('consent');
  const [sessionId] = useState(() => `session_${bookingId}_${Date.now()}`);
  const [qualityProfile, setQualityProfile] = useState<QualitySelectorProfile>('auto');
  const [activeApp, setActiveApp] = useState<string>('');
  const [fileHandoffStatus, setFileHandoffStatus] = useState<string>('');
  const [disconnectionReason, setDisconnectionReason] = useState<string>('');

  // Reconnection state
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Session summary data
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  // Viewport ref for input capture
  const viewportRef = useRef<HTMLDivElement>(null);

  // ── Booking Window (placeholder values — in production, fetched from booking) ─

  const windowStart = useRef(Date.now()).current;
  const windowEnd = useRef(Date.now() + 2 * 60 * 60 * 1000).current; // 2 hours default
  const gracePeriodSeconds = 5 * 60; // 5 minutes

  // ── WebRTC Session Hook ────────────────────────────────────────────────────

  const handleWebRTCConnected = useCallback((connectionType: 'peer-to-peer' | 'turn-relay') => {
    setPhase('connected');
    setReconnectAttempt(0);
  }, []);

  const handleWebRTCFailed = useCallback((error: { code: string; message: string }) => {
    if (phase === 'reconnecting') {
      // Continue reconnection attempts
      return;
    }
    setPhase('disconnected');
    setDisconnectionReason(error.message);
  }, [phase]);

  const handleSessionEndFromHost = useCallback((reason: string) => {
    setDisconnectionReason(reason);
    setPhase('disconnected');
  }, []);

  const webrtc = useWebRTCSession({
    sessionId,
    sessionToken,
    onConnected: handleWebRTCConnected,
    onFailed: handleWebRTCFailed,
    onSessionEnd: handleSessionEndFromHost,
  });

  // ── Signalling Hook ────────────────────────────────────────────────────────

  const signalling = useSignalling({
    sessionToken,
    sessionId,
    autoConnect: false, // We connect manually after consent
  });

  // ── Input Capture Hook ─────────────────────────────────────────────────────

  const dataChannel = webrtc.peerConnection
    ? (webrtc.peerConnection as RTCPeerConnection & { _inputChannel?: RTCDataChannel })?._inputChannel ?? null
    : null;

  const inputCapture = useInputCapture({
    viewportRef,
    dataChannel,
    enabled: phase === 'connected',
  });

  // ── Session Timer Hook ─────────────────────────────────────────────────────

  const timer = useSessionTimer({
    windowStart,
    windowEnd,
    gracePeriodSeconds,
  });

  // ── Bandwidth Monitor Hook ─────────────────────────────────────────────────

  const bandwidth = useBandwidthMonitor({
    peerConnection: webrtc.peerConnection,
  });

  // ── Beforeunload Handler (Requirement 6.6) ─────────────────────────────────

  useEffect(() => {
    const isActiveSession = phase === 'connected' || phase === 'connecting' || phase === 'reconnecting';
    if (!isActiveSession) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = BEFOREUNLOAD_MESSAGE;
      return BEFOREUNLOAD_MESSAGE;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [phase]);

  // ── Auto-expire when timer expires ─────────────────────────────────────────

  useEffect(() => {
    if (timer.isExpired && (phase === 'connected' || phase === 'reconnecting')) {
      setDisconnectionReason('booking_window_expired');
      webrtc.disconnect();
      setPhase('disconnected');
    }
  }, [timer.isExpired, phase, webrtc]);

  // ── Reconnection Logic ─────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'reconnecting') {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      return;
    }

    if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      // All attempts exhausted
      setPhase('disconnected');
      setDisconnectionReason('reconnection_failed');
      return;
    }

    reconnectTimerRef.current = setTimeout(() => {
      setReconnectAttempt((prev) => prev + 1);
      webrtc.reconnect();
    }, RECONNECT_INTERVAL_MS);

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [phase, reconnectAttempt, webrtc]);

  // Detect WebRTC status change to trigger reconnection
  useEffect(() => {
    if (webrtc.status === 'reconnecting' && phase === 'connected') {
      setPhase('reconnecting');
      setReconnectAttempt(1);
    }
  }, [webrtc.status, phase]);

  // ── Action Handlers ────────────────────────────────────────────────────────

  const handleConsentAccepted = useCallback(() => {
    setPhase('connecting');
    webrtc.connect();
  }, [webrtc]);

  const handleConsentDeclined = useCallback(() => {
    const sessionSummary: SessionSummary = {
      sessionId,
      bookingId,
      bookedDurationSeconds: Math.floor((windowEnd - windowStart) / 1000),
      actualConnectedSeconds: 0,
      applicationsUsed: [],
      filesProduced: 0,
      disconnectionReason: 'consent_declined',
    };
    onSessionEnd(sessionSummary);
  }, [sessionId, bookingId, windowEnd, windowStart, onSessionEnd]);

  const handleDisconnect = useCallback(() => {
    webrtc.disconnect();
    setDisconnectionReason('user_disconnected');
    setPhase('disconnected');
  }, [webrtc]);

  const handleToggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(() => {
        // Fullscreen may be blocked by browser policy
      });
    }
  }, []);

  const handleQualityChange = useCallback((profile: string) => {
    const profileMap: Record<string, QualitySelectorProfile> = {
      High: 'high',
      Balanced: 'balanced',
      Low: 'low',
      Auto: 'auto',
    };
    const mapped = profileMap[profile] ?? 'auto';
    setQualityProfile(mapped);
    signalling.sendMessage('quality_change', { profile: mapped, manual: mapped !== 'auto' });
  }, [signalling]);

  const handleQualitySelectorChange = useCallback((profile: QualitySelectorProfile) => {
    setQualityProfile(profile);
    signalling.sendMessage('quality_change', { profile, manual: profile !== 'auto' });
  }, [signalling]);

  const handleReportIssue = useCallback(() => {
    signalling.sendMessage('quality_change', {
      request: 'report_issue',
      timestamp: Date.now(),
    });
  }, [signalling]);

  const handleReturnToBookings = useCallback(() => {
    const sessionSummary: SessionSummary = {
      sessionId,
      bookingId,
      bookedDurationSeconds: Math.floor((windowEnd - windowStart) / 1000),
      actualConnectedSeconds: timer.elapsedSeconds,
      applicationsUsed: activeApp ? [activeApp] : [],
      filesProduced: 0,
      disconnectionReason,
    };
    onSessionEnd(sessionSummary);
  }, [sessionId, bookingId, windowEnd, windowStart, timer.elapsedSeconds, activeApp, disconnectionReason, onSessionEnd]);

  const handleViewSummary = useCallback(() => {
    const sessionSummary: SessionSummary = {
      sessionId,
      bookingId,
      bookedDurationSeconds: Math.floor((windowEnd - windowStart) / 1000),
      actualConnectedSeconds: timer.elapsedSeconds,
      applicationsUsed: activeApp ? [activeApp] : [],
      filesProduced: 0,
      disconnectionReason,
    };
    setSummary(sessionSummary);
    setPhase('summary');
  }, [sessionId, bookingId, windowEnd, windowStart, timer.elapsedSeconds, activeApp, disconnectionReason]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">REMOTE DESKTOP</div>
            <h1>Session Viewer</h1>
            <p className="sub">
              Booking {bookingId} · {user.email}
            </p>
          </div>
        </div>
        <div className="hero-pills">
          <span className="pill">
            <span className="dot" /> {phaseLabel(phase)}
          </span>
        </div>
      </div>

      {/* Phase: Consent */}
      {phase === 'consent' && (
        <RecordingConsent
          onAccept={handleConsentAccepted}
          onDecline={handleConsentDeclined}
        />
      )}

      {/* Phase: Connecting */}
      {phase === 'connecting' && (
        <div className="panel" style={{ textAlign: 'center', padding: 48 }}>
          <Monitor size={48} style={{ color: 'var(--teal)', marginBottom: 14 }} />
          <h2 style={{ color: 'var(--ink)', marginBottom: 8 }}>Connecting to Remote Host</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Establishing secure connection… This may take up to 30 seconds.
          </p>
        </div>
      )}

      {/* Phase: Connected */}
      {(phase === 'connected' || phase === 'reconnecting') && (
        <>
          {/* Session Control Bar */}
          <SessionControlBar
            elapsedSeconds={timer.elapsedSeconds}
            remainingSeconds={timer.remainingSeconds}
            latencyMs={bandwidth.latencyMs}
            bandwidthMbps={bandwidth.bandwidthMbps}
            quality={bandwidth.quality}
            activeApp={activeApp}
            fileHandoffStatus={fileHandoffStatus}
            showCountdownWarning={timer.showCountdownWarning}
            showExpiryNotification={timer.showExpiryNotification}
            onDisconnect={handleDisconnect}
            onToggleFullscreen={handleToggleFullscreen}
            onQualityChange={handleQualityChange}
            onReportIssue={handleReportIssue}
          />

          {/* Viewport Container */}
          <div className="panel" style={{ padding: 0, position: 'relative', overflow: 'hidden' }}>
            <SessionViewport
              ref={viewportRef}
              remoteStream={webrtc.remoteStream}
              isActive={phase === 'connected'}
            />

            {/* Reconnection Overlay (renders on top of viewport) */}
            {phase === 'reconnecting' && (
              <ReconnectionOverlay
                isReconnecting={true}
                attemptCount={reconnectAttempt}
                maxAttempts={MAX_RECONNECT_ATTEMPTS}
                onReturnToBookings={handleReturnToBookings}
              />
            )}
          </div>

          {/* Quality Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <QualitySelector
              currentProfile={qualityProfile}
              onSelect={handleQualitySelectorChange}
            />
          </div>
        </>
      )}

      {/* Phase: Disconnected */}
      {phase === 'disconnected' && (
        <div className="panel" style={{ textAlign: 'center', padding: 48 }}>
          <h2 style={{ color: 'var(--ink)', marginBottom: 8 }}>Session Disconnected</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
            {disconnectionReason === 'booking_window_expired'
              ? 'Your booking period has ended.'
              : disconnectionReason === 'reconnection_failed'
                ? 'Connection could not be re-established.'
                : 'The remote session has ended.'}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn" type="button" onClick={handleViewSummary}>
              View Summary
            </button>
            <button className="btn-secondary" type="button" onClick={handleReturnToBookings}>
              Return to Bookings
            </button>
          </div>
        </div>
      )}

      {/* Phase: Summary */}
      {phase === 'summary' && summary && (
        <>
          <SessionEndSummary
            sessionId={summary.sessionId}
            bookingId={summary.bookingId}
            bookedDurationSeconds={summary.bookedDurationSeconds}
            actualConnectedSeconds={summary.actualConnectedSeconds}
            applicationsUsed={summary.applicationsUsed}
            filesProduced={summary.filesProduced}
            disconnectionReason={summary.disconnectionReason}
            onReturnToBookings={handleReturnToBookings}
          />
          <FileManifestPanel
            sessionId={sessionId}
            files={[]}
          />
        </>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function phaseLabel(phase: SessionPhase): string {
  switch (phase) {
    case 'consent':
      return 'Awaiting Consent';
    case 'connecting':
      return 'Connecting';
    case 'connected':
      return 'Connected';
    case 'reconnecting':
      return 'Reconnecting';
    case 'disconnected':
      return 'Disconnected';
    case 'summary':
      return 'Session Complete';
  }
}

export default RemoteDesktopViewer;
