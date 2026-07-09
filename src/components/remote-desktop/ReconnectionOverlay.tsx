import React from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';

export interface ReconnectionOverlayProps {
  /** Whether a reconnection is currently in progress */
  isReconnecting: boolean;
  /** Current reconnection attempt number (1-based) */
  attemptCount: number;
  /** Maximum number of reconnection attempts before giving up */
  maxAttempts: number;
  /** Callback when user clicks "Return to Bookings" after all attempts fail */
  onReturnToBookings: () => void;
}

/**
 * Overlay displayed on WebRTC connection drop.
 * Shows reconnection progress or failure state with a "Return to Bookings" action.
 *
 * Requirements: 6.8, 6.9
 */
export function ReconnectionOverlay({
  isReconnecting,
  attemptCount,
  maxAttempts,
  onReturnToBookings,
}: ReconnectionOverlayProps) {
  if (!isReconnecting) return null;

  const hasFailed = attemptCount >= maxAttempts;

  return (
    <div style={styles.overlay} role="alert" aria-live="assertive">
      <div style={styles.content}>
        {hasFailed ? (
          <>
            <WifiOff size={48} style={styles.icon} aria-hidden="true" />
            <h2 style={styles.heading}>Connection could not be re-established</h2>
            <p style={styles.subtext}>
              All {maxAttempts} reconnection attempts failed.
            </p>
            <button
              className="btn"
              onClick={onReturnToBookings}
              style={styles.button}
            >
              Return to Bookings
            </button>
          </>
        ) : (
          <>
            <RefreshCw size={48} style={styles.spinnerIcon} aria-hidden="true" />
            <h2 style={styles.heading}>Reconnecting...</h2>
            <p style={styles.subtext}>
              Attempt {attemptCount} of {maxAttempts}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(16, 32, 51, 0.82)',
    zIndex: 1000,
    backdropFilter: 'blur(4px)',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 14,
    textAlign: 'center',
    padding: 32,
    maxWidth: 380,
  },
  icon: {
    color: 'var(--white, #fff)',
    opacity: 0.9,
  },
  spinnerIcon: {
    color: 'var(--white, #fff)',
    opacity: 0.9,
    animation: 'spin 1.5s linear infinite',
  },
  heading: {
    color: 'var(--white, #fff)',
    fontSize: 20,
    fontWeight: 600,
    margin: 0,
  },
  subtext: {
    color: 'var(--white, #fff)',
    opacity: 0.7,
    fontSize: 14,
    margin: 0,
  },
  button: {
    marginTop: 10,
  },
};

export default ReconnectionOverlay;
