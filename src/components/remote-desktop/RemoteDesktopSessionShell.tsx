/**
 * RemoteDesktopSessionShell — Wrapper that manages session initialization
 * and renders the RemoteDesktopViewer within the Architex OS shell.
 *
 * This shell handles:
 * - Accepting a booking launch action (bookingId + sessionToken from state)
 * - Rendering the RemoteDesktopViewer with the correct props
 * - Navigating back to the bookings/marketplace view on session end
 *
 * Requirements: 6.1
 */

import { useCallback, useState } from 'react';
import { Monitor, ArrowLeft, Loader2 } from 'lucide-react';
import type { UserProfile } from '@/types';
import { RemoteDesktopViewer, type SessionSummary } from './RemoteDesktopViewer';

export interface RemoteDesktopSessionShellProps {
  user: UserProfile;
  /** Optional pre-loaded booking ID to launch into immediately */
  initialBookingId?: string;
  /** Optional pre-loaded session token to launch into immediately */
  initialSessionToken?: string;
  /** Navigate back to bookings/marketplace */
  onNavigateBack: () => void;
}

type ShellState =
  | { phase: 'awaiting_launch' }
  | { phase: 'active'; bookingId: string; sessionToken: string }
  | { phase: 'ended'; summary: SessionSummary };

export function RemoteDesktopSessionShell({
  user,
  initialBookingId,
  initialSessionToken,
  onNavigateBack,
}: RemoteDesktopSessionShellProps) {
  const [state, setState] = useState<ShellState>(() => {
    if (initialBookingId && initialSessionToken) {
      return { phase: 'active', bookingId: initialBookingId, sessionToken: initialSessionToken };
    }
    return { phase: 'awaiting_launch' };
  });

  const handleSessionEnd = useCallback((summary: SessionSummary) => {
    setState({ phase: 'ended', summary });
  }, []);

  const handleReturnToBookings = useCallback(() => {
    onNavigateBack();
  }, [onNavigateBack]);

  // ── Awaiting Launch ───────────────────────────────────────────────────────
  if (state.phase === 'awaiting_launch') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="hero">
          <div className="hero-header">
            <div>
              <div className="eyebrow">REMOTE DESKTOP</div>
              <h1>Session Viewer</h1>
              <p className="sub">Launch a remote desktop session from your confirmed bookings.</p>
            </div>
          </div>
        </div>
        <div className="panel" style={{ textAlign: 'center', padding: '48px 22px' }}>
          <Monitor size={48} style={{ color: 'var(--muted)', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>No Active Session</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 400, margin: '0 auto 24px' }}>
            Launch a remote desktop session from a confirmed booking in the Remote Desktop Marketplace.
          </p>
          <button className="btn" onClick={handleReturnToBookings}>
            <ArrowLeft size={14} style={{ marginRight: 6 }} />
            Go to Marketplace
          </button>
        </div>
      </div>
    );
  }

  // ── Active Session ────────────────────────────────────────────────────────
  if (state.phase === 'active') {
    return (
      <RemoteDesktopViewer
        user={user}
        bookingId={state.bookingId}
        sessionToken={state.sessionToken}
        onSessionEnd={handleSessionEnd}
      />
    );
  }

  // ── Session Ended — Summary ───────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">REMOTE DESKTOP</div>
            <h1>Session Complete</h1>
            <p className="sub">Your remote desktop session has ended.</p>
          </div>
        </div>
      </div>
      <div className="panel">
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Session Summary</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <div className="stat-card">
            <div className="stat-value">{Math.ceil(state.summary.actualConnectedSeconds / 60)}</div>
            <div className="stat-label">Minutes Connected</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{state.summary.applicationsUsed.length}</div>
            <div className="stat-label">Applications Used</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{state.summary.filesProduced}</div>
            <div className="stat-label">Files Produced</div>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <button className="btn" onClick={handleReturnToBookings}>
            <ArrowLeft size={14} style={{ marginRight: 6 }} />
            Return to Bookings
          </button>
        </div>
      </div>
    </div>
  );
}

export default RemoteDesktopSessionShell;
