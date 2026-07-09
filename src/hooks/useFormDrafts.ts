/**
 * useFormDrafts — Hook for fetching, filtering, and managing the current user's
 * form drafts.
 *
 * Provides:
 * - drafts: FormDraft[] — list of user's drafts, sorted by lastModifiedAt desc
 * - loading: boolean — fetch in progress
 * - error: string | null — fetch error
 * - deleteDraft: (draftId) => Promise<void> — permanently delete a draft
 * - showStale: boolean — toggle to include stale drafts (>180 days)
 * - setShowStale: (show) => void — control stale visibility
 * - refresh: () => Promise<void> — re-fetch drafts
 *
 * Requirements validated: 7.3, 7.4, 7.6, 7.7
 */

import { useState, useEffect, useCallback } from 'react';
import type { FormDraft } from '@/services/forms/formTypes';
import { apiFetch } from '@/lib/apiClient';

// ── Types ────────────────────────────────────────────────────────────────────

export interface UseFormDraftsResult {
  /** User's drafts, sorted by lastModifiedAt descending */
  drafts: FormDraft[];
  /** Whether drafts are currently being loaded */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Delete a draft permanently by its instance ID */
  deleteDraft: (draftId: string) => Promise<void>;
  /** Whether stale drafts (>180 days) are included */
  showStale: boolean;
  /** Toggle visibility of stale drafts */
  setShowStale: (show: boolean) => void;
  /** Re-fetch drafts from the server */
  refresh: () => Promise<void>;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Drafts older than 180 days are considered stale */
const STALE_THRESHOLD_MS = 180 * 24 * 60 * 60 * 1000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function isDraftStale(draft: FormDraft): boolean {
  const lastModified = draft.lastModifiedAt?.toMillis
    ? draft.lastModifiedAt.toMillis()
    : typeof draft.lastModifiedAt === 'object' && '_seconds' in (draft.lastModifiedAt as object)
      ? (draft.lastModifiedAt as { _seconds: number })._seconds * 1000
      : Date.now();

  return Date.now() - lastModified > STALE_THRESHOLD_MS;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useFormDrafts(userId: string): UseFormDraftsResult {
  const [allDrafts, setAllDrafts] = useState<FormDraft[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showStale, setShowStale] = useState<boolean>(false);

  // ── Fetch Drafts ───────────────────────────────────────────────────────────

  const fetchDrafts = useCallback(async () => {
    if (!userId) {
      setAllDrafts([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch('/api/forms/drafts');
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Failed to fetch drafts (HTTP ${response.status})`);
      }

      const data = await response.json();
      const rawDrafts: FormDraft[] = (data.drafts || []).map((d: Record<string, unknown>) => ({
        id: d.id as string,
        instanceId: (d.id as string) || '',
        templateId: (d.templateId as string) || '',
        templateName: (d.templateName as string) || (d.name as string) || 'Untitled Form',
        projectId: (d.projectId as string) || null,
        projectName: (d.projectName as string) || null,
        status: (d.status as string) || 'draft',
        lastModifiedAt: d.updatedAt as FormDraft['lastModifiedAt'],
        createdAt: d.createdAt as FormDraft['createdAt'],
        isStale: false,
      }));

      // Mark stale drafts
      const marked = rawDrafts.map((draft) => ({
        ...draft,
        isStale: isDraftStale(draft),
      }));

      setAllDrafts(marked);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load drafts';
      setError(message);
      setAllDrafts([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // ── Fetch on mount / userId change ─────────────────────────────────────────

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  // ── Delete Draft ───────────────────────────────────────────────────────────

  const deleteDraft = useCallback(
    async (draftId: string): Promise<void> => {
      try {
        const response = await apiFetch(`/api/forms/instances/${draftId}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to delete draft');
        }

        // Optimistically remove from local state
        setAllDrafts((prev) => prev.filter((d) => d.id !== draftId));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete draft';
        setError(message);
        throw err;
      }
    },
    [],
  );

  // ── Filtered Drafts ────────────────────────────────────────────────────────

  const drafts = showStale ? allDrafts : allDrafts.filter((d) => !d.isStale);

  return {
    drafts,
    loading,
    error,
    deleteDraft,
    showStale,
    setShowStale,
    refresh: fetchDrafts,
  };
}

export default useFormDrafts;
