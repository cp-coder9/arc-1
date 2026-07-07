// ─── Remote Desktop Marketplace — Booking Service ─────────────────────────────
//
// Pure business logic for the booking request lifecycle:
// creation, confirmation, decline, cancellation, expiry, grouping, and session timing.
// No Firebase imports — all functions operate on data passed as parameters.

import type {
  BookingRecord,
  CreateBookingRequest,
  MarketplaceApiError,
  ResourceListing,
} from '../types';

// ─── Grouped Bookings Interface ───────────────────────────────────────────────

export interface GroupedBookings {
  upcoming: BookingRecord[];
  pending: BookingRecord[];
  active: BookingRecord[];
  completed: BookingRecord[];
  cancelled: BookingRecord[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** 24 hours in milliseconds */
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/** 2 hours in milliseconds */
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/** 15 minutes in milliseconds */
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

// ─── Booking Conflict Detection (helper) ──────────────────────────────────────

/**
 * Checks whether a proposed booking time range overlaps with any existing
 * active bookings (confirmed, active, or pending_owner_confirmation).
 * Similar to the existing `findResourceBookingConflicts` pattern.
 */
function hasBookingConflict(
  startsAt: string,
  endsAt: string,
  existingBookings: BookingRecord[]
): boolean {
  const proposedStart = new Date(startsAt).getTime();
  const proposedEnd = new Date(endsAt).getTime();

  return existingBookings.some((booking) => {
    // Only consider bookings that occupy time slots
    if (
      booking.status !== 'confirmed' &&
      booking.status !== 'active' &&
      booking.status !== 'pending_owner_confirmation'
    ) {
      return false;
    }

    const existingStart = new Date(booking.startsAt).getTime();
    const existingEnd = new Date(booking.endsAt).getTime();

    // Overlap: proposedStart < existingEnd && proposedEnd > existingStart
    return proposedStart < existingEnd && proposedEnd > existingStart;
  });
}

// ─── Create Booking ───────────────────────────────────────────────────────────

/**
 * Validates and creates a new booking record.
 * Rejects if:
 * (a) time conflicts with existing bookings
 * (b) duration < minBookingHours or > maxBookingHours
 * (c) consumer not verified
 */
export function createBooking(
  request: CreateBookingRequest,
  consumerId: string,
  listing: ResourceListing,
  existingBookings: BookingRecord[],
  isConsumerVerified: boolean
): { booking: BookingRecord } | { error: MarketplaceApiError } {
  // Validation (c): Consumer must be verified
  if (!isConsumerVerified) {
    return {
      error: {
        code: 'BOOKING_CONSUMER_UNVERIFIED',
        message:
          'You must have a verified platform account to submit booking requests.',
        field: 'consumer',
      },
    };
  }

  // Validate duration
  const startsAtMs = new Date(request.startsAt).getTime();
  const endsAtMs = new Date(request.endsAt).getTime();
  const durationHours = (endsAtMs - startsAtMs) / (1000 * 60 * 60);

  // Validation (b): Duration bounds
  if (durationHours < listing.minBookingHours) {
    return {
      error: {
        code: 'BOOKING_DURATION_INVALID',
        message: `Booking duration must be at least ${listing.minBookingHours} hour(s).`,
        field: 'duration',
        details: {
          minimum: listing.minBookingHours,
          maximum: listing.maxBookingHours,
          requested: durationHours,
        },
      },
    };
  }

  if (durationHours > listing.maxBookingHours) {
    return {
      error: {
        code: 'BOOKING_DURATION_INVALID',
        message: `Booking duration must not exceed ${listing.maxBookingHours} hour(s).`,
        field: 'duration',
        details: {
          minimum: listing.minBookingHours,
          maximum: listing.maxBookingHours,
          requested: durationHours,
        },
      },
    };
  }

  // Validation (a): Conflict detection
  if (hasBookingConflict(request.startsAt, request.endsAt, existingBookings)) {
    return {
      error: {
        code: 'BOOKING_CONFLICT',
        message:
          'The selected time slot conflicts with an existing booking.',
        field: 'startsAt',
        details: {
          startsAt: request.startsAt,
          endsAt: request.endsAt,
        },
      },
    };
  }

  // All validations passed — create booking record
  const now = new Date().toISOString();
  const estimatedCost = calculateEstimatedCost(
    listing.hourlyRateZar,
    durationHours
  );

  const booking: BookingRecord = {
    id: generateBookingId(),
    listingId: request.listingId,
    resourceId: listing.resourceId,
    consumerId,
    ownerId: listing.ownerId,
    startsAt: request.startsAt,
    endsAt: request.endsAt,
    durationHours,
    intendedSoftware: request.intendedSoftware,
    projectReference: request.projectReference,
    messageToOwner: request.messageToOwner,
    status: 'pending_owner_confirmation',
    estimatedCostZar: estimatedCost,
    createdAt: now,
    expiresAt: new Date(
      new Date(now).getTime() + TWENTY_FOUR_HOURS_MS
    ).toISOString(),
  };

  return { booking };
}

// ─── Confirm Booking ──────────────────────────────────────────────────────────

/**
 * Owner confirms a booking with re-validation of conflicts.
 * If conflict exists at confirmation time → status='conflict_expired'.
 * Otherwise → status='confirmed'.
 */
export function confirmBooking(
  bookingId: string,
  ownerId: string,
  bookings: BookingRecord[],
  existingBookings: BookingRecord[]
): { booking: BookingRecord } | { error: MarketplaceApiError } {
  const booking = bookings.find((b) => b.id === bookingId);

  if (!booking) {
    return {
      error: {
        code: 'LISTING_NOT_FOUND',
        message: 'Booking not found.',
        field: 'bookingId',
      },
    };
  }

  if (booking.ownerId !== ownerId) {
    return {
      error: {
        code: 'UNAUTHORIZED',
        message: 'You are not the owner of this resource.',
      },
    };
  }

  if (booking.status !== 'pending_owner_confirmation') {
    return {
      error: {
        code: 'BOOKING_ALREADY_CONFIRMED',
        message: `Booking cannot be confirmed — current status is "${booking.status}".`,
        details: { currentStatus: booking.status },
      },
    };
  }

  // Re-validate conflicts at confirmation time
  // Filter out the current booking from existingBookings to avoid self-conflict
  const otherBookings = existingBookings.filter((b) => b.id !== bookingId);
  const hasConflict = hasBookingConflict(
    booking.startsAt,
    booking.endsAt,
    otherBookings
  );

  if (hasConflict) {
    const conflictExpiredBooking: BookingRecord = {
      ...booking,
      status: 'conflict_expired',
    };
    return { booking: conflictExpiredBooking };
  }

  const confirmedBooking: BookingRecord = {
    ...booking,
    status: 'confirmed',
    confirmedAt: new Date().toISOString(),
  };

  return { booking: confirmedBooking };
}

// ─── Decline Booking ──────────────────────────────────────────────────────────

/**
 * Owner declines a booking with an optional reason.
 */
export function declineBooking(
  bookingId: string,
  ownerId: string,
  bookings: BookingRecord[],
  reason?: string
): { booking: BookingRecord } | { error: MarketplaceApiError } {
  const booking = bookings.find((b) => b.id === bookingId);

  if (!booking) {
    return {
      error: {
        code: 'LISTING_NOT_FOUND',
        message: 'Booking not found.',
        field: 'bookingId',
      },
    };
  }

  if (booking.ownerId !== ownerId) {
    return {
      error: {
        code: 'UNAUTHORIZED',
        message: 'You are not the owner of this resource.',
      },
    };
  }

  if (booking.status !== 'pending_owner_confirmation') {
    return {
      error: {
        code: 'BOOKING_ALREADY_CONFIRMED',
        message: `Booking cannot be declined — current status is "${booking.status}".`,
        details: { currentStatus: booking.status },
      },
    };
  }

  const declinedBooking: BookingRecord = {
    ...booking,
    status: 'declined',
    ownerDeclineReason: reason,
  };

  return { booking: declinedBooking };
}

// ─── Cancel Booking ───────────────────────────────────────────────────────────

/**
 * Consumer cancels a booking.
 * If (startsAt - now) > 2 hours → cancel without penalty.
 * If ≤ 2 hours → return requiresWarning=true (caller must confirm before proceeding).
 */
export function cancelBooking(
  bookingId: string,
  consumerId: string,
  bookings: BookingRecord[]
): { booking: BookingRecord; requiresWarning: boolean } | { error: MarketplaceApiError } {
  const booking = bookings.find((b) => b.id === bookingId);

  if (!booking) {
    return {
      error: {
        code: 'LISTING_NOT_FOUND',
        message: 'Booking not found.',
        field: 'bookingId',
      },
    };
  }

  if (booking.consumerId !== consumerId) {
    return {
      error: {
        code: 'UNAUTHORIZED',
        message: 'You are not the consumer of this booking.',
      },
    };
  }

  // Can only cancel pending or confirmed bookings
  if (
    booking.status !== 'pending_owner_confirmation' &&
    booking.status !== 'confirmed'
  ) {
    return {
      error: {
        code: 'BOOKING_ALREADY_CONFIRMED',
        message: `Booking cannot be cancelled — current status is "${booking.status}".`,
        details: { currentStatus: booking.status },
      },
    };
  }

  const now = Date.now();
  const startsAtMs = new Date(booking.startsAt).getTime();
  const timeUntilStart = startsAtMs - now;

  // Late cancellation warning if within 2 hours
  const requiresWarning = timeUntilStart <= TWO_HOURS_MS;

  const cancelledBooking: BookingRecord = {
    ...booking,
    status: 'cancelled_by_consumer',
    cancelledAt: new Date().toISOString(),
  };

  return { booking: cancelledBooking, requiresWarning };
}

// ─── Get Consumer Bookings (grouped) ──────────────────────────────────────────

/**
 * Groups a consumer's bookings by status section:
 * - Upcoming: status='confirmed' AND startsAt in the future
 * - Pending: status='pending_owner_confirmation'
 * - Active: status='active'
 * - Completed: status='completed'
 * - Cancelled: status in ['cancelled_by_consumer', 'declined', 'expired', 'conflict_expired']
 *
 * Within each group:
 * - Upcoming/Pending/Active: sorted by startsAt nearest-first
 * - Completed/Cancelled: sorted by startsAt most-recent-first
 */
export function getConsumerBookings(
  consumerId: string,
  bookings: BookingRecord[]
): GroupedBookings {
  const consumerBookings = bookings.filter((b) => b.consumerId === consumerId);
  const now = Date.now();

  const upcoming: BookingRecord[] = [];
  const pending: BookingRecord[] = [];
  const active: BookingRecord[] = [];
  const completed: BookingRecord[] = [];
  const cancelled: BookingRecord[] = [];

  for (const booking of consumerBookings) {
    switch (booking.status) {
      case 'confirmed': {
        const startsAtMs = new Date(booking.startsAt).getTime();
        if (startsAtMs > now) {
          upcoming.push(booking);
        } else {
          // Confirmed but started — treat as upcoming still
          upcoming.push(booking);
        }
        break;
      }
      case 'pending_owner_confirmation':
        pending.push(booking);
        break;
      case 'active':
        active.push(booking);
        break;
      case 'completed':
        completed.push(booking);
        break;
      case 'cancelled_by_consumer':
      case 'declined':
      case 'expired':
      case 'conflict_expired':
        cancelled.push(booking);
        break;
    }
  }

  // Sort Upcoming/Pending/Active: nearest-first (ascending startsAt)
  const sortNearestFirst = (a: BookingRecord, b: BookingRecord) =>
    new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();

  // Sort Completed/Cancelled: most-recent-first (descending startsAt)
  const sortMostRecentFirst = (a: BookingRecord, b: BookingRecord) =>
    new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime();

  upcoming.sort(sortNearestFirst);
  pending.sort(sortNearestFirst);
  active.sort(sortNearestFirst);
  completed.sort(sortMostRecentFirst);
  cancelled.sort(sortMostRecentFirst);

  return { upcoming, pending, active, completed, cancelled };
}

// ─── Get Incoming Bookings (for owner) ────────────────────────────────────────

/**
 * Returns pending bookings for an owner (pending_owner_confirmation).
 */
export function getIncomingBookings(
  ownerId: string,
  bookings: BookingRecord[]
): BookingRecord[] {
  return bookings
    .filter(
      (b) =>
        b.ownerId === ownerId && b.status === 'pending_owner_confirmation'
    )
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
}

// ─── Expire Stale Bookings ────────────────────────────────────────────────────

/**
 * Marks pending bookings older than 24 hours as expired.
 * Returns only the bookings that were transitioned to expired.
 */
export function expireStaleBookings(
  bookings: BookingRecord[],
  now: string
): BookingRecord[] {
  const nowMs = new Date(now).getTime();

  return bookings
    .filter((b) => b.status === 'pending_owner_confirmation')
    .filter((b) => nowMs - new Date(b.createdAt).getTime() > TWENTY_FOUR_HOURS_MS)
    .map((b) => ({
      ...b,
      status: 'expired' as const,
    }));
}

// ─── Calculate Estimated Cost ─────────────────────────────────────────────────

/**
 * Calculates estimated cost: hourlyRate × durationHours.
 */
export function calculateEstimatedCost(
  hourlyRate: number,
  durationHours: number
): number {
  return hourlyRate * durationHours;
}

// ─── Launch Window Check ──────────────────────────────────────────────────────

/**
 * Returns true if the booking is confirmed and the current time is
 * within 15 minutes before the session start to the end of the session.
 * i.e., (startsAt - 15min) ≤ now ≤ endsAt
 */
export function isBookingInLaunchWindow(
  booking: BookingRecord,
  now: string
): boolean {
  if (booking.status !== 'confirmed') {
    return false;
  }

  const nowMs = new Date(now).getTime();
  const startsAtMs = new Date(booking.startsAt).getTime();
  const endsAtMs = new Date(booking.endsAt).getTime();

  const windowStart = startsAtMs - FIFTEEN_MINUTES_MS;

  return nowMs >= windowStart && nowMs <= endsAtMs;
}

// ─── Countdown Seconds ────────────────────────────────────────────────────────

/**
 * Returns seconds until session starts if within the 15-minute window.
 * Only returns a value if 0 < (startsAt - now) ≤ 15 minutes.
 * Returns null otherwise.
 */
export function getCountdownSeconds(
  booking: BookingRecord,
  now: string
): number | null {
  if (booking.status !== 'confirmed') {
    return null;
  }

  const nowMs = new Date(now).getTime();
  const startsAtMs = new Date(booking.startsAt).getTime();

  const diffMs = startsAtMs - nowMs;

  // Only return countdown if within 0 to 15 minutes before start
  if (diffMs > 0 && diffMs <= FIFTEEN_MINUTES_MS) {
    return Math.ceil(diffMs / 1000);
  }

  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generates a simple unique booking ID */
function generateBookingId(): string {
  return `bk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
