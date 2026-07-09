// ─── Remote Desktop Marketplace — Favourites Service ─────────────────────────
//
// Pure business logic for managing user favourites (add, remove, list, check).
// All functions operate on data passed as parameters.
// No Firebase imports — persistence is wired at the API routes layer.

import type {
  FavouriteEntry,
  ResourceListing,
  MarketplaceApiError,
} from '../types';

import { MAX_FAVOURITES } from '../constants';

// ─── Add Favourite ────────────────────────────────────────────────────────────

/**
 * Adds a listing to the user's favourites.
 *
 * Constraints:
 * - Maximum 50 favourites per user (rejects with FAVOURITE_LIMIT_REACHED)
 * - Prevents duplicate additions (same listingId already in favourites)
 * - Stores a denormalized snapshot: listingName, softwareCategory (primary),
 *   hourlyRateZar, averageRating, listingStatus
 */
export function addFavourite(
  userId: string,
  listingId: string,
  listing: ResourceListing,
  existingFavourites: FavouriteEntry[]
): { favourite: FavouriteEntry } | { error: MarketplaceApiError } {
  // Check if already favourited (prevent duplicates)
  const alreadyFavourited = existingFavourites.some(
    (f) => f.listingId === listingId
  );
  if (alreadyFavourited) {
    return {
      error: {
        code: 'FAVOURITE_LIMIT_REACHED',
        message: 'This listing is already in your favourites',
        field: 'listingId',
      },
    };
  }

  // Enforce max 50 favourites per user
  if (existingFavourites.length >= MAX_FAVOURITES) {
    return {
      error: {
        code: 'FAVOURITE_LIMIT_REACHED',
        message: `Maximum of ${MAX_FAVOURITES} favourites reached. Remove a favourite before adding another.`,
        details: { currentCount: existingFavourites.length, max: MAX_FAVOURITES },
      },
    };
  }

  // Create favourite entry with denormalized snapshot
  const favourite: FavouriteEntry = {
    listingId,
    addedAt: new Date().toISOString(),
    listingName: listing.name,
    softwareCategory: listing.softwareCategories[0] ?? '',
    hourlyRateZar: listing.hourlyRateZar,
    averageRating: listing.averageRating,
    listingStatus: listing.status === 'active' ? 'active' : listing.status === 'paused' ? 'paused' : 'removed',
  };

  return { favourite };
}

// ─── Remove Favourite ─────────────────────────────────────────────────────────

/**
 * Removes a listing from the user's favourites.
 * Returns the updated favourites array, or an error if not found.
 */
export function removeFavourite(
  userId: string,
  listingId: string,
  existingFavourites: FavouriteEntry[]
): { favourites: FavouriteEntry[] } | { error: MarketplaceApiError } {
  const index = existingFavourites.findIndex((f) => f.listingId === listingId);

  if (index === -1) {
    return {
      error: {
        code: 'LISTING_NOT_FOUND',
        message: 'Listing not found in favourites',
        field: 'listingId',
      },
    };
  }

  const updated = existingFavourites.filter((f) => f.listingId !== listingId);
  return { favourites: updated };
}

// ─── Get Favourites ───────────────────────────────────────────────────────────

/**
 * Returns the user's favourites sorted by addedAt descending (most recently added first).
 * Updates each favourite's listingStatus against current listing data:
 * - If listing exists and is active → 'active'
 * - If listing exists and is paused → 'paused'
 * - If listing no longer exists in the listings array → 'removed'
 */
export function getFavourites(
  existingFavourites: FavouriteEntry[],
  listings: ResourceListing[]
): FavouriteEntry[] {
  // Build a lookup map for current listing data
  const listingMap = new Map<string, ResourceListing>();
  for (const listing of listings) {
    listingMap.set(listing.id, listing);
  }

  // Update listing status and sort by addedAt descending
  const updated = existingFavourites.map((fav): FavouriteEntry => {
    const currentListing = listingMap.get(fav.listingId);

    if (!currentListing) {
      // Listing no longer exists — mark as removed
      return { ...fav, listingStatus: 'removed' };
    }

    // Map listing status to favourite's listingStatus field
    let listingStatus: 'active' | 'paused' | 'removed';
    if (currentListing.status === 'active') {
      listingStatus = 'active';
    } else if (currentListing.status === 'paused') {
      listingStatus = 'paused';
    } else {
      listingStatus = 'removed';
    }

    return { ...fav, listingStatus };
  });

  // Sort by addedAt descending (most recently added first)
  return updated.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

// ─── Is Favourited ────────────────────────────────────────────────────────────

/**
 * Checks if a listing is in the user's favourites.
 */
export function isFavourited(
  listingId: string,
  existingFavourites: FavouriteEntry[]
): boolean {
  return existingFavourites.some((f) => f.listingId === listingId);
}
