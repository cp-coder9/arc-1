// ─── Remote Desktop Marketplace — Listing Management Service ──────────────────
//
// Pure business logic for owner listing operations:
// validation, publishing, updating, pausing, activating, and analytics.
// No Firebase imports — all functions operate on data passed as parameters.

import type {
  BookingRecord,
  MarketplaceApiError,
  ResourceListing,
  ReviewRecord,
} from '../types';

import { SOFTWARE_CATEGORIES } from '../constants';

// ─── Listing Analytics Interface ──────────────────────────────────────────────

export interface ListingAnalytics {
  totalViews: number;
  totalBookings: number;
  bookingConversionRate: number; // bookings / views, 0-1
  averageRating: number | null;
  monthlyRevenueZar: number; // current calendar month
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates listing data against publication requirements.
 * Returns a list of field-level error messages.
 *
 * Rules:
 * - name: 1–100 characters, non-empty
 * - softwareCategories: 1–5 items from SOFTWARE_CATEGORIES constant
 * - hourlyRateZar: R50–R5000 (50 ≤ x ≤ 5000)
 * - minBookingHours: 1–8
 * - maxBookingHours: 1–24
 * - minBookingHours ≤ maxBookingHours
 */
export function validateListingData(
  data: Partial<ResourceListing>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Name validation
  if (!data.name || data.name.trim().length === 0) {
    errors.push('Resource name is required.');
  } else if (data.name.length > 100) {
    errors.push('Resource name must not exceed 100 characters.');
  }

  // Software categories validation
  if (
    !data.softwareCategories ||
    !Array.isArray(data.softwareCategories) ||
    data.softwareCategories.length === 0
  ) {
    errors.push('At least one software category is required.');
  } else if (data.softwareCategories.length > 5) {
    errors.push('A maximum of 5 software categories may be assigned.');
  } else {
    const validCategories = SOFTWARE_CATEGORIES as readonly string[];
    const invalidCategories = data.softwareCategories.filter(
      (cat) => !validCategories.includes(cat)
    );
    if (invalidCategories.length > 0) {
      errors.push(
        `Invalid software categories: ${invalidCategories.join(', ')}.`
      );
    }
  }

  // Hourly rate validation
  if (data.hourlyRateZar === undefined || data.hourlyRateZar === null) {
    errors.push('Hourly rate is required.');
  } else if (data.hourlyRateZar < 50) {
    errors.push('Hourly rate must be at least R50.');
  } else if (data.hourlyRateZar > 5000) {
    errors.push('Hourly rate must not exceed R5000.');
  }

  // Min booking hours validation
  if (data.minBookingHours === undefined || data.minBookingHours === null) {
    errors.push('Minimum booking hours is required.');
  } else if (data.minBookingHours < 1 || data.minBookingHours > 8) {
    errors.push('Minimum booking hours must be between 1 and 8.');
  }

  // Max booking hours validation
  if (data.maxBookingHours === undefined || data.maxBookingHours === null) {
    errors.push('Maximum booking hours is required.');
  } else if (data.maxBookingHours < 1 || data.maxBookingHours > 24) {
    errors.push('Maximum booking hours must be between 1 and 24.');
  }

  // Cross-field: min ≤ max
  if (
    data.minBookingHours !== undefined &&
    data.minBookingHours !== null &&
    data.maxBookingHours !== undefined &&
    data.maxBookingHours !== null &&
    data.minBookingHours >= 1 &&
    data.minBookingHours <= 8 &&
    data.maxBookingHours >= 1 &&
    data.maxBookingHours <= 24 &&
    data.minBookingHours > data.maxBookingHours
  ) {
    errors.push(
      'Minimum booking hours must be less than or equal to maximum booking hours.'
    );
  }

  return { valid: errors.length === 0, errors };
}

// ─── Publish Listing ──────────────────────────────────────────────────────────

/**
 * Validates and creates a new listing for an owner.
 * If validation fails, rejects with LISTING_VALIDATION_FAILED error code
 * and the listing remains in draft status.
 */
export function publishListing(
  ownerId: string,
  data: Partial<ResourceListing>,
  existingListings: ResourceListing[]
): { listing: ResourceListing } | { error: MarketplaceApiError } {
  const validation = validateListingData(data);

  if (!validation.valid) {
    return {
      error: {
        code: 'LISTING_VALIDATION_FAILED',
        message: 'Listing validation failed. Please correct the issues and try again.',
        details: { errors: validation.errors },
      },
    };
  }

  const now = new Date().toISOString();

  const listing: ResourceListing = {
    id: generateListingId(),
    ownerId,
    ownerFirmName: data.ownerFirmName || '',
    resourceId: data.resourceId || '',
    name: data.name!,
    description: data.description || '',
    softwareCategories: data.softwareCategories!,
    softwareApplications: data.softwareApplications || [],
    hardwareSpecs: data.hardwareSpecs || { cpu: '', ramGb: 0, gpu: '', storageGb: 0 },
    locationTag: data.locationTag || '',
    hourlyRateZar: data.hourlyRateZar!,
    minBookingHours: data.minBookingHours!,
    maxBookingHours: data.maxBookingHours!,
    billingPolicy: data.billingPolicy || 'per_hour',
    sessionRecordingEnabled: data.sessionRecordingEnabled ?? false,
    lastHeartbeatAt: data.lastHeartbeatAt ?? null,
    status: 'active',
    averageRating: null,
    totalReviews: 0,
    totalCompletedSessions: 0,
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
  };

  return { listing };
}

// ─── Update Listing ───────────────────────────────────────────────────────────

/**
 * Updates an existing listing owned by the given owner.
 * Re-validates the merged data before applying the update.
 */
export function updateListing(
  ownerId: string,
  listingId: string,
  data: Partial<ResourceListing>,
  existingListings: ResourceListing[]
): { listing: ResourceListing } | { error: MarketplaceApiError } {
  const listing = existingListings.find((l) => l.id === listingId);

  if (!listing) {
    return {
      error: {
        code: 'LISTING_NOT_FOUND',
        message: 'Listing not found.',
        field: 'listingId',
      },
    };
  }

  if (listing.ownerId !== ownerId) {
    return {
      error: {
        code: 'UNAUTHORIZED',
        message: 'You are not the owner of this listing.',
      },
    };
  }

  // Merge existing listing data with updates for validation
  const merged: Partial<ResourceListing> = {
    ...listing,
    ...data,
  };

  const validation = validateListingData(merged);

  if (!validation.valid) {
    return {
      error: {
        code: 'LISTING_VALIDATION_FAILED',
        message: 'Listing validation failed. Please correct the issues and try again.',
        details: { errors: validation.errors },
      },
    };
  }

  const updatedListing: ResourceListing = {
    ...listing,
    ...data,
    id: listing.id, // Prevent id override
    ownerId: listing.ownerId, // Prevent owner override
    updatedAt: new Date().toISOString(),
  };

  return { listing: updatedListing };
}

// ─── Pause Listing ────────────────────────────────────────────────────────────

/**
 * Pauses a listing without affecting confirmed bookings.
 * Sets status to 'paused'. Does NOT alter any associated BookingRecord statuses.
 */
export function pauseListing(
  ownerId: string,
  listingId: string,
  listings: ResourceListing[],
  bookings: BookingRecord[]
): { listing: ResourceListing } | { error: MarketplaceApiError } {
  const listing = listings.find((l) => l.id === listingId);

  if (!listing) {
    return {
      error: {
        code: 'LISTING_NOT_FOUND',
        message: 'Listing not found.',
        field: 'listingId',
      },
    };
  }

  if (listing.ownerId !== ownerId) {
    return {
      error: {
        code: 'UNAUTHORIZED',
        message: 'You are not the owner of this listing.',
      },
    };
  }

  if (listing.status === 'paused') {
    return {
      error: {
        code: 'LISTING_VALIDATION_FAILED',
        message: 'Listing is already paused.',
      },
    };
  }

  if (listing.status === 'removed') {
    return {
      error: {
        code: 'LISTING_VALIDATION_FAILED',
        message: 'Cannot pause a removed listing.',
      },
    };
  }

  // Pause the listing — do NOT modify any booking records
  const pausedListing: ResourceListing = {
    ...listing,
    status: 'paused',
    updatedAt: new Date().toISOString(),
  };

  return { listing: pausedListing };
}

// ─── Activate Listing ─────────────────────────────────────────────────────────

/**
 * Reactivates a paused listing, setting status to 'active'.
 */
export function activateListing(
  ownerId: string,
  listingId: string,
  listings: ResourceListing[]
): { listing: ResourceListing } | { error: MarketplaceApiError } {
  const listing = listings.find((l) => l.id === listingId);

  if (!listing) {
    return {
      error: {
        code: 'LISTING_NOT_FOUND',
        message: 'Listing not found.',
        field: 'listingId',
      },
    };
  }

  if (listing.ownerId !== ownerId) {
    return {
      error: {
        code: 'UNAUTHORIZED',
        message: 'You are not the owner of this listing.',
      },
    };
  }

  if (listing.status === 'active') {
    return {
      error: {
        code: 'LISTING_VALIDATION_FAILED',
        message: 'Listing is already active.',
      },
    };
  }

  if (listing.status === 'removed') {
    return {
      error: {
        code: 'LISTING_VALIDATION_FAILED',
        message: 'Cannot activate a removed listing.',
      },
    };
  }

  const activatedListing: ResourceListing = {
    ...listing,
    status: 'active',
    updatedAt: new Date().toISOString(),
  };

  return { listing: activatedListing };
}

// ─── Get Listing Analytics ────────────────────────────────────────────────────

/**
 * Computes analytics for a listing:
 * - totalViews: provided view count
 * - totalBookings: count of bookings for this listing
 * - bookingConversionRate: totalBookings / totalViews (0 if no views)
 * - averageRating: mean of review ratings, null if no reviews
 * - monthlyRevenueZar: sum of estimatedCostZar for completed bookings
 *   in the current calendar month
 */
export function getListingAnalytics(
  listingId: string,
  bookings: BookingRecord[],
  reviews: ReviewRecord[],
  viewCount: number
): ListingAnalytics {
  const listingBookings = bookings.filter((b) => b.listingId === listingId);
  const listingReviews = reviews.filter((r) => r.listingId === listingId);

  const totalBookings = listingBookings.length;
  const totalViews = viewCount;

  // Conversion rate: bookings / views, clamped to 0-1
  const bookingConversionRate =
    totalViews > 0 ? Math.min(totalBookings / totalViews, 1) : 0;

  // Average rating from reviews
  let averageRating: number | null = null;
  if (listingReviews.length > 0) {
    const totalRating = listingReviews.reduce((sum, r) => sum + r.rating, 0);
    averageRating =
      Math.round((totalRating / listingReviews.length) * 10) / 10;
  }

  // Monthly revenue: completed bookings in current calendar month
  const now = new Date();
  const currentMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).getTime();
  const currentMonthEnd = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    1
  ).getTime();

  const monthlyRevenueZar = listingBookings
    .filter((b) => {
      if (b.status !== 'completed') return false;
      const completedAt = b.completedAt
        ? new Date(b.completedAt).getTime()
        : 0;
      return completedAt >= currentMonthStart && completedAt < currentMonthEnd;
    })
    .reduce((sum, b) => sum + b.estimatedCostZar, 0);

  return {
    totalViews,
    totalBookings,
    bookingConversionRate,
    averageRating,
    monthlyRevenueZar,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generates a simple unique listing ID */
function generateListingId(): string {
  return `lst_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
