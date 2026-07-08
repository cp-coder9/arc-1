// ─── Remote Desktop Marketplace — Review Service ─────────────────────────────
//
// Pure business logic for review submission, owner replies, aggregation,
// and eligibility checks. All functions operate on data passed as parameters.
// No Firebase imports — persistence is wired at the API routes layer.

import type {
  CreateReviewRequest,
  ReviewRecord,
  BookingRecord,
  MarketplaceApiError,
  ReviewTag,
} from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_TAGS: ReviewTag[] = [
  'fast_connection',
  'great_software_setup',
  'responsive_owner',
  'ran_into_issues',
];

const COMMENT_MIN_LENGTH = 10;
const COMMENT_MAX_LENGTH = 500;
const REPLY_MIN_LENGTH = 1;
const REPLY_MAX_LENGTH = 500;
const MAX_TAGS = 3;
const NORMAL_REVIEW_WINDOW_DAYS = 7;
const LATE_REVIEW_MAX_DAYS = 90;
const DEFAULT_PAGE_SIZE = 10;

// ─── Review Request Validation ────────────────────────────────────────────────

/**
 * Validates a review submission request.
 * Checks rating (integer 1-5), comment length (10-500 if provided),
 * and tags (≤3 from predefined set).
 */
export function validateReviewRequest(
  request: CreateReviewRequest
): { valid: boolean; error?: string } {
  // Rating must be an integer 1-5
  if (
    !Number.isInteger(request.rating) ||
    request.rating < 1 ||
    request.rating > 5
  ) {
    return { valid: false, error: 'Rating must be an integer between 1 and 5' };
  }

  // Comment validation (only if provided)
  if (request.comment !== undefined && request.comment !== null) {
    if (request.comment.length < COMMENT_MIN_LENGTH) {
      return {
        valid: false,
        error: `Comment must be at least ${COMMENT_MIN_LENGTH} characters`,
      };
    }
    if (request.comment.length > COMMENT_MAX_LENGTH) {
      return {
        valid: false,
        error: `Comment must not exceed ${COMMENT_MAX_LENGTH} characters`,
      };
    }
  }

  // Tags validation (only if provided)
  if (request.tags !== undefined && request.tags !== null) {
    if (request.tags.length > MAX_TAGS) {
      return {
        valid: false,
        error: `Maximum ${MAX_TAGS} tags allowed`,
      };
    }
    const invalidTag = request.tags.find((tag) => !VALID_TAGS.includes(tag));
    if (invalidTag) {
      return {
        valid: false,
        error: `Invalid tag: ${invalidTag}`,
      };
    }
  }

  return { valid: true };
}

// ─── Review Eligibility ───────────────────────────────────────────────────────

/**
 * Checks if a booking is eligible to receive a review.
 *
 * Conditions:
 * - Booking must have status='completed'
 * - Booking must have a completedAt timestamp
 * - No existing review for the same bookingId
 * - Time window: ≤7 days normal, 8-90 days late, >90 days rejected
 */
export function isReviewEligible(
  booking: BookingRecord,
  existingReviews: ReviewRecord[],
  now: string
): { eligible: boolean; error?: string } {
  // Booking must be completed
  if (booking.status !== 'completed') {
    return { eligible: false, error: 'Booking must be completed before reviewing' };
  }

  // Booking must have completedAt
  if (!booking.completedAt) {
    return { eligible: false, error: 'Booking completion date not recorded' };
  }

  // Check for existing review
  const existingReview = existingReviews.find(
    (r) => r.bookingId === booking.id
  );
  if (existingReview) {
    return { eligible: false, error: 'A review already exists for this booking' };
  }

  // Time window check
  const completedDate = new Date(booking.completedAt);
  const nowDate = new Date(now);
  const daysSinceCompletion = Math.floor(
    (nowDate.getTime() - completedDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceCompletion > LATE_REVIEW_MAX_DAYS) {
    return { eligible: false, error: 'Review window has closed (90 days exceeded)' };
  }

  return { eligible: true };
}

// ─── Submit Review ────────────────────────────────────────────────────────────

/**
 * Validates and creates a review for a completed booking.
 *
 * Validation flow:
 * 1. Validate request fields (rating, comment, tags)
 * 2. Check booking is completed
 * 3. Check no duplicate review exists
 * 4. Check time window (≤7 days: normal, 8-90 days: late, >90: rejected)
 * 5. Create ReviewRecord with isVerified=true
 */
export function submitReview(
  request: CreateReviewRequest,
  consumerId: string,
  booking: BookingRecord,
  existingReviews: ReviewRecord[],
  consumerDisplayName: string
): { review: ReviewRecord } | { error: MarketplaceApiError } {
  // Validate request fields
  const validation = validateReviewRequest(request);
  if (!validation.valid) {
    return {
      error: {
        code: 'REVIEW_INELIGIBLE',
        message: validation.error!,
        field: getValidationErrorField(request),
      },
    };
  }

  // Check booking status
  if (booking.status !== 'completed') {
    return {
      error: {
        code: 'REVIEW_INELIGIBLE',
        message: 'Booking must be completed before submitting a review',
      },
    };
  }

  // Check completedAt exists
  if (!booking.completedAt) {
    return {
      error: {
        code: 'REVIEW_INELIGIBLE',
        message: 'Booking completion date not recorded',
      },
    };
  }

  // Check for duplicate review
  const duplicateReview = existingReviews.find(
    (r) => r.bookingId === booking.id
  );
  if (duplicateReview) {
    return {
      error: {
        code: 'REVIEW_DUPLICATE',
        message: 'A review already exists for this booking',
      },
    };
  }

  // Time window calculation
  const completedDate = new Date(booking.completedAt);
  const nowDate = new Date();
  const daysSinceCompletion = Math.floor(
    (nowDate.getTime() - completedDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceCompletion > LATE_REVIEW_MAX_DAYS) {
    return {
      error: {
        code: 'REVIEW_WINDOW_CLOSED',
        message: 'Review window has closed. Reviews must be submitted within 90 days of session completion.',
        details: { daysSinceCompletion, maxDays: LATE_REVIEW_MAX_DAYS },
      },
    };
  }

  const isLateReview = daysSinceCompletion > NORMAL_REVIEW_WINDOW_DAYS;

  // Create review record
  const review: ReviewRecord = {
    id: generateId(),
    bookingId: booking.id,
    listingId: booking.listingId,
    ownerId: booking.ownerId,
    consumerId,
    consumerDisplayName,
    rating: request.rating,
    comment: request.comment,
    tags: request.tags ?? [],
    isLateReview,
    isVerified: true,
    createdAt: new Date().toISOString(),
  };

  return { review };
}

// ─── Owner Reply ──────────────────────────────────────────────────────────────

/**
 * Submits an owner reply to a review.
 *
 * Constraints:
 * - Review must exist and belong to the owner (review.ownerId === ownerId)
 * - Review must not already have an ownerReply
 * - replyText must be 1-500 characters
 * - Once set, cannot be changed (immutability enforced by rejecting if exists)
 */
export function submitOwnerReply(
  reviewId: string,
  ownerId: string,
  replyText: string,
  reviews: ReviewRecord[]
): { review: ReviewRecord } | { error: MarketplaceApiError } {
  // Find the review
  const review = reviews.find((r) => r.id === reviewId);
  if (!review) {
    return {
      error: {
        code: 'REVIEW_INELIGIBLE',
        message: 'Review not found',
      },
    };
  }

  // Verify ownership
  if (review.ownerId !== ownerId) {
    return {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Only the listing owner can reply to this review',
      },
    };
  }

  // Check for existing reply (immutability)
  if (review.ownerReply !== undefined && review.ownerReply !== null) {
    return {
      error: {
        code: 'REVIEW_INELIGIBLE',
        message: 'A reply already exists for this review. Replies cannot be edited.',
      },
    };
  }

  // Validate reply text length
  const trimmedReply = replyText;
  if (trimmedReply.length < REPLY_MIN_LENGTH) {
    return {
      error: {
        code: 'REVIEW_INELIGIBLE',
        message: 'Reply text must not be empty',
        field: 'replyText',
      },
    };
  }
  if (trimmedReply.length > REPLY_MAX_LENGTH) {
    return {
      error: {
        code: 'REVIEW_INELIGIBLE',
        message: `Reply text must not exceed ${REPLY_MAX_LENGTH} characters`,
        field: 'replyText',
      },
    };
  }

  // Create updated review with reply
  const updatedReview: ReviewRecord = {
    ...review,
    ownerReply: replyText,
    ownerRepliedAt: new Date().toISOString(),
  };

  return { review: updatedReview };
}

// ─── Get Listing Reviews ──────────────────────────────────────────────────────

/**
 * Returns paginated reviews for a specific listing.
 * Sorted by createdAt descending (newest first).
 */
export function getListingReviews(
  listingId: string,
  reviews: ReviewRecord[],
  page: number = 1,
  pageSize: number = DEFAULT_PAGE_SIZE
): { reviews: ReviewRecord[]; total: number; page: number } {
  // Filter by listingId
  const listingReviews = reviews.filter((r) => r.listingId === listingId);

  // Sort by createdAt descending (newest first)
  const sorted = [...listingReviews].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  // Paginate
  const clampedPage = Math.max(page, 1);
  const clampedPageSize = Math.max(pageSize, 1);
  const start = (clampedPage - 1) * clampedPageSize;
  const paginated = sorted.slice(start, start + clampedPageSize);

  return {
    reviews: paginated,
    total: sorted.length,
    page: clampedPage,
  };
}

// ─── Get Owner Reviews ────────────────────────────────────────────────────────

/**
 * Returns paginated reviews for a specific owner (across all their listings).
 * Sorted by createdAt descending (newest first).
 */
export function getOwnerReviews(
  ownerId: string,
  reviews: ReviewRecord[],
  page: number = 1,
  pageSize: number = DEFAULT_PAGE_SIZE
): { reviews: ReviewRecord[]; total: number; page: number } {
  // Filter by ownerId
  const ownerReviews = reviews.filter((r) => r.ownerId === ownerId);

  // Sort by createdAt descending (newest first)
  const sorted = [...ownerReviews].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  // Paginate
  const clampedPage = Math.max(page, 1);
  const clampedPageSize = Math.max(pageSize, 1);
  const start = (clampedPage - 1) * clampedPageSize;
  const paginated = sorted.slice(start, start + clampedPageSize);

  return {
    reviews: paginated,
    total: sorted.length,
    page: clampedPage,
  };
}

// ─── Aggregate Rating ─────────────────────────────────────────────────────────

/**
 * Recalculates the aggregate rating for a listing.
 * Returns the arithmetic mean of all ratings rounded to 1 decimal place.
 * Returns null if no reviews exist for the listing.
 */
export function recalculateAggregateRating(
  listingId: string,
  reviews: ReviewRecord[]
): number | null {
  const listingReviews = reviews.filter((r) => r.listingId === listingId);

  if (listingReviews.length === 0) {
    return null;
  }

  const sum = listingReviews.reduce((acc, r) => acc + r.rating, 0);
  const avg = sum / listingReviews.length;

  // Round to 1 decimal place
  return Math.round(avg * 10) / 10;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generates a unique ID for a review record.
 */
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Determines which field caused a validation error for error response.
 */
function getValidationErrorField(request: CreateReviewRequest): string | undefined {
  if (
    !Number.isInteger(request.rating) ||
    request.rating < 1 ||
    request.rating > 5
  ) {
    return 'rating';
  }
  if (request.comment !== undefined && request.comment !== null) {
    if (
      request.comment.length < COMMENT_MIN_LENGTH ||
      request.comment.length > COMMENT_MAX_LENGTH
    ) {
      return 'comment';
    }
  }
  if (request.tags !== undefined && request.tags !== null) {
    if (request.tags.length > MAX_TAGS || request.tags.some((t) => !VALID_TAGS.includes(t))) {
      return 'tags';
    }
  }
  return undefined;
}
