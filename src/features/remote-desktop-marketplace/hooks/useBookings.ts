import { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/apiClient';
import type { BookingRecord, CreateBookingRequest } from '../types';
import type { GroupedBookings } from '../services/bookingService';

// ─── Hook Return Interface ────────────────────────────────────────────────────

export interface UseBookingsReturn {
  grouped: GroupedBookings;
  isLoading: boolean;
  error: string | null;
  submitBooking: (request: CreateBookingRequest) => Promise<void>;
  cancelBooking: (bookingId: string) => Promise<{ requiresWarning: boolean }>;
  refresh: () => void;
}

// ─── Default Empty State ──────────────────────────────────────────────────────

const EMPTY_GROUPED: GroupedBookings = {
  upcoming: [],
  pending: [],
  active: [],
  completed: [],
  cancelled: [],
};

// ─── Helper: Group bookings by status ─────────────────────────────────────────

function groupBookings(bookings: BookingRecord[]): GroupedBookings {
  const now = Date.now();

  const grouped: GroupedBookings = {
    upcoming: [],
    pending: [],
    active: [],
    completed: [],
    cancelled: [],
  };

  for (const booking of bookings) {
    switch (booking.status) {
      case 'confirmed': {
        const startTime = new Date(booking.startsAt).getTime();
        const endTime = new Date(booking.endsAt).getTime();
        if (now >= startTime && now <= endTime) {
          grouped.active.push(booking);
        } else if (startTime > now) {
          grouped.upcoming.push(booking);
        } else {
          grouped.completed.push(booking);
        }
        break;
      }
      case 'pending_owner_confirmation':
        grouped.pending.push(booking);
        break;
      case 'active':
        grouped.active.push(booking);
        break;
      case 'completed':
        grouped.completed.push(booking);
        break;
      case 'cancelled_by_consumer':
      case 'declined':
      case 'expired':
      case 'conflict_expired':
        grouped.cancelled.push(booking);
        break;
    }
  }

  // Sort: upcoming/pending/active by startsAt ascending (nearest first)
  const sortAsc = (a: BookingRecord, b: BookingRecord) =>
    new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();

  // Sort: completed/cancelled by startsAt descending (most recent first)
  const sortDesc = (a: BookingRecord, b: BookingRecord) =>
    new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime();

  grouped.upcoming.sort(sortAsc);
  grouped.pending.sort(sortAsc);
  grouped.active.sort(sortAsc);
  grouped.completed.sort(sortDesc);
  grouped.cancelled.sort(sortDesc);

  return grouped;
}

// ─── Hook Implementation ──────────────────────────────────────────────────────

export function useBookings(): UseBookingsReturn {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Abort controller for in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // ─── Fetch Bookings ──────────────────────────────────────────────────────────

  const fetchBookings = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiFetch('/api/remote-desktop-marketplace/bookings', {
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.message || `Failed to load bookings (${response.status})`
        );
      }

      const data: BookingRecord[] = await response.json();
      setBookings(data);
      setError(null);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load bookings');
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
      }
    }
  }, []);

  // ─── Effect: Fetch on mount ──────────────────────────────────────────────────

  useEffect(() => {
    fetchBookings();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchBookings]);

  // ─── Submit Booking ──────────────────────────────────────────────────────────

  const submitBooking = useCallback(
    async (request: CreateBookingRequest): Promise<void> => {
      const response = await apiFetch('/api/remote-desktop-marketplace/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.message || `Booking submission failed (${response.status})`
        );
      }

      // Refresh bookings list to show the new pending booking
      await fetchBookings();
    },
    [fetchBookings]
  );

  // ─── Cancel Booking ──────────────────────────────────────────────────────────

  const cancelBooking = useCallback(
    async (bookingId: string): Promise<{ requiresWarning: boolean }> => {
      const response = await apiFetch(
        `/api/remote-desktop-marketplace/bookings/${bookingId}/cancel`,
        { method: 'PATCH' }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.message || `Cancellation failed (${response.status})`
        );
      }

      const result = await response.json();

      // Refresh bookings list
      await fetchBookings();

      return { requiresWarning: result.requiresWarning ?? false };
    },
    [fetchBookings]
  );

  // ─── Refresh ─────────────────────────────────────────────────────────────────

  const refresh = useCallback(() => {
    fetchBookings();
  }, [fetchBookings]);

  // ─── Computed grouped bookings ───────────────────────────────────────────────

  const grouped: GroupedBookings = bookings.length > 0
    ? groupBookings(bookings)
    : EMPTY_GROUPED;

  return {
    grouped,
    isLoading,
    error,
    submitBooking,
    cancelBooking,
    refresh,
  };
}
