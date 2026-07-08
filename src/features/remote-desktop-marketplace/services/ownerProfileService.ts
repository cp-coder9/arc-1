// ─── Remote Desktop Marketplace — Owner Profile Service ──────────────────────
//
// Pure business logic for owner profile retrieval, trust indicator calculation,
// and owner listing queries. All functions operate on data passed as parameters.
// No Firebase imports — persistence is wired at the API routes layer.

import type {
  OwnerProfile,
  BookingRecord,
  ReviewRecord,
  ResourceListing,
} from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const TRUST_WINDOW_DAYS = 90;
const NEW_OWNER_THRESHOLD = 5;
const MAX_OWNER_LISTINGS = 50;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrustIndicators {
  isNewOwner: boolean;
  avgResponseTimeHours: number | null;
  bookingAcceptanceRate: number | null;
  sessionCompletionRate: number | null;
  aggregateRating: number | null;
  totalCompletedSessions: number;
}

// ─── Get Owner Profile ────────────────────────────────────────────────────────

/**
 * Returns the owner profile or null if not found.
 * Privacy enforcement: only returns data defined in OwnerProfile interface.
 * Never exposes email, phone, or address.
 */
export function getOwnerProfile(
  ownerUid: string,
  profile: OwnerProfile | null
): OwnerProfile | null {
  if (!profile) {
    return null;
  }

  // Ensure the profile matches the requested ownerUid
  if (profile.ownerUid !== ownerUid) {
    return null;
  }

  // Return only the OwnerProfile interface fields — no extra data leaks
  return {
    ownerUid: profile.ownerUid,
    firmName: profile.firmName,
    profileImageUrl: profile.profileImageUrl,
    description: profile.description,
    memberSince: profile.memberSince,
    isIdentityVerified: profile.isIdentityVerified,
    avgResponseTimeHours: profile.avgResponseTimeHours,
    bookingAcceptanceRate: profile.bookingAcceptanceRate,
    sessionCompletionRate: profile.sessionCompletionRate,
    aggregateRating: profile.aggregateRating,
    totalCompletedSessions: profile.totalCompletedSessions,
    isNewOwner: profile.isNewOwner,
    updatedAt: profile.updatedAt,
  };
}

// ─── Calculate Trust Indicators ───────────────────────────────────────────────

/**
 * Calculates trust indicator metrics from a 90-day rolling window.
 *
 * Logic:
 * 1. Filter bookings to those created within the last 90 days where ownerId matches
 * 2. If completedSessions < 5 → isNewOwner=true, all metrics null
 * 3. Otherwise:
 *    - avgResponseTimeHours: for confirmed bookings, avg(confirmedAt - createdAt) in hours, rounded to 1 decimal
 *    - bookingAcceptanceRate: (confirmed count / total received) × 100, rounded to nearest integer
 *    - sessionCompletionRate: (completed count / confirmed count) × 100, rounded to nearest integer
 *    - aggregateRating: arithmetic mean of all review ratings for the owner in the window, 1 decimal
 */
export function calculateTrustIndicators(
  ownerUid: string,
  bookings: BookingRecord[],
  reviews: ReviewRecord[],
  now: string
): TrustIndicators {
  const nowDate = new Date(now);
  const windowStart = new Date(nowDate.getTime() - TRUST_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Filter bookings within 90-day window where ownerId matches
  const windowBookings = bookings.filter((b) => {
    if (b.ownerId !== ownerUid) return false;
    const createdAt = new Date(b.createdAt);
    return createdAt >= windowStart && createdAt <= nowDate;
  });

  // Count completed sessions in the window
  const completedBookings = windowBookings.filter((b) => b.status === 'completed');
  const totalCompletedSessions = completedBookings.length;

  // New owner check: fewer than 5 completed sessions
  if (totalCompletedSessions < NEW_OWNER_THRESHOLD) {
    return {
      isNewOwner: true,
      avgResponseTimeHours: null,
      bookingAcceptanceRate: null,
      sessionCompletionRate: null,
      aggregateRating: null,
      totalCompletedSessions,
    };
  }

  // Calculate avg response time for confirmed bookings
  const confirmedBookings = windowBookings.filter(
    (b) => b.status === 'confirmed' || b.status === 'completed' || b.status === 'active'
  );
  const confirmedWithResponseTime = confirmedBookings.filter(
    (b) => b.confirmedAt !== undefined && b.confirmedAt !== null
  );

  let avgResponseTimeHours: number | null = null;
  if (confirmedWithResponseTime.length > 0) {
    const totalHours = confirmedWithResponseTime.reduce((sum, b) => {
      const created = new Date(b.createdAt).getTime();
      const confirmed = new Date(b.confirmedAt!).getTime();
      const hours = (confirmed - created) / (1000 * 60 * 60);
      return sum + hours;
    }, 0);
    avgResponseTimeHours = Math.round((totalHours / confirmedWithResponseTime.length) * 10) / 10;
  }

  // Booking acceptance rate: confirmed count / total received × 100
  const totalReceived = windowBookings.length;
  const confirmedCount = confirmedBookings.length;
  const bookingAcceptanceRate = totalReceived > 0
    ? Math.round((confirmedCount / totalReceived) * 100)
    : null;

  // Session completion rate: completed count / confirmed count × 100
  const sessionCompletionRate = confirmedCount > 0
    ? Math.round((totalCompletedSessions / confirmedCount) * 100)
    : null;

  // Aggregate rating from reviews in the window
  const windowReviews = reviews.filter((r) => {
    if (r.ownerId !== ownerUid) return false;
    const createdAt = new Date(r.createdAt);
    return createdAt >= windowStart && createdAt <= nowDate;
  });

  let aggregateRating: number | null = null;
  if (windowReviews.length > 0) {
    const ratingSum = windowReviews.reduce((sum, r) => sum + r.rating, 0);
    aggregateRating = Math.round((ratingSum / windowReviews.length) * 10) / 10;
  }

  return {
    isNewOwner: false,
    avgResponseTimeHours,
    bookingAcceptanceRate,
    sessionCompletionRate,
    aggregateRating,
    totalCompletedSessions,
  };
}

// ─── Get Owner Listings ───────────────────────────────────────────────────────

/**
 * Returns active resource listings for a given owner, capped at 50.
 * Only returns listings with status='active'.
 */
export function getOwnerListings(
  ownerId: string,
  listings: ResourceListing[]
): ResourceListing[] {
  const ownerListings = listings.filter(
    (l) => l.ownerId === ownerId && l.status === 'active'
  );

  // Cap at MAX_OWNER_LISTINGS (50)
  return ownerListings.slice(0, MAX_OWNER_LISTINGS);
}
