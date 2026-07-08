import { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/apiClient';
import type {
  CatalogueQuery,
  CatalogueResult,
  CatalogueSortOption,
  PriceRangeBracket,
} from '../types';
import { PAGE_SIZE_DEFAULT } from '../constants';

// ─── Cache Configuration ──────────────────────────────────────────────────────

/** Session-level cache TTL in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Debounce delay for search input (300ms) */
const SEARCH_DEBOUNCE_MS = 300;

// ─── Cache Types ──────────────────────────────────────────────────────────────

interface CacheEntry {
  data: CatalogueResult;
  timestamp: number;
}

// ─── Hook Return Interface ────────────────────────────────────────────────────

export interface UseCatalogueReturn {
  result: CatalogueResult | null;
  isLoading: boolean;
  error: string | null;
  query: CatalogueQuery;
  setPage: (page: number) => void;
  setSearch: (search: string) => void;
  setCategories: (categories: string[]) => void;
  setPriceRange: (range: PriceRangeBracket | undefined) => void;
  setLocations: (locations: string[]) => void;
  setMinRating: (rating: number | undefined) => void;
  setAvailability: (availability: 'today' | 'this_week' | 'any' | undefined) => void;
  setSort: (sort: CatalogueSortOption) => void;
  clearFilters: () => void;
  retry: () => void;
}

// ─── Helper: Build cache key from query ───────────────────────────────────────

function buildCacheKey(query: CatalogueQuery): string {
  return JSON.stringify(query);
}

// ─── Helper: Build URL search params from query ───────────────────────────────

function buildSearchParams(query: CatalogueQuery): string {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));

  if (query.categories && query.categories.length > 0) {
    params.set('categories', query.categories.join(','));
  }
  if (query.priceRange) {
    params.set('priceRange', query.priceRange);
  }
  if (query.locations && query.locations.length > 0) {
    params.set('locations', query.locations.join(','));
  }
  if (query.minRating !== undefined) {
    params.set('minRating', String(query.minRating));
  }
  if (query.availability) {
    params.set('availability', query.availability);
  }
  if (query.search) {
    params.set('search', query.search);
  }
  if (query.sort) {
    params.set('sort', query.sort);
  }

  return params.toString();
}

// ─── Default Query ────────────────────────────────────────────────────────────

const DEFAULT_QUERY: CatalogueQuery = {
  page: 1,
  pageSize: PAGE_SIZE_DEFAULT,
  sort: 'availability_asc',
};

// ─── Hook Implementation ──────────────────────────────────────────────────────

export function useCatalogue(): UseCatalogueReturn {
  const [query, setQuery] = useState<CatalogueQuery>(DEFAULT_QUERY);
  const [result, setResult] = useState<CatalogueResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Session-level cache stored in ref (persists across re-renders, not across unmount)
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());

  // Debounce timer ref for search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Abort controller for in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // ─── Fetch Catalogue Data ────────────────────────────────────────────────────

  const fetchCatalogue = useCallback(async (currentQuery: CatalogueQuery) => {
    const cacheKey = buildCacheKey(currentQuery);
    const cached = cacheRef.current.get(cacheKey);

    // Return cached data if within TTL
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      setResult(cached.data);
      setError(null);
      setIsLoading(false);
      return;
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const searchParams = buildSearchParams(currentQuery);
      const response = await apiFetch(
        `/api/remote-desktop-marketplace/listings?${searchParams}`,
        { signal: controller.signal }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.message || `Failed to load catalogue (${response.status})`
        );
      }

      const data: CatalogueResult = await response.json();

      // Store in session cache
      cacheRef.current.set(cacheKey, { data, timestamp: Date.now() });

      setResult(data);
      setError(null);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return; // Silently ignore aborted requests
      }
      setError(
        err instanceof Error ? err.message : 'Failed to load catalogue'
      );
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
      }
    }
  }, []);

  // ─── Effect: Fetch on query change ──────────────────────────────────────────

  useEffect(() => {
    fetchCatalogue(query);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [query, fetchCatalogue]);

  // ─── Filter/Sort Setters ─────────────────────────────────────────────────────

  const setPage = useCallback((page: number) => {
    setQuery((prev) => ({ ...prev, page }));
  }, []);

  const setSearch = useCallback((search: string) => {
    // Clear previous debounce timer
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    // Debounce search updates by 300ms
    searchTimerRef.current = setTimeout(() => {
      setQuery((prev) => ({
        ...prev,
        search: search || undefined,
        page: 1, // Reset to first page on search change
      }));
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  const setCategories = useCallback((categories: string[]) => {
    setQuery((prev) => ({
      ...prev,
      categories: categories.length > 0 ? categories : undefined,
      page: 1,
    }));
  }, []);

  const setPriceRange = useCallback((range: PriceRangeBracket | undefined) => {
    setQuery((prev) => ({ ...prev, priceRange: range, page: 1 }));
  }, []);

  const setLocations = useCallback((locations: string[]) => {
    setQuery((prev) => ({
      ...prev,
      locations: locations.length > 0 ? locations : undefined,
      page: 1,
    }));
  }, []);

  const setMinRating = useCallback((rating: number | undefined) => {
    setQuery((prev) => ({ ...prev, minRating: rating, page: 1 }));
  }, []);

  const setAvailability = useCallback(
    (availability: 'today' | 'this_week' | 'any' | undefined) => {
      setQuery((prev) => ({ ...prev, availability, page: 1 }));
    },
    []
  );

  const setSort = useCallback((sort: CatalogueSortOption) => {
    setQuery((prev) => ({ ...prev, sort, page: 1 }));
  }, []);

  const clearFilters = useCallback(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    setQuery(DEFAULT_QUERY);
  }, []);

  const retry = useCallback(() => {
    // Invalidate cache for current query and re-fetch
    const cacheKey = buildCacheKey(query);
    cacheRef.current.delete(cacheKey);
    fetchCatalogue(query);
  }, [query, fetchCatalogue]);

  // ─── Cleanup debounce timer on unmount ───────────────────────────────────────

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  return {
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
  };
}
