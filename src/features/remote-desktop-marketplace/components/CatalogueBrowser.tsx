// ─── Remote Desktop Marketplace — CatalogueBrowser ───────────────────────────
//
// The Browse tab content — paginated grid with search, filtering, sorting.
// Uses `useCatalogue` hook for state management.

import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { useCatalogue } from '../hooks/useCatalogue';
import type { CatalogueSortOption, PriceRangeBracket } from '../types';
import {
  SOFTWARE_CATEGORIES,
  PRICE_RANGE_BRACKETS,
  SA_LOCATIONS,
} from '../constants';
import ResourceCard from './ResourceCard';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CatalogueBrowserProps {
  isFavourited: (listingId: string) => boolean;
  onToggleFavourite: (listingId: string) => void;
  onSelectListing: (listingId: string) => void;
}

// ─── Sort Options ─────────────────────────────────────────────────────────────

const SORT_OPTIONS: { value: CatalogueSortOption; label: string }[] = [
  { value: 'availability_asc', label: 'Soonest Available' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'rating_desc', label: 'Highest Rated' },
  { value: 'newest_desc', label: 'Newest Listed' },
];

// ─── Timeout constant ─────────────────────────────────────────────────────────

const LOAD_TIMEOUT_MS = 10_000;

// ─── Component ────────────────────────────────────────────────────────────────

export default function CatalogueBrowser({
  isFavourited,
  onToggleFavourite,
  onSelectListing,
}: CatalogueBrowserProps) {
  const {
    result,
    isLoading,
    error,
    query,
    setPage,
    setSearch,
    setCategories,
    setPriceRange,
    setLocations,
    setMinRating,
    setAvailability,
    setSort,
    clearFilters,
    retry,
  } = useCatalogue();

  // Local search input state (for controlled input before debounce fires)
  const [searchInput, setSearchInput] = useState('');
  const [isTimedOut, setIsTimedOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Timeout logic ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (isLoading) {
      timeoutRef.current = setTimeout(() => {
        setIsTimedOut(true);
      }, LOAD_TIMEOUT_MS);
    } else {
      setIsTimedOut(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isLoading]);

  // ─── Active Filters ─────────────────────────────────────────────────────────

  const activeFilters: { key: string; label: string; onRemove: () => void }[] = [];

  if (query.categories && query.categories.length > 0) {
    query.categories.forEach((cat) => {
      activeFilters.push({
        key: `cat-${cat}`,
        label: cat,
        onRemove: () =>
          setCategories(query.categories!.filter((c) => c !== cat)),
      });
    });
  }

  if (query.priceRange) {
    const bracket = PRICE_RANGE_BRACKETS.find(
      (b) => b.bracket === query.priceRange
    );
    activeFilters.push({
      key: 'price',
      label: bracket?.label ?? query.priceRange,
      onRemove: () => setPriceRange(undefined),
    });
  }

  if (query.locations && query.locations.length > 0) {
    query.locations.forEach((loc) => {
      activeFilters.push({
        key: `loc-${loc}`,
        label: loc,
        onRemove: () =>
          setLocations(query.locations!.filter((l) => l !== loc)),
      });
    });
  }

  if (query.minRating !== undefined) {
    activeFilters.push({
      key: 'rating',
      label: `${query.minRating}+ stars`,
      onRemove: () => setMinRating(undefined),
    });
  }

  if (query.availability) {
    const labels: Record<string, string> = {
      today: 'Available Today',
      this_week: 'This Week',
      any: 'Any Time',
    };
    activeFilters.push({
      key: 'avail',
      label: labels[query.availability] ?? query.availability,
      onRemove: () => setAvailability(undefined),
    });
  }

  // ─── Pagination ─────────────────────────────────────────────────────────────

  const totalPages = result
    ? Math.ceil(result.total / result.pageSize)
    : 0;
  const currentPage = result?.page ?? 1;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Search + Filter Bar */}
      <section className="panel">
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
          }}
        >
          {/* Search input */}
          <div
            style={{
              position: 'relative',
              flex: '1 1 240px',
              minWidth: 200,
            }}
          >
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--muted)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              placeholder="Search resources (min 2 chars)..."
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                if (e.target.value.length >= 2 || e.target.value.length === 0) {
                  setSearch(e.target.value);
                }
              }}
              style={{
                width: '100%',
                height: 36,
                borderRadius: 12,
                border: '1px solid var(--border)',
                paddingLeft: 32,
                paddingRight: 12,
                fontSize: 13,
                color: 'var(--ink)',
                background: 'rgba(255,255,255,.7)',
                outline: 'none',
              }}
              aria-label="Search catalogue"
            />
          </div>

          {/* Category filter */}
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) {
                const current = query.categories ?? [];
                if (!current.includes(e.target.value)) {
                  setCategories([...current, e.target.value]);
                }
              }
            }}
            style={{
              height: 36,
              borderRadius: 12,
              border: '1px solid var(--border)',
              padding: '0 10px',
              fontSize: 12,
              color: 'var(--muted)',
              background: 'rgba(255,255,255,.7)',
              cursor: 'pointer',
            }}
            aria-label="Filter by software category"
          >
            <option value="">Software Category</option>
            {SOFTWARE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* Price range filter */}
          <select
            value={query.priceRange ?? ''}
            onChange={(e) =>
              setPriceRange(
                (e.target.value as PriceRangeBracket) || undefined
              )
            }
            style={{
              height: 36,
              borderRadius: 12,
              border: '1px solid var(--border)',
              padding: '0 10px',
              fontSize: 12,
              color: 'var(--muted)',
              background: 'rgba(255,255,255,.7)',
              cursor: 'pointer',
            }}
            aria-label="Filter by price range"
          >
            <option value="">Price Range</option>
            {PRICE_RANGE_BRACKETS.map((b) => (
              <option key={b.bracket} value={b.bracket}>
                {b.label}
              </option>
            ))}
          </select>

          {/* Location filter */}
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) {
                const current = query.locations ?? [];
                if (!current.includes(e.target.value)) {
                  setLocations([...current, e.target.value]);
                }
              }
            }}
            style={{
              height: 36,
              borderRadius: 12,
              border: '1px solid var(--border)',
              padding: '0 10px',
              fontSize: 12,
              color: 'var(--muted)',
              background: 'rgba(255,255,255,.7)',
              cursor: 'pointer',
            }}
            aria-label="Filter by location"
          >
            <option value="">Location</option>
            {SA_LOCATIONS.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>

          {/* Min rating filter */}
          <select
            value={query.minRating?.toString() ?? ''}
            onChange={(e) =>
              setMinRating(e.target.value ? Number(e.target.value) : undefined)
            }
            style={{
              height: 36,
              borderRadius: 12,
              border: '1px solid var(--border)',
              padding: '0 10px',
              fontSize: 12,
              color: 'var(--muted)',
              background: 'rgba(255,255,255,.7)',
              cursor: 'pointer',
            }}
            aria-label="Filter by minimum rating"
          >
            <option value="">Min Rating</option>
            <option value="3">3+ stars</option>
            <option value="4">4+ stars</option>
            <option value="4.5">4.5+ stars</option>
          </select>

          {/* Availability filter */}
          <select
            value={query.availability ?? ''}
            onChange={(e) =>
              setAvailability(
                (e.target.value as 'today' | 'this_week' | 'any') || undefined
              )
            }
            style={{
              height: 36,
              borderRadius: 12,
              border: '1px solid var(--border)',
              padding: '0 10px',
              fontSize: 12,
              color: 'var(--muted)',
              background: 'rgba(255,255,255,.7)',
              cursor: 'pointer',
            }}
            aria-label="Filter by availability"
          >
            <option value="">Availability</option>
            <option value="today">Available Today</option>
            <option value="this_week">This Week</option>
            <option value="any">Any Time</option>
          </select>

          {/* Sort selector */}
          <select
            value={query.sort ?? 'availability_asc'}
            onChange={(e) =>
              setSort(e.target.value as CatalogueSortOption)
            }
            style={{
              height: 36,
              borderRadius: 12,
              border: '1px solid var(--border)',
              padding: '0 10px',
              fontSize: 12,
              color: 'var(--ink)',
              background: 'rgba(255,255,255,.7)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
            aria-label="Sort catalogue"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {activeFilters.map((filter) => (
            <span
              key={filter.key}
              className="pill"
              style={{
                fontSize: 11,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {filter.label}
              <button
                onClick={filter.onRemove}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  color: 'inherit',
                }}
                aria-label={`Remove ${filter.label} filter`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <button
            className="btn"
            onClick={clearFilters}
            style={{ fontSize: 11, height: 26, padding: '0 10px' }}
          >
            Clear All
          </button>
        </div>
      )}

      {/* Result count */}
      {result && !isLoading && !error && (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Showing {result.listings.length} of {result.total} resources
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && !isTimedOut && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 14,
          }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="panel"
              style={{
                height: 200,
                animation: 'pulse 1.5s infinite',
                background:
                  'linear-gradient(90deg, rgba(255,255,255,.74) 25%, rgba(223,245,242,.3) 50%, rgba(255,255,255,.74) 75%)',
                backgroundSize: '200% 100%',
              }}
              aria-hidden="true"
            />
          ))}
        </div>
      )}

      {/* Timeout state */}
      {isTimedOut && (
        <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--muted)', marginBottom: 12, fontSize: 13 }}>
            Resources could not be loaded. Please try again.
          </p>
          <button className="btn" onClick={retry}>
            Retry
          </button>
        </section>
      )}

      {/* Error state */}
      {error && !isTimedOut && (
        <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--red)', marginBottom: 12, fontSize: 13 }}>
            {error}
          </p>
          <button className="btn" onClick={retry}>
            Retry
          </button>
        </section>
      )}

      {/* Empty state */}
      {!isLoading && !error && result && result.listings.length === 0 && (
        <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
          <p
            style={{
              color: 'var(--muted)',
              marginBottom: 12,
              fontSize: 13,
            }}
          >
            {activeFilters.length > 0
              ? 'No resources match your current filters. Try adjusting your criteria.'
              : 'No resources are currently available.'}
          </p>
          {activeFilters.length > 0 && (
            <button className="btn" onClick={clearFilters}>
              Clear Filters
            </button>
          )}
        </section>
      )}

      {/* Results grid */}
      {!isLoading && !error && result && result.listings.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 14,
          }}
        >
          {result.listings.map((listing) => (
            <ResourceCard
              key={listing.id}
              listing={listing}
              isFavourited={isFavourited(listing.id)}
              onToggleFavourite={onToggleFavourite}
              onSelect={onSelectListing}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && !error && result && totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 8,
            marginTop: 8,
          }}
        >
          <button
            className="btn"
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage <= 1}
            style={{
              fontSize: 12,
              height: 32,
              padding: '0 12px',
              opacity: currentPage <= 1 ? 0.5 : 1,
            }}
          >
            Previous
          </button>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            Page {currentPage} of {totalPages}
          </span>
          <button
            className="btn"
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            style={{
              fontSize: 12,
              height: 32,
              padding: '0 12px',
              opacity: currentPage >= totalPages ? 0.5 : 1,
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
