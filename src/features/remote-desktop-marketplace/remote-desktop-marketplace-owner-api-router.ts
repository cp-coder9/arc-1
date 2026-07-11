// ─── Remote Desktop Marketplace — Owner & Favourites API Router ──────────────
//
// Handles favourites, owner profile, and listing management endpoints.
// Mounted under /api/remote-desktop-marketplace (merged with main router).
//
// Auth: Uses requireAuth middleware (Firebase token verification via roleMiddleware).
// Persistence: Firestore under `remoteDesktopMarketplace/` collections.

import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '@/lib/roleMiddleware';
import { adminDb } from '@/lib/firebase-admin';

import type {
  FavouriteEntry,
  ResourceListing,
  BookingRecord,
  ReviewRecord,
  OwnerProfile,
  MarketplaceApiError,
} from './types';

import {
  addFavourite,
  removeFavourite,
  getFavourites,
} from './services/favouritesService';

import {
  getOwnerProfile,
  calculateTrustIndicators,
  getOwnerListings,
} from './services/ownerProfileService';

import {
  publishListing,
  updateListing,
  pauseListing,
  activateListing,
  getListingAnalytics,
} from './services/listingManagementService';

import { createAuditEntry } from './services/integrationService';

// ─── Firestore Collection Paths ───────────────────────────────────────────────

const COLLECTION = {
  listings: 'remoteDesktopMarketplace/data/listings',
  bookings: 'remoteDesktopMarketplace/data/bookings',
  reviews: 'remoteDesktopMarketplace/data/reviews',
  favourites: (userId: string) => `remoteDesktopMarketplace/data/favourites/${userId}/items`,
  ownerProfiles: 'remoteDesktopMarketplace/data/ownerProfiles',
  analytics: 'remoteDesktopMarketplace/data/analytics',
  audit: 'remoteDesktopMarketplace/data/auditTrail',
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sendError(res: Response, statusCode: number, error: MarketplaceApiError): void {
  res.status(statusCode).json(error);
}

async function persistAuditEntry(entry: ReturnType<typeof createAuditEntry>): Promise<void> {
  await adminDb.collection(COLLECTION.audit).add(entry);
}

// ─── Router ───────────────────────────────────────────────────────────────────

const ownerRouter = express.Router();

// Apply verified auth middleware to all owner/favourites routes
ownerRouter.use(requireAuth);

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const publishListingSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional().default(''),
  softwareCategories: z.array(z.string()).min(1).max(5),
  softwareApplications: z.array(z.object({
    name: z.string(),
    version: z.string(),
  })).optional().default([]),
  hardwareSpecs: z.object({
    cpu: z.string(),
    ramGb: z.number(),
    gpu: z.string(),
    storageGb: z.number(),
  }).optional(),
  locationTag: z.string().optional().default(''),
  hourlyRateZar: z.number().min(50).max(5000),
  minBookingHours: z.number().int().min(1).max(8),
  maxBookingHours: z.number().int().min(1).max(24),
  billingPolicy: z.enum(['per_hour', 'per_session']).optional().default('per_hour'),
  sessionRecordingEnabled: z.boolean().optional().default(false),
  ownerFirmName: z.string().optional().default(''),
  resourceId: z.string().optional().default(''),
});

const updateListingSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).optional(),
  softwareCategories: z.array(z.string()).min(1).max(5).optional(),
  softwareApplications: z.array(z.object({
    name: z.string(),
    version: z.string(),
  })).optional(),
  hardwareSpecs: z.object({
    cpu: z.string(),
    ramGb: z.number(),
    gpu: z.string(),
    storageGb: z.number(),
  }).optional(),
  locationTag: z.string().optional(),
  hourlyRateZar: z.number().min(50).max(5000).optional(),
  minBookingHours: z.number().int().min(1).max(8).optional(),
  maxBookingHours: z.number().int().min(1).max(24).optional(),
  billingPolicy: z.enum(['per_hour', 'per_session']).optional(),
  sessionRecordingEnabled: z.boolean().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// FAVOURITES ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /favourites
 * Lists the authenticated user's favourites, sorted by most recently added.
 */
ownerRouter.get('/favourites', async (req: Request, res: Response) => {
  const userId = req.authContext!.uid;

  try {
    const favsSnap = await adminDb.collection(COLLECTION.favourites(userId)).get();
    const existingFavourites = favsSnap.docs.map(doc => doc.data() as FavouriteEntry);

    const listingsSnap = await adminDb.collection(COLLECTION.listings)
      .where('status', '==', 'active').get();
    const activeListings = listingsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ResourceListing));

    const result = getFavourites(existingFavourites, activeListings);
    return res.status(200).json({ favourites: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return sendError(res, 500, { code: 'INTERNAL_ERROR', message });
  }
});

/**
 * POST /favourites/:listingId
 * Adds a listing to the user's favourites.
 */
ownerRouter.post('/favourites/:listingId', async (req: Request, res: Response) => {
  const userId = req.authContext!.uid;
  const { listingId } = req.params;

  try {
    const listingDoc = await adminDb.collection(COLLECTION.listings).doc(listingId).get();
    if (!listingDoc.exists) {
      return sendError(res, 404, {
        code: 'LISTING_NOT_FOUND',
        message: 'Listing not found.',
        field: 'listingId',
      });
    }
    const listing = { id: listingDoc.id, ...listingDoc.data() } as ResourceListing;

    const favsSnap = await adminDb.collection(COLLECTION.favourites(userId)).get();
    const existingFavourites = favsSnap.docs.map(doc => doc.data() as FavouriteEntry);

    const result = addFavourite(userId, listingId, listing, existingFavourites);

    if ('error' in result) {
      return sendError(res, 400, result.error);
    }

    // Persist favourite to Firestore
    await adminDb.collection(COLLECTION.favourites(userId)).doc(listingId).set(result.favourite);

    // Audit trail with listing owner as tenant
    const auditEntry = createAuditEntry('favourite_added', userId, listingId, 'listing', listing.ownerId);
    await persistAuditEntry(auditEntry);

    return res.status(201).json({ favourite: result.favourite });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return sendError(res, 500, { code: 'INTERNAL_ERROR', message });
  }
});

/**
 * DELETE /favourites/:listingId
 * Removes a listing from the user's favourites.
 */
ownerRouter.delete('/favourites/:listingId', async (req: Request, res: Response) => {
  const userId = req.authContext!.uid;
  const { listingId } = req.params;

  try {
    const favsSnap = await adminDb.collection(COLLECTION.favourites(userId)).get();
    const existingFavourites = favsSnap.docs.map(doc => doc.data() as FavouriteEntry);

    const result = removeFavourite(userId, listingId, existingFavourites);

    if ('error' in result) {
      return sendError(res, 404, result.error);
    }

    // Delete from Firestore
    await adminDb.collection(COLLECTION.favourites(userId)).doc(listingId).delete();

    return res.status(200).json({ message: 'Favourite removed successfully.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return sendError(res, 500, { code: 'INTERNAL_ERROR', message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// OWNER PROFILE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /owner/:ownerUid
 * Returns the public owner profile with trust indicators.
 * Privacy: never exposes email, phone, or address.
 */
ownerRouter.get('/owner/:ownerUid', async (req: Request, res: Response) => {
  const { ownerUid } = req.params;

  try {
    const profileDoc = await adminDb.collection(COLLECTION.ownerProfiles).doc(ownerUid).get();
    const profileData = profileDoc.exists ? (profileDoc.data() as OwnerProfile) : null;
    const profile = getOwnerProfile(ownerUid, profileData);

    if (!profile) {
      return sendError(res, 404, {
        code: 'OWNER_NOT_FOUND',
        message: 'Owner profile is unavailable.',
      });
    }

    // Load bookings and reviews for trust indicators
    const bookingsSnap = await adminDb.collection(COLLECTION.bookings)
      .where('ownerId', '==', ownerUid).get();
    const ownerBookings = bookingsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as BookingRecord));

    const reviewsSnap = await adminDb.collection(COLLECTION.reviews)
      .where('ownerId', '==', ownerUid).get();
    const ownerReviews = reviewsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReviewRecord));

    const trustIndicators = calculateTrustIndicators(
      ownerUid, ownerBookings, ownerReviews, new Date().toISOString()
    );

    // Get owner's active listings
    const listingsSnap = await adminDb.collection(COLLECTION.listings)
      .where('ownerId', '==', ownerUid).where('status', '==', 'active').get();
    const ownerListings = listingsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ResourceListing));

    return res.status(200).json({
      profile: { ...profile, ...trustIndicators },
      listings: ownerListings,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return sendError(res, 500, { code: 'INTERNAL_ERROR', message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// OWNER LISTING MANAGEMENT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /owner/me/listings
 * Returns the authenticated owner's listings (all statuses).
 */
ownerRouter.get('/owner/me/listings', async (req: Request, res: Response) => {
  const userId = req.authContext!.uid;

  try {
    const snap = await adminDb.collection(COLLECTION.listings)
      .where('ownerId', '==', userId).get();
    const ownerListings = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ResourceListing));
    return res.status(200).json({ listings: ownerListings });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return sendError(res, 500, { code: 'INTERNAL_ERROR', message });
  }
});

/**
 * POST /owner/me/listings
 * Publishes a new listing for the authenticated owner.
 */
ownerRouter.post('/owner/me/listings', async (req: Request, res: Response) => {
  const userId = req.authContext!.uid;

  try {
    const parseResult = publishListingSchema.safeParse(req.body);
    if (!parseResult.success) {
      const fieldErrors = parseResult.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`
      );
      return sendError(res, 400, {
        code: 'LISTING_VALIDATION_FAILED',
        message: 'Request body validation failed.',
        details: { errors: fieldErrors },
      });
    }

    const data = parseResult.data;

    // Load existing owner listings for duplicate check
    const existingSnap = await adminDb.collection(COLLECTION.listings)
      .where('ownerId', '==', userId).get();
    const existingListings = existingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ResourceListing));

    const result = publishListing(userId, data as Partial<ResourceListing>, existingListings);

    if ('error' in result) {
      return sendError(res, 400, result.error);
    }

    // Persist listing to Firestore
    await adminDb.collection(COLLECTION.listings).doc(result.listing.id).set(result.listing);

    // Audit trail
    const auditEntry = createAuditEntry('listing_published', userId, result.listing.id, 'listing', userId);
    await persistAuditEntry(auditEntry);

    return res.status(201).json({ listing: result.listing });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return sendError(res, 500, { code: 'INTERNAL_ERROR', message });
  }
});

/**
 * PATCH /owner/me/listings/:listingId
 * Updates an existing listing owned by the authenticated user.
 */
ownerRouter.patch('/owner/me/listings/:listingId', async (req: Request, res: Response) => {
  const userId = req.authContext!.uid;
  const { listingId } = req.params;

  try {
    const parseResult = updateListingSchema.safeParse(req.body);
    if (!parseResult.success) {
      const fieldErrors = parseResult.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`
      );
      return sendError(res, 400, {
        code: 'LISTING_VALIDATION_FAILED',
        message: 'Request body validation failed.',
        details: { errors: fieldErrors },
      });
    }

    const data = parseResult.data;

    // Load existing listings for ownership check
    const existingSnap = await adminDb.collection(COLLECTION.listings)
      .where('ownerId', '==', userId).get();
    const existingListings = existingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ResourceListing));

    const result = updateListing(userId, listingId, data as Partial<ResourceListing>, existingListings);

    if ('error' in result) {
      const statusCode = result.error.code === 'LISTING_NOT_FOUND' ? 404
        : result.error.code === 'UNAUTHORIZED' ? 403 : 400;
      return sendError(res, statusCode, result.error);
    }

    // Update listing in Firestore
    await adminDb.collection(COLLECTION.listings).doc(listingId).set(result.listing);

    return res.status(200).json({ listing: result.listing });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return sendError(res, 500, { code: 'INTERNAL_ERROR', message });
  }
});

/**
 * PATCH /owner/me/listings/:listingId/pause
 * Pauses a listing without affecting confirmed bookings.
 */
ownerRouter.patch('/owner/me/listings/:listingId/pause', async (req: Request, res: Response) => {
  const userId = req.authContext!.uid;
  const { listingId } = req.params;

  try {
    // Load listings and bookings from Firestore
    const listingsSnap = await adminDb.collection(COLLECTION.listings)
      .where('ownerId', '==', userId).get();
    const ownerListings = listingsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ResourceListing));

    const bookingsSnap = await adminDb.collection(COLLECTION.bookings)
      .where('listingId', '==', listingId).get();
    const listingBookings = bookingsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as BookingRecord));

    const result = pauseListing(userId, listingId, ownerListings, listingBookings);

    if ('error' in result) {
      const statusCode = result.error.code === 'LISTING_NOT_FOUND' ? 404
        : result.error.code === 'UNAUTHORIZED' ? 403 : 400;
      return sendError(res, statusCode, result.error);
    }

    // Update listing status in Firestore
    await adminDb.collection(COLLECTION.listings).doc(listingId).set(result.listing);

    // Audit trail
    const auditEntry = createAuditEntry('listing_paused', userId, listingId, 'listing', userId);
    await persistAuditEntry(auditEntry);

    return res.status(200).json({ listing: result.listing });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return sendError(res, 500, { code: 'INTERNAL_ERROR', message });
  }
});

/**
 * PATCH /owner/me/listings/:listingId/activate
 * Reactivates a paused listing.
 */
ownerRouter.patch('/owner/me/listings/:listingId/activate', async (req: Request, res: Response) => {
  const userId = req.authContext!.uid;
  const { listingId } = req.params;

  try {
    const listingsSnap = await adminDb.collection(COLLECTION.listings)
      .where('ownerId', '==', userId).get();
    const ownerListings = listingsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ResourceListing));

    const result = activateListing(userId, listingId, ownerListings);

    if ('error' in result) {
      const statusCode = result.error.code === 'LISTING_NOT_FOUND' ? 404
        : result.error.code === 'UNAUTHORIZED' ? 403 : 400;
      return sendError(res, statusCode, result.error);
    }

    // Update listing status in Firestore
    await adminDb.collection(COLLECTION.listings).doc(listingId).set(result.listing);

    // Audit trail
    const auditEntry = createAuditEntry('listing_activated', userId, listingId, 'listing', userId);
    await persistAuditEntry(auditEntry);

    return res.status(200).json({ listing: result.listing });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return sendError(res, 500, { code: 'INTERNAL_ERROR', message });
  }
});

/**
 * GET /owner/me/listings/:listingId/analytics
 * Returns analytics data for a specific listing owned by the authenticated user.
 */
ownerRouter.get('/owner/me/listings/:listingId/analytics', async (req: Request, res: Response) => {
  const userId = req.authContext!.uid;
  const { listingId } = req.params;

  try {
    // Verify listing exists and is owned by the user
    const listingDoc = await adminDb.collection(COLLECTION.listings).doc(listingId).get();
    if (!listingDoc.exists) {
      return sendError(res, 404, {
        code: 'LISTING_NOT_FOUND',
        message: 'Listing not found.',
        field: 'listingId',
      });
    }
    const listing = { id: listingDoc.id, ...listingDoc.data() } as ResourceListing;

    if (listing.ownerId !== userId) {
      return sendError(res, 403, {
        code: 'UNAUTHORIZED',
        message: 'You are not the owner of this listing.',
      });
    }

    // Read analytics from Firestore
    const analyticsDoc = await adminDb.collection(COLLECTION.analytics).doc(listingId).get();
    const viewCount = analyticsDoc.exists ? (analyticsDoc.data()?.viewCount ?? 0) : 0;

    // Load bookings and reviews for this listing
    const bookingsSnap = await adminDb.collection(COLLECTION.bookings)
      .where('listingId', '==', listingId).get();
    const listingBookings = bookingsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as BookingRecord));

    const reviewsSnap = await adminDb.collection(COLLECTION.reviews)
      .where('listingId', '==', listingId).get();
    const listingReviews = reviewsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReviewRecord));

    const analytics = getListingAnalytics(listingId, listingBookings, listingReviews, viewCount);

    return res.status(200).json({ analytics });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return sendError(res, 500, { code: 'INTERNAL_ERROR', message });
  }
});

export { ownerRouter };
export default ownerRouter;
