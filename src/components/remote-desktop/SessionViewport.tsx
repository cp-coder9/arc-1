/**
 * SessionViewport — Renders the WebRTC remote desktop video stream.
 *
 * Responsibilities:
 * - Display WebRTC video stream scaled to fit the viewport while maintaining aspect ratio
 * - Add letterbox bars (using var(--ink) background) when aspect ratios differ
 * - Enforce minimum supported viewport of 800×600 pixels
 * - Show a loading/connecting placeholder when no stream is available
 * - Make the video element focusable for input capture (useInputCapture)
 * - Expose a ref for the viewport div so useInputCapture can attach to it
 *
 * Requirements: 6.3
 */

import { forwardRef, useEffect, useRef } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface SessionViewportProps {
  /** The remote media stream from WebRTC, or null if not yet connected */
  remoteStream: MediaStream | null;
  /** Whether the session is active (connected and streaming) */
  isActive: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────────

/**
 * SessionViewport renders the remote desktop video stream within a viewport container.
 * Uses object-fit: contain for aspect ratio preservation with automatic letterboxing.
 * The forwarded ref attaches to the outer viewport div for useInputCapture.
 */
const SessionViewport = forwardRef<HTMLDivElement, SessionViewportProps>(
  function SessionViewport({ remoteStream, isActive }, ref) {
    const videoRef = useRef<HTMLVideoElement | null>(null);

    // Attach the remote stream to the video element when it changes
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      if (remoteStream) {
        video.srcObject = remoteStream;
      } else {
        video.srcObject = null;
      }
    }, [remoteStream]);

    return (
      <div
        ref={ref}
        tabIndex={0}
        role="application"
        aria-label="Remote desktop session viewport"
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          minWidth: 800,
          minHeight: 600,
          backgroundColor: 'var(--ink)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          outline: 'none',
          borderRadius: 8,
        }}
      >
        {remoteStream && isActive ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              color: 'var(--muted)',
            }}
          >
            <LoadingSpinner />
            <span
              style={{
                fontSize: 14,
                fontFamily: 'var(--font)',
                color: 'var(--muted)',
              }}
            >
              {isActive ? 'Waiting for video stream…' : 'Connecting to remote host…'}
            </span>
          </div>
        )}
      </div>
    );
  }
);

// ─── Loading Spinner (inline, no external deps) ─────────────────────────────────

function LoadingSpinner() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      style={{ animation: 'spin 1.2s linear infinite' }}
    >
      <circle
        cx="16"
        cy="16"
        r="13"
        stroke="var(--muted)"
        strokeWidth="3"
        strokeOpacity="0.25"
      />
      <path
        d="M16 3a13 13 0 0 1 13 13"
        stroke="var(--teal)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

export default SessionViewport;
