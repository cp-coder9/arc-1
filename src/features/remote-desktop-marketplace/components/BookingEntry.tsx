// ─── Remote Desktop Marketplace — BookingEntry ──────────────────────────────
//
// A single booking row/card in the My Bookings view.
// Displays booking details, status badge, and contextual actions
// (Launch Session, Cancel, Leave Review).

import { useState, useEffect, useRef, type CSSProperties } from 'react';
import type { BookingRecord } from '../types';
import { isBookingInLaunchWindow, getCountdownSeconds } from '../services/bookingService';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BookingEntryProps {
  booking: BookingRecord;
  onCancel: (id: string) => void;
  onLaunchSession: (id: string) => void;
  onLeaveReview: (id: string) => void;
}

// ─── Status Pill Styles ───────────────────────────────────────────────────────

function getStatusPillStyle(status: BookingRecord['status']): CSSProperties {
  switch (status) {
    case 'confirmed':
      return {
        color: 'var(--green)',
        background: 'rgba(74,222,128,.1)',
        borderColor: 'rgba(74,222,128,.18)',
      };
    case 'pending_owner_confirmation':
      return {
        color: 'var(--amber)',
        background: 'rgba(245,166,35,.08)',
        borderColor: 'rgba(245,166,35,.18)',
      };
    case 'active':
      return {
        color: 'var(--teal)',
        background: 'rgba(25,183,176,.08)',
        borderColor: 'rgba(25,183,176,.18)',
      };
    case 'completed':
      return {
        color: 'var(--muted)',
        background: 'rgba(16,32,51,.04)',
        borderColor: 'var(--border)',
      };
    case 'cancelled_by_consumer':
    case 'declined':
    case 'expired':
    case 'conflict_expired':
      return {
        color: 'var(--red)',
        background: 'rgba(217,87,71,.06)',
        borderColor: 'rgba(217,87,71,.18)',
      };
    default:
      return {
        color: 'var(--muted)',
        background: 'rgba(16,32,51,.04)',
        borderColor: 'var(--border)',
      };
  }
}

function getStatusLabel(status: BookingRecord['status']): string {
  switch (status) {
    case 'confirmed':
      return 'Confirmed';
    case 'pending_owner_confirmation':
      return 'Pending';
    case 'active':
      return 'Active';
    case 'completed':
      return 'Completed';
    case 'cancelled_by_consumer':
      return 'Cancelled';
    case 'declined':
      return 'Declined';
    case 'expired':
      return 'Expired';
    case 'conflict_expired':
      return 'Conflict Expired';
    default:
      return status;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleTimeString('en-ZA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function isReviewEligible(booking: BookingRecord): boolean {
  if (booking.status !== 'completed') return false;
  if (!booking.completedAt) return false;

  const completedMs = new Date(booking.completedAt).getTime();
  const nowMs = Date.now();
  const daysSinceCompletion = (nowMs - completedMs) / (1000 * 60 * 60 * 24);

  return daysSinceCompletion <= 30;
}

function isLateCancellation(booking: BookingRecord): boolean {
  const startsAtMs = new Date(booking.startsAt).getTime();
  const nowMs = Date.now();
  const twoHoursMs = 2 * 60 * 60 * 1000;
  return (startsAtMs - nowMs) <= twoHoursMs;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BookingEntry({
  booking,
  onCancel,
  onLaunchSession,
  onLeaveReview,
}: BookingEntryProps) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showCancelWarning, setShowCancelWarning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Countdown timer ──────────────────────────────────────────────────────

  useEffect(() => {
    // Initial check
    const now = new Date().toISOString();
    const seconds = getCountdownSeconds(booking, now);
    setCountdown(seconds);

    // Set up interval if countdown is active
    if (seconds !== null) {
      intervalRef.current = setInterval(() => {
        const currentNow = new Date().toISOString();
        const currentSeconds = getCountdownSeconds(booking, currentNow);
        setCountdown(currentSeconds);

        if (currentSeconds === null && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [booking]);

  // ─── Derived state ────────────────────────────────────────────────────────

  const now = new Date().toISOString();
  const inLaunchWindow = isBookingInLaunchWindow(booking, now);
  const canCancel =
    booking.status === 'pending_owner_confirmation' ||
    booking.status === 'confirmed';
  const canReview = isReviewEligible(booking);
  const pillStyle = getStatusPillStyle(booking.status);

  // ─── Cancel handler ───────────────────────────────────────────────────────

  const handleCancelClick = () => {
    if (canCancel && isLateCancellation(booking)) {
      setShowCancelWarning(true);
    } else {
      onCancel(booking.id);
    }
  };

  const handleConfirmCancel = () => {
    setShowCancelWarning(false);
    onCancel(booking.id);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className="panel"
      style={{
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Top row: resource info + status pill */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--ink)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {booking.listingId}
          </h3>
          <p
            style={{
              margin: '2px 0 0',
              fontSize: 12,
              color: 'var(--muted)',
            }}
          >
            Owner: {booking.ownerId}
          </p>
        </div>
        <span
          className="pill"
          style={{
            ...pillStyle,
            fontSize: 11,
            border: '1px solid',
            flexShrink: 0,
          }}
        >
          <span className="dot" style={{ background: 'currentColor' }}></span>
          {getStatusLabel(booking.status)}
        </span>
      </div>

      {/* Details row */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          fontSize: 12,
          color: 'var(--muted)',
        }}
      >
        <span>{formatDate(booking.startsAt)}</span>
        <span>
          {formatTime(booking.startsAt)} – {formatTime(booking.endsAt)}
        </span>
        <span>{booking.durationHours}h</span>
        <span style={{ fontWeight: 500, color: 'var(--ink)' }}>
          R{booking.estimatedCostZar.toFixed(2)}
        </span>
      </div>

      {/* Session Starting Soon countdown */}
      {countdown !== null && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 12,
            background: 'rgba(25,183,176,.08)',
            border: '1px solid rgba(25,183,176,.18)',
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--teal)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Session Starting Soon
          </span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--teal)',
              fontFamily: 'monospace',
            }}
          >
            {formatCountdown(countdown)}
          </span>
        </div>
      )}

      {/* Late cancellation warning */}
      {showCancelWarning && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            background: 'rgba(217,87,71,.06)',
            border: '1px solid rgba(217,87,71,.18)',
            fontSize: 12,
            color: 'var(--red)',
          }}
        >
          <p style={{ margin: '0 0 8px', fontWeight: 500 }}>
            Late cancellation warning: Cancelling within 2 hours of start time
            may incur a fee per platform policy.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn"
              onClick={handleConfirmCancel}
              style={{
                fontSize: 11,
                height: 28,
                padding: '0 12px',
                borderColor: 'rgba(217,87,71,.18)',
                background: 'rgba(217,87,71,.06)',
                color: 'var(--red)',
              }}
            >
              Confirm Cancel
            </button>
            <button
              className="btn"
              onClick={() => setShowCancelWarning(false)}
              style={{
                fontSize: 11,
                height: 28,
                padding: '0 12px',
                borderColor: 'var(--border)',
                background: 'rgba(255,255,255,.7)',
                color: 'var(--ink)',
              }}
            >
              Keep Booking
            </button>
          </div>
        </div>
      )}

      {/* Actions row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
        {inLaunchWindow && (
          <button
            className="btn"
            onClick={() => onLaunchSession(booking.id)}
            style={{ fontSize: 12, height: 32, padding: '0 14px' }}
          >
            Launch Session
          </button>
        )}

        {canCancel && !showCancelWarning && (
          <button
            className="btn"
            onClick={handleCancelClick}
            style={{
              fontSize: 12,
              height: 32,
              padding: '0 14px',
              borderColor: 'rgba(217,87,71,.18)',
              background: 'rgba(217,87,71,.06)',
              color: 'var(--red)',
            }}
          >
            Cancel
          </button>
        )}

        {canReview && (
          <button
            className="btn"
            onClick={() => onLeaveReview(booking.id)}
            style={{
              fontSize: 12,
              height: 32,
              padding: '0 14px',
              borderColor: 'var(--border)',
              background: 'rgba(255,255,255,.7)',
              color: 'var(--ink)',
            }}
          >
            Leave Review
          </button>
        )}
      </div>
    </div>
  );
}
