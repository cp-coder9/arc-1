// ─── Remote Desktop Marketplace — Analytics Service ──────────────────────────
//
// Pure business logic for marketplace KPI calculations and analytics.
// No Firebase imports — persistence is wired at the API routes layer.
//
// KPI definitions (Property 30):
// - Marketplace utilisation = total booked hours / total available hours
// - Average satisfaction = arithmetic mean of all marketplace ratings
// - Booking lead time = mean of (startsAt - createdAt) for confirmed bookings, in hours

import type {
  BookingRecord,
  ReviewRecord,
  ResourceListing,
} from '../types';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface TopResource {
  listingId: string;
  name: string;
  totalRevenue: number;
  averageRating: number | null;
  totalBookings: number;
}

// ─── Marketplace Utilisation ──────────────────────────────────────────────────

/**
 * Calculates marketplace utilisation: total booked hours / total available hours.
 *
 * Only confirmed, active, and completed bookings count toward booked hours.
 * Returns 0 if totalAvailableHours is 0 or no bookings exist.
 */
export function calculateMarketplaceUtilisation(
  bookings: BookingRecord[],
  totalAvailableHours: number
): number {
  if (totalAvailableHours <= 0) {
    return 0;
  }

  const countedStatuses = new Set([
    'confirmed',
    'active',
    'completed',
  ]);

  const totalBookedHours = bookings
    .filter((b) => countedStatuses.has(b.status))
    .reduce((sum, b) => sum + b.durationHours, 0);

  return totalBookedHours / totalAvailableHours;
}

// ─── Average Booking Lead Time ────────────────────────────────────────────────

/**
 * Calculates the average booking lead time for confirmed bookings.
 * Lead time = (startsAt - createdAt) for each confirmed booking, in hours.
 *
 * Only bookings with status 'confirmed', 'active', or 'completed' are included
 * (they were confirmed at some point).
 *
 * Returns null if no eligible bookings exist.
 */
export function calculateAverageBookingLeadTime(
  bookings: BookingRecord[]
): number | null {
  const confirmedStatuses = new Set([
    'confirmed',
    'active',
    'completed',
  ]);

  const eligibleBookings = bookings.filter((b) =>
    confirmedStatuses.has(b.status)
  );

  if (eligibleBookings.length === 0) {
    return null;
  }

  const totalLeadTimeMs = eligibleBookings.reduce((sum, b) => {
    const startsAt = new Date(b.startsAt).getTime();
    const createdAt = new Date(b.createdAt).getTime();
    return sum + (startsAt - createdAt);
  }, 0);

  const averageMs = totalLeadTimeMs / eligibleBookings.length;
  const averageHours = averageMs / (1000 * 60 * 60);

  return averageHours;
}

// ─── Consumer Satisfaction ────────────────────────────────────────────────────

/**
 * Calculates consumer satisfaction: arithmetic mean of all review ratings.
 * Returns null if no reviews exist.
 */
export function calculateConsumerSatisfaction(
  reviews: ReviewRecord[]
): number | null {
  if (reviews.length === 0) {
    return null;
  }

  const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
  return sum / reviews.length;
}

// ─── Top Performing Resources ─────────────────────────────────────────────────

/**
 * Returns the top performing resources ranked by total revenue (descending),
 * with secondary sort by average rating (descending).
 *
 * Revenue is calculated from confirmed/active/completed bookings:
 * estimatedCostZar summed per listing.
 *
 * @param listings - All resource listings to consider
 * @param bookings - All bookings to calculate revenue from
 * @param reviews - All reviews to calculate average ratings from
 * @param limit - Maximum number of results to return
 */
export function getTopPerformingResources(
  listings: ResourceListing[],
  bookings: BookingRecord[],
  reviews: ReviewRecord[],
  limit: number
): TopResource[] {
  const revenueStatuses = new Set([
    'confirmed',
    'active',
    'completed',
  ]);

  const results: TopResource[] = listings.map((listing) => {
    // Calculate total revenue from eligible bookings
    const listingBookings = bookings.filter(
      (b) => b.listingId === listing.id && revenueStatuses.has(b.status)
    );
    const totalRevenue = listingBookings.reduce(
      (sum, b) => sum + b.estimatedCostZar,
      0
    );

    // Calculate average rating from reviews
    const listingReviews = reviews.filter((r) => r.listingId === listing.id);
    let averageRating: number | null = null;
    if (listingReviews.length > 0) {
      const ratingSum = listingReviews.reduce((acc, r) => acc + r.rating, 0);
      averageRating = ratingSum / listingReviews.length;
    }

    return {
      listingId: listing.id,
      name: listing.name,
      totalRevenue,
      averageRating,
      totalBookings: listingBookings.length,
    };
  });

  // Sort by revenue descending, then by average rating descending (nulls last)
  results.sort((a, b) => {
    if (b.totalRevenue !== a.totalRevenue) {
      return b.totalRevenue - a.totalRevenue;
    }
    // Secondary sort by average rating descending (nulls last)
    const ratingA = a.averageRating ?? -1;
    const ratingB = b.averageRating ?? -1;
    return ratingB - ratingA;
  });

  return results.slice(0, Math.max(limit, 0));
}
