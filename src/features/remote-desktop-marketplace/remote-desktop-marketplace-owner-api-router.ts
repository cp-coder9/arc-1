// ─── Remote Desktop Marketplace — Owner & Favourites API Router ──────────────
//
// Handles favourites, owner profile, and listing management endpoints.
// Mounted under /api/remote-desktop-marketplace (merged with main router in task 7.4).
//
// Auth: Uses x-user-id header as placeholder for auth middleware.
// Persistence: Uses placeholder data arrays with TODO comments for Firestore integration.

import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';

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

// ─── Router ───────────────────────────────────────────────────────────────────

const ownerRouter = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the identity verified by the mount-level Firebase auth middleware. */
function getUserId(req: Request): string | null {
  return (req as Request & { authContext?: { uid: string } }).authContext?.uid ?? null;
}

/**
 * Sends a MarketplaceApiError JSON response.
 */
function sendError(res: Response, statusCode: number, error: MarketplaceApiError): void {
  res.status(statusCode).json(error);
}

// ─── Placeholder Data (TODO: Replace with Firestore reads) ────────────────────

// TODO: Replace with Firestore queries against remoteDesktopMarketplace/favourites/{userId}/items
const userFavourites: Map<string, FavouriteEntry[]> = new Map();

// TODO: Replace with Firestore queries against remoteDesktopMarketplace/listings
const listings: ResourceListing[] = [];

// TODO: Replace with Firestore queries against remoteDesktopMarketplace/bookings
const bookings: BookingRecord[] = [];

// TODO: Replace with Firestore queries against remoteDesktopMarketplace/reviews
const reviews: ReviewRecord[] = [];

// TODO: Replace with Firestore queries against remoteDesktopMarketplace/ownerProfiles
const ownerProfiles: Map<string, OwnerProfile> = new Map();

// TODO: Replace with Firestore queries against remoteDesktopMarketplace/analytics
const viewCounts: Map<string, number> = new Map();

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
  try {
    const userId = getUserId(req);
    if (!userId) {
      return sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Provide x-user-id header.',
      });
    }

    // TODO: Read from Firestore remoteDesktopMarketplace/favourites/{userId}/items
    const existingFavourites = userFavourites.get(userId) ?? [];
    const result = getFavourites(existingFavourites, listings);

    return res.status(200).json({ favourites: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return sendError(res, 500, {
      code: 'INTERNAL_ERROR',
      message,
    });
  }
});

/**
 * POST /favourites/:listingId
 * Adds a listing to the user's favourites.
 */
ownerRouter.post('/favourites/:listingId', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Provide x-user-id header.',
      });
    }

    const { listingId } = req.params;

    // TODO: Read listing from Firestore remoteDesktopMarketplace/listings/{listingId}
    const listing = listings.find((l) => l.id === listingId);
    if (!listing) {
      return sendError(res, 404, {
        code: 'LISTING_NOT_FOUND',
        message: 'Listing not found.',
        field: 'listingId',
      });
    }

    // TODO: Read existing favourites from Firestore
    const existingFavourites = userFavourites.get(userId) ?? [];

    const result = addFavourite(userId, listingId, listing, existingFavourites);

    if ('error' in result) {
      return sendError(res, 400, result.error);
    }

    // TODO: Write favourite to Firestore remoteDesktopMarketplace/favourites/{userId}/items/{listingId}
    const updatedFavourites = [...existingFavourites, result.favourite];
    userFavourites.set(userId, updatedFavourites);

    // Audit trail: favourite added
    createAuditEntry('favourite_added', userId, listingId, 'listing', 'default-tenant');

    return res.status(201).json({ favourite: result.favourite });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return sendError(res, 500, {
      code: 'INTERNAL_ERROR',
      message,
    });
  }
});

/**
 * DELETE /favourites/:listingId
 * Removes a listing from the user's favourites.
 */
ownerRouter.delete('/favourites/:listingId', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Provide x-user-id header.',
      });
    }

    const { listingId } = req.params;

    // TODO: Read existing favourites from Firestore
    const existingFavourites = userFavourites.get(userId) ?? [];

    const result = removeFavourite(userId, listingId, existingFavourites);

    if ('error' in result) {
      return sendError(res, 404, result.error);
    }

    // TODO: Delete from Firestore remoteDesktopMarketplace/favourites/{userId}/items/{listingId}
    userFavourites.set(userId, result.favourites);

    return res.status(200).json({ message: 'Favourite removed successfully.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return sendError(res, 500, {
      code: 'INTERNAL_ERROR',
      message,
    });
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
  try {
    const { ownerUid } = req.params;

    // TODO: Read from Firestore remoteDesktopMarketplace/ownerProfiles/{ownerUid}
    const profileData = ownerProfiles.get(ownerUid) ?? null;
    const profile = getOwnerProfile(ownerUid, profileData);

    if (!profile) {
      return sendError(res, 404, {
        code: 'OWNER_NOT_FOUND',
        message: 'Owner profile is unavailable.',
      });
    }

    // Calculate trust indicators from recent activity
    const trustIndicators = calculateTrustIndicators(
      ownerUid,
      bookings,
      reviews,
      new Date().toISOString()
    );

    // Get owner's active listings
    const ownerListings = getOwnerListings(ownerUid, listings);

    return res.status(200).json({
      profile: { ...profile, ...trustIndicators },
      listings: ownerListings,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return sendError(res, 500, {
      code: 'INTERNAL_ERROR',
      message,
    });
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
  try {
    const userId = getUserId(req);
    if (!userId) {
      return sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Provide x-user-id header.',
      });
    }

    // TODO: Read from Firestore remoteDesktopMarketplace/listings where ownerId == userId
    const ownerListings = listings.filter((l) => l.ownerId === userId);

    return res.status(200).json({ listings: ownerListings });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return sendError(res, 500, {
      code: 'INTERNAL_ERROR',
      message,
    });
  }
});

/**
 * POST /owner/me/listings
 * Publishes a new listing for the authenticated owner.
 * Validates listing data against publication requirements.
 */
ownerRouter.post('/owner/me/listings', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Provide x-user-id header.',
      });
    }

    // Validate request body with Zod
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

    // Call service to validate and publish
    const result = publishListing(userId, data as Partial<ResourceListing>, listings);

    if ('error' in result) {
      return sendError(res, 400, result.error);
    }

    // TODO: Write listing to Firestore remoteDesktopMarketplace/listings/{listingId}
    listings.push(result.listing);

    // Audit trail: listing published
    createAuditEntry('listing_published', userId, result.listing.id, 'listing', 'default-tenant');

    return res.status(201).json({ listing: result.listing });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return sendError(res, 500, {
      code: 'INTERNAL_ERROR',
      message,
    });
  }
});

/**
 * PATCH /owner/me/listings/:listingId
 * Updates an existing listing owned by the authenticated user.
 */
ownerRouter.patch('/owner/me/listings/:listingId', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Provide x-user-id header.',
      });
    }

    const { listingId } = req.params;

    // Validate request body with Zod
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

    // Call service to validate and update
    const result = updateListing(userId, listingId, data as Partial<ResourceListing>, listings);

    if ('error' in result) {
      const statusCode = result.error.code === 'LISTING_NOT_FOUND' ? 404
        : result.error.code === 'UNAUTHORIZED' ? 403
        : 400;
      return sendError(res, statusCode, result.error);
    }

    // TODO: Update listing in Firestore remoteDesktopMarketplace/listings/{listingId}
    const idx = listings.findIndex((l) => l.id === listingId);
    if (idx !== -1) {
      listings[idx] = result.listing;
    }

    return res.status(200).json({ listing: result.listing });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return sendError(res, 500, {
      code: 'INTERNAL_ERROR',
      message,
    });
  }
});

/**
 * PATCH /owner/me/listings/:listingId/pause
 * Pauses a listing without affecting confirmed bookings.
 */
ownerRouter.patch('/owner/me/listings/:listingId/pause', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Provide x-user-id header.',
      });
    }

    const { listingId } = req.params;

    // Call service — bookings array passed to verify pause doesn't affect them
    const result = pauseListing(userId, listingId, listings, bookings);

    if ('error' in result) {
      const statusCode = result.error.code === 'LISTING_NOT_FOUND' ? 404
        : result.error.code === 'UNAUTHORIZED' ? 403
        : 400;
      return sendError(res, statusCode, result.error);
    }

    // TODO: Update listing status in Firestore remoteDesktopMarketplace/listings/{listingId}
    const idx = listings.findIndex((l) => l.id === listingId);
    if (idx !== -1) {
      listings[idx] = result.listing;
    }

    // Audit trail: listing paused
    createAuditEntry('listing_paused', userId, listingId, 'listing', 'default-tenant');

    return res.status(200).json({ listing: result.listing });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return sendError(res, 500, {
      code: 'INTERNAL_ERROR',
      message,
    });
  }
});

/**
 * PATCH /owner/me/listings/:listingId/activate
 * Reactivates a paused listing.
 */
ownerRouter.patch('/owner/me/listings/:listingId/activate', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Provide x-user-id header.',
      });
    }

    const { listingId } = req.params;

    const result = activateListing(userId, listingId, listings);

    if ('error' in result) {
      const statusCode = result.error.code === 'LISTING_NOT_FOUND' ? 404
        : result.error.code === 'UNAUTHORIZED' ? 403
        : 400;
      return sendError(res, statusCode, result.error);
    }

    // TODO: Update listing status in Firestore remoteDesktopMarketplace/listings/{listingId}
    const idx = listings.findIndex((l) => l.id === listingId);
    if (idx !== -1) {
      listings[idx] = result.listing;
    }

    // Audit trail: listing activated
    createAuditEntry('listing_activated', userId, listingId, 'listing', 'default-tenant');

    return res.status(200).json({ listing: result.listing });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return sendError(res, 500, {
      code: 'INTERNAL_ERROR',
      message,
    });
  }
});

/**
 * GET /owner/me/listings/:listingId/analytics
 * Returns analytics data for a specific listing owned by the authenticated user.
 */
ownerRouter.get('/owner/me/listings/:listingId/analytics', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return sendError(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Provide x-user-id header.',
      });
    }

    const { listingId } = req.params;

    // Verify listing exists and is owned by the user
    const listing = listings.find((l) => l.id === listingId);
    if (!listing) {
      return sendError(res, 404, {
        code: 'LISTING_NOT_FOUND',
        message: 'Listing not found.',
        field: 'listingId',
      });
    }

    if (listing.ownerId !== userId) {
      return sendError(res, 403, {
        code: 'UNAUTHORIZED',
        message: 'You are not the owner of this listing.',
      });
    }

    // TODO: Read view count from Firestore remoteDesktopMarketplace/analytics/{listingId}
    const viewCount = viewCounts.get(listingId) ?? 0;

    const analytics = getListingAnalytics(listingId, bookings, reviews, viewCount);

    return res.status(200).json({ analytics });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return sendError(res, 500, {
      code: 'INTERNAL_ERROR',
      message,
    });
  }
});

export { ownerRouter };
export default ownerRouter;
