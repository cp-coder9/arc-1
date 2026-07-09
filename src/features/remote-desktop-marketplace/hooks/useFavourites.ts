// ─── Remote Desktop Marketplace — useFavourites Hook ─────────────────────────
//
// Custom React hook for managing user favourites with optimistic updates.
// Calls REST API at /api/remote-desktop-marketplace/favourites/*.

import { useState, useCallback, useEffect, useRef } from 'react';
import type { FavouriteEntry } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UseFavouritesReturn {
  favourites: FavouriteEntry[];
  isLoading: boolean;
  error: string | null;
  isFavourited: (listingId: string) => boolean;
  addFavourite: (listingId: string) => Promise<void>;
  removeFavourite: (listingId: string) => Promise<void>;
  refresh: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = '/api/remote-desktop-marketplace/favourites';

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFavourites(): UseFavouritesReturn {
  const [favourites, setFavourites] = useState<FavouriteEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ─── Fetch favourites list ──────────────────────────────────────────────────

  const fetchFavourites = useCallback(async () => {
    // Abort any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(API_BASE, {
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? `Failed to load favourites (${response.status})`);
      }

      const data: FavouriteEntry[] = await response.json();
      setFavourites(data);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return; // Ignore aborted requests
      }
      const message = err instanceof Error ? err.message : 'Failed to load favourites';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ─── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    fetchFavourites();

    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [fetchFavourites]);

  // ─── Check if listing is favourited ─────────────────────────────────────────

  const isFavourited = useCallback(
    (listingId: string): boolean => {
      return favourites.some((f) => f.listingId === listingId);
    },
    [favourites]
  );

  // ─── Add favourite (optimistic) ────────────────────────────────────────────

  const addFavourite = useCallback(
    async (listingId: string): Promise<void> => {
      // Optimistic update — add a placeholder entry
      const optimisticEntry: FavouriteEntry = {
        listingId,
        addedAt: new Date().toISOString(),
        listingName: '',
        softwareCategory: '',
        hourlyRateZar: 0,
        averageRating: null,
        listingStatus: 'active',
      };

      const previousFavourites = [...favourites];
      setFavourites((prev) => [optimisticEntry, ...prev]);
      setError(null);

      try {
        const response = await fetch(`${API_BASE}/${listingId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.message ?? `Failed to add favourite (${response.status})`);
        }

        // Replace optimistic entry with the real response
        const created: FavouriteEntry = await response.json();
        setFavourites((prev) =>
          prev.map((f) => (f.listingId === listingId ? created : f))
        );
      } catch (err: unknown) {
        // Revert optimistic update on failure
        setFavourites(previousFavourites);
        const message = err instanceof Error ? err.message : 'Failed to add favourite';
        setError(message);
      }
    },
    [favourites]
  );

  // ─── Remove favourite (optimistic) ─────────────────────────────────────────

  const removeFavourite = useCallback(
    async (listingId: string): Promise<void> => {
      // Optimistic update — remove from local state
      const previousFavourites = [...favourites];
      setFavourites((prev) => prev.filter((f) => f.listingId !== listingId));
      setError(null);

      try {
        const response = await fetch(`${API_BASE}/${listingId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.message ?? `Failed to remove favourite (${response.status})`);
        }
      } catch (err: unknown) {
        // Revert optimistic update on failure
        setFavourites(previousFavourites);
        const message = err instanceof Error ? err.message : 'Failed to remove favourite';
        setError(message);
      }
    },
    [favourites]
  );

  // ─── Refresh ────────────────────────────────────────────────────────────────

  const refresh = useCallback(() => {
    fetchFavourites();
  }, [fetchFavourites]);

  return {
    favourites,
    isLoading,
    error,
    isFavourited,
    addFavourite,
    removeFavourite,
    refresh,
  };
}

export default useFavourites;
