// ─── Remote Desktop Marketplace — API Router ─────────────────────────────────
//
// Express router providing all marketplace REST endpoints.
// Mounted at /api/remote-desktop-marketplace in the main api-router.ts.
//
// Uses placeholder data arrays (TODO: wire Firestore) and extracts user identity
// from `x-user-id` header as a placeholder for real auth middleware.

import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';

import type {
  BookingRecord,
  ResourceListing,
  ReviewRecord,
  FavouriteEntry,
  WeeklySchedule,
  BlockedDate,
  MarketplaceApiError,
  CatalogueQuery,
  CreateBookingRequest,
  CreateReviewRequest,
} from './types';

import {
  queryListings,
  getListingById,
} from './services/catalogueService';

import {
  generateCalendarSlots,
} from './services/availabilityService';

import {
  createBooking,
  confirmBooking,
  declineBooking,
  cancelBooking,
  getConsumerBookings,
  getIncomingBookings,
} from './services/bookingService';

import {
  submitReview,
  getListingReviews,
} from './services/reviewService';

import { createAuditEntry } from './services/integrationService';

// ─── Placeholder Data (TODO: Replace with Firestore queries) ──────────────────

// These arrays serve as in-memory storage for development.
// In production, each endpoint will query Firestore under
// `remoteDesktopMarketplace/` collection paths.

const listings: ResourceListing[] = [];
const bookings: BookingRecord[] = [];
const reviews: ReviewRecord[] = [];
const favourites: Map<string, FavouriteEntry[]> = new Map();
const weeklySchedules: Map<string, WeeklySchedule[]> = new Map();
const blockedDates: Map<string, BlockedDate[]> = new Map();

// ─── Zod Validation Schemas ───────────────────────────────────────────────────

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const catalogueQuerySchema = paginationSchema.extend({
  categories: z.string().optional().transform((v) => v ? v.split(',') : undefined),
  priceRange: z.enum(['0-100', '100-250', '250-500', '500+']).optional(),
  locations: z.string().optional().transform((v) => v ? v.split(',') : undefined),
  minRating: z.coerce.number().min(0).max(5).optional(),
  availability: z.enum(['today', 'this_week', 'any']).optional(),
  search: z.string().min(2).optional(),
  sort: z.enum(['availability_asc', 'price_asc', 'price_desc', 'rating_desc', 'newest_desc']).optional(),
});

const listingIdParamSchema = z.object({
  listingId: z.string().min(1),
});

const bookingIdParamSchema = z.object({
  bookingId: z.string().min(1),
});

const createBookingSchema = z.object({
  listingId: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  intendedSoftware: z.string().min(1),
  projectReference: z.string().optional(),
  messageToOwner: z.string().max(500).optional(),
});

const declineBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});

const createReviewSchema = z.object({
  bookingId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(10).max(500).optional(),
  tags: z.array(
    z.enum(['fast_connection', 'great_software_setup', 'responsive_owner', 'ran_into_issues'])
  ).max(3).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts user ID from request headers.
 * Placeholder for real auth middleware — uses x-user-id header.
 */
function getUserId(req: Request): string | null {
  const userId = req.headers['x-user-id'];
  if (typeof userId === 'string' && userId.length > 0) {
    return userId;
  }
  return null;
}

/**
 * Sends a MarketplaceApiError response.
 */
function sendError(res: Response, statusCode: number, error: MarketplaceApiError): void {
  res.status(statusCode).json(error);
}

/**
 * Sends a 401 unauthorized error.
 */
function sendUnauthorized(res: Response): void {
  sendError(res, 401, {
    code: 'UNAUTHORIZED',
    message: 'Authentication required. Provide x-user-id header.',
  });
}

// ─── Router Setup ─────────────────────────────────────────────────────────────

const marketplaceRouter = express.Router();

// ─── Production Guard ─────────────────────────────────────────────────────────
// This feature uses in-memory state and is not production-ready.
// Return 503 in production until Firestore persistence is integrated.
if (process.env.NODE_ENV === 'production') {
  marketplaceRouter.use((_req, res) => res.status(503).json({ 
    error: 'Remote Desktop Marketplace API is not available in production. Persistent storage integration pending.' 
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATALOGUE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /listings — Paginated, filtered, sorted catalogue
marketplaceRouter.get('/listings', (req: Request, res: Response) => {
  const parsed = catalogueQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, 400, {
      code: 'LISTING_VALIDATION_FAILED',
      message: 'Invalid query parameters',
      details: { issues: parsed.error.issues },
    });
  }

  const query: CatalogueQuery = {
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    categories: parsed.data.categories,
    priceRange: parsed.data.priceRange,
    locations: parsed.data.locations,
    minRating: parsed.data.minRating,
    availability: parsed.data.availability,
    search: parsed.data.search,
    sort: parsed.data.sort,
  };

  const result = queryListings(listings, query);
  return res.status(200).json(result);
});

// GET /listings/:listingId — Single listing detail
marketplaceRouter.get('/listings/:listingId', (req: Request, res: Response) => {
  const parsed = listingIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    return sendError(res, 400, {
      code: 'LISTING_VALIDATION_FAILED',
      message: 'Invalid listing ID',
    });
  }

  const listing = getListingById(listings, parsed.data.listingId);
  if (!listing) {
    return sendError(res, 404, {
      code: 'LISTING_NOT_FOUND',
      message: 'Resource listing not found or has been removed.',
    });
  }

  if (listing.status !== 'active') {
    return sendError(res, 404, {
      code: 'LISTING_INACTIVE',
      message: 'This listing is not currently available.',
    });
  }

  return res.status(200).json(listing);
});

// GET /listings/:listingId/availability — 14-day availability slots
marketplaceRouter.get('/listings/:listingId/availability', (req: Request, res: Response) => {
  const parsed = listingIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    return sendError(res, 400, {
      code: 'LISTING_VALIDATION_FAILED',
      message: 'Invalid listing ID',
    });
  }

  const listing = getListingById(listings, parsed.data.listingId);
  if (!listing) {
    return sendError(res, 404, {
      code: 'LISTING_NOT_FOUND',
      message: 'Resource listing not found.',
    });
  }

  const schedules = weeklySchedules.get(parsed.data.listingId) ?? [];
  const blocked = blockedDates.get(parsed.data.listingId) ?? [];
  const listingBookings = bookings.filter(
    (b) => b.listingId === parsed.data.listingId
  );

  const referenceDate = new Date().toISOString().split('T')[0];
  const slots = generateCalendarSlots(
    referenceDate,
    schedules,
    blocked,
    listingBookings
  );

  return res.status(200).json({ listingId: parsed.data.listingId, slots });
});

// GET /listings/:listingId/reviews — Paginated reviews for a listing
marketplaceRouter.get('/listings/:listingId/reviews', (req: Request, res: Response) => {
  const paramsParsed = listingIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    return sendError(res, 400, {
      code: 'LISTING_VALIDATION_FAILED',
      message: 'Invalid listing ID',
    });
  }

  const paginationParsed = paginationSchema.safeParse(req.query);
  const page = paginationParsed.success ? paginationParsed.data.page : 1;
  const pageSize = paginationParsed.success ? paginationParsed.data.pageSize : 10;

  const result = getListingReviews(
    paramsParsed.data.listingId,
    reviews,
    page,
    pageSize
  );

  return res.status(200).json(result);
});

// GET /search — Text search with filters
marketplaceRouter.get('/search', (req: Request, res: Response) => {
  const parsed = catalogueQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, 400, {
      code: 'LISTING_VALIDATION_FAILED',
      message: 'Invalid search parameters',
      details: { issues: parsed.error.issues },
    });
  }

  const query: CatalogueQuery = {
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    categories: parsed.data.categories,
    priceRange: parsed.data.priceRange,
    locations: parsed.data.locations,
    minRating: parsed.data.minRating,
    availability: parsed.data.availability,
    search: parsed.data.search,
    sort: parsed.data.sort,
  };

  const result = queryListings(listings, query);
  return res.status(200).json(result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// BOOKING ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /bookings — Submit booking request
marketplaceRouter.post('/bookings', (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    return sendUnauthorized(res);
  }

  const parsed = createBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, {
      code: 'LISTING_VALIDATION_FAILED',
      message: 'Invalid booking request',
      details: { issues: parsed.error.issues },
    });
  }

  const bookingRequest = parsed.data as CreateBookingRequest;

  // Find the listing
  const listing = getListingById(listings, bookingRequest.listingId);
  if (!listing) {
    return sendError(res, 404, {
      code: 'LISTING_NOT_FOUND',
      message: 'Resource listing not found.',
    });
  }

  if (listing.status !== 'active') {
    return sendError(res, 400, {
      code: 'LISTING_INACTIVE',
      message: 'This listing is not currently available for booking.',
    });
  }

  // Get existing bookings for this listing (for conflict detection)
  const listingBookings = bookings.filter(
    (b) => b.listingId === bookingRequest.listingId
  );

  // TODO: Look up actual consumer verification status from Firestore/auth
  const isConsumerVerified = true;

  const result = createBooking(
    bookingRequest,
    userId,
    listing,
    listingBookings,
    isConsumerVerified
  );

  if ('error' in result) {
    // Map service error codes to HTTP status codes
    const statusCode = mapErrorToStatus(result.error.code);
    return sendError(res, statusCode, result.error);
  }

  // TODO: Persist booking to Firestore
  bookings.push(result.booking);

  // Audit trail: booking requested
  createAuditEntry('booking_requested', userId, result.booking.id, 'booking', 'default-tenant');

  return res.status(201).json(result.booking);
});

// GET /bookings — Consumer's bookings grouped by status
marketplaceRouter.get('/bookings', (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    return sendUnauthorized(res);
  }

  const grouped = getConsumerBookings(userId, bookings);
  return res.status(200).json(grouped);
});

// GET /bookings/incoming — Owner's incoming booking requests
marketplaceRouter.get('/bookings/incoming', (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    return sendUnauthorized(res);
  }

  const incoming = getIncomingBookings(userId, bookings);
  return res.status(200).json(incoming);
});

// PATCH /bookings/:bookingId/confirm — Owner confirms booking
marketplaceRouter.patch('/bookings/:bookingId/confirm', (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    return sendUnauthorized(res);
  }

  const paramsParsed = bookingIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    return sendError(res, 400, {
      code: 'LISTING_VALIDATION_FAILED',
      message: 'Invalid booking ID',
    });
  }

  // Get all bookings for the same listing (for conflict re-validation)
  const booking = bookings.find((b) => b.id === paramsParsed.data.bookingId);
  const existingBookings = booking
    ? bookings.filter((b) => b.listingId === booking.listingId)
    : [];

  const result = confirmBooking(
    paramsParsed.data.bookingId,
    userId,
    bookings,
    existingBookings
  );

  if ('error' in result) {
    const statusCode = mapErrorToStatus(result.error.code);
    return sendError(res, statusCode, result.error);
  }

  // Update in-memory booking
  const index = bookings.findIndex((b) => b.id === paramsParsed.data.bookingId);
  if (index !== -1) {
    bookings[index] = result.booking;
  }

  // Audit trail: booking confirmed
  createAuditEntry('booking_confirmed', userId, result.booking.id, 'booking', 'default-tenant');

  return res.status(200).json(result.booking);
});

// PATCH /bookings/:bookingId/decline — Owner declines booking
marketplaceRouter.patch('/bookings/:bookingId/decline', (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    return sendUnauthorized(res);
  }

  const paramsParsed = bookingIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    return sendError(res, 400, {
      code: 'LISTING_VALIDATION_FAILED',
      message: 'Invalid booking ID',
    });
  }

  // Optional reason in body
  const bodyParsed = declineBookingSchema.safeParse(req.body);
  const reason = bodyParsed.success ? bodyParsed.data.reason : undefined;

  const result = declineBooking(
    paramsParsed.data.bookingId,
    userId,
    bookings,
    reason
  );

  if ('error' in result) {
    const statusCode = mapErrorToStatus(result.error.code);
    return sendError(res, statusCode, result.error);
  }

  // Update in-memory booking
  const index = bookings.findIndex((b) => b.id === paramsParsed.data.bookingId);
  if (index !== -1) {
    bookings[index] = result.booking;
  }

  // Audit trail: booking declined
  createAuditEntry('booking_declined', userId, result.booking.id, 'booking', 'default-tenant');

  return res.status(200).json(result.booking);
});

// PATCH /bookings/:bookingId/cancel — Consumer cancels booking
marketplaceRouter.patch('/bookings/:bookingId/cancel', (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    return sendUnauthorized(res);
  }

  const paramsParsed = bookingIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    return sendError(res, 400, {
      code: 'LISTING_VALIDATION_FAILED',
      message: 'Invalid booking ID',
    });
  }

  const result = cancelBooking(
    paramsParsed.data.bookingId,
    userId,
    bookings
  );

  if ('error' in result) {
    const statusCode = mapErrorToStatus(result.error.code);
    return sendError(res, statusCode, result.error);
  }

  // Update in-memory booking
  const index = bookings.findIndex((b) => b.id === paramsParsed.data.bookingId);
  if (index !== -1) {
    bookings[index] = result.booking;
  }

  // Audit trail: booking cancelled
  createAuditEntry('booking_cancelled', userId, result.booking.id, 'booking', 'default-tenant');

  return res.status(200).json({
    booking: result.booking,
    requiresWarning: result.requiresWarning,
  });
});

// POST /bookings/:bookingId/review — Submit review for a completed booking
marketplaceRouter.post('/bookings/:bookingId/review', (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    return sendUnauthorized(res);
  }

  const paramsParsed = bookingIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    return sendError(res, 400, {
      code: 'LISTING_VALIDATION_FAILED',
      message: 'Invalid booking ID',
    });
  }

  const bodyParsed = createReviewSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return sendError(res, 400, {
      code: 'LISTING_VALIDATION_FAILED',
      message: 'Invalid review submission',
      details: { issues: bodyParsed.error.issues },
    });
  }

  // Find the booking
  const booking = bookings.find((b) => b.id === paramsParsed.data.bookingId);
  if (!booking) {
    return sendError(res, 404, {
      code: 'LISTING_NOT_FOUND',
      message: 'Booking not found.',
    });
  }

  // Verify the consumer owns this booking
  if (booking.consumerId !== userId) {
    return sendError(res, 403, {
      code: 'UNAUTHORIZED',
      message: 'You can only review your own bookings.',
    });
  }

  const reviewRequest: CreateReviewRequest = {
    bookingId: paramsParsed.data.bookingId,
    rating: bodyParsed.data.rating as 1 | 2 | 3 | 4 | 5,
    comment: bodyParsed.data.comment,
    tags: bodyParsed.data.tags,
  };

  // TODO: Look up consumer display name from profile
  const consumerDisplayName = `User ${userId.substring(0, 8)}`;

  const result = submitReview(
    reviewRequest,
    userId,
    booking,
    reviews,
    consumerDisplayName
  );

  if ('error' in result) {
    const statusCode = mapErrorToStatus(result.error.code);
    return sendError(res, statusCode, result.error);
  }

  // TODO: Persist review to Firestore
  reviews.push(result.review);

  // Audit trail: review submitted
  createAuditEntry('review_submitted', userId, result.review.id, 'booking', 'default-tenant');

  // TODO: Recalculate aggregate rating for the listing
  // TODO: Trigger notification to owner about new review

  return res.status(201).json(result.review);
});

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maps MarketplaceErrorCode to the appropriate HTTP status code.
 */
function mapErrorToStatus(code: string): number {
  switch (code) {
    case 'LISTING_NOT_FOUND':
    case 'OWNER_NOT_FOUND':
      return 404;
    case 'LISTING_INACTIVE':
    case 'LISTING_VALIDATION_FAILED':
    case 'BOOKING_DURATION_INVALID':
    case 'BOOKING_CONSUMER_UNVERIFIED':
      return 400;
    case 'UNAUTHORIZED':
      return 403;
    case 'BOOKING_CONFLICT':
    case 'BOOKING_ALREADY_CONFIRMED':
    case 'BOOKING_EXPIRED':
      return 409;
    case 'REVIEW_DUPLICATE':
      return 409;
    case 'REVIEW_INELIGIBLE':
    case 'REVIEW_WINDOW_CLOSED':
      return 400;
    case 'FAVOURITE_LIMIT_REACHED':
      return 400;
    case 'SPINE_WRITE_FAILED':
    case 'INTERNAL_ERROR':
      return 500;
    default:
      return 500;
  }
}

export default marketplaceRouter;
