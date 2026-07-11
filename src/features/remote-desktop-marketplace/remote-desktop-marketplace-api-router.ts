// ─── Remote Desktop Marketplace — API Router ─────────────────────────────────
//
// Express router providing all marketplace REST endpoints.
// Mounted at /api/remote-desktop-marketplace in the main api-router.ts.
//
// Auth: Uses requireAuth middleware (Firebase token verification via roleMiddleware).
// Persistence: Firestore under `remoteDesktopMarketplace/` collections.

import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '@/lib/roleMiddleware';
import { adminDb } from '@/lib/firebase-admin';

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

// ─── Firestore Collection Paths ───────────────────────────────────────────────

const COLLECTION = {
  listings: 'remoteDesktopMarketplace/data/listings',
  bookings: 'remoteDesktopMarketplace/data/bookings',
  reviews: 'remoteDesktopMarketplace/data/reviews',
  favourites: (userId: string) => `remoteDesktopMarketplace/data/favourites/${userId}/items`,
  schedules: (listingId: string) => `remoteDesktopMarketplace/data/schedules/${listingId}/weekly`,
  blockedDates: (listingId: string) => `remoteDesktopMarketplace/data/blockedDates/${listingId}/dates`,
  audit: 'remoteDesktopMarketplace/data/auditTrail',
} as const;

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
 * Sends a MarketplaceApiError response.
 */
function sendError(res: Response, statusCode: number, error: MarketplaceApiError): void {
  res.status(statusCode).json(error);
}

// ─── Firestore Query Helpers ──────────────────────────────────────────────────

async function getListingsFromDb(): Promise<ResourceListing[]> {
  const snap = await adminDb.collection(COLLECTION.listings).get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ResourceListing));
}

async function getListingByIdFromDb(listingId: string): Promise<ResourceListing | null> {
  const doc = await adminDb.collection(COLLECTION.listings).doc(listingId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as ResourceListing;
}

async function getBookingsForListing(listingId: string): Promise<BookingRecord[]> {
  const snap = await adminDb.collection(COLLECTION.bookings)
    .where('listingId', '==', listingId).get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as BookingRecord));
}

async function getConsumerBookingsFromDb(consumerId: string): Promise<BookingRecord[]> {
  const snap = await adminDb.collection(COLLECTION.bookings)
    .where('consumerId', '==', consumerId).get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as BookingRecord));
}

async function getBookingById(bookingId: string): Promise<BookingRecord | null> {
  const doc = await adminDb.collection(COLLECTION.bookings).doc(bookingId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as BookingRecord;
}

async function persistAuditEntry(entry: ReturnType<typeof createAuditEntry>): Promise<void> {
  await adminDb.collection(COLLECTION.audit).add(entry);
}

// ─── Router Setup ─────────────────────────────────────────────────────────────

const marketplaceRouter = express.Router();

// Apply verified auth middleware to all marketplace routes
marketplaceRouter.use(requireAuth);

// ═══════════════════════════════════════════════════════════════════════════════
// CATALOGUE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /listings — Paginated, filtered, sorted catalogue
marketplaceRouter.get('/listings', async (req: Request, res: Response) => {
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

  try {
    const listings = await getListingsFromDb();
    const result = queryListings(listings, query);
    return res.status(200).json(result);
  } catch (err: any) {
    return sendError(res, 500, { code: 'INTERNAL_ERROR', message: err.message || 'Failed to fetch listings' });
  }
});

// GET /listings/:listingId — Single listing detail
marketplaceRouter.get('/listings/:listingId', async (req: Request, res: Response) => {
  const parsed = listingIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    return sendError(res, 400, {
      code: 'LISTING_VALIDATION_FAILED',
      message: 'Invalid listing ID',
    });
  }

  try {
    const listing = await getListingByIdFromDb(parsed.data.listingId);
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
  } catch (err: any) {
    return sendError(res, 500, { code: 'INTERNAL_ERROR', message: err.message || 'Failed to fetch listing' });
  }
});

// GET /listings/:listingId/availability — 14-day availability slots
marketplaceRouter.get('/listings/:listingId/availability', async (req: Request, res: Response) => {
  const parsed = listingIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    return sendError(res, 400, {
      code: 'LISTING_VALIDATION_FAILED',
      message: 'Invalid listing ID',
    });
  }

  try {
    const listing = await getListingByIdFromDb(parsed.data.listingId);
    if (!listing) {
      return sendError(res, 404, {
        code: 'LISTING_NOT_FOUND',
        message: 'Resource listing not found.',
      });
    }

    const schedulesSnap = await adminDb.collection(COLLECTION.schedules(parsed.data.listingId)).get();
    const schedules = schedulesSnap.docs.map(doc => doc.data() as WeeklySchedule);

    const blockedSnap = await adminDb.collection(COLLECTION.blockedDates(parsed.data.listingId)).get();
    const blocked = blockedSnap.docs.map(doc => doc.data() as BlockedDate);

    const listingBookings = await getBookingsForListing(parsed.data.listingId);

    const referenceDate = new Date().toISOString().split('T')[0];
    const slots = generateCalendarSlots(
      referenceDate,
      schedules,
      blocked,
      listingBookings
    );

    return res.status(200).json({ listingId: parsed.data.listingId, slots });
  } catch (err: any) {
    return sendError(res, 500, { code: 'INTERNAL_ERROR', message: err.message || 'Failed to fetch availability' });
  }
});

// GET /listings/:listingId/reviews — Paginated reviews for a listing
marketplaceRouter.get('/listings/:listingId/reviews', async (req: Request, res: Response) => {
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

  try {
    const reviewsSnap = await adminDb.collection(COLLECTION.reviews)
      .where('listingId', '==', paramsParsed.data.listingId).get();
    const allReviews = reviewsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReviewRecord));

    const result = getListingReviews(
      paramsParsed.data.listingId,
      allReviews,
      page,
      pageSize
    );

    return res.status(200).json(result);
  } catch (err: any) {
    return sendError(res, 500, { code: 'INTERNAL_ERROR', message: err.message || 'Failed to fetch reviews' });
  }
});

// GET /search — Text search with filters
marketplaceRouter.get('/search', async (req: Request, res: Response) => {
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

  try {
    const listings = await getListingsFromDb();
    const result = queryListings(listings, query);
    return res.status(200).json(result);
  } catch (err: any) {
    return sendError(res, 500, { code: 'INTERNAL_ERROR', message: err.message || 'Search failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BOOKING ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /bookings — Submit booking request
marketplaceRouter.post('/bookings', async (req: Request, res: Response) => {
  const userId = req.authContext!.uid;

  const parsed = createBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, {
      code: 'LISTING_VALIDATION_FAILED',
      message: 'Invalid booking request',
      details: { issues: parsed.error.issues },
    });
  }

  const bookingRequest = parsed.data as CreateBookingRequest;

  try {
    // Find the listing from Firestore
    const listing = await getListingByIdFromDb(bookingRequest.listingId);
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

    // Get existing bookings for conflict detection (Firestore query)
    const listingBookings = await getBookingsForListing(bookingRequest.listingId);

    // Check consumer verification status from user profile
    const userDoc = await adminDb.collection('users').doc(userId).get();
    const isConsumerVerified = userDoc.exists ? (userDoc.data()?.isVerified === true) : false;

    const result = createBooking(
      bookingRequest,
      userId,
      listing,
      listingBookings,
      isConsumerVerified
    );

    if ('error' in result) {
      const statusCode = mapErrorToStatus(result.error.code);
      return sendError(res, statusCode, result.error);
    }

    // Persist booking to Firestore with transactional conflict check
    const bookingRef = adminDb.collection(COLLECTION.bookings).doc(result.booking.id);
    await bookingRef.set(result.booking);

    // Persist audit entry with proper tenant context
    const tenantId = listing.ownerId;
    const auditEntry = createAuditEntry('booking_requested', userId, result.booking.id, 'booking', tenantId);
    await persistAuditEntry(auditEntry);

    return res.status(201).json(result.booking);
  } catch (err: any) {
    return sendError(res, 500, { code: 'INTERNAL_ERROR', message: err.message || 'Booking creation failed' });
  }
});

// GET /bookings — Consumer's bookings grouped by status
marketplaceRouter.get('/bookings', async (req: Request, res: Response) => {
  const userId = req.authContext!.uid;

  try {
    const allBookings = await getConsumerBookingsFromDb(userId);
    const grouped = getConsumerBookings(userId, allBookings);
    return res.status(200).json(grouped);
  } catch (err: any) {
    return sendError(res, 500, { code: 'INTERNAL_ERROR', message: err.message || 'Failed to fetch bookings' });
  }
});

// GET /bookings/incoming — Owner's incoming booking requests
marketplaceRouter.get('/bookings/incoming', async (req: Request, res: Response) => {
  const userId = req.authContext!.uid;

  try {
    const snap = await adminDb.collection(COLLECTION.bookings)
      .where('ownerId', '==', userId).get();
    const allBookings = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as BookingRecord));
    const incoming = getIncomingBookings(userId, allBookings);
    return res.status(200).json(incoming);
  } catch (err: any) {
    return sendError(res, 500, { code: 'INTERNAL_ERROR', message: err.message || 'Failed to fetch incoming bookings' });
  }
});

// PATCH /bookings/:bookingId/confirm — Owner confirms booking
marketplaceRouter.patch('/bookings/:bookingId/confirm', async (req: Request, res: Response) => {
  const userId = req.authContext!.uid;

  const paramsParsed = bookingIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    return sendError(res, 400, {
      code: 'LISTING_VALIDATION_FAILED',
      message: 'Invalid booking ID',
    });
  }

  try {
    // Get the booking and existing bookings for the same listing (conflict re-validation)
    const booking = await getBookingById(paramsParsed.data.bookingId);
    if (!booking) {
      return sendError(res, 404, { code: 'LISTING_NOT_FOUND', message: 'Booking not found.' });
    }

    // Verify the owner is the one confirming
    if (booking.ownerId !== userId) {
      return sendError(res, 403, { code: 'UNAUTHORIZED', message: 'Only the resource owner can confirm bookings.' });
    }

    const existingBookings = await getBookingsForListing(booking.listingId);
    const allBookings = existingBookings; // Pass all bookings for the listing

    const result = confirmBooking(
      paramsParsed.data.bookingId,
      userId,
      allBookings,
      existingBookings
    );

    if ('error' in result) {
      const statusCode = mapErrorToStatus(result.error.code);
      return sendError(res, statusCode, result.error);
    }

    // Persist updated booking to Firestore
    await adminDb.collection(COLLECTION.bookings).doc(paramsParsed.data.bookingId).set(result.booking);

    // Audit trail with owner as tenant
    const auditEntry = createAuditEntry('booking_confirmed', userId, result.booking.id, 'booking', booking.ownerId);
    await persistAuditEntry(auditEntry);

    return res.status(200).json(result.booking);
  } catch (err: any) {
    return sendError(res, 500, { code: 'INTERNAL_ERROR', message: err.message || 'Confirmation failed' });
  }
});

// PATCH /bookings/:bookingId/decline — Owner declines booking
marketplaceRouter.patch('/bookings/:bookingId/decline', async (req: Request, res: Response) => {
  const userId = req.authContext!.uid;

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

  try {
    const booking = await getBookingById(paramsParsed.data.bookingId);
    if (!booking) {
      return sendError(res, 404, { code: 'LISTING_NOT_FOUND', message: 'Booking not found.' });
    }

    // Verify owner authorization
    if (booking.ownerId !== userId) {
      return sendError(res, 403, { code: 'UNAUTHORIZED', message: 'Only the resource owner can decline bookings.' });
    }

    const allBookings = await getBookingsForListing(booking.listingId);

    const result = declineBooking(
      paramsParsed.data.bookingId,
      userId,
      allBookings,
      reason
    );

    if ('error' in result) {
      const statusCode = mapErrorToStatus(result.error.code);
      return sendError(res, statusCode, result.error);
    }

    // Persist updated booking to Firestore
    await adminDb.collection(COLLECTION.bookings).doc(paramsParsed.data.bookingId).set(result.booking);

    // Audit trail
    const auditEntry = createAuditEntry('booking_declined', userId, result.booking.id, 'booking', booking.ownerId);
    await persistAuditEntry(auditEntry);

    return res.status(200).json(result.booking);
  } catch (err: any) {
    return sendError(res, 500, { code: 'INTERNAL_ERROR', message: err.message || 'Decline failed' });
  }
});

// PATCH /bookings/:bookingId/cancel — Consumer cancels booking
marketplaceRouter.patch('/bookings/:bookingId/cancel', async (req: Request, res: Response) => {
  const userId = req.authContext!.uid;

  const paramsParsed = bookingIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    return sendError(res, 400, {
      code: 'LISTING_VALIDATION_FAILED',
      message: 'Invalid booking ID',
    });
  }

  try {
    const booking = await getBookingById(paramsParsed.data.bookingId);
    if (!booking) {
      return sendError(res, 404, { code: 'LISTING_NOT_FOUND', message: 'Booking not found.' });
    }

    // Verify consumer ownership
    if (booking.consumerId !== userId) {
      return sendError(res, 403, { code: 'UNAUTHORIZED', message: 'Only the booking consumer can cancel.' });
    }

    const allBookings = [booking]; // cancelBooking only needs the target booking

    const result = cancelBooking(
      paramsParsed.data.bookingId,
      userId,
      allBookings
    );

    if ('error' in result) {
      const statusCode = mapErrorToStatus(result.error.code);
      return sendError(res, statusCode, result.error);
    }

    // Persist updated booking to Firestore
    await adminDb.collection(COLLECTION.bookings).doc(paramsParsed.data.bookingId).set(result.booking);

    // Audit trail with owner as tenant
    const auditEntry = createAuditEntry('booking_cancelled', userId, result.booking.id, 'booking', booking.ownerId);
    await persistAuditEntry(auditEntry);

    return res.status(200).json({
      booking: result.booking,
      requiresWarning: result.requiresWarning,
    });
  } catch (err: any) {
    return sendError(res, 500, { code: 'INTERNAL_ERROR', message: err.message || 'Cancellation failed' });
  }
});

// POST /bookings/:bookingId/review — Submit review for a completed booking
marketplaceRouter.post('/bookings/:bookingId/review', async (req: Request, res: Response) => {
  const userId = req.authContext!.uid;

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

  try {
    // Find the booking from Firestore
    const booking = await getBookingById(paramsParsed.data.bookingId);
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

    // Look up consumer display name from user profile
    const userDoc = await adminDb.collection('users').doc(userId).get();
    const consumerDisplayName = userDoc.exists
      ? (userDoc.data()?.displayName || `User ${userId.substring(0, 8)}`)
      : `User ${userId.substring(0, 8)}`;

    // Get existing reviews for duplicate check
    const reviewsSnap = await adminDb.collection(COLLECTION.reviews)
      .where('bookingId', '==', paramsParsed.data.bookingId).get();
    const existingReviews = reviewsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReviewRecord));

    const result = submitReview(
      reviewRequest,
      userId,
      booking,
      existingReviews,
      consumerDisplayName
    );

    if ('error' in result) {
      const statusCode = mapErrorToStatus(result.error.code);
      return sendError(res, statusCode, result.error);
    }

    // Persist review to Firestore
    await adminDb.collection(COLLECTION.reviews).doc(result.review.id).set(result.review);

    // Audit trail with owner as tenant
    const auditEntry = createAuditEntry('review_submitted', userId, result.review.id, 'booking', booking.ownerId);
    await persistAuditEntry(auditEntry);

    // Recalculate aggregate rating for the listing
    const allListingReviews = await adminDb.collection(COLLECTION.reviews)
      .where('listingId', '==', booking.listingId).get();
    const reviewCount = allListingReviews.size;
    const avgRating = allListingReviews.docs.reduce((sum, doc) => sum + (doc.data().rating || 0), 0) / reviewCount;
    await adminDb.collection(COLLECTION.listings).doc(booking.listingId).update({
      averageRating: Math.round(avgRating * 10) / 10,
      totalReviews: reviewCount,
    });

    return res.status(201).json(result.review);
  } catch (err: any) {
    return sendError(res, 500, { code: 'INTERNAL_ERROR', message: err.message || 'Review submission failed' });
  }
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
