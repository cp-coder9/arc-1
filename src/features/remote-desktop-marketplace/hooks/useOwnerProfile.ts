// ─── Remote Desktop Marketplace — useOwnerProfile Hook ───────────────────────
//
// Custom React hook for fetching owner profile data and active listings.
// Calls REST API at /api/remote-desktop-marketplace/owner/:ownerUid.

import { useState, useEffect, useCallback, useRef } from 'react';
import type { OwnerProfile, ResourceListing } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UseOwnerProfileReturn {
  profile: OwnerProfile | null;
  listings: ResourceListing[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = '/api/remote-desktop-marketplace/owner';

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOwnerProfile(ownerUid: string | null): UseOwnerProfileReturn {
  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [listings, setListings] = useState<ResourceListing[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ─── Fetch owner profile + listings ─────────────────────────────────────────

  const fetchProfile = useCallback(async () => {
    if (!ownerUid) {
      setProfile(null);
      setListings([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Abort any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/${ownerUid}`, {
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (response.status === 404) {
          throw new Error('Profile unavailable');
        }
        throw new Error(body?.message ?? `Failed to load profile (${response.status})`);
      }

      const data = await response.json();

      // The API returns { profile, listings }
      setProfile(data.profile ?? data);
      setListings(data.listings ?? []);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return; // Ignore aborted requests
      }
      const message = err instanceof Error ? err.message : 'Failed to load owner profile';
      setError(message);
      setProfile(null);
      setListings([]);
    } finally {
      setIsLoading(false);
    }
  }, [ownerUid]);

  // ─── Fetch on mount and when ownerUid changes ──────────────────────────────

  useEffect(() => {
    fetchProfile();

    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [fetchProfile]);

  // ─── Refresh ────────────────────────────────────────────────────────────────

  const refresh = useCallback(() => {
    fetchProfile();
  }, [fetchProfile]);

  return {
    profile,
    listings,
    isLoading,
    error,
    refresh,
  };
}

export default useOwnerProfile;
