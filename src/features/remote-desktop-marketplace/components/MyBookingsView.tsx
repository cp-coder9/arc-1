// ─── Remote Desktop Marketplace — MyBookingsView ─────────────────────────────
//
// The My Bookings tab content — displays all consumer bookings grouped by
// status with filtering, sorting, and contextual actions per entry.

import { useState, useMemo } from 'react';
import { useBookings } from '../hooks/useBookings';
import { BOOKING_STATUS_GROUPS } from '../constants';
import type { BookingRecord } from '../types';
import BookingEntry from './BookingEntry';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MyBookingsViewProps {
  user: { role: string };
}

type StatusFilter = 'all' | 'upcoming' | 'pending' | 'active' | 'completed' | 'cancelled';
type SortOrder = 'newest' | 'oldest';

// ─── Component ────────────────────────────────────────────────────────────────

export default function MyBookingsView({ user: _user }: MyBookingsViewProps) {
  const { grouped, isLoading, error, cancelBooking, refresh } = useBookings();

  // ─── Filters ──────────────────────────────────────────────────────────────

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  // ─── Filter & sort logic ──────────────────────────────────────────────────

  const filterByDate = (bookings: BookingRecord[]): BookingRecord[] => {
    if (!dateFrom && !dateTo) return bookings;

    return bookings.filter((b) => {
      const bookingDate = new Date(b.startsAt).getTime();
      if (dateFrom) {
        const fromMs = new Date(dateFrom).getTime();
        if (bookingDate < fromMs) return false;
      }
      if (dateTo) {
        const toMs = new Date(dateTo).getTime() + 24 * 60 * 60 * 1000; // end of day
        if (bookingDate > toMs) return false;
      }
      return true;
    });
  };

  const applySortOrder = (bookings: BookingRecord[]): BookingRecord[] => {
    const sorted = [...bookings];
    if (sortOrder === 'newest') {
      sorted.sort(
        (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
      );
    } else {
      sorted.sort(
        (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
      );
    }
    return sorted;
  };

  // ─── Visible sections ─────────────────────────────────────────────────────

  const sections = useMemo(() => {
    const groupMap: Record<string, BookingRecord[]> = {
      upcoming: grouped.upcoming,
      pending: grouped.pending,
      active: grouped.active,
      completed: grouped.completed,
      cancelled: grouped.cancelled,
    };

    const sectionDefs = BOOKING_STATUS_GROUPS.map((sg) => {
      // Map BOOKING_STATUS_GROUPS label to our groupMap key
      const key = sg.label.toLowerCase() as keyof typeof groupMap;
      return {
        label: sg.label,
        key,
        bookings: groupMap[key] ?? [],
      };
    });

    // Apply status filter
    const filtered =
      statusFilter === 'all'
        ? sectionDefs
        : sectionDefs.filter((s) => s.key === statusFilter);

    // Apply date filter + sort to each section
    return filtered.map((section) => ({
      ...section,
      bookings: applySortOrder(filterByDate(section.bookings)),
    }));
  }, [grouped, statusFilter, dateFrom, dateTo, sortOrder]);

  const totalBookings = sections.reduce((sum, s) => sum + s.bookings.length, 0);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleCancel = async (bookingId: string) => {
    try {
      await cancelBooking(bookingId);
    } catch {
      // Error handled by hook
    }
  };

  const handleLaunchSession = (bookingId: string) => {
    // Navigate to session launch — placeholder for platform integration
    window.open(`/remote-desktop/session/${bookingId}`, '_blank');
  };

  const handleLeaveReview = (bookingId: string) => {
    // Navigate to review form — placeholder for platform integration
    window.location.hash = `review-${bookingId}`;
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Filters & Sort */}
      <section className="panel">
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
          }}
        >
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            style={{
              height: 36,
              borderRadius: 12,
              border: '1px solid var(--border)',
              padding: '0 10px',
              fontSize: 12,
              color: 'var(--ink)',
              background: 'rgba(255,255,255,.7)',
              cursor: 'pointer',
            }}
            aria-label="Filter by booking status"
          >
            <option value="all">All Statuses</option>
            <option value="upcoming">Upcoming</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Date range from */}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{
              height: 36,
              borderRadius: 12,
              border: '1px solid var(--border)',
              padding: '0 10px',
              fontSize: 12,
              color: 'var(--ink)',
              background: 'rgba(255,255,255,.7)',
            }}
            aria-label="Filter from date"
          />

          {/* Date range to */}
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{
              height: 36,
              borderRadius: 12,
              border: '1px solid var(--border)',
              padding: '0 10px',
              fontSize: 12,
              color: 'var(--ink)',
              background: 'rgba(255,255,255,.7)',
            }}
            aria-label="Filter to date"
          />

          {/* Sort */}
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            style={{
              height: 36,
              borderRadius: 12,
              border: '1px solid var(--border)',
              padding: '0 10px',
              fontSize: 12,
              color: 'var(--ink)',
              background: 'rgba(255,255,255,.7)',
              cursor: 'pointer',
            }}
            aria-label="Sort bookings"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>
      </section>

      {/* Stat cards */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--green)' }}>
            {grouped.upcoming.length}
          </div>
          <div className="stat-label">Upcoming</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--amber)' }}>
            {grouped.pending.length}
          </div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--teal)' }}>
            {grouped.active.length}
          </div>
          <div className="stat-label">Active</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--muted)' }}>
            {grouped.completed.length}
          </div>
          <div className="stat-label">Completed</div>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <section className="panel" style={{ textAlign: 'center', padding: 30 }}>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading bookings...</p>
        </section>
      )}

      {/* Error */}
      {error && (
        <section className="panel" style={{ textAlign: 'center', padding: 30 }}>
          <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>
            {error}
          </p>
          <button className="btn" onClick={refresh}>
            Retry
          </button>
        </section>
      )}

      {/* Empty state */}
      {!isLoading && !error && totalBookings === 0 && (
        <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>
            No bookings found matching your filters.
          </p>
          <a
            href="/remote-desktop/marketplace"
            style={{
              color: 'var(--teal)',
              fontSize: 13,
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Browse the catalogue →
          </a>
        </section>
      )}

      {/* Grouped sections */}
      {!isLoading &&
        !error &&
        sections.map(
          (section) =>
            section.bookings.length > 0 && (
              <section key={section.key} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Section header with count */}
                <h2
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    margin: 0,
                    padding: '0 4px',
                  }}
                >
                  {section.label}{' '}
                  <span
                    style={{
                      fontWeight: 400,
                      fontSize: 11,
                      color: 'var(--muted)',
                    }}
                  >
                    ({section.bookings.length})
                  </span>
                </h2>

                {/* Booking entries */}
                {section.bookings.map((booking) => (
                  <BookingEntry
                    key={booking.id}
                    booking={booking}
                    onCancel={handleCancel}
                    onLaunchSession={handleLaunchSession}
                    onLeaveReview={handleLeaveReview}
                  />
                ))}
              </section>
            )
        )}
    </div>
  );
}
