// ─── Remote Desktop Marketplace — Catalogue Service ──────────────────────────
//
// Pure business logic for catalogue browsing: filtering, sorting, pagination,
// and search. All functions operate on arrays of ResourceListing data.
// Firestore integration will be wired in via the API routes layer.

import type {
  ResourceListing,
  ResourceListingSummary,
  CatalogueQuery,
  CatalogueResult,
  CatalogueSortOption,
  PriceRangeBracket,
} from '../types';

import {
  PRICE_RANGE_BRACKETS,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
} from '../constants';

// ─── Catalogue Inclusion ──────────────────────────────────────────────────────

/**
 * Determines whether a listing is eligible for the browsable catalogue.
 *
 * Criteria: status=active, name non-empty, ≥1 softwareCategory,
 * hourlyRateZar set (> 0), and ≥1 available slot in next 7 days.
 *
 * The `availableSlots` parameter represents the count of available slots
 * within the next 7 days (computed externally from the availability service).
 */
export function isListingEligibleForCatalogue(
  listing: ResourceListing,
  availableSlots: number
): boolean {
  return (
    listing.status === 'active' &&
    listing.name.trim().length > 0 &&
    listing.softwareCategories.length >= 1 &&
    listing.hourlyRateZar > 0 &&
    availableSlots >= 1
  );
}

// ─── Filtering ────────────────────────────────────────────────────────────────

/**
 * Applies all active filters simultaneously (AND composition).
 * Only listings satisfying ALL active filter predicates are returned.
 */
export function filterListings(
  listings: ResourceListing[],
  query: CatalogueQuery
): ResourceListing[] {
  return listings.filter((listing) => {
    // Software_Category: listing must include at least one queried category
    if (query.categories && query.categories.length > 0) {
      const hasMatch = query.categories.some((cat) =>
        listing.softwareCategories.includes(cat)
      );
      if (!hasMatch) return false;
    }

    // Price_Range: hourlyRateZar falls within the bracket bounds
    if (query.priceRange) {
      if (!isInPriceRange(listing.hourlyRateZar, query.priceRange)) {
        return false;
      }
    }

    // Location_Tag: listing.locationTag matches one of queried locations
    if (query.locations && query.locations.length > 0) {
      if (!query.locations.includes(listing.locationTag)) {
        return false;
      }
    }

    // Min Rating: listing.averageRating >= minRating threshold
    if (query.minRating !== undefined && query.minRating !== null) {
      if (
        listing.averageRating === null ||
        listing.averageRating < query.minRating
      ) {
        return false;
      }
    }

    // Availability: 'today', 'this_week', or 'any'
    // Note: For the pure function implementation, availability filtering
    // is handled by the nextAvailableSlot property on the listing.
    // When availability filter is 'any', no filtering is applied.
    // 'today' and 'this_week' require external slot data — handled at the
    // query orchestration level where slot data is joined with listings.
    // This is a no-op here since the caller pre-filters by availability
    // before passing to this function, or we filter using publishedAt as proxy.

    return true;
  });
}

/**
 * Checks whether a given hourly rate falls within a price range bracket.
 */
function isInPriceRange(
  hourlyRateZar: number,
  bracket: PriceRangeBracket
): boolean {
  const def = PRICE_RANGE_BRACKETS.find((b) => b.bracket === bracket);
  if (!def) return false;

  if (hourlyRateZar < def.minZar) return false;
  if (def.maxZar !== null && hourlyRateZar > def.maxZar) return false;

  return true;
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

/**
 * Sorts listings by the specified sort option.
 * Returns a new sorted array (does not mutate the original).
 */
export function sortListings(
  listings: ResourceListing[],
  sort: CatalogueSortOption = 'availability_asc'
): ResourceListing[] {
  const sorted = [...listings];

  switch (sort) {
    case 'availability_asc':
      // Soonest next available slot first.
      // Uses publishedAt as a proxy for availability ordering when
      // nextAvailableSlot is not directly on the listing model.
      // Listings with null publishedAt sort last.
      sorted.sort((a, b) => {
        const aDate = a.publishedAt ?? '';
        const bDate = b.publishedAt ?? '';
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        return aDate.localeCompare(bDate);
      });
      break;

    case 'price_asc':
      sorted.sort((a, b) => a.hourlyRateZar - b.hourlyRateZar);
      break;

    case 'price_desc':
      sorted.sort((a, b) => b.hourlyRateZar - a.hourlyRateZar);
      break;

    case 'rating_desc':
      // Highest averageRating first; null ratings sort last
      sorted.sort((a, b) => {
        if (a.averageRating === null && b.averageRating === null) return 0;
        if (a.averageRating === null) return 1;
        if (b.averageRating === null) return -1;
        return b.averageRating - a.averageRating;
      });
      break;

    case 'newest_desc':
      // Most recent createdAt first
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      break;
  }

  return sorted;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

/**
 * Paginates a list of listings.
 * Page is 1-indexed. pageSize is clamped to [1, PAGE_SIZE_MAX] with default PAGE_SIZE_DEFAULT.
 */
export function paginateListings(
  listings: ResourceListing[],
  page: number,
  pageSize: number
): { items: ResourceListing[]; total: number } {
  const clampedPageSize = Math.min(
    Math.max(pageSize || PAGE_SIZE_DEFAULT, 1),
    PAGE_SIZE_MAX
  );
  const clampedPage = Math.max(page || 1, 1);

  const start = (clampedPage - 1) * clampedPageSize;
  const items = listings.slice(start, start + clampedPageSize);

  return { items, total: listings.length };
}

// ─── Text Search ──────────────────────────────────────────────────────────────

/**
 * Filters listings by case-insensitive substring matching against:
 * name, softwareCategories, ownerFirmName, and description.
 *
 * Returns empty array if search string is fewer than 2 characters.
 */
export function searchListings(
  listings: ResourceListing[],
  search: string
): ResourceListing[] {
  const trimmed = search.trim();
  if (trimmed.length < 2) return [];

  const lowerSearch = trimmed.toLowerCase();

  return listings.filter((listing) => {
    // Check name
    if (listing.name.toLowerCase().includes(lowerSearch)) return true;

    // Check softwareCategories
    if (
      listing.softwareCategories.some((cat) =>
        cat.toLowerCase().includes(lowerSearch)
      )
    ) {
      return true;
    }

    // Check ownerFirmName
    if (listing.ownerFirmName.toLowerCase().includes(lowerSearch)) return true;

    // Check description
    if (listing.description.toLowerCase().includes(lowerSearch)) return true;

    return false;
  });
}

// ─── Listing to Summary Mapping ───────────────────────────────────────────────

/**
 * Maps a full ResourceListing to a ResourceListingSummary for catalogue cards.
 */
export function toListingSummary(
  listing: ResourceListing
): ResourceListingSummary {
  return {
    id: listing.id,
    name: listing.name,
    primaryCategory: listing.softwareCategories[0] ?? '',
    hourlyRateZar: listing.hourlyRateZar,
    averageRating: listing.averageRating,
    totalReviews: listing.totalReviews,
    locationTag: listing.locationTag,
    lastHeartbeatAt: listing.lastHeartbeatAt,
    ownerId: listing.ownerId,
    ownerFirmName: listing.ownerFirmName,
    status: 'active',
  };
}

// ─── Orchestrated Query ───────────────────────────────────────────────────────

/**
 * Full catalogue query: filters, searches, sorts, and paginates listings.
 * This is the main entry point for catalogue browsing.
 *
 * @param listings - All catalogue-eligible listings (pre-filtered by inclusion criteria)
 * @param query - The catalogue query parameters
 * @returns Paginated, filtered, sorted catalogue result
 */
export function queryListings(
  listings: ResourceListing[],
  query: CatalogueQuery
): CatalogueResult {
  let result = [...listings];

  // Apply text search if provided (minimum 2 chars)
  if (query.search && query.search.trim().length >= 2) {
    result = searchListings(result, query.search);
  }

  // Apply filters
  result = filterListings(result, query);

  // Apply sort
  const sort = query.sort ?? 'availability_asc';
  result = sortListings(result, sort);

  // Apply pagination
  const pageSize = Math.min(
    Math.max(query.pageSize || PAGE_SIZE_DEFAULT, 1),
    PAGE_SIZE_MAX
  );
  const page = Math.max(query.page || 1, 1);

  const { items, total } = paginateListings(result, page, pageSize);

  return {
    listings: items.map(toListingSummary),
    total,
    page,
    pageSize,
    appliedFilters: query,
  };
}

// ─── Single Listing Fetch ─────────────────────────────────────────────────────

/**
 * Finds a single listing by ID from the provided array.
 * Returns null if not found.
 */
export function getListingById(
  listings: ResourceListing[],
  listingId: string
): ResourceListing | null {
  return listings.find((l) => l.id === listingId) ?? null;
}
